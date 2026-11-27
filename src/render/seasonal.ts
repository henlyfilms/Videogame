/**
 * Seasonal outdoor dressing for the 2D HQ view (Marion Mystery style): a
 * lawn / meadow / leaf-litter / snowfield around the building with flower
 * beds and a ring of trees, plus world-space falling particles (petals,
 * fireflies, leaves, snow). Ground patterns and tree sprites are cached.
 */
import { MARION_BOT_LOOKS, PALETTE, randomCosmetics } from '../mystery/characters/catalog';
import type { Cosmetics } from '../mystery/core/types';
import { paintFloorTile } from '../mystery/render2d/paint';
import type { FloorStyle } from '../mystery/core/map';
import { SEASON_STYLE, scatter, type Season } from '../theme/environment';
import { COURTYARDS, MAP_H, MAP_W, Tile, WORLD_H, WORLD_W, TILE, buildGrid, type RoomDef } from '../engine/world';

type Ctx = CanvasRenderingContext2D;

/** Render-side environment state (set by the HQ controller). */
export const env = { season: 'spring' as Season, night: 0, version: 0 };
export function setEnvironment(season: Season, night: number): void {
  if (season !== env.season) env.version++;
  env.season = season;
  env.night = night;
}

// --- ground ---------------------------------------------------------------------
const patternCache = new Map<string, CanvasPattern | null>();
function groundPattern(ctx: Ctx, season: Season): CanvasPattern | null {
  if (patternCache.has(season)) return patternCache.get(season)!;
  const c = groundCanvas(season);
  const p = c ? ctx.createPattern(c, 'repeat') : null;
  patternCache.set(season, p);
  return p;
}

const groundCache = new Map<Season, HTMLCanvasElement | null>();
/** A seamless 256 px (8 m) tile of this season's ground (shared with the 3D view). */
export function groundCanvas(season: Season): HTMLCanvasElement | null {
  if (groundCache.has(season)) return groundCache.get(season)!;
  const s = SEASON_STYLE[season];
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  groundCache.set(season, g ? c : null);
  if (!g) return null;
  g.fillStyle = s.ground;
  g.fillRect(0, 0, size, size);
  // Soft mottling (drawn wrapped so the tile repeats seamlessly).
  g.fillStyle = s.groundAlt;
  g.globalAlpha = 0.55;
  for (let i = 0; i < 7; i++) {
    const x = scatter(i, 21) * size;
    const y = scatter(i, 23) * size;
    const r = 26 + scatter(i, 25) * 34;
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        g.beginPath();
        g.ellipse(x + ox, y + oy, r * 1.4, r, 0, 0, Math.PI * 2);
        g.fill();
      }
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 110; i++) {
    const x = scatter(i, 3) * size;
    const y = scatter(i, 7) * size;
    if (season === 'winter') {
      g.fillStyle = i % 3 ? 'rgba(180,200,230,0.25)' : 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.ellipse(x, y, 6 + scatter(i, 9) * 10, 2 + scatter(i, 11) * 3, 0, 0, Math.PI * 2);
      g.fill();
    } else if (season === 'fall' && i % 4 === 0) {
      g.fillStyle = s.foliage[i % s.foliage.length]!;
      g.save();
      g.translate(x, y);
      g.rotate(scatter(i, 13) * Math.PI);
      g.beginPath();
      g.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    } else {
      // grass blades
      g.strokeStyle = s.groundAlt;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 1.5, y - 5);
      g.stroke();
    }
    if (season !== 'winter' && season !== 'fall' && i % 11 === 0) {
      g.fillStyle = s.blooms[i % s.blooms.length]!;
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

const treeCache = new Map<string, HTMLCanvasElement>();
function treeSprite(season: Season, variant: number): HTMLCanvasElement {
  const key = `${season}:${variant}`;
  const hit = treeCache.get(key);
  if (hit) return hit;
  const s = SEASON_STYLE[season];
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 140;
  const g = c.getContext('2d')!;
  // shadow
  g.fillStyle = 'rgba(10,20,15,0.25)';
  g.beginPath();
  g.ellipse(70, 124, 44, 12, 0, 0, Math.PI * 2);
  g.fill();
  // trunk
  g.fillStyle = '#7c4a26';
  g.fillRect(58, 78, 12, 46);
  const pine = variant % 3 === 2;
  if (pine) {
    const col = season === 'winter' ? '#1f6f4a' : s.foliage[variant % s.foliage.length]!;
    for (let k = 0; k < 3; k++) {
      g.fillStyle = k % 2 ? col : shade(col, -0.12);
      g.beginPath();
      g.moveTo(64, 10 + k * 22);
      g.lineTo(22 + k * 2, 70 + k * 18);
      g.lineTo(106 - k * 2, 70 + k * 18);
      g.closePath();
      g.fill();
      if (season === 'winter') {
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath();
        g.moveTo(64, 10 + k * 22);
        g.lineTo(44 + k * 2, 42 + k * 20);
        g.lineTo(84 - k * 2, 42 + k * 20);
        g.closePath();
        g.fill();
      }
    }
  } else {
    const leaves = season === 'winter' ? ['#cbd5e1', '#e2e8f0', '#f8fafc'] : s.foliage;
    const blobs = [
      [64, 46, 34],
      [40, 62, 26],
      [88, 60, 27],
      [64, 72, 30],
      [50, 34, 22],
      [80, 34, 22],
    ];
    blobs.forEach(([x, y, r], i) => {
      g.fillStyle = leaves[(i + variant) % leaves.length]!;
      g.beginPath();
      g.arc(x!, y!, r!, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.arc(52, 36, 12, 0, Math.PI * 2);
    g.fill();
    if (season === 'spring' || (season === 'summer' && variant % 2 === 0)) {
      for (let i = 0; i < 10; i++) {
        g.fillStyle = season === 'spring' ? '#fbcfe8' : '#ef4444';
        g.beginPath();
        g.arc(30 + scatter(i, variant) * 70, 26 + scatter(i, variant + 4) * 56, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  treeCache.set(key, c);
  return c;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * Trees ring the building on the lawn outside the world bounds, and stand in
 * the open ground between the wings (never on a courtyard bed, never close
 * enough to the building for a canopy to overlap it).
 */
export const TREES: readonly { x: number; y: number; v: number; s: number }[] = (() => {
  const out: { x: number; y: number; v: number; s: number }[] = [];
  const pad = 70;
  let i = 0;
  const push = (x: number, y: number) =>
    out.push({
      x,
      y,
      v: Math.floor(scatter(i, 5) * 6),
      s: 0.8 + scatter(i++, 9) * 0.6,
    });
  for (let x = -pad; x <= WORLD_W + pad; x += 150 + scatter(i, 2) * 60) {
    push(x, -pad - scatter(i, 4) * 60);
    push(x + 40, WORLD_H + pad * 0.6 + scatter(i, 6) * 60);
  }
  for (let y = 40; y <= WORLD_H; y += 160 + scatter(i, 8) * 60) {
    push(-pad - scatter(i, 10) * 70, y);
    push(WORLD_W + pad + scatter(i, 12) * 70, y + 30);
  }
  // Open ground inside the bounds: a clear box around the trunk (canopies reach up ~4 tiles).
  const grid = buildGrid();
  const clear = (tx: number, ty: number) => {
    for (let y = ty - 5; y <= ty + 2; y++)
      for (let x = tx - 3; x <= tx + 3; x++) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        if (grid.tiles[y * MAP_W + x] !== Tile.Void) return false;
        if (COURTYARDS.some((r) => x >= r.x - 1 && y >= r.y - 1 && x <= r.x + r.w && y <= r.y + r.h)) return false;
      }
    return true;
  };
  for (let ty = 2; ty < MAP_H; ty += 3)
    for (let tx = 1; tx < MAP_W - 1; tx += 3) {
      const k = ty * 131 + tx;
      const jx = tx + Math.round((scatter(k, 3) - 0.5) * 2);
      const jy = ty + Math.round((scatter(k, 7) - 0.5) * 2);
      if (scatter(k, 11) > 0.7 || !clear(jx, jy)) continue;
      if (out.some((t) => Math.hypot(t.x - (jx + 0.5) * TILE, t.y - (jy + 0.5) * TILE) < TILE * 3.2)) continue;
      push((jx + 0.5) * TILE, (jy + 0.8) * TILE);
    }
  return out;
})();

/**
 * Outdoor ground around the building (drawn each frame in world space before
 * the cached static layer; only the visible part is filled).
 */
export function drawOutdoors(ctx: Ctx, vis: { x: number; y: number; w: number; h: number }): void {
  const p = groundPattern(ctx, env.season);
  ctx.save();
  ctx.fillStyle = p ?? SEASON_STYLE[env.season].ground;
  ctx.fillRect(vis.x - 4, vis.y - 4, vis.w + 8, vis.h + 8);
  // (The paved apron that hugs the building's real outline is baked into the static layer.)
  ctx.restore();
}

/** Trees are drawn after the building so canopies overlap the apron nicely. */
export function drawTrees(ctx: Ctx, vis: { x: number; y: number; w: number; h: number }): void {
  for (const t of TREES) {
    const w = 96 * t.s;
    const h = 105 * t.s;
    if (t.x + w < vis.x || t.x - w > vis.x + vis.w || t.y + h < vis.y || t.y - h > vis.y + vis.h) continue;
    ctx.drawImage(treeSprite(env.season, t.v), t.x - w / 2, t.y - h * 0.85, w, h);
  }
}

// --- particles ------------------------------------------------------------------
interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  color: string;
  size: number;
}
const parts: P[] = [];
export function updateDrawParticles(ctx: Ctx, vis: { x: number; y: number; w: number; h: number }, dt: number, t: number, reduced = false): void {
  const st = SEASON_STYLE[env.season].particle;
  const want = reduced ? 0 : Math.round((st.rate * (vis.w * vis.h)) / (900 * 700));
  while (parts.length < Math.min(220, want)) {
    parts.push({
      x: vis.x + Math.random() * vis.w,
      y: st.kind === 'firefly' ? vis.y + Math.random() * vis.h : vis.y - 20 - Math.random() * vis.h * 0.3,
      vx: (Math.random() - 0.5) * 12,
      vy: (st.kind === 'firefly' ? 0 : 18 + Math.random() * 22) * st.fall,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 3,
      life: 0,
      color: st.colors[Math.floor(Math.random() * st.colors.length)]!,
      size: st.size * (0.7 + Math.random() * 0.7) * 32,
    });
  }
  if (parts.length > want) parts.splice(want);
  ctx.save();
  for (const p of parts) {
    p.life += dt;
    p.x += (p.vx + Math.sin(t * st.sway + p.rot) * 14 * st.sway) * dt;
    p.y += p.vy * dt + (st.kind === 'firefly' ? Math.sin(t * 1.3 + p.rot) * 6 * dt : 0);
    p.rot += p.vr * dt;
    if (p.y > vis.y + vis.h + 20 || p.x < vis.x - 40 || p.x > vis.x + vis.w + 40 || (st.kind === 'firefly' && p.life > 9)) {
      p.x = vis.x + Math.random() * vis.w;
      p.y = st.kind === 'firefly' ? vis.y + Math.random() * vis.h : vis.y - 10;
      p.life = 0;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (st.kind === 'firefly') {
      // Fireflies glow at dusk/night, barely visible by day.
      const a = (0.25 + env.night * 0.75) * (0.5 + 0.5 * Math.sin(t * 3 + p.rot * 5));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a * 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (st.kind === 'snow') {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 0.5, p.size * (st.kind === 'leaf' ? 0.28 : 0.32), 0, 0, Math.PI * 2);
      ctx.fill();
      if (st.kind === 'leaf') {
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-p.size * 0.45, 0);
        ctx.lineTo(p.size * 0.45, 0);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

// --- floors ---------------------------------------------------------------------
export const ROOM_FLOOR: Record<string, FloorStyle> = {
  command: 'tile',
  huddle: 'rug',
  engine: 'metal',
  bridge: 'carpet',
  life: 'wood',
  media: 'carpet',
  cutting: 'wood',
  mail: 'wood',
  foundry: 'metal',
  arcade: 'checker',
};

const floorCanvas = new Map<string, HTMLCanvasElement>();
/** A room's floor painted with the Marion Mystery floor painter (cached per room+look). */
export function roomFloorTexture(room: RoomDef, accent: string, base: string): HTMLCanvasElement {
  const key = `${room.id}:${accent}:${base}`;
  const hit = floorCanvas.get(key);
  if (hit) return hit;
  const s = TILE;
  const c = document.createElement('canvas');
  c.width = room.w * s;
  c.height = room.h * s;
  const g = c.getContext('2d')!;
  const style = ROOM_FLOOR[room.id] ?? 'tile';
  const tinted = mixHex(base, accent, style === 'wood' ? 0.12 : 0.16);
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) paintFloorTile(g, style, x, y, s, tinted);
  floorCanvas.set(key, c);
  return c;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// --- berry looks for HQ bots ------------------------------------------------------
const looks = new Map<string, Cosmetics>();
/** The Marion berry look for an HQ bot (Foundry custom bots get a stable random look in their colour). */
export function lookFor(id: string, color: string): Cosmetics {
  const hit = looks.get(id);
  if (hit) return hit;
  const known = (MARION_BOT_LOOKS as Record<string, Cosmetics>)[id];
  let c: Cosmetics;
  if (known) c = known;
  else {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    c = randomCosmetics(h);
    // Nearest palette colour to the bot's aura colour.
    const target = parseInt(color.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
    let best = 0;
    let bd = Infinity;
    PALETTE.forEach((p, i) => {
      const v = parseInt(p.hex.slice(1), 16);
      const d = (((v >> 16) & 255) - ((target >> 16) & 255)) ** 2 + (((v >> 8) & 255) - ((target >> 8) & 255)) ** 2 + ((v & 255) - (target & 255)) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    c = { ...c, color: best };
  }
  looks.set(id, c);
  return c;
}
