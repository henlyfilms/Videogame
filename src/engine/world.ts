/**
 * HQ floorplan: a 3×3 block of rooms (7 wings + Moose's bridge + the Huddle room)
 * separated by walkable corridors. Everything is defined in tiles; the renderer
 * and the simulation convert to world pixels with TILE.
 */
import type { RoomId } from '../data/bots';

export const TILE = 32;
export const ROOM_W = 18;
export const ROOM_H = 12;
export const CORRIDOR = 3;
export const COLS = 3;
export const ROWS = 3;
export const MAP_W = COLS * ROOM_W + (COLS + 1) * CORRIDOR; // 66
export const MAP_H = ROWS * ROOM_H + (ROWS + 1) * CORRIDOR; // 48
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const enum Tile {
  Void = 0,
  Corridor = 1,
  Floor = 2,
  Wall = 3,
  Door = 4,
  Prop = 5,
}

export type HotspotAction =
  | 'brain'
  | 'release'
  | 'command'
  | 'huddle'
  | 'terminal'
  | 'polaroid'
  | 'relay'
  | 'bridge'
  | 'wave'
  | 'screens'
  | 'planner'
  | 'turntable'
  | 'mic'
  | 'vault'
  | 'mcp'
  | 'monitors'
  | 'llm'
  | 'dimmer'
  | 'fts'
  | 'intake'
  | 'jog'
  | 'bins'
  | 'timeline'
  | 'render'
  | 'sort'
  | 'redpen'
  | 'stamp'
  | 'tubes'
  | 'bench'
  | 'skills'
  | 'pod'
  | 'retired';

export type PropKind =
  | 'command-desk'
  | 'brain'
  | 'release-chute'
  | 'plant'
  | 'huddle-table'
  | 'whiteboard'
  | 'terminal'
  | 'polaroid-board'
  | 'relay-rack'
  | 'violet-desk'
  | 'wave-indicator'
  | 'screens-board'
  | 'conduit'
  | 'planner-board'
  | 'turntable'
  | 'mic'
  | 'vault-cabinet'
  | 'mcp-door'
  | 'life-desk'
  | 'monitor-wall'
  | 'llm-console'
  | 'dimmer'
  | 'fts-cabinet'
  | 'intake-chute'
  | 'couch'
  | 'timeline-monitors'
  | 'jog-desk'
  | 'clip-bins'
  | 'clapperboard'
  | 'render-lamp'
  | 'timeline-table'
  | 'sorting-wall'
  | 'redpen-desk'
  | 'stamp-press'
  | 'outbox'
  | 'tube-port'
  | 'aura-bench'
  | 'skill-wall'
  | 'spawn-pod'
  | 'retired-shelf';

export interface PropDef {
  id: string;
  kind: PropKind;
  /** Local tile coords inside the room (0..ROOM_W-1). */
  x: number;
  y: number;
  w: number;
  h: number;
  blocking: boolean;
  hotspot?: HotspotAction;
  label?: string;
}

export interface SpotDef {
  name: string;
  x: number;
  y: number;
}

export interface RoomDef {
  id: RoomId;
  name: string;
  short: string;
  owner: string | null;
  /** Tile origin of the room (top-left wall tile). */
  x: number;
  y: number;
  w: number;
  h: number;
  props: PropDef[];
  spots: SpotDef[];
}

interface RoomBlueprint {
  id: RoomId;
  name: string;
  short: string;
  owner: string | null;
  col: number;
  row: number;
  props: PropDef[];
  spots: SpotDef[];
}

const p = (
  id: string,
  kind: PropKind,
  x: number,
  y: number,
  w: number,
  h: number,
  hotspot?: HotspotAction,
  blocking = true,
  label?: string,
): PropDef => ({ id, kind, x, y, w, h, blocking, hotspot, label });

const sp = (name: string, x: number, y: number): SpotDef => ({ name, x, y });

const HUDDLE_SEATS: SpotDef[] = [
  sp('seat0', 5, 3),
  sp('seat1', 7, 3),
  sp('seat2', 10, 3),
  sp('seat3', 12, 3),
  sp('seat4', 5, 7),
  sp('seat5', 7, 7),
  sp('seat6', 10, 7),
  sp('seat7', 12, 7),
  sp('seat8', 4, 5),
  sp('seat9', 13, 5),
  sp('seat10', 4, 4),
  sp('seat11', 13, 4),
];

const BLUEPRINTS: RoomBlueprint[] = [
  {
    id: 'engine',
    name: "Kanye's Engine Room",
    short: 'Engine Room',
    owner: 'kanye',
    col: 0,
    row: 0,
    props: [
      p('term1', 'terminal', 2, 2, 3, 1, 'terminal', true, 'tty1'),
      p('term2', 'terminal', 2, 8, 3, 1, 'terminal', true, 'tty2'),
      p('term3', 'terminal', 11, 2, 3, 1, 'terminal', true, 'tty0'),
      p('polaroids', 'polaroid-board', 11, 9, 4, 1, 'polaroid', true, '⇧⌘S'),
      p('relay', 'relay-rack', 14, 4, 2, 4, 'relay', true, 'Relay'),
    ],
    spots: [sp('desk', 12, 3), sp('t1', 3, 3), sp('t2', 3, 7), sp('polaroid', 12, 8), sp('relay', 13, 6), sp('center', 8, 6)],
  },
  {
    id: 'bridge',
    name: "Moose's Co-Pilot Bridge",
    short: 'Co-Pilot Bridge',
    owner: 'moose',
    col: 1,
    row: 0,
    props: [
      p('conduit', 'conduit', 1, 5, 16, 2, undefined, false, 'Agent ↔ Life sync'),
      p('vdesk', 'violet-desk', 6, 7, 6, 2, 'bridge', true, 'Co-Pilot'),
      p('wave', 'wave-indicator', 2, 1, 4, 1, 'wave', true, 'Dictation'),
      p('screens', 'screens-board', 12, 1, 4, 1, 'screens', true, 'Screenshots'),
    ],
    spots: [sp('desk', 9, 6), sp('wave', 4, 2), sp('screens', 13, 2), sp('w1', 4, 8), sp('center', 9, 4)],
  },
  {
    id: 'life',
    name: "Barry's Marion Life Hub & Vault",
    short: 'Marion Life Hub',
    owner: 'barry',
    col: 2,
    row: 0,
    props: [
      p('planner', 'planner-board', 2, 1, 6, 1, 'planner', true, 'Planner'),
      p('turntable', 'turntable', 11, 2, 3, 2, 'turntable', true, 'Turntable'),
      p('mic', 'mic', 15, 2, 1, 1, 'mic', true, 'Mic'),
      p('vault', 'vault-cabinet', 2, 7, 4, 3, 'vault', true, 'Vault'),
      p('mcp', 'mcp-door', 15, 8, 1, 2, 'mcp', true, 'MCP'),
      p('ldesk', 'life-desk', 9, 6, 3, 1, 'planner', true, 'marionberry.app'),
    ],
    spots: [sp('desk', 10, 7), sp('planner', 4, 2), sp('turntable', 12, 4), sp('mic', 15, 3), sp('vault', 6, 8), sp('mcp', 14, 9), sp('center', 9, 4)],
  },
  {
    id: 'media',
    name: "Sift's Media Vault",
    short: 'Media Vault',
    owner: 'sift',
    col: 0,
    row: 1,
    props: [
      p('monitors', 'monitor-wall', 2, 1, 5, 1, 'monitors', true, 'Reels · YouTube'),
      p('llm', 'llm-console', 11, 1, 3, 1, 'llm', true, 'LLM'),
      p('dimmer', 'dimmer', 15, 1, 1, 1, 'dimmer', true, 'Dimmer'),
      p('fts', 'fts-cabinet', 14, 7, 2, 3, 'fts', true, 'FTS5'),
      p('intake', 'intake-chute', 3, 7, 2, 2, 'intake', true, 'Intake'),
      p('couch', 'couch', 6, 4, 4, 1, undefined, true),
    ],
    spots: [sp('desk', 4, 2), sp('llm', 12, 2), sp('dimmer', 15, 2), sp('fts', 13, 8), sp('intake', 5, 7), sp('center', 8, 7)],
  },
  {
    id: 'command',
    name: 'Central Command',
    short: 'Command',
    owner: 'daniel',
    col: 1,
    row: 1,
    props: [
      p('cdesk', 'command-desk', 10, 2, 5, 2, 'command', true, 'Command'),
      p('brain', 'brain', 3, 2, 2, 2, 'brain', true, 'Universal Brain'),
      p('chute', 'release-chute', 13, 7, 3, 3, 'release', true, 'Release'),
      p('plant1', 'plant', 2, 9, 1, 1, undefined, true),
      p('plant2', 'plant', 7, 2, 1, 1, undefined, true),
    ],
    spots: [sp('desk', 12, 4), sp('inbox', 10, 4), sp('brain', 4, 4), sp('chute', 12, 8), sp('center', 7, 6)],
  },
  {
    id: 'cutting',
    name: "Greek's Cutting Room",
    short: 'Cutting Room',
    owner: 'greek',
    col: 2,
    row: 1,
    props: [
      p('tlmon', 'timeline-monitors', 2, 1, 5, 1, 'jog', true, 'A/B'),
      p('jog', 'jog-desk', 2, 3, 5, 1, 'jog', true, 'Jog'),
      p('timeline', 'timeline-table', 11, 2, 5, 2, 'timeline', true, 'Timeline'),
      p('bins', 'clip-bins', 11, 7, 4, 2, 'bins', true, 'Bins'),
      p('clapper', 'clapperboard', 2, 8, 1, 1, undefined, true),
      p('lamp', 'render-lamp', 15, 1, 1, 1, 'render', true, 'Render'),
    ],
    spots: [sp('desk', 4, 4), sp('timeline', 13, 4), sp('bins', 12, 6), sp('render', 16, 2), sp('center', 8, 6)],
  },
  {
    id: 'mail',
    name: "Quill's Mailroom",
    short: 'Mailroom',
    owner: 'quill',
    col: 0,
    row: 2,
    props: [
      p('sortwall', 'sorting-wall', 2, 1, 6, 1, 'sort', true, 'Action · FYI · Noise'),
      p('redpen', 'redpen-desk', 11, 3, 3, 2, 'redpen', true, 'Red Pen'),
      p('stamp', 'stamp-press', 3, 7, 2, 2, 'stamp', true, 'Approve'),
      p('outbox', 'outbox', 5, 8, 3, 1, 'stamp', true, 'Outbox'),
      p('tubes', 'tube-port', 13, 1, 3, 1, 'tubes', true, 'Tubes'),
    ],
    spots: [sp('desk', 12, 5), sp('sort', 4, 2), sp('stamp', 4, 6), sp('tubes', 14, 2), sp('center', 9, 6)],
  },
  {
    id: 'huddle',
    name: 'Huddle Room',
    short: 'Huddle',
    owner: null,
    col: 1,
    row: 2,
    props: [p('table', 'huddle-table', 5, 4, 8, 3, 'huddle', true, 'Huddle'), p('wb', 'whiteboard', 2, 1, 4, 1, 'huddle', true)],
    spots: [...HUDDLE_SEATS, sp('center', 9, 9)],
  },
  {
    id: 'foundry',
    name: "Bot Builder's Foundry",
    short: 'Foundry',
    owner: 'builder',
    col: 2,
    row: 2,
    props: [
      p('bench', 'aura-bench', 2, 2, 4, 2, 'bench', true, 'Berry & Aura'),
      p('skills', 'skill-wall', 11, 1, 5, 1, 'skills', true, 'Universal Skills'),
      p('pod', 'spawn-pod', 7, 5, 3, 3, 'pod', true, 'Spawn Pod'),
      p('retired', 'retired-shelf', 13, 8, 3, 2, 'retired', true, '30-Day Vault'),
    ],
    spots: [
      sp('desk', 4, 4),
      sp('skills', 13, 2),
      sp('pod', 8, 8),
      sp('retired', 12, 9),
      sp('c0', 6, 6),
      sp('c1', 11, 6),
      sp('c2', 6, 8),
      sp('c3', 11, 8),
      sp('center', 9, 3),
    ],
  },
];

export const ROOMS: readonly RoomDef[] = BLUEPRINTS.map((b) => ({
  id: b.id,
  name: b.name,
  short: b.short,
  owner: b.owner,
  x: CORRIDOR + b.col * (ROOM_W + CORRIDOR),
  y: CORRIDOR + b.row * (ROOM_H + CORRIDOR),
  w: ROOM_W,
  h: ROOM_H,
  props: b.props,
  spots: b.spots,
}));

export const ROOM_BY_ID: Readonly<Record<RoomId, RoomDef>> = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<
  RoomId,
  RoomDef
>;

export interface Point {
  x: number;
  y: number;
}

/** Door tiles (local) on each side: two tiles wide, centered. */
export function doorTilesLocal(): Point[] {
  const cx = Math.floor(ROOM_W / 2) - 1;
  const cy = Math.floor(ROOM_H / 2) - 1;
  return [
    { x: cx, y: 0 },
    { x: cx + 1, y: 0 },
    { x: cx, y: ROOM_H - 1 },
    { x: cx + 1, y: ROOM_H - 1 },
    { x: 0, y: cy },
    { x: 0, y: cy + 1 },
    { x: ROOM_W - 1, y: cy },
    { x: ROOM_W - 1, y: cy + 1 },
  ];
}

export interface Grid {
  w: number;
  h: number;
  tiles: Uint8Array;
  /** Room id per tile (index into ROOMS) or -1. */
  roomIndex: Int8Array;
}

export function buildGrid(): Grid {
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const roomIndex = new Int8Array(MAP_W * MAP_H).fill(-1);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
      tiles[y * MAP_W + x] = edge ? Tile.Void : Tile.Corridor;
    }
  }
  const doors = doorTilesLocal();
  ROOMS.forEach((room, ri) => {
    for (let ly = 0; ly < room.h; ly++) {
      for (let lx = 0; lx < room.w; lx++) {
        const i = (room.y + ly) * MAP_W + room.x + lx;
        const wall = lx === 0 || ly === 0 || lx === room.w - 1 || ly === room.h - 1;
        tiles[i] = wall ? Tile.Wall : Tile.Floor;
        roomIndex[i] = ri;
      }
    }
    for (const d of doors) tiles[(room.y + d.y) * MAP_W + room.x + d.x] = Tile.Door;
    for (const prop of room.props) {
      if (!prop.blocking) continue;
      for (let ly = prop.y; ly < prop.y + prop.h; ly++) {
        for (let lx = prop.x; lx < prop.x + prop.w; lx++) {
          tiles[(room.y + ly) * MAP_W + room.x + lx] = Tile.Prop;
        }
      }
    }
  });
  return { w: MAP_W, h: MAP_H, tiles, roomIndex };
}

export function isWalkable(grid: Grid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return false;
  const t = grid.tiles[y * grid.w + x];
  return t === Tile.Corridor || t === Tile.Floor || t === Tile.Door;
}

export function roomAtTile(grid: Grid, x: number, y: number): RoomDef | null {
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return null;
  const ri = grid.roomIndex[y * grid.w + x] ?? -1;
  return ri >= 0 ? (ROOMS[ri] ?? null) : null;
}

export function roomAtWorld(grid: Grid, wx: number, wy: number): RoomDef | null {
  return roomAtTile(grid, Math.floor(wx / TILE), Math.floor(wy / TILE));
}

/** Global tile coordinate of a named spot. */
export function spotTile(roomId: RoomId, spotName: string): Point {
  const room = ROOM_BY_ID[roomId];
  const s = room.spots.find((q) => q.name === spotName) ?? room.spots.find((q) => q.name === 'center');
  if (!s) return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
  return { x: room.x + s.x, y: room.y + s.y };
}

export function tileCenter(t: Point): Point {
  return { x: t.x * TILE + TILE / 2, y: t.y * TILE + TILE / 2 };
}

export function worldToTile(p: Point): Point {
  return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
}

/** World-pixel rect of a room. */
export function roomRect(room: RoomDef): { x: number; y: number; w: number; h: number } {
  return { x: room.x * TILE, y: room.y * TILE, w: room.w * TILE, h: room.h * TILE };
}

/** World-pixel rect of a prop. */
export function propRect(room: RoomDef, prop: PropDef): { x: number; y: number; w: number; h: number } {
  return { x: (room.x + prop.x) * TILE, y: (room.y + prop.y) * TILE, w: prop.w * TILE, h: prop.h * TILE };
}

export function hotspotAt(wx: number, wy: number): { room: RoomDef; prop: PropDef } | null {
  for (const room of ROOMS) {
    for (const prop of room.props) {
      if (!prop.hotspot) continue;
      const r = propRect(room, prop);
      if (wx >= r.x - 4 && wy >= r.y - 4 && wx <= r.x + r.w + 4 && wy <= r.y + r.h + 4) return { room, prop };
    }
  }
  return null;
}

export function findProp(roomId: RoomId, propId: string): PropDef | undefined {
  return ROOM_BY_ID[roomId].props.find((q) => q.id === propId);
}

/** World-pixel center of a prop. */
export function propCenter(roomId: RoomId, propId: string): Point {
  const room = ROOM_BY_ID[roomId];
  const prop = findProp(roomId, propId);
  if (!prop) return tileCenter(spotTile(roomId, 'center'));
  const r = propRect(room, prop);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// ---------------------------------------------------------------------------
// Pneumatic tubes: overhead glass tubes routed along corridor center lines.
// ---------------------------------------------------------------------------

const corridorCenter = (i: number) => (i * (ROOM_W + CORRIDOR) + CORRIDOR / 2) * TILE; // vertical lines, x
const corridorCenterY = (i: number) => (i * (ROOM_H + CORRIDOR) + CORRIDOR / 2) * TILE; // horizontal lines, y

function roomColRow(room: RoomDef): { col: number; row: number } {
  return {
    col: Math.round((room.x - CORRIDOR) / (ROOM_W + CORRIDOR)),
    row: Math.round((room.y - CORRIDOR) / (ROOM_H + CORRIDOR)),
  };
}

/** The port (world px) where overhead tubes enter a room: on its top wall. */
export function tubePort(roomId: RoomId): Point {
  const room = ROOM_BY_ID[roomId];
  const port = room.props.find((q) => q.kind === 'tube-port');
  const x = port ? (room.x + port.x + port.w / 2) * TILE : (room.x + room.w - 4.5) * TILE;
  return { x, y: room.y * TILE + 4 };
}

/**
 * Manhattan route between two rooms' tube ports using corridor center lines.
 * Exits through the top wall, rides the corridor above, drops down a vertical
 * corridor, and enters the target through its top wall.
 */
export function tubeRoute(from: RoomId, to: RoomId): Point[] {
  const A = ROOM_BY_ID[from];
  const B = ROOM_BY_ID[to];
  const a = tubePort(from);
  const b = tubePort(to);
  const ca = roomColRow(A);
  const cb = roomColRow(B);
  const yA = corridorCenterY(ca.row);
  const yB = corridorCenterY(cb.row);
  const vx = cb.col > ca.col ? corridorCenter(ca.col + 1) : cb.col < ca.col ? corridorCenter(ca.col) : corridorCenter(ca.col + 1);
  const pts: Point[] = [a, { x: a.x, y: yA }];
  if (ca.row !== cb.row || vx !== a.x) {
    pts.push({ x: vx, y: yA });
    pts.push({ x: vx, y: yB });
  }
  pts.push({ x: b.x, y: yB });
  pts.push(b);
  // Drop consecutive duplicates.
  return pts.filter((q, i) => i === 0 || q.x !== pts[i - 1]!.x || q.y !== pts[i - 1]!.y);
}

/** Tube from outside the building (top edge) into a room — for incoming mail/reels. */
export function intakeRoute(to: RoomId): Point[] {
  const B = ROOM_BY_ID[to];
  const b = tubePort(to);
  const cb = roomColRow(B);
  const yB = corridorCenterY(cb.row);
  const edgeX = corridorCenter(cb.col);
  return [
    { x: edgeX, y: 0 },
    { x: edgeX, y: yB },
    { x: b.x, y: yB },
    b,
  ];
}

export const TUBE_ROUTES: readonly { from: RoomId | 'outside'; to: RoomId; points: Point[] }[] = (() => {
  const routes: { from: RoomId | 'outside'; to: RoomId; points: Point[] }[] = [];
  for (const r of ROOMS) {
    if (r.id !== 'command') routes.push({ from: r.id, to: 'command', points: tubeRoute(r.id, 'command') });
    if (r.id !== 'life' && r.id !== 'command') routes.push({ from: r.id, to: 'life', points: tubeRoute(r.id, 'life') });
  }
  routes.push({ from: 'command', to: 'life', points: tubeRoute('command', 'life') });
  routes.push({ from: 'outside', to: 'mail', points: intakeRoute('mail') });
  routes.push({ from: 'outside', to: 'media', points: intakeRoute('media') });
  routes.push({ from: 'outside', to: 'cutting', points: intakeRoute('cutting') });
  return routes;
})();

export function polylineLength(pts: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return len;
}

export function pointAlong(pts: readonly Point[], t: number): Point {
  const total = polylineLength(pts);
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= seg || i === pts.length - 1) {
      const k = seg === 0 ? 0 : Math.min(1, d / seg);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    d -= seg;
  }
  return pts[pts.length - 1] ?? { x: 0, y: 0 };
}
