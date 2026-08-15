#!/usr/bin/env bash
set -euo pipefail

# Rotates the owner password in an existing application Secret.
# It never prints the password, derived hash, or Secret manifest.

need() { command -v "$1" >/dev/null || { echo "missing required command: $1" >&2; exit 1; }; }
need kubectl
need go
need jq

namespace=${1:?usage: scripts/migrate-admin-password-hash.sh <fish-website|fish-website-dev>}
case "$namespace" in
  fish-website|fish-website-dev) ;;
  *) echo "unsupported namespace: $namespace" >&2; exit 1 ;;
esac

read -r -s -p "Enter the new owner password (minimum 16 characters): " new_password
printf '\n' >&2
read -r -s -p "Confirm the new owner password: " confirmed_password
printf '\n' >&2
if [[ "$new_password" != "$confirmed_password" ]]; then
  echo "password confirmation did not match" >&2
  exit 1
fi

password_hash=$(printf %s "$new_password" | go run ./cmd/passwordhash)
unset new_password confirmed_password

jq -n --arg hash "$password_hash" '{stringData:{"admin-password-hash":$hash},data:{"admin-password":null}}' \
  | kubectl -n "$namespace" patch secret application --type merge --patch-file /dev/stdin >/dev/null
unset password_hash

echo "Argon2id password hash rotated and legacy plaintext key removed in ${namespace}."
