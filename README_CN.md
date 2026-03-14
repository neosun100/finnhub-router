<div align="center">

# 🔀 finnhub-router

**Finnhub API 智能反代：多 Key 轮换 · 限流保护 · 响应缓存 · 故障自动切换**

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/部署-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.x-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Tests](https://img.shields.io/badge/测试-14%20通过-brightgreen?logo=vitest&logoColor=white)](#测试)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md)

</div>

---

## 为什么需要？

Finnhub 免费账号限制每个 API Key **60 次请求/分钟**。如果你在做实时行情看板、量化交易机器人或任何高频调用场景，很快就会触顶。

**finnhub-router** 将多个 API Key 池化到一个端点背后——你的应用只需对接一个 URL、一个 Token，路由器自动处理轮换、限流和故障切换。

## 核心功能

| 功能 | 说明 |
|------|------|
| 🔄 **多 Key 轮换** | 最多 50 个 Finnhub Key，Round-robin 负载均衡 |
| 🚦 **Per-Key 限流** | 每个 Key 独立跟踪 60 req/min，耗尽自动跳过 |
| 💥 **故障自动切换** | Key 返回 401/403/429 时标记不健康，自动切换下一个重试 |
| 🩺 **健康自恢复** | 不健康的 Key 冷却 60 秒后自动恢复探测 |
| ⚡ **响应缓存** | 相同请求短期缓存（默认 30 秒），减少上游调用 |
| 🔐 **认证保护** | 用一个 Router Token 保护你的服务，支持 3 种认证方式 |
| 🪄 **无缝替换** | 与 Finnhub API 格式 100% 兼容——换个 URL 就行，代码零改动 |
| 🌍 **边缘部署** | 运行在 Cloudflare Workers 上——全球加速、Serverless |

## 架构

```
                          ┌─────────────────────────────────┐
                          │        finnhub-router            │
                          │                                  │
客户端 ──→ [认证守卫] ──→ [缓存层] ──→ [Key 池] ──→ Finnhub API
              │                ↑            │    │
              │ 401            │ 命中       │    ├→ Key #1 (42/60 已用)
              │                │            │    ├→ Key #2 (60/60 跳过)
              │                └── 响应 ◄───┘    ├→ Key #3 (0/60 ✓)
              │                                  └→ ...Key #50
```

## 快速开始

### 1. 安装

```bash
git clone https://github.com/yourname/finnhub-router.git
cd finnhub-router
npm install
```

### 2. 配置

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`：

```ini
# Finnhub API Keys，逗号分隔（最多 50 个）
FINNHUB_KEYS=key1,key2,key3,...

# 缓存 TTL（秒）
CACHE_TTL=30

# Router 认证 Token（客户端用此 Token 访问本服务）
AUTH_TOKEN=fhr_your_secret_token
```

### 3. 本地运行

```bash
npm run dev
# → Ready on http://localhost:8787
```

### 4. 测试

```bash
curl -H "X-Finnhub-Token: fhr_your_secret_token" \
  "http://localhost:8787/api/v1/quote?symbol=AAPL"
```

## 使用方式

### 无缝替换

在现有代码中替换 Finnhub URL——**无需其他改动**：

```diff
- const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}`;
- const headers = { 'X-Finnhub-Token': finnhubApiKey };
+ const url = `https://your-router-domain/api/v1/quote?symbol=${symbol}`;
+ const headers = { 'X-Finnhub-Token': routerToken };
```

### 认证方式

支持三种方式，与 Finnhub 原生 API 完全兼容：

```bash
# 方式 1: X-Finnhub-Token header（推荐，与 Finnhub 原生一致）
curl -H "X-Finnhub-Token: YOUR_TOKEN" \
  "https://your-domain/api/v1/quote?symbol=AAPL"

# 方式 2: token query 参数（与 Finnhub 原生一致）
curl "https://your-domain/api/v1/quote?symbol=AAPL&token=YOUR_TOKEN"

# 方式 3: Authorization Bearer header
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://your-domain/api/v1/quote?symbol=AAPL"
```

### 支持所有 Finnhub 端点

所有 `/api/v1/*` 路径透明代理：

```bash
# 股票报价
/api/v1/quote?symbol=AAPL

# 公司概况
/api/v1/stock/profile2?symbol=AAPL

# K 线数据
/api/v1/stock/candle?symbol=AAPL&resolution=D&from=1672531200&to=1704067200

# 新闻
/api/v1/news?category=general

# ... 任何 Finnhub API 端点
```

### 管理端点

```bash
# 健康检查
curl https://your-domain/
# → {"service":"finnhub-router","status":"ok"}

# Key 池状态（各 key 用量、健康状态、缓存大小）
curl https://your-domain/admin/stats
```

## 部署到 Cloudflare Workers

```bash
# 设置 Secrets（不存储在代码中）
wrangler secret put FINNHUB_KEYS    # 粘贴逗号分隔的 keys
wrangler secret put AUTH_TOKEN       # 粘贴 Router Token

# 部署
npm run deploy
```

### 自定义域名

部署后在 Cloudflare 控制台添加自定义域名：
**Workers & Pages → finnhub-router → Settings → Domains & Routes**

## 配置项

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `FINNHUB_KEYS` | Finnhub API Keys，逗号分隔 | — | ✅ |
| `AUTH_TOKEN` | Router 认证 Token | `""`（不认证） | 建议设置 |
| `CACHE_TTL` | 响应缓存 TTL（秒） | `30` | 否 |

## 测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch
```

| 测试套件 | 用例数 | 覆盖内容 |
|---------|--------|---------|
| `key-pool.test.ts` | 8 | 轮换、限流、健康检测、自恢复 |
| `cache.test.ts` | 6 | 存取、TTL 过期、缓存 key 生成 |
| **合计** | **14** | 全部通过 ✅ |

## 工作原理

### Key 轮换

Round-robin 选择 Key，每个 Key 独立跟踪：
- 当前 1 分钟窗口内的请求数
- 健康状态（健康 / 不健康）
- 上次失败时间（用于冷却计算）

当某个 Key 在窗口内达到 60 次请求，自动跳过直到窗口重置。

### 故障切换

当 Finnhub 对某个 Key 返回 401/403/429 时：
1. 该 Key 标记为**不健康**
2. 请求**自动重试**到下一个可用 Key
3. 60 秒后，不健康的 Key **自动恢复探测**

### 缓存

- 仅缓存 **GET** 请求
- 缓存 Key = URL 路径 + 业务参数（去掉 `token`）
- 响应头包含 `X-Cache: HIT` 或 `X-Cache: MISS`
- 内存缓存，LRU 策略，上限 1000 条

## 吞吐量

| Key 数量 | 理论上限 | 加缓存（30s TTL） |
|---------|---------|------------------|
| 1 | 60 req/min | 更高（缓存命中不消耗配额） |
| 10 | 600 req/min | ~1000+ req/min |
| 50 | 3,000 req/min | ~5000+ req/min |

## 技术栈

- **运行时**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **框架**: [Hono](https://hono.dev/) — 轻量、高性能、Workers 原生
- **语言**: TypeScript
- **测试**: [Vitest](https://vitest.dev/)

## 项目结构

```
finnhub-router/
├── src/
│   ├── index.ts          # 主入口：路由、认证中间件、缓存逻辑
│   ├── key-pool.ts       # Key 轮换、限流、健康检测
│   ├── cache.ts          # 响应缓存（TTL + LRU）
│   └── proxy.ts          # 透明反代 Finnhub API
├── test/
│   ├── key-pool.test.ts  # KeyPool 单元测试
│   └── cache.test.ts     # Cache 单元测试
├── .dev.vars.example     # 配置模板（无敏感信息）
├── .gitignore            # 排除 .dev.vars、node_modules、.wrangler
├── wrangler.toml         # Cloudflare Workers 配置
└── package.json
```

## License

MIT
