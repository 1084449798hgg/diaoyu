#!/usr/bin/env bash
# 鱼情预报 App 一键启动脚本
set -e
cd "$(dirname "$0")"

echo "==> 启动 MySQL / Redis"
service mysql start 2>/dev/null || true
redis-server --daemonize yes 2>/dev/null || true

echo "==> 初始化数据库"
mysql -e "CREATE DATABASE IF NOT EXISTS fishing_app DEFAULT CHARACTER SET utf8mb4;
          CREATE USER IF NOT EXISTS 'fishing'@'localhost' IDENTIFIED WITH mysql_native_password BY 'fishing123';
          GRANT ALL PRIVILEGES ON fishing_app.* TO 'fishing'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null

echo "==> 安装依赖"
[ -d backend/node_modules ] || (cd backend && npm install --no-audit --no-fund)
[ -d frontend/node_modules ] || (cd frontend && npm install --no-audit --no-fund)

echo "==> 导入 Schema 与演示数据"
(cd backend && node src/db/seed.js)

echo "==> 构建前端"
(cd frontend && npm run build)

echo "==> 启动服务（:3000，API 与 App 同源）"
fuser -k 3000/tcp 2>/dev/null || true
sleep 1
(cd backend && nohup node src/index.js > /tmp/fishing-app.log 2>&1 &)
sleep 2
echo ""
echo "启动完成：http://localhost:3000"
echo "演示账号：13800138000 / 验证码 123456"
