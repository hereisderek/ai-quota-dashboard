# AI Quota Dashboard

A modern, lightweight, self-contained AI Quota & Usage Dashboard designed to monitor capacity, rate limits, and remaining quota across multiple AI providers and accounts in real-time.

Built with **Node.js, Fastify, SQLite, and React + Tailwind CSS**.

---

## Key Features

- ⚡ **Zero CLI Dependencies**: Operates 100% standalone over HTTP/REST and OAuth APIs. You do not need Google Antigravity CLI, Claude Code CLI, or any local AI binaries installed on the host.
- 🔄 **Multi-Account & Multi-Provider**: Track multiple accounts per provider (e.g. 3 Google accounts, 2 Anthropic keys, GitHub orgs) with aggregated health stats.
- 🌐 **Built-in Google OAuth**: One-click Google authorization directly from the web UI. Automatically saves refresh tokens and autonomously renews access tokens indefinitely.
- 📁 **Dedicated `/data` Volume Mount**:
  - The `/data` mount point can be **initially empty**. The app automatically bootstraps the directory structure, creates `accounts.json` (`{ "accounts": [] }`), and initializes `quota.db` with idempotent SQLite migrations.
  - Reinstalling or remounting containers to the same `/data` directory instantly restores all accounts, tokens, and historical metrics without manual setup.
- 📡 **Real-Time Live Updates**: WebSocket feed (`/ws`) pushes instant quota changes and live countdown timers directly to the dashboard, with automatic fallback to polling.
- 🛡️ **Configurable Multi-Mode Auth**: Support for Tokens, Basic Auth, IP Whitelisting, Reverse Proxy headers (`x-forwarded-user`), or open access.
- 📊 **Historical Tracking**: Time-series quota logging in embedded SQLite with configurable data retention (default 30 days).
- 🐳 **Ready-to-Deploy Docker**: Single multi-stage container (< 50MB RAM footprint).

---

## Supported Providers

| Provider | Extraction Method | Quota & Metrics Monitored |
|---|---|---|
| **Google Antigravity** | Google Cloud Code Assist API (`cloudcode-pa.googleapis.com`) via OAuth | Gemini 3 Pro, Claude 3.5 Sonnet, Free/Pro/Ultra tiers, reset countdowns |
| **Anthropic Claude** | Anthropic Admin API (`/v1/organizations/rate_limits`) & rate-limit headers | Requests Per Minute (RPM), Tokens Per Minute (TPM), Org limits |
| **GitHub Copilot** | GitHub REST API (`/orgs/{org}/copilot/billing`) & Rate Limits | Copilot active seats, enterprise billing, token quota |
| **Custom REST API** | Config-driven HTTP requests with JSONPath mappings | Any API exposing remaining credits, tokens, or quota fractions |

---

## Quick Start (Docker Compose)

### 1. Clone & Configure

```bash
git clone <repo-url> ai-quota-dashboard
cd ai-quota-dashboard

# Copy default environment settings
cp .env.example .env
```

### 2. Launch with Docker Compose

```bash
docker compose up -d
```

Open your browser at **`http://localhost:3456`**.

The `./data` directory will be created automatically and populated with `quota.db` and `accounts.json`.

---

## Local Development (Without Docker)

### Prerequisites
- Node.js 20+ (LTS)
- npm 10+

### Steps

```bash
# 1. Install workspace dependencies
npm install

# 2. Build backend and frontend
npm run build

# 3. Start the server
npm start
```

For live frontend/backend development with hot-reloading:
```bash
# Terminal 1: Backend with tsx watch
npm run dev:backend

# Terminal 2: Vite dev server with proxy
npm run dev:frontend
```

---

## Configuration & Environment Variables

Edit your `.env` file to customize settings:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3456` | Web server listening port |
| `HOST` | `0.0.0.0` | Binding interface (`0.0.0.0` for all interfaces) |
| `DATA_DIR` | `./data` (or `/data` in Docker) | Dedicated mount path for SQLite db and accounts |
| `PUBLIC_URL` | `http://localhost:3456` | Public URL used for OAuth redirect callbacks |
| `AUTH_MODE` | `none` | Security mode: `none`, `token`, `password`, `ip_whitelist`, `reverse_proxy` |
| `AUTH_TOKEN` | - | Secret Bearer token if `AUTH_MODE=token` |
| `AUTH_USERNAME` | `admin` | Username if `AUTH_MODE=password` |
| `AUTH_PASSWORD` | - | Password if `AUTH_MODE=password` |
| `ALLOWED_IPS` | `127.0.0.1,::1` | Comma-separated allowed IPs if `AUTH_MODE=ip_whitelist` |
| `PROXY_USER_HEADER` | `x-forwarded-user` | Header checked if `AUTH_MODE=reverse_proxy` |
| `POLL_INTERVAL_SECONDS` | `120` | Interval between background quota checks |
| `ENABLE_WEBSOCKET` | `true` | Enable live WebSocket stream to frontend |
| `DATA_RETENTION_DAYS` | `30` | Days of historical snapshots to retain in SQLite |

---

## Adding Accounts

### 1. Google Antigravity
1. Click **Connect Account** in the top right.
2. Under the **Google** tab, click **Authorize with Google**.
3. Log in with your Google account. You will be redirected back to the dashboard, and your quotas for Gemini and Claude will synchronize automatically.
4. *Alternative*: Enter a refresh token manually under "enter OAuth refresh token manually".

### 2. Anthropic Claude
1. Click **Connect Account** > **Claude** tab.
2. Provide a label and your Anthropic API Key (`sk-ant-api03-...` or Admin key `sk-ant-admin...`).
3. Click **Connect Claude**.

### 3. GitHub Copilot
1. Click **Connect Account** > **Copilot** tab.
2. Provide a GitHub Personal Access Token (PAT) with billing or organization permissions.
3. Optionally provide your organization or enterprise slug.

### 4. Custom REST API
1. Click **Connect Account** > **Custom** tab.
2. Provide an endpoint URL, method (GET/POST), optional Auth Token, and the JSONPath pointing to remaining quota (e.g. `data.remaining_fraction`).

---

## REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | System health, data directory, uptime, and auth mode |
| `GET` | `/api/providers` | Metadata of all registered provider plugins |
| `GET` | `/api/accounts` | List accounts with their latest quota snapshots |
| `POST` | `/api/accounts` | Add an account programmatically |
| `PUT` | `/api/accounts/:id` | Update account label, credentials, or status |
| `DELETE` | `/api/accounts/:id` | Delete an account and its snapshot history |
| `POST` | `/api/accounts/:id/refresh` | Trigger an immediate poll for an account |
| `POST` | `/api/accounts/refresh-all` | Trigger an immediate poll for all accounts |
| `GET` | `/api/accounts/:id/history` | Historical quota time series for charts |
| `GET` | `/api/settings` | Get polling and stream configuration |
| `POST` | `/api/settings` | Update polling interval, websocket, or retention |
| `GET` | `/ws` | Real-time WebSocket feed |

---

## License

MIT License.
