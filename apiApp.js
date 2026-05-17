// Shared API: builds an Express app with all /api routes.
// Used by both the local Node server (server.js) and Vercel serverless (api/index.js).

import express from 'express';
import { neon } from '@neondatabase/serverless';

const ACTIVE_WINDOW_SECONDS = 45;
const USERNAME_RE = /^[A-Za-z0-9_.\- ]{2,16}$/;

function normalizeName(name) {
  return (name || '').trim();
}
function validateName(name) {
  if (!name) return 'Username is required';
  if (name.length < 2) return 'Username must be at least 2 characters';
  if (name.length > 16) return 'Username max 16 characters';
  if (!USERNAME_RE.test(name)) return 'Use letters, numbers, spaces, _ . - only';
  return null;
}

// Idempotent migration. Safe to run on every cold start.
export async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      username_lower TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      retired BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      cash INTEGER NOT NULL,
      deliveries INTEGER NOT NULL,
      best_streak INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE scores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`
    DELETE FROM scores s USING scores s2
    WHERE s.user_id = s2.user_id
      AND (s.created_at < s2.created_at
        OR (s.created_at = s2.created_at AND s.id < s2.id))
  `;
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'scores_user_id_unique'
      ) THEN
        ALTER TABLE scores ADD CONSTRAINT scores_user_id_unique UNIQUE (user_id);
      END IF;
    END $$;
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_scores_cash ON scores (cash DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen) WHERE retired = FALSE`;
}

export function createApiApp() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }
  const sql = neon(DATABASE_URL);

  // Run migration once per process. Reuse the same promise across concurrent
  // invocations on a warm Vercel function so we never run it twice in parallel.
  let schemaReady = null;
  const ensureOnce = () => {
    if (!schemaReady) {
      schemaReady = ensureSchema(sql).catch((e) => {
        // Reset so a follow-up request can retry, but log the failure.
        console.error('[db] ensureSchema failed:', e);
        schemaReady = null;
        throw e;
      });
    }
    return schemaReady;
  };

  const app = express();
  app.use(express.json({ limit: '32kb' }));

  // Run migration before any /api request. Cheap on warm starts (already resolved promise).
  app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    try {
      await ensureOnce();
      next();
    } catch (e) {
      res.status(500).json({ error: 'Database not ready' });
    }
  });

  // Health check.
  app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

  app.get('/api/username/check', async (req, res) => {
    const name = normalizeName(req.query.name);
    const err = validateName(name);
    if (err) return res.json({ available: false, reason: err });
    try {
      const rows = await sql`
        SELECT 1 FROM users WHERE username_lower = ${name.toLowerCase()} LIMIT 1
      `;
      if (rows.length > 0) return res.json({ available: false, reason: 'Username already taken' });
      res.json({ available: true });
    } catch (e) {
      console.error('check error', e);
      res.status(500).json({ available: false, reason: 'Server error' });
    }
  });

  app.post('/api/users/register', async (req, res) => {
    const name = normalizeName(req.body?.username);
    const err = validateName(name);
    if (err) return res.status(400).json({ error: err });
    try {
      const lower = name.toLowerCase();
      const existing = await sql`SELECT id, retired FROM users WHERE username_lower = ${lower} LIMIT 1`;
      if (existing.length > 0) {
        const reason = existing[0].retired
          ? 'This name was retired and cannot be used again'
          : 'Username already taken';
        return res.status(409).json({ error: reason });
      }
      const rows = await sql`
        INSERT INTO users (username, username_lower) VALUES (${name}, ${lower})
        RETURNING id, username, created_at
      `;
      res.json({ user: rows[0] });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Username already taken' });
      console.error('register error', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/users/heartbeat', async (req, res) => {
    const id = Number(req.body?.userId);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'userId required' });
    try {
      const rows = await sql`
        UPDATE users SET last_seen = NOW()
        WHERE id = ${id} AND retired = FALSE
        RETURNING id
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'User not found or retired' });
      res.json({ ok: true });
    } catch (e) {
      console.error('heartbeat error', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/users/signout', async (req, res) => {
    const id = Number(req.body?.userId);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'userId required' });
    try {
      await sql`UPDATE users SET retired = TRUE WHERE id = ${id}`;
      res.json({ ok: true });
    } catch (e) {
      console.error('signout error', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/scores', async (req, res) => {
    const userId = Number(req.body?.userId);
    const cash = Math.max(0, Math.floor(Number(req.body?.cash) || 0));
    const deliveries = Math.max(0, Math.floor(Number(req.body?.deliveries) || 0));
    const bestStreak = Math.max(0, Math.floor(Number(req.body?.bestStreak) || 0));
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'userId required' });
    try {
      const u = await sql`SELECT username FROM users WHERE id = ${userId} LIMIT 1`;
      if (u.length === 0) return res.status(404).json({ error: 'User not found' });
      await sql`
        INSERT INTO scores (user_id, username, cash, deliveries, best_streak, updated_at)
        VALUES (${userId}, ${u[0].username}, ${cash}, ${deliveries}, ${bestStreak}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          username = EXCLUDED.username,
          cash = GREATEST(scores.cash, EXCLUDED.cash),
          deliveries = GREATEST(scores.deliveries, EXCLUDED.deliveries),
          best_streak = GREATEST(scores.best_streak, EXCLUDED.best_streak),
          updated_at = NOW()
      `;
      res.json({ ok: true });
    } catch (e) {
      console.error('score error', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/leaderboard', async (req, res) => {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
    try {
      const rows = await sql`
        SELECT username,
               cash AS best_cash,
               deliveries AS best_deliveries,
               best_streak
        FROM scores
        ORDER BY cash DESC, updated_at DESC
        LIMIT ${limit}
      `;
      res.json({ leaderboard: rows });
    } catch (e) {
      console.error('lb error', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const total = await sql`SELECT COUNT(*)::int AS n FROM users`;
      const active = await sql`
        SELECT COUNT(*)::int AS n FROM users
        WHERE retired = FALSE AND last_seen > NOW() - make_interval(secs => ${ACTIVE_WINDOW_SECONDS})
      `;
      res.json({
        total_registered: total[0].n,
        active_users: active[0].n,
      });
    } catch (e) {
      console.error('stats error', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return app;
}
