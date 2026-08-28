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

# The deployment script sources this file. Accept only KEY=value lines and
# reject command substitutions so a malformed/hostile file cannot execute
# arbitrary commands.
if ! bash -n "$ENV_FILE"; then
  echo "Sintaxe inválida em $ENV_FILE." >&2
  exit 1
fi
if ! awk '
  /^[[:space:]]*($|#)/ { next }
  $0 !~ /^[A-Za-z_][A-Za-z0-9_]*=/ { invalid = 1 }
  END { exit invalid }
' "$ENV_FILE"; then
  echo "Arquivo $ENV_FILE contém linhas que não são KEY=value." >&2
  exit 1
fi
if grep -Eq '\$\(|`|^[[:space:]]*(source|export)[[:space:]]' "$ENV_FILE"; then
  echo "Arquivo $ENV_FILE contém sintaxe executável." >&2
  exit 1
fi

env_value() {
  awk -v key="$1" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$ENV_FILE"
}

required_vars=(API_DOMAIN WEB_DOMAIN VITE_API_URL WEB_ORIGIN STORAGE_DIR POSTGRES_PASSWORD DATABASE_URL REDIS_URL SESSION_SECRET ADMIN_EMAIL ADMIN_PASSWORD)
for name in "${required_vars[@]}"; do
  value="$(env_value "$name")"
  if [[ -z "$value" ]]; then
    echo "Variável obrigatória ausente: $name" >&2
    exit 1
  fi
done

for name in API_DOMAIN WEB_DOMAIN VITE_API_URL WEB_ORIGIN; do
  value="$(env_value "$name")"
  if [[ "$value" == *"localhost"* || "$value" == *"seudominio"* || "$value" == *"example.com"* || "$value" == *"troque"* ]]; then
    echo "Valor de produção não substituído em $name." >&2
    exit 1
  fi
done

if [[ "$(env_value VITE_API_URL)" != https://* || "$(env_value WEB_ORIGIN)" != https://* ]]; then
  echo "VITE_API_URL e WEB_ORIGIN precisam usar HTTPS." >&2
  exit 1
fi

if [[ "$(env_value STORAGE_DIR)" != "/app/storage" ]]; then
  echo "STORAGE_DIR precisa ser /app/storage para usar o volume persistente compartilhado." >&2
  exit 1
fi

for name in POSTGRES_PASSWORD SESSION_SECRET ADMIN_PASSWORD; do
  value="$(env_value "$name")"
  if (( ${#value} < 16 )) || [[ "$value" == *"ChangeMe"* || "$value" == *"troque"* || "$value" == *"replace-with"* ]]; then
    echo "Segredo fraco ou de exemplo em $name." >&2
    exit 1
  fi
done

if [[ "$(env_value EXPO_PUBLIC_ALLOW_HTTP_API)" == "1" || "$(env_value EXPO_PUBLIC_ALLOW_HTTP_PLAYER)" == "1" ]]; then
  echo "HTTP inseguro habilitado em produção." >&2
  exit 1
fi

echo "Configuração de produção válida; nenhum segredo foi exibido."
