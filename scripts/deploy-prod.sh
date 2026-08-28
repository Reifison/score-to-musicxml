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
if [[ "$env_mode" != "600" ]]; then
  echo "Permissões inseguras em .env.production (use chmod 600)."
  exit 1
fi

bash scripts/validate-prod-env.sh .env.production

env_value() {
  awk -v key="$1" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' .env.production
}

required_vars=(API_DOMAIN WEB_DOMAIN VITE_API_URL WEB_ORIGIN STORAGE_DIR POSTGRES_PASSWORD DATABASE_URL REDIS_URL SESSION_SECRET ADMIN_EMAIL ADMIN_PASSWORD)
for name in "${required_vars[@]}"; do
  if [[ -z "$(env_value "$name")" ]]; then
    echo "Variável obrigatória ausente em .env.production: $name"
    exit 1
  fi
done

API_DOMAIN="$(env_value API_DOMAIN)"
WEB_DOMAIN="$(env_value WEB_DOMAIN)"
VITE_API_URL="$(env_value VITE_API_URL)"
WEB_ORIGIN="$(env_value WEB_ORIGIN)"
STORAGE_DIR="$(env_value STORAGE_DIR)"
POSTGRES_PASSWORD="$(env_value POSTGRES_PASSWORD)"
SESSION_SECRET="$(env_value SESSION_SECRET)"
ADMIN_PASSWORD="$(env_value ADMIN_PASSWORD)"

if [[ "$API_DOMAIN" == *"://"* || "$WEB_DOMAIN" == *"://"* || "$VITE_API_URL" != https://* || "${WEB_ORIGIN:-}" != https://* ]]; then
  echo "API_DOMAIN/WEB_DOMAIN devem ser hosts; VITE_API_URL e WEB_ORIGIN devem usar HTTPS."
  exit 1
fi

if [[ "$VITE_API_URL" != "https://${API_DOMAIN}" && "$VITE_API_URL" != "https://${API_DOMAIN}/"* ]] ||
   [[ "$WEB_ORIGIN" != "https://${WEB_DOMAIN}" && "$WEB_ORIGIN" != "https://${WEB_DOMAIN}/"* ]]; then
  echo "VITE_API_URL/WEB_ORIGIN não correspondem aos domínios configurados."
  exit 1
fi

if [[ "$STORAGE_DIR" != "/app/storage" ]]; then
  echo "STORAGE_DIR precisa ser /app/storage para usar o volume persistente compartilhado."
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

active_api_container="$(docker ps -q --filter label=com.docker.compose.service=api | head -n 1)"
compose_project=""
if [[ -n "$active_api_container" ]]; then
  compose_project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$active_api_container")"
fi
COMPOSE=(docker compose)
if [[ -n "$compose_project" && "$compose_project" != "<no value>" ]]; then
  COMPOSE+=(-p "$compose_project")
fi
COMPOSE+=(--env-file .env.production -f docker-compose.prod.yml)
if [[ -f docker-compose.vps-override.yml ]]; then
  COMPOSE+=(-f docker-compose.vps-override.yml)
fi
storage_probe=""

cleanup_storage_probe() {
  if [[ -z "$storage_probe" ]]; then
    return
  fi
  "${COMPOSE[@]}" exec -T api node -e '
    const fs = require("node:fs/promises");
    const path = require("node:path");
    const name = process.argv[1];
    if (!/^\.deploy-storage-probe-[a-z0-9-]+$/.test(name)) process.exit(2);
    const root = process.env.STORAGE_DIR || "/app/storage";
    fs.rm(path.join(root, "exports", name), { force: true }).catch(() => process.exitCode = 1);
  ' "$storage_probe" >/dev/null 2>&1 || true
}

trap cleanup_storage_probe EXIT

echo "==> Build das imagens de produção"
"${COMPOSE[@]}" build api worker

echo "==> Subindo API e worker"
"${COMPOSE[@]}" up -d --no-deps api worker

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

echo "==> Verificando idiomas OCR do Audiveris"
for service in api worker; do
  if ! "${COMPOSE[@]}" exec -T "$service" sh -ec '
    tessdata_dir="${TESSDATA_PREFIX:-/opt/audiveris/tessdata}"
    test -s "$tessdata_dir/eng.traineddata"
    test -s "$tessdata_dir/por.traineddata"
  '; then
    echo "O serviço $service iniciou sem os idiomas OCR obrigatórios do Audiveris."
    "${COMPOSE[@]}" logs --tail=100 "$service"
    exit 1
  fi
done

echo "==> Verificando storage compartilhado entre API e worker"
if ! storage_probe="$("${COMPOSE[@]}" exec -T api node -e '
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const { randomUUID } = require("node:crypto");
  const root = process.env.STORAGE_DIR || "/app/storage";
  const exportsDir = path.join(root, "exports");
  const mode = require("node:fs").constants.R_OK | require("node:fs").constants.W_OK | require("node:fs").constants.X_OK;
  (async () => {
    await fs.access(exportsDir, mode);
    const name = `.deploy-storage-probe-${randomUUID()}`;
    await fs.writeFile(path.join(exportsDir, name), "score-to-musicxml-storage-probe\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    process.stdout.write(name);
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
')"; then
  echo "A API não conseguiu criar a sonda de storage. Verifique STORAGE_DIR, permissões e o volume."
  exit 1
fi

if [[ ! "$storage_probe" =~ ^\.deploy-storage-probe-[a-z0-9-]+$ ]]; then
  echo "A API não conseguiu criar a sonda de storage. Verifique STORAGE_DIR, permissões e o volume."
  exit 1
fi

storage_shared=false
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T worker node -e '
    const fs = require("node:fs/promises");
    const path = require("node:path");
    const name = process.argv[1];
    if (!/^\.deploy-storage-probe-[a-z0-9-]+$/.test(name)) process.exit(2);
    const root = process.env.STORAGE_DIR || "/app/storage";
    fs.readFile(path.join(root, "exports", name), "utf8")
      .then((value) => { if (value !== "score-to-musicxml-storage-probe\n") process.exitCode = 1; })
      .catch((error) => { console.error(error.message); process.exitCode = 1; });
  ' "$storage_probe" >/dev/null 2>&1; then
    storage_shared=true
    break
  fi
  sleep 2
done

if [[ "$storage_shared" != "true" ]]; then
  echo "API e worker não compartilham o storage de exportações ou o worker não consegue lê-lo."
  echo "Logs do worker:"
  "${COMPOSE[@]}" logs --tail=100 worker
  exit 1
fi

cleanup_storage_probe
storage_probe=""
trap - EXIT

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
