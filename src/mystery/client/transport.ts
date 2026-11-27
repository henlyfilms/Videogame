/**
 * Transports: a reconnecting WebSocket (online / LAN) and a local in-browser
 * server (solo vs Marion bots, offline). Both speak the same protocol.
 */
import type { ClientMsg, ServerMsg } from '../net/protocol';

export type ConnState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'local';

export interface Transport {
  send(msg: ClientMsg): void;
  close(): void;
  readonly kind: 'ws' | 'local';
}

export interface TransportHandlers {
  onMessage(msg: ServerMsg): void;
  onState(s: ConnState): void;
  /** Called after (re)connect so the client can send hello/resume. */
  onOpen(): void;
}

export function defaultServerUrl(): string {
  if (typeof location === 'undefined') return 'ws://localhost:8787/mystery';
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // Vite dev server (5173) → game server on 8787 of the same host.
  const port = location.port === '5173' || location.port === '4173' ? '8787' : location.port;
  return `${proto}://${location.hostname}${port ? `:${port}` : ''}/mystery`;
}

export class WsTransport implements Transport {
  readonly kind = 'ws' as const;
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closed = false;
  private queue: ClientMsg[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private url: string,
    private h: TransportHandlers,
  ) {
    this.open();
  }

  private open(): void {
    this.h.onState(this.attempt ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.h.onState('open');
      this.h.onOpen();
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (ev) => {
      try {
        this.h.onMessage(JSON.parse(String(ev.data)) as ServerMsg);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (!this.closed) this.retry();
    };
    ws.onerror = () => ws.close();
  }

  private retry(): void {
    if (this.closed) return;
    this.attempt++;
    this.h.onState('reconnecting');
    const delay = Math.min(8000, 400 * 2 ** Math.min(5, this.attempt - 1));
    this.timer = setTimeout(() => this.open(), delay);
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else if (msg.t !== 'lobby.move' && msg.t !== 'ping' && !(msg.t === 'act' && msg.action.a === 'move')) this.queue.push(msg);
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.h.onState('closed');
  }

  /** Force a reconnect (e.g. returning from background on iOS). */
  kick(): void {
    if (this.closed) return;
    if (!this.ws || this.ws.readyState > 1) {
      if (this.timer) clearTimeout(this.timer);
      this.attempt = Math.max(1, this.attempt);
      this.open();
    }
  }
}

/** Runs the full game server inside the page (solo / offline / tests). */
export class LocalTransport implements Transport {
  readonly kind = 'local' as const;
  srv: import('../server/room').GameServer | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private pending: ClientMsg[] = [];

  constructor(private h: TransportHandlers) {
    void import('../server/room').then(({ GameServer, TICK_HZ }) => {
      const srv = new GameServer({ name: 'Solo (this device)', seed: Math.floor(Math.random() * 1e9) });
      this.srv = srv;
      srv.connect({ id: 'local', send: (m) => queueMicrotask(() => this.h.onMessage(m)) });
      this.h.onState('local');
      this.h.onOpen();
      for (const m of this.pending.splice(0)) srv.receive('local', m);
      let last = performance.now();
      let acc = 0;
      const step = 1 / TICK_HZ;
      this.interval = setInterval(() => {
        const now = performance.now();
        acc = Math.min(0.5, acc + (now - last) / 1000);
        last = now;
        // Fixed steps so slow frames never slow the simulation down.
        while (acc >= step) {
          srv.update(step);
          acc -= step;
        }
      }, 1000 / TICK_HZ);
    });
  }

  send(msg: ClientMsg): void {
    if (this.srv) this.srv.receive('local', msg);
    else this.pending.push(msg);
  }

  close(): void {
    if (this.interval) clearInterval(this.interval);
    this.srv?.disconnect('local');
    this.srv = null;
    this.h.onState('closed');
  }
}
