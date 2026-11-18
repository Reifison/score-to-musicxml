#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Uso: bash scripts/install-ios-device-release.sh <caminho-do-app> <udid-do-iphone> <build-esperado>" >&2
  exit 2
fi

app=$1
device=$2
expected_build=$3

if [[ ! -s "$app/main.jsbundle" || -e "$app/EXDevLauncher.bundle" ]] || compgen -G "$app/*.debug.dylib" >/dev/null; then
  echo "Instalação bloqueada. Use um pacote Release com o app incluído." >&2
  exit 1
fi

bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")
build=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Info.plist")
if [[ "$bundle_id" != com.scoretomusicxml.app || "$build" != "$expected_build" ]]; then
  echo "Instalação bloqueada. O pacote não corresponde ao app ou build esperado." >&2
  exit 1
fi

codesign --verify --deep --strict "$app"
xcrun devicectl device install app --device "$device" --timeout 65 "$app"
xcrun devicectl device info apps --device "$device" --bundle-id "$bundle_id" --timeout 12
