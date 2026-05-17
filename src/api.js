// Lightweight API client for the backend (Express/Neon).

const STORAGE_KEY = 'capy_user_v1';

async function jsonFetch(url, init) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const Api = {
  // Local persistence (cookie-flavored via localStorage).
  loadUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (!u || !u.id || !u.username) return null;
      return u;
    } catch { return null; }
  },
  saveUser(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  },
  clearUser() {
    localStorage.removeItem(STORAGE_KEY);
  },

  // Server calls.
  checkUsername(name) {
    const q = encodeURIComponent(name || '');
    return jsonFetch(`/api/username/check?name=${q}`);
  },
  register(username) {
    return jsonFetch('/api/users/register', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  },
  heartbeat(userId) {
    return jsonFetch('/api/users/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },
  signout(userId) {
    return jsonFetch('/api/users/signout', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },
  submitScore(userId, cash, deliveries, bestStreak) {
    return jsonFetch('/api/scores', {
      method: 'POST',
      body: JSON.stringify({ userId, cash, deliveries, bestStreak }),
    });
  },
  leaderboard(limit = 10) {
    return jsonFetch(`/api/leaderboard?limit=${limit}`);
  },
  stats() {
    return jsonFetch('/api/stats');
  },
};
