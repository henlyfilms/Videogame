/**
 * Ground-level static art: the building footprint (every room and corridor
 * tile, traced into one rounded slab), the paved apron hugging it, the
 * courtyard gardens between the wings, and the Arcade's carpet. All of it is
 * baked into the static layer / chunk cache — nothing here runs per frame.
 */
import { offsetPoly, traceMask, tracePolyPath, type Pt } from '../engine/geometry';
import { COURTYARDS, MAP_H, MAP_W, ROOMS, TILE, Tile, buildGrid, roomPolygon, type RoomDef } from '../engine/world';
import type { ThemeTokens } from '../theme/tokens';
import { hexA, roundRect } from './sprites';
import { SEASON_STYLE } from '../theme/environment';
import { env } from './seasonal';

type Ctx = CanvasRenderingContext2D;
type Region = { x: number; y: number; w: number; h: number };

const loopsCache = new Map<string, Pt[][]>();
function loops(key: 'slab' | 'corridor'): Pt[][] {
  const hit = loopsCache.get(key);
  if (hit) return hit;
  const g = buildGrid();
  const on =
    key === 'slab' ? (x: number, y: number) => g.tiles[y * MAP_W + x] !== Tile.Void : (x: number, y: number) => g.tiles[y * MAP_W + x] === Tile.Corridor;
  const out = traceMask(on, MAP_W, MAP_H).map((l) => l.map((q) => ({ x: q.x * TILE, y: q.y * TILE })));
  loopsCache.set(key, out);
  return out;
}

/** Outline loops (world px) of the whole building footprint (rooms + corridors). */
export function buildingLoops(): Pt[][] {
  return loops('slab');
}

/** Outline loops (world px) of the corridor tiles alone. */
export function corridorLoops(): Pt[][] {
  return loops('corridor');
}

/** Trace the walkable building outline (all footprint loops, rounded corners) as one path. */
export function traceBuildingOutline(ctx: Ctx, inset = 0): void {
  ctx.beginPath();
  for (const l of buildingLoops()) tracePolyPath(ctx, inset ? offsetPoly(l, inset) : l, 10, false);
}

/**
 * Paved apron hugging the building: a wide stroke around every corridor run
 * and every room outline (their union reads as one path of paving).
 */
export function drawApron(ctx: Ctx, region?: Region): void {
  const winter = env.season === 'winter';
  ctx.save();
  ctx.strokeStyle = winter ? 'rgba(206,219,236,0.92)' : 'rgba(216,206,186,0.92)';
  ctx.lineWidth = 30;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const l of corridorLoops()) tracePolyPath(ctx, l, 10, false);
  for (const room of ROOMS) {
    const pr = roomPolygon(room);
    if (region && !polyHits(pr, region, 30)) continue;
    tracePolyPath(ctx, pr, 10, false);
  }
  ctx.stroke();
  ctx.restore();
}

function polyHits(pts: readonly Pt[], r: Region, pad: number): boolean {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of pts) {
    x0 = Math.min(x0, q.x);
    y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x);
    y1 = Math.max(y1, q.y);
  }
  return x0 - pad < r.x + r.w && x1 + pad > r.x && y0 - pad < r.y + r.h && y1 + pad > r.y;
}

/** Deterministic hash → [0, 1). */
export function hash01(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Garden {
  grass: string;
  grassAlt: string;
  hedge: string;
  hedgeDark: string;
  tree: string;
  treeLight: string;
  path: string;
  water: string;
  line: string;
}

function mixHex(a: string, b: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v + (y[i]! - v) * k)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Season-themed garden (Marion Mystery saturation), dimmed for soft/dark themes. */
function gardenPalette(th: ThemeTokens): Garden {
  const s = SEASON_STYLE[env.season];
  const winter = env.season === 'winter';
  const base: Garden = {
    grass: mixHex(s.ground, '#ffffff', 0.12),
    grassAlt: s.ground,
    hedge: s.foliage[0]!,
    hedgeDark: mixHex(s.foliage[0]!, '#000000', 0.25),
    tree: s.foliage[1] ?? s.foliage[0]!,
    treeLight: mixHex(s.foliage[1] ?? s.foliage[0]!, '#ffffff', 0.35),
    path: winter ? '#cfd9e6' : '#efe6d2',
    water: winter ? '#dcefff' : '#7cc4ef',
    line: mixHex(s.ground, '#000000', 0.15),
  };
  if (th.name === 'light') return base;
  const k = th.name === 'dark' ? 0.72 : 0.25;
  const to = th.name === 'dark' ? '#0b1220' : '#e8e4d8';
  return Object.fromEntries(Object.entries(base).map(([key, v]) => [key, mixHex(v, to, k)])) as unknown as Garden;
}

function tree(ctx: Ctx, x: number, y: number, r: number, g: Garden): void {
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.25, y + r * 0.35, r * 1.02, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g.tree;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g.treeLight;
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Lawn beds (world px): one per courtyard between the wings. */
export function terraceBeds(): Region[] {
  return COURTYARDS.map((r) => ({ x: r.x * TILE + 8, y: r.y * TILE + 8, w: r.w * TILE - 16, h: r.h * TILE - 16 }));
}

/** Stepping-stone centres of a bed's path: it meanders along the bed's long axis. */
export function stonePath(b: Region, flip: boolean): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const horizontal = b.w >= b.h;
  const len = horizontal ? b.w : b.h;
  const n = Math.max(4, Math.round(len / 46));
  const amp = Math.min(18, (horizontal ? b.h : b.w) * 0.18);
  for (let i = 0; i <= n; i++) {
    const k = flip ? 1 - i / n : i / n;
    const along = 0.12 + 0.76 * k;
    const wob = Math.sin(k * Math.PI * 1.5) * amp;
    if (horizontal) out.push({ x: b.x + b.w * along, y: b.y + b.h * 0.46 + wob });
    else out.push({ x: b.x + b.w * 0.5 + wob, y: b.y + b.h * along });
  }
  return out;
}

export function drawTerrace(ctx: Ctx, th: ThemeTokens, region?: Region): void {
  const g = gardenPalette(th);
  const beds = terraceBeds();

  for (const [bi, b] of beds.entries()) {
    if (region && (b.x > region.x + region.w || b.y > region.y + region.h || b.x + b.w < region.x || b.y + b.h < region.y)) continue;
    const horizontal = b.w >= b.h;
    const flip = bi % 2 === 1;
    const path = stonePath(b, flip);
    // Lawn.
    roundRect(ctx, b.x, b.y, b.w, b.h, 16);
    ctx.fillStyle = g.grass;
    ctx.fill();
    ctx.strokeStyle = g.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Mown stripes (across the long axis).
    ctx.save();
    roundRect(ctx, b.x, b.y, b.w, b.h, 16);
    ctx.clip();
    ctx.fillStyle = g.grassAlt;
    if (horizontal) for (let sx = b.x; sx < b.x + b.w; sx += 48) ctx.fillRect(sx, b.y, 24, b.h);
    else for (let sy = b.y; sy < b.y + b.h; sy += 48) ctx.fillRect(b.x, sy, b.w, 24);
    // Meandering stepping-stone path.
    ctx.fillStyle = g.path;
    for (const st of path) {
      if (horizontal) roundRect(ctx, st.x - 9, st.y - 6, 18, 12, 5);
      else roundRect(ctx, st.x - 6, st.y - 9, 12, 18, 5);
      ctx.fill();
    }
    // One feature per garden: a pond, a round planter, or a little grove.
    const feature = bi % 3;
    const minDim = Math.min(b.w, b.h);
    const fx = horizontal ? b.x + b.w * (flip ? 0.3 : 0.66) : b.x + b.w * 0.5;
    const fy = horizontal ? b.y + b.h * 0.78 : b.y + b.h * (flip ? 0.28 : 0.7);
    if (feature === 0 && minDim > 90) {
      const rx = Math.min(62, minDim * 0.38);
      const ry = rx * 0.5;
      const pcx = horizontal ? fx : b.x + b.w * 0.5;
      const pcy = horizontal ? Math.min(fy, b.y + b.h - ry - 10) : fy;
      ctx.fillStyle = g.water;
      ctx.beginPath();
      ctx.ellipse(pcx, pcy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA('#ffffff', th.name === 'dark' ? 0.08 : 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(pcx - rx * 0.13, pcy - ry * 0.13, rx * 0.58, ry * 0.46, 0, Math.PI * 1.1, Math.PI * 1.7);
      ctx.stroke();
      ctx.fillStyle = g.hedge;
      for (const [dx, dy] of [
        [-0.5, 0.2],
        [0.35, -0.26],
        [0.55, 0.33],
      ] as const) {
        ctx.beginPath();
        ctx.arc(pcx + dx * rx, pcy + dy * ry, 6, 0.4, Math.PI * 2);
        ctx.lineTo(pcx + dx * rx, pcy + dy * ry);
        ctx.fill();
      }
    } else if (feature === 1 && minDim > 70) {
      const r = Math.min(34, minDim * 0.3);
      ctx.fillStyle = g.path;
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g.hedgeDark;
      ctx.beginPath();
      ctx.arc(fx, fy, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.fillStyle = ['#f472b6', '#fbbf24', '#a78bfa'][i % 3]!;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * r * 0.42, fy + Math.sin(a) * r * 0.42, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // Hedge along the top edge (with a soft shadow on the lawn).
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    roundRect(ctx, b.x + 8, b.y + 10, b.w - 12, 14, 7);
    ctx.fill();
    ctx.fillStyle = g.hedgeDark;
    roundRect(ctx, b.x + 6, b.y + 4, b.w - 12, 14, 7);
    ctx.fill();
    ctx.fillStyle = g.hedge;
    for (let hx = b.x + 14; hx < b.x + b.w - 10; hx += 16) {
      ctx.beginPath();
      ctx.arc(hx, b.y + 9, 7.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Trees scattered by a stable hash, kept off the path and the feature.
    const count = Math.round((b.w * b.h) / 9000) + (feature === 2 ? 4 : 1);
    for (let i = 0; i < count; i++) {
      const tx = b.x + 22 + hash01(i, bi * 7 + 1) * (b.w - 44);
      const ty = b.y + 36 + hash01(i * 3 + 1, bi * 5 + 2) * (b.h - 60);
      if (path.some((st) => Math.hypot(st.x - tx, st.y - ty) < 26)) continue;
      if (feature !== 2 && Math.hypot(fx - tx, fy - ty) < 70) continue;
      tree(ctx, tx, ty, 11 + hash01(i, 99 + bi) * 8, g);
    }
  }
}

/** Base color of the Arcade carpet (also used for its door thresholds). */
export function arcadeFloor(th: ThemeTokens): string {
  return th.name === 'dark' ? '#0f0a1f' : th.name === 'soft' ? '#2a2140' : '#241a3d';
}

/** The Arcade's floor: dark checker carpet with a scatter of neon confetti. */
export function drawArcadeCarpet(ctx: Ctx, room: RoomDef, th: ThemeTokens): void {
  const x0 = room.x * TILE;
  const y0 = room.y * TILE;
  const w = room.w * TILE;
  const h = room.h * TILE;
  const base = arcadeFloor(th);
  const alt = th.name === 'dark' ? '#140e29' : th.name === 'soft' ? '#30264a' : '#2b2049';
  ctx.save();
  tracePolyPath(ctx, roomPolygon(room), 10);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = alt;
  for (let ty = 0; ty < room.h; ty++) for (let tx = ty & 1; tx < room.w; tx += 2) ctx.fillRect(x0 + tx * TILE, y0 + ty * TILE, TILE, TILE);
  const neon = ['#ff4fd8', '#22d3ee', '#fbbf24', '#a3e635', '#a78bfa'];
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const px = x0 + 8 + hash01(i, 11) * (w - 16);
    const py = y0 + 8 + hash01(i, 23) * (h - 16);
    const c = neon[i % neon.length]!;
    const kind = Math.floor(hash01(i, 37) * 3);
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    if (kind === 0) {
      ctx.beginPath();
      ctx.moveTo(px - 5, py);
      ctx.lineTo(px - 2, py - 3);
      ctx.lineTo(px + 1, py);
      ctx.lineTo(px + 4, py - 3);
      ctx.stroke();
    } else if (kind === 1) {
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(px, py - 3);
      ctx.lineTo(px + 3, py + 2);
      ctx.lineTo(px - 3, py + 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // Neon trim inset along the walls.
  ctx.strokeStyle = hexA('#ff4fd8', 0.35);
  ctx.lineWidth = 1.5;
  tracePolyPath(ctx, offsetPoly(roomPolygon(room), 10), 6);
  ctx.stroke();
  ctx.restore();
}
