## JamSession server deployment (Docker, Hetzner)

This guide walks you through deploying the backend API (Express + Postgres + Caddy) on a Hetzner Ubuntu VM using Docker Compose. It assumes you own a domain such as `api.example.com` that will point to this server.

### 1) Provision a VM and prepare the OS

- Create a Hetzner Cloud VM (Ubuntu 22.04+ recommended). A small instance (2 vCPU / 2–4 GB RAM) is fine to start.
- Open firewall for ports:
  - 22/tcp (SSH)
  - 80/tcp (HTTP)
  - 443/tcp (HTTPS)

Install Docker and Compose v2:

```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
docker --version && docker compose version
```

### 2) DNS

- Create an A record for your API domain (e.g., `api.example.com`) pointing to the VM’s public IPv4.

### 3) Clone the repository on the server

```bash
cd ~
git clone https://github.com/your-org-or-user/JamSession.git
cd JamSession
```

If you’re deploying from a private repo, configure SSH access and use the SSH URL instead.

### 4) Create the environment file

Create `.env` in the project root. Use strong secrets and consider changing default DB creds in production.

```bash
cat > .env << 'EOF'
# --- Postgres ---
POSTGRES_DB=spotify_comments
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change_this_strong_password

# Connection string used by the server container to reach Postgres (service name: db)
DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}

# --- Server ---
NODE_ENV=production
PORT=5050

# Allowlist origins that may call the API
# Keep Spotify and add your public API origin
CORS_ORIGINS=https://open.spotify.com,https://api.example.com

# App JWT secret (used to sign short-lived app tokens)
JWT_SECRET=please_generate_a_long_random_secret

# Optional: Privy (for production auth). If not set, dev token flow is enabled.
PRIVY_APP_ID=
PRIVY_APP_SECRET=
EOF
```

Notes:
- For real sign-in, set `PRIVY_APP_ID` and `PRIVY_APP_SECRET` from your Privy dashboard.
- If Privy values are empty, a development token flow remains available. For production, you should set them.

### 5) Production Caddy config

Create a production Caddyfile that serves your domain on 80/443 and reverse-proxies to the server container.

```bash
mkdir -p caddy-data caddy-config
cat > backend/Caddyfile.prod << 'EOF'
{
  # Optional: email used for ACME/Let’s Encrypt notifications
  email you@example.com
}

https://api.example.com {
  encode gzip

  @api path /health /comments* /debug /auth* /static*

  # Handle CORS preflights at the edge if desired. Server already manages CORS,
  # but this can help with OPTIONS requests.
  @preflight {
    method OPTIONS
    path /health /comments* /debug /auth* /static*
  }
  header @preflight {
    Access-Control-Allow-Origin "https://open.spotify.com"
    Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    Access-Control-Allow-Headers "Content-Type, Authorization"
  }
  respond @preflight 204

  reverse_proxy @api server:5050
}
EOF
```

### 6) Compose production override

Keep the repository’s `docker-compose.yml` untouched and add an override file that binds Caddy to 80/443 and uses the production Caddyfile.

```bash
cat > docker-compose.override.yml << 'EOF'
services:
  server:
    environment:
      - NODE_ENV=production
      # Ensure your public origin is in CORS_ORIGINS via .env
    ports: [] # Remove the default port mapping so that the server is not exposed to the public and only accessible via Caddy
  caddy:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./backend/Caddyfile.prod:/etc/caddy/Caddyfile:ro
      - ./caddy-data:/data
      - ./caddy-config:/config
EOF
```

Notes:
- The default compose file exposes the API on `5050` and a local HTTPS on `8443`. The override above replaces it with public `80/443` and the production Caddyfile.
- Important (security): The base `docker-compose.yml` maps `server` on `5050:5050`. In production you should avoid exposing the Node server directly. Options:
  - EITHER edit `docker-compose.yml` and remove the `ports:\n      - "5050:5050"` lines under `server` (recommended),
  - OR change it to bind only to localhost: `"127.0.0.1:5050:5050"`,
  - OR ensure your firewall blocks external access to `:5050`.
- Ensure `caddy-data/` and `caddy-config/` are writable by your current user. They persist certificates and Caddy state between restarts.

### 7) Start the stack

```bash
docker compose up -d --build
docker compose ps
```

Wait ~10–30s for certificates to be issued on first run.

### 8) Smoke test

```bash
curl -s https://api.example.com/health | jq
```

You should see `{ "status": "healthy", ... }`.

### 9) Point the Chrome extension to your API

On `https://open.spotify.com`, you can override the API base without rebuilding the extension:

```js
localStorage.setItem('spotifyCommentsApiUrl', 'https://api.example.com')
```

Reload the Spotify tab and interact with the comments drawer.

### 10) Operations

- View logs:
  ```bash
  docker compose logs -f --tail=200 server caddy db
  ```
- Follow only server logs:
  ```bash
  docker compose logs -f server
  ```
- Recreate after config changes (e.g., updated Caddyfile, env):
  ```bash
  docker compose up -d --build
  ```
- Update to latest image base and dependencies (if you’ve pulled new commits):
  ```bash
  git pull
  docker compose up -d --build
  ```

### 11) Backups (Postgres)

Create a compressed dump:

```bash
docker compose exec -T db pg_dump -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-spotify_comments} | gzip > backup_$(date +%F).sql.gz
```

Restore from a dump (will drop/create objects as needed):

```bash
gunzip -c backup_YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-spotify_comments}
```

### 12) Hardening tips

- Change default Postgres credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`) and keep `.env` private.
- Use a long random `JWT_SECRET`.
- Set `PRIVY_APP_ID` and `PRIVY_APP_SECRET` for real authentication in production. Without them, the dev token flow remains available.
- Keep ports closed that you don’t use. Only 80/443 should be public.
- Consider enabling automatic security upgrades on the VM and periodically rebuilding images.

### 13) Troubleshooting

- Certificate issuance fails: ensure DNS A record points to this server and ports 80/443 are reachable from the internet.
- 502 from Caddy: check that `server` container is healthy and listening on `:5050`.
- CORS errors in the browser: ensure your API origin is included in `CORS_ORIGINS`.
- Database connection errors: verify `DATABASE_URL` and that the `db` service is healthy.

---

With the override file and production Caddyfile in place, all traffic to `https://api.example.com` terminates at Caddy and is proxied to the Node.js server on `server:5050` inside the Compose network. Postgres data persists in the `pgdata` volume.


