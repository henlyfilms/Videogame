/**
 * Transport-agnostic game server: a registry of rooms, each with a waiting
 * room (lobby), countdown, authoritative match and results stage. Used by the
 * Node WebSocket server and, unchanged, by in-browser solo play vs bots.
 */
import { BotBrain, type ChatProvider } from '../ai/bot';
import { getMap } from '../core/maps';
import { dist, moveCircle, nearestFree } from '../core/map';
import { applyAction, createMatch, dropPlayer, sanitizeChat, tick, type MatchCtx, type PlayerSeed } from '../core/match';
import { project } from '../core/project';
import { Rng, hashString } from '../core/rng';
import { BASE_SPEED, defaultSettings, sanitizeSettings, validateSettings, type Settings } from '../core/settings';
import { ROLES, teamOf } from '../core/roles';
import type { Cosmetics, MatchState, Platform, PlayerKind, RoleId, ViewMode } from '../core/types';
import {
  CODE_LENGTH,
  isValidCode,
  makeCode,
  normalizeCode,
  parseClientMsg,
  PROTOCOL_VERSION,
  type ClientMsg,
  type LobbyChat,
  type LobbyPos,
  type RoomInfo,
  type RoomListing,
  type ServerMsg,
} from '../net/protocol';
import { BOT_LOOKS, fallbackCosmetics, sanitizeCosmeticsSafe } from './looks';

export const TICK_HZ = 30;
export const SNAPSHOT_INTERVAL = 0.05; // 20 Hz
export const LOBBY_INTERVAL = 0.1; // 10 Hz waiting-room positions
export const RECONNECT_GRACE = 60;
export const LOBBY_GRACE = 15;
export const COUNTDOWN_SECONDS = 4;
export const RESULTS_SECONDS = 60;

export interface Conn {
  id: string;
  send(msg: ServerMsg): void;
  close?(): void;
  /** Remote address (LAN detection / rate limiting). */
  addr?: string;
}

interface Member {
  pid: string;
  secret: string;
  name: string;
  kind: PlayerKind;
  platform: Platform;
  cosmetics: Cosmetics;
  ready: boolean;
  view: ViewMode | null;
  conn: Conn | null;
  disconnectedAt: number | null;
  ping: number;
  look?: string;
  bot?: BotBrain;
  // waiting room
  pos: { x: number; y: number };
  facing: number;
  moving: boolean;
  emote: string | null;
  emoteAt: number;
  seq: number;
  budget: number;
  // per-connection projection cursors
  chatSince: number;
  witnessed: Set<string>;
}

export interface ServerOptions {
  /** Shared secret external agents must present (unset = agents allowed freely). */
  agentToken?: string;
  /** Optional LLM-backed meeting chat for bots (server only). */
  chatProvider?: ChatProvider;
  /** Is the server reachable on a LAN (affects listings). */
  lan?: boolean;
  seed?: number;
  now?: () => number;
  name?: string;
}

let pidSeq = 0;

export class Room {
  readonly code: string;
  settings: Settings = defaultSettings();
  members = new Map<string, Member>();
  order: string[] = [];
  hostId = '';
  stage: RoomInfo['stage'] = 'lobby';
  countdownEnds: number | null = null;
  match: MatchState | null = null;
  ctx: MatchCtx | null = null;
  chat: LobbyChat[] = [];
  chatSeq = 0;
  banned = new Set<string>();
  /** Freeplay practice: the role the host wants to practise. */
  practice: RoleId | null = null;
  private snapAcc = 0;
  private lobbyAcc = 0;
  private resultsAt = 0;
  private dirty = true;
  private rng: Rng;
  time = 0;
  /** Set when the room should be garbage-collected. */
  closed = false;
  onMatchEnd?: (room: Room) => void;
  onMatchStart?: (room: Room) => void;

  constructor(
    code: string,
    private opts: ServerOptions,
    seed: number,
  ) {
    this.code = code;
    this.rng = new Rng(seed);
  }

  // --- membership ------------------------------------------------------------
  addMember(conn: Conn | null, hello: { name: string; kind: PlayerKind; platform: Platform; cosmetics?: unknown; view?: ViewMode | null; look?: string }): Member | string {
    if (this.stage !== 'lobby' && hello.kind !== 'bot') return 'Match already in progress.';
    if (this.order.length >= this.settings.maxPlayers) return 'Room is full.';
    if (conn?.addr && this.banned.has(conn.addr)) return 'You were removed from this room.';
    const pid = `p${++pidSeq}${this.rng.int(1000)}`;
    const lobby = getMap('lobby');
    const spot = nearestFree(lobby, { x: lobby.def.spawn.x + (this.rng.next() - 0.5) * 10, y: lobby.def.spawn.y + (this.rng.next() - 0.5) * 6 });
    const cos = sanitizeCosmeticsSafe(hello.cosmetics ?? fallbackCosmetics(this.rng.int(1e9)));
    const m: Member = {
      pid,
      secret: Math.floor(this.rng.next() * 1e16).toString(36) + Math.floor(Math.random() * 1e16).toString(36),
      name: cleanName(hello.name) || 'Berry',
      kind: hello.kind,
      platform: hello.platform,
      cosmetics: cos,
      ready: hello.kind !== 'human',
      view: hello.view ?? null,
      conn,
      disconnectedAt: null,
      ping: 0,
      look: hello.look,
      pos: spot,
      facing: Math.PI / 2,
      moving: false,
      emote: null,
      emoteAt: 0,
      seq: 0,
      budget: 0,
      chatSince: 0,
      witnessed: new Set(),
    };
    m.cosmetics = { ...m.cosmetics, color: this.freeColor(m.cosmetics.color, pid) };
    this.members.set(pid, m);
    this.order.push(pid);
    if (!this.hostId && hello.kind === 'human') this.hostId = pid;
    if (!this.hostId && hello.kind === 'agent') this.hostId = pid;
    this.dirty = true;
    this.systemChat(`${m.name} joined.`);
    return m;
  }

  private freeColor(want: number, pid: string): number {
    const taken = new Set([...this.members.values()].filter((x) => x.pid !== pid).map((x) => x.cosmetics.color));
    if (!taken.has(want)) return want;
    for (let d = 1; d < 20; d++) {
      for (const c of [want + d, want - d]) {
        const cc = ((c % 20) + 20) % 20;
        if (!taken.has(cc)) return cc;
      }
    }
    return want;
  }

  addBot(look?: string): Member | string {
    const looks = Object.keys(BOT_LOOKS);
    const used = new Set([...this.members.values()].map((m) => m.look).filter(Boolean));
    const id = look && BOT_LOOKS[look] ? look : looks.find((l) => !used.has(l)) ?? null;
    const preset = id ? BOT_LOOKS[id]! : null;
    const name = preset ? (used.has(id!) ? `${preset.name} ${this.order.length}` : preset.name) : `Bot ${this.order.length + 1}`;
    const r = this.addMember(null, {
      name,
      kind: 'bot',
      platform: 'bot',
      cosmetics: preset?.cosmetics ?? fallbackCosmetics(this.rng.int(1e9)),
      look: id ?? undefined,
    });
    if (typeof r === 'string') return r;
    r.bot = new BotBrain(r.pid, this.rng.int(1e9), this.settings.botDifficulty);
    if (preset) r.bot.persona = preset.persona;
    r.bot.chatProvider = this.opts.chatProvider ?? null;
    return r;
  }

  removeMember(pid: string, reason?: string): void {
    const m = this.members.get(pid);
    if (!m) return;
    if (this.match && this.ctx && this.stage === 'match') dropPlayer(this.match, this.ctx, pid);
    if (this.stage === 'match' && this.match) {
      // Keep the seat in the match roster but release the member.
      m.conn = null;
      m.disconnectedAt = -1e9;
    }
    this.members.delete(pid);
    this.order = this.order.filter((x) => x !== pid);
    if (reason) m.conn?.send({ t: 'kicked', reason });
    this.systemChat(`${m.name} left.`);
    if (this.hostId === pid) this.migrateHost();
    this.dirty = true;
    if (![...this.members.values()].some((x) => x.kind !== 'bot')) this.closed = true;
  }

  private migrateHost(): void {
    const next = this.order.map((id) => this.members.get(id)!).find((m) => m.kind === 'human' && m.conn) ?? this.order.map((id) => this.members.get(id)!).find((m) => m.kind !== 'bot');
    this.hostId = next?.pid ?? '';
    if (next) this.systemChat(`${next.name} is now the host.`);
  }

  attach(pid: string, secret: string, conn: Conn): Member | null {
    const m = this.members.get(pid);
    if (!m || m.secret !== secret) return null;
    m.conn = conn;
    m.disconnectedAt = null;
    m.chatSince = 0;
    if (this.match?.players[pid]) this.match.players[pid]!.connected = true;
    this.dirty = true;
    return m;
  }

  detach(pid: string): void {
    const m = this.members.get(pid);
    if (!m) return;
    m.conn = null;
    m.disconnectedAt = this.time;
    if (this.match?.players[pid]) this.match.players[pid]!.connected = false;
    this.dirty = true;
  }

  systemChat(text: string): void {
    this.chat.push({ id: ++this.chatSeq, from: 'system', text });
    if (this.chat.length > 40) this.chat.shift();
    this.dirty = true;
  }

  // --- messages --------------------------------------------------------------
  handle(pid: string, msg: ClientMsg): void {
    const m = this.members.get(pid);
    if (!m) return;
    const isHost = pid === this.hostId;
    switch (msg.t) {
      case 'lobby.cos':
        m.cosmetics = sanitizeCosmeticsSafe(msg.cosmetics);
        m.cosmetics = { ...m.cosmetics, color: this.freeColor(m.cosmetics.color, pid) };
        this.dirty = true;
        break;
      case 'lobby.name':
        m.name = cleanName(msg.name) || m.name;
        this.dirty = true;
        break;
      case 'lobby.ready':
        m.ready = msg.ready;
        this.dirty = true;
        break;
      case 'lobby.view':
        m.view = msg.view;
        this.dirty = true;
        break;
      case 'lobby.move': {
        if (this.stage !== 'lobby' && this.stage !== 'countdown') break;
        if (msg.seq <= m.seq) break;
        m.seq = msg.seq;
        const lobby = getMap('lobby');
        const dx = msg.x - m.pos.x;
        const dy = msg.y - m.pos.y;
        const want = Math.hypot(dx, dy);
        const allow = Math.min(want, m.budget);
        const k = want > 0 ? allow / want : 0;
        const next = moveCircle(lobby, m.pos, dx * k, dy * k);
        m.budget -= dist(next, m.pos);
        m.moving = dist(next, m.pos) > 0.001;
        m.pos = next;
        m.facing = msg.facing;
        if (m.moving) m.emote = null;
        if (dist(next, msg) > 0.1) m.conn?.send({ t: 'lobby', players: [], corrected: { x: next.x, y: next.y, seq: msg.seq } });
        break;
      }
      case 'lobby.emote':
        m.emote = msg.id.slice(0, 24);
        m.emoteAt = this.time;
        break;
      case 'lobby.chat': {
        const text = sanitizeChat(msg.text);
        if (text && this.settings.chat) {
          this.chat.push({ id: ++this.chatSeq, from: pid, text });
          if (this.chat.length > 40) this.chat.shift();
          this.dirty = true;
        }
        break;
      }
      case 'host.settings':
        if (!isHost || this.stage !== 'lobby') break;
        this.settings = sanitizeSettings({ ...this.settings, ...msg.settings, roles: { ...this.settings.roles, ...(msg.settings.roles ?? {}) } });
        for (const b of this.members.values()) if (b.bot) b.bot = Object.assign(new BotBrain(b.pid, this.rng.int(1e9), this.settings.botDifficulty), { persona: b.bot.persona, chatProvider: b.bot.chatProvider });
        this.dirty = true;
        break;
      case 'host.addBot':
        if (!isHost || this.stage !== 'lobby') break;
        {
          const r = this.addBot(msg.look);
          if (typeof r === 'string') m.conn?.send({ t: 'error', code: 'bot', msg: r });
        }
        break;
      case 'host.removeBot': {
        if (!isHost || this.stage !== 'lobby') break;
        const b = this.members.get(msg.pid);
        if (b?.kind === 'bot') this.removeMember(b.pid);
        break;
      }
      case 'host.kick': {
        if (!isHost || msg.pid === pid) break;
        const k = this.members.get(msg.pid);
        if (!k) break;
        if (msg.ban && k.conn?.addr) this.banned.add(k.conn.addr);
        this.removeMember(k.pid, msg.ban ? 'You were banned by the host.' : 'You were kicked by the host.');
        break;
      }
      case 'host.start':
        if (!isHost) break;
        this.tryStart(m);
        break;
      case 'host.cancel':
        if (isHost && this.stage === 'countdown') {
          this.stage = 'lobby';
          this.countdownEnds = null;
          this.dirty = true;
        }
        break;
      case 'host.lobby':
        if (isHost && this.stage === 'results') this.backToLobby();
        break;
      case 'act': {
        if (this.stage !== 'match' || !this.match || !this.ctx) break;
        const r = applyAction(this.match, this.ctx, pid, msg.action);
        if (!r.ok && msg.action.a !== 'move') m.conn?.send({ t: 'nack', a: msg.action.a, reason: r.reason });
        break;
      }
      default:
        break;
    }
  }

  validation() {
    if (this.practice) return { ok: this.order.length >= 1, errors: [], warnings: [] };
    return validateSettings(this.settings, this.order.length);
  }

  private tryStart(by: Member): void {
    if (this.stage !== 'lobby') return;
    // Fill to the requested bot count.
    const bots = [...this.members.values()].filter((m) => m.kind === 'bot').length;
    for (let i = bots; i < this.settings.bots && this.order.length < this.settings.maxPlayers; i++) this.addBot();
    const v = this.validation();
    if (!v.ok) {
      by.conn?.send({ t: 'error', code: 'start', msg: v.errors[0] ?? 'Cannot start.' });
      return;
    }
    this.stage = 'countdown';
    this.countdownEnds = this.time + COUNTDOWN_SECONDS;
    this.dirty = true;
  }

  private startMatch(): void {
    const seeds: PlayerSeed[] = this.order.map((id) => {
      const m = this.members.get(id)!;
      return { id, name: m.name, kind: m.kind, platform: m.platform, cosmetics: m.cosmetics };
    });
    const map = getMap(this.settings.map);
    this.ctx = { map, settings: this.settings };
    const seed = (this.opts.seed ?? hashString(this.code)) ^ this.rng.int(1e9);
    this.match = createMatch(seeds, this.ctx, seed >>> 0);
    if (this.practice) {
      const st = this.match;
      st.practice = true;
      for (const p of Object.values(st.players)) {
        const host = p.id === this.hostId;
        p.role = host ? this.practice : 'crewmate';
        p.team = teamOf(p.role);
        p.hasGun = p.role === 'sheriff';
        p.killCd = host ? 0 : p.killCd;
        p.emergencyLeft = 9;
      }
      st.sabotage.cooldown = 0;
      st.sabotage.doorCd = 0;
      st.emergencyReadyAt = 0;
    }
    for (const m of this.members.values()) {
      m.chatSince = 0;
      m.witnessed = new Set();
      if (m.bot) {
        const b = new BotBrain(m.pid, this.rng.int(1e9), this.settings.botDifficulty);
        b.persona = m.bot.persona;
        b.chatProvider = m.bot.chatProvider;
        m.bot = b;
      }
    }
    this.stage = 'match';
    this.countdownEnds = null;
    this.dirty = true;
    this.onMatchStart?.(this);
  }

  backToLobby(): void {
    this.stage = 'lobby';
    this.match = null;
    this.ctx = null;
    const lobby = getMap('lobby');
    for (const m of this.members.values()) {
      m.ready = m.kind !== 'human';
      m.pos = nearestFree(lobby, { x: lobby.def.spawn.x + (this.rng.next() - 0.5) * 10, y: lobby.def.spawn.y + (this.rng.next() - 0.5) * 6 });
      m.seq = 0;
    }
    // Drop members who left during the match.
    for (const m of [...this.members.values()]) if (m.kind !== 'bot' && !m.conn) this.removeMember(m.pid);
    this.dirty = true;
  }

  // --- simulation ------------------------------------------------------------
  update(dt: number): void {
    this.time += dt;
    // Reconnect grace.
    for (const m of [...this.members.values()]) {
      if (m.disconnectedAt === null || m.disconnectedAt < 0) continue;
      const grace = this.stage === 'match' ? RECONNECT_GRACE : LOBBY_GRACE;
      if (this.time - m.disconnectedAt > grace) this.removeMember(m.pid);
    }
    if (this.hostId && !this.members.get(this.hostId)?.conn && this.members.get(this.hostId)?.kind !== 'agent') {
      const h = this.members.get(this.hostId);
      if (h && h.disconnectedAt !== null && this.time - h.disconnectedAt > 5) this.migrateHost();
    }
    if (this.stage === 'lobby' || this.stage === 'countdown') this.updateLobby(dt);
    if (this.stage === 'countdown' && this.countdownEnds !== null && this.time >= this.countdownEnds) {
      if (this.validation().ok) this.startMatch();
      else {
        this.stage = 'lobby';
        this.countdownEnds = null;
        this.dirty = true;
      }
    }
    if (this.stage === 'match' && this.match && this.ctx) this.updateMatch(dt);
    if (this.stage === 'results' && this.time - this.resultsAt > RESULTS_SECONDS) this.backToLobby();
    if (this.dirty) this.broadcastRoom();
  }

  private updateLobby(dt: number): void {
    const lobby = getMap('lobby');
    for (const m of this.members.values()) {
      m.budget = Math.min(m.budget + BASE_SPEED * dt * 1.15, BASE_SPEED * 0.6 + 0.3);
      if (m.emote && this.time - m.emoteAt > 4) m.emote = null;
      if (m.bot) {
        // Bots mill about the waiting room.
        if (this.rng.next() < dt * 0.3) {
          const tgt = nearestFree(lobby, { x: 6 + this.rng.next() * 34, y: 6 + this.rng.next() * 14 });
          (m as Member & { tgt?: { x: number; y: number } }).tgt = tgt;
        }
        const tgt = (m as Member & { tgt?: { x: number; y: number } }).tgt;
        if (tgt && dist(tgt, m.pos) > 0.3) {
          const d = dist(tgt, m.pos);
          const step = Math.min(d, BASE_SPEED * 0.6 * dt);
          const next = moveCircle(lobby, m.pos, ((tgt.x - m.pos.x) / d) * step, ((tgt.y - m.pos.y) / d) * step);
          m.moving = dist(next, m.pos) > 0.001;
          if (!m.moving) (m as Member & { tgt?: unknown }).tgt = undefined;
          m.facing = Math.atan2(tgt.y - m.pos.y, tgt.x - m.pos.x);
          m.pos = next;
        } else m.moving = false;
        if (this.rng.next() < dt * 0.04) {
          m.emote = this.rng.pick(['wave', 'dance', 'laugh', 'cheer']);
          m.emoteAt = this.time;
        }
      }
    }
    this.lobbyAcc += dt;
    if (this.lobbyAcc >= LOBBY_INTERVAL) {
      this.lobbyAcc = 0;
      const players: LobbyPos[] = this.order.map((id) => {
        const m = this.members.get(id)!;
        return { id, x: r2(m.pos.x), y: r2(m.pos.y), facing: r2(m.facing), moving: m.moving, emote: m.emote };
      });
      for (const m of this.members.values()) m.conn?.send({ t: 'lobby', players });
    }
  }

  private updateMatch(dt: number): void {
    const st = this.match!;
    const ctx = this.ctx!;
    // Bots act on their own fair projection.
    for (const m of this.members.values()) {
      if (!m.bot || st.practice) continue;
      const p = st.players[m.pid];
      if (!p) continue;
      const snap = project(st, ctx, m.pid, { chatSince: st.chatSeq, witnessed: m.witnessed });
      // Bots never consume the pending event queue (projection is read-only).
      const acts = m.bot.update(snap, ctx.map, ctx.settings, dt);
      for (const a of acts) applyAction(st, ctx, m.pid, a);
      while (m.bot.pendingChat.length) {
        const line = m.bot.pendingChat.shift()!;
        applyAction(st, ctx, m.pid, { a: 'chat', text: line });
      }
    }
    // Disconnected humans past grace are dropped from the match.
    for (const id of st.order) {
      const p = st.players[id]!;
      const m = this.members.get(id);
      if (!m && p.connected) dropPlayer(st, ctx, id);
    }
    tick(st, ctx, dt);
    this.snapAcc += dt;
    const ended = st.phase === 'ended';
    if (this.snapAcc >= SNAPSHOT_INTERVAL || ended || st.pending.length) {
      this.snapAcc = 0;
      for (const m of this.members.values()) {
        if (!m.conn || !st.players[m.pid]) continue;
        const s = project(st, ctx, m.pid, { chatSince: m.chatSince, witnessed: m.witnessed, includeHeat: ended });
        if (s.chat.length) m.chatSince = s.chat[s.chat.length - 1]!.id;
        m.conn.send({ t: 'snap', s });
        st.players[m.pid]!.corrected = 0;
      }
      st.pending = [];
    }
    if (ended) {
      this.stage = 'results';
      this.resultsAt = this.time;
      this.dirty = true;
      this.onMatchEnd?.(this);
    }
  }

  info(): RoomInfo {
    const v = this.validation();
    return {
      code: this.code,
      hostId: this.hostId,
      stage: this.stage,
      countdownEnds: this.countdownEnds,
      settings: this.settings,
      players: this.order.map((id) => {
        const m = this.members.get(id)!;
        return {
          id,
          name: m.name,
          kind: m.kind,
          platform: m.platform,
          cosmetics: m.cosmetics,
          ready: m.ready,
          connected: m.kind === 'bot' || !!m.conn,
          host: id === this.hostId,
          ping: m.ping,
          view: m.view,
          look: m.look,
        };
      }),
      validation: v,
      chat: this.chat.slice(-30),
      now: this.time,
      lan: !!this.opts.lan,
      practice: this.practice,
    };
  }

  private broadcastRoom(): void {
    this.dirty = false;
    const room = this.info();
    for (const m of this.members.values()) m.conn?.send({ t: 'room', room });
  }

  listing(): RoomListing {
    const host = this.members.get(this.hostId);
    return {
      code: this.code,
      host: host?.name ?? '—',
      players: this.order.length,
      max: this.settings.maxPlayers,
      mode: this.settings.mode,
      map: this.settings.map,
      stage: this.stage,
      privacy: this.settings.privacy,
    };
  }
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f<>{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

// ---------------------------------------------------------------------------

interface ConnState {
  conn: Conn;
  hello: Extract<ClientMsg, { t: 'hello' }> | null;
  room: Room | null;
  pid: string | null;
  tokens: number;
  last: number;
  strikes: number;
}

/** Owns rooms and routes connection traffic. */
export class GameServer {
  rooms = new Map<string, Room>();
  private conns = new Map<string, ConnState>();
  private rng: Rng;
  time = 0;

  constructor(readonly opts: ServerOptions = {}) {
    this.rng = new Rng(opts.seed ?? (Date.now() & 0xffffffff));
  }

  connect(conn: Conn): void {
    this.conns.set(conn.id, { conn, hello: null, room: null, pid: null, tokens: 120, last: this.time, strikes: 0 });
  }

  disconnect(connId: string): void {
    const cs = this.conns.get(connId);
    if (!cs) return;
    if (cs.room && cs.pid) cs.room.detach(cs.pid);
    this.conns.delete(connId);
  }

  /** Feed one raw frame from a connection. */
  receive(connId: string, raw: unknown): void {
    const cs = this.conns.get(connId);
    if (!cs) return;
    // Token bucket: 60 msgs/s sustained, 120 burst.
    cs.tokens = Math.min(120, cs.tokens + (this.time - cs.last) * 60);
    cs.last = this.time;
    if (cs.tokens < 1) {
      if (++cs.strikes > 200) {
        cs.conn.send({ t: 'error', code: 'rate', msg: 'Too many messages.' });
        cs.conn.close?.();
        this.disconnect(connId);
      }
      return;
    }
    cs.tokens -= 1;
    const msg = parseClientMsg(raw);
    if (!msg) {
      cs.conn.send({ t: 'error', code: 'bad', msg: 'Malformed message.' });
      return;
    }
    try {
      this.route(cs, msg);
    } catch (e) {
      cs.conn.send({ t: 'error', code: 'internal', msg: 'Server error handling that message.' });
      if (typeof console !== 'undefined') console.error('[mystery] handler error', e);
    }
  }

  private route(cs: ConnState, msg: ClientMsg): void {
    if (msg.t === 'ping') {
      cs.conn.send({ t: 'pong', n: msg.n, now: this.time });
      return;
    }
    if (msg.t === 'hello') {
      if (msg.kind === 'agent' && this.opts.agentToken && msg.token !== this.opts.agentToken) {
        cs.conn.send({ t: 'error', code: 'auth', msg: 'Agent token rejected.' });
        return;
      }
      cs.hello = msg;
      if (msg.resume) {
        const room = this.rooms.get(normalizeCode(msg.resume.code));
        const m = room?.attach(msg.resume.pid, msg.resume.secret, cs.conn);
        if (room && m) {
          cs.room = room;
          cs.pid = m.pid;
          cs.conn.send({ t: 'welcome', pid: m.pid, secret: m.secret, server: this.opts.name ?? 'Marion Mystery', v: PROTOCOL_VERSION });
          return;
        }
      }
      cs.conn.send({ t: 'welcome', pid: '', secret: '', server: this.opts.name ?? 'Marion Mystery', v: PROTOCOL_VERSION });
      return;
    }
    if (!cs.hello) {
      cs.conn.send({ t: 'error', code: 'hello', msg: 'Say hello first.' });
      return;
    }
    switch (msg.t) {
      case 'list':
        cs.conn.send({
          t: 'list',
          rooms: [...this.rooms.values()].filter((r) => !r.closed && r.settings.privacy !== 'code').map((r) => r.listing()),
        });
        return;
      case 'create': {
        this.leave(cs);
        const code = this.newCode();
        const room = new Room(code, this.opts, this.rng.int(1e9));
        if (msg.settings) room.settings = sanitizeSettings({ ...room.settings, ...msg.settings });
        if (msg.practice && ROLES[msg.practice.role as RoleId]) {
          room.practice = msg.practice.role as RoleId;
          room.settings = sanitizeSettings({ ...room.settings, durationMin: 0, discussionTime: 15, votingTime: 30 });
        }
        this.rooms.set(code, room);
        this.enter(cs, room);
        return;
      }
      case 'join': {
        const code = normalizeCode(msg.code);
        const room = this.rooms.get(code);
        if (!isValidCode(code) || !room || room.closed) {
          cs.conn.send({ t: 'error', code: 'nojoin', msg: `No room with code ${code || '—'}.` });
          return;
        }
        if (cs.room === room) return;
        this.leave(cs);
        this.enter(cs, room);
        return;
      }
      case 'leave':
        this.leave(cs);
        cs.conn.send({ t: 'left' });
        return;
      default:
        if (cs.room && cs.pid) cs.room.handle(cs.pid, msg);
    }
  }

  private enter(cs: ConnState, room: Room): void {
    const h = cs.hello!;
    const r = room.addMember(cs.conn, {
      name: h.name,
      kind: h.kind === 'agent' ? 'agent' : 'human',
      platform: h.kind === 'agent' ? 'agent' : h.platform,
      cosmetics: h.cosmetics,
      view: h.view ?? null,
    });
    if (typeof r === 'string') {
      cs.conn.send({ t: 'error', code: 'nojoin', msg: r });
      if (room.order.length === 0) this.rooms.delete(room.code);
      return;
    }
    cs.room = room;
    cs.pid = r.pid;
    cs.conn.send({ t: 'welcome', pid: r.pid, secret: r.secret, server: this.opts.name ?? 'Marion Mystery', v: PROTOCOL_VERSION });
  }

  private leave(cs: ConnState): void {
    if (cs.room && cs.pid) cs.room.removeMember(cs.pid);
    cs.room = null;
    cs.pid = null;
  }

  private newCode(): string {
    for (let i = 0; i < 1000; i++) {
      const c = makeCode(() => this.rng.next());
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('code space exhausted');
  }

  /** Advance every room. Call at TICK_HZ. */
  update(dt: number): void {
    this.time += dt;
    for (const [code, room] of this.rooms) {
      room.update(dt);
      if (room.closed) this.rooms.delete(code);
    }
  }

  get roomCount(): number {
    return this.rooms.size;
  }
}

export { CODE_LENGTH };
