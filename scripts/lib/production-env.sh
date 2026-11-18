#!/usr/bin/env bash

# Read KEY=value data without executing it. Quoted values are literal too.
# Keep private keys on one line with escaped \n, or use a private-key path.
load_production_env() {
  local env_path="$1" env_line env_key env_value env_quote env_line_number=0
  while IFS= read -r env_line || [[ -n "$env_line" ]]; do
    env_line_number=$((env_line_number + 1))
    env_line="${env_line%$'\r'}"
    [[ "$env_line" =~ ^[[:space:]]*($|\#) ]] && continue
    if [[ ! "$env_line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      echo "Linha de ambiente inválida: $env_line_number" >&2
      return 1
    fi
    env_key="${BASH_REMATCH[1]}"
    env_value="${BASH_REMATCH[2]}"
    if [[ "$env_value" == \"* || "$env_value" == \'* ]]; then
      env_quote="${env_value:0:1}"
      if (( ${#env_value} < 2 )) || [[ "${env_value: -1}" != "$env_quote" ]]; then
        echo "Aspas incompletas na linha $env_line_number." >&2
        return 1
      fi
      env_value="${env_value:1:${#env_value}-2}"
    fi
    # Disallow shell commands and references rather than accepting config which
    # would mean something different to a later shell/Compose consumer.
    if [[ "$env_value" == *'$('* || "$env_value" == *'`'* || "$env_value" == *';'* ]]; then
      echo "Sintaxe executável na linha $env_line_number." >&2
      return 1
    fi
    # Do not let a data file overwrite shell/runtime controls.
    case "$env_key" in
      PATH|HOME|SHELL|BASH*|ENV|IFS|CDPATH|LD_*|DYLD_*|CODEX_HOME)
        echo "Variável de controle não permitida: $env_key" >&2
        return 1 ;;
    esac
    export "$env_key=$env_value"
  done < "$env_path"
}

resolve_public_domains() {
  export PUBLIC_DOMAINS="$WEB_DOMAIN"
  if [[ "$API_DOMAIN" != "$WEB_DOMAIN" ]]; then
    PUBLIC_DOMAINS="$PUBLIC_DOMAINS $API_DOMAIN"
  fi
}
