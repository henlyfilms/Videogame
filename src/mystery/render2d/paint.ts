/**
 * Procedural 2D painters for the top-down view: floors, walls, props,
 * stations and vents. Everything is drawn in tile units scaled by `s`
 * (pixels per tile). Shared by the in-match renderer, the waiting room, the
 * minimap thumbnails and the 2D menu backdrop.
 */
import type { FloorStyle, PropDef, StationDef, VentDef } from '../core/map';

export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

export function parseHex(h: string): [number, number, number] {
  if (h.startsWith('rgb')) {
    const m = h.match(/\d+/g) ?? ['0', '0', '0'];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(h: string, a: number): string {
  const [r, g, b] = parseHex(h);
  return `rgba(${r},${g},${b},${a})`;
}

/** Base floor colour for a style, tinted toward the room accent. */
export function floorBase(style: FloorStyle, accent: string, night: boolean): string {
  const base: Record<FloorStyle, string> = {
    tile: '#e9edf5',
    wood: '#d9b48a',
    carpet: '#c9cfe6',
    metal: '#c6ced9',
    grass: '#8fd18a',
    snow: '#f4f7fb',
    stone: '#b9b3a8',
    checker: '#eef0f6',
    rug: '#e8d9e9',
  };
  const tint = style === 'grass' || style === 'snow' || style === 'wood' ? 0.14 : 0.26;
  const c = mix(base[style], accent, tint);
  return night ? mix(c, '#0b1022', 0.55) : c;
}

export function paintFloorTile(ctx: CanvasRenderingContext2D, style: FloorStyle, tx: number, ty: number, s: number, base: string): void {
  const x = tx * s;
  const y = ty * s;
  const r = hash2(tx, ty);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, s + 0.5, s + 0.5);
  switch (style) {
    case 'tile': {
      ctx.strokeStyle = 'rgba(30,40,70,0.08)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      if (r > 0.92) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
      }
      break;
    }
    case 'checker': {
      if ((tx + ty) % 2 === 0) {
        ctx.fillStyle = 'rgba(20,30,60,0.09)';
        ctx.fillRect(x, y, s, s);
      }
      break;
    }
    case 'wood': {
      ctx.strokeStyle = 'rgba(90,50,20,0.18)';
      ctx.lineWidth = Math.max(1, s * 0.025);
      const plank = s / 3;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y + plank * i);
        ctx.lineTo(x + s, y + plank * i);
        ctx.stroke();
      }
      const off = (r * s) | 0;
      ctx.beginPath();
      ctx.moveTo(x + off, y);
      ctx.lineTo(x + off, y + plank);
      ctx.moveTo(x + ((off + s / 2) % s), y + plank);
      ctx.lineTo(x + ((off + s / 2) % s), y + plank * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,240,220,${0.05 + r * 0.06})`;
      ctx.fillRect(x, y, s, plank);
      break;
    }
    case 'carpet':
    case 'rug': {
      ctx.fillStyle = `rgba(255,255,255,${0.04 + r * 0.05})`;
      for (let i = 0; i < 3; i++) {
        const px = x + hash2(tx * 3 + i, ty) * s;
        const py = y + hash2(tx, ty * 3 + i) * s;
        ctx.fillRect(px, py, s * 0.06, s * 0.06);
      }
      break;
    }
    case 'metal': {
      ctx.strokeStyle = 'rgba(40,50,70,0.16)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      ctx.fillStyle = 'rgba(40,50,70,0.22)';
      const d = s * 0.12;
      for (const [cx, cy] of [
        [x + d, y + d],
        [x + s - d, y + d],
        [x + d, y + s - d],
        [x + s - d, y + s - d],
      ] as const) {
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      if (r > 0.8) {
        ctx.strokeStyle = 'rgba(40,50,70,0.12)';
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x + (s / 4) * i, y + s * 0.2);
          ctx.lineTo(x + (s / 4) * i, y + s * 0.8);
          ctx.stroke();
        }
      }
      break;
    }
    case 'grass': {
      ctx.strokeStyle = `rgba(40,110,50,${0.25 + r * 0.2})`;
      ctx.lineWidth = Math.max(1, s * 0.03);
      for (let i = 0; i < 5; i++) {
        const gx = x + hash2(tx * 7 + i, ty * 5) * s;
        const gy = y + hash2(tx * 5, ty * 7 + i) * s;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + s * 0.04, gy - s * 0.12);
        ctx.stroke();
      }
      if (r > 0.94) {
        ctx.fillStyle = r > 0.97 ? '#fde68a' : '#fbcfe8';
        ctx.beginPath();
        ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'snow': {
      ctx.fillStyle = 'rgba(180,200,230,0.25)';
      if (r > 0.6) {
        ctx.beginPath();
        ctx.ellipse(x + s * r, y + s * 0.6, s * 0.3, s * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stone': {
      ctx.strokeStyle = 'rgba(60,50,40,0.2)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      const hs = s / 2;
      const off = ty % 2 ? hs / 2 : 0;
      ctx.strokeRect(x + off, y, hs, hs);
      ctx.strokeRect(x + ((off + hs) % s), y + hs, hs, hs);
      break;
    }
  }
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/**
 * Paint a prop in its footprint. `night` darkens. Called for the baked layer
 * (animated details are added per-frame by `paintPropLive`).
 */
export function paintProp(ctx: CanvasRenderingContext2D, p: PropDef, s: number, night: boolean): void {
  const w = (p.w ?? 1) * s;
  const h = (p.h ?? 1) * s;
  const x = p.x * s - w / 2;
  const y = p.y * s - h / 2;
  const dim = (c: string) => (night ? mix(c, '#0b1022', 0.5) : c);
  const shadow = () => {
    ctx.fillStyle = 'rgba(10,15,35,0.18)';
    rr(ctx, x + s * 0.08, y + s * 0.14, w, h, s * 0.18);
    ctx.fill();
  };
  ctx.save();
  if (p.rot) {
    ctx.translate(p.x * s, p.y * s);
    ctx.rotate(p.rot);
    ctx.translate(-p.x * s, -p.y * s);
  }
  const accent = p.color ?? '#2f6fed';
  switch (p.kind) {
    case 'table':
    case 'desk':
    case 'counter': {
      shadow();
      ctx.fillStyle = dim(p.kind === 'counter' ? '#94a3b8' : '#c08a5a');
      rr(ctx, x, y, w, h, s * 0.12);
      ctx.fill();
      ctx.fillStyle = dim(p.kind === 'counter' ? '#cbd5e1' : '#dca677');
      rr(ctx, x + s * 0.06, y + s * 0.05, w - s * 0.12, h - s * 0.18, s * 0.1);
      ctx.fill();
      if (p.kind === 'desk') {
        // monitors
        const n = Math.max(1, Math.round(w / s / 1.5));
        for (let i = 0; i < n; i++) {
          const mx = x + (w / n) * (i + 0.5);
          ctx.fillStyle = dim('#1e293b');
          rr(ctx, mx - s * 0.35, y + s * 0.1, s * 0.7, s * 0.42, s * 0.06);
          ctx.fill();
          ctx.fillStyle = night ? '#38bdf8' : '#93c5fd';
          rr(ctx, mx - s * 0.3, y + s * 0.14, s * 0.6, s * 0.32, s * 0.04);
          ctx.fill();
        }
      }
      break;
    }
    case 'roundTable': {
      ctx.fillStyle = 'rgba(10,15,35,0.2)';
      ctx.beginPath();
      ctx.ellipse(p.x * s + s * 0.1, p.y * s + s * 0.16, w * 0.68, h * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dim(p.color ?? '#cbd5e1');
      ctx.beginPath();
      ctx.ellipse(p.x * s, p.y * s, w * 0.68, h * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dim('#94a3b8');
      ctx.lineWidth = s * 0.06;
      ctx.stroke();
      break;
    }
    case 'chair':
    case 'seat': {
      ctx.fillStyle = dim('#475569');
      rr(ctx, x + s * 0.2, y + s * 0.2, w - s * 0.4, h - s * 0.4, s * 0.15);
      ctx.fill();
      break;
    }
    case 'sofa':
    case 'bench': {
      shadow();
      ctx.fillStyle = dim(p.kind === 'sofa' ? accent : '#a16207');
      rr(ctx, x, y, w, h, s * 0.3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      rr(ctx, x + s * 0.1, y + s * 0.08, w - s * 0.2, h * 0.4, s * 0.2);
      ctx.fill();
      break;
    }
    case 'bed': {
      shadow();
      ctx.fillStyle = dim('#f1f5f9');
      rr(ctx, x, y, w, h, s * 0.15);
      ctx.fill();
      ctx.fillStyle = dim(accent);
      rr(ctx, x, y + h * 0.35, w, h * 0.65, s * 0.15);
      ctx.fill();
      break;
    }
    case 'shelf':
    case 'bookshelf': {
      shadow();
      ctx.fillStyle = dim('#7c4a26');
      rr(ctx, x, y, w, h, s * 0.08);
      ctx.fill();
      const cols = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6'];
      const n = Math.floor(w / (s * 0.18));
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = dim(cols[Math.floor(hash2(Math.floor(p.x * 10) + i, Math.floor(p.y * 10)) * cols.length)]!);
        ctx.fillRect(x + s * 0.08 + i * s * 0.18, y + s * 0.12, s * 0.13, h - s * 0.3);
      }
      break;
    }
    case 'crate':
    case 'cart': {
      shadow();
      ctx.fillStyle = dim('#b7814f');
      rr(ctx, x + s * 0.05, y + s * 0.05, w - s * 0.1, h - s * 0.1, s * 0.08);
      ctx.fill();
      ctx.strokeStyle = dim('#7c4a26');
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.1, y + s * 0.1);
      ctx.lineTo(x + w - s * 0.1, y + h - s * 0.1);
      ctx.moveTo(x + w - s * 0.1, y + s * 0.1);
      ctx.lineTo(x + s * 0.1, y + h - s * 0.1);
      ctx.stroke();
      break;
    }
    case 'barrel': {
      shadow();
      ctx.fillStyle = dim('#8b5a2b');
      ctx.beginPath();
      ctx.arc(p.x * s, p.y * s, w * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dim('#3f3f46');
      ctx.lineWidth = s * 0.06;
      ctx.stroke();
      break;
    }
    case 'plant':
    case 'planter':
    case 'tree':
    case 'hedge': {
      const big = p.kind === 'tree' ? 1.2 : p.kind === 'hedge' ? 1 : 0.75;
      ctx.fillStyle = 'rgba(10,30,15,0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x * s + s * 0.12, p.y * s + s * 0.18, (w / 2) * big, (h / 2) * big * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (p.kind === 'planter') {
        ctx.fillStyle = dim('#a16207');
        rr(ctx, x, y, w, h, s * 0.15);
        ctx.fill();
      }
      const greens = p.kind === 'hedge' ? ['#15803d', '#166534', '#22c55e'] : ['#16a34a', '#22c55e', '#4ade80'];
      const blobs = p.kind === 'hedge' ? Math.max(3, Math.round((w + h) / s) * 2) : p.kind === 'planter' ? 4 : 5;
      for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * Math.PI * 2;
        const rad = (Math.min(w, h) / 2) * big * 0.55;
        const bx = p.x * s + Math.cos(a) * rad * 0.5 * (p.kind === 'hedge' ? w / Math.min(w, h) : 1);
        const by = p.y * s + Math.sin(a) * rad * 0.5 * (p.kind === 'hedge' ? h / Math.min(w, h) : 1);
        ctx.fillStyle = dim(greens[i % greens.length]!);
        ctx.beginPath();
        ctx.arc(bx, by, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.kind !== 'hedge') {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(p.x * s - w * 0.12, p.y * s - h * 0.15, Math.min(w, h) * 0.12 * big, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.kind === 'tree' && !night) {
        ctx.fillStyle = '#ef4444';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(p.x * s + Math.cos(i * 1.7) * w * 0.3, p.y * s + Math.sin(i * 1.7) * h * 0.3, s * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'console':
    case 'screen':
    case 'window': {
      if (p.kind === 'window') {
        ctx.fillStyle = night ? 'rgba(80,110,200,0.35)' : 'rgba(150,200,255,0.55)';
        rr(ctx, x, y, w, Math.max(h, s * 0.2), s * 0.05);
        ctx.fill();
        break;
      }
      if (p.kind === 'console') shadow();
      ctx.fillStyle = dim('#1e293b');
      rr(ctx, x, y, w, Math.max(h, s * 0.25), s * 0.1);
      ctx.fill();
      ctx.fillStyle = night ? '#22d3ee' : '#60a5fa';
      rr(ctx, x + s * 0.06, y + s * 0.05, w - s * 0.12, Math.max(h, s * 0.25) - s * 0.12, s * 0.06);
      ctx.fill();
      break;
    }
    case 'server':
    case 'locker':
    case 'fridge': {
      shadow();
      ctx.fillStyle = dim(p.kind === 'server' ? '#1e293b' : p.kind === 'locker' ? '#64748b' : '#e2e8f0');
      rr(ctx, x + s * 0.06, y + s * 0.04, w - s * 0.12, h - s * 0.08, s * 0.08);
      ctx.fill();
      if (p.kind === 'locker') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 0; i < 3; i++) ctx.fillRect(x + s * 0.25, y + s * (0.2 + i * 0.12), w - s * 0.5, s * 0.04);
      }
      break;
    }
    case 'stove':
    case 'generator':
    case 'engine':
    case 'tank': {
      shadow();
      ctx.fillStyle = dim(p.kind === 'tank' ? '#94a3b8' : '#475569');
      if (p.kind === 'tank') {
        ctx.beginPath();
        ctx.ellipse(p.x * s, p.y * s, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = dim('#cbd5e1');
        ctx.beginPath();
        ctx.ellipse(p.x * s - w * 0.1, p.y * s - h * 0.1, w * 0.25, h * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        rr(ctx, x, y, w, h, s * 0.18);
        ctx.fill();
        ctx.fillStyle = dim(p.kind === 'engine' ? '#f97316' : p.kind === 'stove' ? '#ef4444' : '#facc15');
        rr(ctx, x + w * 0.2, y + h * 0.25, w * 0.6, h * 0.5, s * 0.1);
        ctx.fill();
      }
      break;
    }
    case 'pillar':
    case 'statue':
    case 'rock':
    case 'snowpile': {
      ctx.fillStyle = 'rgba(10,15,35,0.2)';
      ctx.beginPath();
      ctx.ellipse(p.x * s + s * 0.1, p.y * s + s * 0.15, w * 0.45, h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dim(p.kind === 'snowpile' ? '#f8fafc' : p.kind === 'rock' ? '#78716c' : p.kind === 'statue' ? '#e2e8f0' : '#cbd5e1');
      ctx.beginPath();
      ctx.ellipse(p.x * s, p.y * s, w * 0.45, h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      if (p.kind === 'statue') {
        ctx.fillStyle = dim('#2f6fed');
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s - h * 0.05, w * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'fountain': {
      ctx.fillStyle = dim('#cbd5e1');
      ctx.beginPath();
      ctx.ellipse(p.x * s, p.y * s, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = night ? '#1e3a8a' : '#7dd3fc';
      ctx.beginPath();
      ctx.ellipse(p.x * s, p.y * s, w * 0.4, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'rug': {
      ctx.fillStyle = rgba(accent, night ? 0.25 : 0.35);
      rr(ctx, x, y, w, h, s * 0.3);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.35);
      ctx.lineWidth = s * 0.05;
      rr(ctx, x + s * 0.2, y + s * 0.2, w - s * 0.4, h - s * 0.4, s * 0.2);
      ctx.stroke();
      break;
    }
    case 'arcade':
    case 'piano':
    case 'clock':
    case 'fireplace':
    case 'telescope':
    case 'dish':
    case 'turntable':
    case 'mailbox':
    case 'tube':
    case 'pipe':
    case 'lamp': {
      shadow();
      const col =
        p.kind === 'arcade'
          ? '#7c3aed'
          : p.kind === 'piano'
            ? '#111827'
            : p.kind === 'fireplace'
              ? '#78350f'
              : p.kind === 'mailbox'
                ? '#2563eb'
                : p.kind === 'tube'
                  ? '#94a3b8'
                  : p.kind === 'turntable'
                    ? '#1f2937'
                    : '#64748b';
      ctx.fillStyle = dim(col);
      if (p.kind === 'dish' || p.kind === 'turntable' || p.kind === 'clock' || p.kind === 'tube' || p.kind === 'lamp') {
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s, Math.min(w, h) * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = dim(p.kind === 'turntable' ? '#e5e7eb' : '#f1f5f9');
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s, Math.min(w, h) * 0.18, 0, Math.PI * 2);
        ctx.fill();
      } else {
        rr(ctx, x + s * 0.05, y + s * 0.05, w - s * 0.1, h - s * 0.1, s * 0.12);
        ctx.fill();
        if (p.kind === 'arcade') {
          ctx.fillStyle = night ? '#f0abfc' : '#c4b5fd';
          rr(ctx, x + s * 0.18, y + s * 0.14, w - s * 0.36, h * 0.38, s * 0.06);
          ctx.fill();
        }
        if (p.kind === 'piano') {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(x + s * 0.1, y + h * 0.65, w - s * 0.2, h * 0.2);
        }
        if (p.kind === 'fireplace') {
          ctx.fillStyle = '#fb923c';
          rr(ctx, x + w * 0.25, y + h * 0.35, w * 0.5, h * 0.45, s * 0.1);
          ctx.fill();
        }
      }
      break;
    }
    case 'poster': {
      ctx.fillStyle = dim(accent);
      rr(ctx, x, y - s * 0.05, w, Math.max(h, s * 0.18), s * 0.04);
      ctx.fill();
      break;
    }
    default: {
      shadow();
      ctx.fillStyle = dim('#94a3b8');
      rr(ctx, x, y, w, h, s * 0.1);
      ctx.fill();
    }
  }
  if (p.label && s >= 14) {
    ctx.fillStyle = night ? 'rgba(200,220,255,0.7)' : 'rgba(30,41,59,0.75)';
    ctx.font = `600 ${Math.max(7, s * 0.28)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.label, p.x * s, p.y * s + (p.kind === 'poster' || p.kind === 'screen' ? 0 : h / 2 + s * 0.25));
  }
  ctx.restore();
}

/** Small animated overlays drawn every frame for visible props. */
export function paintPropLive(ctx: CanvasRenderingContext2D, p: PropDef, s: number, t: number, night: boolean): void {
  if (p.kind === 'server') {
    const w = (p.w ?? 1) * s;
    const h = (p.h ?? 1) * s;
    const x = p.x * s - w / 2;
    const y = p.y * s - h / 2;
    for (let i = 0; i < 4; i++) {
      const on = Math.sin(t * (3 + i) + p.x * 3 + i) > 0.2;
      ctx.fillStyle = on ? (i % 2 ? '#22d3ee' : '#4ade80') : 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + w * 0.25, y + h * (0.2 + i * 0.16), w * 0.12, h * 0.07);
    }
  } else if (p.kind === 'screen' || p.kind === 'console' || p.kind === 'arcade') {
    const w = (p.w ?? 1) * s;
    const h = Math.max((p.h ?? 1) * s, s * 0.25);
    const x = p.x * s - w / 2;
    const y = p.y * s - h / 2;
    const a = 0.12 + 0.08 * Math.sin(t * 2 + p.x);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x + w * 0.1, y + h * (0.3 + 0.2 * Math.sin(t * 1.3 + p.y)), w * 0.8, Math.max(1, h * 0.08));
    if (night) {
      ctx.fillStyle = 'rgba(56,189,248,0.12)';
      ctx.beginPath();
      ctx.ellipse(p.x * s, p.y * s + s * 0.6, w * 0.6, s * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.kind === 'turntable') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = s * 0.04;
    ctx.beginPath();
    ctx.arc(p.x * s, p.y * s, (p.w ?? 1) * s * 0.32, t * 3, t * 3 + 1.2);
    ctx.stroke();
  } else if (p.kind === 'fireplace') {
    const f = 0.6 + 0.4 * Math.sin(t * 9 + p.x);
    ctx.fillStyle = `rgba(253,186,116,${0.15 * f})`;
    ctx.beginPath();
    ctx.arc(p.x * s, p.y * s + s, s * 2.2 * f, 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface StationStyle {
  color: string;
  icon: 'task' | 'button' | 'console' | 'panel' | 'critical' | 'recharge' | 'mirror' | 'laptop';
}

export function stationStyle(kind: StationDef['kind']): StationStyle {
  switch (kind) {
    case 'emergency':
      return { color: '#ef4444', icon: 'button' };
    case 'admin':
    case 'cams':
    case 'vitals':
    case 'doorlog':
      return { color: '#38bdf8', icon: 'console' };
    case 'lightsPanel':
    case 'commsPanel':
      return { color: '#f59e0b', icon: 'panel' };
    case 'meltdownA':
    case 'meltdownB':
    case 'pressureA':
    case 'pressureB':
      return { color: '#f43f5e', icon: 'critical' };
    case 'recharge':
      return { color: '#facc15', icon: 'recharge' };
    case 'wardrobe':
      return { color: '#ec4899', icon: 'mirror' };
    case 'laptop':
      return { color: '#2f6fed', icon: 'laptop' };
    default:
      return { color: '#fbbf24', icon: 'task' };
  }
}

/** Static base of a station (panel on the floor / wall). */
export function paintStation(ctx: CanvasRenderingContext2D, st: StationDef, s: number, night: boolean): void {
  const style = stationStyle(st.kind);
  const x = st.x * s;
  const y = st.y * s;
  ctx.save();
  if (style.icon === 'button') {
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.03, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(x - s * 0.09, y - s * 0.12, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else if (style.icon === 'mirror') {
    ctx.fillStyle = '#f9a8d4';
    rr(ctx, x - s * 0.45, y - s * 0.7, s * 0.9, s * 1.2, s * 0.4);
    ctx.fill();
    ctx.fillStyle = '#e0f2fe';
    rr(ctx, x - s * 0.33, y - s * 0.58, s * 0.66, s * 0.96, s * 0.3);
    ctx.fill();
  } else if (style.icon === 'laptop') {
    ctx.fillStyle = '#334155';
    rr(ctx, x - s * 0.45, y - s * 0.3, s * 0.9, s * 0.6, s * 0.08);
    ctx.fill();
    ctx.fillStyle = '#93c5fd';
    rr(ctx, x - s * 0.38, y - s * 0.24, s * 0.76, s * 0.38, s * 0.05);
    ctx.fill();
  } else {
    ctx.fillStyle = night ? 'rgba(30,41,59,0.9)' : '#475569';
    rr(ctx, x - s * 0.32, y - s * 0.32, s * 0.64, s * 0.64, s * 0.14);
    ctx.fill();
    ctx.fillStyle = rgba(style.color, 0.85);
    rr(ctx, x - s * 0.22, y - s * 0.22, s * 0.44, s * 0.3, s * 0.08);
    ctx.fill();
  }
  ctx.restore();
}

export function paintVent(ctx: CanvasRenderingContext2D, v: VentDef, s: number, night: boolean): void {
  const x = v.x * s;
  const y = v.y * s;
  ctx.save();
  ctx.fillStyle = night ? '#1e293b' : '#64748b';
  rr(ctx, x - s * 0.45, y - s * 0.32, s * 0.9, s * 0.64, s * 0.1);
  ctx.fill();
  ctx.fillStyle = night ? '#020617' : '#1e293b';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - s * 0.36, y - s * 0.24 + i * s * 0.13, s * 0.72, s * 0.07);
  ctx.restore();
}
