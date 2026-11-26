/**
 * HQ floorplan: a hand-drawn, asymmetric station. Ten rooms of different
 * sizes and shapes (an octagonal Command hub, a cockpit-nosed Bridge, L-shaped
 * and notched wings, an Arcade hanging off the south end) are linked by
 * winding corridors of varying width that branch, dog-leg and dead-end, with
 * outdoor courtyard gardens between the wings.
 *
 * Everything is defined in tiles; the renderers and the simulation convert to
 * world pixels with TILE. Room outlines are polygons in local tile units
 * (axis-aligned or 45° edges); a tile belongs to a room when its centre lies
 * strictly inside the outline. Corridors are explicit tile rects.
 */
import type { RoomId } from '../data/bots';
import { boxOutline, pointInPoly, type Corner, type Pt, type TileRect } from './geometry';

export type { TileRect } from './geometry';

export const TILE = 32;
export const MAP_W = 79;
export const MAP_H = 64;
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
  | 'retired'
  | 'arcade'
  | 'leaderboard';

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
  | 'retired-shelf'
  | 'arcade-cabinet'
  | 'leaderboard'
  | 'neon-sign';

export interface PropDef {
  id: string;
  kind: PropKind;
  /** Local tile coords inside the room's bounding box (must sit on room floor). */
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

export type Side = 'n' | 's' | 'e' | 'w';

/** A door: a run of wall tiles (local) opening toward `side`. */
export interface DoorDef {
  side: Side;
  /** Local tiles of the opening, in order along the wall. */
  tiles: Point[];
}

export interface RoomDef {
  id: RoomId;
  name: string;
  short: string;
  owner: string | null;
  /** Tile origin of the room's bounding box (top-left). */
  x: number;
  y: number;
  /** Bounding box size in tiles. */
  w: number;
  h: number;
  /** Outline polygon in local tile units (clockwise, vertices on tile corners). */
  outline: Pt[];
  doors: DoorDef[];
  props: PropDef[];
  spots: SpotDef[];
}

interface DoorSpec {
  side: Side;
  /** Column (n/s) or row (e/w) of the first door tile, local. */
  at: number;
  len?: number;
}

interface RoomBlueprint {
  id: RoomId;
  name: string;
  short: string;
  owner: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  corners?: { tl?: Corner; tr?: Corner; br?: Corner; bl?: Corner };
  doors: DoorSpec[];
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
const d = (side: Side, at: number, len = 2): DoorSpec => ({ side, at, len });
const chamfer = (n: number): Corner => ({ chamfer: n });
const notch = (dx: number, dy: number): Corner => ({ notch: [dx, dy] });

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
    // North-west wing: a tall L (the notch opens onto the engine courtyard).
    id: 'engine',
    name: "Kanye's Engine Room",
    short: 'Engine Room',
    owner: 'kanye',
    x: 3,
    y: 2,
    w: 16,
    h: 18,
    corners: { br: notch(6, 6), tl: chamfer(2) },
    doors: [d('e', 6), d('w', 9), d('s', 5)],
    props: [
      p('term1', 'terminal', 2, 2, 3, 1, 'terminal', true, 'tty1'),
      p('term2', 'terminal', 2, 13, 3, 1, 'terminal', true, 'tty2'),
      p('term3', 'terminal', 9, 2, 3, 1, 'terminal', true, 'tty0'),
      p('polaroids', 'polaroid-board', 9, 9, 4, 1, 'polaroid', true, '⇧⌘S'),
      p('relay', 'relay-rack', 12, 4, 2, 4, 'relay', true, 'Relay'),
      p('plant1', 'plant', 7, 16, 1, 1, undefined, true),
    ],
    spots: [sp('desk', 10, 3), sp('t1', 3, 3), sp('t2', 3, 14), sp('polaroid', 10, 8), sp('relay', 11, 6), sp('center', 6, 7)],
  },
  {
    // The station's nose: a wide cockpit with angled front glass.
    id: 'bridge',
    name: "Moose's Co-Pilot Bridge",
    short: 'Co-Pilot Bridge',
    owner: 'moose',
    x: 33,
    y: 1,
    w: 18,
    h: 10,
    corners: { tl: chamfer(3), tr: chamfer(3) },
    doors: [d('s', 8), d('w', 5), d('e', 5)],
    props: [
      p('conduit', 'conduit', 1, 4, 16, 2, undefined, false, 'Agent ↔ Life sync'),
      p('vdesk', 'violet-desk', 6, 6, 6, 2, 'bridge', true, 'Co-Pilot'),
      p('wave', 'wave-indicator', 4, 1, 4, 1, 'wave', true, 'Dictation'),
      p('screens', 'screens-board', 10, 1, 4, 1, 'screens', true, 'Screenshots'),
    ],
    spots: [sp('desk', 9, 5), sp('wave', 5, 2), sp('screens', 11, 2), sp('w1', 3, 7), sp('center', 9, 3)],
  },
  {
    // North-east wing, notched where the east service corridor tucks in.
    id: 'life',
    name: "Barry's Marion Life Hub & Vault",
    short: 'Marion Life Hub',
    owner: 'barry',
    x: 58,
    y: 1,
    w: 19,
    h: 13,
    corners: { tl: notch(5, 3), br: chamfer(2) },
    doors: [d('w', 7), d('s', 10)],
    props: [
      p('planner', 'planner-board', 7, 1, 6, 1, 'planner', true, 'Planner'),
      p('turntable', 'turntable', 14, 2, 3, 2, 'turntable', true, 'Turntable'),
      p('mic', 'mic', 17, 5, 1, 1, 'mic', true, 'Mic'),
      p('vault', 'vault-cabinet', 2, 7, 4, 3, 'vault', true, 'Vault'),
      p('mcp', 'mcp-door', 16, 8, 1, 2, 'mcp', true, 'MCP'),
      p('ldesk', 'life-desk', 8, 7, 3, 1, 'planner', true, 'marionberry.app'),
      p('plant1', 'plant', 1, 4, 1, 1, undefined, true),
    ],
    spots: [sp('desk', 9, 8), sp('planner', 9, 2), sp('turntable', 15, 4), sp('mic', 17, 6), sp('vault', 6, 8), sp('mcp', 15, 9), sp('center', 10, 5)],
  },
  {
    // West wing below the Engine Room; its corner is cut toward the orchard.
    id: 'media',
    name: "Sift's Media Vault",
    short: 'Media Vault',
    owner: 'sift',
    x: 6,
    y: 26,
    w: 15,
    h: 12,
    corners: { bl: chamfer(3), tr: chamfer(2) },
    doors: [d('n', 2), d('e', 5)],
    props: [
      p('monitors', 'monitor-wall', 4, 1, 5, 1, 'monitors', true, 'Reels · YouTube'),
      p('llm', 'llm-console', 9, 1, 3, 1, 'llm', true, 'LLM'),
      p('dimmer', 'dimmer', 13, 2, 1, 1, 'dimmer', true, 'Dimmer'),
      p('fts', 'fts-cabinet', 12, 7, 2, 3, 'fts', true, 'FTS5'),
      p('intake', 'intake-chute', 3, 7, 2, 2, 'intake', true, 'Intake'),
      p('couch', 'couch', 6, 4, 4, 1, undefined, true),
    ],
    spots: [sp('desk', 6, 2), sp('llm', 10, 2), sp('dimmer', 13, 3), sp('fts', 11, 8), sp('intake', 5, 7), sp('center', 8, 7)],
  },
  {
    // The hub: a big octagon at the heart of the station, one door per side.
    id: 'command',
    name: 'Central Command',
    short: 'Command',
    owner: 'daniel',
    x: 29,
    y: 15,
    w: 24,
    h: 18,
    corners: { tl: chamfer(4), tr: chamfer(4), br: chamfer(4), bl: chamfer(4) },
    doors: [d('n', 11), d('s', 11), d('w', 8), d('e', 8)],
    props: [
      p('cdesk', 'command-desk', 13, 3, 5, 2, 'command', true, 'Command'),
      p('brain', 'brain', 5, 4, 2, 2, 'brain', true, 'Universal Brain'),
      p('chute', 'release-chute', 17, 11, 3, 3, 'release', true, 'Release'),
      p('plant1', 'plant', 4, 12, 1, 1, undefined, true),
      p('plant2', 'plant', 9, 2, 1, 1, undefined, true),
      p('plant3', 'plant', 19, 5, 1, 1, undefined, true),
      p('couch', 'couch', 6, 14, 4, 1, undefined, true),
      p('couch2', 'couch', 14, 15, 4, 1, undefined, true),
      p('plant4', 'plant', 20, 14, 1, 1, undefined, true),
      p('plant5', 'plant', 2, 6, 1, 1, undefined, true),
    ],
    spots: [sp('desk', 15, 5), sp('inbox', 13, 5), sp('brain', 6, 6), sp('chute', 16, 10), sp('center', 11, 9)],
  },
  {
    // East wing: a dark octagonal edit suite.
    id: 'cutting',
    name: "Greek's Cutting Room",
    short: 'Cutting Room',
    owner: 'greek',
    x: 57,
    y: 18,
    w: 16,
    h: 14,
    corners: { tl: chamfer(3), tr: chamfer(3), br: chamfer(3), bl: chamfer(3) },
    doors: [d('w', 7), d('n', 11), d('s', 7)],
    props: [
      p('tlmon', 'timeline-monitors', 3, 1, 5, 1, 'jog', true, 'A/B'),
      p('jog', 'jog-desk', 3, 3, 5, 1, 'jog', true, 'Jog'),
      p('timeline', 'timeline-table', 10, 3, 4, 2, 'timeline', true, 'Timeline'),
      p('bins', 'clip-bins', 9, 9, 4, 2, 'bins', true, 'Bins'),
      p('clapper', 'clapperboard', 3, 10, 1, 1, undefined, true),
      p('lamp', 'render-lamp', 14, 6, 1, 1, 'render', true, 'Render'),
    ],
    spots: [sp('desk', 5, 4), sp('timeline', 11, 5), sp('bins', 10, 8), sp('render', 13, 6), sp('center', 7, 7)],
  },
  {
    // South-west wing: an L whose notch frames the mail-yard garden.
    id: 'mail',
    name: "Quill's Mailroom",
    short: 'Mailroom',
    owner: 'quill',
    x: 1,
    y: 43,
    w: 19,
    h: 12,
    corners: { tl: notch(6, 4), bl: chamfer(2) },
    doors: [d('n', 13), d('e', 8)],
    props: [
      p('sortwall', 'sorting-wall', 7, 1, 5, 1, 'sort', true, 'Action · FYI · Noise'),
      p('redpen', 'redpen-desk', 12, 5, 3, 2, 'redpen', true, 'Red Pen'),
      p('stamp', 'stamp-press', 3, 7, 2, 2, 'stamp', true, 'Approve'),
      p('outbox', 'outbox', 5, 9, 3, 1, 'stamp', true, 'Outbox'),
      p('tubes', 'tube-port', 15, 1, 3, 1, 'tubes', true, 'Tubes'),
    ],
    spots: [sp('desk', 13, 7), sp('sort', 9, 2), sp('stamp', 4, 6), sp('tubes', 16, 2), sp('center', 9, 6)],
  },
  {
    id: 'huddle',
    name: 'Huddle Room',
    short: 'Huddle',
    owner: null,
    x: 27,
    y: 37,
    w: 18,
    h: 11,
    corners: { bl: chamfer(2), br: chamfer(2) },
    doors: [d('n', 13), d('w', 4), d('e', 6)],
    props: [p('table', 'huddle-table', 5, 4, 8, 3, 'huddle', true, 'Huddle'), p('wb', 'whiteboard', 2, 1, 4, 1, 'huddle', true), p('plant1', 'plant', 15, 1, 1, 1, undefined, true)],
    spots: [...HUDDLE_SEATS, sp('center', 9, 9)],
  },
  {
    // South-east wing: a big workshop notched at its north-west corner.
    id: 'foundry',
    name: "Bot Builder's Foundry",
    short: 'Foundry',
    owner: 'builder',
    x: 58,
    y: 38,
    w: 20,
    h: 15,
    corners: { tl: notch(4, 4), br: chamfer(3) },
    doors: [d('w', 8), d('n', 6)],
    props: [
      p('bench', 'aura-bench', 6, 2, 4, 2, 'bench', true, 'Berry & Aura'),
      p('skills', 'skill-wall', 12, 1, 5, 1, 'skills', true, 'Universal Skills'),
      p('pod', 'spawn-pod', 8, 6, 3, 3, 'pod', true, 'Spawn Pod'),
      p('retired', 'retired-shelf', 15, 9, 3, 2, 'retired', true, '30-Day Vault'),
      p('plant1', 'plant', 2, 13, 1, 1, undefined, true),
    ],
    spots: [
      sp('desk', 7, 4),
      sp('skills', 14, 2),
      sp('pod', 9, 10),
      sp('retired', 14, 10),
      sp('c0', 7, 7),
      sp('c1', 12, 7),
      sp('c2', 7, 9),
      sp('c3', 12, 9),
      sp('center', 11, 4),
    ],
  },
  {
    // A neon wing hanging off the south end, reached only by the west walk.
    id: 'arcade',
    name: 'The Arcade',
    short: 'Arcade',
    owner: null,
    x: 36,
    y: 51,
    w: 19,
    h: 12,
    corners: { bl: chamfer(2), br: chamfer(2), tr: chamfer(2) },
    doors: [d('w', 5)],
    props: [
      p('cab1', 'arcade-cabinet', 2, 1, 2, 2, undefined, true, 'Berry Blaster'),
      p('cab2', 'arcade-cabinet', 4, 1, 2, 2, undefined, true, 'Neon Drift'),
      p('neon', 'neon-sign', 9, 1, 4, 1, undefined, true, 'ARCADE'),
      p('cab3', 'arcade-cabinet', 14, 2, 2, 2, undefined, true, 'Glow Hockey'),
      p('mystery', 'arcade-cabinet', 7, 4, 4, 2, 'arcade', true, 'Marion Mystery'),
      p('cab4', 'arcade-cabinet', 15, 7, 2, 2, undefined, true, 'Quill Quest'),
      p('board', 'leaderboard', 10, 9, 4, 2, 'leaderboard', true, 'Leaderboard'),
      p('sofa', 'couch', 3, 9, 4, 1, undefined, true),
      p('plant1', 'plant', 7, 10, 1, 1, undefined, true),
      p('plant2', 'plant', 15, 10, 1, 1, undefined, true),
    ],
    spots: [
      // Player spots in front of each cabinet (bots "play" = working here).
      sp('p0', 7, 6),
      sp('p1', 8, 6),
      sp('p2', 9, 6),
      sp('p3', 10, 6),
      sp('p4', 3, 3),
      sp('p5', 5, 3),
      sp('p6', 13, 3),
      sp('p7', 14, 9),
      sp('board', 12, 8),
      sp('couch', 5, 8),
      sp('center', 9, 8),
    ],
  },
];

/**
 * Corridors (tile rects; room tiles win where they overlap). Widths vary from
 * the 2-tile service passages to the 7-tile south-west plaza, and most runs
 * dog-leg rather than meet on a grid.
 */
export const CORRIDORS: readonly TileRect[] = [
  { x: 39, y: 11, w: 5, h: 4 }, // grand hall: Bridge ↔ Command
  { x: 24, y: 5, w: 9, h: 3 }, // north walk (Bridge west door)…
  { x: 19, y: 7, w: 7, h: 3 }, // …dog-legs down to the Engine Room
  { x: 21, y: 1, w: 3, h: 6 }, // dead-end loading dock (tube intake)
  { x: 51, y: 5, w: 4, h: 3 }, // north-east walk (Bridge east door)…
  { x: 53, y: 8, w: 5, h: 3 }, // …steps down to the Life Hub
  { x: 1, y: 6, w: 2, h: 13 }, // Mac gallery (Engine west door, dead end)
  { x: 8, y: 20, w: 2, h: 6 }, // service passage Engine ↔ Media
  { x: 20, y: 10, w: 3, h: 13 }, // west spine…
  { x: 21, y: 22, w: 8, h: 4 }, // west arm into Command
  { x: 21, y: 26, w: 3, h: 10 }, // …past the Media Vault…
  { x: 18, y: 36, w: 7, h: 6 }, // …into the south-west plaza
  { x: 13, y: 40, w: 6, h: 3 }, // plaza → Mailroom
  { x: 25, y: 40, w: 2, h: 3 }, // plaza → Huddle
  { x: 21, y: 42, w: 3, h: 14 }, // the long walk south…
  { x: 20, y: 51, w: 1, h: 2 }, // (the Mailroom's back door)
  { x: 21, y: 56, w: 15, h: 3 }, // …and east along the bottom to the Arcade
  { x: 39, y: 33, w: 4, h: 4 }, // Command ↔ Huddle
  { x: 53, y: 22, w: 4, h: 5 }, // east arm out of Command (Cutting Room door)
  { x: 67, y: 14, w: 4, h: 4 }, // Life Hub ↔ Cutting Room link
  { x: 53, y: 27, w: 3, h: 15 }, // east spine
  { x: 45, y: 42, w: 11, h: 3 }, // Huddle east door → east spine
  { x: 54, y: 45, w: 4, h: 3 }, // east spine → Foundry
  { x: 63, y: 32, w: 4, h: 6 }, // Cutting Room ↔ Foundry
];

/** Outdoor courtyards / gardens between the wings (tile rects of open ground). */
export const COURTYARDS: readonly TileRect[] = [
  { x: 13, y: 14, w: 6, h: 11 }, // Engine courtyard (in the Engine Room's notch)
  { x: 23, y: 11, w: 6, h: 10 }, // hub garden west of Command
  { x: 53, y: 12, w: 4, h: 9 }, // east garden under the Life Hub
  { x: 1, y: 28, w: 5, h: 18 }, // west orchard (runs into the Mailroom's notch)
  { x: 25, y: 49, w: 10, h: 6 }, // garden below the Huddle
  { x: 46, y: 46, w: 7, h: 4 }, // little court by the east walk
  { x: 57, y: 54, w: 19, h: 7 }, // foundry lawn
  { x: 2, y: 57, w: 17, h: 5 }, // south meadow
];

/** Cabinet player spots in the Arcade, best (Marion Mystery) first. */
export const ARCADE_SEATS: readonly string[] = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];

export interface Point {
  x: number;
  y: number;
}

/** Per-room tile mask over its bounding box: 0 outside, 1 floor, 2 wall. */
function roomMask(outline: readonly Pt[], w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && pointInPoly({ x: x + 0.5, y: y + 0.5 }, outline);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = inside(x, y) ? 1 : 0;
  const In = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] !== 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!In(x, y)) continue;
      let wall = !In(x - 1, y) || !In(x + 1, y) || !In(x, y - 1) || !In(x, y + 1);
      // Concave (inside) corners of orthogonal notches close the wall line.
      if (!wall)
        for (const [dx, dy] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ] as const)
          if (!In(x + dx, y + dy) && In(x + 2 * dx, y) && In(x, y + 2 * dy)) wall = true;
      if (wall) m[y * w + x] = 2;
    }
  return m;
}

const MASKS = new Map<RoomId, Uint8Array>();

function resolveDoor(id: RoomId, mask: Uint8Array, w: number, h: number, s: DoorSpec): DoorDef {
  const len = s.len ?? 2;
  const tiles: Point[] = [];
  const In = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] !== 0;
  for (let k = 0; k < len; k++) {
    const a = s.at + k;
    let t: Point | null = null;
    if (s.side === 'n') for (let y = 0; y < h && !t; y++) if (In(a, y)) t = { x: a, y };
    if (s.side === 's') for (let y = h - 1; y >= 0 && !t; y--) if (In(a, y)) t = { x: a, y };
    if (s.side === 'w') for (let x = 0; x < w && !t; x++) if (In(x, a)) t = { x, y: a };
    if (s.side === 'e') for (let x = w - 1; x >= 0 && !t; x--) if (In(x, a)) t = { x, y: a };
    if (!t) throw new Error(`door ${id}.${s.side}@${s.at}: no wall`);
    tiles.push(t);
  }
  const line = s.side === 'n' || s.side === 's' ? tiles.every((t) => t.y === tiles[0]!.y) : tiles.every((t) => t.x === tiles[0]!.x);
  if (!line) throw new Error(`door ${id}.${s.side}@${s.at}: not on a straight wall`);
  return { side: s.side, tiles };
}

export const ROOMS: readonly RoomDef[] = BLUEPRINTS.map((b) => {
  const outline = boxOutline(b.w, b.h, b.corners);
  const mask = roomMask(outline, b.w, b.h);
  MASKS.set(b.id, mask);
  return {
    id: b.id,
    name: b.name,
    short: b.short,
    owner: b.owner,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    outline,
    doors: b.doors.map((s) => resolveDoor(b.id, mask, b.w, b.h, s)),
    props: b.props,
    spots: b.spots,
  };
});

export const ROOM_BY_ID: Readonly<Record<RoomId, RoomDef>> = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<
  RoomId,
  RoomDef
>;

/** What a room's local tile is: 'out' (not part of the room), 'floor' or 'wall'. */
export function roomTileKind(room: RoomDef, lx: number, ly: number): 'out' | 'floor' | 'wall' {
  if (lx < 0 || ly < 0 || lx >= room.w || ly >= room.h) return 'out';
  const v = MASKS.get(room.id)![ly * room.w + lx];
  return v === 2 ? 'wall' : v === 1 ? 'floor' : 'out';
}

/** All door tiles of a room (local). */
export function doorTilesLocal(room: RoomDef): Point[] {
  return room.doors.flatMap((dd) => dd.tiles);
}

const SIDE_NORMAL: Record<Side, Point> = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 }, e: { x: 1, y: 0 } };

/** Outward unit normal of a door side. */
export function sideNormal(side: Side): Point {
  return SIDE_NORMAL[side];
}

/** A door as a world-px segment on the room outline, with its outward normal. */
export function doorSegment(room: RoomDef, door: DoorDef): { a: Point; b: Point; n: Point } {
  const n = SIDE_NORMAL[door.side];
  const t0 = door.tiles[0]!;
  const t1 = door.tiles[door.tiles.length - 1]!;
  const gx = (lx: number) => (room.x + lx) * TILE;
  const gy = (ly: number) => (room.y + ly) * TILE;
  if (door.side === 'n' || door.side === 's') {
    const y = door.side === 'n' ? gy(t0.y) : gy(t0.y + 1);
    return { a: { x: gx(Math.min(t0.x, t1.x)), y }, b: { x: gx(Math.max(t0.x, t1.x) + 1), y }, n };
  }
  const x = door.side === 'w' ? gx(t0.x) : gx(t0.x + 1);
  return { a: { x, y: gy(Math.min(t0.y, t1.y)) }, b: { x, y: gy(Math.max(t0.y, t1.y) + 1) }, n };
}

/** Room outline in world px. */
export function roomPolygon(room: RoomDef): Point[] {
  return room.outline.map((q) => ({ x: (room.x + q.x) * TILE, y: (room.y + q.y) * TILE }));
}

/** Where a room's legend label sits (world px): the left end of its topmost wall. */
export function roomLabelAnchor(room: RoomDef): Point {
  let best = room.outline[0]!;
  for (const q of room.outline) if (q.y < best.y || (q.y === best.y && q.x < best.x)) best = q;
  return { x: (room.x + best.x) * TILE, y: (room.y + best.y) * TILE };
}

export interface Grid {
  w: number;
  h: number;
  tiles: Uint8Array;
  /** Room id per tile (index into ROOMS) or -1. */
  roomIndex: Int8Array;
}

const inRect = (r: TileRect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/**
 * Outdoor courtyard garden: Void tiles inside one of the COURTYARDS. They are
 * not walkable and are painted as gardens by the renderers.
 */
export function isTerrace(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  if (!COURTYARDS.some((r) => inRect(r, x, y))) return false;
  return baseGrid().tiles[y * MAP_W + x] === Tile.Void;
}

let cachedGrid: Grid | null = null;
function baseGrid(): Grid {
  return (cachedGrid ??= buildGrid());
}

export function buildGrid(): Grid {
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const roomIndex = new Int8Array(MAP_W * MAP_H).fill(-1);
  for (const r of CORRIDORS)
    for (let y = Math.max(1, r.y); y < Math.min(MAP_H - 1, r.y + r.h); y++)
      for (let x = Math.max(1, r.x); x < Math.min(MAP_W - 1, r.x + r.w); x++) tiles[y * MAP_W + x] = Tile.Corridor;
  ROOMS.forEach((room, ri) => {
    for (let ly = 0; ly < room.h; ly++) {
      for (let lx = 0; lx < room.w; lx++) {
        const k = roomTileKind(room, lx, ly);
        if (k === 'out') continue;
        const i = (room.y + ly) * MAP_W + room.x + lx;
        tiles[i] = k === 'wall' ? Tile.Wall : Tile.Floor;
        roomIndex[i] = ri;
      }
    }
    for (const dt of doorTilesLocal(room)) tiles[(room.y + dt.y) * MAP_W + room.x + dt.x] = Tile.Door;
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
  const room = roomAtTile(grid, Math.floor(wx / TILE), Math.floor(wy / TILE));
  // Tiles under an angled corner belong to the room's bounding grid; only count
  // points inside the real outline (so clicks just outside a cut corner miss).
  if (room && !pointInPoly({ x: wx, y: wy }, roomPolygon(room), true)) return null;
  return room;
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

/** World-pixel bounding rect of a room. */
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
// Pneumatic tubes: overhead glass tubes. Routes are found on the tile grid
// (preferring corridors, avoiding other rooms, penalising bends) so they
// follow the station's winding halls.
// ---------------------------------------------------------------------------

const portCache = new Map<RoomId, Point>();

/**
 * Top-wall tile (local x, y) where a room's tube port sits: above its
 * tube-port prop if it has one, else on the topmost wall run at the column
 * whose outside is nearest a corridor (so tubes leave straight into a hall).
 */
function tubePortTile(room: RoomDef): Point {
  const hit = portCache.get(room.id);
  if (hit) return hit;
  const topOf = (lx: number) => {
    let ly = 0;
    while (ly < room.h && roomTileKind(room, lx, ly) === 'out') ly++;
    return ly;
  };
  const port = room.props.find((q) => q.kind === 'tube-port');
  let best: Point;
  if (port) {
    const lx = port.x + Math.floor(port.w / 2);
    best = { x: lx, y: topOf(lx) };
  } else {
    const grid = baseGrid();
    const doors = doorTilesLocal(room);
    const minTop = Math.min(...Array.from({ length: room.w }, (_, lx) => topOf(lx)));
    let bestScore = Infinity;
    best = { x: room.w - 5, y: topOf(room.w - 5) };
    for (let lx = 2; lx < room.w - 2; lx++) {
      const ly = topOf(lx);
      if (ly !== minTop || roomTileKind(room, lx, ly) !== 'wall') continue;
      if (doors.some((q) => Math.abs(q.x - lx) <= 1 && q.y === ly)) continue;
      const gx = room.x + lx;
      const gy = room.y + ly - 1;
      let dist = 99;
      for (let r = 0; r < 12 && dist === 99; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const x = gx + dx;
            const y = gy + dy;
            if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && grid.tiles[y * MAP_W + x] === Tile.Corridor) dist = Math.min(dist, r);
          }
      const score = dist + Math.abs(lx - (room.w - 5)) * 0.05;
      if (score < bestScore) {
        bestScore = score;
        best = { x: lx, y: ly };
      }
    }
  }
  portCache.set(room.id, best);
  return best;
}

/** The port (world px) where overhead tubes enter a room: on its top wall. */
export function tubePort(roomId: RoomId): Point {
  const room = ROOM_BY_ID[roomId];
  const t = tubePortTile(room);
  return { x: (room.x + t.x + 0.5) * TILE, y: (room.y + t.y) * TILE + 4 };
}

const DIRS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/** Tiles already carrying a baked tube: later routes are drawn to them so the tubes bundle into trunks. */
const tubeUse = new Uint8Array(MAP_W * MAP_H);
let bundling = false;

/**
 * Bend-penalised Dijkstra over tiles from any of `starts` to `goal`; returns
 * the tile path (start … goal) or null. Prefers existing tube runs, then
 * corridors, then open ground; avoids crossing rooms.
 */
function tubeSearch(starts: readonly Point[], goal: Point): Point[] | null {
  const grid = baseGrid();
  const W = MAP_W;
  const N = W * MAP_H * 4;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const open: [number, number][] = [];
  const push = (s: number, c: number) => {
    open.push([s, c]);
    let i = open.length - 1;
    while (i > 0) {
      const pa = (i - 1) >> 1;
      if (open[pa]![1] <= open[i]![1]) break;
      [open[pa], open[i]] = [open[i]!, open[pa]!];
      i = pa;
    }
  };
  const pop = (): [number, number] | undefined => {
    const top = open[0];
    const last = open.pop();
    if (open.length && last) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < open.length && open[l]![1] < open[m]![1]) m = l;
        if (r < open.length && open[r]![1] < open[m]![1]) m = r;
        if (m === i) break;
        [open[m], open[i]] = [open[i]!, open[m]!];
        i = m;
      }
    }
    return top;
  };
  const cost = (x: number, y: number) => {
    const i = y * W + x;
    const t = grid.tiles[i];
    if ((grid.roomIndex[i] ?? -1) >= 0) return 16;
    if (tubeUse[i]) return 0.3;
    if (t === Tile.Corridor) return 1;
    if (t === Tile.Void) return isTerraceRaw(x, y) ? 9 : 5;
    return 2;
  };
  for (const s of starts)
    for (let dir = 0; dir < 4; dir++) {
      const k = (s.y * W + s.x) * 4 + dir;
      dist[k] = 0;
      push(k, 0);
    }
  let end = -1;
  for (;;) {
    const it = pop();
    if (!it) break;
    const [k, c] = it;
    if (c > dist[k]!) continue;
    const cell = k >> 2;
    const dir = k & 3;
    const x = cell % W;
    const y = (cell / W) | 0;
    if (x === goal.x && y === goal.y) {
      end = k;
      break;
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === ((dir + 2) & 3)) continue;
      const nx = x + DIRS[nd]!.x;
      const ny = y + DIRS[nd]!.y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= MAP_H) continue;
      const nk = (ny * W + nx) * 4 + nd;
      const nc = c + cost(nx, ny) + (nd !== dir ? 6 : 0);
      if (nc < dist[nk]!) {
        dist[nk] = nc;
        prev[nk] = k;
        push(nk, nc);
      }
    }
  }
  if (end < 0) return null;
  const out: Point[] = [];
  for (let k = end; k >= 0; k = prev[k]!) {
    const cell = k >> 2;
    out.push({ x: cell % W, y: (cell / W) | 0 });
    if (bundling) tubeUse[cell] = 1;
  }
  return out.reverse();
}

function isTerraceRaw(x: number, y: number): boolean {
  return COURTYARDS.some((r) => inRect(r, x, y));
}

/** Drop collinear interior points (keeps an axis-aligned polyline). */
function simplifyPolyline(pts: Point[]): Point[] {
  const dedup = pts.filter((q, i) => i === 0 || q.x !== pts[i - 1]!.x || q.y !== pts[i - 1]!.y);
  return dedup.filter((q, i) => {
    if (i === 0 || i === dedup.length - 1) return true;
    const a = dedup[i - 1]!;
    const b = dedup[i + 1]!;
    return !((a.x === q.x && q.x === b.x) || (a.y === q.y && q.y === b.y));
  });
}

const routeCache = new Map<string, Point[]>();

/** Tile just above a room's tube port (where its tube leaves the room). */
function portExit(room: RoomDef): Point {
  const t = tubePortTile(room);
  return { x: room.x + t.x, y: room.y + t.y - 1 };
}

/**
 * Axis-aligned overhead tube route between two rooms' ports: up out of the
 * source's top wall, along the halls, and down into the target's top wall.
 */
export function tubeRoute(from: RoomId, to: RoomId): Point[] {
  const key = `${from}>${to}`;
  const hit = routeCache.get(key);
  if (hit) return hit.map((q) => ({ ...q }));
  const A = ROOM_BY_ID[from];
  const B = ROOM_BY_ID[to];
  const a = tubePort(from);
  const b = tubePort(to);
  const path = tubeSearch([portExit(A)], portExit(B)) ?? [];
  const pts = simplifyPolyline([a, ...path.map(tileCenter), b]);
  routeCache.set(key, pts);
  return pts.map((q) => ({ ...q }));
}

/** Tube from outside the station (the loading dock at the north edge) into a room — for incoming mail/reels. */
export function intakeRoute(to: RoomId): Point[] {
  const key = `outside>${to}`;
  const hit = routeCache.get(key);
  if (hit) return hit.map((q) => ({ ...q }));
  const B = ROOM_BY_ID[to];
  const dock = CORRIDORS[3]!;
  const start: Point = { x: dock.x + 1, y: 0 };
  const path = tubeSearch([start], portExit(B)) ?? [];
  const first = path[0] ? tileCenter(path[0]) : tileCenter(start);
  const pts = simplifyPolyline([{ x: first.x, y: 0 }, ...path.map(tileCenter), tubePort(to)]);
  routeCache.set(key, pts);
  return pts.map((q) => ({ ...q }));
}

export const TUBE_ROUTES: readonly { from: RoomId | 'outside'; to: RoomId; points: Point[] }[] = (() => {
  const routes: { from: RoomId | 'outside'; to: RoomId; points: Point[] }[] = [];
  bundling = true;
  for (const r of ROOMS) {
    if (r.id !== 'command') routes.push({ from: r.id, to: 'command', points: tubeRoute(r.id, 'command') });
    if (r.id !== 'life' && r.id !== 'command' && r.id !== 'arcade') routes.push({ from: r.id, to: 'life', points: tubeRoute(r.id, 'life') });
  }
  routes.push({ from: 'command', to: 'life', points: tubeRoute('command', 'life') });
  routes.push({ from: 'outside', to: 'mail', points: intakeRoute('mail') });
  routes.push({ from: 'outside', to: 'media', points: intakeRoute('media') });
  routes.push({ from: 'outside', to: 'cutting', points: intakeRoute('cutting') });
  bundling = false;
  return routes;
})();

export function polylineLength(pts: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return len;
}

export function pointAlong(pts: readonly Point[], t: number): Point {
  const total = polylineLength(pts);
  let dd = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (dd <= seg || i === pts.length - 1) {
      const k = seg === 0 ? 0 : Math.min(1, dd / seg);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    dd -= seg;
  }
  return pts[pts.length - 1] ?? { x: 0, y: 0 };
}
