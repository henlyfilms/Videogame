/**
 * Agent hub: the live "what is each Marion agent working on" board.
 *
 * Real agents publish a status (idle, or working on a titled task) through
 * the MCP `set_status` tool, the `status` protocol frame, or
 * POST /api/agents/status. The hub keeps the latest one per agent id and
 * tells subscribers (game rooms → name tags, the HQ event stream) when it
 * changes. Pure TypeScript, so it runs in Node and in the browser.
 */
import { STATUS_DETAIL_MAX, STATUS_TITLE_MAX, type AgentState, type AgentStatus } from '../net/protocol';

export interface StatusInput {
  state: AgentState;
  title?: string;
  detail?: string;
}

/** Statuses older than this are dropped (an agent that went away without saying so). */
export const STATUS_TTL_MS = 12 * 60 * 60 * 1000;

/** Lower-case, URL-safe agent id ("Bot Builder" → "bot-builder"). Empty when unusable. */
export function normalizeAgentId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

function cleanLine(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Validate + trim an untrusted status. Returns null when it is not a status at all. */
export function cleanStatus(input: unknown, now: number): AgentStatus | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (o.state !== 'idle' && o.state !== 'working') return null;
  const title = cleanLine(o.title, STATUS_TITLE_MAX);
  const detail = cleanLine(o.detail, STATUS_DETAIL_MAX);
  return { state: o.state, title, ...(detail ? { detail } : {}), at: now };
}

/** The one line shown under a name tag. */
export function statusLine(s: AgentStatus | null | undefined): string {
  if (!s) return '';
  if (s.title) return s.title;
  if (s.detail) return s.detail;
  return s.state === 'working' ? 'Working…' : 'Idle';
}

export type HubListener = (id: string, status: AgentStatus | null, prev: AgentStatus | null) => void;

export class AgentHub {
  private statuses = new Map<string, AgentStatus>();
  private listeners = new Set<HubListener>();

  constructor(private now: () => number = () => Date.now()) {}

  /** Set (or clear with null) an agent's status. Returns the stored status, or null if cleared/invalid. */
  set(rawId: string, input: StatusInput | null): AgentStatus | null {
    const id = normalizeAgentId(rawId);
    if (!id) return null;
    const prev = this.statuses.get(id) ?? null;
    if (input === null) {
      if (!prev) return null;
      this.statuses.delete(id);
      this.emit(id, null, prev);
      return null;
    }
    const next = cleanStatus(input, this.now());
    if (!next) return null;
    // Identical re-sends only refresh the timestamp (no broadcast storm).
    if (prev && prev.state === next.state && prev.title === next.title && prev.detail === next.detail) {
      prev.at = next.at;
      return prev;
    }
    this.statuses.set(id, next);
    this.emit(id, next, prev);
    return next;
  }

  get(rawId: string | undefined | null): AgentStatus | null {
    if (!rawId) return null;
    const s = this.statuses.get(normalizeAgentId(rawId));
    if (!s) return null;
    if (this.now() - s.at > STATUS_TTL_MS) {
      this.statuses.delete(normalizeAgentId(rawId));
      return null;
    }
    return s;
  }

  all(): Record<string, AgentStatus> {
    const out: Record<string, AgentStatus> = {};
    for (const id of [...this.statuses.keys()]) {
      const s = this.get(id);
      if (s) out[id] = s;
    }
    return out;
  }

  subscribe(fn: HubListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(id: string, s: AgentStatus | null, prev: AgentStatus | null): void {
    for (const fn of this.listeners) {
      try {
        fn(id, s, prev);
      } catch {
        /* a bad listener must not break the hub */
      }
    }
  }
}
