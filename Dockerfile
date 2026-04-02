# 第一阶段：构建
FROM golang:1.25-alpine AS builder

WORKDIR /app

# 安装必要的工具
RUN apk add --no-cache git ca-certificates tzdata

# 复制 go module 文件
COPY go.mod go.sum ./

# 下载依赖
RUN go env -w GOPROXY=https://goproxy.cn,direct
RUN go mod tidy

# 复制源代码
COPY . .

# 构建应用
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# 第二阶段：生产镜像
FROM alpine:latest

WORKDIR /app

# 安装 ca-certificates
RUN apk add --no-cache ca-certificates tzdata

# 从构建阶段复制二进制文件和 schema
COPY --from=builder /app/server .
COPY --from=builder /app/internal/repository/schema.sql .

# 暴露端口
EXPOSE 8080

# 运行应用
CMD ["/app/server"]
