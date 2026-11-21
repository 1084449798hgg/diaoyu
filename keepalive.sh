#!/usr/bin/env bash
# 隧道/后端保活：只依据本地端口与进程存活判断，避免因公网网络抖动误判而频繁换链接。
URL_FILE="/workspace/fishing-app/current-url.txt"
TM_LOG="/tmp/tm.log"

restart_backend() {
  echo "[keepalive] $(date '+%F %T') 后端 3000 无响应，重启后端..." >> /tmp/keepalive.log
  cd /workspace/fishing-app/backend
  setsid nohup node src/index.js > /tmp/fishing-app.log 2>&1 < /dev/null &
}

restart_tunnel() {
  echo "[keepalive] $(date '+%F %T') 隧道进程不在，重建隧道..." >> /tmp/keepalive.log
  rm -f "$TM_LOG"
  cd /workspace/fishing-app
  setsid nohup npx -y tunnelmole 3000 > "$TM_LOG" 2>&1 < /dev/null &
  local new=""
  for i in $(seq 1 30); do
    new="$(grep -oE 'https://[a-zA-Z0-9.-]+\.tunnelmole\.net' "$TM_LOG" 2>/dev/null | head -1)"
    [ -n "$new" ] && break
    sleep 2
  done
  if [ -n "$new" ]; then
    printf '%s' "$new" > "$URL_FILE"
    echo "[keepalive] $(date '+%F %T') 新链接: $new" >> /tmp/keepalive.log
  fi
}

while true; do
  # 后端：以本地端口为准，连续 3 次探测失败才重启
  if ! curl -s -o /dev/null --max-time 5 http://127.0.0.1:3000/; then
    backend_fail=$(( ${backend_fail:-0} + 1 ))
    [ "$backend_fail" -ge 3 ] && { restart_backend; backend_fail=0; }
  else
    backend_fail=0
  fi

  # 隧道：以进程是否存在为准
  if ! pgrep -f "[t]unnelmole" >/dev/null 2>&1; then
    restart_tunnel
  fi

  sleep 20
done
