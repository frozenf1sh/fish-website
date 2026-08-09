#!/usr/bin/env bash
set -euo pipefail

# Run from a trusted administrator shell after the platform applications are Ready.
# Values are generated locally and sent directly to the Kubernetes API; none are
# written to this repository. GHCR publishing uses the workflow GITHUB_TOKEN.

need() { command -v "$1" >/dev/null || { echo "missing required command: $1" >&2; exit 1; }; }
need kubectl
need openssl
need go

# PostgreSQL DSN is a URL. Hex avoids reserved URL characters and keeps the
# generated password safe to embed without leaking it through shell escaping.
postgres_password=$(openssl rand -hex 32)
minio_password=$(openssl rand -base64 32 | tr -d '\n')
admin_password=$(openssl rand -base64 32 | tr -d '\n')
admin_password_hash=$(printf %s "$admin_password" | go run ./cmd/passwordhash)
jwt_secret=$(openssl rand -hex 48)
github_token=${GITHUB_TOKEN:-}

kubectl create namespace fish-website --dry-run=client -o yaml | kubectl apply -f -

kubectl -n fish-website create secret generic database \
  --from-literal=username=fish \
  --from-literal=password="$postgres_password" \
  --from-literal=dsn="postgres://fish:${postgres_password}@postgres:5432/fish_website?sslmode=disable" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n fish-website create secret generic minio \
  --from-literal=username=fishminio \
  --from-literal=password="$minio_password" \
  --dry-run=client -o yaml | kubectl apply -f -
application_secret_args=(
  --from-literal=admin-password-hash="$admin_password_hash"
  --from-literal=jwt-secret="$jwt_secret"
)
if [ -n "$github_token" ]; then
  application_secret_args+=(--from-literal=github-token="$github_token")
fi
kubectl -n fish-website create secret generic application "${application_secret_args[@]}" \
  --dry-run=client -o yaml | kubectl apply -f -
