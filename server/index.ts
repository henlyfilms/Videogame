/**
 * Marion Mystery server: one Node process serves the built client (dist/)
 * and the authoritative WebSocket game server at /mystery. LAN-friendly:
 * a Mac on Wi-Fi can host and phones join by room code or QR.
 *
 *   npm run server          # dev (tsx), port 8787
 *   npm run start:server    # after `npm run build`
 *
 * Also: the live agent status board (GET /api/agents, POST
 * /api/agents/status), the Marion HQ event stream (ws /marion, fed by agent
 * statuses and POST /api/hq/events) and the Marion Mystery MCP game controls
 * (Streamable HTTP at /mcp?agent=<id>; see docs/mystery/MCP.md).
 *
 * Env: PORT, HOST, MYSTERY_AGENT_TOKEN, ANTHROPIC_API_KEY (optional bot
 * chat), MYSTERY_LLM_MODEL, MYSTERY_STATIC (dist dir).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseMarionEvent, type MarionEvent } from '../src/adapters/events';
import { AgentHub, normalizeAgentId } from '../src/mystery/server/agentHub';
import { GameServer, TICK_HZ } from '../src/mystery/server/room';
import { HqBridge } from './hqBridge';
import { createLlmChat } from './llm';
import { bearer, McpHttp } from './mcp/http';

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

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

function readJson(req: IncomingMessage, max = 64 * 1024): Promise<unknown> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        resolve(undefined);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}

export function startServer(port = PORT, host = HOST) {
  const token = process.env.MYSTERY_AGENT_TOKEN || undefined;
  const hub = new AgentHub();
  const game = new GameServer({
    agentToken: token,
    chatProvider: createLlmChat() ?? undefined,
    lan: true,
    name: 'Marion Mystery',
    hub,
  });
  const mcp = new McpHttp({ game, token });

  // Marion HQ clients (the HQ "Socket" source, default ws://localhost:8787/marion).
  const hqClients = new Set<WebSocket>();
  const bridge = new HqBridge();
  const toHq = (events: MarionEvent[]) => {
    if (!events.length) return;
    const frame = JSON.stringify({ events });
    for (const c of hqClients) if (c.readyState === c.OPEN) c.send(frame);
  };
  hub.subscribe((id, s, prev) => toHq(bridge.events(id, s, prev)));

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS });
    res.end(JSON.stringify(body));
  };

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: game.roomCount, mcpSessions: mcp.sessions.size }));
      return;
    }
    if (url.pathname === '/mcp') {
      void mcp.handle(req, res, url).catch(() => {
        if (!res.headersSent) json(res, 500, { error: 'internal' });
      });
      return;
    }
    if (url.pathname.startsWith('/api/') && req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    if (url.pathname === '/api/agents' && req.method === 'GET') {
      json(res, 200, { agents: hub.all() });
      return;
    }
    if (url.pathname === '/api/agents/status' && req.method === 'POST') {
      if (token && bearer(req, url) !== token) return json(res, 401, { error: 'Agent token required' });
      void readJson(req).then((body) => {
        const b = (body ?? {}) as Record<string, unknown>;
        const id = normalizeAgentId(b.agent);
        if (!id) return json(res, 400, { error: 'agent (e.g. "kanye") is required' });
        if (b.clear === true) {
          hub.set(id, null);
          return json(res, 200, { ok: true, agent: id, status: null });
        }
        const s = hub.set(id, { state: b.state as 'idle' | 'working', title: b.title as string | undefined, detail: b.detail as string | undefined });
        if (!s) return json(res, 400, { error: 'state must be "working" or "idle"' });
        json(res, 200, { ok: true, agent: id, status: s });
      });
      return;
    }
    if (url.pathname === '/api/hq/events' && req.method === 'POST') {
      if (token && bearer(req, url) !== token) return json(res, 401, { error: 'Agent token required' });
      void readJson(req, 256 * 1024).then((body) => {
        const list = Array.isArray(body) ? body : body && typeof body === 'object' && Array.isArray((body as { events?: unknown }).events) ? (body as { events: unknown[] }).events : [body];
        const events = list.slice(0, 200).map((e) => parseMarionEvent(e)).filter((e): e is MarionEvent => !!e);
        toHq(events);
        json(res, 200, { ok: true, accepted: events.length, rejected: list.length - events.length });
      });
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

  // Two WebSocket endpoints on one port: route upgrades by path.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
  const hqWss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  http.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/mystery') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    else if (path === '/marion') hqWss.handleUpgrade(req, socket, head, (ws) => hqWss.emit('connection', ws, req));
    else socket.destroy();
  });
  hqWss.on('connection', (ws: WebSocket) => {
    hqClients.add(ws);
    const catchUp = bridge.snapshot(hub.all());
    if (catchUp.length) ws.send(JSON.stringify({ events: catchUp }));
    ws.on('close', () => hqClients.delete(ws));
    ws.on('error', () => ws.close());
  });
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
    console.log(`  WebSocket: ws://<host>:${port}/mystery`);
    console.log(`  Marion HQ live events: ws://localhost:${port}/marion`);
    console.log(`  MCP game controls: http://localhost:${port}/mcp?agent=<daniel|moose|kanye|barry|greek|quill|sift|builder>\n`);
  });

  return {
    game,
    hub,
    mcp,
    http,
    close: () =>
      new Promise<void>((r) => {
        clearInterval(loop);
        mcp.close();
        for (const c of hqClients) c.terminate();
        wss.close();
        hqWss.close();
        http.closeAllConnections?.();
        http.close(() => r());
      }),
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]).replace(/\.[jt]s$/, '') === resolve(join(process.cwd(), 'server/index')).replace(/\.[jt]s$/, '');
if (isMain || process.env.MYSTERY_AUTOSTART === '1') startServer();
