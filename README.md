<div align="center">

# 🔀 finnhub-router

**Smart reverse proxy for Finnhub API with multi-key rotation, rate limiting, caching, and automatic failover.**

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.x-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Tests](https://img.shields.io/badge/Tests-14%20passed-brightgreen?logo=vitest&logoColor=white)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文文档](README_CN.md)

</div>

---

## Why?

Finnhub's free tier limits each API key to **60 requests/minute**. If you're building a real-time dashboard, a trading bot, or any app that needs more throughput, you hit that wall fast.

**finnhub-router** solves this by pooling multiple API keys behind a single endpoint — your app talks to one URL with one token, and the router handles everything else.

## Features

| Feature | Description |
|---------|-------------|
| 🔄 **Multi-Key Rotation** | Round-robin load balancing across up to 50 Finnhub API keys |
| 🚦 **Per-Key Rate Limiting** | Tracks 60 req/min per key, automatically skips exhausted keys |
| 💥 **Auto Failover** | Keys returning 401/403/429 are marked unhealthy, requests retry on next key |
| 🩺 **Health Recovery** | Unhealthy keys auto-recover after 60s cooldown |
| ⚡ **Response Cache** | Same request cached for configurable TTL (default 30s), reducing upstream calls |
| 🔐 **Authentication** | Protect your router with a single token, supports 3 auth methods |
| 🪄 **Drop-in Replacement** | 100% compatible with Finnhub API format — change the URL, keep your code |
| 🌍 **Flexible Deployment** | Cloudflare Workers (edge) or VPS (Node.js + PM2 + NGINX) |

## Architecture

```
                          ┌─────────────────────────────────┐
                          │        finnhub-router            │
                          │                                  │
Client ──→ [Auth Guard] ──→ [Cache Layer] ──→ [Key Pool] ──→ Finnhub API
              │                  ↑               │    │
              │ 401 if           │ HIT           │    ├→ Key #1 (42/60 used)
              │ invalid          │               │    ├→ Key #2 (60/60 skip)
              │                  └── Response ◄──┘    ├→ Key #3 (0/60 ✓)
              │                                       └→ ...Key #50
```

## Quick Start

### 1. Install

```bash
git clone https://github.com/neosun100/finnhub-router.git
cd finnhub-router
npm install
```

### 2. Configure

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```ini
# Comma-separated Finnhub API keys (up to 50)
FINNHUB_KEYS=key1,key2,key3,...

# Cache TTL in seconds
CACHE_TTL=30

# Your router's auth token (clients use this to access the router)
AUTH_TOKEN=fhr_your_secret_token
```

### 3. Run locally

```bash
npm run dev
# → Ready on http://localhost:8787
```

### 4. Test

```bash
curl -H "X-Finnhub-Token: fhr_your_secret_token" \
  "http://localhost:8787/api/v1/quote?symbol=AAPL"
```

## Usage

### Drop-in Replacement

Replace the Finnhub URL in your existing code — **no other changes needed**:

```diff
- const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}`;
- const headers = { 'X-Finnhub-Token': finnhubApiKey };
+ const url = `https://finnhub.aws.xin/api/v1/quote?symbol=${symbol}`;
+ const headers = { 'X-Finnhub-Token': routerToken };
```

### Authentication Methods

All three methods are supported, matching Finnhub's native API:

```bash
# Method 1: X-Finnhub-Token header (recommended, Finnhub-native)
curl -H "X-Finnhub-Token: YOUR_TOKEN" \
  "https://finnhub.aws.xin/api/v1/quote?symbol=AAPL"

# Method 2: token query parameter (Finnhub-native)
curl "https://finnhub.aws.xin/api/v1/quote?symbol=AAPL&token=YOUR_TOKEN"

# Method 3: Authorization Bearer header
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://finnhub.aws.xin/api/v1/quote?symbol=AAPL"
```

### All Finnhub Endpoints Supported

Any `/api/v1/*` path is transparently proxied:

```bash
/api/v1/quote?symbol=AAPL
/api/v1/stock/profile2?symbol=AAPL
/api/v1/stock/candle?symbol=AAPL&resolution=D&from=1672531200&to=1704067200
/api/v1/news?category=general
# ... any Finnhub API endpoint
```

### Admin Endpoints

```bash
# Health check
curl https://finnhub.aws.xin/
# → {"service":"finnhub-router","status":"ok"}

# Key pool stats (keys are masked, only first 6 chars shown)
curl https://finnhub.aws.xin/admin/stats
```

## Deploy to Cloudflare Workers

```bash
wrangler secret put FINNHUB_KEYS
wrangler secret put AUTH_TOKEN
npm run deploy
```

## Deploy to VPS (Node.js + PM2 + NGINX)

```bash
# Install deps
npm install --omit=dev @hono/node-server tsx

# Start with PM2 (daemon + auto-restart)
pm2 start ./node_modules/.bin/tsx --name finnhub-router -- src/server.ts

# Configure env vars in ecosystem.config.cjs:
#   PORT=4007, FINNHUB_KEYS=..., AUTH_TOKEN=..., CACHE_TTL=30

# Enable auto-restart on reboot
pm2 save && pm2 startup
```

NGINX reverse proxy:
```nginx
server {
    listen 443 ssl http2;
    server_name finnhub.your-domain.com;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:4007;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `FINNHUB_KEYS` | Finnhub API keys, comma-separated | — | ✅ |
| `AUTH_TOKEN` | Router authentication token | `""` (no auth) | Recommended |
| `CACHE_TTL` | Response cache TTL in seconds | `30` | No |

## Testing

```bash
npm test          # Run all tests
npm run test:watch # Watch mode
```

| Suite | Tests | Description |
|-------|-------|-------------|
| `key-pool.test.ts` | 8 | Round-robin, rate limiting, health tracking, recovery |
| `cache.test.ts` | 6 | Store/retrieve, TTL expiry, cache key generation |
| **Total** | **14** | All passing ✅ |

## How It Works

### Key Rotation
Round-robin selection. Each key tracks request count per 1-minute window and health status. Exhausted keys (60/60) are skipped until window resets.

### Failover
On 401/403/429: key marked unhealthy → auto-retry on next key → unhealthy key recovers after 60s cooldown.

### Caching
GET requests cached by URL path + query params (excluding `token`). `X-Cache: HIT/MISS` header. In-memory LRU, max 1000 entries.

## Throughput

| Keys | Theoretical Max | With Cache (30s TTL) |
|------|----------------|---------------------|
| 1 | 60 req/min | Higher (cache hits free) |
| 10 | 600 req/min | ~1000+ req/min |
| 50 | 3,000 req/min | ~5000+ req/min |

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) / Node.js
- **Framework**: [Hono](https://hono.dev/)
- **Language**: TypeScript
- **Testing**: [Vitest](https://vitest.dev/)
- **Process Manager**: [PM2](https://pm2.keymetrics.io/) (VPS mode)

## Project Structure

```
finnhub-router/
├── src/
│   ├── index.ts          # Main entry: routes, auth, caching
│   ├── server.ts         # Node.js standalone server (VPS deployment)
│   ├── key-pool.ts       # Key rotation, rate limiting, health tracking
│   ├── cache.ts          # Response cache with TTL
│   └── proxy.ts          # Transparent reverse proxy to Finnhub
├── test/
│   ├── key-pool.test.ts
│   └── cache.test.ts
├── .dev.vars.example     # Config template (no secrets)
├── wrangler.toml         # Cloudflare Workers config
└── package.json
```

## Related

- **[finnhub-register](https://github.com/neosun100/finnhub-register)** — Batch registration tool for Finnhub accounts with automated browser + reCAPTCHA bypass.

## License

MIT
