# GitOps deployment

Argo CD continuously reconciles the development and production applications in this directory. The
repository is public, so **never commit secrets**. Bootstrap secrets are created
on the cluster by `scripts/bootstrap-secrets.sh` and are intentionally excluded
from Git.

The CI workflow publishes GHCR images. Main builds use immutable short
`sha-<commit>` tags; version tags such as `v0.2.3` are the production release
tags. Production tracks the dedicated `production` GitOps branch, while
development tracks `main`, so ordinary main-branch manifest changes cannot
drift into production.

`main` builds and publishes images without creating deployment commits. A
manually-created `v*` tag builds the release image and, after protected GitHub
`production` Environment approval, advances only
`deploy/fish-website/kustomization.yaml` on the `production` branch. Create
development namespace secrets with `scripts/bootstrap-environment-secrets.sh`;
it copies only the existing bucket-scoped R2 and GHCR pull credentials through
the Kubernetes API and creates new database and application secrets.

Owner credentials use an Argon2id PHC hash in the `application` Secret. Before
enabling the `ADMIN_PASSWORD_HASH` workload variable on an existing namespace,
run `scripts/migrate-admin-password-hash.sh fish-website` (and the development
namespace equivalent). The script only adds `admin-password-hash`; after both
environments run the new image, remove the legacy `admin-password` key during a
separate rotation window.

The approved production release serves `frozenf1sh.top`; its certificate is
issued by cert-manager through Traefik. Do not remove the current `it-tools`
Ingress until the promoted website rollout and certificate are healthy.

The `fish-website-platform` Argo CD Application owns only the CoreDNS override
needed for public `frozenf1sh.top` lookups from pods. It deliberately does not
grant website applications authority over `kube-system`.
