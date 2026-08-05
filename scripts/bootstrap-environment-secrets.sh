#!/usr/bin/env bash
set -euo pipefail

# Creates the development-only secret set without ever serializing values to
# this repository. Run it from a trusted administrator shell after the R2 and
# registry secrets exist in the production namespace.

need() { command -v "$1" >/dev/null || { echo "missing required command: $1" >&2; exit 1; }; }
need kubectl
need jq
need openssl
need go

source_namespace=fish-website
target_namespace=fish-website-dev

kubectl create namespace "$target_namespace" --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# The registry pull credential and bucket-scoped R2 credential are copied only
# inside the authenticated Kubernetes API stream. Their decoded values are
# never printed or stored on disk.
for secret_name in registry-credentials r2; do
  kubectl -n "$source_namespace" get secret "$secret_name" -o json \
    | jq --arg namespace "$target_namespace" '
        del(.metadata.uid, .metadata.resourceVersion, .metadata.creationTimestamp, .metadata.managedFields, .metadata.ownerReferences)
        | .metadata.namespace = $namespace
      ' \
    | kubectl apply -f - >/dev/null
done

postgres_password=$(openssl rand -hex 32)
minio_password=$(openssl rand -base64 32 | tr -d '\n')
admin_password=$(openssl rand -base64 32 | tr -d '\n')
admin_password_hash=$(printf %s "$admin_password" | go run ./cmd/passwordhash)
jwt_secret=$(openssl rand -hex 48)

kubectl -n "$target_namespace" create secret generic database \
  --from-literal=username=fish \
  --from-literal=password="$postgres_password" \
  --from-literal=dsn="postgres://fish:${postgres_password}@postgres:5432/fish_website?sslmode=disable" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "$target_namespace" create secret generic minio \
  --from-literal=username=fishminio \
  --from-literal=password="$minio_password" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "$target_namespace" create secret generic application \
  --from-literal=admin-password-hash="$admin_password_hash" \
  --from-literal=jwt-secret="$jwt_secret" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

echo "Development secret set created in ${target_namespace}."
