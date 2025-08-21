FROM node:18-alpine

# 安装 FFmpeg
RUN apk add --no-cache ffmpeg

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制源代码
COPY . .

# 创建必要的目录
RUN mkdir -p uploads outputs

# 设置权限
RUN chmod +x start.sh

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 启动命令
CMD ["node", "integrated_server.js"]
