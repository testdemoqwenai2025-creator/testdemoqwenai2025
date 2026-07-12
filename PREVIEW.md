# Preview / Live Endpoint

## Live Application

**URL**: [https://preview-0df067ab-7eb2-4044-8d35-2c2c5ce3c169.space-z.ai/](https://preview-0df067ab-7eb2-4044-8d35-2c2c5ce3c169.space-z.ai/)

## How to Access

1. Click the link above, OR
2. If you're using the Z.ai web interface, use the **Preview Panel** on the right side and click "Open in New Tab"

## PWA Installation

The app is a Progressive Web App (PWA):
- **Desktop**: Click the install icon in the address bar, or browser menu → "Install app"
- **Mobile**: Browser menu → "Add to Home Screen" / "Install app"
- Once installed, it works offline with cached data

## Ports (internal)

| Service | Port | Purpose |
|---------|------|---------|
| Next.js dev server | 3000 | Main app |
| Caddy gateway | 81 | Reverse proxy (external access) |
| Price-feed WebSocket | 3003 | Real-time price simulation |

## Troubleshooting

If the preview URL returns 404:
1. Wait 2-3 minutes for the gateway to detect the running container
2. Click the **restart button** in the top-right corner of the Z.ai interface
3. The app IS running — verify by checking `http://localhost:3000` or `http://localhost:81` internally
