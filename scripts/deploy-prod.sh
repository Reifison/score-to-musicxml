#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.production || -L .env.production ]]; then
  echo "Crie .env.production a partir de .env.production.example antes de continuar."
  exit 1
fi

# Production credentials must never be readable by other users on the host.
# Keep this check before sourcing the file so an accidentally shared secrets
# file is rejected without loading it into the shell environment.
env_mode="$(stat -c '%a' .env.production 2>/dev/null || stat -f '%Lp' .env.production)"
if [[ ! "$env_mode" =~ ^[0-7]{3,4}$ ]] || (( 10#$env_mode & 77 )); then
  echo "Permissões inseguras em .env.production (use chmod 600)."
  exit 1
fi

bash scripts/validate-prod-env.sh .env.production

set -a
source .env.production
set +a

required_vars=(API_DOMAIN WEB_DOMAIN VITE_API_URL WEB_ORIGIN POSTGRES_PASSWORD DATABASE_URL REDIS_URL SESSION_SECRET ADMIN_EMAIL ADMIN_PASSWORD)
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Variável obrigatória ausente em .env.production: $name"
    exit 1
  fi
done

if [[ "$API_DOMAIN" == *"://"* || "$WEB_DOMAIN" == *"://"* || "$VITE_API_URL" != https://* || "${WEB_ORIGIN:-}" != https://* ]]; then
  echo "API_DOMAIN/WEB_DOMAIN devem ser hosts; VITE_API_URL e WEB_ORIGIN devem usar HTTPS."
  exit 1
fi

if [[ "$VITE_API_URL" != "https://${API_DOMAIN}" && "$VITE_API_URL" != "https://${API_DOMAIN}/"* ]] ||
   [[ "$WEB_ORIGIN" != "https://${WEB_DOMAIN}" && "$WEB_ORIGIN" != "https://${WEB_DOMAIN}/"* ]]; then
  echo "VITE_API_URL/WEB_ORIGIN não correspondem aos domínios configurados."
  exit 1
fi

for value in "$API_DOMAIN" "$WEB_DOMAIN" "$POSTGRES_PASSWORD" "$SESSION_SECRET" "$ADMIN_PASSWORD"; do
  if [[ "$value" == *"seudominio.com"* || "$value" == *"troque-"* || "$value" == *"Troque"* ]]; then
    echo "O arquivo .env.production ainda contém valores de exemplo."
    exit 1
  fi
done

if (( ${#SESSION_SECRET} < 32 )); then
  echo "SESSION_SECRET deve ter pelo menos 32 caracteres."
  exit 1
fi

COMPOSE=(docker compose --env-file .env.production -f docker-compose.prod.yml)

echo "==> Build das imagens de produção"
"${COMPOSE[@]}" build

echo "==> Subindo serviços"
"${COMPOSE[@]}" up -d

echo "==> Aguardando API ficar saudável"
api_healthy=false
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T api node -e "fetch('http://127.0.0.1:4000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" >/dev/null 2>&1; then
    api_healthy=true
    break
  fi
  sleep 2
done

if [[ "$api_healthy" != "true" ]]; then
  echo "A API não ficou saudável após 60 segundos. Logs da API:"
  "${COMPOSE[@]}" logs --tail=100 api
  exit 1
fi

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
