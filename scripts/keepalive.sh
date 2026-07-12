#!/bin/bash
# Keep dev server and price-feed alive
while true; do
  # Check dev server
  if ! curl -s --max-time 2 http://localhost:3000/api/years > /dev/null 2>&1; then
    cd /home/z/my-project
    nohup setsid bash .zscripts/dev.sh > /tmp/dev-keepalive.log 2>&1 < /dev/null &
    echo "$(date): restarted dev server" >> /tmp/keepalive.log
    sleep 15
  fi
  # Check price-feed
  if ! pgrep -f "price-feed/index.ts" > /dev/null 2>&1; then
    cd /home/z/my-project/mini-services/price-feed
    nohup setsid bun run dev > /tmp/price-feed-keepalive.log 2>&1 < /dev/null &
    echo "$(date): restarted price-feed" >> /tmp/keepalive.log
    sleep 3
  fi
  sleep 10
done
