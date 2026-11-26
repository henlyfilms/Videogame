/**
 * Face painter: eyes, brows, mouth and face accessories. Coordinates are
 * relative to the face centre (eye line), facing +x. Shared by the 2D
 * renderer and the 3D rig's face texture.
 */
import type { Cosmetics } from '../../core/types';
import { FACE_BY_ID } from '../catalog';
import { mix, rgba } from '../shape';
import { circ, ell, fs, heart, INK, line, poly, rr, star, twinkle, WHITE, type Ctx } from './util';

export type Expr = 'normal' | 'happy' | 'scared' | 'sad' | 'closed' | 'dead' | 'love' | 'sleepy' | 'smug' | 'shock' | 'think';

export interface FaceState {
  time: number;
  /** Eyelid openness 0..1. */
  open: number;
  lookX: number;
  lookY: number;
  expr: Expr;
  moving: boolean;
  /** 2D side-on view: near eye bigger, everything shifted forward. */
  threeQuarter: boolean;
  /** Skin colour used for lids. */
  skin: string;
  skinDark: string;
  brow: string;
  hair: string;
  /** Mouth open amount for talking/laughing (0..1). */
  talk?: number;
  /** Skip painting the face accessory (the 3D rig builds it as geometry). */
  noAccessory?: boolean;
  /** Hide the eyes regardless of the accessory (covered by 3D geometry). */
  forceHideEyes?: boolean;
}

const PUPIL = '#1f1730';

export interface EyeSpot {
  x: number;
  y: number;
  k: number;
  near: boolean;
}

export function eyeSpots(st: FaceState, eyes: string): EyeSpot[] {
  if (eyes === 'cyclops') return [{ x: st.threeQuarter ? 1.4 : 0, y: -0.5, k: 1.45, near: true }];
  if (st.threeQuarter)
    return [
      { x: -4.4, y: 0.3, k: 0.86, near: false },
      { x: 5.6, y: 0, k: 1, near: true },
    ];
  return [
    { x: -5.2, y: 0, k: 1, near: false },
    { x: 5.2, y: 0, k: 1, near: true },
  ];
}

function pupilOffset(st: FaceState, k: number, seed: number, googly: boolean): [number, number] {
  let px = st.lookX * 1.15 * k;
  let py = st.lookY * 1.0 * k + 0.2;
  if (googly) {
    const amp = st.moving ? 1.4 : 0.55;
    px += Math.sin(st.time * 9.3 + seed * 2.1) * amp * k;
    py += Math.abs(Math.cos(st.time * 7.1 + seed)) * amp * 0.9 * k + 0.4;
  }
  if (st.expr === 'scared') {
    px += Math.sin(st.time * 40 + seed) * 0.35;
    py += Math.cos(st.time * 37 + seed) * 0.3;
  }
  return [px, py];
}

function closedEye(ctx: Ctx, x: number, y: number, k: number, up: boolean): void {
  ctx.beginPath();
  if (up) {
    ctx.moveTo(x - 3.3 * k, y + 1);
    ctx.quadraticCurveTo(x, y - 3.4 * k, x + 3.3 * k, y + 1);
  } else {
    ctx.moveTo(x - 3.4 * k, y - 0.3);
    ctx.quadraticCurveTo(x, y + 2.6 * k, x + 3.4 * k, y - 0.3);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5 * k;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function eyeWhite(ctx: Ctx, x: number, y: number, rx: number, ry: number): void {
  ell(ctx, x, y, rx, ry);
  const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.4, 0.2, x, y, Math.max(rx, ry) * 1.1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.75, WHITE);
  g.addColorStop(1, '#e3dcef');
  fs(ctx, g, 1.15);
}

function highlights(ctx: Ctx, x: number, y: number, r: number): void {
  circ(ctx, x - r * 0.42, y - r * 0.48, r * 0.38);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  circ(ctx, x + r * 0.38, y + r * 0.42, r * 0.17);
  ctx.fill();
}

function drawEye(ctx: Ctx, style: string, e: EyeSpot, st: FaceState, idx: number): void {
  const { x, y, k } = e;
  const expr = st.expr;
  // Expression overrides first.
  if (expr === 'dead') {
    const s = 2.6 * k;
    line(ctx, x - s, y - s, x + s, y + s, INK, 1.6 * k);
    line(ctx, x - s, y + s, x + s, y - s, INK, 1.6 * k);
    return;
  }
  if (expr === 'happy' && style !== 'cyclops') return closedEye(ctx, x, y + 0.6, k, true);
  if ((expr === 'closed' || expr === 'sad') && style !== 'googly') {
    closedEye(ctx, x, y, k, false);
    if (expr === 'sad') {
      const ty = (st.time * 1.6 + idx * 0.5) % 1;
      ell(ctx, x + 1.2, y + 2.5 + ty * 6, 0.9, 1.3);
      ctx.fillStyle = rgba('#7cc8ff', 0.9 - ty * 0.5);
      ctx.fill();
    }
    return;
  }
  const scared = expr === 'scared' || expr === 'shock';
  const open = style === 'googly' || scared ? 1 : st.open;
  if (open < 0.22) return closedEye(ctx, x, y, k, false);

  const lid = (fromTop: number, angle = 0): void => {
    // Paint a lid covering the top `fromTop` fraction of the eye.
    ctx.save();
    ell(ctx, x, y, 4 * k, 4.9 * k);
    ctx.clip();
    ctx.beginPath();
    const ly = y - 4.9 * k + fromTop * 9.8 * k;
    ctx.moveTo(x - 6 * k, ly + angle * 6 * k);
    ctx.lineTo(x + 6 * k, ly - angle * 6 * k);
    ctx.lineTo(x + 6 * k, y - 7 * k);
    ctx.lineTo(x - 6 * k, y - 7 * k);
    ctx.closePath();
    ctx.fillStyle = st.skinDark;
    ctx.fill();
    ctx.restore();
    line(ctx, x - 4.2 * k, y - 4.9 * k + fromTop * 9.8 * k + angle * 4.2 * k, x + 4.2 * k, y - 4.9 * k + fromTop * 9.8 * k - angle * 4.2 * k, INK, 1.3 * k);
  };

  const ry = (scared ? 5.4 : 4.8) * k * Math.max(0.25, open);
  const rx = (scared ? 4.3 : 3.95) * k;
  switch (style) {
    case 'dot': {
      const [px, py] = pupilOffset(st, k, idx, false);
      ell(ctx, x + px * 0.6, y + py * 0.6, 1.9 * k, 2.5 * k * open);
      ctx.fillStyle = PUPIL;
      ctx.fill();
      circ(ctx, x + px * 0.6 - 0.6 * k, y + py * 0.6 - 0.9 * k, 0.6 * k);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      return;
    }
    case 'happy':
      if (!scared) return closedEye(ctx, x, y + 0.6, k, true);
      break;
    case 'wink':
      if (e.near && !scared) {
        // Near eye winks with a little lash.
        closedEye(ctx, x, y + 0.6, k, true);
        line(ctx, x + 3.2 * k, y + 0.4, x + 4.6 * k, y - 0.8 * k, INK, 1.1 * k);
        return;
      }
      break;
    default:
      break;
  }

  if (style === 'googly') {
    const R = 4.7 * k;
    circ(ctx, x, y - 0.6 * k, R);
    fs(ctx, '#ffffff', 1.4 * k);
    const [px, py] = pupilOffset(st, k, idx, true);
    const pr = 2.3 * k;
    const lim = R - pr - 0.4;
    const len = Math.hypot(px * 1.4, py * 1.4);
    const sc = len > lim ? lim / len : 1;
    circ(ctx, x + px * 1.4 * sc, y - 0.6 * k + py * 1.4 * sc, pr);
    ctx.fillStyle = PUPIL;
    ctx.fill();
    circ(ctx, x - R * 0.45, y - R * 0.55, R * 0.18);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    return;
  }

  eyeWhite(ctx, x, y, rx, ry);
  const [px, py] = pupilOffset(st, k, idx, false);
  ctx.save();
  ell(ctx, x, y, rx - 0.3, ry - 0.3);
  ctx.clip();
  let pr = (style === 'sparkle' ? 3.05 : style === 'cyclops' ? 2.6 : 2.55) * k;
  if (scared) pr = 1.35 * k;
  const cx = x + px;
  const cy = y + py;
  if (style === 'starry' && !scared) {
    star(ctx, cx, cy, 3.1 * k, 0.5);
    fs(ctx, '#ffcf3f', 0.9 * k);
    circ(ctx, cx - 0.5 * k, cy - 0.7 * k, 0.6 * k);
    ctx.fillStyle = '#fff';
    ctx.fill();
  } else if (st.expr === 'love' && !scared) {
    heart(ctx, cx, cy - 0.2, 2.6 * k);
    fs(ctx, '#ff4d6d', 0.8 * k);
  } else {
    if (style === 'sparkle' || style === 'cyclops') {
      const g = ctx.createRadialGradient(cx, cy + pr * 0.3, 0.2, cx, cy, pr);
      g.addColorStop(0, mix(st.skinDark, '#ffffff', 0.25));
      g.addColorStop(0.55, st.skinDark);
      g.addColorStop(1, PUPIL);
      circ(ctx, cx, cy, pr);
      ctx.fillStyle = g;
      ctx.fill();
      circ(ctx, cx, cy, pr * 0.5);
      ctx.fillStyle = PUPIL;
      ctx.fill();
    } else {
      circ(ctx, cx, cy, pr);
      ctx.fillStyle = PUPIL;
      ctx.fill();
    }
    highlights(ctx, cx, cy, pr);
    if (style === 'sparkle' && !scared) twinkle(ctx, cx + pr * 0.55, cy - pr * 0.75, 1.3 * k, '#ffffff');
  }
  ctx.restore();

  if (style === 'sleepy' && !scared) lid(0.52, 0.04);
  else if (style === 'cool' && !scared) lid(0.42, e.near ? 0.16 : -0.16);
  else if (style === 'determined' && !scared) lid(0.3, e.near ? 0.22 : -0.22);
  else if (open < 1) lid(1 - open);
  if (style === 'lashes') {
    const side = e.near ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + side * (0.55 + i * 0.32);
      line(ctx, x + Math.cos(a) * rx, y + Math.sin(a) * ry, x + Math.cos(a) * (rx + 1.6 * k), y + Math.sin(a) * (ry + 1.6 * k), INK, 1 * k);
    }
  }
}

function drawBrows(ctx: Ctx, style: string, spots: EyeSpot[], st: FaceState, eyes: string): void {
  if (style === 'none' && st.expr !== 'scared' && st.expr !== 'sad') return;
  const s = style === 'none' ? 'soft' : style;
  const lift = st.expr === 'scared' || st.expr === 'shock' ? -1.6 : st.expr === 'happy' ? -0.6 : 0;
  const wobble = st.expr === 'think' ? Math.sin(st.time * 3) * 0.6 : 0;
  ctx.lineCap = 'round';
  const col = st.brow;
  if (s === 'unibrow' && eyes !== 'cyclops' && spots.length > 1) {
    const a = spots[0]!;
    const b = spots[1]!;
    ctx.beginPath();
    ctx.moveTo(a.x - 3.4 * a.k, a.y - 6.4 + lift);
    ctx.quadraticCurveTo(a.x, a.y - 8.2 + lift, (a.x + b.x) / 2, b.y - 6.6 + lift);
    ctx.quadraticCurveTo(b.x, b.y - 8.4 + lift, b.x + 3.6 * b.k, b.y - 6.6 + lift);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.1;
    ctx.stroke();
    return;
  }
  for (const e of spots) {
    const k = e.k;
    const inner = e.near ? -1 : 1; // direction towards face centre
    let tilt = 0;
    if (s === 'angry' || st.expr === 'smug') tilt = 1.6;
    if (s === 'worried' || st.expr === 'scared' || st.expr === 'sad') tilt = -1.7;
    const y0 = e.y - (e.k > 1.2 ? 8.6 : 6.6) * (s === 'raised' ? 1.18 : 1) + lift;
    const xi = e.x + inner * 3 * k;
    const xo = e.x - inner * 3.2 * k;
    const yi = y0 + tilt * 0.9;
    const yo = y0 - tilt * 0.5 + (e.near ? wobble : 0);
    ctx.beginPath();
    ctx.moveTo(xo, yo);
    ctx.quadraticCurveTo(e.x, y0 - (s === 'soft' || s === 'raised' ? 1.4 : 0.6) * k, xi, yi);
    ctx.strokeStyle = col;
    ctx.lineWidth = (s === 'bushy' ? 2.6 : s === 'soft' ? 1.35 : 1.7) * k;
    ctx.stroke();
  }
}

function mouthPath(ctx: Ctx, x: number, y: number, w: number, curve: number): void {
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x, y + curve, x + w, y);
}

function strokeInk(ctx: Ctx, lw = 1.35): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function openMouth(ctx: Ctx, x: number, y: number, w: number, h: number, teeth: 'top' | 'gap' | 'none', tongue: boolean): void {
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x, y + h * 0.15, x + w, y);
  ctx.quadraticCurveTo(x + w * 0.85, y + h, x, y + h);
  ctx.quadraticCurveTo(x - w * 0.85, y + h, x - w, y);
  ctx.closePath();
  ctx.fillStyle = '#4a1630';
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (tongue) {
    ell(ctx, x + w * 0.1, y + h * 1.0, w * 0.6, h * 0.5);
    ctx.fillStyle = '#ff6f91';
    ctx.fill();
  }
  if (teeth === 'top') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - w, y - 1, w * 2, h * 0.32 + 1);
  } else if (teeth === 'gap') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - w, y - 1, w * 0.88, h * 0.36 + 1);
    ctx.fillRect(x + w * 0.12, y - 1, w * 0.88, h * 0.36 + 1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x, y + h * 0.15, x + w, y);
  ctx.quadraticCurveTo(x + w * 0.85, y + h, x, y + h);
  ctx.quadraticCurveTo(x - w * 0.85, y + h, x - w, y);
  ctx.closePath();
  strokeInk(ctx, 1.2);
}

function drawMouth(ctx: Ctx, style: string, st: FaceState): void {
  const x = st.threeQuarter ? 2.2 : 0;
  const y = 7.4;
  let s = style;
  const talk = st.talk ?? 0;
  if (st.expr === 'happy') s = s === 'buck' || s === 'gap' || s === 'tongue' ? s : 'grin';
  if (st.expr === 'scared' || st.expr === 'shock') s = 'o';
  if (st.expr === 'sad') s = 'frown';
  if (st.expr === 'dead') s = 'dead';
  if (st.expr === 'smug') s = 'smirk';
  if (st.expr === 'love') s = s === 'flat' ? 'smile' : s;
  if (talk > 0.3 && (s === 'smile' || s === 'smirk' || s === 'flat' || s === 'cat')) s = 'grin';
  switch (s) {
    case 'smile':
      mouthPath(ctx, x, y, 3.2, 3.4);
      strokeInk(ctx, 1.4);
      break;
    case 'grin': {
      const h = 4.4 + talk * 2;
      openMouth(ctx, x, y - 0.6, 4.1, h, 'top', true);
      break;
    }
    case 'buck': {
      mouthPath(ctx, x, y, 3.6, 3);
      strokeInk(ctx, 1.4);
      rr(ctx, x - 1.9, y + 1, 1.8, 3.1, 0.5);
      fs(ctx, '#ffffff', 0.9);
      rr(ctx, x + 0.1, y + 1, 1.8, 3.1, 0.5);
      fs(ctx, '#ffffff', 0.9);
      break;
    }
    case 'smirk':
      ctx.beginPath();
      ctx.moveTo(x - 3, y + 1.3);
      ctx.quadraticCurveTo(x + 0.5, y + 2.3, x + 3.4, y - 0.8);
      strokeInk(ctx, 1.45);
      line(ctx, x + 3.1, y - 0.6, x + 3.9, y - 1.6, INK, 1.1);
      break;
    case 'o': {
      const r = 1.7 + (st.expr === 'scared' ? Math.abs(Math.sin(st.time * 18)) * 0.5 : 0);
      ell(ctx, x, y + 1.3, r, r * 1.25);
      fs(ctx, '#4a1630', 1.2);
      ell(ctx, x, y + 2.2, r * 0.6, r * 0.42);
      ctx.fillStyle = '#ff6f91';
      ctx.fill();
      break;
    }
    case 'tongue':
      mouthPath(ctx, x, y, 3.2, 3);
      strokeInk(ctx, 1.4);
      ctx.beginPath();
      ctx.moveTo(x + 0.1, y + 1.3);
      ctx.quadraticCurveTo(x + 0.4, y + 5.2, x + 2.2, y + 4.4);
      ctx.quadraticCurveTo(x + 3.4, y + 3.3, x + 2.8, y + 0.9);
      fs(ctx, '#ff6f91', 1.1);
      line(ctx, x + 1.4, y + 1.8, x + 1.7, y + 3.4, '#d94a6e', 0.6);
      break;
    case 'cat':
      ctx.beginPath();
      ctx.moveTo(x - 3.4, y + 0.6);
      ctx.quadraticCurveTo(x - 1.7, y + 3, x, y + 0.8);
      ctx.quadraticCurveTo(x + 1.7, y + 3, x + 3.4, y + 0.6);
      strokeInk(ctx, 1.35);
      break;
    case 'flat':
      line(ctx, x - 2.8, y + 1.4, x + 2.8, y + 1.0, INK, 1.45);
      break;
    case 'fangs':
      mouthPath(ctx, x, y, 3.4, 2.6);
      strokeInk(ctx, 1.4);
      poly(ctx, [[x - 2, y + 1.1], [x - 0.9, y + 1.3], [x - 1.5, y + 3.2]]);
      fs(ctx, '#ffffff', 0.8);
      poly(ctx, [[x + 0.9, y + 1.3], [x + 2, y + 1.1], [x + 1.5, y + 3.2]]);
      fs(ctx, '#ffffff', 0.8);
      break;
    case 'gap':
      openMouth(ctx, x, y - 0.4, 3.7, 4.2 + talk * 2, 'gap', false);
      break;
    case 'frown':
      mouthPath(ctx, x, y + 2.2, 2.8, -2.6);
      strokeInk(ctx, 1.4);
      break;
    case 'dead':
      mouthPath(ctx, x, y + 0.6, 3, 1.4);
      strokeInk(ctx, 1.3);
      ell(ctx, x + 1.2, y + 2.4, 1.3, 1.8);
      fs(ctx, '#ff6f91', 0.9);
      break;
    default:
      mouthPath(ctx, x, y, 3.2, 3.4);
      strokeInk(ctx, 1.4);
  }
}

// ---------------------------------------------------------------------------
// Face accessories

function glassesFrame(ctx: Ctx, spots: EyeSpot[], draw: (e: EyeSpot) => void, frame: string, tq: boolean): void {
  const near = spots.find((s) => s.near) ?? spots[0]!;
  const far = spots.find((s) => !s.near) ?? near;
  // Temple arm back towards the ear.
  if (tq) line(ctx, far.x - 3.6 * far.k, far.y - 1, far.x - 10, far.y - 2.2, frame, 1.3);
  else {
    line(ctx, far.x - 4, far.y - 1, far.x - 8.5, far.y - 2, frame, 1.3);
    line(ctx, near.x + 4, near.y - 1, near.x + 8.5, near.y - 2, frame, 1.3);
  }
  if (far !== near) {
    ctx.beginPath();
    ctx.moveTo(far.x + 3 * far.k, far.y - 1.2);
    ctx.quadraticCurveTo((far.x + near.x) / 2, far.y - 2.6, near.x - 3.2, near.y - 1.2);
    ctx.strokeStyle = frame;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  for (const e of spots) draw(e);
}

export function drawFaceAccessory(ctx: Ctx, id: string, st: FaceState, eyes: string): void {
  if (id === 'none') return;
  const spots = eyeSpots(st, eyes === 'cyclops' && !FACE_BY_ID.get(id)?.hidesEyes ? eyes : 'round');
  const tq = st.threeQuarter;
  const near = spots.find((s) => s.near) ?? spots[0]!;
  const mx = tq ? 2.2 : 0;
  switch (id) {
    case 'roundglasses':
      glassesFrame(ctx, spots, (e) => {
        circ(ctx, e.x, e.y, 5 * e.k);
        ctx.fillStyle = 'rgba(200,230,255,0.18)';
        ctx.fill();
        ctx.strokeStyle = '#3a2c22';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        line(ctx, e.x - 2.6 * e.k, e.y - 2.2 * e.k, e.x - 0.8 * e.k, e.y - 3.6 * e.k, 'rgba(255,255,255,0.8)', 0.9);
      }, '#3a2c22', tq);
      break;
    case 'nerdglasses':
      glassesFrame(ctx, spots, (e) => {
        rr(ctx, e.x - 5 * e.k, e.y - 4.4 * e.k, 10 * e.k, 8.6 * e.k, 2);
        ctx.fillStyle = 'rgba(200,230,255,0.16)';
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.3;
        ctx.stroke();
      }, INK, tq);
      if (spots.length > 1) {
        const a = spots[0]!;
        const b = spots[1]!;
        rr(ctx, (a.x + b.x) / 2 - 1.3, a.y - 2.4, 2.6, 2.4, 0.6);
        fs(ctx, '#ffffff', 0.7);
      }
      break;
    case 'shades':
      glassesFrame(ctx, spots, (e) => {
        ctx.beginPath();
        ctx.moveTo(e.x - 5.2 * e.k, e.y - 3.6);
        ctx.lineTo(e.x + 5.2 * e.k, e.y - 3.6);
        ctx.quadraticCurveTo(e.x + 5 * e.k, e.y + 3.8 * e.k, e.x, e.y + 3.6 * e.k);
        ctx.quadraticCurveTo(e.x - 5 * e.k, e.y + 3.4 * e.k, e.x - 5.2 * e.k, e.y - 3.6);
        const g = ctx.createLinearGradient(e.x, e.y - 4, e.x, e.y + 4);
        g.addColorStop(0, '#2a2f45');
        g.addColorStop(1, '#0c0d16');
        fs(ctx, g, 1.2);
        line(ctx, e.x - 3 * e.k, e.y - 1.8, e.x - 0.6 * e.k, e.y - 2.6, 'rgba(255,255,255,0.75)', 1.1);
        line(ctx, e.x + 0.6 * e.k, e.y + 1.6, e.x + 2.6 * e.k, e.y - 0.6, 'rgba(120,180,255,0.35)', 0.9);
      }, INK, tq);
      break;
    case 'starglasses':
      glassesFrame(ctx, spots, (e) => {
        star(ctx, e.x, e.y, 5.6 * e.k, 0.55);
        const g = ctx.createRadialGradient(e.x, e.y, 0.5, e.x, e.y, 6 * e.k);
        g.addColorStop(0, '#ffe36e');
        g.addColorStop(1, '#ff4fb5');
        fs(ctx, g, 1.2);
        twinkle(ctx, e.x - 1.4 * e.k, e.y - 1.6 * e.k, 1.4, '#ffffff');
      }, '#ff4fb5', tq);
      break;
    case 'heartglasses':
      glassesFrame(ctx, spots, (e) => {
        heart(ctx, e.x, e.y + 0.4, 4.6 * e.k);
        const g = ctx.createLinearGradient(e.x, e.y - 4, e.x, e.y + 4);
        g.addColorStop(0, '#ff6b8a');
        g.addColorStop(1, '#c8103c');
        fs(ctx, g, 1.2);
        circ(ctx, e.x - 1.8 * e.k, e.y - 1.2 * e.k, 0.9);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
      }, '#c8103c', tq);
      break;
    case '3dglasses':
      glassesFrame(ctx, spots, (e) => {
        rr(ctx, e.x - 4.6 * e.k, e.y - 3.6 * e.k, 9.2 * e.k, 7.2 * e.k, 1);
        ctx.fillStyle = e.near ? 'rgba(40,200,255,0.75)' : 'rgba(255,50,70,0.75)';
        ctx.fill();
        ctx.strokeStyle = '#f5f5f5';
        ctx.lineWidth = 2;
        ctx.stroke();
      }, '#f5f5f5', tq);
      break;
    case 'monocle': {
      const e = near;
      circ(ctx, e.x, e.y, 5.1 * e.k);
      ctx.fillStyle = 'rgba(220,240,255,0.2)';
      ctx.fill();
      ctx.strokeStyle = '#d9a514';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(e.x + 3, e.y + 4.4);
      ctx.quadraticCurveTo(e.x + 5, e.y + 10, e.x + 1, e.y + 14);
      ctx.strokeStyle = '#d9a514';
      ctx.lineWidth = 0.7;
      ctx.setLineDash([1, 0.8]);
      ctx.stroke();
      ctx.setLineDash([]);
      line(ctx, e.x - 2.5, e.y - 2.4, e.x - 0.8, e.y - 3.8, 'rgba(255,255,255,0.8)', 0.9);
      break;
    }
    case 'visor': {
      const x0 = tq ? -11 : -11;
      const x1 = tq ? 12.5 : 11;
      rr(ctx, x0, -3.8, x1 - x0, 7.6, 3.8);
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, '#14b8a6');
      g.addColorStop(0.5, '#6ea1ff');
      g.addColorStop(1, '#c084fc');
      fs(ctx, g, 1.3);
      const sweep = ((st.time * 0.6) % 1.6) - 0.3;
      ctx.save();
      rr(ctx, x0, -3.8, x1 - x0, 7.6, 3.8);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x0 + sweep * (x1 - x0), -4, 2.2, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let yy = -3; yy < 4; yy += 1.6) ctx.fillRect(x0, yy, x1 - x0, 0.5);
      ctx.restore();
      break;
    }
    case 'vr': {
      const x0 = tq ? -10 : -11;
      const x1 = tq ? 13.5 : 11;
      line(ctx, x0 - 3, -1, x0, -1, '#2a2f45', 2.6);
      rr(ctx, x0, -5, x1 - x0, 10, 3);
      fs(ctx, '#eef1f6', 1.3);
      rr(ctx, x0 + 1.5, -3.2, x1 - x0 - 3, 6.4, 2.2);
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, '#1c2233');
      g.addColorStop(1, '#2f6fed');
      ctx.fillStyle = g;
      ctx.fill();
      circ(ctx, x1 - 4, 0, 1);
      ctx.fillStyle = `rgba(110,240,255,${0.5 + 0.5 * Math.sin(st.time * 4)})`;
      ctx.fill();
      break;
    }
    case 'mask':
      ctx.beginPath();
      {
        const a = spots[0]!;
        const b = spots[spots.length - 1]!;
        ctx.moveTo(a.x - 6.5, a.y - 2.6);
        ctx.quadraticCurveTo((a.x + b.x) / 2, a.y - 6.5, b.x + 6.6, b.y - 2.6);
        ctx.quadraticCurveTo(b.x + 7, b.y + 4.4, b.x + 1, b.y + 4.2);
        ctx.quadraticCurveTo((a.x + b.x) / 2, a.y + 1.4, a.x - 1, a.y + 4.4);
        ctx.quadraticCurveTo(a.x - 7, a.y + 4, a.x - 6.5, a.y - 2.6);
        ctx.closePath();
      }
      fs(ctx, '#20232e', 1.1);
      if (tq) {
        ctx.beginPath();
        ctx.moveTo(spots[0]!.x - 6.5, -1);
        ctx.quadraticCurveTo(-14, 1, -16, 4);
        ctx.strokeStyle = '#20232e';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      // Re-draw eye whites through the holes for readability.
      for (const e of spots) {
        ell(ctx, e.x, e.y, 2.9 * e.k, 3.2 * e.k);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        circ(ctx, e.x + st.lookX, e.y + 0.3, 1.7 * e.k);
        ctx.fillStyle = PUPIL;
        ctx.fill();
      }
      break;
    case 'eyepatch': {
      const e = near;
      line(ctx, e.x - 9, e.y - 6.5, e.x + 7, e.y + 2.5, '#20232e', 1.1);
      ell(ctx, e.x, e.y + 0.2, 4.4 * e.k, 4.9 * e.k);
      fs(ctx, '#20232e', 1);
      line(ctx, e.x - 1.6, e.y - 2.2, e.x + 0.4, e.y - 3, 'rgba(255,255,255,0.3)', 0.8);
      break;
    }
    case 'goggles': {
      const x0 = spots[0]!.x - 6;
      const x1 = spots[spots.length - 1]!.x + 6;
      line(ctx, x0 - (tq ? 5 : 2), -0.5, x1 + (tq ? 0 : 2), -0.5, '#5a3d22', 2.4);
      for (const e of spots) {
        circ(ctx, e.x, e.y, 5.2 * e.k);
        fs(ctx, '#7c8496', 1.2);
        circ(ctx, e.x, e.y, 3.9 * e.k);
        ctx.fillStyle = 'rgba(170,255,210,0.38)';
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        line(ctx, e.x - 2.2 * e.k, e.y - 1.6 * e.k, e.x - 0.6 * e.k, e.y - 2.9 * e.k, 'rgba(255,255,255,0.9)', 1);
      }
      break;
    }
    case 'bandana': {
      ctx.beginPath();
      ctx.moveTo(-10 + mx * 0.2, 3.4);
      ctx.quadraticCurveTo(mx, 2.2, 12.5 + mx * 0.3, 3);
      ctx.lineTo(mx + 2, 14.5);
      ctx.closePath();
      fs(ctx, '#d9343f', 1.2);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 9; i++) {
        circ(ctx, -7 + (i % 4) * 5 + mx * 0.6 + (Math.floor(i / 4) % 2) * 2.5, 5 + Math.floor(i / 4) * 3.2, 0.55);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'mustache': {
      const y = 5.3;
      const x = mx;
      ctx.beginPath();
      ctx.moveTo(x, y - 0.6);
      ctx.bezierCurveTo(x - 2.5, y - 2.4, x - 5.5, y + 1.6, x - 7.4, y - 1.6);
      ctx.bezierCurveTo(x - 7, y + 2.6, x - 2.6, y + 2.6, x, y + 0.9);
      ctx.bezierCurveTo(x + 2.6, y + 2.6, x + 7, y + 2.6, x + 7.4, y - 1.6);
      ctx.bezierCurveTo(x + 5.5, y + 1.6, x + 2.5, y - 2.4, x, y - 0.6);
      fs(ctx, st.hair === '#000000' ? '#2b1d14' : mix(st.hair, '#1a1220', 0.25), 1);
      break;
    }
    case 'beard': {
      ctx.beginPath();
      ctx.moveTo(-8 + mx * 0.4, 3);
      ctx.quadraticCurveTo(-9 + mx * 0.4, 13, mx, 15);
      ctx.quadraticCurveTo(10 + mx, 13, 11.5 + mx * 0.5, 2.5);
      ctx.quadraticCurveTo(mx + 3, 5.5, mx, 5.2);
      ctx.quadraticCurveTo(mx - 3, 5.5, -8 + mx * 0.4, 3);
      fs(ctx, st.hair, 1.2);
      ell(ctx, mx + 1, 8.6, 2.2, 1.2);
      ctx.fillStyle = '#4a1630';
      ctx.fill();
      line(ctx, mx - 3, 11, mx - 2, 12.6, mix(st.hair, '#000000', 0.3), 0.7);
      line(ctx, mx + 4, 11, mx + 3.5, 12.6, mix(st.hair, '#000000', 0.3), 0.7);
      break;
    }
    case 'blush':
      for (const e of spots) {
        const g = ctx.createRadialGradient(e.x + (e.near ? 1.5 : -0.5), e.y + 5.4, 0.2, e.x, e.y + 5.4, 3.4);
        g.addColorStop(0, 'rgba(255,110,150,0.85)');
        g.addColorStop(1, 'rgba(255,110,150,0)');
        ell(ctx, e.x + (e.near ? 1.5 : -0.5), e.y + 5.4, 3.4 * e.k, 2.2 * e.k);
        ctx.fillStyle = g;
        ctx.fill();
        line(ctx, e.x - 1, e.y + 4.8, e.x - 0.2, e.y + 6, 'rgba(255,255,255,0.7)', 0.5);
        line(ctx, e.x + 0.6, e.y + 4.8, e.x + 1.4, e.y + 6, 'rgba(255,255,255,0.7)', 0.5);
      }
      break;
    case 'bandaid': {
      const x = near.x + 3.5;
      const y = near.y + 6;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.5);
      rr(ctx, -3.6, -1.3, 7.2, 2.6, 1.2);
      fs(ctx, '#f2c49b', 0.9);
      ctx.restore();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.5);
      rr(ctx, -3.6, -1.3, 7.2, 2.6, 1.2);
      fs(ctx, '#f2c49b', 0.9);
      ctx.fillStyle = '#e0a77a';
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
      break;
    }
    case 'clownnose': {
      circ(ctx, mx + 0.6, 4.1, 2.4);
      const g = ctx.createRadialGradient(mx - 0.2, 3.2, 0.2, mx + 0.6, 4.1, 2.4);
      g.addColorStop(0, '#ff8a8a');
      g.addColorStop(1, '#d3172e');
      fs(ctx, g, 1);
      circ(ctx, mx - 0.2, 3.3, 0.6);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

/**
 * Paint eyes, brows, mouth and the face accessory centred at (0,0).
 */
export function paintFace(ctx: Ctx, c: Cosmetics, st: FaceState): void {
  const acc = FACE_BY_ID.get(c.face);
  const hideEyes = st.forceHideEyes ?? acc?.hidesEyes ?? false;
  const hideMouth = acc?.hidesMouth ?? false;
  const spots = eyeSpots(st, c.eyes);
  // Cheeks: soft blush on everyone (cute), stronger when happy.
  if (st.expr !== 'dead') {
    const ba = st.expr === 'happy' || st.expr === 'love' ? 0.55 : 0.28;
    for (const e of spots.length > 1 ? spots : [{ x: -5, y: 0, k: 1, near: false }, { x: 6, y: 0, k: 1, near: true }]) {
      const cx = e.x + (e.near ? 2.2 : -1.4);
      const g = ctx.createRadialGradient(cx, 5.4, 0.1, cx, 5.4, 3.2 * e.k);
      g.addColorStop(0, `rgba(255,120,160,${ba})`);
      g.addColorStop(1, 'rgba(255,120,160,0)');
      ctx.fillStyle = g;
      ell(ctx, cx, 5.4, 3.2 * e.k, 2.1 * e.k);
      ctx.fill();
    }
  }
  if (!hideEyes) {
    spots.forEach((e, i) => drawEye(ctx, c.eyes, e, st, i));
    drawBrows(ctx, c.brows, spots, st, c.eyes);
  } else if (c.brows !== 'none') {
    drawBrows(ctx, c.brows, eyeSpots(st, 'round').map((e) => ({ ...e, y: e.y - 1.2 })), st, 'round');
  }
  if (!hideMouth) drawMouth(ctx, c.mouth, st);
  if (!st.noAccessory) drawFaceAccessory(ctx, c.face, st, c.eyes);
  if (st.expr === 'scared') {
    // Sweat drop.
    const t = (st.time * 0.9) % 1;
    ctx.beginPath();
    const x = -9;
    const y = -5 + t * 4;
    ctx.moveTo(x, y - 2.6);
    ctx.quadraticCurveTo(x + 1.8, y + 0.4, x, y + 1.4);
    ctx.quadraticCurveTo(x - 1.8, y + 0.4, x, y - 2.6);
    fs(ctx, 'rgba(140,210,255,0.95)', 0.8);
  }
  if (st.expr === 'think') {
    for (let i = 0; i < 3; i++) {
      circ(ctx, 9 + i * 2.2, -12 - i * 2.4, 0.6 + i * 0.35);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }
  }
}
