#!/usr/bin/env bash
set -euo pipefail

# Validate a production env file without printing any secret values. This is
# intentionally separate from deployment so it can be run before uploading a
# release to a server.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.production}"

if [[ ! -f "$ENV_FILE" || -L "$ENV_FILE" ]]; then
  echo "Arquivo de ambiente não encontrado: $ENV_FILE" >&2
  exit 1
fi

# Secrets must never be readable by group/other users on the host.
env_mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")"
if [[ "$env_mode" != "600" ]]; then
  echo "Permissão insegura em $ENV_FILE; use chmod 600." >&2
  exit 1
fi

source "$ROOT_DIR/scripts/lib/production-env.sh"
load_production_env "$ENV_FILE"

required_vars=(API_DOMAIN WEB_DOMAIN VITE_API_URL WEB_ORIGIN POSTGRES_PASSWORD DATABASE_URL REDIS_URL SESSION_SECRET ADMIN_EMAIL ADMIN_PASSWORD)
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Variável obrigatória ausente: $name" >&2
    exit 1
  fi
done

for name in API_DOMAIN WEB_DOMAIN VITE_API_URL WEB_ORIGIN; do
  value="${!name:-}"
  if [[ "$value" == *"localhost"* || "$value" == *"seudominio"* || "$value" == *"example.com"* || "$value" == *"troque"* ]]; then
    echo "Valor de produção não substituído em $name." >&2
    exit 1
  fi
done

if [[ "${VITE_API_URL}" != https://* || "${WEB_ORIGIN}" != https://* ]]; then
  echo "VITE_API_URL e WEB_ORIGIN precisam usar HTTPS." >&2
  exit 1
fi

for name in API_DOMAIN WEB_DOMAIN; do
  value="${!name}"
  if [[ ! "$value" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || [[ "$value" != *.* ]]; then
    echo "$name deve conter somente um domínio público, sem esquema, porta ou caminho." >&2
    exit 1
  fi
done
if [[ "${VITE_API_URL%/}" != "https://$API_DOMAIN" || "${WEB_ORIGIN%/}" != "https://$WEB_DOMAIN" ]]; then
  echo "VITE_API_URL e WEB_ORIGIN devem corresponder exatamente aos domínios configurados." >&2
  exit 1
fi
if (( ${#SESSION_SECRET} < 32 )); then
  echo "SESSION_SECRET deve ter pelo menos 32 caracteres." >&2
  exit 1
fi

for name in POSTGRES_PASSWORD SESSION_SECRET ADMIN_PASSWORD; do
  value="${!name}"
  if (( ${#value} < 16 )) || [[ "$value" == *"ChangeMe"* || "$value" == *"troque"* || "$value" == *"replace-with"* ]]; then
    echo "Segredo fraco ou de exemplo em $name." >&2
    exit 1
  fi
done

if [[ "${EXPO_PUBLIC_ALLOW_HTTP_API:-0}" == "1" || "${EXPO_PUBLIC_ALLOW_HTTP_PLAYER:-0}" == "1" ]]; then
  echo "HTTP inseguro habilitado em produção." >&2
  exit 1
fi

echo "Configuração de produção válida; nenhum segredo foi exibido."
