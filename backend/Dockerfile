FROM node:20-alpine

WORKDIR /app

# Install runtime deps and build tools for native modules
RUN apk add --no-cache curl python3 make g++

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
# Use npm install instead of npm ci to allow lockfile updates when deps change
RUN npm install --omit=dev

# Copy server source
COPY backend/server.js ./server.js
COPY backend/static ./static

# Bundle hosted login UI for the browser (no bare imports)
RUN ./node_modules/.bin/esbuild \
  static/auth-login.js \
  --bundle \
  --platform=browser \
  --format=esm \
  --outfile=static/auth-login.bundle.js \
  --external:fs --external:path

EXPOSE 5050

ENV NODE_ENV=production

CMD ["node", "server.js"]


