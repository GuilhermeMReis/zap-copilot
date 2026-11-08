#!/usr/bin/env bash
# Gera dist/zap-copilot-<versão>.zip pronto para instalar ou publicar na Chrome Web Store.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
mkdir -p dist
OUT="dist/zap-copilot-${VERSION}.zip"
rm -f "$OUT"
zip -rq "$OUT" manifest.json src icons -x '*.DS_Store'
echo "Pacote gerado: $OUT"
