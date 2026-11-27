/**
 * Marion Mystery — Canvas 2D berry renderer.
 *
 * Used by the 2D game view, menus and thumbnails. Characters are drawn
 * upright and side-on (3/4) like a top-down 2.5D game: `(x, y)` is the feet
 * position and at scale 1 a berry is ~44px tall. Expensive static layers
 * (body + surface detail + pattern + outfit, static hats) are cached in
 * offscreen canvases keyed by cosmetics + resolution bucket.
 */
import type { Cosmetics } from '../core/types';
import { EMOTE_BY_ID, HAIR_BY_ID, HAT_BY_ID, NAMEPLATE_BY_ID, NAMEPLATES, PATTERN_BY_ID, paletteColor } from './catalog';
import { hash32, luma, mix, rgba } from './shape';
import { paintBack, paintBackStraps } from './paint/back';
import { paintFace, type Expr, type FaceState } from './paint/face';
import { paintHair } from './paint/hair';
import { paintHat } from './paint/hats';
import { paintOutfit, paintOutfitBehind, sleeveColor } from './paint/outfits';
import { paintPet } from './paint/pets';
import {
  circ,
  ell,
  fs,
  geoFor,
  heart,
  INK,
  LEAF,
  LEAF_DARK,
  line,
  poly,
  rr,
  srand,
  star,
  TAU,
  tonesFor,
  traceBody,
  twinkle,
  type Ctx,
  type Geo,
  type Tones,
} from './paint/util';

export interface BerryPose {
  time: number;
  moving: boolean;
  dir: 1 | -1;
  emote?: string | null;
  ghost?: boolean;
  alpha?: number;
  hold?: 'gun' | 'knife' | 'flashlight' | null;
  flashlightOn?: boolean;
  /** Vertical aim of a held gun / flashlight, -1 (up the screen) … 1 (down), so the beam matches the facing. */
  aimY?: number;
  scared?: boolean;
  blink?: boolean;
}

export type { FaceState, Expr };

// ---------------------------------------------------------------------------
// Offscreen layer cache

interface Layer {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Local-unit rectangle covered by the canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_LAYERS = 320;
const layers = new Map<string, Layer | null>();

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  try {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  } catch {
    /* no canvas available */
  }
  return null;
}

function getLayer(key: string, x: number, y: number, w: number, h: number, res: number, paint: (ctx: Ctx) => void): Layer | null {
  const full = `${key}@${res}`;
  if (layers.has(full)) {
    const hit = layers.get(full)!;
    // Refresh LRU position.
    layers.delete(full);
    layers.set(full, hit);
    return hit;
  }
  const pw = Math.max(1, Math.ceil(w * res));
  const ph = Math.max(1, Math.ceil(h * res));
  const canvas = makeCanvas(pw, ph);
  const cx = canvas?.getContext('2d') as Ctx | null | undefined;
  let layer: Layer | null = null;
  if (canvas && cx) {
    cx.setTransform(res, 0, 0, res, -x * res, -y * res);
    paint(cx);
    layer = { canvas, x, y, w, h };
  }
  layers.set(full, layer);
  if (layers.size > MAX_LAYERS) {
    const first = layers.keys().next().value;
    if (first !== undefined) layers.delete(first);
  }
  return layer;
}

/** Drop all cached layers (e.g. after a palette change). */
export function clearBerryCache(): void {
  layers.clear();
}

function resBucket(ctx: Ctx, scale: number): number {
  let k = 1;
  try {
    const m = ctx.getTransform?.();
    if (m) k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  } catch {
    k = 1;
  }
  const s = Math.max(0.25, scale * k);
  const buckets = [0.75, 1, 1.5, 2, 3, 4, 6, 8];
  for (const b of buckets) if (s <= b) return b;
  return 8;
}

// ---------------------------------------------------------------------------
// Body layer

function inFace(g: Geo, x: number, y: number, pad = 0): boolean {
  const dx = (x - g.fx - 0.5) / (12.5 + pad);
  const dy = (y - g.fy - 2.5) / (10.5 + pad);
  return dx * dx + dy * dy < 1;
}

function paintSurface(ctx: Ctx, g: Geo, t: Tones): void {
  const d = g.def;
  const rnd = srand(hash32(d.id) ^ 0x9e3779b9);
  switch (d.surface) {
    case 'seeds': {
      const seed = luma(t.base) > 0.72 ? t.dark : '#ffe7a3';
      let row = 0;
      for (let y = g.top + g.h * 0.2; y < g.bottom - 1.5; y += 4.1, row++) {
        const half = g.halfAt(y) - 2;
        for (let x = -half + (row % 2 ? 2.6 : 0.4); x < half; x += 5.2) {
          if (inFace(g, x, y)) continue;
          const rot = Math.atan2(y - (g.top + g.h * 0.3), x) * 0.2;
          ell(ctx, x, y + 0.3, 1.2, 1.5, rot);
          ctx.fillStyle = rgba(t.deep, 0.32);
          ctx.fill();
          ell(ctx, x, y, 0.62, 1.05, rot);
          ctx.fillStyle = seed;
          ctx.fill();
        }
      }
      break;
    }
    case 'bloom': {
      const gr = ctx.createLinearGradient(0, g.top, 0, g.bottom);
      gr.addColorStop(0, 'rgba(235,240,255,0.34)');
      gr.addColorStop(1, 'rgba(235,240,255,0.06)');
      ctx.fillStyle = gr;
      ctx.fillRect(-g.w, g.top - 2, g.w * 2, g.h + 4);
      for (let i = 0; i < 70; i++) {
        const x = (rnd() - 0.5) * g.w;
        const y = g.top + rnd() * g.h;
        circ(ctx, x, y, 0.35 + rnd() * 0.5);
        ctx.fillStyle = `rgba(240,244,255,${0.12 + rnd() * 0.2})`;
        ctx.fill();
      }
      break;
    }
    case 'drupelets':
    case 'glossy-drupelets': {
      const rd = g.w * d.bumpSize * 0.5;
      const glossy = d.surface === 'glossy-drupelets';
      let row = 0;
      for (let y = g.bottom - rd * 0.6; y > g.top - rd; y -= rd * 1.55, row++) {
        const half = g.halfAt(y) + rd * 0.4;
        for (let x = -half + (row % 2 ? rd * 0.95 : 0); x <= half; x += rd * 1.9) {
          const face = inFace(g, x, y, 1);
          ctx.globalAlpha = face ? 0.35 : 1;
          const gr = ctx.createRadialGradient(x - rd * 0.35, y - rd * 0.4, rd * 0.1, x, y, rd * 1.05);
          gr.addColorStop(0, glossy ? mix(t.light, '#ffffff', 0.2) : t.light);
          gr.addColorStop(0.55, t.base);
          gr.addColorStop(1, t.dark);
          circ(ctx, x, y, rd);
          ctx.fillStyle = gr;
          ctx.fill();
          ctx.strokeStyle = rgba(t.deep, 0.45);
          ctx.lineWidth = 0.5;
          ctx.stroke();
          if (!face) {
            circ(ctx, x - rd * 0.38, y - rd * 0.42, rd * (glossy ? 0.26 : 0.18));
            ctx.fillStyle = `rgba(255,255,255,${glossy ? 0.85 : 0.45})`;
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      if (d.id === 'raspberry') {
        for (let i = 0; i < 14; i++) {
          const x = (rnd() - 0.5) * g.w * 0.9;
          const y = g.top + 3 + rnd() * (g.h - 6);
          if (inFace(g, x, y)) continue;
          line(ctx, x, y, x + 0.6, y - 1.4, 'rgba(255,255,255,0.45)', 0.35);
        }
      }
      break;
    }
    case 'smooth': {
      if (d.id === 'cranberry') {
        for (let i = 0; i < 18; i++) {
          const x = (rnd() - 0.5) * g.w * 0.85;
          const y = g.top + 3 + rnd() * (g.h - 5);
          if (inFace(g, x, y)) continue;
          ell(ctx, x, y, 0.5, 0.35);
          ctx.fillStyle = rgba(t.light, 0.55);
          ctx.fill();
        }
      }
      break;
    }
    case 'stripes': {
      const gr = ctx.createRadialGradient(g.fx * 0.3, g.bottom - g.h * 0.5, 1, 0, g.bottom - g.h * 0.5, g.w * 0.6);
      gr.addColorStop(0, rgba(t.light, 0.55));
      gr.addColorStop(1, rgba(t.light, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(-g.w, g.top, g.w * 2, g.h);
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const tt = i / 16;
          const y = g.bottom - tt * g.h;
          const x = (k / 3.6) * g.halfAt(y);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(t.light, 0.6);
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const x = (rnd() - 0.5) * g.w * 0.5;
        const y = g.bottom - g.h * (0.25 + rnd() * 0.3);
        if (inFace(g, x, y)) continue;
        ell(ctx, x, y, 0.7, 1);
        ctx.fillStyle = rgba(t.dark, 0.25);
        ctx.fill();
      }
      break;
    }
    case 'cluster': {
      const r = g.w * 0.16;
      let row = 0;
      for (let y = g.bottom - r * 0.7; y > g.top - r; y -= r * 1.5, row++) {
        const half = g.halfAt(y) + r * 0.3;
        for (let x = -half + (row % 2 ? r : 0.2); x <= half; x += r * 1.95) {
          const face = inFace(g, x, y, 2);
          ctx.globalAlpha = face ? 0.3 : 1;
          const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
          gr.addColorStop(0, t.light);
          gr.addColorStop(0.6, t.base);
          gr.addColorStop(1, t.deep);
          circ(ctx, x, y, r);
          ctx.fillStyle = gr;
          ctx.fill();
          ctx.strokeStyle = rgba(t.deep, 0.6);
          ctx.lineWidth = 0.6;
          ctx.stroke();
          if (!face) {
            circ(ctx, x - r * 0.35, y - r * 0.4, r * 0.22);
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.fill();
            star(ctx, x + r * 0.2, y + r * 0.15, r * 0.22, 0.5);
            ctx.fillStyle = rgba(t.deep, 0.7);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'shimmer': {
      ctx.save();
      ctx.rotate(-0.5);
      for (let i = -3; i <= 3; i++) {
        ctx.fillStyle = `rgba(255,248,200,${i % 2 ? 0.16 : 0.08})`;
        ctx.fillRect(i * 7, -80, 3.5, 120);
      }
      ctx.restore();
      for (let i = 0; i < 6; i++) {
        const x = (rnd() - 0.5) * g.w * 0.8;
        const y = g.top + 3 + rnd() * (g.h - 6);
        if (inFace(g, x, y)) continue;
        twinkle(ctx, x, y, 1 + rnd() * 1.2, 'rgba(255,255,240,0.85)');
      }
      break;
    }
  }
}

function patternInk(c: Cosmetics, t: Tones): string {
  const p = PATTERN_BY_ID.get(c.pattern);
  if (!p) return t.light;
  if (p.ink === 'light') return luma(t.base) > 0.8 ? t.dark : mix(t.light, '#ffffff', 0.25);
  if (p.ink === 'dark') return t.deep;
  return p.ink;
}

function paintPattern(ctx: Ctx, c: Cosmetics, g: Geo, t: Tones): void {
  const ink = patternInk(c, t);
  const rnd = srand(hash32(c.pattern + c.berry));
  switch (c.pattern) {
    case 'speckle':
      for (let i = 0; i < 46; i++) {
        const x = (rnd() - 0.5) * g.w;
        const y = g.top + rnd() * g.h;
        if (inFace(g, x, y)) continue;
        circ(ctx, x, y, 0.4 + rnd() * 0.6);
        ctx.fillStyle = rgba(ink, 0.7);
        ctx.fill();
      }
      break;
    case 'stripes':
      ctx.save();
      ctx.rotate(0.45);
      ctx.fillStyle = rgba(ink, 0.32);
      for (let i = -8; i <= 8; i++) ctx.fillRect(i * 7.5, -90, 3.2, 140);
      ctx.restore();
      break;
    case 'stars':
      for (let i = 0; i < 12; i++) {
        const x = (rnd() - 0.5) * g.w * 0.95;
        const y = g.top + 2 + rnd() * (g.h - 3);
        if (inFace(g, x, y, 1)) continue;
        star(ctx, x, y, 1.3 + rnd() * 1.1, 0.45, 5, rnd());
        ctx.fillStyle = rgba(ink, 0.85);
        ctx.fill();
      }
      break;
    case 'freckles':
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const x = g.fx + side * (6.5 + (i % 3) * 1.6) + (side < 0 ? 1 : 1.5);
          const y = g.fy + 4.6 + Math.floor(i / 3) * 1.6 + (i % 2) * 0.6;
          circ(ctx, x, y, 0.45);
          ctx.fillStyle = rgba(ink, 0.75);
          ctx.fill();
        }
      }
      for (let i = 0; i < 16; i++) {
        const x = (rnd() - 0.5) * g.w;
        const y = g.top + rnd() * g.h;
        if (inFace(g, x, y, 2)) continue;
        circ(ctx, x, y, 0.45);
        ctx.fillStyle = rgba(ink, 0.5);
        ctx.fill();
      }
      break;
    case 'gradient': {
      const gr = ctx.createLinearGradient(0, g.top, 0, g.bottom);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.45, rgba(mix(t.base, '#ffd257', 0.5), 0.15));
      gr.addColorStop(1, rgba(mix(t.light, '#ff9f6b', 0.55), 0.75));
      ctx.fillStyle = gr;
      ctx.fillRect(-g.w, g.top, g.w * 2, g.h + 2);
      break;
    }
    case 'spots':
      for (let i = 0; i < 7; i++) {
        const x = (rnd() - 0.5) * g.w;
        const y = g.top + 3 + rnd() * (g.h - 4);
        if (inFace(g, x, y, 3)) continue;
        ell(ctx, x, y, 2.2 + rnd() * 2, 1.8 + rnd() * 1.6, rnd() * 3);
        ctx.fillStyle = rgba(ink, 0.38);
        ctx.fill();
      }
      break;
    case 'hearts':
      for (let i = 0; i < 9; i++) {
        const x = (rnd() - 0.5) * g.w * 0.95;
        const y = g.top + 3 + rnd() * (g.h - 4);
        if (inFace(g, x, y, 1)) continue;
        heart(ctx, x, y, 1.5 + rnd() * 0.8);
        ctx.fillStyle = rgba(ink, 0.75);
        ctx.fill();
      }
      break;
    case 'zigzag':
      for (const [yy, a] of [[g.bottom - g.h * 0.16, 0.5], [g.top + g.h * 0.14, 0.35]] as const) {
        ctx.beginPath();
        for (let x = -g.w; x <= g.w; x += 3) ctx.lineTo(x, yy + ((x / 3) % 2 ? -1.6 : 1.6));
        ctx.strokeStyle = rgba(ink, a);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      break;
    case 'groovy':
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        for (let x = -g.w; x <= g.w; x += 1.5) {
          const y = g.top + g.h * (0.12 + k * 0.2) + Math.sin(x * 0.22 + k * 1.7) * 2.6;
          if (x === -g.w) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = k % 2 ? rgba('#ff86bf', 0.35) : rgba('#8b5cf6', 0.3);
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
      break;
    default:
      break;
  }
}

function paintTop(ctx: Ctx, g: Geo, t: Tones): void {
  const top = g.top;
  const def = g.def;
  switch (def.top) {
    case 'leafy': {
      const leaves: [number, number][] = [[-2.5, 0.55], [-2.05, 0.75], [-1.55, 0.9], [-1.05, 0.85], [-0.6, 0.7]];
      for (const [a, k] of leaves) {
        ctx.save();
        ctx.translate(0, top + 2.5);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-3.4 * k, -6 * k, 0, -11 * k);
        ctx.quadraticCurveTo(3.4 * k, -6 * k, 0, 0);
        const gr = ctx.createLinearGradient(0, 0, 0, -11 * k);
        gr.addColorStop(0, LEAF_DARK);
        gr.addColorStop(1, '#6edb6a');
        fs(ctx, gr, 1.2);
        line(ctx, 0, -1, 0, -8 * k, 'rgba(255,255,255,0.3)', 0.5);
        ctx.restore();
      }
      rr(ctx, -1, top - 5, 2.2, 6, 1);
      fs(ctx, LEAF_DARK, 1);
      return;
    }
    case 'crown': {
      const y = top + 1.2;
      poly(ctx, [[-4.5, y + 0.6], [-4.8, y - 2.4], [-2.6, y - 0.8], [-1.2, y - 3.2], [0.4, y - 0.9], [2.2, y - 3.1], [3, y - 0.6], [4.8, y - 2.2], [4.5, y + 0.6]]);
      fs(ctx, t.deep, 1.1);
      ell(ctx, 0, y + 0.4, 3.2, 0.9);
      ctx.fillStyle = mix(t.deep, '#000000', 0.3);
      ctx.fill();
      return;
    }
    case 'calyx': {
      for (const a of [-2.6, -1.9, -1.25, -0.55]) {
        ctx.save();
        ctx.translate(0, top + 1.6);
        ctx.rotate(a + Math.PI / 2);
        ell(ctx, 0, -3.4, 1.3, 3.6);
        fs(ctx, LEAF, 0.9);
        ctx.restore();
      }
      rr(ctx, -0.9, top - 4.2, 1.8, 5, 0.8);
      fs(ctx, LEAF_DARK, 0.9);
      return;
    }
    case 'stem': {
      ctx.beginPath();
      ctx.moveTo(0, top + 3);
      ctx.quadraticCurveTo(0.5, top - 6, 5, top - 13);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#6a8f2c';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.save();
      ctx.translate(3.4, top - 9.5);
      ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(4, -4.4, 10, -1.5);
      ctx.quadraticCurveTo(4.5, 2.6, 0, 0);
      fs(ctx, LEAF, 1.1);
      line(ctx, 0.6, -0.2, 8, -1.4, 'rgba(255,255,255,0.35)', 0.5);
      ctx.restore();
      return;
    }
    case 'curl': {
      rr(ctx, -1, top - 4, 2, 5.5, 0.9);
      fs(ctx, LEAF_DARK, 1);
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = i * 0.42;
        const r = 3.2 - i * 0.1;
        const x = -1 - Math.cos(a) * r - i * 0.15;
        const y = top - 4 - Math.sin(a) * r;
        if (i === 0) ctx.moveTo(-1, top - 3.5);
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = LEAF_DARK;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.save();
      ctx.translate(1, top - 2.6);
      ctx.rotate(-0.35);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(3.5, -4.2, 8.5, -1.6);
      ctx.quadraticCurveTo(4, 2.2, 0, 0);
      fs(ctx, LEAF, 1.1);
      ctx.restore();
      return;
    }
    case 'nub':
      rr(ctx, -1.1, top - 2.8, 2.2, 3.8, 0.9);
      fs(ctx, '#6b4a2b', 0.9);
      return;
    case 'tuft':
      for (let i = -2; i <= 2; i++) line(ctx, i * 0.6, top + 0.8, i * 1.6, top - 3.2 - Math.abs(i) * -0.3, '#8a6a43', 0.8);
      return;
    case 'twig': {
      ctx.beginPath();
      ctx.moveTo(0, top + 2);
      ctx.lineTo(0, top - 5);
      ctx.moveTo(0, top - 2);
      ctx.lineTo(-4, top - 6);
      ctx.moveTo(0, top - 3);
      ctx.lineTo(4, top - 7);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#a0522d';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      for (const [x, y] of [[0, -5.5], [-4, -6.5], [4, -7.5]] as const) {
        circ(ctx, x, top + y, 1.2);
        fs(ctx, t.dark, 0.7);
      }
      return;
    }
    case 'husk': {
      for (const [a, k] of [[-2.4, 1], [-1.57, 1.15], [-0.75, 1]] as const) {
        ctx.save();
        ctx.translate(0, top + 2);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.quadraticCurveTo(-4.5 * k, -5 * k, 0, -9.5 * k);
        ctx.quadraticCurveTo(4.5 * k, -5 * k, 2, 0);
        ctx.closePath();
        const gr = ctx.createLinearGradient(0, 0, 0, -9 * k);
        gr.addColorStop(0, '#c9a46a');
        gr.addColorStop(1, '#f3e2bb');
        fs(ctx, gr, 1.1);
        line(ctx, 0, -1, 0, -8 * k, 'rgba(140,100,40,0.5)', 0.5);
        ctx.restore();
      }
      return;
    }
  }
}

function topVisible(c: Cosmetics): boolean {
  const hat = HAT_BY_ID.get(c.hat);
  if (hat?.covers) return false;
  return c.hair === 'none' || c.hair === 'tuft' || c.hair === 'leafy' || c.hair === 'afro';
}

function paintBodyLayer(ctx: Ctx, c: Cosmetics, g: Geo): void {
  const t = tonesFor(c, g.pal);
  paintOutfitBehind(ctx, c.outfit, g);
  // Base fill with soft volume.
  traceBody(ctx, g);
  const gr = ctx.createRadialGradient(g.fx * 0.4, g.top + g.h * 0.32, 1, 0, g.bottom - g.h * 0.45, g.h * 0.85);
  gr.addColorStop(0, mix(t.light, t.base, 0.25));
  gr.addColorStop(0.5, t.base);
  gr.addColorStop(1, mix(t.dark, t.base, 0.25));
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.save();
  traceBody(ctx, g);
  ctx.clip();
  paintSurface(ctx, g, t);
  paintPattern(ctx, c, g, t);
  // Core shadow low on the back side.
  const sh = ctx.createRadialGradient(-g.w * 0.3, g.bottom + 2, 1, -g.w * 0.3, g.bottom + 2, g.h * 0.75);
  sh.addColorStop(0, rgba(t.deep, 0.42));
  sh.addColorStop(1, rgba(t.deep, 0));
  ctx.fillStyle = sh;
  ctx.fillRect(-g.w, g.top, g.w * 2, g.h + 4);
  // Rim light on the back edge.
  ctx.save();
  ctx.translate(2.4, 1.4);
  traceBody(ctx, g);
  ctx.restore();
  ctx.strokeStyle = rgba(mix(t.light, '#ffffff', 0.4), 0.55);
  ctx.lineWidth = 2.6;
  ctx.stroke();
  // Gloss highlight.
  const gl = 0.25 + g.def.gloss * 0.55;
  ell(ctx, -g.w * 0.12, g.top + g.h * 0.17, g.w * 0.15, g.h * 0.07, -0.45);
  ctx.fillStyle = `rgba(255,255,255,${gl})`;
  ctx.fill();
  circ(ctx, g.w * 0.08, g.top + g.h * 0.12, 1);
  ctx.fillStyle = `rgba(255,255,255,${gl * 0.9})`;
  ctx.fill();
  // Bounce light along the bottom-front.
  ell(ctx, g.w * 0.22, g.bottom - 1.8, g.w * 0.18, 1.4, -0.2);
  ctx.fillStyle = rgba(t.light, 0.35);
  ctx.fill();
  ctx.restore();
  traceBody(ctx, g);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.9;
  ctx.lineJoin = 'round';
  ctx.stroke();
  paintOutfit(ctx, c.outfit, g);
  if (topVisible(c)) paintTop(ctx, g, t);
}

function bodyLayer(c: Cosmetics, g: Geo, res: number): Layer | null {
  const key = `body|${c.berry}|${c.color}|${c.pattern}|${c.outfit}|${topVisible(c) ? 1 : 0}`;
  const x = -g.w / 2 - 14;
  const y = g.top - 18;
  return getLayer(key, x, y, g.w + 28, g.bottom - y + 8, res, (cx) => paintBodyLayer(cx, c, g));
}

function drawLayer(ctx: Ctx, l: Layer): void {
  ctx.drawImage(l.canvas as CanvasImageSource, l.x, l.y, l.w, l.h);
}

// ---------------------------------------------------------------------------
// Pose / animation

interface Anim {
  bob: number;
  squash: number;
  tilt: number;
  shakeX: number;
  armF: number;
  armB: number;
  /** Elbow bend (+ = bend upward). */
  bendF: number;
  bendB: number;
  legF: [number, number];
  legB: [number, number];
  expr: Expr;
  lookX: number;
  lookY: number;
  talk: number;
  spinX: number;
  sit: boolean;
  heartAbove: boolean;
  confetti: boolean;
  sparkle: boolean;
}

function blinkOpen(time: number, seed: number): number {
  const period = 3.1 + (seed % 17) / 10;
  const p = (time + (seed % 97) / 13) % period;
  if (p < 0.07) return 1 - p / 0.07;
  if (p < 0.15) return (p - 0.07) / 0.08;
  // Occasional double blink.
  if (seed % 3 === 0 && p > 0.3 && p < 0.42) return Math.abs(p - 0.36) / 0.06;
  return 1;
}

function computeAnim(pose: BerryPose, seed: number): Anim {
  const t = pose.time;
  const a: Anim = {
    bob: 0,
    squash: 0,
    tilt: 0,
    shakeX: 0,
    armF: 0.2,
    armB: -0.2,
    bendF: 0.3,
    bendB: 0.3,
    legF: [0, 0],
    legB: [0, 0],
    expr: 'normal',
    lookX: 1,
    lookY: 0,
    talk: 0,
    spinX: 1,
    sit: false,
    heartAbove: false,
    confetti: false,
    sparkle: false,
  };
  const ph = t * 11;
  if (pose.moving && !pose.ghost) {
    a.legF = [Math.sin(ph) * 3.8, Math.max(0, -Math.cos(ph)) * 3];
    a.legB = [-Math.sin(ph) * 3.8, Math.max(0, Math.cos(ph)) * 3];
    a.bob = Math.abs(Math.sin(ph)) * 1.7;
    a.squash = Math.cos(ph * 2) * 0.045;
    a.tilt = 0.08;
    a.armF = 0.25 - Math.sin(ph) * 0.75;
    a.armB = -0.25 + Math.sin(ph) * 0.75;
  } else {
    const br = Math.sin(t * 2.3 + seed);
    a.squash = br * 0.022;
    a.bob = (br + 1) * 0.25;
    a.tilt = Math.sin(t * 0.9 + seed) * 0.025;
    a.armF = 0.22 + Math.sin(t * 1.7 + seed) * 0.07;
    a.armB = -0.22 - Math.sin(t * 1.7 + seed) * 0.07;
    // Idle fidgets: glance back, then a little bounce.
    const f = (t + (seed % 50) / 7) % 7.5;
    if (f < 0.9) a.lookX = -1;
    else if (f < 1.2) a.lookX = 0;
    if (f > 4 && f < 4.5) {
      const k = Math.sin(((f - 4) / 0.5) * Math.PI);
      a.bob += k * 2.2;
      a.squash -= k * 0.06;
      a.armF += k * 0.8;
      a.armB -= k * 0.8;
    }
  }
  if (pose.ghost) {
    a.bob = 4 + Math.sin(t * 2.1 + seed) * 2;
    a.armF = 0.6 + Math.sin(t * 1.6) * 0.25;
    a.armB = -0.6 - Math.sin(t * 1.6) * 0.25;
    a.tilt = Math.sin(t * 1.3) * 0.06 + (pose.moving ? 0.12 : 0);
  }
  if (pose.hold === 'gun' || pose.hold === 'flashlight') {
    a.armF = 1.45 - Math.max(-1, Math.min(1, pose.aimY ?? 0)) * 0.85 + Math.sin(t * 2) * 0.03;
    a.bendF = 0.05;
  } else if (pose.hold === 'knife') {
    a.armF = 1.05 + Math.sin(t * 3) * 0.08;
    a.bendF = 0.5;
  }
  if (pose.scared) {
    a.expr = 'scared';
    a.shakeX = Math.sin(t * 55) * 0.5;
    if (!pose.hold) {
      a.armF = 2.5;
      a.armB = -2.5;
      a.bendF = 0.9;
      a.bendB = 0.9;
    }
  }
  const em = pose.emote;
  if (em) {
    const w = Math.sin(t * 9);
    switch (em) {
      case 'wave':
        a.armF = 2.6 + w * 0.35;
        a.bendF = 0.4;
        a.expr = 'happy';
        a.tilt = -0.04;
        break;
      case 'dance': {
        const d = Math.sin(t * 7);
        a.tilt = d * 0.14;
        a.bob = Math.abs(Math.cos(t * 7)) * 3;
        a.squash = Math.cos(t * 14) * 0.06;
        a.armF = d > 0 ? 2.7 : 0.6;
        a.armB = d > 0 ? -0.6 : -2.7;
        a.legF = [d * 2, Math.max(0, d) * 2];
        a.legB = [-d * 2, Math.max(0, -d) * 2];
        a.expr = 'happy';
        break;
      }
      case 'laugh':
        a.shakeX = Math.sin(t * 30) * 0.6;
        a.squash = Math.sin(t * 18) * 0.05;
        a.tilt = -0.1;
        a.armF = 0.5;
        a.armB = -0.5;
        a.bendF = -1.2;
        a.bendB = -1.2;
        a.expr = 'happy';
        a.talk = Math.abs(Math.sin(t * 15));
        break;
      case 'shrug':
        a.armF = 1.8;
        a.armB = -1.8;
        a.bendF = 1.2;
        a.bendB = 1.2;
        a.bob = Math.abs(Math.sin(t * 3)) * 1.2;
        a.lookX = 0;
        a.lookY = -0.6;
        a.expr = 'smug';
        break;
      case 'point':
        a.armF = 1.62;
        a.bendF = 0;
        a.lookX = 1.2;
        a.tilt = 0.06;
        a.expr = 'normal';
        break;
      case 'facepalm':
        a.armF = 2.55;
        a.bendF = 1.8;
        a.tilt = 0.12;
        a.expr = 'closed';
        break;
      case 'cheer':
        a.bob = Math.abs(Math.sin(t * 6)) * 5;
        a.squash = -Math.abs(Math.sin(t * 6)) * 0.05;
        a.armF = 2.9 + w * 0.1;
        a.armB = -2.9 - w * 0.1;
        a.expr = 'happy';
        a.sparkle = true;
        break;
      case 'sit':
        a.sit = true;
        a.bob = -3.4;
        a.squash = 0.05;
        a.armF = 0.5;
        a.armB = -0.5;
        a.expr = 'sleepy';
        break;
      case 'heart':
        a.armF = 2.75;
        a.armB = -2.75;
        a.bendF = 1.1;
        a.bendB = 1.1;
        a.expr = 'love';
        a.heartAbove = true;
        break;
      case 'thumbsup':
        a.armF = 1.2;
        a.bendF = 1.1;
        a.expr = 'happy';
        break;
      case 'cry':
        a.expr = 'sad';
        a.shakeX = Math.sin(t * 20) * 0.3;
        a.armF = 2.3;
        a.armB = -2.3;
        a.bendF = 1.5;
        a.bendB = 1.5;
        a.tilt = 0.05;
        break;
      case 'think':
        a.armF = 1.9;
        a.bendF = 1.7;
        a.lookX = 0.3;
        a.lookY = -1;
        a.expr = 'think';
        break;
      // Victory poses.
      case 'flex':
        a.armF = 1.75;
        a.armB = -1.75;
        a.bendF = 1.9;
        a.bendB = 1.9;
        a.squash = -0.04 + Math.sin(t * 6) * 0.02;
        a.expr = 'smug';
        a.sparkle = true;
        break;
      case 'spin':
        a.spinX = Math.cos(t * 7);
        a.bob = Math.abs(Math.sin(t * 7)) * 2;
        a.armF = 1.6;
        a.armB = -1.6;
        a.expr = 'happy';
        break;
      case 'jump': {
        const j = Math.max(0, Math.sin(t * 5));
        a.bob = j * 10;
        a.squash = j < 0.1 ? 0.12 : -0.06;
        a.armF = 2.7;
        a.armB = -2.7;
        a.legF = [1, j * 3];
        a.legB = [-1, j * 3];
        a.expr = 'happy';
        break;
      }
      case 'bow':
        a.tilt = 0.45 + Math.sin(t * 2) * 0.05;
        a.armF = 0.9;
        a.bendF = 1.4;
        a.armB = -1.2;
        a.expr = 'closed';
        break;
      case 'confetti':
        a.armF = 2.8;
        a.armB = -2.8;
        a.bob = Math.abs(Math.sin(t * 4)) * 3;
        a.expr = 'happy';
        a.confetti = true;
        break;
      case 'moonwalk': {
        const m = (t * 2.2) % 1;
        a.legF = [-m * 6 + 3, 0];
        a.legB = [-((m + 0.5) % 1) * 6 + 3, 1.4];
        a.tilt = -0.12;
        a.armF = 0.9;
        a.armB = -0.4;
        a.expr = 'smug';
        break;
      }
      default:
        break;
    }
  }
  return a;
}

// ---------------------------------------------------------------------------
// Limbs and held items

function drawArm(ctx: Ctx, sx: number, sy: number, angle: number, bend: number, sleeve: string, mitten: string, back: boolean): [number, number] {
  const L = 8.2;
  const hx = sx + Math.sin(angle) * L;
  const hy = sy + Math.cos(angle) * L;
  // Elbow control point perpendicular to the arm.
  const mx = (sx + hx) / 2 + Math.cos(angle) * bend * 3;
  const my = (sy + hy) / 2 - Math.sin(angle) * bend * 3;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(mx, my, hx, hy);
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5.4;
  ctx.stroke();
  ctx.strokeStyle = back ? mix(sleeve, '#120c1c', 0.2) : sleeve;
  ctx.lineWidth = 3.2;
  ctx.stroke();
  circ(ctx, hx, hy, 2.75);
  fs(ctx, back ? mix(mitten, '#120c1c', 0.15) : mitten, 1.2);
  circ(ctx, hx + Math.cos(angle) * 1.9, hy - Math.sin(angle) * 1.9, 1.15);
  fs(ctx, back ? mix(mitten, '#120c1c', 0.15) : mitten, 0.9);
  return [hx, hy];
}

function drawLeg(ctx: Ctx, hx: number, off: [number, number], shoe: string, leg: string, sit: boolean): void {
  const fx = hx + off[0] + (sit ? 4 : 0);
  const fy = -off[1] - (sit ? 2 : 0);
  ctx.beginPath();
  ctx.moveTo(hx, -6.5);
  ctx.lineTo(fx, fy - 1.6);
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = leg;
  ctx.lineWidth = 2.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(fx + 1.5, fy - 1.6, 4.3, 2.5, 0, 0, TAU);
  const gr = ctx.createLinearGradient(fx, fy - 4, fx, fy);
  gr.addColorStop(0, mix(shoe, '#ffffff', 0.25));
  gr.addColorStop(1, shoe);
  fs(ctx, gr, 1.3);
  line(ctx, fx - 1.6, fy - 0.3, fx + 4.6, fy - 0.3, 'rgba(255,255,255,0.5)', 0.7);
}

function drawHeld(ctx: Ctx, hold: 'gun' | 'knife' | 'flashlight', hx: number, hy: number, angle: number, pose: BerryPose): void {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(Math.PI / 2 - angle);
  switch (hold) {
    case 'gun':
      rr(ctx, -1.5, -2.6, 11, 4.2, 1.4);
      fs(ctx, '#4a5068', 1.2);
      rr(ctx, 8.6, -2.2, 2.6, 3.4, 0.8);
      fs(ctx, '#ff7a1a', 1);
      rr(ctx, -0.8, 0.2, 3.2, 5, 1);
      fs(ctx, '#2f3446', 1.1);
      line(ctx, 0.8, -1.6, 7.6, -1.6, 'rgba(255,255,255,0.35)', 0.7);
      circ(ctx, 4.5, -0.4, 0.8);
      ctx.fillStyle = '#14b8a6';
      ctx.fill();
      break;
    case 'knife':
      ctx.rotate(-0.5);
      rr(ctx, -1.6, -1.3, 5, 2.6, 0.8);
      fs(ctx, '#7a4c2a', 1);
      ctx.beginPath();
      ctx.moveTo(3.2, -1.6);
      ctx.lineTo(12.6, -0.8);
      ctx.quadraticCurveTo(11.4, 1.6, 3.2, 1.4);
      ctx.closePath();
      fs(ctx, '#dfe6f0', 1.1);
      line(ctx, 4.5, -0.6, 10.5, -0.4, '#ffffff', 0.6);
      break;
    case 'flashlight':
      if (pose.flashlightOn) {
        const gr = ctx.createLinearGradient(8, 0, 48, 0);
        gr.addColorStop(0, 'rgba(255,243,180,0.55)');
        gr.addColorStop(1, 'rgba(255,243,180,0)');
        poly(ctx, [[8.5, -2], [48, -14], [48, 14], [8.5, 2]]);
        ctx.fillStyle = gr;
        ctx.fill();
      }
      rr(ctx, -2, -1.8, 9, 3.6, 1.2);
      fs(ctx, '#3a4256', 1.1);
      rr(ctx, 6.4, -2.6, 2.8, 5.2, 0.9);
      fs(ctx, '#ffd23f', 1.1);
      ell(ctx, 9.2, 0, 0.8, 2);
      ctx.fillStyle = pose.flashlightOn ? '#fffbe0' : '#c9ced8';
      ctx.fill();
      break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Public: character

const faceStateTmp: FaceState = {
  time: 0,
  open: 1,
  lookX: 1,
  lookY: 0,
  expr: 'normal',
  moving: false,
  threeQuarter: true,
  skin: '#000',
  skinDark: '#000',
  brow: '#000',
  hair: '#000',
  talk: 0,
};

function confettiBits(ctx: Ctx, time: number, top: number): void {
  const cols = ['#ff4d6d', '#ffd23f', '#2f6fed', '#14b8a6', '#c084fc'];
  for (let i = 0; i < 14; i++) {
    const p = (time * 0.6 + i * 0.137) % 1;
    const x = Math.sin(i * 12.9) * 18 + Math.sin(time * 3 + i) * 2;
    const y = top - 14 + p * 40;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 4 + i);
    ctx.globalAlpha *= 1 - p * 0.6;
    ctx.fillStyle = cols[i % cols.length]!;
    ctx.fillRect(-1, -0.6, 2, 1.2);
    ctx.restore();
  }
}

/**
 * Draw a berry character with its feet at (x, y).
 */
export function drawBerry(ctx: CanvasRenderingContext2D, c: Cosmetics, x: number, y: number, scale: number, pose: BerryPose): void {
  const g = geoFor(c);
  const t = tonesFor(c, g.pal);
  const seed = hash32(`${c.berry}${c.color}${c.hair}${c.eyes}`);
  const an = computeAnim(pose, seed % 1000);
  const time = pose.time;
  const res = resBucket(ctx, scale);
  const hat = HAT_BY_ID.get(c.hat);
  const hairDef = HAIR_BY_ID.get(c.hair);
  const covered = !!hat?.covers;
  const sleeve = sleeveColor(c.outfit) ?? mix(t.base, t.dark, 0.35);
  const ghost = !!pose.ghost;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= (pose.alpha ?? 1) * (ghost ? 0.58 : 1);

  // Ground shadow.
  const lift = an.bob + (an.legF[1] + an.legB[1]) * 0.2;
  ell(ctx, 0, 0, Math.max(6, 13.5 - lift * 0.6), 3.4);
  ctx.fillStyle = `rgba(10,8,22,${ghost ? 0.12 : 0.26})`;
  ctx.fill();

  ctx.scale(pose.dir * an.spinX, 1);
  if (an.spinX < 0) ctx.scale(-1, 1);

  // Footstep dust puffs.
  if (pose.moving && !ghost) {
    const ph = (time * 11) / TAU;
    for (let k = 0; k < 2; k++) {
      const age = (ph * 2 + k * 0.5) % 1;
      const r = 1.2 + age * 2.6;
      circ(ctx, -6 - age * 9, -1 - age * 2.5, r);
      ctx.fillStyle = `rgba(235,238,248,${0.22 * (1 - age) * (1 - age)})`;
      ctx.fill();
    }
  }

  // Legs (not squashed).
  if (!ghost) {
    const leg = mix(t.dark, '#1a1424', 0.25);
    drawLeg(ctx, -4.2, an.legB, mix(t.shoe, '#000000', 0.15), mix(leg, '#000000', 0.15), an.sit);
    drawLeg(ctx, 3.6, an.legF, t.shoe, leg, an.sit);
  }

  // Upper body transform: bob, lean, squash & stretch about the hips.
  ctx.translate(an.shakeX, -an.bob);
  ctx.translate(0, -4);
  ctx.rotate(an.tilt);
  ctx.scale(1 + an.squash, 1 - an.squash);
  ctx.translate(0, 4);

  const sway = (pose.moving ? 2.6 : 0) + Math.sin(time * 1.9 + seed) * 0.7 + (pose.moving ? Math.sin(time * 22) * 0.5 : 0);
  const hairCtx = { g, tones: t, sway, bounce: an.bob * 0.6, time, covered };
  const backCtx = { g, time, moving: pose.moving, sway };

  if (ghost) {
    // Wispy tail instead of legs.
    ctx.beginPath();
    ctx.moveTo(-g.w * 0.38, g.bottom - 4);
    const wv = Math.sin(time * 4) * 2;
    ctx.bezierCurveTo(-g.w * 0.4, g.bottom + 6, -4 + wv, g.bottom + 4, -9 + wv * 1.5, g.bottom + 10);
    ctx.bezierCurveTo(2, g.bottom + 6, g.w * 0.4, g.bottom + 2, g.w * 0.36, g.bottom - 4);
    ctx.closePath();
    const gr = ctx.createLinearGradient(0, g.bottom - 4, 0, g.bottom + 10);
    gr.addColorStop(0, t.base);
    gr.addColorStop(1, rgba(t.light, 0));
    ctx.fillStyle = gr;
    ctx.fill();
  }

  paintBack(ctx, c.back, backCtx);
  paintHair(ctx, c.hair, 'back', hairCtx);
  drawArm(ctx, g.sxBack, g.sy, an.armB, -an.bendB, sleeve, t.mitten, true);

  const layer = bodyLayer(c, g, res);
  if (layer) drawLayer(ctx, layer);
  else paintBodyLayer(ctx, c, g);
  paintBackStraps(ctx, c.back, g);

  // Hair cap + volume, then face on top, then hat.
  paintHair(ctx, c.hair, 'front', hairCtx);
  ctx.save();
  ctx.translate(g.fx, g.fy);
  const fsd = faceStateTmp;
  fsd.time = time;
  fsd.open = pose.blink === true ? 0 : pose.blink === false ? 1 : blinkOpen(time, seed);
  fsd.lookX = an.lookX;
  fsd.lookY = an.lookY;
  fsd.expr = an.expr;
  fsd.moving = pose.moving;
  fsd.threeQuarter = true;
  fsd.skin = t.base;
  fsd.skinDark = mix(t.base, t.dark, 0.5);
  fsd.brow = c.hair !== 'none' ? mix(c.hairColor, '#1a1220', 0.35) : t.deep;
  fsd.hair = c.hairColor;
  fsd.talk = an.talk;
  paintFace(ctx, c, fsd);
  ctx.restore();

  if (c.hat !== 'none') {
    ctx.save();
    ctx.translate(0, g.top + (hairDef?.volume && !covered ? 0 : 0));
    const k = g.w / 33;
    ctx.scale(k, k);
    if (hat?.animated) paintHat(ctx, c.hat, time, t);
    else {
      const hl = getLayer(`hat|${c.hat}|${c.hairColor}|${c.color}`, -26, -34, 52, 56, res * k, (cx) => paintHat(cx, c.hat, 0, t));
      if (hl) drawLayer(ctx, hl);
      else paintHat(ctx, c.hat, time, t);
    }
    ctx.restore();
  }

  // Front arm + held item.
  let hand: [number, number];
  if (pose.hold) {
    const [hx, hy] = [g.sxFront + Math.sin(an.armF) * 8.2, g.sy + Math.cos(an.armF) * 8.2];
    drawHeld(ctx, pose.hold, hx, hy, an.armF, pose);
    hand = drawArm(ctx, g.sxFront, g.sy, an.armF, an.bendF, sleeve, t.mitten, false);
  } else {
    hand = drawArm(ctx, g.sxFront, g.sy, an.armF, an.bendF, sleeve, t.mitten, false);
  }
  if (pose.emote === 'thumbsup') {
    rr(ctx, hand[0] - 0.8, hand[1] - 5, 2, 4, 1);
    fs(ctx, t.mitten, 1);
  }
  if (pose.emote === 'point') {
    rr(ctx, hand[0] + 1, hand[1] - 0.9, 4.2, 1.9, 0.9);
    fs(ctx, t.mitten, 1);
  }

  if (an.heartAbove) {
    const s = 4 + Math.sin(time * 6) * 0.6;
    heart(ctx, 0, g.top - 9, s);
    fs(ctx, '#ff4d6d', 1.2);
  }
  if (an.sparkle) {
    twinkle(ctx, -g.w * 0.6, g.top + 2 + Math.sin(time * 5) * 2, 2.4, '#fff6b0');
    twinkle(ctx, g.w * 0.65, g.top + 8 + Math.cos(time * 4) * 2, 1.8, '#ffffff');
  }
  if (an.confetti) confettiBits(ctx, time, g.top);
  if (g.def.surface === 'shimmer') {
    const p = (time * 0.7 + (seed % 10) / 10) % 1;
    twinkle(ctx, -g.w * 0.25 + p * 4, g.top + g.h * 0.35, 1.2 + Math.sin(p * Math.PI) * 1.4, 'rgba(255,255,230,0.9)');
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Public: squished body (non-gory)

export function drawBody(ctx: CanvasRenderingContext2D, c: Cosmetics, x: number, y: number, scale: number, time: number): void {
  const g = geoFor(c);
  const t = tonesFor(c, g.pal);
  const res = resBucket(ctx, scale);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // Juice splash.
  const rnd = srand(hash32(c.berry + c.color));
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const r = 1 + (i % 2 ? 0.18 : -0.05) + Math.sin(i * 2.7) * 0.08;
    const px = Math.cos(a) * 24 * r;
    const py = Math.sin(a) * 8 * r + 0.5;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.quadraticCurveTo(Math.cos(a - 0.22) * 26 * r, Math.sin(a - 0.22) * 9 * r + 0.5, px, py);
  }
  ctx.closePath();
  ctx.fillStyle = rgba(mix(t.base, t.dark, 0.25), 0.62);
  ctx.fill();
  ell(ctx, -6, -1.5, 8, 2);
  ctx.fillStyle = rgba(t.light, 0.4);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = rnd() * TAU;
    const d = 26 + rnd() * 6;
    ell(ctx, Math.cos(a) * d, Math.sin(a) * d * 0.33, 1.6 + rnd(), 0.9 + rnd() * 0.5);
    ctx.fillStyle = rgba(mix(t.base, t.dark, 0.25), 0.6);
    ctx.fill();
  }
  // Seeds.
  for (let i = 0; i < 5; i++) {
    const sx = (rnd() - 0.5) * 36;
    const sy = (rnd() - 0.5) * 9;
    ell(ctx, sx, sy, 0.7, 1.1, rnd() * 3);
    ctx.fillStyle = '#ffe7a3';
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
  // Deflated berry.
  ctx.save();
  ctx.translate(0, 1.5);
  ctx.scale(1.32, 0.42);
  const layer = bodyLayer(c, g, res);
  if (layer) drawLayer(ctx, layer);
  else paintBodyLayer(ctx, c, g);
  ctx.restore();
  // X eyes + tongue.
  ctx.save();
  ctx.translate(g.fx * 1.32, 1.5 + g.fy * 0.42);
  ctx.scale(0.85, 0.7);
  const fsd: FaceState = { ...faceStateTmp, time, expr: 'dead', open: 1, threeQuarter: true, skin: t.base, skinDark: t.dark, brow: t.deep, hair: c.hairColor };
  paintFace(ctx, { ...c, face: 'none' }, fsd);
  ctx.restore();
  // Little ghost wisp rising.
  const p = (time * 0.45) % 1;
  ctx.save();
  ctx.globalAlpha *= Math.sin(p * Math.PI) * 0.75;
  ctx.translate(Math.sin(time * 2.5) * 3, -10 - p * 18);
  ctx.beginPath();
  ctx.moveTo(-3.5, 2);
  ctx.bezierCurveTo(-4.4, -7, 4.4, -7, 3.5, 2);
  ctx.quadraticCurveTo(2, 4, 1, 2);
  ctx.quadraticCurveTo(0, 5, -1, 2);
  ctx.quadraticCurveTo(-2, 4, -3.5, 2);
  fs(ctx, '#f4f1ff', 0.9);
  circ(ctx, -1.1, -2.6, 0.6);
  circ(ctx, 1.1, -2.6, 0.6);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Public: pets, nameplates, emote bubbles

export function drawPet(ctx: CanvasRenderingContext2D, petId: string, x: number, y: number, scale: number, time: number, dir: 1 | -1): void {
  if (!petId || petId === 'none') return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * dir, scale);
  paintPet(ctx, petId, time);
  ctx.restore();
}

export function drawNameplate(ctx: CanvasRenderingContext2D, plateId: string, name: string, x: number, y: number, scale: number): void {
  const p = NAMEPLATE_BY_ID.get(plateId) ?? NAMEPLATES[0]!;
  const text = name.slice(0, 20);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.font = '700 9px Inter, ui-sans-serif, system-ui, sans-serif';
  const tw = Math.max(18, ctx.measureText(text).width);
  const w = tw + 14;
  const h = 14;
  const x0 = -w / 2;
  const y0 = -h / 2;
  rr(ctx, x0, y0 + 1.2, w, h, 7);
  ctx.fillStyle = 'rgba(5,6,14,0.35)';
  ctx.fill();
  rr(ctx, x0, y0, w, h, 7);
  const gr = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  p.stops.forEach((s, i) => gr.addColorStop(p.stops.length === 1 ? 0 : i / (p.stops.length - 1), s));
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.save();
  rr(ctx, x0, y0, w, h, 7);
  ctx.clip();
  const rnd = srand(hash32(plateId));
  switch (p.pattern) {
    case 'stars':
      for (let i = 0; i < 10; i++) {
        circ(ctx, x0 + rnd() * w, y0 + rnd() * h, 0.4 + rnd() * 0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
      }
      break;
    case 'stripes':
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = -2; i < w / 4 + 2; i++) {
        poly(ctx, [[x0 + i * 6, y0 + h], [x0 + i * 6 + 3, y0 + h], [x0 + i * 6 + 9, y0], [x0 + i * 6 + 6, y0]]);
        ctx.fill();
      }
      break;
    case 'dots':
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let xx = x0 + 3; xx < x0 + w; xx += 5) for (let yy = y0 + 3; yy < y0 + h; yy += 5) {
        circ(ctx, xx + ((yy - y0) % 10 > 4 ? 2.5 : 0), yy, 0.9);
        ctx.fill();
      }
      break;
    case 'checker':
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < w / 3.5; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) ctx.fillRect(x0 + i * 3.5, y0 + j * 3.5, 3.5, 3.5);
      break;
    case 'leaves':
      for (let i = 0; i < 6; i++) {
        ell(ctx, x0 + 4 + i * (w / 6), y0 + (i % 2 ? 3 : h - 3), 2.4, 1, i % 2 ? 0.6 : -0.6);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();
      }
      break;
    case 'waves':
      ctx.beginPath();
      for (let xx = x0; xx < x0 + w; xx += 1) ctx.lineTo(xx, y0 + h * 0.65 + Math.sin(xx * 0.5) * 1.4);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      break;
    case 'sparkle':
      for (let i = 0; i < 4; i++) twinkle(ctx, x0 + 4 + rnd() * (w - 8), y0 + 2 + rnd() * (h - 4), 1.6, 'rgba(255,255,255,0.8)');
      break;
    default:
      break;
  }
  const sheen = ctx.createLinearGradient(0, y0, 0, y0 + h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x0, y0, w, h);
  ctx.restore();
  rr(ctx, x0, y0, w, h, 7);
  ctx.strokeStyle = plateId === 'neon' ? '#5cf2ff' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = plateId === 'neon' ? 1.2 : 0.8;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0.9);
  ctx.fillStyle = p.ink;
  ctx.fillText(text, 0, 0.2);
  ctx.restore();
}

/**
 * Speech-bubble emote indicator; `(x, y)` is the tip of the bubble's tail
 * (put it just above the character's head).
 */
export function drawEmoteBubble(ctx: CanvasRenderingContext2D, emoteId: string, x: number, y: number, scale: number, time: number): void {
  const e = EMOTE_BY_ID.get(emoteId);
  const glyph = e?.glyph ?? '!';
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 4) * 1.2 * scale);
  ctx.scale(scale, scale);
  const w = 24;
  const h = 17;
  rr(ctx, -w / 2, -h - 5, w, h, 7);
  ctx.beginPath();
  rr(ctx, -w / 2, -h - 5, w, h, 7);
  ctx.moveTo(-3, -5.5);
  ctx.lineTo(0, 0);
  ctx.lineTo(3, -5.5);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  rr(ctx, -w / 2, -h - 5, w, h, 7);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  poly(ctx, [[-3, -5.2], [0, 0], [3, -5.2]], false);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-2.6, -6.4, 5.2, 1.6);
  const cy = -h / 2 - 5;
  if (emoteId === 'heart') {
    const s = 4.6 + Math.sin(time * 8) * 0.5;
    heart(ctx, 0, cy + 0.4, s);
    fs(ctx, '#ff4d6d', 1);
  } else if (emoteId === 'cheer') {
    star(ctx, 0, cy, 6, 0.48, 5, -Math.PI / 2 + Math.sin(time * 5) * 0.2);
    fs(ctx, '#ffd23f', 1);
  } else {
    ctx.font = `800 ${glyph.length > 2 ? 8 : 11}px Inter, ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = emoteId === 'laugh' ? '#e8484f' : emoteId === 'dance' ? '#8b5cf6' : '#2f6fed';
    ctx.fillText(glyph, 0, cy + 0.5);
  }
  ctx.restore();
}

/** Render a static thumbnail of a full berry into a canvas context. */
export function drawBerryThumb(ctx: CanvasRenderingContext2D, c: Cosmetics, w: number, h: number, opts?: { time?: number; emote?: string | null; dir?: 1 | -1; pet?: boolean }): void {
  const scale = Math.min(w / 46, h / 62);
  const time = opts?.time ?? 0.6;
  drawBerry(ctx, c, w / 2 + (opts?.pet && c.pet !== 'none' ? -6 * scale : 0), h * 0.86, scale, { time, moving: false, dir: opts?.dir ?? 1, emote: opts?.emote ?? null, blink: false });
  if (opts?.pet && c.pet !== 'none') drawPet(ctx, c.pet, w / 2 + 18 * scale, h * 0.9, scale * 0.9, time, -1);
}

export { paintFace as drawFaceFeatures, paletteColor };
