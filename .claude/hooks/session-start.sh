#!/bin/bash
set -euo pipefail

# Lotus PM — Session Start Hook
# Runs at the start of every Claude Code web session.
# Ensures all dependencies are installed and Prisma client is generated
# so tests and linters work immediately without manual setup.

# Only run in remote (web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "🪷 Lotus PM — Session Start"
echo "Installing dependencies..."

cd "$CLAUDE_PROJECT_DIR"

# Install all npm dependencies (uses cache if node_modules exists)
npm install

# Generate Prisma client (required for TypeScript types to resolve)
# Uses DATABASE_URL from environment or falls back to a dummy for type generation
if [ -f "prisma/schema.prisma" ]; then
  echo "Generating Prisma client..."
  npx prisma generate
fi

echo "✅ Session ready — dependencies installed, Prisma client generated"
