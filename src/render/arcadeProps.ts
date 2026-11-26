/**
 * The Arcade's props: glowing cabinets with animated attract-mode screens,
 * the leaderboard board and the neon sign. Same contract as props.ts — a
 * static body baked into the chunk cache plus a cheap per-frame layer.
 */
import { CORE_BOTS } from '../data/bots';
import type { Simulation } from '../engine/sim';
import type { PropDef } from '../engine/world';
import type { ThemeTokens } from '../theme/tokens';
import { hexA, roundRect, traceShape } from './sprites';
import type { RenderView } from './view';

type Ctx = CanvasRenderingContext2D;
type R = { x: number; y: number; w: number; h: number };

/** Cabinet colors by prop id (the Marion Mystery cabinet is fuchsia). */
export const CABINET_COLORS: Record<string, string> = {
  mystery: '#e879f9',
  cab1: '#22d3ee',
  cab2: '#fbbf24',
  cab3: '#a3e635',
  cab4: '#6ea1ff',
};

export const ARCADE_NEON = '#ff4fd8';
const BOT_GLOW = new Map(CORE_BOTS.map((b) => [b.id, b.glowColor]));

function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, weight = 700, align: CanvasTextAlign = 'center'): void {
  ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/** Areas inside a cabinet footprint (front faces +y, toward the player). */
function cabinetParts(r: R) {
  const wide = r.w > 80;
  const pad = 5;
  const body = { x: r.x + pad, y: r.y + 3, w: r.w - pad * 2, h: r.h - 6 };
  const marquee = { x: body.x + 3, y: body.y + 3, w: body.w - 6, h: wide ? 11 : 9 };
  const screen = { x: body.x + (wide ? 8 : 6), y: marquee.y + marquee.h + 3, w: body.w - (wide ? 16 : 12), h: body.h - marquee.h - (wide ? 22 : 20) };
  const deck = { x: body.x + 2, y: screen.y + screen.h + 3, w: body.w - 4, h: body.y + body.h - (screen.y + screen.h + 3) - 2 };
  return { body, marquee, screen, deck, wide };
}

// ---------------------------------------------------------------------------
// Static (baked)
// ---------------------------------------------------------------------------

export function drawArcadeStatic(ctx: Ctx, prop: PropDef, r: R, th: ThemeTokens): void {
  switch (prop.kind) {
    case 'arcade-cabinet': {
      const color = CABINET_COLORS[prop.id] ?? ARCADE_NEON;
      const { body, marquee, screen, deck, wide } = cabinetParts(r);
      // Cabinet shell: dark lacquer with colored side-art rails.
      roundRect(ctx, body.x, body.y, body.w, body.h, 6);
      ctx.fillStyle = '#16112a';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = hexA(color, 0.55);
      ctx.stroke();
      ctx.fillStyle = hexA(color, 0.85);
      roundRect(ctx, body.x - 1.5, body.y + 6, 3, body.h - 12, 1.5);
      ctx.fill();
      roundRect(ctx, body.x + body.w - 1.5, body.y + 6, 3, body.h - 12, 1.5);
      ctx.fill();
      // Marquee backing.
      roundRect(ctx, marquee.x, marquee.y, marquee.w, marquee.h, 3);
      ctx.fillStyle = hexA(color, 0.25);
      ctx.fill();
      // Screen bezel.
      roundRect(ctx, screen.x - 2, screen.y - 2, screen.w + 4, screen.h + 4, 4);
      ctx.fillStyle = '#05030c';
      ctx.fill();
      // Control deck: joystick + buttons (two player sets on the wide cabinet).
      roundRect(ctx, deck.x, deck.y, deck.w, deck.h, 3);
      ctx.fillStyle = '#231a3d';
      ctx.fill();
      const sets = wide ? [deck.x + deck.w * 0.27, deck.x + deck.w * 0.73] : [deck.x + deck.w / 2];
      for (const sx of sets) {
        const cy = deck.y + deck.h / 2;
        ctx.fillStyle = '#0b0816';
        ctx.beginPath();
        ctx.arc(sx - 8, cy, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(sx - 8, cy - 0.8, 2, 0, Math.PI * 2);
        ctx.fill();
        const btn = ['#fbbf24', '#22d3ee', '#4ade80'];
        btn.forEach((c, i) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(sx + 2 + i * 4.2, cy + (i === 1 ? -1.2 : 0.8), 1.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      void th;
      break;
    }
    case 'leaderboard': {
      roundRect(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 6);
      ctx.fillStyle = '#120c24';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = hexA('#fbbf24', 0.6);
      ctx.stroke();
      // Little stand feet.
      ctx.fillStyle = '#2a2145';
      ctx.fillRect(r.x + 14, r.y + r.h - 4, 10, 3);
      ctx.fillRect(r.x + r.w - 24, r.y + r.h - 4, 10, 3);
      text(ctx, 'HIGH SCORES', r.x + r.w / 2, r.y + 11, 7, hexA('#fbbf24', 0.9), 800);
      ctx.strokeStyle = hexA('#fbbf24', 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r.x + 10, r.y + 17.5);
      ctx.lineTo(r.x + r.w - 10, r.y + 17.5);
      ctx.stroke();
      break;
    }
    case 'neon-sign': {
      // Wall-mounted backing plate with standoffs.
      roundRect(ctx, r.x + 2, r.y + 5, r.w - 4, r.h - 9, 5);
      ctx.fillStyle = '#0d0a1c';
      ctx.fill();
      ctx.strokeStyle = hexA(ARCADE_NEON, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#3a3358';
      for (const x of [r.x + 7, r.x + r.w - 7]) {
        ctx.beginPath();
        ctx.arc(x, r.y + r.h / 2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // Unlit tube outline (the lit tube is drawn per frame).
      text(ctx, prop.label ?? 'ARCADE', r.x + r.w / 2, r.y + r.h / 2 + 0.5, 12, hexA(ARCADE_NEON, 0.22), 900);
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Dynamic (per frame)
// ---------------------------------------------------------------------------

export interface ArcadeDyn {
  t: number;
  theme: ThemeTokens;
  view: RenderView;
  sim: Simulation;
}

/** Is someone (a bot) standing at this cabinet right now? */
function occupied(sim: Simulation, r: R): boolean {
  for (const b of sim.bots.values()) {
    if (b.mood?.kind !== 'play') continue;
    if (b.x > r.x - 20 && b.x < r.x + r.w + 20 && b.y > r.y && b.y < r.y + r.h + 48) return true;
  }
  return false;
}

export function drawArcadeDynamic(ctx: Ctx, prop: PropDef, r: R, d: ArcadeDyn): void {
  const { t, theme: th, view, sim } = d;
  const glow = th.world.glowStrength;
  switch (prop.kind) {
    case 'arcade-cabinet': {
      const color = CABINET_COLORS[prop.id] ?? ARCADE_NEON;
      const { body, marquee, screen } = cabinetParts(r);
      const playing = occupied(sim, r) || (prop.id === 'mystery' && view.arcade.live);
      const phase = (prop.id.charCodeAt(prop.id.length - 1) % 7) * 0.9;
      // Marquee: lit sign with a soft bloom.
      ctx.save();
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + phase);
      ctx.shadowColor = color;
      ctx.shadowBlur = (6 + 8 * glow) * pulse;
      roundRect(ctx, marquee.x, marquee.y, marquee.w, marquee.h, 3);
      ctx.fillStyle = hexA(color, 0.55 + 0.3 * pulse);
      ctx.fill();
      ctx.shadowBlur = 0;
      const title = prop.id === 'mystery' ? 'MARION MYSTERY' : (prop.label ?? '').toUpperCase();
      text(ctx, title, marquee.x + marquee.w / 2, marquee.y + marquee.h / 2 + 0.5, prop.id === 'mystery' ? 7.5 : 5, '#1a0526', 900);
      ctx.restore();
      // Screen.
      ctx.save();
      roundRect(ctx, screen.x, screen.y, screen.w, screen.h, 2);
      ctx.clip();
      ctx.fillStyle = prop.id === 'mystery' ? '#1b0a2e' : '#070512';
      ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
      drawScreen(ctx, prop.id, screen, t + phase, color, playing);
      // Scanlines + glass sheen.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = screen.y; y < screen.y + screen.h; y += 2) ctx.fillRect(screen.x, y, screen.w, 0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screen.x + screen.w * 0.45, screen.y);
      ctx.lineTo(screen.x + screen.w * 0.2, screen.y + screen.h);
      ctx.lineTo(screen.x, screen.y + screen.h);
      ctx.fill();
      ctx.restore();
      // Light spill onto the floor in front of the cabinet.
      if (glow > 0.6) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(body.x + body.w / 2, body.y + body.h + 6, 2, body.x + body.w / 2, body.y + body.h + 6, body.w * 0.75);
        g.addColorStop(0, hexA(color, 0.16 * glow * (playing ? 1.4 : 1)));
        g.addColorStop(1, hexA(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(body.x - body.w * 0.3, body.y + body.h - 4, body.w * 1.6, body.w * 0.8);
        ctx.restore();
      }
      if (prop.id === 'mystery' && view.arcade.live) {
        // LIVE pip.
        const on = Math.sin(t * 5) > -0.3;
        ctx.fillStyle = on ? '#ef4444' : '#7f1d1d';
        ctx.beginPath();
        ctx.arc(body.x + body.w - 8, body.y - 2, 3, 0, Math.PI * 2);
        ctx.fill();
        text(ctx, 'LIVE', body.x + body.w - 14, body.y - 2, 5.5, '#fecaca', 800, 'right');
      }
      break;
    }
    case 'leaderboard': {
      const flash = Math.max(0, 1 - (sim.time - sim.marks.arcade) / 2.5);
      ctx.save();
      if (flash > 0) {
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 22 * flash;
        ctx.strokeStyle = hexA('#fbbf24', 0.9 * flash);
        ctx.lineWidth = 2;
        roundRect(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 6);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      const rows = view.arcade.top.slice(0, 3);
      const maxW = Math.max(1, ...rows.map((x) => x.wins));
      if (!rows.length) {
        const blink = Math.sin(t * 3) > 0;
        text(ctx, blink ? 'PRESS START' : '', r.x + r.w / 2, r.y + 36, 7, '#fde68a', 800);
      }
      rows.forEach((row, i) => {
        const y = r.y + 25 + i * 10.5;
        const c = row.id === 'you' ? '#fbbf24' : BOT_GLOW.get(row.id) ?? '#94a3b8';
        text(ctx, `${i + 1}`, r.x + 12, y, 6.5, i === 0 ? '#fbbf24' : '#c4b5fd', 800);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(r.x + 21, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        const w = ((r.w - 58) * row.wins) / maxW;
        ctx.fillStyle = hexA(c, 0.75);
        roundRect(ctx, r.x + 28, y - 2.5, Math.max(3, w * (0.92 + 0.08 * Math.sin(t * 2 + i))), 5, 2);
        ctx.fill();
        text(ctx, String(row.wins), r.x + r.w - 11, y, 6.5, '#f5f3ff', 800, 'right');
      });
      ctx.restore();
      break;
    }
    case 'neon-sign': {
      // Neon tube with an occasional flicker on the last letter.
      const label = prop.label ?? 'ARCADE';
      const flick = Math.sin(t * 13.7) > 0.93 || Math.sin(t * 0.7) > 0.995;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2 + 0.5;
      ctx.save();
      ctx.shadowColor = ARCADE_NEON;
      ctx.shadowBlur = 6 + 10 * glow;
      text(ctx, flick ? label.slice(0, -1) : label, flick ? cx - 4 : cx, cy, 12, '#ffd6f5', 900);
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 4 + 6 * glow;
      ctx.strokeStyle = hexA('#67e8f9', 0.85);
      ctx.lineWidth = 1.2;
      roundRect(ctx, r.x + 4, r.y + 7, r.w - 8, r.h - 13, 4);
      ctx.stroke();
      ctx.restore();
      break;
    }
    default:
      break;
  }
}

/** Attract-mode screens, one little game per cabinet. */
function drawScreen(ctx: Ctx, id: string, s: R, t: number, color: string, playing: boolean): void {
  const speed = playing ? 1.6 : 1;
  switch (id) {
    case 'mystery': {
      // A berry crewmate wanders a dark corridor; a flashlight cone sweeps; "?" pulses.
      ctx.fillStyle = '#2a1248';
      for (let i = 0; i < 4; i++) ctx.fillRect(s.x + ((i * 37 + t * 8 * speed) % (s.w + 20)) - 10, s.y + s.h - 6, 12, 2);
      const bx = s.x + s.w * (0.5 + 0.35 * Math.sin(t * 0.8 * speed));
      const by = s.y + s.h * 0.62;
      const dir = Math.cos(t * 0.8 * speed) >= 0 ? 1 : -1;
      const cone = ctx.createRadialGradient(bx, by, 2, bx, by, s.w * 0.45);
      cone.addColorStop(0, 'rgba(255, 246, 200, 0.55)');
      cone.addColorStop(1, 'rgba(255, 246, 200, 0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.arc(bx, by, s.w * 0.45, dir > 0 ? -0.45 : Math.PI - 0.45, dir > 0 ? 0.45 : Math.PI + 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(bx, by + Math.abs(Math.sin(t * 6 * speed)) * -1.5);
      traceShape(ctx, 'blueberry', 4.2);
      ctx.fillStyle = '#6ea1ff';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(dir * 1.2 - 1.6, -1.5, 3.2, 1.6);
      ctx.restore();
      // The suspicious one lurks in the shadows (red eyes).
      const lurk = 0.5 + 0.5 * Math.sin(t * 1.3);
      ctx.fillStyle = hexA('#ff4d5e', 0.4 + 0.6 * lurk);
      const lx = s.x + s.w * (dir > 0 ? 0.12 : 0.88);
      ctx.fillRect(lx - 2.5, s.y + s.h * 0.4, 1.6, 1.2);
      ctx.fillRect(lx + 1, s.y + s.h * 0.4, 1.6, 1.2);
      const q = 0.6 + 0.4 * Math.sin(t * 3);
      if (!playing) text(ctx, '?', s.x + s.w - 9, s.y + 7, 9 * q + 3, color, 900);
      if (!playing && Math.sin(t * 2.5) > 0) text(ctx, 'INSERT BERRY', s.x + s.w / 2, s.y + 6, 5, '#fde68a', 800);
      break;
    }
    case 'cab1': {
      // Berry Blaster: a ship firing at descending blobs.
      const sx = s.x + s.w / 2 + Math.sin(t * 1.7) * (s.w / 2 - 6);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(sx, s.y + s.h - 7);
      ctx.lineTo(sx - 3.5, s.y + s.h - 2);
      ctx.lineTo(sx + 3.5, s.y + s.h - 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const k = (t * 1.8 * speed + i / 3) % 1;
        ctx.fillRect(sx - 0.5, s.y + s.h - 8 - k * (s.h - 8), 1, 3);
      }
      ctx.fillStyle = '#e879f9';
      for (let i = 0; i < 4; i++) {
        const ex = s.x + 4 + ((i * 9 + t * 6) % (s.w - 8));
        const ey = s.y + 4 + ((i * 5 + t * 3) % (s.h * 0.45));
        ctx.beginPath();
        ctx.arc(ex, ey, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'cab2': {
      // Neon Drift: perspective road with streaming lane lines.
      const hx = s.x + s.w / 2;
      ctx.strokeStyle = hexA(color, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx - 2, s.y + 3);
      ctx.lineTo(s.x + 2, s.y + s.h);
      ctx.moveTo(hx + 2, s.y + 3);
      ctx.lineTo(s.x + s.w - 2, s.y + s.h);
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.9 * speed + i / 4) % 1;
        const y = s.y + 3 + k * k * (s.h - 3);
        ctx.fillRect(hx - 0.5 - k, y, 1 + k * 2, 1 + k * 2.5);
      }
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(hx - 3 + Math.sin(t * 1.3) * 5, s.y + s.h - 5, 6, 3);
      break;
    }
    case 'cab3': {
      // Glow Hockey: bouncing puck between two paddles.
      const px = s.x + 3 + Math.abs(((t * 22 * speed) % ((s.w - 6) * 2)) - (s.w - 6));
      const py = s.y + 3 + Math.abs(((t * 15 * speed) % ((s.h - 6) * 2)) - (s.h - 6));
      ctx.strokeStyle = hexA(color, 0.3);
      ctx.beginPath();
      ctx.moveTo(s.x + s.w / 2, s.y);
      ctx.lineTo(s.x + s.w / 2, s.y + s.h);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(s.x + 1.5, py - 3, 1.6, 6);
      ctx.fillRect(s.x + s.w - 3, py - 3 + Math.sin(t * 4) * 2, 1.6, 6);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      // Quill Quest: envelopes drifting down into an outbox.
      ctx.fillStyle = '#f8fafc';
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.5 * speed + i / 3) % 1;
        const x = s.x + 5 + ((i * 11) % (s.w - 12));
        const y = s.y + 2 + k * (s.h - 9);
        ctx.fillRect(x, y, 6, 4);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3, y + 2.2);
        ctx.lineTo(x + 6, y);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.fillRect(s.x + 3, s.y + s.h - 3, s.w - 6, 2);
      break;
    }
  }
}
