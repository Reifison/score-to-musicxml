#!/bin/sh
set -eu

echo "Applying database migrations..."
npx prisma migrate deploy --schema prisma/schema.prisma

exec "$@"
