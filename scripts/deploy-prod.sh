#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.production ]]; then
  echo "Crie .env.production a partir de .env.production.example antes de continuar."
  exit 1
fi

set -a
source .env.production
set +a

required_vars=(API_DOMAIN WEB_DOMAIN VITE_API_URL POSTGRES_PASSWORD DATABASE_URL REDIS_URL SESSION_SECRET)
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Variável obrigatória ausente em .env.production: $name"
    exit 1
  fi
done

COMPOSE=(docker compose --env-file .env.production -f docker-compose.prod.yml)

echo "==> Build das imagens de produção"
"${COMPOSE[@]}" build

echo "==> Subindo serviços"
"${COMPOSE[@]}" up -d

echo "==> Aguardando API ficar saudável"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T api node -e "fetch('http://127.0.0.1:4000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Rodando seed do admin (idempotente)"
"${COMPOSE[@]}" exec -T api npm run seed:prod -w apps/api

echo
echo "Deploy concluído."
echo "Web:  https://${WEB_DOMAIN}"
echo "API:  https://${API_DOMAIN}/health"
echo
echo "Próximo passo mobile:"
echo "  EXPO_PUBLIC_API_URL=https://${API_DOMAIN}"
echo "  npm run ios:release -w apps/mobile"
