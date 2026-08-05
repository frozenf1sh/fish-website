#!/usr/bin/env bash
set -euo pipefail

# Adds a one-way Argon2id password hash to an existing application Secret.
# It never prints the old password, derived hash, or Secret manifest.

need() { command -v "$1" >/dev/null || { echo "missing required command: $1" >&2; exit 1; }; }
need kubectl
need go
need jq

namespace=${1:?usage: scripts/migrate-admin-password-hash.sh <fish-website|fish-website-dev>}
case "$namespace" in
  fish-website|fish-website-dev) ;;
  *) echo "unsupported namespace: $namespace" >&2; exit 1 ;;
esac

password_hash=$(kubectl -n "$namespace" get secret application -o jsonpath='{.data.admin-password}' \
  | base64 --decode \
  | go run ./cmd/passwordhash)

jq -n --arg hash "$password_hash" '{stringData:{"admin-password-hash":$hash}}' \
  | kubectl -n "$namespace" patch secret application --type merge --patch-file /dev/stdin >/dev/null

echo "Argon2id password hash added to application Secret in ${namespace}."
