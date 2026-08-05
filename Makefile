.DEFAULT_GOAL := verify

.PHONY: generate generate-check lint test build verify web-install web-lint web-build kustomize

generate:
	buf generate

generate-check: generate
	git diff --exit-code -- gen frontend/src/gen

lint:
	buf lint

test:
	go test ./cmd/... ./internal/... ./pkg/... ./db/... ./gen/...

web-install:
	npm --prefix frontend ci

web-lint:
	npm --prefix frontend run lint

web-build:
	npm --prefix frontend run build

kustomize:
	kubectl kustomize deploy/fish-website >/dev/null
	kubectl kustomize deploy/fish-website-dev >/dev/null
	kubectl kustomize deploy/registry >/dev/null

build: web-build
	go build ./cmd/...

verify: generate-check lint test web-lint build kustomize
