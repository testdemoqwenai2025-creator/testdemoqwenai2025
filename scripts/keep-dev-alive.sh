#!/bin/bash
# Keep dev server alive — restart if it dies
while true; do
  if ! pgrep -f "next-server" > /dev/null; then
    cd /home/z/my-project
    nohup bun run dev > /tmp/dev.log 2>&1 &
    echo "$(date): restarted dev server (PID $!)" >> /tmp/watchdog.log
    sleep 8
  fi
  sleep 5
done
