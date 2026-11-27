/**
 * Wire protocol shared by browser clients, the Node server and external
 * agents (see docs/mystery/AGENT_PROTOCOL.md). JSON frames over WebSocket.
 */
import type { Action } from '../core/match';
import type { Snapshot } from '../core/project';
import type { Settings } from '../core/settings';
import type { RoleValidation } from '../core/roles';
import type { Cosmetics, MapId, ModeId, Platform, PlayerKind, RoleId, ViewMode } from '../core/types';

export const PROTOCOL_VERSION = 1;

/**
 * Live "what am I working on" line a real Marion agent publishes (MCP
 * `set_status`, or POST /api/agents/status). Public to every player: it shows
 * under the agent's name tag with a loading ring while `state` is 'working'.
 */
export type AgentState = 'idle' | 'working';
export interface AgentStatus {
  state: AgentState;
  /** Task title or one-line summary ("Refactoring the billing export"). Empty = just the state. */
  title: string;
  /** Optional second line (shown in lists, not in-world). */
  detail?: string;
  /** Server time (ms since epoch) of the last update. */
  at: number;
}
export const STATUS_TITLE_MAX = 60;
export const STATUS_DETAIL_MAX = 140;

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; platform: Platform; kind: 'human' | 'agent'; token?: string; cosmetics?: Cosmetics; view?: ViewMode; resume?: { code: string; pid: string; secret: string }; agent?: string }
  | { t: 'create'; settings?: Partial<Settings>; practice?: { role: RoleId } }
  | { t: 'join'; code: string }
  | { t: 'list' }
  | { t: 'leave' }
  | { t: 'lobby.cos'; cosmetics: Cosmetics }
  | { t: 'lobby.name'; name: string }
  | { t: 'lobby.ready'; ready: boolean }
  | { t: 'lobby.view'; view: ViewMode }
  | { t: 'lobby.move'; x: number; y: number; facing: number; seq: number }
  | { t: 'lobby.emote'; id: string }
  | { t: 'lobby.chat'; text: string }
  | { t: 'host.settings'; settings: Partial<Settings> }
  | { t: 'host.start' }
  | { t: 'host.cancel' }
  | { t: 'host.kick'; pid: string; ban?: boolean }
  | { t: 'host.addBot'; look?: string }
  | { t: 'host.removeBot'; pid: string }
  | { t: 'host.lobby' }
  | { t: 'act'; action: Action }
  | { t: 'status'; status: { state: AgentState; title?: string; detail?: string } | null }
  | { t: 'ping'; n: number };

export interface LobbyPlayer {
  id: string;
  name: string;
  kind: PlayerKind;
  platform: Platform;
  cosmetics: Cosmetics;
  ready: boolean;
  connected: boolean;
  host: boolean;
  ping: number;
  view: ViewMode | null;
  /** Marion bot id when this is a Marion agent bot (or the agent id an external agent declared). */
  look?: string;
  /** Live work status of the real agent behind this seat (see AgentStatus). */
  status?: AgentStatus | null;
}

export interface LobbyChat {
  id: number;
  from: string;
  text: string;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  stage: 'lobby' | 'countdown' | 'match' | 'results';
  countdownEnds: number | null;
  settings: Settings;
  players: LobbyPlayer[];
  validation: RoleValidation;
  chat: LobbyChat[];
  /** Server clock (s) for countdowns. */
  now: number;
  lan: boolean;
  /** Freeplay practice room (role to practise). */
  practice: RoleId | null;
}

export interface RoomListing {
  code: string;
  host: string;
  players: number;
  max: number;
  mode: ModeId;
  map: MapId;
  stage: RoomInfo['stage'];
  privacy: Settings['privacy'];
}

export interface LobbyPos {
  id: string;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  emote: string | null;
}

export type ServerMsg =
  | { t: 'welcome'; pid: string; secret: string; server: string; v: number }
  | { t: 'room'; room: RoomInfo }
  | { t: 'lobby'; players: LobbyPos[]; corrected?: { x: number; y: number; seq: number } }
  | { t: 'snap'; s: Snapshot }
  | { t: 'nack'; a: string; reason: string }
  | { t: 'error'; code: string; msg: string }
  | { t: 'kicked'; reason: string }
  | { t: 'left' }
  | { t: 'list'; rooms: RoomListing[] }
  | { t: 'pong'; n: number; now: number };

/** Join-code alphabet: no confusable characters (O/0, I/1/L, S/5, B/8, Z/2). */
export const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
export const CODE_LENGTH = 6;

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export function makeCode(rand: () => number): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]!;
  return s;
}

/** Cheap structural validation of an untrusted client frame. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 16_000) return null;
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const m = o as Record<string, unknown>;
  if (typeof m.t !== 'string') return null;
  const str = (k: string, max = 64) => typeof m[k] === 'string' && (m[k] as string).length <= max;
  const num = (k: string) => typeof m[k] === 'number' && Number.isFinite(m[k]);
  switch (m.t) {
    case 'hello':
      return str('name', 64) && typeof m.platform === 'string' && (m.agent === undefined || str('agent', 32)) ? (m as unknown as ClientMsg) : null;
    case 'create':
    case 'list':
    case 'leave':
    case 'host.start':
    case 'host.cancel':
    case 'host.lobby':
      return m as unknown as ClientMsg;
    case 'join':
      return str('code', 16) ? (m as unknown as ClientMsg) : null;
    case 'lobby.cos':
      return m.cosmetics && typeof m.cosmetics === 'object' ? (m as unknown as ClientMsg) : null;
    case 'lobby.name':
      return str('name', 64) ? (m as unknown as ClientMsg) : null;
    case 'lobby.ready':
      return typeof m.ready === 'boolean' ? (m as unknown as ClientMsg) : null;
    case 'lobby.view':
      return m.view === '2d' || m.view === '3d-fp' || m.view === '3d-tp' ? (m as unknown as ClientMsg) : null;
    case 'lobby.move':
      return num('x') && num('y') && num('facing') && num('seq') ? (m as unknown as ClientMsg) : null;
    case 'lobby.emote':
      return str('id', 24) ? (m as unknown as ClientMsg) : null;
    case 'lobby.chat':
      return str('text', 400) ? (m as unknown as ClientMsg) : null;
    case 'host.settings':
      return m.settings && typeof m.settings === 'object' ? (m as unknown as ClientMsg) : null;
    case 'host.kick':
    case 'host.removeBot':
      return str('pid', 32) ? (m as unknown as ClientMsg) : null;
    case 'host.addBot':
      return m.look === undefined || str('look', 32) ? (m as unknown as ClientMsg) : null;
    case 'act': {
      const a = m.action as Record<string, unknown> | undefined;
      return a && typeof a === 'object' && typeof a.a === 'string' ? (m as unknown as ClientMsg) : null;
    }
    case 'ping':
      return num('n') ? (m as unknown as ClientMsg) : null;
    case 'status': {
      if (m.status === null) return m as unknown as ClientMsg;
      const st = m.status as Record<string, unknown> | undefined;
      if (!st || typeof st !== 'object' || (st.state !== 'idle' && st.state !== 'working')) return null;
      if (st.title !== undefined && (typeof st.title !== 'string' || st.title.length > 400)) return null;
      if (st.detail !== undefined && (typeof st.detail !== 'string' || st.detail.length > 1000)) return null;
      return m as unknown as ClientMsg;
    }
    default:
      return null;
  }
}
