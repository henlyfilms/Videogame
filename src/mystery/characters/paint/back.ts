/**
 * Back items (2D). `paintBack` draws behind the body; `paintBackStraps`
 * draws the straps that cross the front of the body.
 */
import { mix } from '../shape';
import { circ, ell, fs, INK, line, poly, rr, TAU, type Ctx, type Geo } from './util';

export interface BackCtx {
  g: Geo;
  time: number;
  moving: boolean;
  /** Trailing sway (units, + = backwards). */
  sway: number;
}

export function paintBack(ctx: Ctx, id: string, b: BackCtx): void {
  const { g, time } = b;
  const hw = g.w / 2;
  const sy = g.sy;
  const bx = -hw + 2;
  switch (id) {
    case 'none':
      return;
    case 'backpack': {
      rr(ctx, bx - 8, sy - 6, 11, 15, 4);
      const gr = ctx.createLinearGradient(bx - 8, 0, bx + 3, 0);
      gr.addColorStop(0, '#f08a3c');
      gr.addColorStop(1, '#c45f1a');
      fs(ctx, gr, 1.3);
      rr(ctx, bx - 9, sy + 1, 7, 7, 2.5);
      fs(ctx, '#ffb46b', 1.1);
      line(ctx, bx - 8.4, sy - 1, bx + 2, sy - 1, '#8a3f10', 1);
      return;
    }
    case 'jetpack': {
      for (const [i, dx] of [[0, -9], [1, -4.6]] as const) {
        rr(ctx, bx + dx, sy - 7, 5, 15, 2.4);
        const gr = ctx.createLinearGradient(bx + dx, 0, bx + dx + 5, 0);
        gr.addColorStop(0, '#e8edf5');
        gr.addColorStop(1, '#8b95a9');
        fs(ctx, gr, 1.2);
        rr(ctx, bx + dx + 0.5, sy - 7, 4, 3, 1.5);
        fs(ctx, '#e8484f', 0.9);
        const f = (b.moving ? 7 : 3.5) + Math.sin(time * 30 + i * 2) * 1.6;
        poly(ctx, [[bx + dx + 0.6, sy + 8], [bx + dx + 2.5, sy + 8 + f], [bx + dx + 4.4, sy + 8]]);
        ctx.fillStyle = '#ffb347';
        ctx.fill();
        poly(ctx, [[bx + dx + 1.5, sy + 8], [bx + dx + 2.5, sy + 8 + f * 0.6], [bx + dx + 3.5, sy + 8]]);
        ctx.fillStyle = '#fff3a3';
        ctx.fill();
      }
      return;
    }
    case 'wings':
    case 'fairywings': {
      const flap = Math.sin(time * (b.moving ? 9 : 3)) * 0.25;
      const fairy = id === 'fairywings';
      for (const [k, off] of [[0.8, 0.35], [1, 0]] as const) {
        ctx.save();
        ctx.translate(bx + 1, sy - 3);
        ctx.rotate(-0.25 - flap * k - off);
        ctx.beginPath();
        if (fairy) {
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-6, -16 * k, -18 * k, -14 * k, -14 * k, -3);
          ctx.bezierCurveTo(-12 * k, 2, -6, 2, 0, 0);
          ctx.moveTo(0, 1);
          ctx.bezierCurveTo(-10 * k, 4, -12 * k, 12 * k, -5, 10 * k);
          ctx.closePath();
          const gr = ctx.createLinearGradient(0, -14, -14, 6);
          gr.addColorStop(0, 'rgba(160,240,255,0.75)');
          gr.addColorStop(1, 'rgba(255,170,240,0.75)');
          fs(ctx, gr, 1.1);
        } else {
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-4, -12 * k, -16 * k, -16 * k, -20 * k, -8 * k);
          ctx.quadraticCurveTo(-15 * k, -6 * k, -17 * k, -2 * k);
          ctx.quadraticCurveTo(-12 * k, -1 * k, -13 * k, 3 * k);
          ctx.quadraticCurveTo(-8 * k, 2 * k, -7 * k, 6 * k);
          ctx.quadraticCurveTo(-3, 4, 0, 0);
          fs(ctx, k < 1 ? '#e6ebf5' : '#ffffff', 1.2);
        }
        ctx.restore();
      }
      return;
    }
    case 'guitar': {
      ctx.save();
      ctx.translate(bx - 2, sy + 4);
      ctx.rotate(-0.55);
      rr(ctx, -1.4, -26, 2.8, 22, 1);
      fs(ctx, '#5a3d22', 1.1);
      rr(ctx, -2.2, -30, 4.4, 5, 1.2);
      fs(ctx, '#2b1d14', 1);
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 5, 0, 0, TAU);
      ctx.ellipse(0, -6, 4.6, 4, 0, 0, TAU);
      fs(ctx, '#e0a100', 1.2);
      circ(ctx, 0, -3.4, 1.6);
      ctx.fillStyle = '#2b1d14';
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'cape': {
      const s = b.sway;
      const flutter = Math.sin(time * (b.moving ? 12 : 2.5)) * (b.moving ? 1.6 : 0.6);
      ctx.beginPath();
      ctx.moveTo(-hw * 0.2, g.neck - 1);
      ctx.quadraticCurveTo(-hw * 1.2, g.neck, -hw * 1.1 - s * 2.2, -1 + flutter);
      ctx.lineTo(-hw * 0.7 - s * 1.6, 1 - flutter * 0.5);
      ctx.lineTo(-hw * 0.3 - s * 1.2, -0.5 + flutter * 0.5);
      ctx.lineTo(hw * 0.2, -1);
      ctx.closePath();
      const gr = ctx.createLinearGradient(-hw, g.neck, 0, 0);
      gr.addColorStop(0, '#e23d4b');
      gr.addColorStop(1, '#8f1a2a');
      fs(ctx, gr, 1.4);
      return;
    }
    case 'quiver': {
      ctx.save();
      ctx.translate(bx - 3, sy + 3);
      ctx.rotate(-0.35);
      // Scrolls + quills poking out.
      for (const [dx, col] of [[-2.2, '#f6efe3'], [0.6, '#fff8e8']] as const) {
        rr(ctx, dx, -21, 2.6, 8, 1.2);
        fs(ctx, col, 0.9);
      }
      ctx.beginPath();
      ctx.moveTo(2.4, -14);
      ctx.quadraticCurveTo(6, -24, 3.2, -29);
      ctx.quadraticCurveTo(2.6, -22, 2.4, -14);
      fs(ctx, '#6ea1ff', 0.9);
      ctx.beginPath();
      ctx.moveTo(-0.8, -14);
      ctx.quadraticCurveTo(-5, -22, -2.4, -27);
      ctx.quadraticCurveTo(-0.6, -21, -0.8, -14);
      fs(ctx, '#14b8a6', 0.9);
      rr(ctx, -4, -15, 8, 17, 3);
      fs(ctx, '#7a4c2a', 1.2);
      line(ctx, -4, -10, 4, -10, GOLDISH, 1.2);
      line(ctx, -4, -2, 4, -2, GOLDISH, 1.2);
      ctx.restore();
      return;
    }
    case 'scuba': {
      rr(ctx, bx - 7.5, sy - 8, 7, 18, 3.5);
      const gr = ctx.createLinearGradient(bx - 7.5, 0, bx - 0.5, 0);
      gr.addColorStop(0, '#ffe066');
      gr.addColorStop(1, '#e0a100');
      fs(ctx, gr, 1.2);
      rr(ctx, bx - 5.4, sy - 11, 3, 3.4, 1);
      fs(ctx, '#9aa3b8', 1);
      line(ctx, bx - 4, sy - 11, bx + 1, sy - 13, INK, 1.2);
      return;
    }
    case 'balloon': {
      const bob = Math.sin(time * 1.7) * 1.4;
      const tx = -hw - 5 - b.sway * 1.5;
      const ty = g.top - 12 + bob;
      ctx.beginPath();
      ctx.moveTo(bx, sy);
      ctx.bezierCurveTo(bx - 4, sy - 8, tx + 3, ty + 14, tx, ty + 8);
      ctx.strokeStyle = '#6c7487';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ell(ctx, tx, ty, 6, 7);
      const gr = ctx.createRadialGradient(tx - 2, ty - 3, 0.5, tx, ty, 8);
      gr.addColorStop(0, '#ff9fb0');
      gr.addColorStop(1, '#e8484f');
      fs(ctx, gr, 1.2);
      poly(ctx, [[tx - 1.2, ty + 7.6], [tx + 1.2, ty + 7.6], [tx, ty + 6.4]]);
      fs(ctx, '#c22f3c', 0.8);
      ell(ctx, tx - 2.2, ty - 3, 1.2, 2, -0.4);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
      return;
    }
    case 'shell': {
      const cx = bx - 3;
      const cy = sy + 1;
      circ(ctx, cx, cy, 8.5);
      const gr = ctx.createRadialGradient(cx - 2, cy - 3, 1, cx, cy, 9);
      gr.addColorStop(0, '#ffd8a8');
      gr.addColorStop(1, '#c0763a');
      fs(ctx, gr, 1.3);
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = i * 0.3;
        const r = 7.5 - i * 0.17;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#8a4a1c';
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
    case 'teddy': {
      const tx = bx - 3;
      const ty = g.sy - 5;
      rr(ctx, tx - 6, ty + 2, 10, 12, 3);
      fs(ctx, '#2f6fed', 1.2);
      for (const dx of [-4, 3]) {
        circ(ctx, tx + dx, ty - 5, 2.2);
        fs(ctx, '#b07a55', 1.1);
      }
      circ(ctx, tx - 0.5, ty, 5.2);
      fs(ctx, '#c08a5f', 1.2);
      ell(ctx, tx + 1.2, ty + 1.6, 2.2, 1.6);
      fs(ctx, '#f1d3b0', 0.7);
      circ(ctx, tx + 1.6, ty + 1, 0.7);
      ctx.fillStyle = INK;
      ctx.fill();
      circ(ctx, tx - 1.6, ty - 1.4, 0.7);
      circ(ctx, tx + 2.6, ty - 1.4, 0.7);
      ctx.fill();
      return;
    }
    case 'surfboard': {
      ctx.save();
      ctx.translate(bx - 3, sy - 2);
      ctx.rotate(-0.28);
      ell(ctx, 0, -4, 4.4, 19);
      const gr = ctx.createLinearGradient(-4, 0, 4, 0);
      gr.addColorStop(0, '#5cf2ff');
      gr.addColorStop(1, '#14b8a6');
      fs(ctx, gr, 1.2);
      line(ctx, 0, -22, 0, 14, '#ffffff', 1.4);
      line(ctx, -2.5, -4, 2.5, -4, '#ff7a59', 1.6);
      ctx.restore();
      return;
    }
    default:
      return;
  }
}

const GOLDISH = '#ffcc3d';

/** Straps crossing the body (drawn after the body). */
export function paintBackStraps(ctx: Ctx, id: string, g: Geo): void {
  const hw = g.w / 2;
  const strap = id === 'backpack' ? '#8a3f10' : id === 'jetpack' || id === 'scuba' ? '#3a4256' : id === 'quiver' ? '#5a3d22' : id === 'guitar' ? '#2b1d14' : id === 'teddy' ? '#1a43a6' : null;
  if (!strap) return;
  ctx.beginPath();
  if (id === 'guitar' || id === 'quiver') {
    ctx.moveTo(-hw * 0.6, g.neck - 3);
    ctx.quadraticCurveTo(g.fx, g.neck + 2, hw * 0.85, g.bottom - 1);
  } else {
    ctx.moveTo(-hw * 0.3, g.sy - 2.5);
    ctx.quadraticCurveTo(hw * 0.5, g.sy - 1.5, hw * 0.55, g.bottom - 1.5);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.strokeStyle = mix(strap, '#ffffff', 0.08);
  ctx.lineWidth = 1.7;
  ctx.stroke();
}
