/**
 * Marion Mystery Agent SDK — connect any agent (LLM-driven or scripted) to a
 * Marion Mystery server as a player. Agents receive exactly what a human in
 * that seat would see (the per-player Snapshot) and send the same actions.
 * See docs/mystery/AGENT_PROTOCOL.md.
 *
 *   const agent = new MysteryAgent({ name: 'Kanye', transport: wsTransport('ws://host:8787/mystery') });
 *   agent.on('snap', (s) => agent.act({ a: 'move', ... }));
 *   await agent.join('ABCDEF');
 */
import type { Action } from '../../src/mystery/core/match';
import type { Snapshot } from '../../src/mystery/core/project';
import type { Settings } from '../../src/mystery/core/settings';
import type { Cosmetics } from '../../src/mystery/core/types';
import type { AgentState, ClientMsg, RoomInfo, RoomListing, ServerMsg } from '../../src/mystery/net/protocol';
import { PROTOCOL_VERSION } from '../../src/mystery/net/protocol';

export type { Action, Snapshot, RoomInfo, RoomListing, Settings, Cosmetics, ServerMsg, ClientMsg };
export { getMap } from '../../src/mystery/core/maps';
export { findPath, dist, INTERACT_RANGE } from '../../src/mystery/core/map';
export { TASK_BY_ID } from '../../src/mystery/core/tasks';

export interface AgentTransport {
  send(msg: ClientMsg): void;
  onMessage(fn: (msg: ServerMsg) => void): void;
  onOpen(fn: () => void): void;
  close(): void;
}

/** WebSocket transport (Node: pass `ws`'s WebSocket class; browsers: global). */
export function wsTransport(url: string, WS: { new (url: string): WebSocketLike } = (globalThis as unknown as { WebSocket: { new (url: string): WebSocketLike } }).WebSocket): AgentTransport {
  const ws = new WS(url);
  const handlers: ((m: ServerMsg) => void)[] = [];
  ws.onmessage = (ev: { data: unknown }) => {
    try {
      const m = JSON.parse(String(ev.data)) as ServerMsg;
      for (const h of handlers) h(m);
    } catch {
      /* ignore */
    }
  };
  return {
    send: (m) => ws.send(JSON.stringify(m)),
    onMessage: (fn) => handlers.push(fn),
    onOpen: (fn) => {
      if (ws.readyState === 1) fn();
      else ws.onopen = () => fn();
    },
    close: () => ws.close(),
  };
}

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

type Events = {
  room: RoomInfo;
  snap: Snapshot;
  welcome: { pid: string };
  error: { code: string; msg: string };
  nack: { a: string; reason: string };
  end: Snapshot;
  list: RoomListing[];
  left: { reason: string | null };
};

export interface AgentOptions {
  name: string;
  transport: AgentTransport;
  token?: string;
  cosmetics?: Cosmetics;
  /** Marion agent id (daniel, moose, kanye, barry, greek, quill, sift, builder, or your own): your look + live status key. */
  agentId?: string;
}

export class MysteryAgent {
  pid = '';
  room: RoomInfo | null = null;
  snap: Snapshot | null = null;
  private seq = 1;
  private listeners: { [K in keyof Events]?: ((v: Events[K]) => void)[] } = {};
  private opened: Promise<void>;
  private endedFor = -1;

  constructor(private opts: AgentOptions) {
    this.opened = new Promise((res) => {
      opts.transport.onOpen(() => {
        opts.transport.send({ t: 'hello', v: PROTOCOL_VERSION, name: opts.name, platform: 'agent', kind: 'agent', token: opts.token, cosmetics: opts.cosmetics, agent: opts.agentId });
        res();
      });
    });
    opts.transport.onMessage((m) => this.onMessage(m));
  }

  on<K extends keyof Events>(ev: K, fn: (v: Events[K]) => void): () => void {
    const arr = (this.listeners[ev] ??= []) as ((v: Events[K]) => void)[];
    arr.push(fn);
    return () => arr.splice(arr.indexOf(fn), 1);
  }

  private emit<K extends keyof Events>(ev: K, v: Events[K]) {
    for (const fn of (this.listeners[ev] ?? []) as ((v: Events[K]) => void)[]) fn(v);
  }

  private onMessage(m: ServerMsg) {
    switch (m.t) {
      case 'welcome':
        if (m.pid) {
          this.pid = m.pid;
          this.emit('welcome', { pid: m.pid });
        }
        break;
      case 'room':
        this.room = m.room;
        this.emit('room', m.room);
        break;
      case 'snap':
        this.snap = m.s;
        this.emit('snap', m.s);
        if (m.s.result && this.endedFor !== m.s.result.endedAt) {
          this.endedFor = m.s.result.endedAt;
          this.emit('end', m.s);
        }
        break;
      case 'error':
        this.emit('error', { code: m.code, msg: m.msg });
        break;
      case 'nack':
        this.emit('nack', { a: m.a, reason: m.reason });
        break;
      case 'list':
        this.emit('list', m.rooms);
        break;
      case 'kicked':
        this.room = null;
        this.snap = null;
        this.emit('left', { reason: m.reason });
        break;
      case 'left':
        this.room = null;
        this.snap = null;
        this.emit('left', { reason: null });
        break;
    }
  }

  async create(settings?: Partial<Settings>): Promise<void> {
    await this.opened;
    this.opts.transport.send({ t: 'create', settings });
  }

  async join(code: string): Promise<void> {
    await this.opened;
    this.opts.transport.send({ t: 'join', code });
  }

  /** Ask for the public / LAN room list (answered by a 'list' event). */
  async list(): Promise<void> {
    await this.opened;
    this.opts.transport.send({ t: 'list' });
  }

  /** Publish what this agent is working on (shown under its name tag). null clears it. */
  async status(status: { state: AgentState; title?: string; detail?: string } | null): Promise<void> {
    await this.opened;
    this.opts.transport.send({ t: 'status', status });
  }

  ready(ready = true): void {
    this.opts.transport.send({ t: 'lobby.ready', ready });
  }

  start(): void {
    this.opts.transport.send({ t: 'host.start' });
  }

  settings(patch: Partial<Settings>): void {
    this.opts.transport.send({ t: 'host.settings', settings: patch });
  }

  addBot(look?: string): void {
    this.opts.transport.send({ t: 'host.addBot', look });
  }

  act(action: Action): void {
    this.opts.transport.send({ t: 'act', action });
  }

  /** Convenience: move to a position this tick (server clamps speed + collision). */
  moveTo(x: number, y: number, facing = 0): void {
    this.act({ a: 'move', x, y, facing, seq: ++this.seq });
  }

  chat(text: string): void {
    this.act({ a: 'chat', text });
  }

  /** Leave the room but keep the connection (status updates still work). */
  leaveRoom(): void {
    this.opts.transport.send({ t: 'leave' });
    this.room = null;
    this.snap = null;
  }

  leave(): void {
    this.opts.transport.send({ t: 'leave' });
    this.opts.transport.close();
  }
}

/** The bits of GameServer an in-process transport needs. */
export interface InProcessServer {
  connect(conn: { id: string; send(msg: ServerMsg): void; close?(): void; addr?: string }): void;
  receive(connId: string, raw: unknown): void;
  disconnect(connId: string): void;
}

let localSeq = 0;

/**
 * In-process transport: an agent seated directly on a GameServer in the same
 * Node process (the HTTP MCP endpoint and the agent runner use it). Messages
 * are delivered on a microtask so an agent reacting to a snapshot never
 * re-enters the server mid-broadcast.
 */
export function localTransport(game: InProcessServer, addr = 'local-agent'): AgentTransport {
  const id = `agent${++localSeq}`;
  const handlers: ((m: ServerMsg) => void)[] = [];
  let open = true;
  game.connect({
    id,
    addr,
    send: (m) => {
      if (!open) return;
      queueMicrotask(() => {
        if (open) for (const h of handlers) h(m);
      });
    },
    close: () => {
      open = false;
    },
  });
  return {
    send: (m) => {
      if (open) game.receive(id, m);
    },
    onMessage: (fn) => handlers.push(fn),
    onOpen: (fn) => queueMicrotask(fn),
    close: () => {
      if (!open) return;
      open = false;
      game.disconnect(id);
    },
  };
}
