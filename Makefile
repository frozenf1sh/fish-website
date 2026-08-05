.DEFAULT_GOAL := verify

.PHONY: generate lint test build verify web-install web-lint web-build kustomize

generate:
	buf generate

lint:
	buf lint

test:
	go test ./...

web-install:
	npm --prefix frontend ci

web-lint:
	npm --prefix frontend run lint

web-build:
	npm --prefix frontend run build

kustomize:
	kubectl kustomize deploy/fish-website >/dev/null
	kubectl kustomize deploy/registry >/dev/null

build: web-build
	go build ./cmd/server

verify: generate lint test web-lint build kustomize
