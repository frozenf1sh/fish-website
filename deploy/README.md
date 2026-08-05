# GitOps deployment

Argo CD continuously reconciles the two applications in this directory. The
repository is public, so **never commit secrets**. Bootstrap secrets are created
on the cluster by `scripts/bootstrap-secrets.sh` and are intentionally excluded
from Git.

The registry must be synchronized and healthy before applying the fish-website
Argo application. The CI workflow then publishes immutable `sha-<commit>` image
tags and commits the desired tag to `deploy/fish-website/kustomization.yaml`.

`fish.frozenf1sh.top` is protected by Traefik and cert-manager. The Registry is
tailnet-only, so it uses a private CA rather than publicly-verifiable ACME. Its
CA must be trusted by every build host and k3s node. Registry authentication is
mandatory.
