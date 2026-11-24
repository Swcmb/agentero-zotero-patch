#!/usr/bin/env bash
# 项目内 Node 24 入口。所有 npm/node 调用统一走这里，避免 PATH 上的 v22。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT/.node24/runtime/node.exe" "$@"
