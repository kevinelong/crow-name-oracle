# Deployment notes — Alpine + nginx + OpenRC

These notes describe how the Crow Name Oracle is **actually** deployed on the
production VPS, which differs from the idealized topology in
[`../ARCHITECTURE.md`](../ARCHITECTURE.md).

| `ARCHITECTURE.md` assumes | This VPS actually runs |
|---|---|
| Ubuntu / Debian | **Alpine Linux** (musl, `apk`) |
| Caddy (auto-TLS) | **nginx** (already serving other domains) |
| systemd (`crow-oracle.service`) | **OpenRC** (`/etc/init.d/crow-oracle`) |
| Dedicated domain + Cloudflare | Served on the **bare public IP over HTTP** |

The two files alongside this README are the live config, lightly commented:

- [`nginx-default.conf`](nginx-default.conf) → `/etc/nginx/http.d/default.conf`
- [`crow-oracle.openrc`](crow-oracle.openrc) → `/etc/init.d/crow-oracle`

`apk` and OpenRC normally need root; on this box use `doas` (Alpine's `sudo`).

## How it serves the IP without touching other sites

nginx routes by the `Host` header. Each real domain has its own `server` block
keyed on `server_name`; a request to the raw IP matches none of them and falls
through to the **`default_server`** block — which is exactly this app. So the
Oracle occupies the otherwise-unused bare-IP slot and the existing domains are
never affected.

The Node backend listens only on `127.0.0.1:8787`; nginx reverse-proxies
`/api/*` and `/healthz` to it and serves everything else as static files from
the repo's `site/` directory.

## First-time setup

```sh
# 1. Backend deps + config
cd /home/kevin/crow-name-oracle/site/server
npm install --omit=dev
cp .env.example .env
$EDITOR .env                       # set ANTHROPIC_API_KEY; ALLOWED_ORIGINS=http://<your-ip>
chmod 600 .env

# 2. OpenRC service (NOT the bundled systemd unit)
doas cp ../deploy/crow-oracle.openrc /etc/init.d/crow-oracle
doas chmod +x /etc/init.d/crow-oracle
doas touch /var/log/crow-oracle.log && doas chown kevin:kevin /var/log/crow-oracle.log
doas rc-service crow-oracle start
doas rc-update add crow-oracle default     # survive reboot — see gotcha below

# 3. nginx vhost on the default (bare-IP) server
doas cp ../deploy/nginx-default.conf /etc/nginx/http.d/default.conf
doas nginx -t
doas rc-service nginx restart
doas rc-update add nginx default           # survive reboot — see gotcha below

# 4. Point the client at the local proxy (already set in this repo)
#    site/index.html:  var ORACLE_ENDPOINT = "/api/oracle";
```

## ⚠️ The boot gotcha that bit us

A service can be **running** yet not **enabled at boot**. OpenRC only starts
what is symlinked into a runlevel (`/etc/runlevels/default/`). If you
`rc-service … start` but forget `rc-update add … default`, the next reboot
silently drops the service.

This is exactly what took the whole box offline once: nginx had never been
`rc-update add`-ed, so a routine reboot stopped it and it never came back —
which also broke `certbot renew` (it needs nginx on :80), so the TLS certs
quietly expired over the following weeks. **Always pair `start` with
`rc-update add <svc> default`** and verify with `doas rc-update show default`.

Note: start services with `rc-service nginx start`, never the bare `nginx`
binary — the init script creates `/run/nginx`, without which nginx fails on a
missing pidfile.

## Cache headers (why they matter here)

The roster is shared and mutates constantly, and the app is a single HTML file
whose JS changes between deploys. Without cache directives, browsers served a
stale empty roster or an old JS bundle to repeat/second visitors. The vhost
fixes both:

- `/api/*` → `Cache-Control: no-store` (roster always fresh; also set in
  `server.js` so it travels with the code)
- HTML → `Cache-Control: no-cache` (revalidate every load via ETag → updated
  JS reaches everyone immediately, 304s when unchanged)

## TLS / certbot

Certs are issued per real domain (`certbot --nginx`); the renewal cron
(`certbot renew … --post-hook 'rc-service nginx reload'`) only succeeds while
nginx is up on port 80. The bare-IP Oracle is intentionally **HTTP only** —
there is no certificate for a raw IP address.

## Serving a real domain over HTTPS (crowparty.org)

The bare-IP `default_server` is HTTP-only. To serve the Oracle on a real
domain with TLS, add a Host-matched vhost and let certbot provision the cert.
[`crowparty.org.conf`](crowparty.org.conf) is the live example.

```sh
# 0. DNS first: point crowparty.org AND www.crowparty.org A records at the VPS.
#    certbot's HTTP-01 challenge fails if DNS doesn't resolve here.

# 1. HTTP vhost (same root + /api proxy as the default_server, Host-matched).
#    Keep /.well-known reachable — use  location ~ /\.(?!well-known) { return 404; }
doas cp crowparty.org.conf /etc/nginx/http.d/crowparty.org.conf   # (the HTTP-only form, pre-certbot)
doas nginx -t && doas rc-service nginx restart

# 2. Provision the cert + auto-add the 443 block and HTTP->HTTPS redirect.
doas certbot --nginx -d crowparty.org -d www.crowparty.org \
     --non-interactive --agree-tos -m you@example.com --no-eff-email --redirect

# 3. CORS: the backend rejects cross-origin POSTs, and the page is now served
#    from https://crowparty.org, so add those origins or the Oracle/roster break:
#      ALLOWED_ORIGINS=https://crowparty.org,https://www.crowparty.org,http://<ip>
doas rc-service crow-oracle restart
```

**HSTS:** the 443 block sends `Strict-Transport-Security: max-age=31536000;
includeSubDomains`. nginx does **not** inherit `add_header` into a `location`
that has its own `add_header`, so the directive is repeated inside `location /`
and `location /api/` (which set `Cache-Control`) — otherwise it silently
vanishes from the main responses. `includeSubDomains` commits every future
subdomain to HTTPS; `preload` is intentionally omitted.

Routing stays clean: `crowparty.org` is Host-matched to this vhost, the bare IP
still hits `default_server`, and the other domains are untouched.

## Operations

```sh
doas rc-service crow-oracle status          # is the backend up?
doas rc-service crow-oracle restart         # after editing .env or server.js
tail -f /var/log/crow-oracle.log            # backend log (startup only; no per-request logging)
doas tail -f /var/log/nginx/access.log      # request log: method/path/status/IP/UA (no bodies)
curl -fsS http://127.0.0.1:8787/healthz     # backend health
```

- **Update the app:** `git pull`, then `doas rc-service crow-oracle restart`
  (static files need no restart; if `index.html` changed, the `no-cache`
  header means clients pick it up on next load).
- **Roster data** lives in `site/data/roster.json` (gitignored). Back it up if
  it matters; it is the only stateful file.
- **Rotate the API key:** edit `server/.env`, `restart crow-oracle`. No client
  change.
