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

## Deploy to VPS (Node.js + PM2 + NGINX)

```bash
# On your server
npm install --omit=dev @hono/node-server tsx

# Create PM2 ecosystem config with env vars
pm2 start ./node_modules/.bin/tsx --name finnhub-router -- src/server.ts

# Set environment variables in ecosystem.config.cjs:
#   PORT=4007
#   FINNHUB_KEYS=key1,key2,...
#   AUTH_TOKEN=fhr_your_token
#   CACHE_TTL=30

# Enable auto-restart on reboot
pm2 save && pm2 startup
```

NGINX reverse proxy config:
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

## API Endpoint Test Results (42 tested)

*Tested on 2026-03-15 via `finnhub.aws.xin` with free-tier API keys*

### Free Endpoints (23/23 ✅)

| Endpoint | Status | Description |
|----------|--------|-------------|
| `/api/v1/quote` | ✅ | Real-time stock quote |
| `/api/v1/stock/profile2` | ✅ | Company profile |
| `/api/v1/company-news` | ✅ | Company news articles |
| `/api/v1/news` | ✅ | Market news |
| `/api/v1/stock/peers` | ✅ | Company peers |
| `/api/v1/stock/metric` | ✅ | Basic financials (52-week high/low, PE, etc.) |
| `/api/v1/stock/earnings` | ✅ | Earnings surprises |
| `/api/v1/calendar/earnings` | ✅ | Earnings calendar |
| `/api/v1/calendar/ipo` | ✅ | IPO calendar |
| `/api/v1/stock/recommendation` | ✅ | Analyst recommendation trends |
| `/api/v1/stock/market-status` | ✅ | Market open/close status |
| `/api/v1/stock/symbol` | ✅ | Stock symbols list |
| `/api/v1/stock/insider-transactions` | ✅ | Insider transactions |
| `/api/v1/stock/insider-sentiment` | ✅ | Insider sentiment |
| `/api/v1/stock/financials-reported` | ✅ | SEC financials reported |
| `/api/v1/stock/filings` | ✅ | SEC filings |
| `/api/v1/forex/exchange` | ✅ | Forex exchange list |
| `/api/v1/forex/symbol` | ✅ | Forex symbols |
| `/api/v1/crypto/exchange` | ✅ | Crypto exchange list |
| `/api/v1/crypto/symbol` | ✅ | Crypto symbols |
| `/api/v1/country` | ✅ | Country list |
| `/api/v1/stock/sector-metric` | ✅ | Sector performance metrics |
| `/api/v1/fda-advisory-committee-calendar` | ✅ | FDA calendar |

### Paid Endpoints (5 🔒 — require Finnhub premium plan)

| Endpoint | Status | Note |
|----------|--------|------|
| `/api/v1/stock/price-target` | 🔒 | Analyst price targets |
| `/api/v1/stock/upgrade-downgrade` | 🔒 | Upgrade/downgrade history |
| `/api/v1/stock/candle` | 🔒 | Stock OHLCV candles |
| `/api/v1/stock/revenue-estimate` | 🔒 | Revenue estimates |
| `/api/v1/stock/eps-estimate` | 🔒 | EPS estimates |

### Paid Endpoints (14 🔒 — return empty via free keys)

| Endpoint | Status | Note |
|----------|--------|------|
| `/api/v1/stock/dividend` | 🔒 | Dividends |
| `/api/v1/stock/split` | 🔒 | Stock splits |
| `/api/v1/forex/candle` | 🔒 | Forex OHLCV candles |
| `/api/v1/forex/rates` | 🔒 | Forex exchange rates |
| `/api/v1/crypto/candle` | 🔒 | Crypto OHLCV candles |
| `/api/v1/crypto/profile` | 🔒 | Crypto profile |
| `/api/v1/index/constituents` | 🔒 | Index constituents |
| `/api/v1/etf/holdings` | 🔒 | ETF holdings |
| `/api/v1/etf/profile` | 🔒 | ETF profile |
| `/api/v1/scan/pattern` | 🔒 | Pattern recognition |
| `/api/v1/scan/support-resistance` | 🔒 | Support/resistance levels |
| `/api/v1/indicator` | 🔒 | Technical indicators |
| `/api/v1/calendar/economic` | 🔒 | Economic calendar |
| `/api/v1/stock/social-sentiment` | 🔒 | Social media sentiment |

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
