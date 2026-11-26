/**
 * Outfit painter (2D). Outfits wrap the lower body (below the mouth) and are
 * baked into the cached body layer. `paintOutfitBehind` draws pieces that sit
 * behind the body (hoods, mantles).
 */
import { OUTFIT_BY_ID } from '../catalog';
import { mix } from '../shape';
import { circ, ell, fs, GOLD, heart, INK, line, poly, rr, star, traceBody, type Ctx, type Geo } from './util';

/** Outfits whose sleeves colour the arms (value = sleeve colour). */
export function sleeveColor(id: string): string | null {
  const o = OUTFIT_BY_ID.get(id);
  if (!o) return null;
  switch (id) {
    case 'none':
    case 'scarf':
    case 'overalls':
    case 'apron':
    case 'vest':
    case 'bowtie':
    case 'cape':
      return null;
    case 'varsity':
      return o.accent;
    default:
      return o.main;
  }
}

function neckPath(ctx: Ctx, g: Geo, vDepth = 0, frontX?: number): void {
  const hw = g.w / 2 + 4;
  const fx = frontX ?? g.fx + 1.5;
  const y = g.neck;
  ctx.beginPath();
  ctx.moveTo(-hw, y - 1.4);
  ctx.quadraticCurveTo(-hw * 0.3, y - 0.4, fx - 4, y + 0.3);
  if (vDepth > 0) {
    ctx.lineTo(fx, y + vDepth);
    ctx.lineTo(fx + 4, y + 0.2);
  } else {
    ctx.quadraticCurveTo(fx, y + 2.2, fx + 4, y + 0.2);
  }
  ctx.quadraticCurveTo(hw * 0.8, y - 0.6, hw, y - 1.6);
  ctx.lineTo(hw, g.bottom + 6);
  ctx.lineTo(-hw, g.bottom + 6);
  ctx.closePath();
}

function clipBody(ctx: Ctx, g: Geo): void {
  traceBody(ctx, g, 0.6);
  ctx.clip();
}

function shadeFill(ctx: Ctx, g: Geo, color: string): void {
  const gr = ctx.createLinearGradient(-g.w / 2, g.neck, g.w / 2, g.bottom);
  gr.addColorStop(0, mix(color, '#ffffff', 0.18));
  gr.addColorStop(0.5, color);
  gr.addColorStop(1, mix(color, '#120c1c', 0.28));
  ctx.fillStyle = gr;
  ctx.fill();
}

export function paintOutfitBehind(ctx: Ctx, id: string, g: Geo): void {
  const o = OUTFIT_BY_ID.get(id);
  if (!o) return;
  const hw = g.w / 2;
  if (id === 'hoodie' || id === 'raincoat') {
    ctx.beginPath();
    ctx.moveTo(-hw * 0.2, g.neck);
    ctx.bezierCurveTo(-hw * 1.4, g.neck - 2, -hw * 1.3, g.top + g.h * 0.25, -hw * 0.75, g.top + g.h * 0.3);
    ctx.quadraticCurveTo(-hw * 0.6, g.neck - 4, -hw * 0.2, g.neck);
    fs(ctx, mix(o.main, '#120c1c', 0.12), 1.4);
  }
  if (id === 'cape') {
    ctx.beginPath();
    ctx.moveTo(-hw * 0.4, g.neck - 1);
    ctx.quadraticCurveTo(-hw * 1.35, g.neck + 2, -hw * 1.2, g.bottom + 1);
    ctx.lineTo(-hw * 0.2, g.bottom);
    ctx.closePath();
    fs(ctx, mix(o.main, '#120c1c', 0.15), 1.4);
  }
}

export function paintOutfit(ctx: Ctx, id: string, g: Geo): void {
  const o = OUTFIT_BY_ID.get(id);
  if (!o || id === 'none') return;
  const hw = g.w / 2;
  const fx = g.fx + 1.5;
  const ny = g.neck;
  const midY = (ny + g.bottom) / 2;
  ctx.save();
  clipBody(ctx, g);
  switch (id) {
    case 'tee':
    case 'heartpin':
    case 'jersey':
    case 'hawaiian':
    case 'sweater':
    case 'puffer':
    case 'spacesuit':
    case 'raincoat':
    case 'hoodie':
    case 'labcoat':
    case 'suit':
    case 'tux':
    case 'varsity':
    case 'trench':
    case 'vest': {
      const v = id === 'suit' || id === 'tux' || id === 'labcoat' || id === 'trench' || id === 'vest' ? 6 : 0;
      neckPath(ctx, g, v);
      shadeFill(ctx, g, o.main);
      ctx.save();
      ctx.clip();
      if (id === 'suit' || id === 'tux' || id === 'labcoat' || id === 'trench' || id === 'vest') {
        // Shirt triangle + lapels.
        poly(ctx, [[fx - 4, ny + 0.3], [fx + 4, ny + 0.2], [fx, ny + 7]]);
        ctx.fillStyle = id === 'labcoat' ? '#cfe0ff' : id === 'vest' ? '#f7f4ee' : '#ffffff';
        ctx.fill();
        if (id === 'suit') {
          poly(ctx, [[fx - 1.1, ny + 0.8], [fx + 1.1, ny + 0.8], [fx + 1.6, ny + 7], [fx, ny + 9], [fx - 1.6, ny + 7]]);
          fs(ctx, o.accent, 0.8);
        }
        if (id !== 'vest') {
          for (const d of [-1, 1]) {
            poly(ctx, [[fx + d * 4, ny + 0.2], [fx + d * 6.5, ny + 3], [fx + d * 1.4, ny + 7.5]]);
            fs(ctx, id === 'tux' ? '#3a3f52' : mix(o.main, '#ffffff', id === 'labcoat' ? 0 : 0.12), 0.8);
          }
        }
        if (id === 'vest') {
          ctx.globalAlpha = 0.6;
          for (let x = -hw; x < hw; x += 5) {
            poly(ctx, [[x, midY], [x + 2.5, midY - 3], [x + 5, midY], [x + 2.5, midY + 3]]);
            ctx.fillStyle = o.accent;
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        for (let i = 0; i < 2; i++) {
          circ(ctx, fx + 0.2, ny + 9 + i * 3, 0.7);
          ctx.fillStyle = id === 'labcoat' ? '#9aa3b8' : '#11131a';
          ctx.fill();
        }
        if (id === 'labcoat') {
          rr(ctx, fx - 9, ny + 5, 4.4, 4, 0.8);
          fs(ctx, '#f7f8fb', 0.7);
          line(ctx, fx - 7.6, ny + 3.6, fx - 7.6, ny + 6.5, '#2f6fed', 1.1);
        }
        if (id === 'trench') {
          line(ctx, -hw, midY + 2, hw, midY + 2.6, o.accent, 2.2);
          rr(ctx, fx - 1.6, midY + 0.6, 3.2, 3.2, 0.6);
          fs(ctx, GOLD, 0.6);
        }
      }
      if (id === 'tux') {
        ctx.restore();
        ctx.restore();
        bowtie(ctx, fx, ny + 1.6, '#11131a');
        return;
      }
      if (id === 'heartpin') {
        heart(ctx, fx + 3.2, ny + 4.6, 2.3);
        const gr = ctx.createLinearGradient(fx, ny + 2, fx + 4, ny + 7);
        gr.addColorStop(0, '#ff8aa1');
        gr.addColorStop(1, o.accent);
        fs(ctx, gr, 0.9);
        circ(ctx, fx + 2.4, ny + 3.6, 0.6);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      if (id === 'tee') {
        circ(ctx, fx + 1, ny + 5.5, 2.4);
        fs(ctx, o.accent, 0.8);
        line(ctx, fx + 1, ny + 3.1, fx + 1.8, ny + 2, '#1f8a4c', 1);
      }
      if (id === 'jersey') {
        ctx.fillStyle = o.accent;
        ctx.font = 'bold 7px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('7', fx + 1, ny + 5.6);
        line(ctx, -hw, g.bottom - 2.5, hw, g.bottom - 2.5, o.accent, 1.4);
      }
      if (id === 'hawaiian') {
        for (let i = 0; i < 6; i++) {
          const x = -hw + 3 + (i % 3) * 10 + (i > 2 ? 5 : 0);
          const y = ny + 3 + (i > 2 ? 5 : 0);
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            circ(ctx, x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4, 1.1);
            ctx.fillStyle = i % 2 ? o.accent : '#ff86bf';
            ctx.fill();
          }
        }
        poly(ctx, [[fx - 4, ny], [fx, ny + 4], [fx - 1, ny + 0.5]]);
        fs(ctx, mix(o.main, '#ffffff', 0.3), 0.6);
      }
      if (id === 'sweater') {
        for (let x = -hw; x < hw; x += 3) {
          poly(ctx, [[x, midY + 1], [x + 1.5, midY - 1], [x + 3, midY + 1]], false);
          ctx.strokeStyle = o.accent;
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
        rr(ctx, -hw, g.bottom - 3, g.w, 4, 1);
        ctx.fillStyle = mix(o.main, '#120c1c', 0.2);
        ctx.fill();
      }
      if (id === 'puffer') {
        for (let y = ny + 3.4; y < g.bottom + 2; y += 3.6) {
          ctx.beginPath();
          ctx.moveTo(-hw, y);
          ctx.quadraticCurveTo(0, y + 1.4, hw, y);
          ctx.strokeStyle = mix(o.main, '#120c1c', 0.35);
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
        line(ctx, fx, ny, fx, g.bottom, o.accent, 0.8);
      }
      if (id === 'spacesuit') {
        rr(ctx, fx - 3.6, ny + 2.6, 7.2, 5, 1.2);
        fs(ctx, '#d3d9e4', 0.8);
        for (const [i, col] of ['#ff4d6d', '#ffd257', '#14b8a6'].entries()) {
          circ(ctx, fx - 2 + i * 2, ny + 5, 0.75);
          ctx.fillStyle = col;
          ctx.fill();
        }
        line(ctx, -hw, midY + 3.5, hw, midY + 3.5, o.accent, 1.6);
      }
      if (id === 'raincoat') {
        for (let i = 0; i < 2; i++) {
          rr(ctx, fx - 0.4, ny + 3 + i * 3.4, 2.4, 1, 0.5);
          fs(ctx, o.accent, 0.5);
        }
      }
      if (id === 'hoodie') {
        rr(ctx, fx - 6, midY, 11, 5, 2);
        fs(ctx, mix(o.main, '#ffffff', 0.08), 0.8);
        for (const d of [-2.2, 2.2]) {
          line(ctx, fx + d, ny + 0.4, fx + d * 1.1, ny + 5, '#f2f4f8', 0.8);
          circ(ctx, fx + d * 1.1, ny + 5.4, 0.7);
          ctx.fillStyle = o.accent;
          ctx.fill();
        }
      }
      if (id === 'varsity') {
        ctx.fillStyle = o.accent;
        ctx.font = 'bold 6.5px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('M', fx - 4.5, ny + 5);
        line(ctx, fx + 2, ny, fx + 2, g.bottom, mix(o.accent, '#000', 0.1), 0.8);
        for (let i = 0; i < 3; i++) {
          circ(ctx, fx + 3.2, ny + 3 + i * 3, 0.55);
          ctx.fill();
        }
        rr(ctx, -hw, g.bottom - 3, g.w, 3.4, 0.5);
        ctx.fillStyle = o.accent;
        ctx.fill();
        line(ctx, -hw, g.bottom - 1.7, hw, g.bottom - 1.7, o.main, 0.7);
      }
      ctx.restore();
      neckPath(ctx, g, v);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      break;
    }
    case 'overalls': {
      // Bib + pants.
      ctx.beginPath();
      ctx.moveTo(fx - 6, ny + 1.6);
      ctx.lineTo(fx + 6.4, ny + 1.6);
      ctx.lineTo(fx + 7, midY);
      ctx.lineTo(hw + 3, midY + 0.4);
      ctx.lineTo(hw + 3, g.bottom + 4);
      ctx.lineTo(-hw - 3, g.bottom + 4);
      ctx.lineTo(-hw - 3, midY + 0.4);
      ctx.lineTo(fx - 6.6, midY);
      ctx.closePath();
      shadeFill(ctx, g, o.main);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      line(ctx, fx - 5.4, ny + 1.8, -hw * 0.4, ny - 2.5, o.main, 1.8);
      line(ctx, fx + 5.8, ny + 1.8, hw * 0.9, ny - 2, o.main, 1.8);
      for (const x of [fx - 4.4, fx + 4.6]) {
        circ(ctx, x, ny + 2.8, 0.95);
        fs(ctx, o.accent, 0.6);
      }
      rr(ctx, fx - 2.8, ny + 4.2, 5.6, 3.6, 0.8);
      ctx.strokeStyle = mix(o.main, '#ffffff', 0.35);
      ctx.lineWidth = 0.6;
      ctx.setLineDash([0.8, 0.7]);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'apron': {
      ctx.beginPath();
      ctx.moveTo(fx - 5, ny + 0.5);
      ctx.lineTo(fx + 6, ny + 0.5);
      ctx.lineTo(fx + 8.5, g.bottom + 2);
      ctx.lineTo(fx - 8, g.bottom + 2);
      ctx.closePath();
      fs(ctx, o.main, 1.1);
      rr(ctx, fx - 3, midY, 6, 3.6, 1);
      fs(ctx, o.accent, 0.7);
      line(ctx, fx - 4.5, ny + 0.6, -hw * 0.3, ny - 3, o.accent, 1);
      line(ctx, -hw, midY - 1, fx - 6, midY - 1, o.accent, 1.2);
      break;
    }
    case 'scarf':
    case 'cape':
    case 'bowtie':
      break;
    default:
      break;
  }
  ctx.restore();

  // Pieces drawn outside the body clip.
  if (id === 'scarf') {
    ctx.beginPath();
    ctx.moveTo(-hw * 0.95, ny - 2.4);
    ctx.quadraticCurveTo(fx, ny + 1.6, hw * 0.98, ny - 2.6);
    ctx.lineTo(hw * 0.96, ny + 1.8);
    ctx.quadraticCurveTo(fx, ny + 5.8, -hw * 0.92, ny + 1.8);
    ctx.closePath();
    fs(ctx, o.main, 1.3);
    // Tail hanging at the front.
    ctx.beginPath();
    ctx.moveTo(fx + 1, ny + 1.5);
    ctx.lineTo(fx + 5.5, ny + 1);
    ctx.lineTo(fx + 6.4, ny + 9.5);
    ctx.lineTo(fx + 2.2, ny + 10);
    ctx.closePath();
    fs(ctx, o.main, 1.2);
    for (let i = 0; i < 3; i++) line(ctx, fx + 1.6 + i * 0.1, ny + 3.6 + i * 2.2, fx + 5.8 + i * 0.1, ny + 3.3 + i * 2.2, o.accent, 0.9);
    for (let x = -hw * 0.7; x < hw * 0.9; x += 4.2) line(ctx, x, ny - 1.4, x + 0.4, ny + 2.8, o.accent, 1);
  }
  if (id === 'cape') {
    ctx.beginPath();
    ctx.moveTo(-hw * 0.95, ny - 2);
    ctx.quadraticCurveTo(fx, ny + 2, hw * 0.98, ny - 2.4);
    ctx.lineTo(hw * 0.92, ny + 3);
    ctx.quadraticCurveTo(fx, ny + 8, -hw * 0.85, ny + 4);
    ctx.closePath();
    fs(ctx, o.main, 1.3);
    circ(ctx, fx + 1, ny + 1.6, 1.8);
    fs(ctx, o.accent, 0.8);
    star(ctx, fx + 1, ny + 1.6, 1.1);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  if (id === 'bowtie') bowtie(ctx, fx, ny + 1.2, o.main);
  if (id === 'hoodie' || id === 'raincoat' || id === 'spacesuit') {
    // Collar / ring.
    ctx.beginPath();
    ctx.moveTo(-hw * 0.9, ny - 1.2);
    ctx.quadraticCurveTo(fx, ny + 3.2, hw * 0.92, ny - 1.4);
    ctx.strokeStyle = INK;
    ctx.lineWidth = id === 'spacesuit' ? 3.6 : 2.8;
    ctx.stroke();
    ctx.strokeStyle = id === 'spacesuit' ? '#b8c1d1' : mix(o.main, '#ffffff', 0.1);
    ctx.lineWidth = id === 'spacesuit' ? 2.2 : 1.4;
    ctx.stroke();
  }
  void ell;
}

function bowtie(ctx: Ctx, x: number, y: number, color: string): void {
  poly(ctx, [[x, y], [x - 4, y - 2.4], [x - 4, y + 2.4]]);
  fs(ctx, color, 1);
  poly(ctx, [[x, y], [x + 4, y - 2.4], [x + 4, y + 2.4]]);
  fs(ctx, color, 1);
  circ(ctx, x, y, 1.2);
  fs(ctx, mix(color, '#000000', 0.2), 0.8);
}
