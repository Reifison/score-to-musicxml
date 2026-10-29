#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Arquivo de ambiente não encontrado: $ENV_FILE"
  exit 1
fi

bash scripts/validate-prod-env.sh "$ENV_FILE"
source scripts/lib/production-env.sh
load_production_env "$ENV_FILE"
resolve_public_domains

export VITE_API_URL="${VITE_API_URL:-https://converter.nossateoria.com.br}"

echo "==> Instalando dependências (inclui devDependencies para o build)"
NODE_ENV=development npm install

echo "==> Gerando Prisma client"
npm run db:generate

echo "==> Aplicando migrations"
npm run db:migrate:deploy

echo "==> Build API e Web"
npm run build -w apps/api
npm run build -w apps/web

echo "==> Reiniciando PM2"
pm2 restart converter-api converter-worker --update-env

echo "==> Verificando banco, fila e worker"
node scripts/check-readiness.mjs "https://${API_DOMAIN}/ready"

echo
echo "Serviços prontos. Execute e registre o smoke test de conversão antes de liberar."
echo "Web/API: ${VITE_API_URL}"
