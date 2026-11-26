/**
 * Day → night cycle (art pass 3), driven by the local clock (or an override).
 *
 * Per frame this is deliberately cheap: during the day it does nothing; at
 * dusk/night it is one multiply-tinted fillRect over the visible rect plus a
 * culled list of pre-rendered light sprites (lamp pools, window glows) blitted
 * additively. Lamp fixtures and window glass are baked into the static layer
 * by `drawLightFixtures`, so they exist (unlit) during the day too.
 */
import { ANNEX_Y, CORRIDOR, MAP_H, MAP_W, ROOM_H, ROOM_W, ROOMS, TILE } from '../engine/world';
import type { ThemeTokens } from '../theme/tokens';
import { annexSpans, stonePath, terraceBeds } from './ground';
import { hexA } from './sprites';

type Ctx = CanvasRenderingContext2D;
type Region = { x: number; y: number; w: number; h: number };

const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** 0 in full daylight → 1 at night. Dawn 05:30–08:00, dusk 17:30–20:30. */
export function nightFactor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h < 12) return 1 - smoothstep(5.5, 8, h);
  return smoothstep(17.5, 20.5, h);
}

/** Golden-hour warmth: peaks around 07:00 and 18:45. */
export function goldenFactor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const bump = (c: number, w: number) => Math.max(0, 1 - Math.abs(h - c) / w);
  const k = Math.max(bump(7, 1.4), bump(18.75, 1.6));
  return k * k * (3 - 2 * k);
}

/** Fractional local hour, e.g. 18.5 for 18:30. */
export function localHour(d: Date = new Date()): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

export function timeLabel(hour: number): string {
  const n = nightFactor(hour);
  const g = goldenFactor(hour);
  if (n > 0.85) return 'Night';
  if (g > 0.4) return hour < 12 ? 'Dawn' : 'Dusk';
  return n > 0.3 ? 'Twilight' : 'Day';
}

// ---------------------------------------------------------------------------
// Light sources (world px), computed once from the floorplan.
// ---------------------------------------------------------------------------

export interface Lamp {
  x: number;
  y: number;
  /** Pool radius (world px). */
  r: number;
  color: string;
  strength: number;
  kind: 'corridor' | 'room' | 'garden' | 'neon';
}

export interface WindowLight {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Outward normal (the side light spills toward). */
  nx: number;
  ny: number;
}

const WARM = '#ffd08a';
const vCorr = (i: number) => (i * (ROOM_W + CORRIDOR) + CORRIDOR / 2) * TILE;
const hCorr = (j: number) => (j * (ROOM_H + CORRIDOR) + CORRIDOR / 2) * TILE;

export const LAMPS: readonly Lamp[] = (() => {
  const out: Lamp[] = [];
  const corridor = (x: number, y: number) => out.push({ x, y, r: 52, color: WARM, strength: 0.7, kind: 'corridor' });
  // Core corridors: every intersection plus the middle of each horizontal run.
  for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) corridor(vCorr(i), hCorr(j));
  for (let c = 0; c < 3; c++) for (let j = 0; j <= 3; j++) corridor(vCorr(c) + ((ROOM_W + CORRIDOR) * TILE) / 2, hCorr(j));
  // Corridor ring around annex rooms.
  for (const [x0, x1] of annexSpans()) {
    const l = x0 + (CORRIDOR / 2) * TILE;
    const r = x1 - (CORRIDOR / 2) * TILE;
    const bottom = (MAP_H - 2) * TILE;
    for (const y of [(ANNEX_Y + 6) * TILE, bottom]) {
      corridor(l, y);
      corridor(r, y);
    }
    corridor((x0 + x1) / 2, bottom);
  }
  // Room ceiling lights (two warm pools; the Arcade gets neon pools instead).
  for (const room of ROOMS) {
    const cx = room.x * TILE;
    const cy = (room.y + room.h / 2) * TILE;
    if (room.id === 'arcade') {
      out.push({ x: cx + room.w * TILE * 0.25, y: cy - 40, r: 150, color: '#ff4fd8', strength: 0.75, kind: 'neon' });
      out.push({ x: cx + room.w * TILE * 0.72, y: cy - 60, r: 140, color: '#22d3ee', strength: 0.6, kind: 'neon' });
      out.push({ x: cx + room.w * TILE * 0.5, y: cy + 70, r: 150, color: '#a78bfa', strength: 0.6, kind: 'neon' });
      continue;
    }
    out.push({ x: cx + room.w * TILE * 0.3, y: cy, r: 125, color: '#ffd9a0', strength: 0.42, kind: 'room' });
    out.push({ x: cx + room.w * TILE * 0.7, y: cy, r: 125, color: '#ffd9a0', strength: 0.42, kind: 'room' });
  }
  // Garden path lights along the terrace stepping stones.
  terraceBeds().forEach((b, bi) => {
    stonePath(b, bi === 0).forEach((st, i) => {
      if (i % 2 === 0) out.push({ x: st.x, y: st.y + 16, r: 46, color: '#fff1c4', strength: 0.9, kind: 'garden' });
    });
  });
  return out;
})();

export const WINDOWS: readonly WindowLight[] = (() => {
  const out: WindowLight[] = [];
  const L = TILE * 0.5;
  const R = (MAP_W - 0.5) * TILE;
  const T = TILE * 0.5;
  const Y = ANNEX_Y * TILE;
  const B = (MAP_H - 0.5) * TILE;
  const len = TILE * 2;
  const along = (a: number, b: number, fixed: number, horizontal: boolean, nx: number, ny: number) => {
    for (let p = a + TILE * 2.5; p + len < b - TILE * 1.5; p += TILE * 5) {
      if (horizontal) out.push({ x: p, y: fixed - 2, w: len, h: 4, nx, ny });
      else out.push({ x: fixed - 2, y: p, w: 4, h: len, nx, ny });
    }
  };
  along(L, R, T, true, 0, -1);
  along(T, Y, L, false, -1, 0);
  along(T, Y, R, false, 1, 0);
  let x = L;
  for (const [x0, x1] of annexSpans()) {
    along(x, x0, Y, true, 0, 1);
    along(Y, B, x0, false, -1, 0);
    along(Y, B, x1, false, 1, 0);
    along(x0, x1, B, true, 0, 1);
    x = x1;
  }
  along(x, R, Y, true, 0, 1);
  return out;
})();

/** Bake lamp fixtures and window glass into the static layer (visible by day, lit at night). */
export function drawLightFixtures(ctx: Ctx, th: ThemeTokens, region?: Region): void {
  const inR = (x: number, y: number, pad: number) => !region || (x > region.x - pad && y > region.y - pad && x < region.x + region.w + pad && y < region.y + region.h + pad);
  const glass = th.name === 'dark' ? '#2b3c5c' : th.name === 'soft' ? '#b9c7cf' : '#bcd3f2';
  ctx.save();
  ctx.lineCap = 'round';
  for (const w of WINDOWS) {
    if (!inR(w.x, w.y, 40)) continue;
    ctx.fillStyle = glass;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = hexA('#ffffff', th.name === 'dark' ? 0.15 : 0.7);
    if (w.w > w.h) ctx.fillRect(w.x + 4, w.y + 1, w.w * 0.35, 1);
    else ctx.fillRect(w.x + 1, w.y + 4, 1, w.h * 0.35);
  }
  for (const l of LAMPS) {
    if (l.kind === 'room' || l.kind === 'neon' || !inR(l.x, l.y, 12)) continue;
    if (l.kind === 'garden') {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(l.x + 2, l.y + 3, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = th.name === 'dark' ? '#3b4252' : '#5b6372';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3cf';
      ctx.beginPath();
      ctx.arc(l.x, l.y - 0.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = th.name === 'dark' ? '#1f2737' : '#ffffff';
      ctx.strokeStyle = th.world.propLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = th.name === 'dark' ? '#3d4a63' : '#f1e6cc';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Per-frame lighting
// ---------------------------------------------------------------------------

const sprites = new Map<string, CanvasImageSource>();

/** A 64 px radial light sprite in `color`, rendered once and reused. */
function lightSprite(color: string): CanvasImageSource | null {
  const hit = sprites.get(color);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, hexA(color, 0.9));
  grad.addColorStop(0.35, hexA(color, 0.45));
  grad.addColorStop(1, hexA(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sprites.set(color, c);
  return c;
}

const NIGHT_TINT: Record<ThemeTokens['name'], { color: string; alpha: number; lamps: number }> = {
  light: { color: '#1c2558', alpha: 0.72, lamps: 0.22 },
  soft: { color: '#262450', alpha: 0.7, lamps: 0.3 },
  dark: { color: '#3c4a90', alpha: 0.5, lamps: 0.6 },
};

/** How much of the night tint each kind of light cuts away (its pool reveals true colours). */
const REVEAL: Record<Lamp['kind'], number> = { corridor: 0.85, room: 0.62, garden: 0.95, neon: 0.7 };

export interface DaylightStats {
  lamps: number;
  windows: number;
}

/**
 * Screen-sized offscreen "night mask": the tint with holes punched where lamps
 * shine. Multiplying it over the frame darkens everything except the lamp
 * pools, which keep their true colours (additive glows alone only haze).
 */
export interface NightMask {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** World → mask-pixel transform [scale, tx, ty]. */
  transform: [number, number, number];
  /** Device-pixel size the mask is stretched to when composited. */
  destW: number;
  destH: number;
}

/** Resolution of the night mask relative to the device canvas. */
export const NIGHT_MASK_SCALE = 0.25;

export function createNightMaskCanvas(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  return c.getContext('2d');
}

const lampFlicker = (l: Lamp, t: number) => (l.kind === 'neon' ? 0.85 + 0.15 * Math.sin(t * 3 + l.x) : l.kind === 'garden' ? 0.92 + 0.08 * Math.sin(t * 7 + l.y) : 1);

/**
 * Tint the visible world for the time of day and add lamp pools and window
 * glows. Call after the world/props and before bots so bots stay bright.
 */
export function drawDaylight(ctx: Ctx, vis: Region, th: ThemeTokens, hour: number, t: number, mask?: NightMask | null): DaylightStats {
  const stats = { lamps: 0, windows: 0 };
  const n = nightFactor(hour);
  const g = goldenFactor(hour);
  if (n < 0.004 && g < 0.004) return stats;
  const tint = NIGHT_TINT[th.name];
  const on = smoothstep(0.15, 0.7, n); // lights fade in from twilight onward
  const lampsInView = LAMPS.filter((l) => !(l.x + l.r < vis.x || l.y + l.r < vis.y || l.x - l.r > vis.x + vis.w || l.y - l.r > vis.y + vis.h));
  const windowsInView = WINDOWS.filter((w) => !(w.x + 120 < vis.x || w.y + 120 < vis.y || w.x - 120 > vis.x + vis.w || w.y - 120 > vis.y + vis.h));
  const spill = (w: WindowLight) => {
    const horizontal = w.w > w.h;
    const sw = horizontal ? w.w * 1.8 : 56;
    const sh = horizontal ? 56 : w.h * 1.8;
    return { x: w.x + w.w / 2 + w.nx * 22 - sw / 2, y: w.y + w.h / 2 + w.ny * 22 - sh / 2, w: sw, h: sh };
  };

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  if (g > 0.004) {
    ctx.globalAlpha = g * (th.name === 'dark' ? 0.18 : 0.3);
    ctx.fillStyle = '#ffbf80';
    ctx.fillRect(vis.x, vis.y, vis.w, vis.h);
  }
  if (n > 0.004) {
    const white = lightSprite('#ffffff');
    if (mask && white) {
      const m = mask.ctx;
      if (m.canvas.width !== mask.width || m.canvas.height !== mask.height) {
        m.canvas.width = mask.width;
        m.canvas.height = mask.height;
      }
      m.setTransform(1, 0, 0, 1, 0, 0);
      m.globalCompositeOperation = 'source-over';
      m.globalAlpha = 1;
      m.fillStyle = tint.color;
      m.fillRect(0, 0, mask.width, mask.height);
      if (on > 0.004) {
        const [z, tx, ty] = mask.transform;
        m.setTransform(z, 0, 0, z, tx, ty);
        m.globalCompositeOperation = 'destination-out';
        for (const l of lampsInView) {
          m.globalAlpha = Math.min(1, on * REVEAL[l.kind] * lampFlicker(l, t));
          m.drawImage(white, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
        }
        m.globalAlpha = on * 0.7;
        for (const w of windowsInView) {
          const s = spill(w);
          m.drawImage(white, s.x, s.y, s.w, s.h);
        }
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = n * tint.alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(m.canvas, 0, 0, mask.width, mask.height, 0, 0, mask.destW, mask.destH);
      ctx.restore();
    } else {
      ctx.globalAlpha = n * tint.alpha;
      ctx.fillStyle = tint.color;
      ctx.fillRect(vis.x, vis.y, vis.w, vis.h);
    }
  }
  if (on > 0.004) {
    // Warm, coloured glow on top of the revealed pools.
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lampsInView) {
      const img = lightSprite(l.color);
      if (!img) continue;
      ctx.globalAlpha = Math.min(1, on * l.strength * tint.lamps * lampFlicker(l, t));
      const r = l.r * 0.8;
      ctx.drawImage(img, l.x - r, l.y - r, r * 2, r * 2);
      stats.lamps++;
    }
    const win = lightSprite(WARM);
    if (win) {
      ctx.globalAlpha = on * 0.4 * tint.lamps;
      for (const w of windowsInView) {
        const s = spill(w);
        ctx.drawImage(win, s.x, s.y, s.w, s.h);
        stats.windows++;
      }
    }
    // Lit panes and lamp bulbs on top (normal blending so they read as glass/bulbs, not haze).
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = on;
    ctx.fillStyle = '#ffd98f';
    for (const w of windowsInView) ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#fff4d6';
    for (const l of lampsInView) {
      if (l.kind !== 'corridor' && l.kind !== 'garden') continue;
      ctx.beginPath();
      ctx.arc(l.x, l.y - (l.kind === 'garden' ? 0.5 : 0), l.kind === 'garden' ? 1.8 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  return stats;
}
