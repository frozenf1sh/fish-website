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

`main` builds and publishes images, then advances
`deploy/fish-website-dev/kustomization.yaml` to the new immutable image tag so
Argo CD deploys development automatically. A manually-created `v*` tag builds
the release image and, after protected GitHub `production` Environment approval, advances only
`deploy/fish-website/kustomization.yaml` on the `production` branch. Create
development namespace secrets with `scripts/bootstrap-environment-secrets.sh`;
it copies only the existing bucket-scoped R2 and GHCR pull credentials through
the Kubernetes API and creates new database and application secrets.

Owner credentials use an Argon2id PHC hash in the `application` Secret. For an
existing namespace, run `scripts/migrate-admin-password-hash.sh fish-website`
(and the development namespace equivalent) to enter and confirm a new password
without putting it in shell history. The script validates the password policy,
writes only `admin-password-hash`, and removes the legacy `admin-password` key.
The policy requires 16–128 Unicode characters, rejects control characters, and
does not impose brittle character-class rules; the login path enforces the same
policy before running Argon2id.

The approved production release serves `frozenf1sh.top`; its certificate is
issued by cert-manager through Traefik. Do not remove the current `it-tools`
Ingress until the promoted website rollout and certificate are healthy.

The production and development Ingresses permanently redirect HTTP to HTTPS,
attach security response headers, and keep Connect reflection disabled. The
development host is still intended for controlled testing; it must not be
treated as a public debugging endpoint.

The `fish-website-platform` Argo CD Application owns only the CoreDNS override
needed for public `frozenf1sh.top` lookups from pods. It deliberately does not
grant website applications authority over `kube-system`.
