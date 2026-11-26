/**
 * Baked lighting helpers (art pass 2): soft drop shadows, ambient-occlusion
 * style edge darkening along walls, and a gentle key light on floors. Every
 * function here runs only when the static layer or a chunk is rasterized,
 * never per frame. They avoid `shadowBlur`, whose cost scales with the
 * shape's device-pixel area (huge for the building at 3–5× chunk scales) and
 * whose radius ignores the transform; layered translucent strokes look the
 * same at every cache scale.
 */
import type { ThemeTokens } from '../theme/tokens';
import { hexA, roundRect } from './sprites';

type Ctx = CanvasRenderingContext2D;
type R = { x: number; y: number; w: number; h: number };

/** Shadow ink per theme (a cool blue-black, never pure black, keeps colours clean). */
export function shadowInk(th: ThemeTokens): { color: string; strength: number } {
  if (th.name === 'dark') return { color: '#000000', strength: 1 };
  if (th.name === 'soft') return { color: '#3a2c14', strength: 0.75 };
  return { color: '#1e2a44', strength: 0.6 };
}

/**
 * Soft drop shadow for any traced path: the path is stroked several times
 * with growing widths at low alpha, offset down-right (light from top-left).
 * Callers fill the real shape afterwards, which hides the inner half.
 */
export function softShadow(ctx: Ctx, trace: () => void, th: ThemeTokens, spread = 14, dx = 2, dy = 6, alpha = 0.05): void {
  const ink = shadowInk(th);
  ctx.save();
  ctx.translate(dx, dy);
  trace();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = hexA(ink.color, alpha * ink.strength);
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    ctx.lineWidth = (spread * 2 * i) / steps;
    ctx.stroke();
  }
  ctx.fillStyle = hexA(ink.color, alpha * ink.strength);
  ctx.fill();
  ctx.restore();
}

/** Contact shadow under a prop footprint. */
export function propShadow(ctx: Ctx, r: R, th: ThemeTokens, inset = 3, radius = 6): void {
  softShadow(ctx, () => roundRect(ctx, r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2, radius), th, 6, 1.5, 3.5, 0.055);
}

/** Footprint radius per prop kind so contact shadows follow the silhouette. */
export function propShadowShape(kind: string, r: R): { inset: number; radius: number } | null {
  switch (kind) {
    case 'huddle-table':
      return { inset: 5, radius: 40 };
    case 'spawn-pod':
    case 'brain':
      return { inset: 8, radius: Math.min(r.w, r.h) / 2 };
    case 'plant':
      return { inset: 8, radius: 8 };
    case 'mic':
    case 'dimmer':
    case 'render-lamp':
    case 'clapperboard':
    case 'conduit':
      return null;
    default:
      return { inset: 3, radius: 6 };
  }
}

/**
 * Ambient occlusion along a room's inside walls: dark bands fading into the
 * floor, deepest under the top wall (it faces away from the key light).
 */
export function roomOcclusion(ctx: Ctx, r: R, th: ThemeTokens, darkFloor = false): void {
  const ink = shadowInk(th);
  const k = (darkFloor ? 1.6 : 1) * ink.strength;
  const band = (x0: number, y0: number, x1: number, y1: number, a: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, hexA(ink.color, Math.min(0.6, a * k)));
    g.addColorStop(1, hexA(ink.color, 0));
    return g;
  };
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.clip();
  const top = 26;
  const side = 16;
  const bottom = 10;
  ctx.fillStyle = band(0, r.y + 4, 0, r.y + top, 0.16);
  ctx.fillRect(r.x, r.y, r.w, top);
  ctx.fillStyle = band(r.x + 4, 0, r.x + side, 0, 0.12);
  ctx.fillRect(r.x, r.y, side, r.h);
  ctx.fillStyle = band(r.x + r.w - 4, 0, r.x + r.w - side, 0, 0.08);
  ctx.fillRect(r.x + r.w - side, r.y, side, r.h);
  ctx.fillStyle = band(0, r.y + r.h - 4, 0, r.y + r.h - bottom, 0.06);
  ctx.fillRect(r.x, r.y + r.h - bottom, r.w, bottom);
  ctx.restore();
}

/** Soft key light on a floor: a large, faint radial lift toward the upper-left middle. */
export function floorKeyLight(ctx: Ctx, r: R, th: ThemeTokens, tint = '#ffffff', darkFloor = false): void {
  const cx = r.x + r.w * 0.42;
  const cy = r.y + r.h * 0.38;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(r.w, r.h) * 0.75);
  const a = darkFloor ? 0.09 : th.name === 'dark' ? 0.045 : th.name === 'soft' ? 0.22 : 0.35;
  g.addColorStop(0, hexA(tint, a));
  g.addColorStop(1, hexA(tint, 0));
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

/**
 * Two-tone wall material: the outer face is a shade darker than the wall
 * colour and the inner lip catches a highlight, which reads as thickness in
 * plan view.
 */
export function wallBevel(ctx: Ctx, r: R, th: ThemeTokens): void {
  ctx.save();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = th.world.wallTop;
  roundRect(ctx, r.x + 0.8, r.y + 0.8, r.w - 1.6, r.h - 1.6, 10);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexA('#ffffff', th.name === 'dark' ? 0.07 : 0.55);
  roundRect(ctx, r.x + 6.5, r.y + 6.5, r.w - 13, r.h - 13, 7);
  ctx.stroke();
  ctx.restore();
}

/** Coloured light spilling from a room's accent strip onto the floor below it. */
export function accentSpill(ctx: Ctx, r: R, accent: string, th: ThemeTokens): void {
  const x = r.x + 19 + 35;
  const y = r.y + 6;
  const a = th.name === 'dark' ? 0.16 : th.name === 'soft' ? 0.1 : 0.07;
  const g = ctx.createRadialGradient(x, y, 2, x, y, 120);
  g.addColorStop(0, hexA(accent, a));
  g.addColorStop(1, hexA(accent, 0));
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, 260, 130);
  ctx.restore();
}
