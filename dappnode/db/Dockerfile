FROM postgres:16-alpine

# Bake the initialization SQL into the image so we don't need a bind-mount
COPY backend/db/schema.sql /docker-entrypoint-initdb.d/01_schema.sql

