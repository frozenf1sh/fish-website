#!/usr/bin/env bash
set -euo pipefail

# Run from a trusted administrator shell after the Registry Application is Ready.
# Values are generated locally and sent directly to the Kubernetes API; none are
# written to this repository. Save the printed registry password in a password
# manager, then set it as GitHub Actions REGISTRY_PASSWORD.

need() { command -v "$1" >/dev/null || { echo "missing required command: $1" >&2; exit 1; }; }
need kubectl
need openssl
need htpasswd

registry_user=ci
registry_password=$(openssl rand -base64 32 | tr -d '\n')
postgres_password=$(openssl rand -base64 32 | tr -d '\n')
minio_password=$(openssl rand -base64 32 | tr -d '\n')
admin_password=$(openssl rand -base64 32 | tr -d '\n')
jwt_secret=$(openssl rand -hex 48)

kubectl create namespace registry --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace fish-website --dry-run=client -o yaml | kubectl apply -f -

htpasswd -Bbn "$registry_user" "$registry_password" | kubectl -n registry create secret generic registry-auth --from-file=htpasswd=/dev/stdin --dry-run=client -o yaml | kubectl apply -f -
kubectl -n fish-website create secret generic database \
  --from-literal=username=fish \
  --from-literal=password="$postgres_password" \
  --from-literal=dsn="postgres://fish:${postgres_password}@postgres:5432/fish_website?sslmode=disable" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n fish-website create secret generic minio \
  --from-literal=username=fishminio \
  --from-literal=password="$minio_password" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n fish-website create secret generic application \
  --from-literal=admin-password="$admin_password" \
  --from-literal=jwt-secret="$jwt_secret" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Registry username: ${registry_user}"
echo "Registry password (store it now; it will not be shown again): ${registry_password}"
echo "Next: gh secret set REGISTRY_USERNAME --repo frozenf1sh/fish-website --body ${registry_user}"
echo "Then: printf %s '<registry-password>' | gh secret set REGISTRY_PASSWORD --repo frozenf1sh/fish-website"
