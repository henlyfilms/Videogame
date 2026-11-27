/**
 * Hair painter (2D). Hair is painted in two layers: 'back' (behind the body:
 * long hair, afros, ponytails) and 'front' (the cap hugging the head plus
 * volume pieces on top). Coordinates are berry-local (feet at 0,0, +x front).
 */
import { mix } from '../shape';
import { circ, ell, fs, INK, line, traceBody, type Ctx, type Geo, type Tones } from './util';

export interface HairCtx {
  g: Geo;
  tones: Tones;
  /** Horizontal follow-through (units; + = trails backwards). */
  sway: number;
  /** Vertical bounce (units). */
  bounce: number;
  time: number;
  /** A covering hat hides volume pieces. */
  covered: boolean;
}

type DepthFn = (u: number) => number;

function lerpPts(pts: readonly (readonly [number, number])[]): DepthFn {
  return (u: number) => {
    if (u <= pts[0]![0]) return pts[0]![1];
    for (let i = 1; i < pts.length; i++) {
      const [u1, d1] = pts[i]!;
      const [u0, d0] = pts[i - 1]!;
      if (u <= u1) return d0 + ((d1 - d0) * (u - u0)) / (u1 - u0 || 1);
    }
    return pts[pts.length - 1]![1];
  };
}

function hairFill(ctx: Ctx, h: HairCtx, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const gr = ctx.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, h.tones.hairLight);
  gr.addColorStop(0.45, h.tones.hair);
  gr.addColorStop(1, h.tones.hairDark);
  return gr;
}

/** Hair cap following the head silhouette down to depth(u) below the top. */
function cap(ctx: Ctx, h: HairCtx, depth: DepthFn, wavy = 0): void {
  const { g } = h;
  const hw = g.w / 2 + 3;
  const N = 28;
  const edge: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const u = -1.15 + (2.3 * i) / N;
    const wob = wavy ? Math.sin(u * 14) * wavy : 0;
    edge.push([u * hw, g.top + depth(u) + wob]);
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-hw * 1.2, g.top - 30);
  for (const [x, y] of edge) ctx.lineTo(x, y);
  ctx.lineTo(hw * 1.2, g.top - 30);
  ctx.closePath();
  ctx.clip();
  traceBody(ctx, g, 1.5, 0, -0.6);
  ctx.fillStyle = hairFill(ctx, h, -hw * 0.4, g.top - 2, hw * 0.4, g.top + 16);
  ctx.fill();
  // Strand highlights.
  ctx.globalAlpha = 0.5;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 3.4, g.top + 1);
    ctx.quadraticCurveTo(i * 4.2 + 2, g.top + 5, i * 4.8 + 1, g.top + 9);
    ctx.strokeStyle = i % 2 ? h.tones.hairLight : h.tones.hairDark;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  traceBody(ctx, g, 1.5, 0, -0.6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
  // Hairline edge.
  ctx.save();
  traceBody(ctx, g, 1.5, 0, -0.6);
  ctx.clip();
  ctx.beginPath();
  edge.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.strokeStyle = mix(h.tones.hairDark, INK, 0.5);
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function longBack(ctx: Ctx, h: HairCtx, length: number, wave: number): void {
  const { g } = h;
  const hw = g.w / 2;
  const s = h.sway;
  const yEnd = g.top + length;
  const tipX = -hw * 0.75 - s * 1.2;
  ctx.beginPath();
  ctx.moveTo(hw * 0.3, g.top + 2);
  ctx.quadraticCurveTo(-hw * 0.2, g.top - 4, -hw * 0.95, g.top + 6);
  const n = 6;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = -hw * 0.95 - 1.5 - s * t * 1.1 + Math.sin(t * Math.PI * 2 + h.time * 2) * wave;
    const y = g.top + 6 + (yEnd - g.top - 6) * t;
    ctx.lineTo(x, y);
  }
  // Wavy tips.
  const tips = 4;
  for (let i = 0; i <= tips; i++) {
    const t = i / tips;
    const x = tipX + (hw * 0.55 - tipX) * t;
    const y = yEnd + (i % 2 ? -2.6 : 1.4) - t * 3;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(hw * 0.6, g.top + length * 0.5);
  ctx.closePath();
  fs(ctx, hairFill(ctx, h, -hw, g.top, hw * 0.2, yEnd), 1.5);
  // Strands.
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-hw * 0.8 + i * 2.4, g.top + 6);
    ctx.quadraticCurveTo(-hw * 1.05 - s * 0.6 + i * 2, g.top + length * 0.5, tipX + 2 + i * 3, yEnd - 3);
    ctx.strokeStyle = i === 1 ? h.tones.hairLight : h.tones.hairDark;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function braid(ctx: Ctx, h: HairCtx, x0: number, y0: number, len: number, swing: number): void {
  const segs = 5;
  let px = x0;
  let py = y0;
  for (let i = 0; i < segs; i++) {
    const t = (i + 1) / segs;
    const x = x0 - swing * t * t;
    const y = y0 + len * t;
    ell(ctx, (px + x) / 2, (py + y) / 2, 2.7 - i * 0.18, len / segs / 1.6, (x - px) * -0.08);
    fs(ctx, i % 2 ? h.tones.hair : h.tones.hairLight, 1.1);
    px = x;
    py = y;
  }
  circ(ctx, px, py + 0.5, 1.4);
  fs(ctx, '#ff86bf', 0.9);
  ctx.beginPath();
  ctx.moveTo(px - 1.6, py + 1.6);
  ctx.lineTo(px, py + 5);
  ctx.lineTo(px + 1.6, py + 1.6);
  fs(ctx, h.tones.hair, 1);
}

function tail(ctx: Ctx, h: HairCtx, x0: number, y0: number, dx: number, dy: number, width: number, tie: string): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0 - width * 0.4);
  ctx.bezierCurveTo(x0 + dx * 0.5 - width, y0 + dy * 0.1 - width, x0 + dx - width * 0.6, y0 + dy * 0.6, x0 + dx, y0 + dy);
  ctx.bezierCurveTo(x0 + dx + width * 0.5, y0 + dy * 0.5, x0 + dx * 0.5 + width, y0 + dy * 0.2 + width * 0.6, x0, y0 + width * 0.4);
  ctx.closePath();
  fs(ctx, hairFill(ctx, h, x0, y0, x0 + dx, y0 + dy), 1.3);
  ell(ctx, x0, y0, 1.6, 2.4);
  fs(ctx, tie, 1);
}

export function paintHair(ctx: Ctx, id: string, layer: 'back' | 'front', h: HairCtx): void {
  const { g } = h;
  const hw = g.w / 2;
  const top = g.top;
  const s = h.sway;
  if (id === 'none') return;
  if (layer === 'back') {
    switch (id) {
      case 'long':
        return longBack(ctx, h, g.h * 0.86, 0.6);
      case 'wavy':
        return longBack(ctx, h, g.h * 0.8, 1.8);
      case 'mullet': {
        ctx.beginPath();
        ctx.moveTo(-hw * 0.2, top + 3);
        ctx.quadraticCurveTo(-hw * 1.1, top + 4, -hw * 1.05 - s * 0.6, top + g.h * 0.5);
        ctx.lineTo(-hw * 0.85 - s * 0.8, top + g.h * 0.58);
        ctx.lineTo(-hw * 0.7 - s * 0.5, top + g.h * 0.5);
        ctx.lineTo(-hw * 0.55 - s * 0.6, top + g.h * 0.6);
        ctx.lineTo(-hw * 0.2, top + g.h * 0.4);
        ctx.closePath();
        fs(ctx, hairFill(ctx, h, -hw, top, 0, top + g.h * 0.6), 1.4);
        return;
      }
      case 'bob': {
        ctx.beginPath();
        ctx.moveTo(hw * 0.5, top + 2);
        ctx.bezierCurveTo(-hw * 0.6, top - 6, -hw * 1.35 - s * 0.3, top + 4, -hw * 1.12 - s * 0.6, top + g.h * 0.52);
        ctx.quadraticCurveTo(-hw * 0.6, top + g.h * 0.62, hw * 0.2, top + g.h * 0.5);
        ctx.closePath();
        fs(ctx, hairFill(ctx, h, -hw, top, 0, top + g.h * 0.6), 1.4);
        return;
      }
      case 'afro': {
        if (h.covered) {
          ell(ctx, -1, top + 8, hw * 1.2, hw * 0.75);
          fs(ctx, h.tones.hair, 1.4);
          return;
        }
        const cx = -1 + s * -0.15;
        const cy = top + 4 + h.bounce * 0.4;
        const R = hw * 1.18;
        ctx.beginPath();
        const n = 16;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const r = R + Math.sin(i * 2.3) * 0.8 + 1.2 * (i % 2);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r * 0.86;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.quadraticCurveTo(cx + Math.cos(a - 0.2) * (r + 2.4), cy + Math.sin(a - 0.2) * (r + 2.4) * 0.86, x, y);
        }
        const gr = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.4, 1, cx, cy, R * 1.2);
        gr.addColorStop(0, h.tones.hairLight);
        gr.addColorStop(0.5, h.tones.hair);
        gr.addColorStop(1, h.tones.hairDark);
        fs(ctx, gr, 1.5);
        for (let i = 0; i < 10; i++) {
          const a = i * 2.4;
          circ(ctx, cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.45 - 3, 0.7);
          ctx.fillStyle = h.tones.hairLight;
          ctx.fill();
        }
        return;
      }
      case 'ponytail':
        return tail(ctx, h, -hw * 0.72, top + 4 + h.bounce * 0.3, -6 - s * 1.4, g.h * 0.55, 5.2, '#ff86bf');
      case 'pigtails':
        tail(ctx, h, -hw * 0.7, top + 5, -8 - s * 1.2, g.h * 0.38, 4, '#14b8a6');
        return;
      case 'braids':
        braid(ctx, h, -hw * 0.72, top + 8, g.h * 0.66, 3 + s * 1.3);
        return;
      case 'locs': {
        for (let i = 0; i < 5; i++) {
          const x0 = -hw * 0.95 + i * 3.2;
          ctx.beginPath();
          ctx.moveTo(x0, top + 5);
          ctx.quadraticCurveTo(x0 - 2 - s * 0.6, top + g.h * 0.35, x0 - 1 - s * (1.1 - i * 0.12), top + g.h * (0.62 - i * 0.04));
          ctx.lineCap = 'round';
          ctx.strokeStyle = INK;
          ctx.lineWidth = 4.4;
          ctx.stroke();
          ctx.strokeStyle = i % 2 ? h.tones.hair : h.tones.hairLight;
          ctx.lineWidth = 2.6;
          ctx.stroke();
        }
        return;
      }
      default:
        return;
    }
  }

  // ---- front layer
  const vol = !h.covered;
  switch (id) {
    case 'tuft':
      if (vol) {
        ctx.beginPath();
        ctx.moveTo(-2, top + 1.5);
        ctx.quadraticCurveTo(-4 - s * 0.3, top - 6, 1 - s * 0.6, top - 8);
        ctx.quadraticCurveTo(-1, top - 4, 2.5, top - 5.5);
        ctx.quadraticCurveTo(1.2, top - 1, 2.5, top + 1.5);
        ctx.closePath();
        fs(ctx, hairFill(ctx, h, -3, top - 8, 3, top + 2), 1.3);
      }
      return;
    case 'long':
    case 'wavy':
      cap(ctx, h, lerpPts([[-1.2, 15], [-0.5, 8], [0.05, 2.5], [0.35, 5.5], [0.8, 3.8], [1.2, 8]]), id === 'wavy' ? 0.6 : 0);
      // Front lock framing the face.
      ctx.beginPath();
      ctx.moveTo(hw * 0.78, top + 4);
      ctx.quadraticCurveTo(hw * 1.12 - s * 0.3, top + g.h * 0.35, hw * 0.98 - s * 0.6, top + g.h * 0.58);
      ctx.quadraticCurveTo(hw * 0.92, top + g.h * 0.4, hw * 0.62, top + 6);
      ctx.closePath();
      fs(ctx, h.tones.hair, 1.2);
      return;
    case 'ponytail':
      cap(ctx, h, lerpPts([[-1.2, 9], [-0.4, 5], [0.2, 3], [1.2, 6]]));
      return;
    case 'braids':
      cap(ctx, h, lerpPts([[-1.2, 9], [0, 3.2], [0.15, 1.5], [0.3, 3.2], [1.2, 8]]));
      braid(ctx, h, -hw * 0.45, top + 9, g.h * 0.56, 1 + s * 0.9);
      return;
    case 'pigtails':
      cap(ctx, h, lerpPts([[-1.2, 8], [-0.2, 4], [0.5, 3.2], [1.2, 6]]));
      tail(ctx, h, hw * 0.55, top + 3.5, 6 - s * 0.9, g.h * 0.34, 4, '#14b8a6');
      return;
    case 'curls':
      cap(ctx, h, lerpPts([[-1.2, 10], [0, 4], [1.2, 6]]), 0.9);
      if (vol) {
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + (i / 6) * Math.PI;
          circ(ctx, Math.cos(a) * hw * 0.78, top + 4 + Math.sin(a) * 5.5 + h.bounce * 0.2, 3.4);
          fs(ctx, i % 2 ? h.tones.hair : h.tones.hairLight, 1.1);
        }
      }
      return;
    case 'afro':
      return;
    case 'mohawk':
      cap(ctx, h, lerpPts([[-1.2, 4], [0, 2.5], [1.2, 3]]));
      if (vol) {
        ctx.beginPath();
        ctx.moveTo(-10, top + 2);
        for (let i = 0; i < 5; i++) {
          const x = -10 + i * 4.6;
          ctx.lineTo(x + 1.6 - s * 0.5, top - 9 - (i === 2 ? 2 : 0) + h.bounce * 0.3);
          ctx.lineTo(x + 4.6, top + 1);
        }
        ctx.closePath();
        fs(ctx, hairFill(ctx, h, 0, top - 10, 0, top + 2), 1.3);
      }
      return;
    case 'buns':
      cap(ctx, h, lerpPts([[-1.2, 9], [0.1, 3.6], [0.25, 2], [0.4, 3.6], [1.2, 7]]));
      if (vol) {
        for (const x of [-hw * 0.48, hw * 0.42]) {
          circ(ctx, x, top + 0.5 + h.bounce * 0.2, 5);
          fs(ctx, hairFill(ctx, h, x - 4, top - 4, x + 4, top + 4), 1.3);
          ctx.beginPath();
          ctx.arc(x, top + 0.5, 3, Math.PI * 1.1, Math.PI * 1.8);
          ctx.strokeStyle = h.tones.hairDark;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
      return;
    case 'bob':
      cap(ctx, h, lerpPts([[-1.2, 16], [-0.3, 10], [0.05, 4], [0.95, 4.2], [1.2, 9]]));
      return;
    case 'leafy':
      if (vol) {
        const cols = ['#3fae4b', '#5ccf5f', '#2a8f3c'];
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.5 + Math.sin(h.time * 2 + i) * 0.06;
          ctx.save();
          ctx.translate(Math.cos(a) * 3, top + 2);
          ctx.rotate(a + Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(-4.2, -6, 0, -12 + Math.abs(i - 2));
          ctx.quadraticCurveTo(4.2, -6, 0, 0);
          fs(ctx, id === 'leafy' && h.tones.hair ? mix(h.tones.hair, cols[i % 3]!, 0.25) : cols[i % 3]!, 1.2);
          line(ctx, 0, -1, 0, -9, 'rgba(255,255,255,0.35)', 0.6);
          ctx.restore();
        }
      }
      return;
    case 'spiky':
      cap(ctx, h, lerpPts([[-1.2, 9], [0, 4], [1.2, 5]]));
      if (vol) {
        const spikes: [number, number, number][] = [[-12, -2, -0.9], [-7, -9, -0.5], [-1, -11, -0.15], [5, -10, 0.25], [10, -5, 0.7]];
        for (const [x, y] of spikes) {
          ctx.beginPath();
          ctx.moveTo(x - 4, top + 4);
          ctx.lineTo(x - s * 0.4, top + y + h.bounce * 0.3);
          ctx.lineTo(x + 4, top + 4);
          ctx.closePath();
          fs(ctx, hairFill(ctx, h, x, top + y, x, top + 4), 1.2);
        }
        cap(ctx, h, lerpPts([[-1.2, 9], [0, 4], [1.2, 5]]));
      }
      return;
    case 'sideswept':
      cap(ctx, h, lerpPts([[-1.2, 9], [-0.3, 4.5], [0.4, 2.5], [0.9, 6.5], [1.2, 9]]));
      ctx.beginPath();
      ctx.moveTo(-hw * 0.5, top + 1);
      ctx.bezierCurveTo(0, top - 7 + h.bounce * 0.3, hw * 1.0, top - 2, hw * 1.05 - s * 0.3, top + 6);
      ctx.quadraticCurveTo(hw * 0.4, top + 1, -hw * 0.3, top + 4);
      ctx.closePath();
      fs(ctx, hairFill(ctx, h, 0, top - 6, hw, top + 6), 1.3);
      return;
    case 'mullet':
      cap(ctx, h, lerpPts([[-1.2, 10], [0, 3], [1.2, 4]]));
      return;
    case 'pompadour':
      cap(ctx, h, lerpPts([[-1.2, 8], [0, 3], [1.2, 4]]));
      if (vol) {
        ctx.beginPath();
        ctx.moveTo(-hw * 0.6, top + 2);
        ctx.bezierCurveTo(-hw * 0.4, top - 10, hw * 0.9, top - 14 + h.bounce * 0.5, hw * 1.0 + 2, top - 5);
        ctx.quadraticCurveTo(hw * 0.7, top - 3, hw * 0.75, top + 3);
        ctx.quadraticCurveTo(0, top + 1, -hw * 0.6, top + 2);
        fs(ctx, hairFill(ctx, h, 0, top - 12, 0, top + 3), 1.4);
        ctx.beginPath();
        ctx.moveTo(-hw * 0.3, top - 2);
        ctx.quadraticCurveTo(hw * 0.4, top - 10, hw * 0.95, top - 5);
        ctx.strokeStyle = h.tones.hairLight;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      return;
    case 'bowl':
      cap(ctx, h, lerpPts([[-1.2, 11], [-0.4, 6], [1.2, 5.2]]));
      line(ctx, -hw * 0.2, top + 3, hw * 0.95, top + 4.6, mix(h.tones.hairDark, INK, 0.3), 0.6);
      return;
    case 'topknot':
      cap(ctx, h, lerpPts([[-1.2, 9], [0, 3.2], [1.2, 5]]));
      if (vol) {
        circ(ctx, -1 - s * 0.2, top - 4.5 + h.bounce * 0.3, 4.8);
        fs(ctx, hairFill(ctx, h, -4, top - 9, 3, top - 1), 1.3);
        rr2(ctx, -3.2, top - 1.4, 6, 2.2, '#ff86bf');
      }
      return;
    case 'fringe':
      cap(ctx, h, lerpPts([[-1.2, 11], [-0.3, 7], [0.0, 5.4], [1.2, 5.4]]));
      for (let i = 0; i < 4; i++) line(ctx, 1 + i * 3.2, top + 2.5, 0.5 + i * 3.2, top + 5, h.tones.hairDark, 0.6);
      return;
    case 'locs':
      cap(ctx, h, lerpPts([[-1.2, 9], [0, 3.5], [1.2, 5]]));
      for (let i = 0; i < 2; i++) {
        const x0 = hw * (0.55 + i * 0.25);
        ctx.beginPath();
        ctx.moveTo(x0, top + 4);
        ctx.quadraticCurveTo(x0 + 3 - s * 0.3, top + 9, x0 + 2 - s * 0.6, top + 14 - i * 2);
        ctx.lineCap = 'round';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4.2;
        ctx.stroke();
        ctx.strokeStyle = h.tones.hair;
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
      return;
    case 'emo':
      cap(ctx, h, lerpPts([[-1.2, 9], [-0.2, 4], [1.2, 5]]));
      ctx.beginPath();
      ctx.moveTo(-hw * 0.6, top + 2);
      ctx.bezierCurveTo(hw * 0.1, top - 3, hw * 0.4, top + 4, hw * 0.25 - s * 0.2, top + 14);
      ctx.quadraticCurveTo(-hw * 0.05, top + 8, -hw * 0.4, top + 5);
      ctx.closePath();
      fs(ctx, hairFill(ctx, h, 0, top, 0, top + 14), 1.3);
      return;
    case 'pixie':
      cap(ctx, h, lerpPts([[-1.2, 9], [0, 3.8], [0.6, 3.2], [1.2, 5.5]]), 0.5);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(hw * (0.2 + i * 0.2), top + 1.5);
        ctx.quadraticCurveTo(hw * (0.35 + i * 0.2), top + 3, hw * (0.3 + i * 0.22), top + 5);
        ctx.strokeStyle = h.tones.hairDark;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      return;
    default:
      return;
  }
}

function rr2(ctx: Ctx, x: number, y: number, w: number, hh: number, color: string): void {
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + hh / 2, w / 2, hh / 2, 0, 0, Math.PI * 2);
  fs(ctx, color, 0.9);
}
