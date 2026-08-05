# GitOps deployment

Argo CD continuously reconciles the registry, development and production applications in this directory. The
repository is public, so **never commit secrets**. Bootstrap secrets are created
on the cluster by `scripts/bootstrap-secrets.sh` and are intentionally excluded
from Git.

The registry must be synchronized and healthy before applying the fish-website
Argo application. The CI workflow publishes immutable `sha-<commit>` image
tags. Production tracks the dedicated `production` GitOps branch, while
development tracks `main`, so ordinary main-branch manifest changes cannot
drift into production.

`main` builds immutable images and updates only `deploy/fish-website-dev` on
`main`; Argo CD deploys it to `dev.frozenf1sh.top`. A manually-created `v*` tag
builds the tagged revision and, after protected GitHub `production` Environment
approval, advances only `deploy/fish-website/kustomization.yaml` on the
`production` branch. Create development namespace secrets with
`scripts/bootstrap-environment-secrets.sh`; it copies only the existing
bucket-scoped R2 and registry credentials through the Kubernetes API and creates
new database and application secrets.

Owner credentials use an Argon2id PHC hash in the `application` Secret. Before
enabling the `ADMIN_PASSWORD_HASH` workload variable on an existing namespace,
run `scripts/migrate-admin-password-hash.sh fish-website` (and the development
namespace equivalent). The script only adds `admin-password-hash`; after both
environments run the new image, remove the legacy `admin-password` key during a
separate rotation window.

`fish.frozenf1sh.top` is protected by Traefik and cert-manager. The Registry is
tailnet-only, so it uses a private CA rather than publicly-verifiable ACME. Its
CA must be trusted by every build host and k3s node. Registry authentication is
mandatory.

The `fish-website-platform` Argo CD Application owns only the CoreDNS override
needed for public `frozenf1sh.top` lookups from pods. It deliberately does not
grant website applications authority over `kube-system`.
