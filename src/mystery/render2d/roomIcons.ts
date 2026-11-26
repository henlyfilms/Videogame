/**
 * Per-room map icons for the minimap, tablet and admin maps: a room type is
 * derived from its stations, name and props, and drawn as an original
 * two-tone glyph (light shape, dark details, dark halo) so it reads on any
 * theme colour and at minimap size without relying on colour. Each room also
 * gets an anchor: the cell deepest inside its footprint (works for L-shapes
 * and rect + extra-rect rooms), with the free span around it for labels.
 */
import type { CompiledMap, RoomDef } from '../core/map';
import type { StationKind } from '../core/types';

export type RoomIcon =
  | 'meeting'
  | 'security'
  | 'admin'
  | 'wardrobe'
  | 'medical'
  | 'food'
  | 'beds'
  | 'books'
  | 'mail'
  | 'arcade'
  | 'media'
  | 'music'
  | 'lounge'
  | 'server'
  | 'reactor'
  | 'engine'
  | 'lab'
  | 'plants'
  | 'water'
  | 'vault'
  | 'storage'
  | 'telescope'
  | 'helm'
  | 'launch'
  | 'train'
  | 'crypt'
  | 'gallery'
  | 'solar'
  | 'comms'
  | 'power'
  | 'outdoor'
  | 'tasks';

/** Human label for each icon (tooltips, accessibility, legends). */
export const ROOM_ICON_LABEL: Record<RoomIcon, string> = {
  meeting: 'Meeting button',
  security: 'Security',
  admin: 'Admin',
  wardrobe: 'Wardrobe',
  medical: 'Medical',
  food: 'Food',
  beds: 'Beds',
  books: 'Books',
  mail: 'Mail',
  arcade: 'Games',
  media: 'Media',
  music: 'Music',
  lounge: 'Lounge',
  server: 'Servers',
  reactor: 'Reactor',
  engine: 'Engines',
  lab: 'Lab',
  plants: 'Plants',
  water: 'Water',
  vault: 'Vault',
  storage: 'Storage',
  telescope: 'Observation',
  helm: 'Navigation',
  launch: 'Launch',
  train: 'Rail',
  crypt: 'Crypt',
  gallery: 'Gallery',
  solar: 'Solar',
  comms: 'Comms',
  power: 'Power',
  outdoor: 'Outdoors',
  tasks: 'Tasks',
};

// ---------------------------------------------------------------------------
// Classification

/** Facilities players look for first: they win over the room's theme. */
const KEY_FACILITY: [StationKind[], RoomIcon][] = [
  [['emergency'], 'meeting'],
  [['cams', 'doorlog'], 'security'],
  [['admin'], 'admin'],
  [['wardrobe'], 'wardrobe'],
];

/** Room-name keywords, checked in order. */
const NAME_RULES: [RegExp, RoomIcon][] = [
  [/security|watch room|signal box|surveil/, 'security'],
  [/infirm|medic|clinic|sick ?bay|med ?bay|hospital/, 'medical'],
  [/kitchen|galley|dining|cafe|canteen|pantry|mess hall/, 'food'],
  [/bunk|sleep|quarters|dorm|bedroom|barracks/, 'beds'],
  [/library|archive|study|reading/, 'books'],
  [/office|planner/, 'admin'],
  [/mail|post ?room/, 'mail'],
  [/arcade|game/, 'arcade'],
  [/media|cutting|film|studio|cinema/, 'media'],
  [/piano|ballroom|music|disco/, 'music'],
  [/lounge|lobby|waiting|break room/, 'lounge'],
  [/server|data/, 'server'],
  [/reactor|core\b|fusion/, 'reactor'],
  [/engine|locomotive|foundry|shed|workshop|boiler/, 'engine'],
  [/\blab\b|laborator|research|specimen/, 'lab'],
  [/garden|greenhouse|berry bay|orchard|fern|conservator|rose|maze|grove|farm|hydro/, 'plants'],
  [/water|pond|reclam|fountain|tower/, 'water'],
  [/vault|safe\b/, 'vault'],
  [/cargo|baggage|storage|closet|hold\b|attic|cellar|depot|warehouse/, 'storage'],
  [/observ|telescope|crater|stargaz/, 'telescope'],
  [/bridge|cockpit|helm|navigat/, 'helm'],
  [/airlock|dock|pods?\b|launch|hangar/, 'launch'],
  [/platform|caboose|tender|flatbed|\bcar$/, 'train'],
  [/crypt|tomb|grave|catacomb/, 'crypt'],
  [/gallery|portrait|museum|exhibit/, 'gallery'],
  [/solar|sun deck/, 'solar'],
  [/mast|antenna|comms|radio|signal|relay/, 'comms'],
];

const OTHER_FACILITY: [StationKind[], RoomIcon][] = [
  [['vitals', 'medScan'], 'medical'],
  [['meltdownA', 'meltdownB'], 'reactor'],
  [['lightsPanel'], 'power'],
  [['commsPanel'], 'comms'],
];

/** Prop kind → icon vote (used when name and stations say nothing). */
const PROP_VOTE: Partial<Record<string, RoomIcon>> = {
  bed: 'beds',
  stove: 'food',
  fridge: 'food',
  bookshelf: 'books',
  planter: 'plants',
  plant: 'plants',
  tree: 'plants',
  hedge: 'plants',
  engine: 'engine',
  generator: 'power',
  crate: 'storage',
  barrel: 'storage',
  shelf: 'storage',
  server: 'server',
  arcade: 'arcade',
  piano: 'music',
  turntable: 'music',
  telescope: 'telescope',
  dish: 'comms',
  sofa: 'lounge',
  mailbox: 'mail',
  fountain: 'water',
  tank: 'water',
  locker: 'storage',
  screen: 'media',
};

function inRoom(r: RoomDef, x: number, y: number): boolean {
  for (const q of [r.rect, ...(r.extra ?? [])]) if (x >= q[0] && y >= q[1] && x < q[0] + q[2] && y < q[1] + q[3]) return true;
  return false;
}

/** Icon for a room, from its stations, name and props (in that order). */
export function roomIconFor(map: CompiledMap, room: RoomDef): RoomIcon {
  const kinds = new Set<StationKind>(map.def.stations.filter((s) => s.room === room.id).map((s) => s.kind));
  for (const [ks, icon] of KEY_FACILITY) if (ks.some((k) => kinds.has(k))) return icon;
  const name = room.name.toLowerCase().replace(/^.*?'s /, '');
  for (const [re, icon] of NAME_RULES) if (re.test(name)) return icon;
  for (const [ks, icon] of OTHER_FACILITY) if (ks.some((k) => kinds.has(k))) return icon;
  if (room.outdoor) return 'outdoor';
  const votes = new Map<RoomIcon, number>();
  for (const p of map.def.props) {
    const v = PROP_VOTE[p.kind];
    if (v && inRoom(room, p.x, p.y)) votes.set(v, (votes.get(v) ?? 0) + 1);
  }
  let best: RoomIcon = 'tasks';
  let n = 1;
  for (const [icon, c] of votes) if (c > n) (best = icon), (n = c);
  return best;
}

// ---------------------------------------------------------------------------
// Anchors

export interface RoomAnchor {
  room: RoomDef;
  icon: RoomIcon;
  /** Anchor in tile units (cell centre). */
  x: number;
  y: number;
  /** Room width / height (tiles) available centred on the anchor. */
  spanX: number;
  spanY: number;
}

const anchorCache = new WeakMap<CompiledMap, RoomAnchor[]>();

/** One anchor per room: the cell farthest from the room's edge (Chebyshev), nearest its centroid on ties. */
export function roomAnchors(map: CompiledMap): RoomAnchor[] {
  const hit = anchorCache.get(map);
  if (hit) return hit;
  const { w, h, roomIdx } = map;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? -2 : roomIdx[y * w + x]!);
  const INF = 1e9;
  const d = new Float32Array(w * h).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ri = roomIdx[y * w + x]!;
      if (ri < 0) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) !== ri) (edge = true);
      d[y * w + x] = edge ? 1 : INF;
    }
  // Two chamfer passes (8-neighbour, unit steps) inside each room.
  const relax = (x: number, y: number, nx: number, ny: number): void => {
    const i = y * w + x;
    if (at(nx, ny) !== roomIdx[i]) return;
    const v = d[ny * w + nx]! + 1;
    if (v < d[i]!) d[i] = v;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (roomIdx[y * w + x]! < 0) continue;
      relax(x, y, x - 1, y), relax(x, y, x - 1, y - 1), relax(x, y, x, y - 1), relax(x, y, x + 1, y - 1);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      if (roomIdx[y * w + x]! < 0) continue;
      relax(x, y, x + 1, y), relax(x, y, x + 1, y + 1), relax(x, y, x, y + 1), relax(x, y, x - 1, y + 1);
    }
  const n = map.def.rooms.length;
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const cnt = new Float64Array(n);
  for (let i = 0; i < w * h; i++) {
    const ri = roomIdx[i]!;
    if (ri < 0) continue;
    sx[ri] = sx[ri]! + (i % w);
    sy[ri] = sy[ri]! + Math.floor(i / w);
    cnt[ri] = cnt[ri]! + 1;
  }
  const best = new Int32Array(n).fill(-1);
  const bestScore = new Float64Array(n).fill(-INF);
  for (let i = 0; i < w * h; i++) {
    const ri = roomIdx[i]!;
    if (ri < 0) continue;
    const cx = sx[ri]! / cnt[ri]!;
    const cy = sy[ri]! / cnt[ri]!;
    const score = d[i]! * 4 - Math.hypot((i % w) - cx, Math.floor(i / w) - cy) * 0.15;
    if (score > bestScore[ri]!) (bestScore[ri] = score), (best[ri] = i);
  }
  const out: RoomAnchor[] = [];
  map.def.rooms.forEach((room, ri) => {
    const i = best[ri]!;
    const icon = roomIconFor(map, room);
    if (i < 0) {
      const [x, y, rw, rh] = room.rect;
      out.push({ room, icon, x: x + rw / 2, y: y + rh / 2, spanX: rw, spanY: rh });
      return;
    }
    const x = i % w;
    const y = Math.floor(i / w);
    const run = (dx: number, dy: number): number => {
      let k = 0;
      while (at(x + dx * (k + 1), y + dy * (k + 1)) === ri) k++;
      return k;
    };
    out.push({ room, icon, x: x + 0.5, y: y + 0.5, spanX: 2 * Math.min(run(-1, 0), run(1, 0)) + 1, spanY: 2 * Math.min(run(0, -1), run(0, 1)) + 1 });
  });
  anchorCache.set(map, out);
  return out;
}

// ---------------------------------------------------------------------------
// Glyphs (24 × 24 design box, centred on 12,12)

type Op = { k: 'fill' | 'stroke' | 'cut' | 'cutStroke'; d: string | ((p: Path2D) => void); w?: number };

const circle = (cx: number, cy: number, r: number) => (p: Path2D) => {
  p.moveTo(cx + r, cy);
  p.arc(cx, cy, r, 0, Math.PI * 2);
};

function gearPath(p: Path2D): void {
  const teeth = 8;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 10 : 7.4;
    const x0 = 12 + Math.cos(a0) * r;
    const y0 = 12 + Math.sin(a0) * r;
    if (i === 0) p.moveTo(x0, y0);
    else p.lineTo(x0, y0);
    p.lineTo(12 + Math.cos(a1) * r, 12 + Math.sin(a1) * r);
  }
  p.closePath();
}

function rays(n: number, r0: number, r1: number, off = 0): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    s += `M${(12 + Math.cos(a) * r0).toFixed(2)} ${(12 + Math.sin(a) * r0).toFixed(2)}L${(12 + Math.cos(a) * r1).toFixed(2)} ${(12 + Math.sin(a) * r1).toFixed(2)}`;
  }
  return s;
}

const GLYPHS: Record<RoomIcon, Op[]> = {
  meeting: [
    { k: 'stroke', d: 'M12 1.8v3M4.6 4.6l2 2M19.4 4.6l-2 2', w: 2.2 },
    { k: 'fill', d: 'M5.5 17a6.5 6.5 0 0 1 13 0z' },
    { k: 'fill', d: 'M3.5 17.5h17v4h-17z' },
    { k: 'cutStroke', d: 'M8.8 14.6a3.4 3.4 0 0 1 2.6-2.4', w: 1.6 },
  ],
  security: [
    { k: 'fill', d: 'M2.5 7.5h13.5v9.5H2.5z' },
    { k: 'fill', d: 'M16 10.5l5.5-3v9.5l-5.5-3z' },
    { k: 'cut', d: circle(9.2, 12.25, 2.6) },
  ],
  admin: [
    { k: 'fill', d: 'M5 4.5h14v17H5z' },
    { k: 'fill', d: 'M8.5 2.5h7v4h-7z' },
    { k: 'cutStroke', d: 'M8 10.5h8M8 14h8M8 17.5h5', w: 1.7 },
  ],
  wardrobe: [{ k: 'fill', d: 'M8 3.2L2.6 6.4l2.2 4.2 2.2-1.1V21h10V9.5l2.2 1.1 2.2-4.2L16 3.2c-.6 1.6-2 2.6-4 2.6s-3.4-1-4-2.6z' }],
  medical: [{ k: 'fill', d: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z' }],
  food: [
    { k: 'stroke', d: 'M5 3v5a2.6 2.6 0 0 0 5.2 0V3M7.6 3v18', w: 2 },
    { k: 'fill', d: 'M15 3c3.8 1.6 3.8 9.2.6 10.4V21h-2.2V3z' },
  ],
  beds: [
    { k: 'fill', d: 'M2.5 6h2.4v7.5h16.6V20h-2.3v-2.6H4.9V20H2.5z' },
    { k: 'fill', d: 'M6 9.5h4.2v3.2H6z' },
    { k: 'fill', d: 'M11.2 9.5h7.8a2.5 2.5 0 0 1 2.5 2.5v.7H11.2z' },
  ],
  books: [
    { k: 'fill', d: 'M3.5 5h4.2v15H3.5zM8.9 3h4.2v17H8.9z' },
    { k: 'fill', d: 'M14.3 6.4l3.8-1.3 4.2 14-3.8 1.3z' },
    { k: 'stroke', d: 'M2.5 21.2h19', w: 1.8 },
    { k: 'cutStroke', d: 'M3.5 8h4.2M8.9 6h4.2M3.5 16.5h4.2M8.9 16.5h4.2', w: 1.2 },
  ],
  mail: [
    { k: 'fill', d: 'M2.5 5.5h19v13h-19z' },
    { k: 'cutStroke', d: 'M3 6.2l9 7 9-7', w: 1.7 },
  ],
  arcade: [
    { k: 'fill', d: 'M7 7.5h10a5 5 0 0 1 0 10c-2 0-3-2.2-5-2.2s-3 2.2-5 2.2a5 5 0 0 1 0-10z' },
    { k: 'cutStroke', d: 'M5.4 12.5h4M7.4 10.5v4', w: 1.6 },
    { k: 'cut', d: (p) => (circle(15.6, 11.3, 1.15)(p), circle(17.6, 13.6, 1.15)(p)) },
  ],
  media: [
    { k: 'fill', d: 'M2.5 4.5h19v12.5h-19z' },
    { k: 'stroke', d: 'M8.5 20.5h7M12 17v3.5', w: 2 },
    { k: 'cut', d: 'M10 7.6l5.4 3.15L10 13.9z' },
  ],
  music: [
    { k: 'fill', d: 'M8.5 6.2l11-2.6v12.3a3 3 0 1 1-2.2-2.9V8.6l-6.6 1.5v8.3a3 3 0 1 1-2.2-2.9z' },
  ],
  lounge: [
    { k: 'fill', d: 'M5 7.5h14a1.8 1.8 0 0 1 1.8 1.8V13H3.2V9.3A1.8 1.8 0 0 1 5 7.5z' },
    { k: 'fill', d: 'M1.8 11.6a2.1 2.1 0 0 1 4.2 0v2.6h12v-2.6a2.1 2.1 0 0 1 4.2 0V18H1.8z' },
    { k: 'stroke', d: 'M4 18v2.6M20 18v2.6', w: 2 },
  ],
  server: [
    { k: 'fill', d: 'M4 2.8h16v5.2H4zM4 9.4h16v5.2H4zM4 16h16v5.2H4z' },
    { k: 'cut', d: 'M6.4 4.8h2.2v1.3H6.4zM6.4 11.4h2.2v1.3H6.4zM6.4 18h2.2v1.3H6.4z' },
    { k: 'cutStroke', d: 'M11.5 5.4h6M11.5 12h6M11.5 18.6h6', w: 1.2 },
  ],
  reactor: [
    {
      k: 'stroke',
      d: (p) => {
        for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
          p.moveTo(12 + Math.cos(a) * 10, 12 + Math.sin(a) * 10);
          p.ellipse(12, 12, 10, 3.8, a, 0, Math.PI * 2);
        }
      },
      w: 1.9,
    },
    { k: 'fill', d: circle(12, 12, 2.6) },
  ],
  engine: [
    { k: 'fill', d: gearPath },
    { k: 'cut', d: circle(12, 12, 3.2) },
  ],
  lab: [
    { k: 'fill', d: 'M9 2.5h6v2H14v5.2l5.6 9.1A1.8 1.8 0 0 1 18 21.5H6a1.8 1.8 0 0 1-1.6-2.7L10 9.7V4.5H9z' },
    { k: 'cut', d: 'M7.6 16h8.8l1.7 2.9a.6.6 0 0 1-.5.9H6.4a.6.6 0 0 1-.5-.9z' },
  ],
  plants: [
    { k: 'stroke', d: 'M12 15.5V9', w: 2 },
    { k: 'fill', d: 'M12 11.4C6.6 11.4 3.8 8.4 3.8 3.8 8.8 3.8 12 6.6 12 11.4z' },
    { k: 'fill', d: 'M12 9.6c0-4.6 2.7-7.2 7.8-7.2 0 5-2.8 7.8-7.8 7.2z' },
    { k: 'fill', d: 'M5.6 14.4h12.8l-1.8 7.4H7.4z' },
    { k: 'cutStroke', d: 'M6.6 16.6h10.8', w: 1.3 },
  ],
  water: [
    { k: 'fill', d: 'M12 2.5c4.2 5 6.4 8.4 6.4 11.6a6.4 6.4 0 0 1-12.8 0c0-3.2 2.2-6.6 6.4-11.6z' },
    { k: 'cutStroke', d: 'M9 14.6a3 3 0 0 0 2.4 3', w: 1.5 },
  ],
  vault: [
    { k: 'fill', d: 'M3 3.5h18v15H3z' },
    { k: 'stroke', d: 'M6 18.5v2.5M18 18.5v2.5', w: 2.2 },
    { k: 'cut', d: circle(11, 11, 4.2) },
    { k: 'fill', d: circle(11, 11, 1.7) },
    { k: 'cutStroke', d: 'M18 8v6', w: 1.6 },
  ],
  storage: [
    { k: 'fill', d: 'M2.8 7.6L12 3.5l9.2 4.1v9.6L12 21.4l-9.2-4.2z' },
    { k: 'cutStroke', d: 'M3.2 7.8L12 11.7l8.8-3.9M12 11.7v9.4', w: 1.4 },
  ],
  telescope: [
    { k: 'fill', d: 'M2.6 12.6l14.2-6.4 2.1 4.6-14.2 6.4z' },
    { k: 'fill', d: 'M17.4 5.2l3.4-1.5 2.4 5.3-3.4 1.5z' },
    { k: 'stroke', d: 'M11.4 13.4L8.2 21.4M11.4 13.4l3.4 8', w: 2 },
  ],
  helm: [
    { k: 'stroke', d: circle(12, 12, 6.4), w: 2.4 },
    { k: 'stroke', d: rays(8, 2, 10.2), w: 2 },
    { k: 'fill', d: circle(12, 12, 2.8) },
  ],
  launch: [
    { k: 'fill', d: 'M12 1.8c4.2 3.2 5.2 8.2 4.2 13.4H7.8C6.8 10 7.8 5 12 1.8z' },
    { k: 'fill', d: 'M7.8 11.5l-3.2 4.2v3.6l3.4-2.2zM16.2 11.5l3.2 4.2v3.6L16 17.1z' },
    { k: 'stroke', d: 'M10.4 18.2v3.4M13.6 18.2v3.4', w: 1.8 },
    { k: 'cut', d: circle(12, 8.2, 1.9) },
  ],
  train: [
    { k: 'fill', d: 'M6.5 2.8h11a2.5 2.5 0 0 1 2.5 2.5v10.4a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.7V5.3a2.5 2.5 0 0 1 2.5-2.5z' },
    { k: 'cut', d: 'M6.6 5.6h10.8v5H6.6z' },
    { k: 'cut', d: (p) => (circle(8, 14.6, 1.2)(p), circle(16, 14.6, 1.2)(p)) },
    { k: 'stroke', d: 'M7.4 18.6l-2.4 3M16.6 18.6l2.4 3', w: 2 },
  ],
  crypt: [
    { k: 'fill', d: 'M5.5 20.5V10a6.5 6.5 0 0 1 13 0v10.5z' },
    { k: 'stroke', d: 'M2.6 21.4h18.8', w: 2 },
    { k: 'cutStroke', d: 'M12 8v8M9.2 10.8h5.6', w: 1.7 },
  ],
  gallery: [
    { k: 'fill', d: 'M2.5 4.5h19v15h-19z' },
    { k: 'cut', d: 'M4.8 6.8h14.4v10.4H4.8z' },
    { k: 'fill', d: 'M4.8 17.2l5-6 3.2 3.6 2-2.2 4.2 4.6z' },
    { k: 'fill', d: circle(15.6, 9.6, 1.5) },
  ],
  solar: [
    { k: 'stroke', d: rays(8, 7, 10.4, Math.PI / 8), w: 2.1 },
    { k: 'fill', d: circle(12, 12, 4.8) },
  ],
  comms: [
    { k: 'stroke', d: 'M12 10.5V21.5M8 21.5h8', w: 2.1 },
    { k: 'fill', d: circle(12, 8.6, 2.2) },
    { k: 'stroke', d: 'M7.6 4.2a6.2 6.2 0 0 0 0 8.8M16.4 4.2a6.2 6.2 0 0 1 0 8.8M4.6 1.6a10 10 0 0 0 0 14M19.4 1.6a10 10 0 0 1 0 14', w: 1.9 },
  ],
  power: [{ k: 'fill', d: 'M13.6 1.8L4.8 13.4h6l-2 8.8 9.4-12.2h-6.2l1.6-8.2z' }],
  outdoor: [
    { k: 'fill', d: 'M12 1.8l6.2 8.6h-3l5.2 7.4H3.6l5.2-7.4h-3z' },
    { k: 'fill', d: 'M10.8 17.4h2.4v4.4h-2.4z' },
  ],
  tasks: [
    {
      k: 'fill',
      d: 'M15.4 2.6a5.4 5.4 0 0 0-5.1 7.2l-7.4 7.4a1.9 1.9 0 0 0 2.7 2.7l7.4-7.4a5.4 5.4 0 0 0 7.2-5.1l-3.3 3.3-2.6-.6-.6-2.6 3.3-3.3a5.5 5.5 0 0 0-1.6-1.6z',
    },
  ],
};

const pathCache = new Map<string, Path2D>();
function pathFor(icon: RoomIcon, i: number, op: Op): Path2D {
  const key = `${icon}|${i}`;
  let p = pathCache.get(key);
  if (!p) {
    if (typeof op.d === 'string') p = new Path2D(op.d);
    else {
      p = new Path2D();
      op.d(p);
    }
    pathCache.set(key, p);
  }
  return p;
}

/** Paints a glyph into the 24-unit box at the current transform (halo, then shape, then dark details). */
export function paintRoomGlyph(g: CanvasRenderingContext2D, icon: RoomIcon, fg: string, ink: string, halo = 3): void {
  const ops = GLYPHS[icon];
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Halo: everything light, grown by `halo` units, in the ink colour.
  g.fillStyle = ink;
  g.strokeStyle = ink;
  ops.forEach((op, i) => {
    if (op.k === 'cut' || op.k === 'cutStroke') return;
    const p = pathFor(icon, i, op);
    if (op.k === 'fill') {
      g.fill(p);
      g.lineWidth = halo;
      g.stroke(p);
    } else {
      g.lineWidth = (op.w ?? 2) + halo;
      g.stroke(p);
    }
  });
  ops.forEach((op, i) => {
    const p = pathFor(icon, i, op);
    const cut = op.k === 'cut' || op.k === 'cutStroke';
    g.fillStyle = cut ? ink : fg;
    g.strokeStyle = cut ? ink : fg;
    if (op.k === 'fill' || op.k === 'cut') g.fill(p);
    else {
      g.lineWidth = op.w ?? 2;
      g.stroke(p);
    }
  });
}

const spriteCache = new Map<string, HTMLCanvasElement>();

/**
 * Draws a room icon `size` CSS px wide centred on (cx, cy). Glyphs are baked
 * once per (icon, device size, colours) into small sprites, so maps that
 * redraw every frame (the minimap) only blit.
 */
export function drawRoomIcon(g: CanvasRenderingContext2D, icon: RoomIcon, cx: number, cy: number, size: number, fg: string, ink: string, dpr = 1): void {
  if (typeof Path2D === 'undefined' || size < 4) return;
  const dev = Math.max(8, Math.round(size * dpr));
  const key = `${icon}|${dev}|${fg}|${ink}`;
  let spr = spriteCache.get(key);
  if (!spr) {
    const pad = Math.ceil(dev * 0.12);
    spr = document.createElement('canvas');
    spr.width = dev + pad * 2;
    spr.height = dev + pad * 2;
    const sg = spr.getContext('2d');
    if (!sg) return;
    sg.translate(pad, pad);
    sg.scale(dev / 24, dev / 24);
    // Thicker halo at small sizes so the glyph separates from the room fill.
    paintRoomGlyph(sg, icon, fg, ink, dev < 16 ? 4.2 : 3.2);
    if (spriteCache.size > 400) spriteCache.clear();
    spriteCache.set(key, spr);
  }
  const k = size / dev;
  g.drawImage(spr, cx - (spr.width * k) / 2, cy - (spr.height * k) / 2, spr.width * k, spr.height * k);
}
