/**
 * MCP over Streamable HTTP, served by the game server itself at /mcp.
 * Each MCP session seats one agent directly on the in-process GameServer
 * (no extra socket): `/mcp?agent=kanye` plays as Kanye.
 *
 *   claude mcp add --transport http marion-kanye "http://localhost:8787/mcp?agent=kanye"
 *
 * POST carries JSON-RPC and gets a plain JSON answer (no server-sent stream),
 * DELETE ends the session. Sessions idle for 30 minutes are closed.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeAgentId } from '../../src/mystery/server/agentHub';
import { localTransport, type InProcessServer } from '../agent-sdk';
import { Pilot } from './pilot';
import { McpSession, type RpcResponse } from './tools';

export const MCP_IDLE_MS = 30 * 60 * 1000;
const MAX_BODY = 256 * 1024;

interface HttpSession {
  mcp: McpSession;
  last: number;
}

export interface McpHttpOptions {
  game: InProcessServer;
  /** Required bearer token (MYSTERY_AGENT_TOKEN); unset = local/LAN use without one. */
  token?: string;
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

/** Browsers may only reach /mcp from this machine's own pages (DNS-rebinding guard). */
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]' || u.protocol === 'app:';
  } catch {
    return false;
  }
}

export function bearer(req: IncomingMessage, url: URL): string | undefined {
  const h = req.headers.authorization;
  if (typeof h === 'string' && /^bearer\s+/i.test(h)) return h.replace(/^bearer\s+/i, '').trim();
  return url.searchParams.get('token') ?? undefined;
}

export class McpHttp {
  sessions = new Map<string, HttpSession>();
  private sweep: ReturnType<typeof setInterval>;

  constructor(private opts: McpHttpOptions) {
    this.sweep = setInterval(() => this.gc(), 60_000);
    this.sweep.unref?.();
  }

  private gc(now = Date.now()): void {
    for (const [id, s] of this.sessions) {
      if (now - s.last > MCP_IDLE_MS) {
        s.mcp.pilot.close();
        this.sessions.delete(id);
      }
    }
  }

  close(): void {
    clearInterval(this.sweep);
    for (const s of this.sessions.values()) s.mcp.pilot.close();
    this.sessions.clear();
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const send = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers });
      res.end(body !== undefined ? JSON.stringify(body) : undefined);
    };
    if (!originAllowed(req.headers.origin as string | undefined)) return send(403, { error: 'Origin not allowed' });
    const token = bearer(req, url);
    if (this.opts.token && token !== this.opts.token) return send(401, { error: 'Agent token required (Authorization: Bearer …)' }, { 'www-authenticate': 'Bearer' });
    const sid = req.headers['mcp-session-id'] as string | undefined;
    if (req.method === 'DELETE') {
      const s = sid ? this.sessions.get(sid) : undefined;
      if (!s) return send(404, { error: 'Unknown session' });
      s.mcp.pilot.close();
      this.sessions.delete(sid!);
      return send(204);
    }
    if (req.method === 'GET') return send(405, { error: 'This server does not open a server-to-client stream; use POST.' }, { allow: 'POST, DELETE' });
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' }, { allow: 'POST, DELETE' });
    const raw = await readBody(req);
    if (raw === null) return send(413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Body too large' } });
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const list = Array.isArray(msg) ? msg : [msg];
    const isInit = list.some((m) => m && typeof m === 'object' && (m as { method?: string }).method === 'initialize');
    let session = sid ? this.sessions.get(sid) : undefined;
    let newId: string | undefined;
    if (!session) {
      if (sid) return send(404, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Session not found: initialize again' } });
      if (!isInit) return send(400, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Send initialize first (no Mcp-Session-Id).' } });
      const agentId = normalizeAgentId(url.searchParams.get('agent') ?? (req.headers['x-marion-agent'] as string | undefined) ?? '') || `agent-${Math.floor(Math.random() * 1e4)}`;
      const pilot = new Pilot({
        agentId,
        name: url.searchParams.get('name') ?? undefined,
        transport: localTransport(this.opts.game, req.socket.remoteAddress ?? 'mcp'),
        token,
        meetingControl: url.searchParams.get('meetings') !== 'autopilot',
      });
      session = { mcp: new McpSession(pilot), last: Date.now() };
      newId = randomUUID();
      this.sessions.set(newId, session);
    }
    session.last = Date.now();
    const out: RpcResponse[] = [];
    for (const m of list) {
      const r = await session.mcp.handle(m);
      if (r) out.push(r);
    }
    session.last = Date.now();
    const headers: Record<string, string> = newId ? { 'mcp-session-id': newId } : {};
    if (!out.length) return send(202, undefined, headers);
    return send(200, Array.isArray(msg) ? out : out[0], headers);
  }
}
