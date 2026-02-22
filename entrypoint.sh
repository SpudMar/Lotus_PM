#!/bin/sh
# Lotus PM container entrypoint
# Constructs DATABASE_URL from ECS-injected secret env vars,
# runs Prisma migrations, then starts the Next.js server.
#
# Required env vars (injected by ECS from Secrets Manager):
#   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
#   NEXTAUTH_SECRET
set -e

# Construct DATABASE_URL from individual RDS secret fields
# RDS Secrets Manager keys: host, port, username, password, dbname
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo "Running Prisma migrations..."
# Call prisma/build/index.js directly (not via .bin/ symlink) so that
# __dirname resolves to node_modules/prisma/build/ where the .wasm file lives.
node ./node_modules/prisma/build/index.js migrate deploy

echo "Starting Lotus PM..."
exec node server.js
