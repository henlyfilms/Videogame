/** Small Canvas 2D helpers shared by the berry painters. */
import type { Cosmetics } from '../../core/types';
import { BERRY_BY_ID, paletteColor, type BerryDef, type PaletteColor } from '../catalog';
import { berryProfile, faceLine, mix } from '../shape';

export type Ctx = CanvasRenderingContext2D;

/** Outline ink: a warm near-black reads friendlier than pure black. */
export const INK = '#211a2e';
export const LEAF = '#3fae4b';
export const LEAF_DARK = '#25763a';
export const GOLD = '#ffcc3d';
export const GOLD_DARK = '#c48a12';
export const WHITE = '#fffdf8';

export const TAU = Math.PI * 2;

export function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

export function circ(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
}

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

export function poly(ctx: Ctx, pts: readonly (readonly [number, number])[], close = true): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  if (close) ctx.closePath();
}

/** Fill the current path and stroke it with the toon outline. */
export function fs(ctx: Ctx, fill: string | CanvasGradient, lw = 1.3, ink: string = INK): void {
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = ink;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Thick outlined stroke ("noodle") along the current path. */
export function noodle(ctx: Ctx, color: string, lw: number, ink: string = INK): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw + 2.2;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

export function star(ctx: Ctx, x: number, y: number, r: number, inner = 0.45, points = 5, rot = -Math.PI / 2): void {
  ctx.beginPath();
  for (let i = 0; i <= points * 2; i++) {
    const a = rot + (i / (points * 2)) * TAU;
    const rr2 = i % 2 === 0 ? r : r * inner;
    const px = x + Math.cos(a) * rr2;
    const py = y + Math.sin(a) * rr2;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function heart(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.3, y + s * 0.05, x - s * 0.75, y - s * 1.05, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.75, y - s * 1.05, x + s * 1.3, y + s * 0.05, x, y + s * 0.9);
  ctx.closePath();
}

/** Four-point twinkle. */
export function twinkle(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Deterministic tiny RNG for decoration placement. */
export function srand(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Berry layout (local units: feet at 0,0, facing +x, ~44 units tall)

export interface Geo {
  def: BerryDef;
  pal: PaletteColor;
  /** Body width / height. */
  w: number;
  h: number;
  bottom: number;
  top: number;
  /** Face centre (eye line). */
  fx: number;
  fy: number;
  /** Shoulder height and x offsets. */
  sy: number;
  sxFront: number;
  sxBack: number;
  /** Neckline (top of outfits). */
  neck: number;
  /** Half-width of the body at a given y. */
  halfAt(y: number): number;
}

const geoCache = new Map<string, Geo>();

export function geoFor(c: Cosmetics): Geo {
  const key = `${c.berry}|${c.color}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const def = BERRY_BY_ID[c.berry] ?? BERRY_BY_ID.strawberry;
  const pal = paletteColor(c.color);
  const w = 33 * def.width;
  const h = 30.5 * def.aspect;
  const bottom = -4.5;
  const top = bottom - h;
  const fl = faceLine(def.id);
  const halfAt = (y: number): number => {
    const t = (bottom - y) / h;
    return berryProfile(def.id, t) * (w / 2);
  };
  const neck = bottom - h * 0.3;
  const sy = bottom - h * 0.31;
  const g: Geo = {
    def,
    pal,
    w,
    h,
    bottom,
    top,
    fx: w * 0.13,
    fy: bottom - h * fl,
    sy,
    sxFront: halfAt(sy) - 1.6,
    sxBack: -(halfAt(sy) - 1.6),
    neck,
    halfAt,
  };
  geoCache.set(key, g);
  return g;
}

/** Points of the body silhouette (facing right). */
const outlineCache = new Map<string, Float32Array>();

export function bodyOutline(g: Geo): Float32Array {
  const key = `${g.def.id}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const N = 120;
  const pts = new Float32Array(N * 2);
  const cy = g.bottom - g.h / 2;
  const amp = g.def.bumpSize * 0.42;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * TAU;
    const t = (1 - Math.cos(th)) / 2;
    const side = Math.sin(th) >= 0 ? 1 : -1;
    let x = side * berryProfile(g.def.id, t) * (g.w / 2);
    let y = g.bottom - t * g.h;
    if (g.def.bumps > 0) {
      const b = Math.abs(Math.sin(th * (g.def.bumps / 2)));
      const k = 1 + amp * (Math.pow(b, 0.6) - 0.55);
      x *= k;
      y = cy + (y - cy) * k;
    }
    if (g.def.id === 'cherry' && t > 0.8) {
      y += 3.2 * Math.max(0, 1 - Math.abs(x) / (g.w * 0.28)) * ((t - 0.8) / 0.2);
    }
    pts[i * 2] = x;
    pts[i * 2 + 1] = y;
  }
  outlineCache.set(key, pts);
  return pts;
}

export function traceBody(ctx: Ctx, g: Geo, inflate = 0, ox = 0, oy = 0): void {
  const pts = bodyOutline(g);
  const cy = g.bottom - g.h / 2;
  const k = 1 + inflate / (g.w / 2);
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i]! * k + ox;
    const y = cy + (pts[i + 1]! - cy) * k + oy;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Colour set derived from cosmetics for painters. */
export interface Tones {
  base: string;
  dark: string;
  light: string;
  deep: string;
  hair: string;
  hairDark: string;
  hairLight: string;
  mitten: string;
  shoe: string;
}

export function tonesFor(c: Cosmetics, pal: PaletteColor): Tones {
  return {
    base: pal.hex,
    dark: pal.dark,
    light: pal.light,
    deep: mix(pal.dark, '#120c1c', 0.45),
    hair: c.hairColor,
    hairDark: mix(c.hairColor, '#120c1c', 0.38),
    hairLight: mix(c.hairColor, '#ffffff', 0.35),
    mitten: mix(pal.light, '#ffffff', 0.55),
    shoe: mix(pal.dark, '#1a1424', 0.55),
  };
}
