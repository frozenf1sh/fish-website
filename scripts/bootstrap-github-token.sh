#!/usr/bin/env bash
set -euo pipefail

# Stores the GitHub API token in the existing application Secret for both
# production and development. The token is read interactively and is never
# written to this repository or passed as a kubectl command-line argument.

need() { command -v "$1" >/dev/null || {
  echo "missing required command: $1" >&2
  exit 1
}; }
need kubectl
need base64

kubeconfig_path="${KUBECONFIG:-${HOME}/.kube/config-tc.yaml}"
if [ ! -f "$kubeconfig_path" ]; then
  echo "kubeconfig not found: $kubeconfig_path" >&2
  echo "Set KUBECONFIG to override the default config-tc path." >&2
  exit 1
fi

kubectl_args=(--kubeconfig "$kubeconfig_path")
context=$(
  kubectl "${kubectl_args[@]}" config current-context
)
echo "Using kubeconfig: $kubeconfig_path"
echo "Using context: $context"

read -r -s -p "GitHub fine-grained token: " github_token
printf '\n'
if [ -z "$github_token" ]; then
  echo "GitHub token cannot be empty." >&2
  exit 1
fi

umask 077
patch_file=$(mktemp)
cleanup() {
  rm -f "$patch_file"
  unset github_token token_b64 patch_file
}
trap cleanup EXIT

token_b64=$(printf '%s' "$github_token" | base64 | tr -d '\n')
printf '{"data":{"github-token":"%s"}}\n' "$token_b64" >"$patch_file"

namespaces=(fish-website fish-website-dev)
for namespace in "${namespaces[@]}"; do
  echo "Updating application Secret in $namespace..."
  kubectl "${kubectl_args[@]}" -n "$namespace" get secret application >/dev/null
  kubectl "${kubectl_args[@]}" -n "$namespace" patch secret application \
    --type=merge \
    --patch-file="$patch_file" >/dev/null
done

for namespace in "${namespaces[@]}"; do
  echo "Restarting backend in $namespace..."
  kubectl "${kubectl_args[@]}" -n "$namespace" rollout restart deployment/backend >/dev/null
done

for namespace in "${namespaces[@]}"; do
  echo "Waiting for backend rollout in $namespace..."
  kubectl "${kubectl_args[@]}" -n "$namespace" rollout status deployment/backend --timeout=120s
done

echo "GitHub token configured successfully for production and development."
