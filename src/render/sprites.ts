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
  /** Expressive pose: playing at an arcade cabinet, celebrating or sulking. */
  mood?: 'play' | 'cheer' | 'sulk' | null;
  theme: ThemeTokens;
}

/**
 * Animation pose for a bot this frame (art pass 3). Pure and cheap: a handful
 * of sines driven by sim time + the bot's own phase, so no per-bot state.
 *  - walking: hop with squash on landing and stretch at the apex
 *  - idle: slow breathing; working: quick typing jiggle with a forward lean
 *  - play: bouncing to the game's rhythm, leaning into the cabinet
 *  - cheer: big celebratory jumps; sulk: drooped and squashed
 */
export interface BotPose {
  /** Vertical lift in px (positive = up). */
  lift: number;
  sx: number;
  sy: number;
  /** Lean in radians (positive = clockwise). */
  lean: number;
  /** 0..1 how high off the ground (shadow shrinks). */
  air: number;
}

export function botPose(o: Pick<BotSpriteOpts, 'state' | 'time' | 'phase' | 'mood' | 'facing'>, r = 11): BotPose {
  const t = o.time;
  if (o.mood === 'cheer') {
    const k = Math.abs(Math.sin(t * 7 + o.phase));
    const land = 1 - k;
    return { lift: k * r * 0.9, sx: 1 + land * land * 0.16 - k * 0.04, sy: 1 - land * land * 0.14 + k * 0.08, lean: Math.sin(t * 3.5 + o.phase) * 0.12, air: k };
  }
  if (o.mood === 'sulk') {
    const sway = Math.sin(t * 1.2 + o.phase);
    return { lift: -1, sx: 1.08, sy: 0.88, lean: sway * 0.05 - 0.06 * o.facing, air: 0 };
  }
  if (o.mood === 'play' && o.state !== 'walking') {
    const beat = Math.abs(Math.sin(t * 5.2 + o.phase));
    return { lift: beat * 1.6, sx: 1 + (1 - beat) * 0.05, sy: 1 - (1 - beat) * 0.05, lean: -0.08 + Math.sin(t * 2.6 + o.phase) * 0.05, air: beat * 0.15 };
  }
  switch (o.state) {
    case 'walking': {
      const k = Math.abs(Math.sin(o.phase * 2)); // 0 at contact, 1 at apex
      const land = 1 - k;
      const squash = land * land * land;
      return { lift: k * 3.4, sx: 1 + squash * 0.13 - k * 0.03, sy: 1 - squash * 0.12 + k * 0.05, lean: 0.07 * o.facing, air: k * 0.35 };
    }
    case 'working':
      return { lift: Math.abs(Math.sin(o.phase * 2)) * 0.9, sx: 1, sy: 1 + Math.sin(o.phase * 4) * 0.015, lean: 0.05 * o.facing + Math.sin(o.phase * 3) * 0.02, air: 0 };
    case 'asleep': {
      const b = Math.sin(t * 1.1 + o.phase);
      return { lift: 0, sx: 1.04 + b * 0.02, sy: 0.94 - b * 0.02, lean: 0.12, air: 0 };
    }
    case 'needs_input':
      return { lift: Math.abs(Math.sin(t * 4 + o.phase)) * 1.4, sx: 1, sy: 1, lean: Math.sin(t * 8) * 0.03, air: 0.05 };
    default: {
      const b = Math.sin(t * 1.6 + o.phase);
      return { lift: 0.4 + b * 0.5, sx: 1 - b * 0.012, sy: 1 + b * 0.022, lean: 0, air: 0 };
    }
  }
}

/** Natural blinking: every ~3–5 s per bot, occasionally a double blink. */
export function isBlinking(time: number, phase: number): boolean {
  const period = 3.4 + ((Math.abs(phase) * 7.13) % 1.6);
  const t = (time + Math.abs(phase) * 3) % period;
  return t < 0.11 || (Math.abs(phase) % 1 > 0.6 && t > 0.24 && t < 0.33);
}

/** Soft neon glow halo — drawn before the body, additive in darker themes. */
export function drawGlow(ctx: Ctx, x: number, y: number, o: BotSpriteOpts): void {
  const r = o.radius ?? 11;
  // Glow pulse: slow breathing when idle, quicker while busy, flaring when celebrating.
  const rate = o.mood === 'cheer' ? 9 : o.state === 'working' || o.mood === 'play' ? 3.6 : 2.2;
  const depth = o.mood === 'cheer' ? 0.35 : o.state === 'asleep' ? 0.05 : 0.17;
  const pulse = 1 - depth + depth * Math.sin(o.time * rate + o.phase);
  const strength = o.theme.world.glowStrength * (o.state === 'asleep' ? 0.35 : o.mood === 'sulk' ? 0.55 : 1) * pulse;
  const lift = botPose(o, r).lift;
  const reach = r * (o.mood === 'cheer' ? 3.1 : 2.6);
  const g = ctx.createRadialGradient(x, y - lift, r * 0.6, x, y - lift, reach);
  g.addColorStop(0, hexA(o.glowColor, 0.55 * strength));
  g.addColorStop(1, hexA(o.glowColor, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y - lift, reach, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBotSprite(ctx: Ctx, x: number, y: number, o: BotSpriteOpts): void {
  const r = o.radius ?? 11;
  const pose = botPose(o, r);
  const bob = pose.lift;

  // Ground shadow: shrinks and fades while airborne.
  ctx.save();
  ctx.globalAlpha = 1 - pose.air * 0.45;
  ctx.fillStyle = o.theme.world.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.95, r * 0.85 * (1 - pose.air * 0.25) * pose.sx, r * 0.3 * (1 - pose.air * 0.2), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  // Squash & stretch pivot at the feet so landings plant on the ground.
  ctx.translate(x, y + r * 0.9 - bob);
  ctx.rotate(pose.lean);
  ctx.scale(pose.sx * o.facing, pose.sy);
  ctx.translate(0, -r * 0.9);
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
  // Top-left key light shading.
  const shade = ctx.createLinearGradient(-r * 0.4, -r, r * 0.3, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.32)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = shade;
  ctx.fill();
  // Arcade screen light washing over the face while playing.
  if (o.mood === 'play') {
    ctx.fillStyle = hexA(Math.sin(o.time * 6 + o.phase) > 0 ? '#e879f9' : '#22d3ee', 0.16);
    ctx.fill();
  }
  // Crisp glowing rim (essential for Barry's black body and Daniel's white one).
  const lum = luminance(o.color);
  const dark = lum < 0.2;
  const light = lum > 0.92;
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
  // Specular glint (top-left) sells the glossy berry material.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.42, -r * 0.48, r * 0.16, r * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fill();

  // Eyes: blink, look where they're going, squint when happy, droop when sulking.
  const eyeColor = lum > 0.6 ? '#1e293b' : '#ffffff';
  const blink = o.state === 'asleep' || isBlinking(o.time, o.phase);
  ctx.fillStyle = eyeColor;
  ctx.strokeStyle = eyeColor;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  const ey = o.shape === 'heart' ? -r * 0.05 : o.shape === 'gem' ? -r * 0.35 : -r * 0.08;
  const look = o.state === 'walking' ? 0.9 : o.mood === 'play' ? 0 : 0.5;
  const up = o.mood === 'play' ? -1 : 0;
  for (const ex of [-r * 0.3, r * 0.3]) {
    ctx.beginPath();
    if (o.mood === 'cheer') {
      // ^ ^ happy squint
      ctx.moveTo(ex - 2, ey + 1);
      ctx.lineTo(ex + 0.2, ey - 1.4);
      ctx.lineTo(ex + 2.2, ey + 1);
      ctx.stroke();
    } else if (o.mood === 'sulk') {
      ctx.moveTo(ex - 2, ey + (ex < 0 ? -0.6 : 0.8));
      ctx.lineTo(ex + 2, ey + (ex < 0 ? 0.8 : -0.6));
      ctx.stroke();
    } else if (blink) {
      ctx.moveTo(ex - 2, ey);
      ctx.lineTo(ex + 2, ey);
      ctx.stroke();
    } else {
      ctx.arc(ex + look, ey + up, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (o.mood === 'cheer') {
    // Open grin.
    ctx.beginPath();
    ctx.arc(0, ey + r * 0.28, r * 0.17, 0, Math.PI);
    ctx.fill();
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

  // Mood props: sparkles when cheering, a tiny rain cloud when sulking, a joystick while playing.
  if (o.mood === 'cheer') {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const a = o.time * 3 + i * 2.1 + o.phase;
      const k = (o.time * 1.3 + i / 3) % 1;
      ctx.globalAlpha = 1 - k;
      drawStar(ctx, x + Math.cos(a) * r * 1.5, y - bob - r * 0.4 + Math.sin(a) * r * 0.9 - k * 8, 2.6, i === 1 ? '#fbbf24' : o.glowColor);
    }
    ctx.restore();
  } else if (o.mood === 'sulk') {
    const cy = y - r * 1.75;
    ctx.save();
    ctx.fillStyle = o.theme.name === 'dark' ? '#64748b' : '#94a3b8';
    for (const [dx, dy, rr] of [
      [-4, 0, 3.6],
      [1, -2, 4.4],
      [5.5, 0.5, 3.2],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x + dx, cy + dy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const k = (o.time * 1.8 + i / 3) % 1;
      const dx = -4 + i * 4;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.moveTo(x + dx, cy + 4 + k * 7);
      ctx.lineTo(x + dx - 0.6, cy + 6.5 + k * 7);
      ctx.stroke();
    }
    ctx.restore();
  } else if (o.mood === 'play') {
    const wig = Math.sin(o.time * 9 + o.phase) * 2;
    ctx.save();
    ctx.strokeStyle = o.theme.name === 'light' ? '#475569' : '#cbd5e1';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x + r * 1.1, y - bob - r * 0.9);
    ctx.lineTo(x + r * 1.1 + wig, y - bob - r * 1.4);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(x + r * 1.1 + wig, y - bob - r * 1.45, 1.8, 0, Math.PI * 2);
    ctx.fill();
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
