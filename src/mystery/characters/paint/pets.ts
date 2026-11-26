/** Pet painters (2D). Origin = pet's ground point, facing +x, ~14 units tall. */
import { circ, ell, fs, INK, line, poly, rr, twinkle, type Ctx } from './util';

function eyes(ctx: Ctx, x: number, y: number, gap: number, r: number, blink: boolean): void {
  for (const dx of [0, gap]) {
    if (blink) {
      line(ctx, x + dx - r, y, x + dx + r, y, INK, 0.9);
      continue;
    }
    circ(ctx, x + dx, y, r);
    ctx.fillStyle = INK;
    ctx.fill();
    circ(ctx, x + dx - r * 0.35, y - r * 0.4, r * 0.38);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}

function shadow(ctx: Ctx, w: number, lift: number): void {
  ell(ctx, 0, 0, w * (1 - Math.min(0.5, lift / 30)), w * 0.3);
  ctx.fillStyle = 'rgba(10,8,20,0.22)';
  ctx.fill();
}

export function paintPet(ctx: Ctx, id: string, time: number): void {
  const blink = time % 3.7 < 0.12;
  switch (id) {
    case 'none':
      return;
    case 'miniberry': {
      const hop = Math.abs(Math.sin(time * 4.5)) * 4;
      shadow(ctx, 5, hop);
      ctx.save();
      ctx.translate(0, -hop);
      const sq = 1 + (hop < 0.6 ? 0.12 : 0);
      ctx.scale(sq, 1 / sq);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-7, -1, -7, -11, 0, -10);
      ctx.bezierCurveTo(7, -11, 7, -1, 0, 0);
      fs(ctx, '#ef4444', 1.1);
      for (const [sx, sy] of [[-3, -6], [1, -7.6], [3.4, -4], [-1, -3]] as const) {
        ell(ctx, sx, sy, 0.45, 0.7);
        ctx.fillStyle = '#ffe9a0';
        ctx.fill();
      }
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.6;
        ell(ctx, Math.cos(a) * 2.4, -10 + Math.sin(a) * 1.4, 2.2, 0.9, a);
        fs(ctx, '#3fae4b', 0.7);
      }
      eyes(ctx, 0.6, -5.2, 2.8, 0.85, blink);
      ctx.restore();
      return;
    }
    case 'drone': {
      const hov = 9 + Math.sin(time * 3) * 1.4;
      shadow(ctx, 5, hov);
      ctx.save();
      ctx.translate(0, -hov);
      ctx.rotate(Math.sin(time * 2) * 0.08);
      line(ctx, -7, -4, 7, -4, INK, 1.2);
      for (const dx of [-7, 7]) {
        ell(ctx, dx, -5, 4 * Math.abs(Math.cos(time * 30 + dx)), 0.8);
        ctx.fillStyle = 'rgba(200,220,255,0.8)';
        ctx.fill();
      }
      rr(ctx, -5, -4, 10, 7, 3);
      fs(ctx, '#e8edf5', 1.1);
      rr(ctx, -3.2, -2.6, 6.8, 3.6, 1.6);
      ctx.fillStyle = '#1c2233';
      ctx.fill();
      for (const dx of [-1.2, 1.8]) {
        circ(ctx, dx, -0.8, 0.75);
        ctx.fillStyle = '#5cf2ff';
        ctx.fill();
      }
      circ(ctx, 0, 3.6, 0.9);
      ctx.fillStyle = Math.sin(time * 6) > 0 ? '#14b8a6' : '#2f6fed';
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'cat': {
      const step = Math.sin(time * 8);
      shadow(ctx, 7, 0);
      const tailA = Math.sin(time * 3) * 0.4;
      ctx.beginPath();
      ctx.moveTo(-5, -5);
      ctx.quadraticCurveTo(-10, -6 + tailA * 4, -9 + tailA * 2, -12);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#f0a640';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      for (const [lx, ph] of [[-3.5, 0], [3, 1]] as const) {
        rr(ctx, lx - 1, -3.5, 2.2, 3.5 + (ph ? step : -step) * 0.4, 1);
        fs(ctx, '#f0a640', 0.8);
      }
      ell(ctx, 0, -5, 6.2, 3.6);
      fs(ctx, '#f0a640', 1.1);
      circ(ctx, 5, -9, 3.8);
      fs(ctx, '#f0a640', 1.1);
      for (const ex of [3, 6.6]) {
        poly(ctx, [[ex - 1.6, -11.6], [ex, -14.6], [ex + 1.4, -11.4]]);
        fs(ctx, '#f0a640', 0.9);
      }
      line(ctx, -2, -7.6, -2, -6, '#c97a35', 0.8);
      line(ctx, 0.5, -7.8, 0.5, -6, '#c97a35', 0.8);
      eyes(ctx, 4.2, -9.4, 2.6, 0.7, blink);
      ell(ctx, 7.6, -8, 0.6, 0.45);
      ctx.fillStyle = '#ff86bf';
      ctx.fill();
      return;
    }
    case 'duckling': {
      const w = Math.sin(time * 9) * 0.12;
      shadow(ctx, 5, 0);
      ctx.save();
      ctx.rotate(w);
      for (const dx of [-1.5, 1.5]) {
        ell(ctx, dx + 1, -0.4, 1.8, 0.8);
        fs(ctx, '#ff9f1c', 0.7);
      }
      ell(ctx, -0.5, -4.4, 5.2, 4);
      fs(ctx, '#ffe066', 1.1);
      circ(ctx, 2.6, -9, 3.4);
      fs(ctx, '#ffe066', 1.1);
      ell(ctx, 6, -8.6, 1.8, 0.9);
      fs(ctx, '#ff9f1c', 0.8);
      ell(ctx, -2, -4.6, 2.6, 1.6, -0.3);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      eyes(ctx, 3.6, -9.8, 0, 0.7, blink);
      line(ctx, 2.5, -12.4, 2, -13.6, INK, 0.8);
      ctx.restore();
      return;
    }
    case 'snail': {
      const stretch = 1 + Math.sin(time * 2) * 0.08;
      shadow(ctx, 7, 0);
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(6 * stretch, 0);
      ctx.quadraticCurveTo(9 * stretch, -0.5, 8 * stretch, -5);
      ctx.quadraticCurveTo(7 * stretch, -7, 5 * stretch, -5);
      ctx.lineTo(-6, -2);
      ctx.closePath();
      fs(ctx, '#b8e1a8', 1.1);
      for (const dx of [6.5, 8.2]) {
        line(ctx, dx * stretch, -6, dx * stretch + 0.8, -9.6, INK, 0.8);
        circ(ctx, dx * stretch + 0.8, -9.8, 0.8);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      circ(ctx, -1.5, -5.4, 5);
      fs(ctx, '#c58a4f', 1.1);
      ctx.beginPath();
      for (let i = 0; i < 30; i++) {
        const a = i * 0.35;
        const r = 4 - i * 0.12;
        const x = -1.5 + Math.cos(a) * r;
        const y = -5.4 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#7a4c2a';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      return;
    }
    case 'cloud': {
      const hov = 10 + Math.sin(time * 1.6) * 1.5;
      shadow(ctx, 5, hov);
      ctx.save();
      ctx.translate(0, -hov);
      const puffs: [number, number, number][] = [[-4, 0, 3.6], [0, -2, 4.4], [4, 0, 3.4], [0, 1, 4]];
      for (const [x, y, r] of puffs) {
        circ(ctx, x, y, r + 1);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      for (const [x, y, r] of puffs) {
        circ(ctx, x, y, r);
        ctx.fillStyle = '#f4f7ff';
        ctx.fill();
      }
      eyes(ctx, -1, -0.6, 3, 0.6, blink);
      ctx.beginPath();
      ctx.arc(0.6, 0.6, 1, 0.2, Math.PI - 0.2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const dy = ((time * 14 + i * 4) % 9) + 4;
        line(ctx, -3 + i * 3, dy, -3.4 + i * 3, dy + 1.4, '#7cc8ff', 0.8);
      }
      ctx.restore();
      return;
    }
    case 'ghosty': {
      const hov = 8 + Math.sin(time * 2.2) * 1.8;
      shadow(ctx, 4, hov);
      ctx.save();
      ctx.translate(0, -hov);
      ctx.globalAlpha *= 0.88;
      ctx.beginPath();
      ctx.moveTo(-5, 3);
      ctx.bezierCurveTo(-6, -9, 6, -9, 5, 3);
      for (let i = 0; i < 4; i++) {
        const x = 5 - (i + 1) * 2.5;
        ctx.quadraticCurveTo(x + 1.25, 5 + Math.sin(time * 6 + i) * 1, x, 3);
      }
      ctx.closePath();
      fs(ctx, '#f4f1ff', 1.1);
      eyes(ctx, -0.6, -2.4, 3, 0.85, blink);
      ell(ctx, 1, 0.6, 0.9, 1.1);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'robodog': {
      const step = Math.sin(time * 10);
      shadow(ctx, 7, 0);
      for (const [lx, ph] of [[-4, 0], [-1.5, 1], [2, 0], [4.5, 1]] as const) {
        rr(ctx, lx - 0.9, -4, 1.8, 4 + (ph ? step : -step) * 0.5, 0.6);
        fs(ctx, '#8b95a9', 0.7);
      }
      line(ctx, -6, -6, -8.5, -9 + Math.sin(time * 12) * 1.5, INK, 1);
      rr(ctx, -6.5, -8, 12, 5, 2.4);
      fs(ctx, '#e8edf5', 1.1);
      rr(ctx, 3, -13, 7, 6, 2.2);
      fs(ctx, '#e8edf5', 1.1);
      poly(ctx, [[3.6, -12.6], [2.6, -16], [5.4, -13]]);
      fs(ctx, '#2f6fed', 0.8);
      rr(ctx, 5.4, -11.6, 4, 2.4, 1);
      ctx.fillStyle = '#1c2233';
      ctx.fill();
      circ(ctx, 6.6, -10.4, 0.6);
      circ(ctx, 8.4, -10.4, 0.6);
      ctx.fillStyle = '#5cf2ff';
      ctx.fill();
      circ(ctx, 0, -5.5, 0.9);
      ctx.fillStyle = '#ff4d6d';
      ctx.fill();
      return;
    }
    case 'frog': {
      const hop = Math.max(0, Math.sin(time * 3.6)) * 5;
      shadow(ctx, 6, hop);
      ctx.save();
      ctx.translate(0, -hop);
      ell(ctx, 0, -4, 6.4, 4.2);
      fs(ctx, '#5ccf5f', 1.1);
      ell(ctx, 1, -2.6, 4, 2);
      ctx.fillStyle = '#c6f5b0';
      ctx.fill();
      for (const dx of [-2.6, 2.6]) {
        circ(ctx, dx + 1, -8.2, 2.3);
        fs(ctx, '#5ccf5f', 1);
        circ(ctx, dx + 1.2, -8.4, 1.1);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(1.4, -5, 2.6, 0.3, Math.PI - 0.3);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'bee': {
      const hx = Math.sin(time * 2.4) * 3;
      const hov = 11 + Math.sin(time * 5) * 1.2;
      shadow(ctx, 3.5, hov);
      ctx.save();
      ctx.translate(hx, -hov);
      for (const dx of [-1.5, 1]) {
        ell(ctx, dx, -4, 2.2, 3.4 * Math.abs(Math.sin(time * 40)) + 0.6, dx * 0.3);
        ctx.fillStyle = 'rgba(220,240,255,0.85)';
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      ell(ctx, 0, 0, 4.6, 3.4);
      fs(ctx, '#ffd23f', 1.1);
      ctx.save();
      ell(ctx, 0, 0, 4.6, 3.4);
      ctx.clip();
      ctx.fillStyle = INK;
      ctx.fillRect(-2, -4, 1.4, 8);
      ctx.fillRect(0.8, -4, 1.4, 8);
      ctx.restore();
      poly(ctx, [[-4.4, 0], [-6.4, 0.4], [-4.4, 1]]);
      ctx.fillStyle = INK;
      ctx.fill();
      eyes(ctx, 2.8, -0.8, 0, 0.6, blink);
      ctx.restore();
      return;
    }
    case 'axolotl': {
      const sw = Math.sin(time * 4);
      shadow(ctx, 7, 0);
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.quadraticCurveTo(-9, -5 + sw * 2, -11, -3 + sw * 3);
      ctx.quadraticCurveTo(-8, -1, -4, -2);
      fs(ctx, '#ffb3cf', 1);
      ell(ctx, 0, -3.6, 5.6, 3.2);
      fs(ctx, '#ffb3cf', 1.1);
      circ(ctx, 4.6, -6.4, 3.8);
      fs(ctx, '#ffb3cf', 1.1);
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI * 0.9 + i * 0.35;
        ctx.beginPath();
        ctx.moveTo(2.4, -7 + i * 1.2);
        ctx.lineTo(2.4 + Math.cos(a) * 4, -7 + i * 1.2 + Math.sin(a) * 2.6 + sw * 0.3);
        ctx.strokeStyle = '#ff5fa2';
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      eyes(ctx, 4, -7, 2.6, 0.6, blink);
      ctx.beginPath();
      ctx.arc(5.4, -5.6, 1.2, 0.3, Math.PI - 0.3);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      return;
    }
    default:
      if (id) twinkle(ctx, 0, -6, 3, '#ffffff');
  }
}
