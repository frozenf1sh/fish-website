# 第一阶段：构建
FROM node:24-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖（使用 npm install 代替 npm ci）
RUN npm config set registry https://registry.npmmirror.com
RUN npm install

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 第二阶段：生产镜像
FROM nginx:alpine

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/nginx.conf

# 从构建阶段复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
