/**
 * Procedural 2D painters for the top-down view: floors, walls, props,
 * stations and vents. Everything is drawn in tile units scaled by `s`
 * (pixels per tile). Shared by the in-match renderer, the waiting room, the
 * minimap thumbnails and the 2D menu backdrop.
 */
import type { FloorStyle, PropDef, StationDef, VentDef } from '../core/map';

export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

export function parseHex(h: string): [number, number, number] {
  if (h.startsWith('rgb')) {
    const m = h.match(/\d+/g) ?? ['0', '0', '0'];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(h: string, a: number): string {
  const [r, g, b] = parseHex(h);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------------------------------------------------------------------------
// World art style: cel-shaded flat colour with thick ink outlines. Muted
// teal/slate interiors, beige striped wallpaper, a dusty pink accent stripe,
// grey plate floors; purple rock, snow and lava outside.

export const WORLD = {
  ink: '#141926',
  inkSoft: '#1f2636',
  void: '#0b101c',
  capTop: '#2b3c4a',
  capHi: '#3b5465',
  panel: '#4f7f8a',
  panelDark: '#3c6670',
  panelHi: '#6a9aa3',
  rivet: '#2c4b53',
  paper: '#d9c6a3',
  paperStripe: '#c5ad87',
  pink: '#c9637f',
  guideYellow: '#f2c230',
  guidePink: '#e2588b',
  strip: '#dff6ff',
  floorA: '#8f99a5',
  floorB: '#7e8895',
  seam: '#5d6773',
  rock: '#6c5b80',
  rockDark: '#4a3e5d',
  rockHi: '#8b7aa2',
  snow: '#eef0fa',
  snowShade: '#c4c8e6',
  lava: '#ff6a1a',
  lavaHot: '#ffd166',
  shadow: 'rgba(12,14,28,',
  task: '#ffd23f',
  lime: '#a3f03c',
  magenta: '#ff3fb4',
  vent: '#ff9a1f',
  kill: '#ff2b3d',
  local: '#4cff6a',
} as const;

const NIGHT_MIX = '#0b1022';

/** Exterior floors (rock / snow / moss) get the outdoor treatment. */
export function isExteriorFloor(style: FloorStyle): boolean {
  return style === 'grass' || style === 'snow' || style === 'stone';
}

/** Base colour for the cel-shaded world floors (rooms keep a faint accent). */
export function worldFloorBase(style: FloorStyle, accent: string, night: boolean): string {
  const base: Record<FloorStyle, string> = {
    tile: '#959fab',
    checker: WORLD.floorA,
    metal: '#6f7a87',
    carpet: '#6b7891',
    wood: '#a98c72',
    rug: '#a77d8c',
    grass: '#6f7f74',
    snow: WORLD.snow,
    stone: '#7d6f8e',
  };
  const tint = style === 'snow' ? 0.05 : isExteriorFloor(style) ? 0.08 : 0.12;
  const c = mix(base[style], accent, tint);
  return night ? mix(c, NIGHT_MIX, 0.55) : c;
}

/**
 * Cel-shaded floor painter (tile units × `s`). Grey plates, checker, grates,
 * carpets; exterior moss / snow / purple flagstones. Flat colours with a few
 * crisp seams so it reads like the inked reference art.
 */
export function paintWorldFloor(ctx: CanvasRenderingContext2D, style: FloorStyle, tx: number, ty: number, s: number, base: string): void {
  const x = tx * s;
  const y = ty * s;
  const r = hash2(tx, ty);
  const lw = Math.max(1, s * 0.03);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, s + 0.5, s + 0.5);
  const shade = (a: number) => `rgba(20,26,40,${a})`;
  const light = (a: number) => `rgba(255,255,255,${a})`;
  switch (style) {
    case 'tile': {
      // 2×2 tile plates with a bevel and corner rivets.
      const px = tx % 2 === 0;
      const py = ty % 2 === 0;
      ctx.fillStyle = light(0.07);
      if (px) ctx.fillRect(x, y, s * 0.05, s);
      if (py) ctx.fillRect(x, y, s, s * 0.05);
      ctx.fillStyle = shade(0.14);
      if (!px) ctx.fillRect(x + s - lw, y, lw, s);
      if (!py) ctx.fillRect(x, y + s - lw, s, lw);
      if (px && py) {
        ctx.fillStyle = shade(0.25);
        ctx.beginPath();
        ctx.arc(x + s * 0.14, y + s * 0.14, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      if (r > 0.93) {
        ctx.fillStyle = shade(0.06);
        ctx.fillRect(x + s * 0.2, y + s * 0.2, s * 0.6, s * 0.6);
      }
      break;
    }
    case 'checker': {
      if ((tx + ty) % 2 === 0) {
        ctx.fillStyle = shade(0.11);
        ctx.fillRect(x, y, s, s);
      }
      ctx.fillStyle = shade(0.08);
      ctx.fillRect(x, y + s - lw, s, lw);
      ctx.fillRect(x + s - lw, y, lw, s);
      break;
    }
    case 'metal': {
      // Deck plates; every other plate is a grate with a few dark slots.
      const grate = (Math.floor(tx / 2) + Math.floor(ty / 2)) % 2 === 0;
      if (grate) {
        ctx.fillStyle = shade(0.32);
        const ox = tx % 2 === 0 ? s * 0.18 : 0;
        const ow = tx % 2 === 0 ? s * 0.82 : s * 0.82;
        for (let i = 0; i < 3; i++) ctx.fillRect(x + ox, y + s * (0.16 + i * 0.3), ow, s * 0.12);
      }
      ctx.fillStyle = light(0.07);
      if (tx % 2 === 0) ctx.fillRect(x, y, lw * 1.5, s);
      if (ty % 2 === 0) ctx.fillRect(x, y, s, lw * 1.5);
      ctx.fillStyle = shade(0.28);
      if (tx % 2 === 1) ctx.fillRect(x + s - lw, y, lw, s);
      if (ty % 2 === 1) ctx.fillRect(x, y + s - lw, s, lw);
      break;
    }
    case 'carpet':
    case 'rug': {
      ctx.fillStyle = light(0.05 + r * 0.04);
      for (let i = 0; i < 3; i++) ctx.fillRect(x + hash2(tx * 3 + i, ty) * s, y + hash2(tx, ty * 3 + i) * s, s * 0.06, s * 0.06);
      if (style === 'carpet' && (tx + ty * 3) % 6 === 0) {
        ctx.fillStyle = shade(0.07);
        ctx.fillRect(x, y + s * 0.45, s, s * 0.1);
      }
      break;
    }
    case 'wood': {
      const plank = s / 3;
      ctx.fillStyle = shade(0.13);
      for (let i = 1; i <= 3; i++) ctx.fillRect(x, y + plank * i - lw / 2, s, lw);
      const off = (r * s) | 0;
      ctx.fillRect(x + off, y, lw, plank);
      ctx.fillRect(x + ((off + s / 2) % s), y + plank, lw, plank);
      ctx.fillRect(x + ((off + s / 4) % s), y + plank * 2, lw, plank);
      ctx.fillStyle = light(0.05 + r * 0.05);
      ctx.fillRect(x, y + plank * ((tx + ty) % 3), s, plank * 0.35);
      break;
    }
    case 'grass': {
      // Exterior moss over purple-grey rock.
      if (r > 0.55) {
        ctx.fillStyle = rgba(WORLD.rock, 0.2);
        ctx.beginPath();
        ctx.ellipse(x + s * hash2(tx + 3, ty), y + s * hash2(tx, ty + 5), s * 0.28, s * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(40,70,55,0.45)';
      ctx.lineWidth = lw;
      for (let i = 0; i < 3; i++) {
        const gx = x + hash2(tx * 7 + i, ty * 5) * s;
        const gy = y + hash2(tx * 5, ty * 7 + i) * s;
        ctx.beginPath();
        ctx.moveTo(gx - s * 0.05, gy);
        ctx.lineTo(gx, gy - s * 0.12);
        ctx.lineTo(gx + s * 0.05, gy);
        ctx.stroke();
      }
      break;
    }
    case 'snow': {
      if (r > 0.45) {
        ctx.fillStyle = rgba(WORLD.snowShade, 0.55);
        ctx.beginPath();
        ctx.ellipse(x + s * r, y + s * 0.6, s * 0.34, s * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (r < 0.08) {
        ctx.fillStyle = rgba(WORLD.rock, 0.5);
        ctx.beginPath();
        ctx.arc(x + s * 0.4, y + s * 0.4, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stone': {
      ctx.fillStyle = shade(0.3);
      const hs = s / 2;
      const off = ty % 2 ? hs / 2 : 0;
      ctx.fillRect(x, y + hs - lw / 2, s, lw);
      ctx.fillRect(x, y + s - lw / 2, s, lw);
      ctx.fillRect(x + off, y, lw, hs);
      ctx.fillRect(x + ((off + hs) % s), y + hs, lw, hs);
      ctx.fillStyle = light(0.06);
      ctx.fillRect(x + off + lw, y + lw, hs * 0.6, lw);
      break;
    }
  }
}

// --- Ink outlines -----------------------------------------------------------

type Scratch = { c: HTMLCanvasElement | OffscreenCanvas; g: CanvasRenderingContext2D };
const scratches: Scratch[] = [];
function scratch(i: number, w: number, h: number): Scratch | null {
  let sc = scratches[i];
  if (!sc || sc.c.width < w || sc.c.height < h) {
    const W = Math.max(w, sc?.c.width ?? 0, 64);
    const H = Math.max(h, sc?.c.height ?? 0, 64);
    const c: HTMLCanvasElement | OffscreenCanvas =
      typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: W, height: H }) : new OffscreenCanvas(W, H);
    const g = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (!g) return null;
    sc = { c, g };
    scratches[i] = sc;
  }
  sc.g.setTransform(1, 0, 0, 1, 0, 0);
  sc.g.globalCompositeOperation = 'source-over';
  sc.g.globalAlpha = 1;
  sc.g.clearRect(0, 0, w + 2, h + 2);
  return sc;
}

const RING = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2 + 0.39), Math.sin((i / 8) * Math.PI * 2 + 0.39)] as const);

/**
 * Draw `draw` with a thick outline around its whole silhouette (dilation of
 * the alpha mask). Bounds are in the caller's user space; works for any
 * uniform-scale transform. Used for props, stations, vents and target glows.
 */
export function inked(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  width: number,
  draw: (g: CanvasRenderingContext2D) => void,
  ink: string = WORLD.ink,
  under = true,
): void {
  const tr = ctx.getTransform();
  const k = Math.hypot(tr.a, tr.b) || 1;
  const pad = width * 1.6 + 1 / k;
  const W = Math.ceil((bw + pad * 2) * k);
  const H = Math.ceil((bh + pad * 2) * k);
  if (!(W > 0 && H > 0) || W * H > 4_000_000) {
    draw(ctx);
    return;
  }
  const A = scratch(0, W, H);
  const B = scratch(1, W, H);
  if (!A || !B) {
    draw(ctx);
    return;
  }
  A.g.setTransform(k, 0, 0, k, (pad - bx) * k, (pad - by) * k);
  draw(A.g);
  A.g.setTransform(1, 0, 0, 1, 0, 0);
  const r = width * k;
  for (const [cx, cy] of RING) B.g.drawImage(A.c as CanvasImageSource, 0, 0, W, H, cx * r, cy * r, W, H);
  B.g.globalCompositeOperation = 'source-in';
  B.g.fillStyle = ink;
  B.g.fillRect(0, 0, W, H);
  B.g.globalCompositeOperation = 'source-over';
  const dx = bx - pad;
  const dy = by - pad;
  ctx.drawImage(B.c as CanvasImageSource, 0, 0, W, H, dx, dy, W / k, H / k);
  if (under) ctx.drawImage(A.c as CanvasImageSource, 0, 0, W, H, dx, dy, W / k, H / k);
}

const inkCache = new Map<string, { c: HTMLCanvasElement | OffscreenCanvas; W: number; H: number; pad: number }>();

/**
 * `inked` with the result cached as a bitmap under `key` (draw must be in
 * local coordinates around the bounds). Repeated props / stations / vents
 * then cost one drawImage when chunks are baked.
 */
export function inkedCached(
  ctx: CanvasRenderingContext2D,
  key: string,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  width: number,
  draw: (g: CanvasRenderingContext2D) => void,
  ink: string = WORLD.ink,
): void {
  const tr = ctx.getTransform();
  const k = Math.hypot(tr.a, tr.b) || 1;
  const full = `${key}|${k.toFixed(3)}|${width.toFixed(2)}|${ink}|${bx.toFixed(1)},${by.toFixed(1)},${bw.toFixed(1)},${bh.toFixed(1)}`;
  let e = inkCache.get(full);
  if (!e) {
    const pad = width * 1.6 + 2 / k;
    const W = Math.ceil((bw + pad * 2) * k);
    const H = Math.ceil((bh + pad * 2) * k);
    if (!(W > 0 && H > 0) || W * H > 4_000_000 || typeof document === 'undefined') {
      inked(ctx, bx, by, bw, bh, width, draw, ink);
      return;
    }
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const g = c.getContext('2d');
    if (!g) {
      inked(ctx, bx, by, bw, bh, width, draw, ink);
      return;
    }
    g.setTransform(k, 0, 0, k, (pad - bx) * k, (pad - by) * k);
    inked(g, bx, by, bw, bh, width, draw, ink);
    e = { c, W, H, pad };
    if (inkCache.size > 400) inkCache.clear();
    inkCache.set(full, e);
  }
  ctx.drawImage(e.c as CanvasImageSource, 0, 0, e.W, e.H, bx - e.pad, by - e.pad, e.W / k, e.H / k);
}

/** Soft elliptical drop shadow (characters, props). */
export function softShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.3): void {
  if (rx <= 0 || ry <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `${WORLD.shadow}${a})`);
  g.addColorStop(0.6, `${WORLD.shadow}${a * 0.7})`);
  g.addColorStop(1, `${WORLD.shadow}0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Base floor colour for a style, tinted toward the room accent. */
export function floorBase(style: FloorStyle, accent: string, night: boolean): string {
  const base: Record<FloorStyle, string> = {
    tile: '#e9edf5',
    wood: '#d9b48a',
    carpet: '#c9cfe6',
    metal: '#c6ced9',
    grass: '#8fd18a',
    snow: '#f4f7fb',
    stone: '#b9b3a8',
    checker: '#eef0f6',
    rug: '#e8d9e9',
  };
  const tint = style === 'grass' || style === 'snow' || style === 'wood' ? 0.14 : 0.26;
  const c = mix(base[style], accent, tint);
  return night ? mix(c, '#0b1022', 0.55) : c;
}

export function paintFloorTile(ctx: CanvasRenderingContext2D, style: FloorStyle, tx: number, ty: number, s: number, base: string): void {
  const x = tx * s;
  const y = ty * s;
  const r = hash2(tx, ty);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, s + 0.5, s + 0.5);
  switch (style) {
    case 'tile': {
      ctx.strokeStyle = 'rgba(30,40,70,0.08)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      if (r > 0.92) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
      }
      break;
    }
    case 'checker': {
      if ((tx + ty) % 2 === 0) {
        ctx.fillStyle = 'rgba(20,30,60,0.09)';
        ctx.fillRect(x, y, s, s);
      }
      break;
    }
    case 'wood': {
      ctx.strokeStyle = 'rgba(90,50,20,0.18)';
      ctx.lineWidth = Math.max(1, s * 0.025);
      const plank = s / 3;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y + plank * i);
        ctx.lineTo(x + s, y + plank * i);
        ctx.stroke();
      }
      const off = (r * s) | 0;
      ctx.beginPath();
      ctx.moveTo(x + off, y);
      ctx.lineTo(x + off, y + plank);
      ctx.moveTo(x + ((off + s / 2) % s), y + plank);
      ctx.lineTo(x + ((off + s / 2) % s), y + plank * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,240,220,${0.05 + r * 0.06})`;
      ctx.fillRect(x, y, s, plank);
      break;
    }
    case 'carpet':
    case 'rug': {
      ctx.fillStyle = `rgba(255,255,255,${0.04 + r * 0.05})`;
      for (let i = 0; i < 3; i++) {
        const px = x + hash2(tx * 3 + i, ty) * s;
        const py = y + hash2(tx, ty * 3 + i) * s;
        ctx.fillRect(px, py, s * 0.06, s * 0.06);
      }
      break;
    }
    case 'metal': {
      ctx.strokeStyle = 'rgba(40,50,70,0.16)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      ctx.fillStyle = 'rgba(40,50,70,0.22)';
      const d = s * 0.12;
      for (const [cx, cy] of [
        [x + d, y + d],
        [x + s - d, y + d],
        [x + d, y + s - d],
        [x + s - d, y + s - d],
      ] as const) {
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      if (r > 0.8) {
        ctx.strokeStyle = 'rgba(40,50,70,0.12)';
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x + (s / 4) * i, y + s * 0.2);
          ctx.lineTo(x + (s / 4) * i, y + s * 0.8);
          ctx.stroke();
        }
      }
      break;
    }
    case 'grass': {
      ctx.strokeStyle = `rgba(40,110,50,${0.25 + r * 0.2})`;
      ctx.lineWidth = Math.max(1, s * 0.03);
      for (let i = 0; i < 5; i++) {
        const gx = x + hash2(tx * 7 + i, ty * 5) * s;
        const gy = y + hash2(tx * 5, ty * 7 + i) * s;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + s * 0.04, gy - s * 0.12);
        ctx.stroke();
      }
      if (r > 0.94) {
        ctx.fillStyle = r > 0.97 ? '#fde68a' : '#fbcfe8';
        ctx.beginPath();
        ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'snow': {
      ctx.fillStyle = 'rgba(180,200,230,0.25)';
      if (r > 0.6) {
        ctx.beginPath();
        ctx.ellipse(x + s * r, y + s * 0.6, s * 0.3, s * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stone': {
      ctx.strokeStyle = 'rgba(60,50,40,0.2)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      const hs = s / 2;
      const off = ty % 2 ? hs / 2 : 0;
      ctx.strokeRect(x + off, y, hs, hs);
      ctx.strokeRect(x + ((off + hs) % s), y + hs, hs, hs);
      break;
    }
  }
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/**
 * Paint a prop in its footprint: soft drop shadow, flat cel colours and a
 * thick ink outline around the silhouette. `night` darkens. Called for the
 * baked layer (animated details are added per-frame by `paintPropLive`).
 */
export function paintProp(ctx: CanvasRenderingContext2D, p: PropDef, s: number, night: boolean): void {
  const w = (p.w ?? 1) * s;
  const h = (p.h ?? 1) * s;
  const flatKinds = p.kind === 'rug' || p.kind === 'poster' || p.kind === 'window';
  if (!flatKinds) {
    const round = p.kind === 'roundTable' || p.kind === 'barrel' || p.kind === 'tank' || p.kind === 'pillar' || p.kind === 'rock' || p.kind === 'fountain' || p.kind === 'tree' || p.kind === 'plant';
    const rx = (round ? Math.max(w, h) * 0.55 : Math.max(w, h) * 0.6) + s * 0.08;
    softShadow(ctx, p.x * s + s * 0.08, p.y * s + Math.min(w, h) * 0.18 + s * 0.06, rx, Math.max(s * 0.25, Math.min(w, h) * 0.5), 0.26);
  }
  const rad = Math.hypot(w, h) / 2 + s * 0.2;
  const lw = Math.max(1.2, s * (p.kind === 'rug' ? 0.03 : 0.055));
  // Same-looking props share one cached inked bitmap (3 seeded variants).
  const variant = Math.floor(hash2(Math.round(p.x * 4), Math.round(p.y * 4)) * 3);
  const local: PropDef = { ...p, x: 7.31 * (variant + 1), y: 3.17 * (variant + 1) };
  ctx.save();
  ctx.translate(p.x * s, p.y * s);
  inkedCached(ctx, `prop|${p.kind}|${p.w ?? 1}|${p.h ?? 1}|${p.rot ?? 0}|${p.color ?? ''}|${night ? 1 : 0}|${variant}`, -rad, -rad, rad * 2, rad * 2, lw, (g) => {
    g.translate(-local.x * s, -local.y * s);
    paintPropShape(g, local, s, night);
  });
  ctx.restore();
  if (p.label && s >= 14) {
    const fs = Math.max(7, s * 0.26);
    g2label(ctx, p.label, p.x * s, p.y * s + (p.kind === 'poster' || p.kind === 'screen' ? 0 : h / 2 + s * 0.3), fs, night);
  }
}

function g2label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fs: number, night: boolean): void {
  ctx.save();
  ctx.font = `800 ${fs}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, fs * 0.28);
  ctx.strokeStyle = rgba(WORLD.ink, night ? 0.6 : 0.75);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = night ? 'rgba(220,230,255,0.85)' : 'rgba(240,244,250,0.95)';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Flat fills only (no shadow, no outline): `paintProp` adds both. */
export function paintPropShape(ctx: CanvasRenderingContext2D, p: PropDef, s: number, night: boolean): void {
  const w = (p.w ?? 1) * s;
  const h = (p.h ?? 1) * s;
  const x = p.x * s - w / 2;
  const y = p.y * s - h / 2;
  const cx = p.x * s;
  const cy = p.y * s;
  const dim = (c: string) => (night ? mix(c, NIGHT_MIX, 0.5) : c);
  const lw = Math.max(1, s * 0.035);
  const line = (col: string, width = lw) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
  };
  ctx.save();
  if (p.rot) {
    ctx.translate(cx, cy);
    ctx.rotate(p.rot);
    ctx.translate(-cx, -cy);
  }
  const accent = p.color ?? '#4f9cb8';
  switch (p.kind) {
    case 'table':
    case 'desk':
    case 'counter': {
      const counter = p.kind === 'counter';
      ctx.fillStyle = dim(counter ? '#7d8a9a' : '#9a6f4e');
      rr(ctx, x, y, w, h, s * 0.1);
      ctx.fill();
      ctx.fillStyle = dim(counter ? '#a9b5c3' : '#c99b6e');
      rr(ctx, x + s * 0.05, y + s * 0.04, w - s * 0.1, h - s * 0.16, s * 0.08);
      ctx.fill();
      if (p.kind === 'desk') {
        const n = Math.max(1, Math.round(w / s / 1.5));
        for (let i = 0; i < n; i++) {
          const mx = x + (w / n) * (i + 0.5);
          ctx.fillStyle = dim('#1d2635');
          rr(ctx, mx - s * 0.36, y + s * 0.08, s * 0.72, s * 0.44, s * 0.06);
          ctx.fill();
          ctx.fillStyle = night ? '#3fe0b0' : '#7fe3c4';
          rr(ctx, mx - s * 0.3, y + s * 0.13, s * 0.6, s * 0.32, s * 0.04);
          ctx.fill();
          line('rgba(20,60,50,0.55)');
          ctx.beginPath();
          ctx.moveTo(mx - s * 0.24, y + s * 0.32);
          ctx.lineTo(mx - s * 0.1, y + s * 0.22);
          ctx.lineTo(mx + s * 0.02, y + s * 0.34);
          ctx.lineTo(mx + s * 0.22, y + s * 0.2);
          ctx.stroke();
        }
      } else if (!counter && w > s * 1.6) {
        // Donut box on longer tables (lounge vibe).
        ctx.fillStyle = dim('#f3a6c4');
        rr(ctx, cx - s * 0.32, cy - s * 0.22, s * 0.64, s * 0.4, s * 0.05);
        ctx.fill();
        ctx.fillStyle = dim('#f7d9a8');
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(cx - s * 0.18 + i * s * 0.18, cy - s * 0.02, s * 0.07, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'roundTable': {
      const top = dim(mix(accent, '#3f8fb3', 0.65));
      ctx.fillStyle = dim('#2f4656');
      ctx.beginPath();
      ctx.ellipse(cx, cy + s * 0.08, w * 0.68, h * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.68, h * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.18);
      ctx.beginPath();
      ctx.ellipse(cx - w * 0.12, cy - h * 0.16, w * 0.34, h * 0.2, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'chair':
    case 'seat': {
      ctx.fillStyle = dim('#46566a');
      rr(ctx, x + s * 0.18, y + s * 0.14, w - s * 0.36, h - s * 0.3, s * 0.14);
      ctx.fill();
      ctx.fillStyle = dim('#6b7d93');
      rr(ctx, x + s * 0.24, y + s * 0.3, w - s * 0.48, h - s * 0.5, s * 0.1);
      ctx.fill();
      break;
    }
    case 'sofa':
    case 'bench': {
      const base = p.kind === 'sofa' ? mix(accent, '#b39a7c', 0.45) : '#8a6446';
      ctx.fillStyle = dim(mix(base, '#000000', 0.18));
      rr(ctx, x, y, w, h, s * 0.26);
      ctx.fill();
      ctx.fillStyle = dim(base);
      rr(ctx, x + s * 0.1, y + h * 0.32, w - s * 0.2, h * 0.6, s * 0.18);
      ctx.fill();
      if (p.kind === 'sofa') {
        line(dim(mix(base, '#000000', 0.25)));
        const n = Math.max(2, Math.round(w / s));
        for (let i = 1; i < n; i++) {
          ctx.beginPath();
          ctx.moveTo(x + (w / n) * i, y + h * 0.38);
          ctx.lineTo(x + (w / n) * i, y + h * 0.88);
          ctx.stroke();
        }
      }
      break;
    }
    case 'bed': {
      ctx.fillStyle = dim('#e9e4dc');
      rr(ctx, x, y, w, h, s * 0.14);
      ctx.fill();
      ctx.fillStyle = dim('#ffffff');
      rr(ctx, x + s * 0.12, y + s * 0.08, w - s * 0.24, h * 0.22, s * 0.1);
      ctx.fill();
      ctx.fillStyle = dim(mix(accent, '#5f6f9a', 0.4));
      rr(ctx, x, y + h * 0.38, w, h * 0.62, s * 0.14);
      ctx.fill();
      break;
    }
    case 'shelf':
    case 'bookshelf': {
      ctx.fillStyle = dim('#5c3d2a');
      rr(ctx, x, y, w, h, s * 0.06);
      ctx.fill();
      const cols = ['#c9637f', '#4f8fb3', '#7fae5a', '#e0a64a', '#8b70b8', '#4fb3a1'];
      const n = Math.max(1, Math.floor((w - s * 0.12) / (s * 0.18)));
      for (let i = 0; i < n; i++) {
        const hh = (h - s * 0.26) * (0.75 + hash2(Math.floor(p.x * 10) + i, 7) * 0.25);
        ctx.fillStyle = dim(cols[Math.floor(hash2(Math.floor(p.x * 10) + i, Math.floor(p.y * 10)) * cols.length)]!);
        ctx.fillRect(x + s * 0.08 + i * s * 0.18, y + h - s * 0.12 - hh, s * 0.14, hh);
      }
      break;
    }
    case 'crate':
    case 'cart': {
      ctx.fillStyle = dim(p.kind === 'cart' ? '#6b7d93' : '#b0804f');
      rr(ctx, x + s * 0.05, y + s * 0.05, w - s * 0.1, h - s * 0.1, s * 0.06);
      ctx.fill();
      ctx.fillStyle = dim(p.kind === 'cart' ? '#8b9cb0' : '#c99a64');
      rr(ctx, x + s * 0.14, y + s * 0.14, w - s * 0.28, h - s * 0.28, s * 0.04);
      ctx.fill();
      line(dim(p.kind === 'cart' ? '#4a596c' : '#7a5330'), s * 0.06);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.14, y + s * 0.14);
      ctx.lineTo(x + w - s * 0.14, y + h - s * 0.14);
      ctx.moveTo(x + w - s * 0.14, y + s * 0.14);
      ctx.lineTo(x + s * 0.14, y + h - s * 0.14);
      ctx.stroke();
      break;
    }
    case 'barrel': {
      ctx.fillStyle = dim('#a2502e');
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.42, 0, Math.PI * 2);
      ctx.fill();
      line(dim('#5a6470'), s * 0.06);
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.18);
      ctx.beginPath();
      ctx.arc(cx - w * 0.12, cy - w * 0.12, w * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'plant':
    case 'planter':
    case 'tree':
    case 'hedge': {
      const big = p.kind === 'tree' ? 1.2 : p.kind === 'hedge' ? 1 : 0.75;
      if (p.kind === 'planter' || p.kind === 'plant') {
        ctx.fillStyle = dim('#8a5a3c');
        if (p.kind === 'planter') rr(ctx, x, y, w, h, s * 0.12);
        else {
          ctx.beginPath();
          ctx.arc(cx, cy + h * 0.1, Math.min(w, h) * 0.3, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      const greens = p.kind === 'hedge' ? ['#2f6b4f', '#3a7d5c', '#4c936c'] : ['#3c8a5e', '#4fa06d', '#69b77f'];
      const blobs = p.kind === 'hedge' ? Math.max(3, Math.round((w + h) / s) * 2) : p.kind === 'planter' ? 4 : 5;
      for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * Math.PI * 2;
        const rad = (Math.min(w, h) / 2) * big * 0.55;
        const bx = cx + Math.cos(a) * rad * 0.5 * (p.kind === 'hedge' ? w / Math.min(w, h) : 1);
        const by = cy + Math.sin(a) * rad * 0.5 * (p.kind === 'hedge' ? h / Math.min(w, h) : 1);
        ctx.fillStyle = dim(greens[i % greens.length]!);
        ctx.beginPath();
        ctx.arc(bx, by, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.kind !== 'hedge') {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.arc(cx - w * 0.12, cy - h * 0.15, Math.min(w, h) * 0.12 * big, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.kind === 'tree' && !night) {
        ctx.fillStyle = '#d94a6a';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(cx + Math.cos(i * 1.7) * w * 0.3, cy + Math.sin(i * 1.7) * h * 0.3, s * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'window': {
      const hh = Math.max(h, s * 0.22);
      ctx.fillStyle = dim('#8c9aa8');
      rr(ctx, x - s * 0.04, y - s * 0.04, w + s * 0.08, hh + s * 0.08, s * 0.06);
      ctx.fill();
      ctx.fillStyle = night ? '#0a1030' : '#16204a';
      rr(ctx, x, y, w, hh, s * 0.04);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < Math.max(2, w / s * 3); i++) ctx.fillRect(x + hash2(i, p.x | 0) * w, y + hash2(p.y | 0, i) * hh, s * 0.03, s * 0.03);
      break;
    }
    case 'console':
    case 'screen': {
      const hh = Math.max(h, s * 0.25);
      ctx.fillStyle = dim(p.kind === 'console' ? '#3a4a5c' : '#222c3b');
      rr(ctx, x, y, w, hh, s * 0.1);
      ctx.fill();
      const scr = p.kind === 'console' ? (night ? '#3fe0b0' : '#6fd9b6') : night ? '#3fc8e0' : '#79c7dd';
      ctx.fillStyle = scr;
      rr(ctx, x + s * 0.07, y + s * 0.06, w - s * 0.14, hh - s * 0.14, s * 0.06);
      ctx.fill();
      if (p.kind === 'console' && hh > s * 0.5) {
        // Button row (red / yellow dots, ref targeting console).
        const n = Math.max(2, Math.floor(w / (s * 0.35)));
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i % 3 === 0 ? '#e0566a' : i % 3 === 1 ? '#f2c230' : '#5fb0e0';
          ctx.beginPath();
          ctx.arc(x + (w / n) * (i + 0.5), y + hh - s * 0.18, s * 0.07, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'server':
    case 'locker':
    case 'fridge': {
      const col = p.kind === 'server' ? '#28313f' : p.kind === 'locker' ? '#5a8a86' : '#e6e8ee';
      ctx.fillStyle = dim(col);
      rr(ctx, x + s * 0.06, y + s * 0.04, w - s * 0.12, h - s * 0.08, s * 0.08);
      ctx.fill();
      ctx.fillStyle = dim(mix(col, '#ffffff', 0.15));
      rr(ctx, x + s * 0.12, y + s * 0.08, w - s * 0.24, h * 0.18, s * 0.05);
      ctx.fill();
      if (p.kind === 'locker') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        const n = Math.max(1, Math.round(w / s / 0.5));
        for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) ctx.fillRect(x + s * 0.12 + (i * (w - s * 0.24)) / n + s * 0.06, y + h * 0.36 + j * s * 0.1, (w - s * 0.24) / n - s * 0.12, s * 0.04);
      }
      break;
    }
    case 'stove':
    case 'generator':
    case 'engine': {
      ctx.fillStyle = dim('#4a5868');
      rr(ctx, x, y, w, h, s * 0.16);
      ctx.fill();
      if (p.kind !== 'stove') {
        // Hazard band.
        ctx.save();
        rr(ctx, x + s * 0.06, y + h - s * 0.24, w - s * 0.12, s * 0.16, s * 0.04);
        ctx.clip();
        ctx.fillStyle = dim('#f2c230');
        ctx.fillRect(x, y + h - s * 0.26, w, s * 0.2);
        ctx.fillStyle = dim('#1d2430');
        for (let i = -2; i < w / (s * 0.24) + 2; i++) {
          ctx.beginPath();
          ctx.moveTo(x + i * s * 0.24, y + h);
          ctx.lineTo(x + i * s * 0.24 + s * 0.12, y + h);
          ctx.lineTo(x + i * s * 0.24 + s * 0.3, y + h - s * 0.3);
          ctx.lineTo(x + i * s * 0.24 + s * 0.18, y + h - s * 0.3);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.fillStyle = dim(p.kind === 'engine' ? '#ff8a3d' : p.kind === 'stove' ? '#e0566a' : '#f2c230');
      rr(ctx, x + w * 0.2, y + h * 0.18, w * 0.6, h * 0.45, s * 0.1);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      rr(ctx, x + w * 0.26, y + h * 0.24, w * 0.22, h * 0.12, s * 0.04);
      ctx.fill();
      break;
    }
    case 'tank': {
      ctx.fillStyle = dim('#5e6c7c');
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dim('#5fc9a0');
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx - w * 0.14, cy - h * 0.14, w * 0.12, h * 0.08, -0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'pillar':
    case 'statue':
    case 'rock':
    case 'snowpile': {
      const col = p.kind === 'snowpile' ? WORLD.snow : p.kind === 'rock' ? WORLD.rock : p.kind === 'statue' ? '#b9c3cf' : '#5d7480';
      ctx.fillStyle = dim(col);
      ctx.beginPath();
      if (p.kind === 'rock') {
        // Low-poly boulder.
        const n = 7;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const rr2 = 0.4 + hash2(i, (p.x * 7) | 0) * 0.1;
          const px = cx + Math.cos(a) * w * rr2;
          const py = cy + Math.sin(a) * h * rr2;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
      } else ctx.ellipse(cx, cy, w * 0.45, h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.kind === 'rock' ? dim(WORLD.rockHi) : p.kind === 'snowpile' ? '#ffffff' : 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx - w * 0.1, cy - h * 0.12, w * 0.2, h * 0.14, -0.4, 0, Math.PI * 2);
      ctx.fill();
      if (p.kind === 'statue') {
        ctx.fillStyle = dim('#4f9cb8');
        ctx.beginPath();
        ctx.arc(cx, cy - h * 0.05, w * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'fountain': {
      ctx.fillStyle = dim('#9aa6b4');
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = night ? '#1e3a8a' : '#5fb7dd';
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'rug': {
      ctx.fillStyle = dim(mix(accent, '#9a7280', 0.45));
      rr(ctx, x, y, w, h, s * 0.16);
      ctx.fill();
      line(rgba('#f5e6d0', night ? 0.25 : 0.5), s * 0.05);
      rr(ctx, x + s * 0.18, y + s * 0.18, w - s * 0.36, h - s * 0.36, s * 0.1);
      ctx.stroke();
      break;
    }
    case 'arcade':
    case 'piano':
    case 'clock':
    case 'fireplace':
    case 'telescope':
    case 'dish':
    case 'turntable':
    case 'mailbox':
    case 'tube':
    case 'pipe':
    case 'lamp': {
      const col =
        p.kind === 'arcade'
          ? '#6c4bb8'
          : p.kind === 'piano'
            ? '#1d2230'
            : p.kind === 'fireplace'
              ? '#6b3b26'
              : p.kind === 'mailbox'
                ? '#3d6fb8'
                : p.kind === 'tube' || p.kind === 'pipe'
                  ? '#7f95a3'
                  : p.kind === 'turntable'
                    ? '#262c3a'
                    : '#5d6d7e';
      ctx.fillStyle = dim(col);
      if (p.kind === 'dish' || p.kind === 'turntable' || p.kind === 'clock' || p.kind === 'tube' || p.kind === 'lamp') {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.kind === 'tube' ? dim('#8fe0d0') : p.kind === 'lamp' ? '#ffe7a3' : dim(p.kind === 'turntable' ? '#d7dbe3' : '#eef1f6');
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * (p.kind === 'tube' ? 0.3 : 0.18), 0, Math.PI * 2);
        ctx.fill();
      } else {
        rr(ctx, x + s * 0.05, y + s * 0.05, w - s * 0.1, h - s * 0.1, s * 0.12);
        ctx.fill();
        if (p.kind === 'arcade') {
          ctx.fillStyle = night ? '#ff7ad9' : '#ff9ad9';
          rr(ctx, x + s * 0.18, y + s * 0.14, w - s * 0.36, h * 0.38, s * 0.06);
          ctx.fill();
        }
        if (p.kind === 'piano') {
          ctx.fillStyle = '#f4f1ea';
          ctx.fillRect(x + s * 0.1, y + h * 0.65, w - s * 0.2, h * 0.2);
        }
        if (p.kind === 'fireplace') {
          ctx.fillStyle = '#ff8a3d';
          rr(ctx, x + w * 0.25, y + h * 0.35, w * 0.5, h * 0.45, s * 0.1);
          ctx.fill();
        }
        if (p.kind === 'pipe') {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(x + s * 0.1, y + s * 0.12, w - s * 0.2, Math.max(1, h * 0.15));
        }
      }
      break;
    }
    case 'poster': {
      ctx.fillStyle = dim('#efe6d4');
      rr(ctx, x - s * 0.03, y - s * 0.08, w + s * 0.06, Math.max(h, s * 0.18) + s * 0.06, s * 0.03);
      ctx.fill();
      ctx.fillStyle = dim(mix(accent, '#c9637f', 0.3));
      rr(ctx, x, y - s * 0.05, w, Math.max(h, s * 0.18), s * 0.03);
      ctx.fill();
      break;
    }
    default: {
      // Unknown / new kinds: a generic equipment block that still reads.
      ctx.fillStyle = dim('#6b7d8f');
      rr(ctx, x, y, w, h, s * 0.1);
      ctx.fill();
      ctx.fillStyle = dim(mix(accent, '#8fa3b5', 0.5));
      rr(ctx, x + s * 0.1, y + s * 0.08, w - s * 0.2, h * 0.4, s * 0.06);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Small animated overlays drawn every frame for visible props. */
export function paintPropLive(ctx: CanvasRenderingContext2D, p: PropDef, s: number, t: number, night: boolean): void {
  if (p.kind === 'server') {
    const w = (p.w ?? 1) * s;
    const h = (p.h ?? 1) * s;
    const x = p.x * s - w / 2;
    const y = p.y * s - h / 2;
    for (let i = 0; i < 4; i++) {
      const on = Math.sin(t * (3 + i) + p.x * 3 + i) > 0.2;
      ctx.fillStyle = on ? (i % 2 ? '#22d3ee' : '#4ade80') : 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + w * 0.25, y + h * (0.2 + i * 0.16), w * 0.12, h * 0.07);
    }
  } else if (p.kind === 'screen' || p.kind === 'console' || p.kind === 'arcade') {
    const w = (p.w ?? 1) * s;
    const h = Math.max((p.h ?? 1) * s, s * 0.25);
    const x = p.x * s - w / 2;
    const y = p.y * s - h / 2;
    const a = 0.12 + 0.08 * Math.sin(t * 2 + p.x);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x + w * 0.1, y + h * (0.3 + 0.2 * Math.sin(t * 1.3 + p.y)), w * 0.8, Math.max(1, h * 0.08));
    if (night) {
      ctx.fillStyle = 'rgba(56,189,248,0.12)';
      ctx.beginPath();
      ctx.ellipse(p.x * s, p.y * s + s * 0.6, w * 0.6, s * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.kind === 'turntable') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = s * 0.04;
    ctx.beginPath();
    ctx.arc(p.x * s, p.y * s, (p.w ?? 1) * s * 0.32, t * 3, t * 3 + 1.2);
    ctx.stroke();
  } else if (p.kind === 'fireplace') {
    const f = 0.6 + 0.4 * Math.sin(t * 9 + p.x);
    ctx.fillStyle = `rgba(253,186,116,${0.15 * f})`;
    ctx.beginPath();
    ctx.arc(p.x * s, p.y * s + s, s * 2.2 * f, 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface StationStyle {
  color: string;
  icon: 'task' | 'button' | 'console' | 'panel' | 'critical' | 'recharge' | 'mirror' | 'laptop';
}

export function stationStyle(kind: StationDef['kind']): StationStyle {
  switch (kind) {
    case 'emergency':
      return { color: '#ef4444', icon: 'button' };
    case 'admin':
    case 'cams':
    case 'vitals':
    case 'doorlog':
      return { color: '#38bdf8', icon: 'console' };
    case 'lightsPanel':
    case 'commsPanel':
      return { color: '#f59e0b', icon: 'panel' };
    case 'meltdownA':
    case 'meltdownB':
    case 'pressureA':
    case 'pressureB':
      return { color: '#f43f5e', icon: 'critical' };
    case 'recharge':
      return { color: '#facc15', icon: 'recharge' };
    case 'wardrobe':
      return { color: '#ec4899', icon: 'mirror' };
    case 'laptop':
      return { color: '#2f6fed', icon: 'laptop' };
    default:
      return { color: '#fbbf24', icon: 'task' };
  }
}

/** Static base of a station (panel on the floor / wall), inked. */
export function paintStation(ctx: CanvasRenderingContext2D, st: StationDef, s: number, night: boolean): void {
  const x = st.x * s;
  const y = st.y * s;
  softShadow(ctx, x + s * 0.05, y + s * 0.2, s * 0.5, s * 0.24, 0.25);
  ctx.save();
  ctx.translate(x, y);
  inkedCached(ctx, `station|${stationStyle(st.kind).icon}|${stationStyle(st.kind).color}|${night ? 1 : 0}`, -s, -s, s * 2, s * 2, Math.max(1.2, s * 0.05), (g) => paintStationShape(g, { ...st, x: 0, y: 0 }, s, night));
  ctx.restore();
}

export function paintStationShape(ctx: CanvasRenderingContext2D, st: StationDef, s: number, night: boolean): void {
  const style = stationStyle(st.kind);
  const x = st.x * s;
  const y = st.y * s;
  const dim = (c: string) => (night ? mix(c, NIGHT_MIX, 0.45) : c);
  ctx.save();
  if (style.icon === 'button') {
    // Red dome on a hazard-striped pedestal.
    ctx.fillStyle = dim('#f2c230');
    ctx.beginPath();
    ctx.arc(x, y, s * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, s * 0.46, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = dim('#1d2430');
    for (let i = -6; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * s * 0.18, y + s * 0.5);
      ctx.lineTo(x + i * s * 0.18 + s * 0.09, y + s * 0.5);
      ctx.lineTo(x + i * s * 0.18 + s * 0.59, y - s * 0.5);
      ctx.lineTo(x + i * s * 0.18 + s * 0.5, y - s * 0.5);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = dim('#3a4656');
    ctx.beginPath();
    ctx.arc(x, y, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8364a';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.03, s * 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(x - s * 0.08, y - s * 0.13, s * 0.09, s * 0.06, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (style.icon === 'mirror') {
    ctx.fillStyle = dim('#c9637f');
    rr(ctx, x - s * 0.45, y - s * 0.7, s * 0.9, s * 1.2, s * 0.4);
    ctx.fill();
    ctx.fillStyle = '#d6ecf5';
    rr(ctx, x - s * 0.33, y - s * 0.58, s * 0.66, s * 0.96, s * 0.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x - s * 0.18, y - s * 0.45, s * 0.08, s * 0.5);
  } else if (style.icon === 'laptop') {
    ctx.fillStyle = dim('#3a4656');
    rr(ctx, x - s * 0.45, y - s * 0.3, s * 0.9, s * 0.6, s * 0.08);
    ctx.fill();
    ctx.fillStyle = '#7fc8e8';
    rr(ctx, x - s * 0.38, y - s * 0.24, s * 0.76, s * 0.38, s * 0.05);
    ctx.fill();
  } else {
    // Wall console / task panel: slate housing, coloured screen, two knobs.
    ctx.fillStyle = dim('#3d4b5c');
    rr(ctx, x - s * 0.36, y - s * 0.34, s * 0.72, s * 0.66, s * 0.12);
    ctx.fill();
    ctx.fillStyle = dim('#55667a');
    rr(ctx, x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.1, s * 0.04);
    ctx.fill();
    const scr = style.icon === 'task' ? '#7fe3c4' : style.color;
    ctx.fillStyle = night ? mix(scr, '#ffffff', 0.1) : scr;
    rr(ctx, x - s * 0.25, y - s * 0.17, s * 0.5, s * 0.3, s * 0.06);
    ctx.fill();
    ctx.fillStyle = style.icon === 'critical' ? '#ff4d5e' : '#f2c230';
    ctx.beginPath();
    ctx.arc(x - s * 0.15, y + s * 0.22, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0566a';
    ctx.beginPath();
    ctx.arc(x + s * 0.15, y + s * 0.22, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Floor vent: riveted frame with dark slats (ref: VR vent grate). */
export function paintVent(ctx: CanvasRenderingContext2D, v: VentDef, s: number, night: boolean): void {
  ctx.save();
  ctx.translate(v.x * s, v.y * s);
  inkedCached(ctx, `vent|${night ? 1 : 0}`, -s * 0.7, -s * 0.6, s * 1.4, s * 1.2, Math.max(1.2, s * 0.05), (g) => paintVentShape(g, 0, 0, s, night));
  ctx.restore();
}

export function paintVentShape(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, night: boolean): void {
  ctx.save();
  ctx.fillStyle = night ? '#4a5160' : '#a8aa9c';
  rr(ctx, x - s * 0.5, y - s * 0.36, s * 1, s * 0.72, s * 0.12);
  ctx.fill();
  ctx.fillStyle = night ? '#090c14' : '#1b212c';
  rr(ctx, x - s * 0.36, y - s * 0.24, s * 0.72, s * 0.48, s * 0.04);
  ctx.fill();
  ctx.fillStyle = night ? '#3a4150' : '#7d8290';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - s * 0.36, y - s * 0.2 + i * s * 0.12, s * 0.72, s * 0.045);
  ctx.fillStyle = night ? '#2a2f3a' : '#6c6f66';
  for (const [dx, dy] of [
    [-0.43, -0.29],
    [0.43, -0.29],
    [-0.43, 0.29],
    [0.43, 0.29],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
