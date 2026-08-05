# 第一阶段：构建
FROM golang:1.25.3-alpine3.22 AS builder

WORKDIR /app

# 安装必要的工具
RUN apk add --no-cache git ca-certificates tzdata

# 复制 go module 文件
COPY go.mod go.sum ./

# 下载依赖。构建过程不应重写 go.mod/go.sum。
RUN go mod download

# 复制源代码
COPY . .

# 构建应用
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server \
    && CGO_ENABLED=0 GOOS=linux go build -o recycle-bin-purge ./cmd/recycle-bin-purge

# 第二阶段：生产镜像
FROM alpine:3.22

WORKDIR /app

# 安装 ca-certificates
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S -g 65532 app \
    && adduser -S -D -H -u 65532 -G app app

# 从构建阶段复制二进制文件。schema 已通过 go:embed 编入二进制。
COPY --from=builder --chown=65532:65532 /app/server /app/server
COPY --from=builder --chown=65532:65532 /app/recycle-bin-purge /app/recycle-bin-purge

# 暴露端口
EXPOSE 8080

# 运行应用
USER 65532:65532
CMD ["/app/server"]
