#!/bin/bash

# 播客生成 Demo 快速部署脚本
echo "🎙️ VIVID VOICE 播客生成 Demo 快速部署"

# 检查操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "✅ 检测到 macOS 系统"
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "✅ 检测到 Linux 系统"
    OS="linux"
else
    echo "❌ 不支持的操作系统: $OSTYPE"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未找到 Node.js，正在安装..."
    if [[ "$OS" == "macos" ]]; then
        brew install node
    else
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
fi

# 检查 FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ 未找到 FFmpeg，正在安装..."
    if [[ "$OS" == "macos" ]]; then
        brew install ffmpeg
    else
        sudo apt update
        sudo apt install ffmpeg -y
    fi
fi

# 检查 Docker（可选）
if command -v docker &> /dev/null; then
    echo "✅ 检测到 Docker，可以使用容器化部署"
    DOCKER_AVAILABLE=true
else
    echo "⚠️  未检测到 Docker，将使用本地部署"
    DOCKER_AVAILABLE=false
fi

# 安装依赖
echo "📦 安装项目依赖..."
npm install

# 创建必要的目录
echo "📁 创建必要的目录..."
mkdir -p uploads outputs

# 设置权限
echo "🔐 设置文件权限..."
chmod +x start.sh
chmod 755 uploads/
chmod 755 outputs/

# 配置环境变量
if [ ! -f ".env" ]; then
    echo "⚙️  配置环境变量..."
    cp env.example .env
    echo "请编辑 .env 文件，填入你的 API 密钥"
    echo "然后运行: ./start.sh"
else
    echo "✅ 环境变量文件已存在"
fi

# 显示部署选项
echo ""
echo "🚀 部署选项："
echo "1. 本地部署 (推荐新手)"
echo "   ./start.sh"
echo ""
echo "2. Docker 部署 (推荐生产)"
if [ "$DOCKER_AVAILABLE" = true ]; then
    echo "   docker-compose up -d"
else
    echo "   (需要先安装 Docker)"
fi
echo ""
echo "3. Vercel 部署 (推荐演示)"
echo "   vercel --prod"
echo ""

# 检查是否可以直接启动
if [ -f ".env" ]; then
    echo "是否现在启动本地服务器？(y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo "🚀 启动服务器..."
        ./start.sh
    else
        echo "✅ 部署准备完成！"
        echo "运行 ./start.sh 启动服务器"
    fi
else
    echo "⚠️  请先配置 .env 文件中的 API 密钥"
    echo "然后运行: ./start.sh"
fi
