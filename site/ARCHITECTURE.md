# Deployment Architecture

## Topology

```
  Browser  ──HTTPS──►  Cloudflare  ──HTTPS──►  Hostinger VPS
                      (DNS, TLS,                ┌──────────────────┐
                       DDoS, cache)             │   Caddy          │
                                                │     │            │
                                                │     ├─►  static  │  (index.html, etc.)
                                                │     │            │
                                                │     └─► /api/*   │
                                                │            │     │
                                                │            ▼     │
                                                │    Node (server.js)
                                                │         │  │
                                                │         │  └─►  data/roster.json
                                                │         ▼
                                                │   Anthropic API
                                                └──────────────────┘
```

One VPS serves both the static site and the API on the same domain. Cloudflare
in front handles TLS termination, DDoS protection, and caching for static
assets. The Anthropic API key never leaves the VPS.

## Components

| Piece          | Role                                                              |
|----------------|-------------------------------------------------------------------|
| **Caddy**      | TLS, reverse proxy. Serves `/` from the repo root, forwards `/api/*` to Node. |
| **Node**       | `server/server.js`. Proxies `/api/oracle` to Anthropic, stores roster. |
| **JSON file**  | `data/roster.json`. Atomic writes. Sufficient for party scale.    |
| **systemd**    | Keeps the Node service running and restarts it on failure.        |

## Why this shape (and not the alternatives)

- **VPS over Workers AI** — Workers AI is genuinely free and edge-local, but
  runs open-source models that don't match Claude's prompt adherence on this
  kind of stylized output. Hostinger is already paid for; marginal cost is
  zero; Anthropic API cost at party scale is pennies.
- **JSON file over SQLite** — Roster data is small (≤ a few hundred entries
  per room, a few rooms). Atomic JSON writes are simpler to debug and need
  no native modules. Swap in `better-sqlite3` later if queries matter.
- **Caddy over nginx** — Caddy auto-provisions Let's Encrypt certificates
  with no configuration. One file, no certbot timer to remember.
- **Cloudflare in front** — Free TLS at the edge, DDoS protection, static
  cache. The VPS only sees post-Cloudflare traffic, which limits abuse.

## Room codes

Each party gets a short code (e.g. `erin-9k2`). The code namespaces both the
roster API path (`/api/roster/erin-9k2`) and the in-app state. Two parties
on the same deployment don't collide. No authentication — anyone with the
code can read and write that room. For a party tool, URL obscurity is the
security model and it's an acceptable trade for zero-friction sharing.

## Quick start (on the VPS)

Assumes Ubuntu / Debian. Replace `crows.example.com` with your domain.

```bash
# Node 20+ (skip if already present)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs caddy

# Repo
sudo git clone https://github.com/<you>/crow-name-oracle.git /opt/crow-name-oracle
sudo useradd --system --home-dir /opt/crow-name-oracle --shell /usr/sbin/nologin crow
sudo chown -R crow:crow /opt/crow-name-oracle
sudo mkdir -p /opt/crow-name-oracle/data && sudo chown crow:crow /opt/crow-name-oracle/data

# Backend
cd /opt/crow-name-oracle/server
sudo -u crow cp .env.example .env
sudoedit /opt/crow-name-oracle/server/.env       # set ANTHROPIC_API_KEY, ALLOWED_ORIGINS
sudo -u crow npm install --omit=dev

# systemd
sudo cp crow-oracle.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now crow-oracle
sudo systemctl status crow-oracle

# Caddy
sudo cp Caddyfile /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile                    # set your domain
sudo systemctl reload caddy

# Smoke test
curl -fsS https://crows.example.com/healthz
```

Caddy fetches a Let's Encrypt certificate on first request — no further
configuration needed for HTTPS.

## Pointing the client at the proxy

After the backend is live, edit one line in `index.html`:

```js
var ORACLE_ENDPOINT = "https://crows.example.com/api/oracle";
```

(Default is the direct Anthropic API URL, which only works inside the
Claude artifact sandbox. On a public site without the proxy, the Oracle
call fails and Auto mode falls back to the Scribe, which is fine but not
the full experience.)

## Operational notes

- **Updates** — `cd /opt/crow-name-oracle && sudo -u crow git pull && sudo systemctl restart crow-oracle`. Static files don't need a restart.
- **Logs** — `sudo journalctl -u crow-oracle -f`.
- **Rotating the API key** — edit `.env`, restart the service. No client change.
- **Backup the roster** — `data/roster.json`. Rsync it nightly if it matters.
- **Rate limit** — set `RATE_LIMIT_RPM` in `.env`. Defaults to 20 requests/minute per IP on the Oracle endpoint.
- **CORS** — set `ALLOWED_ORIGINS` to your site's exact origin (e.g. `https://crows.example.com`). Comma-separate multiples.

## Hardening checklist

- [ ] `ufw` open only on 22, 80, 443; deny everything else.
- [ ] SSH key-only login, password auth disabled.
- [ ] Node service runs as `crow`, not root (the systemd unit handles this).
- [ ] `ANTHROPIC_API_KEY` only in `.env`, never committed.
- [ ] Cloudflare proxy enabled (orange cloud) on the DNS record.
- [ ] `ALLOWED_ORIGINS` restricts CORS to your exact public origin.
