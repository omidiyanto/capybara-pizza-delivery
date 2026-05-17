// Vercel serverless entry point. All /api/* requests are routed here by vercel.json.
// We mount the same Express app used locally (apiApp.js).

import { createApiApp } from '../apiApp.js';

const app = createApiApp();

export default function handler(req, res) {
  return app(req, res);
}
