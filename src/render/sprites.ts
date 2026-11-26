/**
 * Procedural bot sprites: seven berry/shape silhouettes, each with a soft neon
 * outer glow (every bot has glow: true), a crisp rim, eyes and state badges.
 */
import type { BotShape } from '../data/bots';
import type { BotState } from '../adapters/events';
import type { ThemeTokens } from '../theme/tokens';

type Ctx = CanvasRenderingContext2D;

/** Trace the silhouette for `shape` centered at 0,0 with radius r. */
export function traceShape(ctx: Ctx, shape: BotShape, r: number, t = 0): void {
  ctx.beginPath();
  switch (shape) {
    case 'blueberry': {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    }
    case 'funkyberry': {
      // Wobbly, groovy blob.
      const n = 64;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (1 + 0.09 * Math.sin(a * 5 + t * 2) + 0.04 * Math.sin(a * 3 - t * 3));
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      break;
    }
    case 'marionberry': {
      // Oblong drupelet cluster outline (scalloped ellipse).
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * r * 0.78;
        const y = Math.sin(a) * r * 0.95;
        ctx.moveTo(x + r * 0.32, y);
        ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
      }
      ctx.moveTo(r * 0.8, 0);
      ctx.ellipse(0, 0, r * 0.8, r * 0.95, 0, 0, Math.PI * 2);
      break;
    }
    case 'heart': {
      const s = r * 1.05;
      ctx.moveTo(0, s * 0.85);
      ctx.bezierCurveTo(-s * 1.25, s * 0.05, -s * 0.75, -s * 1.0, 0, -s * 0.42);
      ctx.bezierCurveTo(s * 0.75, -s * 1.0, s * 1.25, s * 0.05, 0, s * 0.85);
      break;
    }
    case 'gem': {
      ctx.moveTo(-r * 0.55, -r * 0.8);
      ctx.lineTo(r * 0.55, -r * 0.8);
      ctx.lineTo(r, -r * 0.2);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, -r * 0.2);
      ctx.closePath();
      break;
    }
    case 'star': {
      const spikes = 5;
      for (let i = 0; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r * 1.12 : r * 0.55;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'cloud': {
      ctx.moveTo(-r, r * 0.45);
      ctx.arc(-r * 0.45, r * 0.05, r * 0.55, Math.PI * 0.75, Math.PI * 1.55);
      ctx.arc(r * 0.1, -r * 0.3, r * 0.62, Math.PI * 1.1, Math.PI * 1.95);
      ctx.arc(r * 0.6, r * 0.1, r * 0.48, Math.PI * 1.45, Math.PI * 0.45);
      ctx.lineTo(-r * 0.5, r * 0.6);
      ctx.closePath();
      break;
    }
  }
}

/** Shape-specific decoration drawn on top of the fill (calyx, facets, drupelets). */
function decorate(ctx: Ctx, shape: BotShape, r: number, rim: string): void {
  ctx.save();
  ctx.lineWidth = 1;
  switch (shape) {
    case 'blueberry': {
      // Five-point crown (calyx) on top.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * r * 0.26;
        const y = -r * 0.62 + Math.sin(a) * r * 0.2;
        ctx.moveTo(0, -r * 0.62);
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.stroke();
      break;
    }
    case 'marionberry': {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (const [x, y] of [
        [-0.3, -0.35],
        [0.25, -0.15],
        [-0.2, 0.3],
        [0.3, 0.45],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x * r, y * r, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      // Tiny stem.
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(r * 0.15, -r * 1.25);
      ctx.stroke();
      break;
    }
    case 'gem': {
      ctx.strokeStyle = rim;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.2);
      ctx.lineTo(r, -r * 0.2);
      ctx.moveTo(-r * 0.55, -r * 0.8);
      ctx.lineTo(-r * 0.2, -r * 0.2);
      ctx.lineTo(0, r);
      ctx.lineTo(r * 0.2, -r * 0.2);
      ctx.lineTo(r * 0.55, -r * 0.8);
      ctx.stroke();
      break;
    }
    case 'funkyberry': {
      ctx.fillStyle = 'rgba(47,111,237,0.18)';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export interface BotSpriteOpts {
  shape: BotShape;
  color: string;
  glowColor: string;
  starred: boolean;
  state: BotState;
  time: number;
  phase: number;
  facing: 1 | -1;
  radius?: number;
  selected?: boolean;
  carry?: 'box' | 'card' | 'mail' | null;
  buffed?: boolean;
  theme: ThemeTokens;
}

/** Soft neon glow halo — drawn before the body, additive in darker themes. */
export function drawGlow(ctx: Ctx, x: number, y: number, o: BotSpriteOpts): void {
  const r = o.radius ?? 11;
  const pulse = 0.85 + 0.15 * Math.sin(o.time * 2.4 + o.phase);
  const strength = o.theme.world.glowStrength * (o.state === 'asleep' ? 0.35 : 1) * pulse;
  const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.6);
  g.addColorStop(0, hexA(o.glowColor, 0.55 * strength));
  g.addColorStop(1, hexA(o.glowColor, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBotSprite(ctx: Ctx, x: number, y: number, o: BotSpriteOpts): void {
  const r = o.radius ?? 11;
  const walking = o.state === 'walking';
  const bob = walking ? Math.abs(Math.sin(o.phase * 2)) * 3 : o.state === 'working' ? Math.sin(o.phase * 2) * 0.8 : Math.sin(o.phase) * 0.6;
  const squash = walking ? 1 + Math.sin(o.phase * 4) * 0.04 : 1;

  // Ground shadow.
  ctx.fillStyle = o.theme.world.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.95, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(squash * o.facing, 1 / squash);
  ctx.globalAlpha = o.state === 'asleep' ? 0.6 : 1;

  if (o.selected) {
    ctx.save();
    ctx.strokeStyle = o.theme.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.lineDashOffset = -o.time * 12;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Body.
  traceShape(ctx, o.shape, r, o.time);
  ctx.fillStyle = o.color;
  ctx.fill();
  // Subtle top-light shading.
  const shade = ctx.createLinearGradient(0, -r, 0, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.28)');
  shade.addColorStop(0.55, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = shade;
  ctx.fill();
  // Crisp glowing rim (essential for Barry's black body and Daniel's white one).
  const dark = luminance(o.color) < 0.2;
  const light = luminance(o.color) > 0.92;
  ctx.lineWidth = dark ? 1.8 : 1.2;
  ctx.strokeStyle = light ? 'rgba(30,41,59,0.35)' : dark ? o.glowColor : 'rgba(0,0,0,0.22)';
  ctx.stroke();
  if (dark || light) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = hexA(o.glowColor, 0.9);
    traceShape(ctx, o.shape, r + 1.5, o.time);
    ctx.stroke();
  }
  decorate(ctx, o.shape, r, o.glowColor);

  // Eyes (blink every few seconds; closed when asleep).
  const eyeColor = luminance(o.color) > 0.6 ? '#1e293b' : '#ffffff';
  const blink = o.state === 'asleep' || Math.sin(o.time * 0.9 + o.phase * 3) > 0.985;
  ctx.fillStyle = eyeColor;
  ctx.strokeStyle = eyeColor;
  ctx.lineWidth = 1.4;
  const ey = o.shape === 'heart' ? -r * 0.05 : o.shape === 'gem' ? -r * 0.35 : -r * 0.08;
  for (const ex of [-r * 0.3, r * 0.3]) {
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(ex - 2, ey);
      ctx.lineTo(ex + 2, ey);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(ex + 0.8, ey, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Carry item (deliverable box / insight card).
  if (o.carry) {
    const cx = x + o.facing * r * 0.9;
    const cy = y - bob - r * 0.2;
    ctx.save();
    ctx.fillStyle = o.carry === 'box' ? '#e7d3a8' : o.carry === 'card' ? '#22d3ee' : '#f8fafc';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, cx - 6, cy - 5, 12, 10, 2);
    ctx.fill();
    ctx.stroke();
    if (o.carry === 'box') {
      ctx.strokeStyle = 'rgba(120,80,20,0.6)';
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 1);
      ctx.lineTo(cx + 6, cy - 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Badges.
  if (o.starred) drawStar(ctx, x + r * 0.95, y - bob - r * 0.95, 4.5, '#fbbf24');
  if (o.state === 'needs_input') badge(ctx, x, y - bob - r - 11, '!', '#f59e0b', o.time);
  if (o.state === 'asleep') {
    ctx.save();
    ctx.fillStyle = o.theme.muted;
    ctx.font = '600 9px ui-sans-serif, system-ui';
    const k = (o.time * 0.6 + o.phase) % 1;
    ctx.globalAlpha = 1 - k;
    ctx.fillText('z', x + r * 0.8 + k * 6, y - r - k * 10);
    ctx.globalAlpha = Math.max(0, 0.7 - k);
    ctx.fillText('z', x + r * 1.3 + k * 6, y - r - 6 - k * 10);
    ctx.restore();
  }
  if (o.state === 'delegating') badge(ctx, x, y - bob - r - 11, '→', '#14b8a6', o.time);
  if (o.buffed) {
    ctx.save();
    ctx.strokeStyle = '#22d3ee';
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(o.time * 6);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y - bob, r * 1.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function badge(ctx: Ctx, x: number, y: number, text: string, color: string, time: number): void {
  ctx.save();
  const s = 1 + 0.08 * Math.sin(time * 6);
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '700 9px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0.5);
  ctx.restore();
}

export function drawStar(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  ctx.restore();
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

const alphaCache = new Map<string, string>();
/** "#rrggbb" + alpha → "rgba(...)" (memoized; called a lot per frame). */
export function hexA(hex: string, a: number): string {
  const key = `${hex}|${a.toFixed(3)}`;
  const hit = alphaCache.get(key);
  if (hit) return hit;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const out = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  if (alphaCache.size > 4000) alphaCache.clear();
  alphaCache.set(key, out);
  return out;
}
