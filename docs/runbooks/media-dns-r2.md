# Media DNS and R2 runbook

## Purpose

The website serves media from `media.frozenf1sh.top` and uploads directly to
Cloudflare R2 using short-lived S3 presigned URLs. This document records the
DNS boundary between the authoritative DNS provider and Cloudflare so that a
future DNS change does not silently break public media or browser uploads.

## Current topology

| Hostname | Authoritative DNS path | Traffic destination |
| --- | --- | --- |
| `frozenf1sh.top` | Alibaba Cloud DNS | K3s ingress |
| `dev.frozenf1sh.top` | Alibaba Cloud DNS | K3s ingress |
| `media.frozenf1sh.top` | NS-delegated from Alibaba Cloud DNS to Cloudflare | R2 custom domain |

The Alibaba Cloud zone contains two `NS` records for host `media`:

```text
media  NS  aragorn.ns.cloudflare.com.
media  NS  mckinley.ns.cloudflare.com.
```

This is a deliberately narrow delegation. Do not replace the parent zone's
nameservers merely to make R2 work: doing so would change the authority for
the website, development environment, tunnels, and every other hostname.

## Browser CORS policy

The R2 bucket must allow only these origins:

```text
https://frozenf1sh.top
https://dev.frozenf1sh.top
http://localhost:5173
```

Allowed methods are `GET`, `HEAD`, and `PUT`; the allowed request header is
`Content-Type`; `ETag` is exposed; preflight cache duration is 3600 seconds.

`fish.frozenf1sh.top` is a retired compatibility hostname. It must not be
reintroduced into application or bucket CORS configuration without an
explicit compatibility decision and an owning deployment.

## Safe verification

Run these checks from the deployment cluster, not only from a local machine
using a fake-IP proxy:

```sh
nslookup -type=A media.frozenf1sh.top 1.1.1.1

curl -sS -D - -o /dev/null -X OPTIONS \
  https://media.frozenf1sh.top/__cors_probe__ \
  -H 'Origin: https://dev.frozenf1sh.top' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: Content-Type'
```

The preflight must return `204`,
`Access-Control-Allow-Origin: https://dev.frozenf1sh.top`, and allow `PUT`.
Do not place R2 keys, S3 access keys, or presigned URLs in shell history,
Git, CI logs, tickets, or this runbook.

## Change procedure

1. Read the existing R2 custom-domain status and CORS policy.
2. Make the smallest DNS or CORS change necessary, then wait for authoritative
   and recursive DNS agreement.
3. Verify TLS and the CORS preflight from the cluster.
4. Verify a real authenticated upload in the development environment before a
   production promotion.
5. Record the change in Git when application configuration changes. Store only
   non-sensitive configuration in Git; credentials remain in Kubernetes
   Secrets managed outside this repository.

