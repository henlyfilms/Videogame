/**
 * Hat painters. Origin = top of the head, facing +x, for a standard head
 * (~33 units wide). y grows downward; the head surface is at y ≈ 0 in the
 * middle and curves down to y ≈ 8 at x = ±14.
 */
import { mix } from '../shape';
import { circ, ell, fs, GOLD, GOLD_DARK, heart, INK, LEAF, LEAF_DARK, line, poly, rr, star, TAU, twinkle, type Ctx, type Tones } from './util';

function dome(ctx: Ctx, w: number, h: number, base = 5): void {
  ctx.beginPath();
  ctx.moveTo(-w, base);
  ctx.bezierCurveTo(-w, base - h * 1.25, w, base - h * 1.25, w, base);
  ctx.quadraticCurveTo(0, base + 2.4, -w, base);
  ctx.closePath();
}

function shadeDome(ctx: Ctx, w: number, h: number, color: string, base = 5): void {
  dome(ctx, w, h, base);
  const g = ctx.createLinearGradient(-w, base - h, w * 0.6, base);
  g.addColorStop(0, mix(color, '#ffffff', 0.28));
  g.addColorStop(0.55, color);
  g.addColorStop(1, mix(color, '#120c1c', 0.25));
  fs(ctx, g, 1.4);
}

export function paintHat(ctx: Ctx, id: string, time: number, tones: Tones): void {
  switch (id) {
    case 'none':
      return;
    case 'beanie': {
      shadeDome(ctx, 14.5, 12, '#e8484f', 4);
      rr(ctx, -15.5, 0.5, 31, 6.4, 3);
      fs(ctx, '#c22f3c', 1.3);
      ctx.save();
      rr(ctx, -15.5, 0.5, 31, 6.4, 3);
      ctx.clip();
      for (let x = -14; x < 16; x += 2.6) line(ctx, x, 1, x, 7, 'rgba(0,0,0,0.18)', 0.8);
      ctx.restore();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        circ(ctx, Math.cos(a) * 2.6, -11 + Math.sin(a) * 2.6, 2.6);
        fs(ctx, '#fff3dc', 0);
      }
      circ(ctx, 0, -11, 4.2);
      fs(ctx, '#fff3dc', 1.2);
      circ(ctx, -1.2, -12.2, 1.4);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      return;
    }
    case 'cap':
    case 'backcap': {
      const d = id === 'cap' ? 1 : -1;
      ell(ctx, d * 15, 3.5, 10.5, 2.8, d * 0.08);
      fs(ctx, '#1a43a6', 1.3);
      shadeDome(ctx, 14.6, 11.5, '#2f6fed', 4.5);
      line(ctx, 0, -9, d * 3, 4, 'rgba(0,0,0,0.2)', 0.8);
      circ(ctx, 0, -9.6, 1.6);
      fs(ctx, '#1a43a6', 1);
      circ(ctx, d * 6, -2.5, 3);
      fs(ctx, '#ffffff', 1);
      circ(ctx, d * 6, -2.3, 1.7);
      ctx.fillStyle = '#14b8a6';
      ctx.fill();
      if (id === 'backcap') {
        rr(ctx, 7, -1.5, 5, 3.2, 1.6);
        fs(ctx, '#1a43a6', 0.9);
      }
      return;
    }
    case 'tophat': {
      ell(ctx, 0, 3.6, 17.5, 3.6);
      fs(ctx, '#232633', 1.4);
      ctx.beginPath();
      ctx.moveTo(-10.5, 3);
      ctx.lineTo(-11.5, -19);
      ctx.quadraticCurveTo(0, -21.5, 11.5, -19);
      ctx.lineTo(10.5, 3);
      ctx.quadraticCurveTo(0, 5, -10.5, 3);
      const g = ctx.createLinearGradient(-11, 0, 11, 0);
      g.addColorStop(0, '#454a5e');
      g.addColorStop(0.35, '#2b2f3f');
      g.addColorStop(1, '#171923');
      fs(ctx, g, 1.4);
      ctx.beginPath();
      ctx.moveTo(-10.8, -3);
      ctx.lineTo(10.8, -3);
      ctx.lineTo(10.6, 1.8);
      ctx.quadraticCurveTo(0, 3.6, -10.6, 1.8);
      ctx.closePath();
      fs(ctx, '#e23d4b', 1);
      line(ctx, -7, -17, -7.5, -5, 'rgba(255,255,255,0.22)', 2);
      return;
    }
    case 'crown':
    case 'gemcrown':
    case 'tiara': {
      const metal = id === 'gemcrown' ? '#d7dfee' : id === 'tiara' ? '#e9ecf5' : GOLD;
      const metalDark = id === 'gemcrown' ? '#7d8aa6' : id === 'tiara' ? '#9aa3b8' : GOLD_DARK;
      if (id === 'tiara') {
        ctx.beginPath();
        ctx.moveTo(-12, 4);
        ctx.quadraticCurveTo(-6, -3, -3, -2);
        ctx.quadraticCurveTo(0, -9, 3, -2);
        ctx.quadraticCurveTo(6, -3, 12, 4);
        ctx.quadraticCurveTo(0, 0.5, -12, 4);
        fs(ctx, metal, 1.2);
        heart(ctx, 0, -3.4, 2.2);
        fs(ctx, '#ff6fae', 0.9);
        twinkle(ctx, 6 + Math.sin(time * 3) * 0.5, -6, 2 + Math.sin(time * 5) * 0.6, '#ffffff');
        return;
      }
      const pts: [number, number][] = [[-12, 4], [-13, -8], [-7, -2], [-3.5, -11], [0, -3], [3.5, -11], [7, -2], [13, -8], [12, 4]];
      if (id === 'gemcrown') {
        pts.splice(0, pts.length, [-12, 4], [-12.5, -6], [-7.5, -1.5], [-4, -9], [0, -14], [4, -9], [7.5, -1.5], [12.5, -6], [12, 4]);
      }
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.quadraticCurveTo(0, 6.5, -12, 4);
      const g = ctx.createLinearGradient(-12, -10, 12, 4);
      g.addColorStop(0, mix(metal, '#ffffff', 0.5));
      g.addColorStop(0.5, metal);
      g.addColorStop(1, metalDark);
      fs(ctx, g, 1.4);
      rr(ctx, -12, 0, 24, 3.6, 1.6);
      fs(ctx, metalDark, 1);
      for (const [x, y] of pts.slice(1, -1).filter((_, i) => i % 2 === 0)) {
        circ(ctx, x, y - 0.6, 1.5);
        fs(ctx, id === 'gemcrown' ? '#9ee7ff' : '#fff2b0', 0.9);
      }
      if (id === 'gemcrown') {
        poly(ctx, [[0, -10], [4.6, -5], [2.4, 1.6], [-2.4, 1.6], [-4.6, -5]]);
        const gg = ctx.createLinearGradient(-4, -10, 4, 2);
        gg.addColorStop(0, '#c9f2ff');
        gg.addColorStop(0.5, '#6ea1ff');
        gg.addColorStop(1, '#2f3fbf');
        fs(ctx, gg, 1.2);
        line(ctx, -4.6, -5, 4.6, -5, 'rgba(255,255,255,0.6)', 0.6);
        line(ctx, 0, -10, -1.2, 1.6, 'rgba(255,255,255,0.45)', 0.6);
        twinkle(ctx, -1.5, -6.5, 1.6 + Math.sin(time * 4) * 0.5, '#ffffff');
      } else {
        circ(ctx, 0, 1.8, 1.7);
        fs(ctx, '#e8484f', 0.9);
        circ(ctx, -7, 1.8, 1.3);
        fs(ctx, '#2f6fed', 0.8);
        circ(ctx, 7, 1.8, 1.3);
        fs(ctx, '#1f8a4c', 0.8);
      }
      return;
    }
    case 'cowboy': {
      ctx.beginPath();
      ctx.moveTo(-22, -2);
      ctx.quadraticCurveTo(-18, 6, 0, 5.5);
      ctx.quadraticCurveTo(18, 6, 22, -2);
      ctx.quadraticCurveTo(19, 3, 0, 1.5);
      ctx.quadraticCurveTo(-19, 3, -22, -2);
      fs(ctx, '#a86b3a', 1.4);
      ctx.beginPath();
      ctx.moveTo(-10, 2.5);
      ctx.bezierCurveTo(-12, -10, -8, -14, -3, -12);
      ctx.quadraticCurveTo(0, -9.5, 3, -12);
      ctx.bezierCurveTo(8, -14, 12, -10, 10, 2.5);
      ctx.quadraticCurveTo(0, 4, -10, 2.5);
      const g = ctx.createLinearGradient(-10, -12, 10, 2);
      g.addColorStop(0, '#d9a066');
      g.addColorStop(1, '#a86b3a');
      fs(ctx, g, 1.4);
      ctx.beginPath();
      ctx.moveTo(-10.4, -1);
      ctx.quadraticCurveTo(0, 1, 10.4, -1);
      ctx.lineTo(10.2, 1.8);
      ctx.quadraticCurveTo(0, 3.8, -10.2, 1.8);
      ctx.closePath();
      fs(ctx, '#5a3d22', 0.9);
      star(ctx, 5, 0.6, 1.6);
      fs(ctx, GOLD, 0.6);
      return;
    }
    case 'chef': {
      rr(ctx, -11, -3, 22, 8, 2.5);
      fs(ctx, '#f7f8fb', 1.3);
      line(ctx, -10, 1, 10, 1, '#dfe4ee', 0.8);
      for (const [x, y, r] of [[-7.5, -9, 6.8], [7.5, -9, 6.8], [0, -13, 8]] as const) {
        circ(ctx, x, y, r);
        fs(ctx, '#ffffff', 1.3);
      }
      circ(ctx, 0, -13, 7.2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-7.5, -9, 5, Math.PI * 0.6, Math.PI * 1.1);
      ctx.strokeStyle = '#dfe4ee';
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
    case 'party': {
      ctx.save();
      ctx.rotate(0.18);
      poly(ctx, [[-9, 3], [9, 3], [1, -21]]);
      fs(ctx, '#ff86bf', 1.3);
      ctx.save();
      poly(ctx, [[-9, 3], [9, 3], [1, -21]]);
      ctx.clip();
      const cols = ['#ffd257', '#2f6fed', '#14b8a6'];
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(-12, -2 - i * 4.5);
        ctx.lineTo(12, -6 - i * 4.5);
        ctx.lineWidth = 2.1;
        ctx.strokeStyle = cols[i % 3]!;
        ctx.stroke();
      }
      ctx.restore();
      poly(ctx, [[-9, 3], [9, 3], [1, -21]]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      circ(ctx, 1, -22, 2.8);
      fs(ctx, '#ffd257', 1.1);
      ctx.restore();
      return;
    }
    case 'headphones': {
      ctx.beginPath();
      ctx.moveTo(-12.5, 9);
      ctx.bezierCurveTo(-13, -6, 10, -7, 11.5, 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4.6;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#3a4256';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      rr(ctx, -17, 6, 8, 11, 3.5);
      fs(ctx, '#2f6fed', 1.3);
      rr(ctx, -15.2, 7.5, 4.4, 8, 2);
      ctx.fillStyle = '#14b8a6';
      ctx.fill();
      line(ctx, -15.6, 9, -15.2, 13, 'rgba(255,255,255,0.5)', 0.9);
      return;
    }
    case 'halo': {
      const y = -7 + Math.sin(time * 2.4) * 1.3;
      ell(ctx, 0, y, 11, 3.4);
      ctx.strokeStyle = 'rgba(255,220,90,0.35)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ell(ctx, 0, y - 0.4, 10, 2.6);
      ctx.strokeStyle = '#fff6c9';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      return;
    }
    case 'flowercrown': {
      const cols = ['#ff86bf', '#ffd257', '#ffffff', '#c084fc', '#ff7a59'];
      for (let i = 0; i < 7; i++) {
        const x = -12 + i * 4;
        const y = 4.5 - Math.sin((i / 6) * Math.PI) * 5.2;
        ell(ctx, x + 2, y + 0.6, 2.2, 1, 0.6);
        fs(ctx, LEAF, 0.7);
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * TAU + i;
          circ(ctx, x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5, 1.35);
          fs(ctx, cols[i % cols.length]!, 0.6);
        }
        circ(ctx, x, y, 0.9);
        ctx.fillStyle = i % 2 ? '#ff9f1c' : '#ffe066';
        ctx.fill();
      }
      return;
    }
    case 'cloud': {
      const bob = Math.sin(time * 1.8) * 1;
      ctx.save();
      ctx.translate(0, bob - 1);
      const puffs: [number, number, number][] = [[-10, 1, 6], [-4, -5, 7.5], [4, -6, 8], [11, 0, 6], [0, 1.5, 8]];
      for (const [x, y, r] of puffs) {
        circ(ctx, x, y, r + 1.2);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      for (const [x, y, r] of puffs) {
        circ(ctx, x, y, r);
        ctx.fillStyle = '#eef3ff';
        ctx.fill();
      }
      for (const [x, y, r] of puffs) {
        circ(ctx, x - r * 0.25, y - r * 0.3, r * 0.55);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(2, 0, 1.2, 0.1, Math.PI - 0.1);
      ctx.moveTo(8.2, 0);
      ctx.arc(7, 0, 1.2, 0.1, Math.PI - 0.1);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ell(ctx, 4.5, 2.8, 1, 0.6);
      ctx.fillStyle = '#ff9fbf';
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'propeller': {
      dome(ctx, 14.2, 11, 4.5);
      ctx.save();
      ctx.clip();
      const cols = ['#e8484f', '#ffd257', '#2f6fed', '#1f8a4c'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = cols[i]!;
        ctx.fillRect(-15 + i * 7.5, -12, 7.6, 18);
      }
      ctx.restore();
      dome(ctx, 14.2, 11, 4.5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ell(ctx, 13, 4, 6, 1.8);
      fs(ctx, '#2f6fed', 1.1);
      line(ctx, 0, -8.5, 0, -12.5, INK, 1.4);
      const spin = Math.cos(time * 26);
      ell(ctx, 0, -13, 10 * Math.abs(spin) + 1, 1.6);
      fs(ctx, spin > 0 ? '#ff7a59' : '#ffd257', 1.1);
      ell(ctx, 0, -13, 11, 1.2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      circ(ctx, 0, -13, 1.4);
      fs(ctx, '#e8484f', 0.9);
      return;
    }
    case 'deerstalker': {
      ell(ctx, 13, 3, 6.6, 2.2, 0.12);
      fs(ctx, '#8a6a43', 1.2);
      ell(ctx, -13, 3, 6.6, 2.2, -0.12);
      fs(ctx, '#8a6a43', 1.2);
      shadeDome(ctx, 14, 11, '#a5845a', 4);
      ctx.save();
      dome(ctx, 14, 11, 4);
      ctx.clip();
      for (let x = -14; x < 15; x += 3.4) line(ctx, x, -12, x, 6, 'rgba(90,50,20,0.35)', 0.8);
      for (let y = -10; y < 6; y += 3.4) line(ctx, -15, y, 15, y, 'rgba(90,50,20,0.35)', 0.8);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-2, -8.5);
      ctx.quadraticCurveTo(-5, -12, -3, -13);
      ctx.moveTo(2, -8.5);
      ctx.quadraticCurveTo(5, -12, 3, -13);
      ctx.strokeStyle = '#5a3d22';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      circ(ctx, 0, -8.6, 1.4);
      fs(ctx, '#5a3d22', 0.8);
      return;
    }
    case 'wizard': {
      ell(ctx, 0, 3.6, 17.5, 3.8);
      fs(ctx, '#3b2a8a', 1.4);
      ctx.beginPath();
      ctx.moveTo(-11, 3);
      ctx.bezierCurveTo(-8, -10, -6, -22, -16 + Math.sin(time * 1.5) * 1.2, -27);
      ctx.bezierCurveTo(-2, -24, 6, -10, 11, 3);
      ctx.quadraticCurveTo(0, 5, -11, 3);
      const g = ctx.createLinearGradient(-10, -20, 10, 3);
      g.addColorStop(0, '#7a5cff');
      g.addColorStop(1, '#3b2a8a');
      fs(ctx, g, 1.4);
      ctx.beginPath();
      ctx.moveTo(-10.4, 0.3);
      ctx.quadraticCurveTo(0, 2.2, 10.4, 0.3);
      ctx.lineTo(10.8, 2.8);
      ctx.quadraticCurveTo(0, 5, -10.8, 2.8);
      ctx.closePath();
      fs(ctx, GOLD, 0.9);
      star(ctx, 1.5, -8, 2.2);
      fs(ctx, '#ffe66e', 0.7);
      star(ctx, -4.5, -15, 1.4);
      fs(ctx, '#ffe66e', 0.6);
      circ(ctx, 5, -3.5, 0.9);
      ctx.fillStyle = '#ffe66e';
      ctx.fill();
      return;
    }
    case 'bucket': {
      ctx.beginPath();
      ctx.moveTo(-17, 6);
      ctx.lineTo(-11, -4);
      ctx.quadraticCurveTo(-10, -10, 0, -10);
      ctx.quadraticCurveTo(10, -10, 11, -4);
      ctx.lineTo(17, 6);
      ctx.quadraticCurveTo(0, 9.5, -17, 6);
      const g = ctx.createLinearGradient(0, -10, 0, 8);
      g.addColorStop(0, '#f2e6c4');
      g.addColorStop(1, '#cdbb8d');
      fs(ctx, g, 1.4);
      ctx.beginPath();
      ctx.moveTo(-11.5, -2.5);
      ctx.quadraticCurveTo(0, 0, 11.5, -2.5);
      ctx.strokeStyle = 'rgba(90,70,30,0.5)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-15, 4.5);
      ctx.quadraticCurveTo(0, 7.5, 15, 4.5);
      ctx.setLineDash([1.4, 1.2]);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    case 'beret': {
      ctx.save();
      ctx.translate(-1, 0.5);
      ctx.rotate(-0.22);
      ell(ctx, 0, -1.5, 15.5, 6.4);
      const g = ctx.createRadialGradient(-4, -4, 1, 0, -1, 15);
      g.addColorStop(0, '#ff6b7a');
      g.addColorStop(1, '#b3123a');
      fs(ctx, g, 1.4);
      line(ctx, 0, -7.6, 0.6, -10, INK, 1.8);
      ctx.restore();
      return;
    }
    case 'viking': {
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(d * 11, -1);
        ctx.quadraticCurveTo(d * 20, -2, d * 19, -14);
        ctx.quadraticCurveTo(d * 16, -6, d * 9.5, -5);
        ctx.closePath();
        fs(ctx, '#fff1d6', 1.3);
        line(ctx, d * 15, -3.5, d * 16.5, -5.5, 'rgba(120,90,50,0.4)', 0.8);
      }
      shadeDome(ctx, 13.8, 11, '#9aa3b8', 4.5);
      line(ctx, 0, -9, 0, 4, '#6c7487', 2.2);
      rr(ctx, -14, 1, 28, 4.2, 2);
      fs(ctx, '#c48a12', 1.1);
      for (let x = -11; x <= 11; x += 5.5) {
        circ(ctx, x, 3.1, 0.8);
        ctx.fillStyle = '#ffe9a6';
        ctx.fill();
      }
      return;
    }
    case 'spacehelmet': {
      ell(ctx, 0, 14, 21, 21);
      ctx.fillStyle = 'rgba(170,215,255,0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(33,26,46,0.6)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 14, 18.5, Math.PI * 1.12, Math.PI * 1.42);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.stroke();
      circ(ctx, 10, -2.5, 1.2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
      line(ctx, 0, -7, 0, -12, '#9aa3b8', 1.4);
      circ(ctx, 0, -13, 1.8);
      fs(ctx, Math.sin(time * 5) > 0 ? '#ff4d6d' : '#ff9fb0', 0.9);
      return;
    }
    case 'sprout': {
      const sw = Math.sin(time * 2.2) * 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.quadraticCurveTo(1, -4, sw, -9);
      ctx.strokeStyle = LEAF_DARK;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.stroke();
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sw, -9);
        ctx.quadraticCurveTo(sw + d * 3, -15, sw + d * 9, -12);
        ctx.quadraticCurveTo(sw + d * 5, -7, sw, -9);
        fs(ctx, d > 0 ? '#5ccf5f' : LEAF, 1.1);
        line(ctx, sw + d * 1, -9.6, sw + d * 6.5, -11.8, 'rgba(255,255,255,0.35)', 0.6);
      }
      return;
    }
    case 'bunny': {
      const fl = Math.sin(time * 2.6) * 0.12;
      const ears: [number, number][] = [[-5, -0.18], [5, 0.34 + fl]];
      for (const [x, rot] of ears) {
        ctx.save();
        ctx.translate(x, 0);
        ctx.rotate(rot);
        ell(ctx, 0, -11, 3.8, 11);
        fs(ctx, '#ffffff', 1.3);
        ell(ctx, 0, -10.5, 1.9, 8);
        ctx.fillStyle = '#ffb3cf';
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    case 'catears': {
      const c = tones.hair && tones.hair !== '#000000' ? tones.hair : tones.dark;
      for (const [x, rot] of [[-7.5, -0.35], [7.5, 0.3]] as const) {
        ctx.save();
        ctx.translate(x, 2);
        ctx.rotate(rot);
        poly(ctx, [[-4.5, 1], [0, -10], [4.5, 1]]);
        fs(ctx, c, 1.3);
        poly(ctx, [[-2.3, 0], [0, -6.5], [2.3, 0]]);
        ctx.fillStyle = '#ffb3cf';
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    case 'pirate': {
      ctx.beginPath();
      ctx.moveTo(-19, -2);
      ctx.quadraticCurveTo(-12, 5, 0, 4.5);
      ctx.quadraticCurveTo(12, 5, 19, -2);
      ctx.quadraticCurveTo(12, -4, 9, -10);
      ctx.quadraticCurveTo(0, -16, -9, -10);
      ctx.quadraticCurveTo(-12, -4, -19, -2);
      fs(ctx, '#20232e', 1.4);
      ctx.beginPath();
      ctx.moveTo(-17, -1.4);
      ctx.quadraticCurveTo(0, 6, 17, -1.4);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      circ(ctx, 0, -5, 3.2);
      fs(ctx, '#ffffff', 0.9);
      circ(ctx, -1.1, -5.4, 0.7);
      circ(ctx, 1.1, -5.4, 0.7);
      ctx.fillStyle = INK;
      ctx.fill();
      line(ctx, -4, -1, 4, -1.4, '#ffffff', 1.1);
      line(ctx, -4, -1.6, 4, -0.8, '#ffffff', 1.1);
      return;
    }
    case 'fez': {
      ctx.beginPath();
      ctx.moveTo(-8, 3.5);
      ctx.lineTo(-6.5, -10);
      ctx.quadraticCurveTo(0, -11.5, 6.5, -10);
      ctx.lineTo(8, 3.5);
      ctx.quadraticCurveTo(0, 5.5, -8, 3.5);
      const g = ctx.createLinearGradient(-8, 0, 8, 0);
      g.addColorStop(0, '#ff5a5f');
      g.addColorStop(1, '#a51f2e');
      fs(ctx, g, 1.3);
      ell(ctx, 0, -10, 6.5, 1.5);
      fs(ctx, '#c22f3c', 1);
      const sw = Math.sin(time * 3) * 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.quadraticCurveTo(-5, -11, -6.5 + sw * 0.4, -3 + Math.abs(sw) * 0.2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.stroke();
      ell(ctx, -6.5 + sw * 0.4, -1.8, 1.2, 2.2);
      fs(ctx, GOLD, 0.7);
      return;
    }
    case 'grad': {
      shadeDome(ctx, 12, 8, '#20232e', 4);
      poly(ctx, [[-17, -5], [3, -10], [17, -5.5], [-3, -0.5]]);
      fs(ctx, '#2b2f3f', 1.3);
      circ(ctx, 0, -5.4, 1.1);
      ctx.fillStyle = GOLD;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -5.4);
      ctx.quadraticCurveTo(10, -6, 12.5, 2 + Math.sin(time * 2) * 0.6);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1;
      ctx.stroke();
      rr(ctx, 11.4, 1.5, 2.2, 4.4, 1);
      fs(ctx, GOLD, 0.6);
      return;
    }
    case 'hardhat': {
      ell(ctx, 1, 4, 17, 3.2);
      fs(ctx, '#e0a100', 1.3);
      shadeDome(ctx, 13.5, 12.5, '#ffd23f', 3.5);
      rr(ctx, -2.2, -11.5, 4.4, 15, 2);
      fs(ctx, '#ffe066', 1);
      circ(ctx, 7, -2.5, 2.4);
      fs(ctx, '#ff7a1a', 0.8);
      return;
    }
    case 'bow': {
      ctx.save();
      ctx.translate(4, -2);
      ctx.rotate(0.25);
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(d * 5, -8, d * 12, -6, d * 10, 0);
        ctx.bezierCurveTo(d * 12, 6, d * 5, 7, 0, 0);
        fs(ctx, '#ff5fa2', 1.3);
        for (let i = 0; i < 3; i++) {
          circ(ctx, d * (4 + i * 2.2), -1.6 + (i % 2) * 3, 0.8);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      }
      ell(ctx, 0, 0, 2.6, 3.2);
      fs(ctx, '#e03d87', 1.2);
      ctx.restore();
      return;
    }
    case 'boppers': {
      ctx.beginPath();
      ctx.moveTo(-13, 7);
      ctx.bezierCurveTo(-12, -4, 12, -4, 13, 7);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      for (const [d, ph] of [[-1, 0], [1, 1.7]] as const) {
        const bx = d * 7 + Math.sin(time * 5 + ph) * 2.2;
        const by = -14 + Math.cos(time * 6 + ph) * 1;
        ctx.beginPath();
        ctx.moveTo(d * 5, -1.5);
        ctx.quadraticCurveTo(d * 9, -7, bx, by);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.1;
        ctx.stroke();
        circ(ctx, bx, by, 2.7);
        fs(ctx, d < 0 ? '#5cf2a0' : '#ff7ad9', 1.1);
        circ(ctx, bx - 0.8, by - 0.9, 0.8);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      return;
    }
    case 'mushroom': {
      ctx.beginPath();
      ctx.moveTo(-18, 4);
      ctx.bezierCurveTo(-18, -16, 18, -16, 18, 4);
      ctx.quadraticCurveTo(0, 8, -18, 4);
      const g = ctx.createRadialGradient(-5, -8, 1, 0, -2, 20);
      g.addColorStop(0, '#ff6b6b');
      g.addColorStop(1, '#c41f30');
      fs(ctx, g, 1.4);
      ctx.beginPath();
      ctx.moveTo(-17, 3.6);
      ctx.quadraticCurveTo(0, 7.6, 17, 3.6);
      ctx.quadraticCurveTo(0, 5, -17, 3.6);
      ctx.fillStyle = '#f6e7cf';
      ctx.fill();
      for (const [x, y, r] of [[-8, -6, 2.8], [4, -9, 2.4], [11, -2, 2], [-13, 0, 1.6], [-1, -2, 1.5]] as const) {
        ell(ctx, x, y, r, r * 0.85);
        fs(ctx, '#ffffff', 0.8);
      }
      return;
    }
    case 'aviator': {
      ctx.beginPath();
      ctx.moveTo(-14.5, 4);
      ctx.bezierCurveTo(-14.5, -11, 14.5, -11, 14.5, 4);
      ctx.lineTo(13, 6);
      ctx.quadraticCurveTo(0, 2, -13, 6);
      ctx.closePath();
      fs(ctx, '#8a5a35', 1.4);
      ctx.beginPath();
      ctx.moveTo(-14, 3);
      ctx.quadraticCurveTo(-17, 10, -13.5, 16);
      ctx.quadraticCurveTo(-10, 14, -10, 5);
      ctx.closePath();
      fs(ctx, '#7a4c2a', 1.2);
      line(ctx, -15, 2, 15, 2, '#5a3d22', 2);
      for (const x of [2, 9.5]) {
        circ(ctx, x, 1.2, 3.6);
        fs(ctx, '#c9ced8', 1.2);
        circ(ctx, x, 1.2, 2.5);
        ctx.fillStyle = '#ffb347';
        ctx.fill();
        circ(ctx, x - 0.8, 0.3, 0.8);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
      }
      return;
    }
    case 'froghat': {
      shadeDome(ctx, 14.5, 10.5, '#5ccf5f', 4.5);
      for (const x of [-6, 6]) {
        circ(ctx, x, -8.5, 4.4);
        fs(ctx, '#5ccf5f', 1.3);
        circ(ctx, x, -8.7, 2.8);
        fs(ctx, '#ffffff', 0.9);
        circ(ctx, x + 0.8, -8.4, 1.5);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(4, -1);
      ctx.quadraticCurveTo(8, 1.5, 12, -1);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.stroke();
      circ(ctx, 9, 1.4, 1.2);
      ctx.fillStyle = 'rgba(255,130,160,0.7)';
      ctx.fill();
      return;
    }
    case 'starclip': {
      const sx = 5 + Math.sin(time * 4) * 1.5;
      const sy = -13 + Math.cos(time * 5) * 0.8;
      ctx.beginPath();
      ctx.moveTo(3, 0);
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const x = 3 + (sx - 3) * t + Math.sin(t * Math.PI * 6) * 1.2;
        const y = (sy + 2) * t;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#9aa3b8';
      ctx.lineWidth = 1;
      ctx.stroke();
      star(ctx, sx, sy, 5.4, 0.48, 5, -Math.PI / 2 + Math.sin(time * 3) * 0.2);
      fs(ctx, '#ffd23f', 1.3);
      star(ctx, sx, sy, 2.4, 0.5);
      ctx.fillStyle = '#fff6b0';
      ctx.fill();
      twinkle(ctx, sx + 6, sy - 4, 1.6 + Math.sin(time * 6) * 0.6, '#ffffff');
      return;
    }
    default:
      return;
  }
}
