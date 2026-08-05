# GitOps deployment

Argo CD continuously reconciles the two applications in this directory. The
repository is public, so **never commit secrets**. Bootstrap secrets are created
on the cluster by `scripts/bootstrap-secrets.sh` and are intentionally excluded
from Git.

The registry must be synchronized and healthy before applying the fish-website
Argo application. The CI workflow then publishes immutable `sha-<commit>` image
tags and commits the desired tag to `deploy/fish-website/kustomization.yaml`.

`registry.frozenf1sh.top` and `fish.frozenf1sh.top` are protected by TLS through
Traefik and cert-manager. Registry authentication is mandatory.
