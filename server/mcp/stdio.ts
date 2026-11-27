/**
 * Marion Mystery MCP server over stdio: one process per agent.
 *
 *   npx tsx server/mcp/stdio.ts --agent kanye [--server ws://localhost:8787/mystery] [--token …] [--name "Kanye"]
 *
 * Add it to an MCP client (Claude Code example):
 *   claude mcp add marion-kanye -- npx tsx /path/to/repo/server/mcp/stdio.ts --agent kanye
 *
 * Env fallbacks: MARION_AGENT, MYSTERY_SERVER, MYSTERY_AGENT_TOKEN, MARION_AGENT_NAME.
 * stdout carries only JSON-RPC; logs go to stderr.
 */
import WebSocket from 'ws';
import { createInterface } from 'node:readline';
import type { ClientMsg, ServerMsg } from '../../src/mystery/net/protocol';
import type { AgentTransport } from '../agent-sdk';
import { Pilot } from './pilot';
import { McpSession } from './tools';

export function parseArgs(argv: string[], booleans: readonly string[] = []): Record<string, string> & { _: string[] } {
  const out = { _: [] as string[] } as Record<string, string> & { _: string[] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const [k, v] = a.slice(2).split('=', 2) as [string, string | undefined];
    if (v !== undefined) out[k] = v;
    else if (!booleans.includes(k) && argv[i + 1] && !argv[i + 1]!.startsWith('--')) out[k] = argv[++i]!;
    else out[k] = 'true';
  }
  return out;
}

/** A WebSocket transport that keeps reconnecting (the game server may start after the agent). */
export function reconnectingTransport(url: string, log: (s: string) => void): AgentTransport {
  const handlers: ((m: ServerMsg) => void)[] = [];
  const opens: (() => void)[] = [];
  const queue: ClientMsg[] = [];
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  const open = () => {
    if (closed) return;
    const sock = new WebSocket(url);
    ws = sock;
    sock.on('open', () => {
      attempt = 0;
      log(`connected to ${url}`);
      for (const fn of opens) fn();
      while (queue.length && sock.readyState === sock.OPEN) sock.send(JSON.stringify(queue.shift()));
    });
    sock.on('message', (data) => {
      try {
        const m = JSON.parse(data.toString()) as ServerMsg;
        for (const h of handlers) h(m);
      } catch {
        /* ignore */
      }
    });
    sock.on('close', () => {
      if (closed) return;
      const delay = Math.min(15000, 500 * 2 ** attempt++);
      log(`game server unreachable (${url}); retrying in ${(delay / 1000).toFixed(1)}s`);
      setTimeout(open, delay);
    });
    sock.on('error', () => undefined);
  };
  open();
  return {
    send: (m) => {
      if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
      else if (m.t !== 'act' && queue.length < 50) queue.push(m);
    },
    onMessage: (fn) => handlers.push(fn),
    onOpen: (fn) => {
      opens.push(fn);
      if (ws?.readyState === WebSocket.OPEN) fn();
    },
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}

export function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const log = (s: string) => process.stderr.write(`[marion-mcp] ${s}\n`);
  const agentId = args.agent ?? process.env.MARION_AGENT ?? 'agent';
  const url = args.server ?? process.env.MYSTERY_SERVER ?? 'ws://localhost:8787/mystery';
  const pilot = new Pilot({
    agentId,
    name: args.name ?? process.env.MARION_AGENT_NAME,
    transport: reconnectingTransport(url, log),
    token: args.token ?? process.env.MYSTERY_AGENT_TOKEN,
    meetingControl: args.meetings !== 'autopilot',
  });
  const session = new McpSession(pilot);
  const write = (obj: unknown) => process.stdout.write(`${JSON.stringify(obj)}\n`);
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    const t = line.trim();
    if (!t) return;
    let msg: unknown;
    try {
      msg = JSON.parse(t);
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    // Requests run concurrently (a long wait_for_turn must not block a ping).
    const list = Array.isArray(msg) ? msg : [msg];
    void Promise.all(list.map((m) => session.handle(m))).then((rs) => {
      const out = rs.filter(Boolean);
      if (!out.length) return;
      write(Array.isArray(msg) ? out : out[0]);
    });
  });
  rl.on('close', () => {
    pilot.close();
    process.exit(0);
  });
  log(`playing as "${agentId}" on ${url}`);
}

if (process.argv[1] && /server[\\/]mcp[\\/]stdio\.[jt]s$/.test(process.argv[1])) main();
