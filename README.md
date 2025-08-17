# Spotify Playlist Comments (JamSession)

A Chrome extension that adds a shared commenting layer to Spotify’s Web Player. Users can open a right‑side drawer to see and post comments on a playlist, and spot small comment bubbles next to tracks that have discussion. The drawer includes Sign in/Log out via Privy, an inline “Name” field to set your display name, and comment ownership controls.

## What’s in the repo

- `extension/`: Chrome MV3 extension (content script, background service worker, styles, popup)
- `backend/`: Node.js + Express REST API and Postgres schema (with optional migrations)
- `docker-compose.yml`: Spins up Postgres, the API server, and a Caddy HTTPS reverse proxy

## Quick start (Docker Compose)

1) Create a `.env` in the project root (used by Docker services):

```
POSTGRES_DB=spotify_comments
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgres://postgres:postgres@db:5432/spotify_comments
NODE_ENV=development
PORT=5050
# Comma‑separated origins allowed to call the API
CORS_ORIGINS=https://open.spotify.com,https://localhost:8443,http://localhost:5050
```

2) Start the stack:

```
docker compose up -d --build
```

This brings up:
- Postgres on `db:5432` (initialized with `backend/db/schema.sql`)
- API server on `http://localhost:5050`
- Caddy reverse proxy with local HTTPS on `https://localhost:8443`

3) Load the extension in Chrome:

1. Go to `chrome://extensions/`
2. Enable Developer mode
3. Click “Load unpacked” and select the `extension/` folder

4) Verify the backend:

```
curl -s http://localhost:5050/health | jq
curl -sk https://localhost:8443/health | jq
```

If Chrome warns about the local certificate, you may need to trust the Caddy local CA (see Troubleshooting).

## Using the extension

1. Navigate to `https://open.spotify.com`
2. Open any playlist
3. Click the floating “💬 Comments” button (bottom‑right)
4. Sign in when prompted. After signing in, you can:
   - Set your display name under “Name: …” (pencil icon)
   - Post a playlist‑level comment
   - Delete your own comments (Delete appears next to your comments)
5. Track rows with comments show a small 💬 bubble you can click

Tip: You can override the API URL at runtime without rebuilding the extension:

```
localStorage.setItem('spotifyCommentsApiUrl', 'https://your-api-domain')
```

## Project structure

```
JamSession/
├─ extension/
│  ├─ manifest.json
│  ├─ content.js
│  ├─ background.js
│  ├─ popup.html
│  ├─ styles.css
│  ├─ components/
│  └─ utils/
├─ backend/
│  ├─ server.js
│  ├─ Caddyfile
│  └─ db/
│     └─ schema.sql
├─ docker-compose.yml
└─ package.json
```

## API

Base URL (dev): `https://localhost:8443`

- `GET /health`
- `GET /comments?playlist_id=<id>[&track_uri=<uri>]` – returns comments with `author` (display name or masked email) and `is_owner`
- `POST /comments` (JSON: `{ playlist_id, text, track_uri? }`) – returns created comment including `author`
- `POST /comments/counts` (JSON: `{ playlist_id, track_uris: string[] }`)
- `GET /comments/stats/:playlist_id`
- `POST /auth/exchange` – exchanges a Privy token for an app token
- `GET /auth/me` – returns `{ id, privy_user_id, email, username }`
- `PUT /auth/me/username` – sets the user’s display name

Notes:
- Inputs validated server‑side (IDs, URI format, length, limits)
- Write endpoints are rate‑limited
- CORS allowlist defaults to Spotify + local dev origins and can be overridden via `CORS_ORIGINS`

## How it works

- **Extension (MV3)**: A content script injects a Shadow DOM overlay, adds a floating button and a slide‑in drawer, and observes SPA navigation (MutationObserver + history hooks). It talks to the background service worker for authenticated calls (login, profile, update username) and to the backend for comments.
- **Backend**: Express + `pg` Pool on Node 20. Stores comments in Postgres keyed by `playlist_id` and optional `track_uri`. Comment responses include `author` (username or masked email). Auth uses Privy, exchanged for a short app JWT stored in the extension’s background.
- **HTTPS & CORS**: Caddy terminates HTTPS locally on `:8443` and reverse‑proxies to the API on `:5050`, including Private Network Access preflight headers.

## Database migration (adding display names)

If your database was created before the display‑name feature, add the `username` column:

```
docker compose exec -T db psql -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-spotify_comments} -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;"
```

The backend automatically falls back to masked emails if the column is missing.

## Alternate local run (no Docker)

```
npm install
DATABASE_URL=postgres://localhost:5432/spotify_comments npm start
```

You’ll need a running PostgreSQL and to handle HTTPS yourself (e.g., host Caddy locally and point the extension to its HTTPS origin).

## Troubleshooting

- **Chrome blocks API calls** (CORS/PNA/cert): ensure the Docker stack is running, and visit `https://localhost:8443/health`. If the cert is untrusted, import the Caddy local CA from `caddy-data/pki/authorities/local` into your System Keychain or install Caddy locally and run `caddy trust`.
- **Comments don’t appear**: open DevTools on the Spotify tab and check the console for network errors; the extension logs fetch URLs and statuses.
- **Auth prompts reuse the last account**: after logging out, the extension uses a “force new login” flow to show the email chooser. If you still see auto‑login, close the Privy window and try again.
- **Display name won’t save**: ensure the DB has `users.username` (see Database migration). Also check the server logs for `409 username already taken`.

## Security & privacy

- Auth required to post/delete; reads are public
- Input validation and sanitization on the server
- Helmet security headers, rate limiting on writes
- All traffic over HTTPS in dev/prod

## Roadmap

- Moderation tools (hide/report)
- Real‑time updates (SSE/websockets) to replace polling
- Improved track bubble coverage and caching