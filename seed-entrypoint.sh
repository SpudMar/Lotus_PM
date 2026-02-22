#!/bin/sh
# Entrypoint for the demo-seed one-off ECS task.
# ECS injects: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
# (same secrets as the main app task definition).
set -e

export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo "Running Lotus PM demo seed..."
node ./seed.js
echo "Done."
