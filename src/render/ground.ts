/**
 * Ground-level static art: the building footprint (core block + the annex
 * corridor ring around the Arcade), the outdoor terrace garden on the annex
 * Void cells, and the Arcade's carpet. All of it is baked into the static
 * layer / chunk cache — nothing here runs per frame.
 */
import { ANNEX_Y, CORRIDOR, MAP_H, MAP_W, ROOMS, TILE, type RoomDef } from '../engine/world';
import type { ThemeTokens } from '../theme/tokens';
import { hexA, roundRect } from './sprites';
import { SEASON_STYLE } from '../theme/environment';
import { env } from './seasonal';

type Ctx = CanvasRenderingContext2D;
type Region = { x: number; y: number; w: number; h: number };

/** Pixel spans [x0, x1) of the corridor rings around annex rooms, left to right. */
export function annexSpans(): [number, number][] {
  return ROOMS.filter((r) => r.y >= ANNEX_Y)
    .map((r) => [(r.x - CORRIDOR) * TILE, (r.x + r.w + CORRIDOR) * TILE] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Trace the walkable building outline: the core block (rows 0–2 + their
 * corridors) with one tab per annex room hanging below it. Convex corners
 * are rounded generously, concave ones lightly.
 */
export function traceBuildingOutline(ctx: Ctx, inset = 0): void {
  const L = TILE * 0.5 + inset;
  const R = (MAP_W - 0.5) * TILE - inset;
  const T = TILE * 0.5 + inset;
  const Y = ANNEX_Y * TILE - inset; // bottom of the core slab
  const B = (MAP_H - 0.5) * TILE - inset;
  const pts: [number, number, number][] = [
    [L, T, 18],
    [R, T, 18],
    [R, Y, 14],
  ];
  for (const [x0, x1] of annexSpans().reverse()) {
    pts.push([x1 - inset, Y, 10], [x1 - inset, B, 16], [x0 + inset, B, 16], [x0 + inset, Y, 10]);
  }
  pts.push([L, Y, 14]);
  ctx.beginPath();
  const n = pts.length;
  const first = pts[0]!;
  const last = pts[n - 1]!;
  ctx.moveTo((first[0] + last[0]) / 2, (first[1] + last[1]) / 2);
  for (let i = 0; i < n; i++) {
    const [x, y, r] = pts[i]!;
    const nx = pts[(i + 1) % n]!;
    ctx.arcTo(x, y, nx[0], nx[1], r);
  }
  ctx.closePath();
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

/** Outdoor terrace garden on the annex Void cells either side of the Arcade. */
/** Lawn beds (world px) on the terrace either side of the annex rooms. */
export function terraceBeds(): Region[] {
  const top = ANNEX_Y * TILE + 14;
  const bottom = (MAP_H - 0.5) * TILE;
  const beds: Region[] = [];
  let x = TILE * 0.5;
  for (const [x0, x1] of annexSpans()) {
    if (x0 - x > TILE * 2) beds.push({ x: x + 8, y: top, w: x0 - x - 22, h: bottom - top - 8 });
    x = x1;
  }
  if ((MAP_W - 0.5) * TILE - x > TILE * 2)
    beds.push({
      x: x + 14,
      y: top,
      w: (MAP_W - 0.5) * TILE - x - 22,
      h: bottom - top - 8,
    });
  return beds;
}

/** Stepping-stone centres of a bed's path (it winds toward the Arcade). */
export function stonePath(b: Region, towardRight: boolean): { x: number; y: number }[] {
  const py = b.y + b.h * 0.42;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const px = towardRight ? b.x + b.w * (0.15 + 0.85 * k) : b.x + b.w * (0.85 - 0.85 * k);
    out.push({ x: px, y: py + Math.sin(k * Math.PI * 1.5) * 18 });
  }
  return out;
}

export function drawTerrace(ctx: Ctx, th: ThemeTokens, region?: Region): void {
  const g = gardenPalette(th);
  const beds = terraceBeds();

  for (const [bi, b] of beds.entries()) {
    if (region && (b.x > region.x + region.w || b.y > region.y + region.h || b.x + b.w < region.x || b.y + b.h < region.y)) continue;
    // Lawn.
    roundRect(ctx, b.x, b.y, b.w, b.h, 16);
    ctx.fillStyle = g.grass;
    ctx.fill();
    ctx.strokeStyle = g.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Mown stripes.
    ctx.save();
    roundRect(ctx, b.x, b.y, b.w, b.h, 16);
    ctx.clip();
    ctx.fillStyle = g.grassAlt;
    for (let sx = b.x; sx < b.x + b.w; sx += 48) ctx.fillRect(sx, b.y, 24, b.h);
    // Stepping-stone path toward the Arcade terrace door.
    const towardRight = bi === 0;
    ctx.fillStyle = g.path;
    for (const st of stonePath(b, towardRight)) {
      roundRect(ctx, st.x - 9, st.y - 6, 18, 12, 5);
      ctx.fill();
    }
    // Pond with lily pads (right garden) / round planter (left garden).
    if (!towardRight) {
      const pcx = b.x + b.w * 0.62;
      const pcy = b.y + b.h * 0.76;
      ctx.fillStyle = g.water;
      ctx.beginPath();
      ctx.ellipse(pcx, pcy, 62, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA('#ffffff', th.name === 'dark' ? 0.08 : 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(pcx - 8, pcy - 4, 36, 14, 0, Math.PI * 1.1, Math.PI * 1.7);
      ctx.stroke();
      ctx.fillStyle = g.hedge;
      for (const [dx, dy] of [
        [-30, 6],
        [22, -8],
        [34, 10],
      ] as const) {
        ctx.beginPath();
        ctx.arc(pcx + dx, pcy + dy, 6, 0.4, Math.PI * 2);
        ctx.lineTo(pcx + dx, pcy + dy);
        ctx.fill();
      }
    } else {
      const pcx = b.x + b.w * 0.36;
      const pcy = b.y + b.h * 0.78;
      ctx.fillStyle = g.path;
      ctx.beginPath();
      ctx.arc(pcx, pcy, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g.hedgeDark;
      ctx.beginPath();
      ctx.arc(pcx, pcy, 24, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.fillStyle = ['#f472b6', '#fbbf24', '#a78bfa'][i % 3]!;
        ctx.beginPath();
        ctx.arc(pcx + Math.cos(a) * 14, pcy + Math.sin(a) * 14, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // Hedge along the building edge (with a soft shadow on the lawn).
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
    // Trees scattered by a stable hash.
    for (let i = 0; i < 9; i++) {
      const tx = b.x + 30 + hash01(i, bi * 7 + 1) * (b.w - 60);
      const ty = b.y + 48 + hash01(i * 3 + 1, bi * 5 + 2) * (b.h - 90);
      if (Math.abs(ty - (b.y + b.h * 0.42)) < 30) continue; // keep the path clear
      tree(ctx, tx, ty, 13 + hash01(i, 99 + bi) * 9, g);
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
  roundRect(ctx, x0, y0, w, h, 10);
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
  roundRect(ctx, x0 + 10, y0 + 10, w - 20, h - 20, 6);
  ctx.stroke();
  ctx.restore();
}
