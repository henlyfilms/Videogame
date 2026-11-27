/**
 * Map format + compiled map (walkable grid, opacity grid, room lookup),
 * collision, line-of-sight and A* pathfinding. Maps are plain data
 * (JSON-compatible) so new maps are just new data files.
 */
import type { FacilityKind, MapId, StationKind, Vec2 } from './types';

export type Rect = [number, number, number, number]; // x, y, w, h (tiles)

export type FloorStyle = 'tile' | 'wood' | 'carpet' | 'metal' | 'grass' | 'snow' | 'stone' | 'checker' | 'rug';

export interface RoomDef {
  id: string;
  name: string;
  rect: Rect;
  floor: FloorStyle;
  /** Accent colour for this room (floor tint, signage). */
  color: string;
  /** Extra rects merged into the room (L-shapes). */
  extra?: Rect[];
  /** Outdoor rooms have no ceiling in 3D. */
  outdoor?: boolean;
  /** Cold rooms show breath fog in Lights Out. */
  cold?: boolean;
}

export interface HallDef {
  rect: Rect;
  floor?: FloorStyle;
}

export type PropKind =
  | 'table'
  | 'roundTable'
  | 'desk'
  | 'chair'
  | 'sofa'
  | 'bed'
  | 'shelf'
  | 'bookshelf'
  | 'crate'
  | 'barrel'
  | 'plant'
  | 'tree'
  | 'hedge'
  | 'console'
  | 'screen'
  | 'server'
  | 'locker'
  | 'counter'
  | 'stove'
  | 'fridge'
  | 'piano'
  | 'arcade'
  | 'lamp'
  | 'pillar'
  | 'tank'
  | 'pipe'
  | 'engine'
  | 'window'
  | 'rug'
  | 'statue'
  | 'fountain'
  | 'clock'
  | 'fireplace'
  | 'snowpile'
  | 'rock'
  | 'tube'
  | 'turntable'
  | 'mailbox'
  | 'poster'
  | 'bench'
  | 'seat'
  | 'cart'
  | 'planter'
  | 'telescope'
  | 'dish'
  | 'generator';

export interface PropDef {
  kind: PropKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rot?: number; // radians
  color?: string;
  /** Blocks movement (tiles under its footprint). Default from kind. */
  solid?: boolean;
  label?: string;
}

export interface StationDef {
  id: string;
  kind: StationKind;
  x: number;
  y: number;
  room: string;
}

export interface VentDef {
  id: string;
  x: number;
  y: number;
  net: string;
  links: string[];
}

export interface DoorDef {
  id: string;
  room: string;
  rect: Rect;
}

export interface CameraDef {
  id: string;
  x: number;
  y: number;
  name: string;
}

export interface SensorDef {
  id: string;
  name: string;
  rect: Rect;
}

export interface LampDef {
  x: number;
  y: number;
  r: number;
  color: string;
}

export type EjectStyle = 'tube' | 'airlock' | 'caboose' | 'trapdoor' | 'chute';

export interface MapTheme {
  /** Ambient (bright) palette. */
  sky: string;
  void: string;
  wall: string;
  wallTop: string;
  trim: string;
  hall: string;
  accent: string;
  /** Lights Out ambience. */
  night: string;
  fog: string;
  ambience: 'office' | 'station' | 'train' | 'manor' | 'lobby';
}

export interface MapDef {
  id: MapId | 'lobby';
  name: string;
  tagline: string;
  w: number;
  h: number;
  theme: MapTheme;
  rooms: RoomDef[];
  halls: HallDef[];
  props: PropDef[];
  stations: StationDef[];
  vents: VentDef[];
  doors: DoorDef[];
  cameras: CameraDef[];
  sensors: SensorDef[];
  lamps: LampDef[];
  spawn: Vec2;
  /** Room containing the meeting table/emergency button. */
  meetingRoom: string;
  eject: EjectStyle;
  /** Names for the two critical sabotages on this map. */
  criticalNames: { meltdown: string; pressure: string };
}

export const SOLID_BY_DEFAULT: ReadonlySet<PropKind> = new Set<PropKind>([
  'table',
  'roundTable',
  'desk',
  'sofa',
  'bed',
  'shelf',
  'bookshelf',
  'crate',
  'barrel',
  'tree',
  'hedge',
  'console',
  'server',
  'locker',
  'counter',
  'stove',
  'fridge',
  'piano',
  'arcade',
  'pillar',
  'tank',
  'engine',
  'statue',
  'fountain',
  'fireplace',
  'snowpile',
  'rock',
  'cart',
  'planter',
  'telescope',
  'dish',
  'generator',
]);

/** Props tall enough to block line of sight. */
export const OPAQUE_PROPS: ReadonlySet<PropKind> = new Set<PropKind>([
  'shelf',
  'bookshelf',
  'tree',
  'hedge',
  'server',
  'locker',
  'pillar',
  'tank',
  'engine',
  'statue',
  'fridge',
]);

export const FACILITY_KINDS: ReadonlySet<StationKind> = new Set<FacilityKind>([
  'emergency',
  'admin',
  'cams',
  'vitals',
  'doorlog',
  'lightsPanel',
  'commsPanel',
  'meltdownA',
  'meltdownB',
  'pressureA',
  'pressureB',
  'recharge',
  'wardrobe',
  'laptop',
]);

export const PLAYER_RADIUS = 0.32;
export const INTERACT_RANGE = 1.6;

export const enum Cell {
  Void = 0,
  Floor = 1,
  Blocked = 2, // furniture on a floor
}

export interface CompiledMap {
  def: MapDef;
  w: number;
  h: number;
  /** Cell per tile. */
  cells: Uint8Array;
  /** 1 where line of sight is blocked (void/walls + opaque props). */
  opaque: Uint8Array;
  /** Room index per tile (-1 = hall/none). */
  roomIdx: Int16Array;
  /** Door id per tile ('' = none) — closed doors block movement + sight. */
  doorAt: Map<number, string>;
  stationById: Map<string, StationDef>;
  ventById: Map<string, VentDef>;
  roomById: Map<string, RoomDef>;
  /** Wall tiles (void tiles adjacent to floor), for renderers. */
  walls: number[];
  meetingSeats: Vec2[];
  emergency: StationDef | null;
}

export function rectsOf(room: RoomDef): Rect[] {
  return [room.rect, ...(room.extra ?? [])];
}

export function compileMap(def: MapDef): CompiledMap {
  const { w, h } = def;
  const cells = new Uint8Array(w * h);
  const opaque = new Uint8Array(w * h).fill(1);
  const roomIdx = new Int16Array(w * h).fill(-1);
  const fill = (r: Rect, fn: (i: number) => void) => {
    const [x0, y0, rw, rh] = r;
    for (let y = Math.max(0, y0); y < Math.min(h, y0 + rh); y++)
      for (let x = Math.max(0, x0); x < Math.min(w, x0 + rw); x++) fn(y * w + x);
  };
  def.halls.forEach((hl) =>
    fill(hl.rect, (i) => {
      cells[i] = Cell.Floor;
      opaque[i] = 0;
    }),
  );
  def.rooms.forEach((room, ri) =>
    rectsOf(room).forEach((r) =>
      fill(r, (i) => {
        cells[i] = Cell.Floor;
        opaque[i] = 0;
        roomIdx[i] = ri;
      }),
    ),
  );
  for (const p of def.props) {
    const solid = p.solid ?? SOLID_BY_DEFAULT.has(p.kind);
    if (!solid) continue;
    const pw = p.w ?? 1;
    const ph = p.h ?? 1;
    const x0 = Math.floor(p.x - pw / 2 + 0.01);
    const y0 = Math.floor(p.y - ph / 2 + 0.01);
    const x1 = Math.ceil(p.x + pw / 2 - 0.01);
    const y1 = Math.ceil(p.y + ph / 2 - 0.01);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (cells[i] === Cell.Floor) cells[i] = Cell.Blocked;
        if (OPAQUE_PROPS.has(p.kind)) opaque[i] = 1;
      }
  }
  const doorAt = new Map<number, string>();
  for (const d of def.doors) fill(d.rect, (i) => doorAt.set(i, d.id));
  const walls: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cells[i] !== Cell.Void) continue;
      let adj = false;
      for (let dy = -1; dy <= 1 && !adj; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && cells[ny * w + nx] !== Cell.Void) {
            adj = true;
            break;
          }
        }
      if (adj) walls.push(i);
    }
  const stationById = new Map(def.stations.map((s) => [s.id, s]));
  const emergency = def.stations.find((s) => s.kind === 'emergency') ?? null;
  const meetingSeats: Vec2[] = [];
  if (emergency) {
    // Seats in a ring around the emergency button, snapped to free floor.
    for (let i = 0; i < 20; i++) {
      const ring = i < 10 ? 2.4 : 3.6;
      const a = ((i % 10) / 10) * Math.PI * 2 + (i < 10 ? 0 : Math.PI / 10);
      meetingSeats.push({ x: emergency.x + Math.cos(a) * ring, y: emergency.y + Math.sin(a) * ring });
    }
  }
  const cm: CompiledMap = {
    def,
    w,
    h,
    cells,
    opaque,
    roomIdx,
    doorAt,
    stationById,
    ventById: new Map(def.vents.map((v) => [v.id, v])),
    roomById: new Map(def.rooms.map((r) => [r.id, r])),
    walls,
    meetingSeats: [],
    emergency,
  };
  cm.meetingSeats = meetingSeats.map((p) => nearestFree(cm, p));
  return cm;
}

export function isFloor(m: CompiledMap, tx: number, ty: number, closed?: ReadonlySet<string>): boolean {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false;
  const i = ty * m.w + tx;
  if (m.cells[i] !== Cell.Floor) return false;
  if (closed && closed.size) {
    const d = m.doorAt.get(i);
    if (d && closed.has(d)) return false;
  }
  return true;
}

export function roomAt(m: CompiledMap, p: Vec2): string | null {
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y);
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return null;
  const ri = m.roomIdx[ty * m.w + tx]!;
  return ri >= 0 ? m.def.rooms[ri]!.id : null;
}

function circleFree(m: CompiledMap, x: number, y: number, r: number, closed?: ReadonlySet<string>): boolean {
  const x0 = Math.floor(x - r);
  const x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r);
  const y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (isFloor(m, tx, ty, closed)) continue;
      // Closest point on tile to circle centre.
      const cx = Math.max(tx, Math.min(x, tx + 1));
      const cy = Math.max(ty, Math.min(y, ty + 1));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return false;
    }
  return true;
}

/** Move a circle through the grid with axis-separated sliding collision. */
export function moveCircle(
  m: CompiledMap,
  pos: Vec2,
  dx: number,
  dy: number,
  r = PLAYER_RADIUS,
  closed?: ReadonlySet<string>,
): Vec2 {
  let x = pos.x;
  let y = pos.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.2));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (circleFree(m, x + sx, y, r, closed)) x += sx;
    if (circleFree(m, x, y + sy, r, closed)) y += sy;
  }
  return { x, y };
}

/** Grid ray march (Amanatides–Woo). True when nothing opaque is between a and b. */
export function lineOfSight(m: CompiledMap, a: Vec2, b: Vec2, closed?: ReadonlySet<string>): boolean {
  let tx = Math.floor(a.x);
  let ty = Math.floor(a.y);
  const ex = Math.floor(b.x);
  const ey = Math.floor(b.y);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? tx + 1 - a.x : a.x - tx) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? ty + 1 - a.y : a.y - ty) * tDeltaY : Infinity;
  let guard = 0;
  while (guard++ < 512) {
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false;
    const i = ty * m.w + tx;
    if (m.opaque[i]) return false;
    if (closed && closed.size) {
      const d = m.doorAt.get(i);
      if (d && closed.has(d)) return false;
    }
    if (tx === ex && ty === ey) return true;
    if (tMaxX < tMaxY) {
      if (tMaxX > 1) return true;
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      if (tMaxY > 1) return true;
      tMaxY += tDeltaY;
      ty += stepY;
    }
  }
  return true;
}

/** Cast a ray up to maxDist; returns the distance to the first opaque tile. */
export function castRay(m: CompiledMap, o: Vec2, angle: number, maxDist: number, closed?: ReadonlySet<string>): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let tx = Math.floor(o.x);
  let ty = Math.floor(o.y);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? tx + 1 - o.x : o.x - tx) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? ty + 1 - o.y : o.y - ty) * tDeltaY : Infinity;
  let t = 0;
  while (t < maxDist) {
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return t;
    const i = ty * m.w + tx;
    if (m.opaque[i]) return t;
    if (closed && closed.size) {
      const d = m.doorAt.get(i);
      if (d && closed.has(d)) return t;
    }
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      ty += stepY;
    }
  }
  return maxDist;
}

export function nearestFree(m: CompiledMap, p: Vec2): Vec2 {
  if (circleFree(m, p.x, p.y, PLAYER_RADIUS)) return { ...p };
  for (let r = 1; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const q = { x: Math.floor(p.x) + dx + 0.5, y: Math.floor(p.y) + dy + 0.5 };
        if (circleFree(m, q.x, q.y, PLAYER_RADIUS)) return q;
      }
  return { ...p };
}

// ---------------------------------------------------------------------------
// A* pathfinding on the walkable grid (8-dir, no corner cutting).

class Heap {
  private ids: number[] = [];
  private pr: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, p: number) {
    this.ids.push(id);
    this.pr.push(p);
    let i = this.ids.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.pr[par]! <= this.pr[i]!) break;
      [this.ids[i], this.ids[par]] = [this.ids[par]!, this.ids[i]!];
      [this.pr[i], this.pr[par]] = [this.pr[par]!, this.pr[i]!];
      i = par;
    }
  }
  pop(): number {
    const top = this.ids[0]!;
    const li = this.ids.pop()!;
    const lp = this.pr.pop()!;
    if (this.ids.length) {
      this.ids[0] = li;
      this.pr[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < this.ids.length && this.pr[l]! < this.pr[s]!) s = l;
        if (r < this.ids.length && this.pr[r]! < this.pr[s]!) s = r;
        if (s === i) break;
        [this.ids[i], this.ids[s]] = [this.ids[s]!, this.ids[i]!];
        [this.pr[i], this.pr[s]] = [this.pr[s]!, this.pr[i]!];
        i = s;
      }
    }
    return top;
  }
}

/** Path from a to b as tile centres (excluding start). null if unreachable. */
export function findPath(m: CompiledMap, a: Vec2, b: Vec2, closed?: ReadonlySet<string>, maxNodes = 40000): Vec2[] | null {
  const w = m.w;
  const sx = Math.floor(a.x);
  const sy = Math.floor(a.y);
  const goal = nearestFree(m, b);
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.y);
  if (!isFloor(m, gx, gy, closed)) return null;
  const start = sy * w + sx;
  const target = gy * w + gx;
  if (start === target) return [{ x: b.x, y: b.y }];
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open = new Heap();
  const h = (i: number) => {
    const dx = Math.abs((i % w) - gx);
    const dy = Math.abs(Math.floor(i / w) - gy);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  open.push(start, h(start));
  const closedSet = new Set<number>();
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur === target) break;
    if (closedSet.has(cur)) continue;
    closedSet.add(cur);
    if (++expanded > maxNodes) return null;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    const gc = g.get(cur)!;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isFloor(m, nx, ny, closed)) continue;
        if (dx && dy && (!isFloor(m, cx + dx, cy, closed) || !isFloor(m, cx, cy + dy, closed))) continue;
        const ni = ny * w + nx;
        const cost = gc + (dx && dy ? Math.SQRT2 : 1);
        if (cost < (g.get(ni) ?? Infinity)) {
          g.set(ni, cost);
          came.set(ni, cur);
          open.push(ni, cost + h(ni));
        }
      }
  }
  if (!came.has(target)) return null;
  const path: Vec2[] = [];
  let c = target;
  while (c !== start) {
    path.push({ x: (c % w) + 0.5, y: Math.floor(c / w) + 0.5 });
    c = came.get(c)!;
  }
  path.reverse();
  return path;
}

/** BFS distances (in tiles, 4-dir) from a point to every floor tile. */
export function distanceField(m: CompiledMap, from: Vec2): Int32Array {
  const d = new Int32Array(m.w * m.h).fill(-1);
  const s = Math.floor(from.y) * m.w + Math.floor(from.x);
  if (m.cells[s] !== Cell.Floor) return d;
  const q = new Int32Array(m.w * m.h);
  let qh = 0;
  let qt = 0;
  q[qt++] = s;
  d[s] = 0;
  while (qh < qt) {
    const c = q[qh++]!;
    const cx = c % m.w;
    const cy = (c / m.w) | 0;
    const nb = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of nb) {
      if (!isFloor(m, nx!, ny!)) continue;
      const ni = ny! * m.w + nx!;
      if (d[ni] !== -1) continue;
      d[ni] = d[c]! + 1;
      q[qt++] = ni;
    }
  }
  return d;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
