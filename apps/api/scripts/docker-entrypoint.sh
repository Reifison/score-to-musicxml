#!/bin/sh
set -eu

storage_dir="${STORAGE_DIR:-/app/storage}"
# The mounted volume hides the directories created in the image. Create both
# application-owned directories before either the API or the worker starts so
# an empty or newly provisioned volume cannot appear healthy until first use.
umask 077
mkdir -p "$storage_dir/uploads" "$storage_dir/exports"

# Audiveris checks TESSDATA_PREFIX before its per-user config folder. The
# Docker image bundles legacy 4.x models here, so a container restart cannot
# silently lose OCR support.
audiveris_tessdata_dir="${TESSDATA_PREFIX:-/opt/audiveris/tessdata}"
for language in eng por; do
  if [ ! -s "$audiveris_tessdata_dir/$language.traineddata" ]; then
    echo "Required Audiveris OCR language is missing: $audiveris_tessdata_dir/$language.traineddata" >&2
    exit 1
  fi
done
export TESSDATA_PREFIX="$audiveris_tessdata_dir"

echo "Applying database migrations..."
npx prisma migrate deploy --schema prisma/schema.prisma

exec "$@"
