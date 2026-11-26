/**
 * Realtime client state outside React: local-player prediction (same
 * collision code as the server), remote-player interpolation, input, move
 * sending, ping, and an event bus that renderers use to play animations.
 */
import { getMap } from '../core/maps';
import { dist, moveCircle, type CompiledMap } from '../core/map';
import type { Snapshot } from '../core/project';
import { BASE_SPEED } from '../core/settings';
import type { MatchEvent, Vec2 } from '../core/types';
import type { ClientMsg, LobbyPos, ServerMsg } from '../net/protocol';

interface Sample {
  t: number; // local receive time (ms)
  pos: Vec2;
  facing: number;
  moving: boolean;
}

export interface RemoteState {
  pos: Vec2;
  facing: number;
  moving: boolean;
  visible: boolean;
  /** ms since last seen */
  age: number;
}

type Listener = (ev: MatchEvent, snap: Snapshot) => void;

const INTERP_DELAY = 110; // ms
const SEND_INTERVAL = 50; // ms

export class Runtime {
  private sendFn: (m: ClientMsg) => void = () => {};
  /** Movement intent in world space (normalised), set by input. */
  input: Vec2 = { x: 0, y: 0 };
  /** Facing requested by the view (3D camera / pointer); null = face movement. */
  aimFacing: number | null = null;
  local = { pos: { x: 0, y: 0 } as Vec2, facing: Math.PI / 2, moving: false, seq: 1, ready: false };
  private lastSent = 0;
  private lastSentPos: Vec2 = { x: 0, y: 0 };
  private samples = new Map<string, Sample[]>();
  private lastSeen = new Map<string, number>();
  snap: Snapshot | null = null;
  pid = '';
  mode: 'lobby' | 'match' = 'lobby';
  speedMul = 1;
  rtt = 0;
  private pingAt = 0;
  private pingN = 0;
  private listeners = new Set<Listener>();
  lobbyEmotes = new Map<string, string | null>();
  /** Increments on every snapshot (renderers can diff). */
  version = 0;

  bindSend(fn: (m: ClientMsg) => void): void {
    this.sendFn = fn;
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  map(): CompiledMap {
    return this.mode === 'match' && this.snap ? getMap(this.snap.map) : getMap('lobby');
  }

  resetMatch(): void {
    this.mode = 'match';
    this.samples.clear();
    this.snap = null;
    this.local.ready = false;
  }

  resetLobby(): void {
    this.mode = 'lobby';
    this.samples.clear();
    this.snap = null;
    this.local.ready = false;
  }

  onLobby(m: Extract<ServerMsg, { t: 'lobby' }>): void {
    if (this.mode !== 'lobby') return;
    const now = performance.now();
    if (m.corrected && m.corrected.seq >= this.local.seq - 30) {
      this.local.pos = { x: m.corrected.x, y: m.corrected.y };
    }
    for (const p of m.players as LobbyPos[]) {
      this.lobbyEmotes.set(p.id, p.emote);
      if (p.id === this.pid) {
        if (!this.local.ready) {
          this.local.pos = { x: p.x, y: p.y };
          this.local.ready = true;
        }
        continue;
      }
      this.push(p.id, { t: now, pos: { x: p.x, y: p.y }, facing: p.facing, moving: p.moving });
    }
  }

  onSnapshot(s: Snapshot, pid: string): void {
    const now = performance.now();
    this.pid = pid;
    this.mode = 'match';
    const prev = this.snap;
    this.snap = s;
    this.version++;
    const you = s.you;
    const serverPos = you.pos;
    if (!this.local.ready || you.corrected || dist(serverPos, this.local.pos) > 2.5 || s.phase !== 'play' || you.inVent) {
      this.local.pos = { ...serverPos };
      this.local.ready = true;
      if (s.phase !== 'play') this.local.facing = you.facing;
    }
    for (const p of s.players) {
      if (p.id === pid || !p.pos) continue;
      this.push(p.id, { t: now, pos: p.pos, facing: p.facing ?? 0, moving: !!p.moving });
      this.lastSeen.set(p.id, now);
    }
    for (const ev of s.events) for (const l of this.listeners) l(ev, s);
    if (prev && prev.phase !== s.phase) this.samples.clear();
  }

  onPong(n: number): void {
    if (n === this.pingN) this.rtt = performance.now() - this.pingAt;
  }

  private push(id: string, s: Sample): void {
    let arr = this.samples.get(id);
    if (!arr) this.samples.set(id, (arr = []));
    arr.push(s);
    if (arr.length > 12) arr.shift();
  }

  /** Interpolated state for a remote player (null if never seen). */
  remote(id: string): RemoteState | null {
    const arr = this.samples.get(id);
    if (!arr || !arr.length) return null;
    const now = performance.now();
    const rt = now - INTERP_DELAY;
    const last = arr[arr.length - 1]!;
    const visible = this.mode === 'lobby' || (this.snap?.players.find((p) => p.id === id)?.pos !== undefined);
    if (rt >= last.t) return { pos: last.pos, facing: last.facing, moving: last.moving && now - last.t < 250, visible, age: now - last.t };
    for (let i = arr.length - 1; i > 0; i--) {
      const a = arr[i - 1]!;
      const b = arr[i]!;
      if (rt >= a.t && rt <= b.t) {
        const k = (rt - a.t) / Math.max(1, b.t - a.t);
        // Teleports (vents, meetings) snap instead of sliding.
        if (dist(a.pos, b.pos) > 3) return { pos: b.pos, facing: b.facing, moving: b.moving, visible, age: now - b.t };
        let df = b.facing - a.facing;
        while (df > Math.PI) df -= Math.PI * 2;
        while (df < -Math.PI) df += Math.PI * 2;
        return {
          pos: { x: a.pos.x + (b.pos.x - a.pos.x) * k, y: a.pos.y + (b.pos.y - a.pos.y) * k },
          facing: a.facing + df * k,
          moving: b.moving,
          visible,
          age: now - b.t,
        };
      }
    }
    const first = arr[0]!;
    return { pos: first.pos, facing: first.facing, moving: first.moving, visible, age: now - first.t };
  }

  canMove(): boolean {
    if (this.mode === 'lobby') return true;
    const s = this.snap;
    if (!s || s.phase !== 'play') return false;
    if (s.you.inVent) return false;
    if (s.hns && s.you.role === 'seeker' && s.t < s.hns.hideUntil) return false;
    return true;
  }

  /** Advance local prediction and send moves. Call every frame. */
  update(dtSec: number, settingsSpeed = 1): void {
    const now = performance.now();
    if (now - this.pingAt > 2000) {
      this.pingAt = now;
      this.pingN++;
      this.sendFn({ t: 'ping', n: this.pingN });
    }
    if (!this.local.ready) return;
    const m = this.map();
    const len = Math.hypot(this.input.x, this.input.y);
    let moving = false;
    if (len > 0.05 && this.canMove()) {
      const nx = this.input.x / Math.max(1, len);
      const ny = this.input.y / Math.max(1, len);
      const ghost = this.mode === 'match' && this.snap && !this.snap.you.alive;
      const boost = this.snap?.hns && this.snap.you.role === 'seeker' ? (this.snap.hns.final ? 1.3 : 1.05) : 1;
      const speed = BASE_SPEED * settingsSpeed * (ghost ? 1.25 : 1) * boost * this.speedMul;
      const closed = this.mode === 'match' && this.snap ? new Set(this.snap.sabotage.closedDoors) : undefined;
      const next = moveCircle(m, this.local.pos, nx * speed * dtSec, ny * speed * dtSec, ghost ? 0.05 : undefined, ghost ? undefined : closed);
      moving = dist(next, this.local.pos) > 1e-4;
      this.local.pos = next;
      if (this.aimFacing === null) this.local.facing = Math.atan2(ny, nx);
    }
    if (this.aimFacing !== null) this.local.facing = this.aimFacing;
    this.local.moving = moving;
    const changed = dist(this.lastSentPos, this.local.pos) > 0.01;
    if (now - this.lastSent >= SEND_INTERVAL && (changed || now - this.lastSent > 400)) {
      this.lastSent = now;
      this.lastSentPos = { ...this.local.pos };
      const seq = ++this.local.seq;
      if (this.mode === 'lobby') this.sendFn({ t: 'lobby.move', x: this.local.pos.x, y: this.local.pos.y, facing: this.local.facing, seq });
      else if (this.canMove() || !this.snap?.you.alive) this.sendFn({ t: 'act', action: { a: 'move', x: this.local.pos.x, y: this.local.pos.y, facing: this.local.facing, seq } });
    }
  }
}

export const runtime = new Runtime();
