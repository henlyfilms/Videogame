# Hosting Marion Mystery

One Node process serves the built web client **and** the authoritative WebSocket game server.

## LAN party (a Mac on Wi-Fi, iPhones join)

```bash
npm install
npm run build          # build the web client into dist/
npm run start:server   # serves http://0.0.0.0:8787 + ws://…/mystery
```

The console prints your LAN address, e.g. `LAN: http://192.168.1.20:8787`. On each iPhone (same Wi-Fi), open that address — or scan the room's **QR code** in the waiting room (Invite → QR), which opens `/?mystery&room=CODE` and drops you straight into the room. Tap Share → *Add to Home Screen* for a full-screen app (PWA).

macOS may ask to allow incoming connections for `node` — allow it. If iPhones can't connect, check both devices are on the same network (no guest Wi-Fi isolation).

## Development

```bash
npm run dev     # Vite on :5173 (the client auto-connects to :8787 on the same host)
npm run server  # game server on :8787 (tsx, restarts manually)
```

Solo **Quick Play** runs the whole server inside the browser, so it works with no server and offline.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | HTTP + WebSocket port |
| `HOST` | `0.0.0.0` | Bind address |
| `MYSTERY_STATIC` | `./dist` | Built client directory |
| `MYSTERY_AGENT_TOKEN` | unset | If set, external agents must present it |
| `ANTHROPIC_API_KEY` | unset | Optional: LLM meeting chat for built-in Marion bots (server-side only) |
| `MYSTERY_LLM_MODEL` | `claude-haiku-5-5` | Model for that chat |

## Docker

```bash
docker build -t marion-mystery .
docker run -p 8787:8787 marion-mystery
```

## Internet hosting (example: Fly.io)

```bash
fly launch --no-deploy        # detects the Dockerfile; set internal_port = 8787
fly deploy
```

Fly terminates TLS, so clients use `wss://<app>.fly.dev/mystery` automatically (the client derives the WebSocket URL from the page URL). Render.com works the same way (Docker web service, port 8787, health check `/healthz`). Rooms live in memory: one instance per region; restarting the process ends matches in progress.

## Endpoints

- `GET /healthz` → `{ ok, rooms }`
- `GET /api/info` → `{ name, lan: [addresses], port, ws }`
- `WS /mystery` → game protocol (see [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md))

## Limits & safety

Per-connection rate limit (60 msg/s sustained), 32 KB max frame, every message schema-checked, every action validated server-side, names/chat sanitised, host kick/ban, 60 s reconnect grace (same seat and role), host migration when the host leaves.
