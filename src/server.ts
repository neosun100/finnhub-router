// Node.js standalone server entry point (for VPS deployment with PM2)
import { serve } from '@hono/node-server';
import app from './index.js';

const port = parseInt(process.env.PORT || '4007', 10);
serve({ fetch: app.fetch, port }, () => {
  console.log(`🚀 finnhub-router running on http://127.0.0.1:${port}`);
});
