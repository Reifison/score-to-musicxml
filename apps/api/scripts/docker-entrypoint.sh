#!/bin/sh
set -eu

echo "Applying database migrations..."
node apps/api/dist/scripts/appleLegacyMigrationGuard.js
npx prisma migrate deploy --schema prisma/schema.prisma

exec "$@"
