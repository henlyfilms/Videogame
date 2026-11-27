/**
 * Live "what is each Marion agent working on" board, polled from the game
 * server's GET /api/agents. Shared by Marion HQ (bot name tags) and Marion
 * Mystery (player name tags + waiting room list). Polling is best-effort:
 * it pauses while the tab is hidden, backs off when the server is away and
 * never throws.
 */
import { create } from 'zustand';
import type { AgentStatus } from '../mystery/net/protocol';

export interface LiveStatusState {
  agents: Record<string, AgentStatus>;
  /** The last poll reached the server. */
  online: boolean;
}

export const useLiveStatus = create<LiveStatusState>(() => ({ agents: {}, online: false }));

const POLL_MS = 4000;
const MAX_BACKOFF_MS = 30000;
const TIMEOUT_MS = 3000;
const TITLE_MAX = 200;
const DETAIL_MAX = 400;

type LocLike = Pick<Location, 'protocol' | 'hostname' | 'port' | 'search' | 'origin'>;

/** HTTP origin of the game server (mirrors `defaultServerUrl()` in mystery/client/transport). Null when unknown. */
export function liveStatusBase(loc: LocLike | undefined = typeof location === 'undefined' ? undefined : location): string | null {
  if (!loc) return 'http://localhost:8787';
  try {
    const q = new URLSearchParams(loc.search).get('server');
    if (q) {
      const u = new URL(q);
      if (u.protocol === 'ws:' || u.protocol === 'http:') return `http://${u.host}`;
      if (u.protocol === 'wss:' || u.protocol === 'https:') return `https://${u.host}`;
      return null;
    }
  } catch {
    return null;
  }
  // The Mac app serves the client from app://hq: look for a server on this Mac.
  if (loc.protocol !== 'http:' && loc.protocol !== 'https:') return 'http://localhost:8787';
  // Vite dev / preview → game server on 8787 of the same host.
  if (loc.port === '5173' || loc.port === '4173') return `${loc.protocol}//${loc.hostname}:8787`;
  return loc.origin || `${loc.protocol}//${loc.hostname}${loc.port ? `:${loc.port}` : ''}`;
}

/** Validate an untrusted /api/agents payload. Bad entries are dropped; a payload that isn't one at all → null. */
export function parseAgentsPayload(raw: unknown): Record<string, AgentStatus> | null {
  if (!raw || typeof raw !== 'object') return null;
  const agents = (raw as { agents?: unknown }).agents;
  if (!agents || typeof agents !== 'object' || Array.isArray(agents)) return null;
  const out: Record<string, AgentStatus> = {};
  for (const [id, v] of Object.entries(agents as Record<string, unknown>)) {
    if (!id || id.length > 32 || !v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (o.state !== 'idle' && o.state !== 'working') continue;
    if (typeof o.title !== 'string' || o.title.length > TITLE_MAX) continue;
    const detail = typeof o.detail === 'string' && o.detail.length <= DETAIL_MAX ? o.detail : undefined;
    const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0;
    out[id] = { state: o.state, title: o.title, ...(detail ? { detail } : {}), at };
  }
  return out;
}

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let inFlight = false;

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void poll(), ms);
}

async function poll(): Promise<void> {
  timer = null;
  if (hidden()) return; // resumed by visibilitychange
  const base = liveStatusBase();
  if (!base || inFlight) return schedule(POLL_MS);
  inFlight = true;
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const to = ac ? setTimeout(() => ac.abort(), TIMEOUT_MS) : null;
  let ok = false;
  try {
    const res = await fetch(`${base}/api/agents`, { signal: ac?.signal, cache: 'no-store' });
    if (res.ok) {
      const agents = parseAgentsPayload(await res.json());
      if (agents) {
        ok = true;
        if (!sameAgents(useLiveStatus.getState().agents, agents) || !useLiveStatus.getState().online) useLiveStatus.setState({ agents, online: true });
      }
    }
  } catch {
    /* offline, aborted or not JSON */
  } finally {
    if (to) clearTimeout(to);
    inFlight = false;
  }
  if (ok) failures = 0;
  else {
    failures++;
    if (useLiveStatus.getState().online) useLiveStatus.setState({ online: false });
  }
  schedule(ok ? POLL_MS : Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** Math.min(failures, 4)));
}

function sameAgents(a: Record<string, AgentStatus>, b: Record<string, AgentStatus>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    const x = a[k];
    const y = b[k];
    if (!x || !y || x.state !== y.state || x.title !== y.title || x.detail !== y.detail || x.at !== y.at) return false;
  }
  return true;
}

/** Start polling the game server (idempotent; a no-op without fetch, e.g. in tests). */
export function startLiveStatus(): void {
  if (started || typeof fetch !== 'function' || typeof window === 'undefined' || import.meta.env?.MODE === 'test') return;
  started = true;
  try {
    document.addEventListener('visibilitychange', () => {
      if (!hidden() && !timer && !inFlight) void poll();
    });
  } catch {
    /* no document */
  }
  void poll();
}

/** The live status of agent `id` (an HQ bot id / Mystery `look`), or null. */
export function liveStatusFor(id?: string | null): AgentStatus | null {
  if (!id) return null;
  return useLiveStatus.getState().agents[id] ?? null;
}
