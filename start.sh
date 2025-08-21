#!/bin/bash

# 播客生成 Demo 启动脚本
echo "🎙️ VIVID VOICE 播客生成 Demo 启动中..."

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js 18.0 或更高版本"
    echo "安装命令: brew install node"
    exit 1
fi

# 检查 FFmpeg 是否安装
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ 错误: 未找到 FFmpeg，请先安装 FFmpeg"
    echo "安装命令: brew install ffmpeg"
    exit 1
fi

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "📦 安装项目依赖..."
    npm install
fi

# 检查环境变量
if [ -z "$MINIMAX_API_KEY" ]; then
    echo "⚠️  警告: 未设置 MINIMAX_API_KEY 环境变量"
    echo "请设置你的 Minimax API 密钥:"
    echo "export MINIMAX_API_KEY='你的API密钥'"
    echo "export GROUP_ID='你的Group ID'"
    echo ""
    echo "或者直接在当前终端设置后重新运行此脚本"
fi

# 创建必要的目录
mkdir -p uploads
mkdir -p outputs

echo "🚀 启动服务器..."
echo "📱 前端界面: 打开 demo.html 文件"
echo "🌐 服务器地址: http://localhost:3000"
echo ""

# 启动服务器
node integrated_server.js
