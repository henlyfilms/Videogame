/**
 * WebSocketAdapter: connects to a live MarionEvent stream. Validates every
 * frame against the schema, reconnects with exponential backoff, and falls
 * back to the LiveSimAdapter while the socket is down.
 */
import { parseMarionEvent } from './events';
import type { AdapterContext, EventSourceAdapter } from './types';

export interface WsLike {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

export type WsFactory = (url: string) => WsLike;

export interface WebSocketAdapterOptions {
  factory?: WsFactory;
  fallback?: () => EventSourceAdapter;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Consecutive failures before the live sim fills in. */
  fallbackAfter?: number;
}

export function backoffDelay(attempt: number, base = 500, max = 15000): number {
  return Math.min(max, base * 2 ** Math.max(0, attempt));
}

export function isValidWsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'ws:' || u.protocol === 'wss:';
  } catch {
    return false;
  }
}

export class WebSocketAdapter implements EventSourceAdapter {
  readonly kind = 'ws' as const;
  private ctx: AdapterContext | null = null;
  private socket: WsLike | null = null;
  private failures = 0;
  private retryIn: number | null = null;
  private fallback: EventSourceAdapter | null = null;
  private fallbackCtx: AdapterContext | null = null;
  received = 0;
  rejected = 0;
  private opts: Required<Omit<WebSocketAdapterOptions, 'fallback'>> & { fallback?: () => EventSourceAdapter };

  constructor(
    readonly url: string,
    opts: WebSocketAdapterOptions = {},
  ) {
    this.opts = {
      factory: opts.factory ?? ((u) => new WebSocket(u) as unknown as WsLike),
      baseDelayMs: opts.baseDelayMs ?? 500,
      maxDelayMs: opts.maxDelayMs ?? 15000,
      fallbackAfter: opts.fallbackAfter ?? 2,
      fallback: opts.fallback,
    };
  }

  start(ctx: AdapterContext): void {
    this.ctx = ctx;
    this.fallbackCtx = { ...ctx, setStatus: () => undefined };
    if (!isValidWsUrl(this.url)) {
      ctx.setStatus('fallback', 'Invalid URL — use ws:// or wss://');
      this.startFallback();
      return;
    }
    this.connect();
  }

  stop(): void {
    this.ctx = null;
    this.retryIn = null;
    this.stopFallback();
    if (this.socket) {
      const s = this.socket;
      this.socket = null;
      s.onclose = s.onerror = s.onmessage = s.onopen = null;
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  }

  get isFallingBack(): boolean {
    return this.fallback !== null;
  }

  get attempts(): number {
    return this.failures;
  }

  private connect(): void {
    if (!this.ctx) return;
    this.ctx.setStatus(this.failures ? 'reconnecting' : 'connecting', this.url);
    let s: WsLike;
    try {
      s = this.opts.factory(this.url);
    } catch (err) {
      this.onFailure(err instanceof Error ? err.message : 'connect failed');
      return;
    }
    this.socket = s;
    s.onopen = () => {
      if (this.socket !== s) return;
      this.failures = 0;
      this.stopFallback();
      this.ctx?.setStatus('open', this.url);
    };
    s.onmessage = (msg) => this.onMessage(msg.data);
    s.onerror = () => undefined; // close follows
    s.onclose = () => {
      if (this.socket !== s) return;
      this.socket = null;
      this.onFailure('connection closed');
    };
  }

  private onMessage(data: unknown): void {
    if (!this.ctx) return;
    let raw: unknown = data;
    if (typeof data === 'string') {
      try {
        raw = JSON.parse(data);
      } catch {
        this.rejected++;
        return;
      }
    }
    const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { events?: unknown }).events) ? (raw as { events: unknown[] }).events : [raw];
    for (const item of list.slice(0, 200)) {
      const ev = parseMarionEvent(item);
      if (ev) {
        this.received++;
        this.ctx.emit(ev);
      } else {
        this.rejected++;
      }
    }
  }

  private onFailure(reason: string): void {
    if (!this.ctx) return;
    const delay = backoffDelay(this.failures, this.opts.baseDelayMs, this.opts.maxDelayMs);
    this.failures++;
    this.retryIn = delay;
    if (this.failures >= this.opts.fallbackAfter && !this.fallback && this.opts.fallback) {
      this.startFallback();
    }
    this.ctx.setStatus(this.fallback ? 'fallback' : 'reconnecting', `${reason} · retry in ${(delay / 1000).toFixed(1)}s`);
  }

  private startFallback(): void {
    if (this.fallback || !this.opts.fallback || !this.fallbackCtx) return;
    this.fallback = this.opts.fallback();
    this.fallback.start(this.fallbackCtx);
  }

  private stopFallback(): void {
    this.fallback?.stop();
    this.fallback = null;
  }

  tick(dtMs: number): void {
    if (!this.ctx) return;
    this.fallback?.tick(dtMs);
    if (this.retryIn !== null) {
      this.retryIn -= dtMs;
      if (this.retryIn <= 0) {
        this.retryIn = null;
        if (isValidWsUrl(this.url)) this.connect();
      }
    }
  }
}
