# Deploying VIMO — local, VPS, anywhere

VIMO is local-first: your data never leaves machines you control. This guide
covers running it 24/7 on a cheap VPS, OpenClaw-style (one command, no
DevOps team). Any Ubuntu/Debian VPS with 1GB RAM works.

## What you need

- A VPS (1 vCPU / 1GB RAM minimum, 2GB recommended for builds) with ports
  **80 + 443** reachable.
- A domain pointing at it (e.g. `vimo.example.com`) if you want HTTPS and
  working social logins. OAuth providers refuse `http://<bare-ip>` return
  addresses, so a domain is effectively required for Instagram/LinkedIn/etc.
- Node.js 20–22 if you use the launcher path (the Docker path needs only Docker).

## Option A — launcher + systemd + Caddy (recommended)

One persistent process, automatic HTTPS, survives reboots.

```bash
# 1. On the VPS: install Node 20 LTS + Caddy + global launcher
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs caddy
sudo npm i -g vimo-oss@latest

# 2. First boot (downloads + builds; takes a few minutes once)
vimo --host 127.0.0.1 --port 3000 --no-open

# 3. Keep it alive with systemd (runs the same command on boot)
sudo tee /etc/systemd/system/vimo.service > /dev/null <<'EOF'
[Unit]
Description=VIMO marketing operations
After=network.target

[Service]
Type=simple
User=vimo
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NODE_ENV=production
ExecStart=/usr/bin/vimo --no-open
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo useradd -r -m -d /home/vimo vimo 2>/dev/null || true
sudo systemctl daemon-reload && sudo systemctl enable --now vimo
```

```bash
# 4. HTTPS in front (Caddy gets the certificate for you)
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
vimo.example.com {
  reverse_proxy 127.0.0.1:3000
}
EOF
sudo systemctl reload caddy
```

Open `https://vimo.example.com`, set your PIN, and finish onboarding in the
browser. VIMO binds loopback only; Caddy is the only thing facing the
internet. **Never expose port 3000 directly.**

Point VIMO at its public face so OAuth popups and live updates work:

```bash
# in the checkout served by systemd (or ~/.vimo/.env for launcher installs)
BACKEND_URL=https://vimo.example.com
FRONTEND_URL=https://vimo.example.com
CORS_ORIGINS=https://vimo.example.com
```

Then `sudo systemctl restart vimo`.

## Option B — Docker Compose

```bash
git clone https://github.com/Krish-1507/VIMO_OSS.git vimo && cd vimo
export ENCRYPTION_KEY=$(openssl rand -hex 32)   # required, once
# For a public domain also export:
#   BACKEND_URL=https://vimo.example.com FRONTEND_URL=https://vimo.example.com CORS_ORIGINS=https://vimo.example.com
docker compose up --build -d
```

- App: `http://<server-ip>` (port 80). Put Caddy/Nginx with TLS in front
  for HTTPS — same Caddyfile shape as Option A, proxying to port 80.
- Data persists in the `vimo-data` volume across rebuilds.
- Same-machine trial without a domain works out of the box.

## Updating

- **Launcher installs:** `vimo --update` (refreshes the launcher itself,
  then the app; your data is kept). Confirm in Settings → About.
- **Docker:** `git pull && docker compose up --build -d`. Your data lives in
  the volume, not the image.

## Backups

Everything personal lives in two places: the SQLite file and `.env`.

- Launcher/systemd: back up `~/.vimo/data/` and `~/.vimo/.env`.
- Docker: `docker run --rm -v vimo-data:/data -v "$PWD":/backup alpine tar czf
  /backup/vimo-data-backup.tar.gz -C /data` (plus your `ENCRYPTION_KEY` —
  without the key that encrypted them, backups are unreadable by design).

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| OAuth popup fails / redirects to localhost | `BACKEND_URL` is still localhost → set it to the public URL and restart. |
| Page loads but API calls fail / live updates dead | Browser origin isn't allowlisted → set `CORS_ORIGINS` to the public URL. Same-origin setups (launcher default port, compose nginx) need nothing. |
| `docker compose up` exits immediately | `ENCRYPTION_KEY` missing → the compose file tells you; export one and retry. |
| `vimo` starts an old version | `npm i -g vimo-oss@latest`, then `vimo --update`; confirm in Settings → About. |
| Port busy | `vimo --port 3001` (or set `PORT`). |
| Phone can't reach a home PC | Bind `HOST=0.0.0.0` (or `vimo --host 0.0.0.0`) on a trusted LAN only. |

## Security notes (read once)

- VIMO holds encrypted social tokens. Bind loopback, firewall everything but
  80/443, keep HTTPS on, and never commit `.env`.
- `ENCRYPTION_KEY` changes orphan stored credentials (AES-256-GCM, by
  design). Rotate only when you mean it, with a backup first.
- See [SECURITY.md](SECURITY.md) for the full inventory of what is stored
  and why.
