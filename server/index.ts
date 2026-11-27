/**
 * Marion Mystery server: one Node process serves the built client (dist/)
 * and the authoritative WebSocket game server at /mystery. LAN-friendly:
 * a Mac on Wi-Fi can host and phones join by room code or QR.
 *
 *   npm run server          # dev (tsx), port 8787
 *   npm run start:server    # after `npm run build`
 *
 * Env: PORT, HOST, MYSTERY_AGENT_TOKEN, ANTHROPIC_API_KEY (optional bot
 * chat), MYSTERY_LLM_MODEL, MYSTERY_STATIC (dist dir).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { GameServer, TICK_HZ } from '../src/mystery/server/room';
import { createLlmChat } from './llm';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const STATIC = resolve(process.env.MYSTERY_STATIC ?? join(process.cwd(), 'dist'));

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export function startServer(port = PORT, host = HOST) {
  const game = new GameServer({
    agentToken: process.env.MYSTERY_AGENT_TOKEN || undefined,
    chatProvider: createLlmChat() ?? undefined,
    lan: true,
    name: 'Marion Mystery',
  });

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: game.roomCount }));
      return;
    }
    if (url.pathname === '/api/info') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ name: 'Marion Mystery', lan: lanAddresses(), port, ws: '/mystery' }));
      return;
    }
    // Static files with SPA fallback.
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(STATIC, path);
    if (!file.startsWith(STATIC)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      path = '/index.html';
      file = join(STATIC, path);
    }
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Marion Mystery server is running. Build the client with `npm run build` to serve it here.');
      return;
    }
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'content-type': type, 'cache-control': cache });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server: http, path: '/mystery', maxPayload: 32 * 1024 });
  let seq = 0;
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const id = `c${++seq}`;
    const addr = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '';
    game.connect({
      id,
      addr,
      send: (m) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
      },
      close: () => ws.close(),
    });
    let alive = true;
    ws.on('pong', () => (alive = true));
    const hb = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 15000);
    ws.on('message', (data) => game.receive(id, data.toString()));
    ws.on('close', () => {
      clearInterval(hb);
      game.disconnect(id);
    });
    ws.on('error', () => ws.close());
  });

  // Fixed-rate simulation loop (dt measured, clamped).
  let last = performance.now();
  const loop = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.update(dt);
  }, 1000 / TICK_HZ);

  http.listen(port, host, () => {
    const lan = lanAddresses();
    console.log(`\n  Marion Mystery server on http://localhost:${port}`);
    for (const a of lan) console.log(`  LAN: http://${a}:${port}   (phones on the same Wi-Fi can open this)`);
    console.log(`  WebSocket: ws://<host>:${port}/mystery\n`);
  });

  return {
    game,
    http,
    close: () =>
      new Promise<void>((r) => {
        clearInterval(loop);
        wss.close();
        http.close(() => r());
      }),
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]).replace(/\.[jt]s$/, '') === resolve(join(process.cwd(), 'server/index')).replace(/\.[jt]s$/, '');
if (isMain || process.env.MYSTERY_AUTOSTART === '1') startServer();
