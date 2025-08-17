FROM node:20-alpine

WORKDIR /app

# Install runtime deps for healthcheck
RUN apk add --no-cache curl

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server source
COPY backend/server.js ./server.js

EXPOSE 5050

ENV NODE_ENV=production

CMD ["node", "server.js"]


