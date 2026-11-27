/**
 * Procedural room props. Each prop has a static part (baked into the offscreen
 * layer cache) and an optional dynamic part drawn every frame.
 */
import type { RoomId } from '../data/bots';
import { RETIRED_BOTS } from '../data/bots';
import type { Simulation } from '../engine/sim';
import { propRect, TILE, type PropDef, type RoomDef } from '../engine/world';
import type { ThemeTokens } from '../theme/tokens';
import { drawArcadeDynamic, drawArcadeStatic } from './arcadeProps';
import { drawBotSprite, hexA, roundRect, traceShape } from './sprites';
import { MODEL_COLORS, SKILL_COLORS, type RenderView } from './view';
import type { RelayModel, SkillId } from '../adapters/events';

type Ctx = CanvasRenderingContext2D;
type R = { x: number; y: number; w: number; h: number };

export const ROOM_ACCENT: Record<RoomId, string> = {
  command: '#2f6fed',
  huddle: '#14b8a6',
  engine: '#ef4444',
  bridge: '#8b5cf6',
  life: '#2f6fed',
  media: '#f59e0b',
  cutting: '#d946ef',
  mail: '#2f6fed',
  foundry: '#f97316',
  arcade: '#ec4899',
};

export interface DynCtx {
  t: number;
  theme: ThemeTokens;
  view: RenderView;
  sim: Simulation;
}

function slab(ctx: Ctx, r: R, th: ThemeTokens, inset = 3, radius = 6, fill?: string): void {
  roundRect(ctx, r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2, radius);
  ctx.fillStyle = fill ?? th.world.prop;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = th.world.propLine;
  ctx.stroke();
}

function screen(ctx: Ctx, x: number, y: number, w: number, h: number, th: ThemeTokens): void {
  roundRect(ctx, x, y, w, h, 3);
  ctx.fillStyle = th.world.screen;
  ctx.fill();
}

function label(ctx: Ctx, text: string, x: number, y: number, th: ThemeTokens, size = 8, color?: string, align: CanvasTextAlign = 'center'): void {
  ctx.save();
  ctx.font = `600 ${size}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = color ?? th.world.label;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Static props
// ---------------------------------------------------------------------------

export function drawPropStatic(ctx: Ctx, room: RoomDef, prop: PropDef, th: ThemeTokens): void {
  const r = propRect(room, prop);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  switch (prop.kind) {
    case 'arcade-cabinet':
    case 'leaderboard':
    case 'neon-sign':
      drawArcadeStatic(ctx, prop, r, th);
      break;
    case 'command-desk': {
      slab(ctx, r, th, 2, 8);
      screen(ctx, r.x + 14, r.y + 8, 40, 22, th);
      screen(ctx, r.x + 60, r.y + 8, 40, 22, th);
      screen(ctx, r.x + 106, r.y + 8, 32, 22, th);
      break;
    }
    case 'brain': {
      slab(ctx, { x: r.x + 10, y: r.y + r.h - 22, w: r.w - 20, h: 20 }, th, 0, 4, th.world.propDark);
      break;
    }
    case 'release-chute': {
      slab(ctx, r, th, 2, 8);
      ctx.fillStyle = th.world.propDark;
      roundRect(ctx, r.x + 10, r.y + 10, r.w - 20, 22, 4);
      ctx.fill();
      // Conveyor rollers.
      ctx.strokeStyle = th.world.propLine;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(r.x + 12 + i * 12, r.y + r.h - 22);
        ctx.lineTo(r.x + 12 + i * 12, r.y + r.h - 10);
        ctx.stroke();
      }
      break;
    }
    case 'plant': {
      // Terracotta pot with a rim, then a fan of two-tone leaves.
      ctx.fillStyle = th.name === 'dark' ? '#7c4a32' : '#d08a5c';
      roundRect(ctx, cx - 8, cy + 1, 16, 11, 3);
      ctx.fill();
      ctx.fillStyle = th.name === 'dark' ? '#93583c' : '#e3a073';
      roundRect(ctx, cx - 9.5, cy - 1, 19, 4, 2);
      ctx.fill();
      ctx.fillStyle = '#3a2a1e';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 7.5, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      const leaves: [number, number][] = [
        [-2.3, 11],
        [-1.6, 12],
        [-0.9, 13],
        [-0.25, 12],
        [0.5, 12.5],
        [1.2, 11],
      ];
      for (const [i, [a, len]] of leaves.entries()) {
        ctx.save();
        ctx.translate(cx, cy - 1);
        ctx.rotate(a - Math.PI / 2 + Math.PI / 2);
        ctx.fillStyle = i % 2 ? '#22c55e' : '#4ade80';
        ctx.beginPath();
        ctx.ellipse(0, -len / 2 - 1, 3.4, len / 2 + 1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,83,45,0.45)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(0, -1);
        ctx.lineTo(0, -len - 1);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'huddle-table': {
      // Chairs tucked around the table (drawn first so the table overlaps them).
      ctx.fillStyle = th.name === 'dark' ? '#253048' : th.name === 'soft' ? '#d7cfbf' : '#dde3ec';
      ctx.strokeStyle = th.world.propLine;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const sx = r.x + 30 + i * ((r.w - 60) / 3);
        for (const sy of [r.y - 2, r.y + r.h - 8]) {
          roundRect(ctx, sx - 9, sy, 18, 10, 4);
          ctx.fill();
          ctx.stroke();
        }
      }
      roundRect(ctx, r.x + 4, r.y + 6, r.w - 8, r.h - 12, 40);
      ctx.fillStyle = th.world.prop;
      ctx.fill();
      ctx.strokeStyle = th.world.propLine;
      ctx.stroke();
      roundRect(ctx, r.x + 24, r.y + 24, r.w - 48, r.h - 48, 24);
      ctx.strokeStyle = hexA('#14b8a6', 0.35);
      ctx.stroke();
      break;
    }
    case 'whiteboard': {
      slab(ctx, r, th, 2, 3, '#ffffff');
      ctx.strokeStyle = '#2f6fed';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(r.x + 10, r.y + 12);
      ctx.bezierCurveTo(r.x + 30, r.y + 6, r.x + 50, r.y + 22, r.x + 80, r.y + 12);
      ctx.stroke();
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(r.x + 90, r.y + 18);
      ctx.lineTo(r.x + 115, r.y + 10);
      ctx.stroke();
      break;
    }
    case 'terminal': {
      slab(ctx, r, th, 2, 5);
      screen(ctx, r.x + 8, r.y + 5, r.w - 16, r.h - 10, th);
      if (prop.label) label(ctx, prop.label, r.x + r.w - 12, r.y + r.h + 6, th, 7);
      break;
    }
    case 'polaroid-board': {
      slab(ctx, r, th, 2, 3, '#c8a77a');
      break;
    }
    case 'relay-rack': {
      slab(ctx, r, th, 2, 6, th.world.propDark);
      const models: RelayModel[] = ['claude-opus-auto', 'codex', 'gemini'];
      models.forEach((m, i) => {
        const y = r.y + 14 + i * 36;
        roundRect(ctx, r.x + 10, y, r.w - 20, 26, 4);
        ctx.fillStyle = th.world.prop;
        ctx.fill();
        ctx.strokeStyle = hexA(MODEL_COLORS[m], 0.6);
        ctx.stroke();
        label(ctx, m === 'claude-opus-auto' ? 'OPUS' : m === 'codex' ? 'CODEX' : 'GEMINI', r.x + r.w / 2, y + 19, th, 6.5);
      });
      break;
    }
    case 'violet-desk': {
      slab(ctx, r, th, 2, 8);
      ctx.strokeStyle = hexA('#8b5cf6', 0.8);
      ctx.lineWidth = 2;
      roundRect(ctx, r.x + 4, r.y + 4, r.w - 8, r.h - 8, 7);
      ctx.stroke();
      screen(ctx, r.x + 20, r.y + 12, 44, 24, th);
      screen(ctx, r.x + 72, r.y + 12, 44, 24, th);
      label(ctx, 'CO-PILOT', cx, r.y + r.h - 10, th, 7, '#8b5cf6');
      break;
    }
    case 'wave-indicator':
    case 'screens-board': {
      slab(ctx, r, th, 2, 4, th.world.propDark);
      if (prop.kind === 'screens-board') {
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = hexA('#a78bfa', 0.35 + i * 0.1);
          roundRect(ctx, r.x + 8 + i * 28, r.y + 8, 22, 16, 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'conduit': {
      ctx.fillStyle = hexA('#14b8a6', 0.06);
      ctx.fillRect(r.x, r.y + 8, r.w, r.h - 16);
      ctx.strokeStyle = hexA('#14b8a6', 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + 8);
      ctx.lineTo(r.x + r.w, r.y + 8);
      ctx.moveTo(r.x, r.y + r.h - 8);
      ctx.lineTo(r.x + r.w, r.y + r.h - 8);
      ctx.stroke();
      label(ctx, 'AGENT', r.x + 18, cy, th, 6.5, hexA('#ef4444', 0.8));
      label(ctx, 'LIFE', r.x + r.w - 16, cy, th, 6.5, hexA('#2f6fed', 0.9));
      break;
    }
    case 'planner-board': {
      slab(ctx, r, th, 2, 4, th.name === 'dark' ? '#0f1a33' : '#eef4ff');
      ctx.strokeStyle = hexA('#2f6fed', 0.5);
      ctx.beginPath();
      ctx.moveTo(cx, r.y + 4);
      ctx.lineTo(cx, r.y + r.h - 4);
      ctx.stroke();
      label(ctx, 'WORK', r.x + 22, r.y + 9, th, 6, '#2f6fed');
      label(ctx, 'AI', cx + 12, r.y + 9, th, 6, '#2f6fed');
      break;
    }
    case 'turntable': {
      slab(ctx, r, th, 2, 6, th.world.propDark);
      break;
    }
    case 'mic': {
      ctx.strokeStyle = th.world.propLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 12);
      ctx.lineTo(cx, cy - 2);
      ctx.stroke();
      ctx.fillStyle = th.world.propDark;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 13, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      roundRect(ctx, cx - 4, cy - 12, 8, 13, 4);
      ctx.fillStyle = '#64748b';
      ctx.fill();
      break;
    }
    case 'vault-cabinet': {
      roundRect(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 6);
      ctx.fillStyle = hexA('#93c5fd', th.name === 'dark' ? 0.08 : 0.18);
      ctx.fill();
      ctx.strokeStyle = hexA('#6ea1ff', 0.7);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.strokeStyle = hexA('#6ea1ff', 0.35);
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(r.x + 6, r.y + (r.h / 3) * i);
        ctx.lineTo(r.x + r.w - 6, r.y + (r.h / 3) * i);
        ctx.stroke();
      }
      break;
    }
    case 'mcp-door': {
      slab(ctx, r, th, 3, 4, th.world.propDark);
      label(ctx, 'MCP', cx, cy, th, 7, '#6ea1ff');
      break;
    }
    case 'life-desk': {
      slab(ctx, r, th, 2, 6);
      screen(ctx, cx - 18, r.y + 6, 36, r.h - 12, th);
      break;
    }
    case 'monitor-wall': {
      slab(ctx, r, th, 2, 4, th.world.propDark);
      break;
    }
    case 'llm-console': {
      slab(ctx, r, th, 2, 5);
      break;
    }
    case 'dimmer': {
      roundRect(ctx, cx - 7, cy - 12, 14, 24, 3);
      ctx.fillStyle = th.world.prop;
      ctx.fill();
      ctx.strokeStyle = th.world.propLine;
      ctx.stroke();
      break;
    }
    case 'fts-cabinet': {
      slab(ctx, r, th, 2, 5, th.world.propDark);
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = th.world.propLine;
        ctx.strokeRect(r.x + 8, r.y + 10 + i * 20, r.w - 16, 14);
      }
      label(ctx, 'FTS5', cx, r.y + r.h - 8, th, 6.5);
      break;
    }
    case 'intake-chute': {
      ctx.fillStyle = th.world.propDark;
      ctx.beginPath();
      ctx.moveTo(r.x + 4, r.y + 6);
      ctx.lineTo(r.x + r.w - 4, r.y + 6);
      ctx.lineTo(r.x + r.w - 18, r.y + r.h - 6);
      ctx.lineTo(r.x + 18, r.y + r.h - 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = hexA('#f59e0b', 0.7);
      ctx.stroke();
      break;
    }
    case 'couch': {
      const base = room.id === 'arcade' ? '#6d28d9' : th.name === 'dark' ? '#3b2a1a' : '#e8c9a0';
      const back = room.id === 'arcade' ? '#5b21b6' : th.name === 'dark' ? '#2e2014' : '#d9b483';
      const cushion = room.id === 'arcade' ? '#7c3aed' : th.name === 'dark' ? '#47331f' : '#f0d6b2';
      // Frame + backrest along the far side.
      roundRect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 3, 8);
      ctx.fillStyle = base;
      ctx.fill();
      ctx.strokeStyle = th.world.propLine;
      ctx.lineWidth = 1;
      ctx.stroke();
      roundRect(ctx, r.x + 4, r.y + 3, r.w - 8, 8, 4);
      ctx.fillStyle = back;
      ctx.fill();
      // Seat cushions with a soft highlight and seams.
      const n = Math.max(2, Math.round(r.w / 40));
      const cw = (r.w - 16) / n;
      for (let i = 0; i < n; i++) {
        roundRect(ctx, r.x + 8 + i * cw + 1, r.y + 12, cw - 2, r.h - 17, 4);
        ctx.fillStyle = cushion;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(r.x + 8 + i * cw + 4, r.y + 13, cw - 8, 2);
      }
      // Armrests.
      ctx.fillStyle = back;
      roundRect(ctx, r.x + 2, r.y + 6, 6, r.h - 9, 3);
      ctx.fill();
      roundRect(ctx, r.x + r.w - 8, r.y + 6, 6, r.h - 9, 3);
      ctx.fill();
      break;
    }
    case 'timeline-monitors': {
      slab(ctx, r, th, 2, 4, '#0b0e14');
      screen(ctx, r.x + 8, r.y + 6, r.w / 2 - 12, r.h - 12, th);
      screen(ctx, cx + 4, r.y + 6, r.w / 2 - 12, r.h - 12, th);
      break;
    }
    case 'jog-desk': {
      slab(ctx, r, th, 2, 6, '#1a1f2b');
      break;
    }
    case 'timeline-table': {
      slab(ctx, r, th, 2, 6, '#141925');
      break;
    }
    case 'clip-bins': {
      const bw = (r.w - 12) / 2;
      roundRect(ctx, r.x + 4, r.y + 6, bw, r.h - 12, 5);
      ctx.fillStyle = hexA('#22c55e', 0.15);
      ctx.fill();
      ctx.strokeStyle = hexA('#22c55e', 0.7);
      ctx.stroke();
      roundRect(ctx, r.x + 8 + bw, r.y + 6, bw, r.h - 12, 5);
      ctx.fillStyle = hexA('#94a3b8', 0.15);
      ctx.fill();
      ctx.strokeStyle = hexA('#94a3b8', 0.7);
      ctx.stroke();
      label(ctx, 'KEEP', r.x + 4 + bw / 2, r.y + r.h - 14, th, 6.5, '#22c55e');
      label(ctx, 'OUT', r.x + 8 + bw * 1.5, r.y + r.h - 14, th, 6.5, '#94a3b8');
      break;
    }
    case 'clapperboard': {
      ctx.fillStyle = '#111827';
      ctx.fillRect(cx - 10, cy - 6, 20, 16);
      ctx.save();
      ctx.translate(cx - 10, cy - 6);
      ctx.rotate(-0.25);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, -5, 20, 5);
      ctx.fillStyle = '#111827';
      for (let i = 0; i < 4; i++) ctx.fillRect(i * 5 + 1, -5, 2.5, 5);
      ctx.restore();
      break;
    }
    case 'render-lamp': {
      ctx.fillStyle = th.world.propDark;
      ctx.fillRect(cx - 3, cy, 6, 14);
      break;
    }
    case 'sorting-wall': {
      slab(ctx, r, th, 2, 4, th.world.propDark);
      const names = ['ACTION', 'FYI', 'NOISE'];
      const colors = ['#ef4444', '#6ea1ff', '#94a3b8'];
      const sw = (r.w - 8) / 3;
      names.forEach((n, i) => {
        roundRect(ctx, r.x + 4 + i * sw + 2, r.y + 5, sw - 4, r.h - 10, 3);
        ctx.fillStyle = th.world.prop;
        ctx.fill();
        ctx.strokeStyle = hexA(colors[i]!, 0.7);
        ctx.stroke();
        label(ctx, n, r.x + 4 + i * sw + sw / 2, r.y + r.h + 7, th, 6.5, colors[i]);
      });
      break;
    }
    case 'redpen-desk': {
      slab(ctx, r, th, 2, 6);
      break;
    }
    case 'stamp-press': {
      slab(ctx, r, th, 4, 8, th.world.propDark);
      break;
    }
    case 'outbox': {
      slab(ctx, r, th, 4, 4);
      label(ctx, 'OUTBOX', cx, r.y + r.h - 6, th, 6);
      break;
    }
    case 'tube-port': {
      slab(ctx, r, th, 3, 6, th.world.propDark);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = hexA('#6ea1ff', 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x + 16 + i * 32, cy, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'aura-bench': {
      slab(ctx, r, th, 2, 8);
      break;
    }
    case 'skill-wall': {
      slab(ctx, r, th, 2, 4, th.world.propDark);
      break;
    }
    case 'spawn-pod': {
      ctx.fillStyle = th.world.propDark;
      ctx.beginPath();
      ctx.arc(cx, cy, r.w / 2 - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA('#f97316', 0.7);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = hexA('#f97316', 0.3);
      ctx.beginPath();
      ctx.arc(cx, cy, r.w / 2 - 16, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'retired-shelf': {
      slab(ctx, r, th, 2, 5);
      ctx.strokeStyle = th.world.propLine;
      ctx.beginPath();
      ctx.moveTo(r.x + 6, cy);
      ctx.lineTo(r.x + r.w - 6, cy);
      ctx.stroke();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Dynamic props (animated every frame)
// ---------------------------------------------------------------------------

function glowRect(ctx: Ctx, r: R, color: string, strength: number, radius = 8): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18 * strength;
  ctx.strokeStyle = hexA(color, 0.6 * strength);
  ctx.lineWidth = 2;
  roundRect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, radius);
  ctx.stroke();
  ctx.restore();
}

function codeLines(ctx: Ctx, x: number, y: number, w: number, h: number, t: number, color: string, on: boolean): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = on ? color : hexA(color, 0.15);
  const lineH = 4;
  const offset = on ? (t * 14) % lineH : 0;
  for (let i = -1; i < h / lineH + 1; i++) {
    const len = ((i * 37 + Math.floor(t * (on ? 3 : 0))) % 7) / 7;
    ctx.fillRect(x + 3, y + i * lineH - offset + 2, Math.max(4, (w - 6) * (0.3 + len * 0.7)), 1.5);
  }
  ctx.restore();
}

export function drawPropDynamic(ctx: Ctx, room: RoomDef, prop: PropDef, d: DynCtx): void {
  const r = propRect(room, prop);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const { t, theme: th, view, sim } = d;
  switch (prop.kind) {
    case 'arcade-cabinet':
    case 'leaderboard':
    case 'neon-sign':
      drawArcadeDynamic(ctx, prop, r, d);
      break;
    case 'command-desk': {
      const daniel = sim.getBot('daniel');
      const active = daniel && daniel.state !== 'asleep';
      glowRect(ctx, r, '#ffffff', active ? 0.7 + 0.3 * Math.sin(t * 2) : 0.2, 8);
      codeLines(ctx, r.x + 14, r.y + 8, 40, 22, t, '#93c5fd', !!active);
      codeLines(ctx, r.x + 60, r.y + 8, 40, 22, t + 3, '#a7f3d0', !!active);
      codeLines(ctx, r.x + 106, r.y + 8, 32, 22, t + 7, '#fde68a', !!active);
      break;
    }
    case 'brain': {
      const py = r.y + r.h / 2 - 6;
      const g = ctx.createRadialGradient(cx, py, 2, cx, py, 26);
      g.addColorStop(0, hexA('#6ea1ff', 0.9));
      g.addColorStop(0.5, hexA('#2dd4bf', 0.35));
      g.addColorStop(1, hexA('#2dd4bf', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, py, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = th.name === 'dark' ? '#dbeafe' : '#2f6fed';
      ctx.beginPath();
      ctx.arc(cx, py, 8 + Math.sin(t * 2) * 1, 0, Math.PI * 2);
      ctx.fill();
      const orbiters = Math.min(10, 3 + view.command.brain);
      for (let i = 0; i < orbiters; i++) {
        const a = t * (0.8 + (i % 3) * 0.3) + (i / orbiters) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? '#2dd4bf' : '#6ea1ff';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 18, py + Math.sin(a) * 9, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'release-chute': {
      const since = sim.time - sim.marks.release;
      const stacked = Math.min(4, view.command.releases);
      for (let i = 0; i < stacked; i++) pkgBox(ctx, r.x + 14 + i * 18, r.y + r.h - 30, 14, th);
      if (since < 1.6) {
        const k = since / 1.6;
        const bx = r.x + 10 + k * (r.w - 40);
        pkgBox(ctx, bx, r.y + 14 + Math.min(1, k * 3) * 6, 20, th);
        if (since < 0.4) {
          ctx.fillStyle = hexA('#2f6fed', 0.85);
          roundRect(ctx, cx - 14, r.y + 2 + (1 - since / 0.4) * -6, 28, 10, 2);
          ctx.fill();
        }
      }
      label(ctx, '.pkg', cx, r.y + r.h - 6, th, 6.5);
      break;
    }
    case 'huddle-table': {
      if (view.command.huddling) {
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3);
        ctx.fillStyle = '#14b8a6';
        roundRect(ctx, r.x + 24, r.y + 24, r.w - 48, r.h - 48, 24);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'terminal': {
      const kanye = sim.getBot('kanye');
      const asleep = kanye?.state === 'asleep';
      const on = !asleep && (view.engine.queue > 0 || kanye?.state === 'working' || prop.id === 'term3');
      codeLines(ctx, r.x + 8, r.y + 5, r.w - 16, r.h - 10, t + r.x, '#4ade80', on);
      if (on) glowRect(ctx, r, '#ef4444', 0.35, 5);
      break;
    }
    case 'polaroid-board': {
      const n = Math.min(6, view.engine.polaroids);
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.translate(r.x + 14 + i * 18, cy);
        ctx.rotate(((i * 47) % 11) / 30 - 0.15);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-6, -8, 12, 14);
        ctx.fillStyle = ['#93c5fd', '#fda4af', '#a7f3d0', '#fde68a'][i % 4]!;
        ctx.fillRect(-5, -7, 10, 9);
        ctx.restore();
      }
      break;
    }
    case 'relay-rack': {
      const models: RelayModel[] = ['claude-opus-auto', 'codex', 'gemini'];
      const active = new Set(view.engine.activeModels);
      for (const b of sim.bots.values()) if (b.tether) active.add(b.tether.model);
      models.forEach((m, i) => {
        const y = r.y + 14 + i * 36;
        const on = active.has(m);
        ctx.fillStyle = on ? MODEL_COLORS[m] : hexA(MODEL_COLORS[m], 0.25);
        ctx.beginPath();
        ctx.arc(r.x + 18, y + 8, 3, 0, Math.PI * 2);
        ctx.fill();
        if (on) glowRect(ctx, { x: r.x + 8, y: y - 2, w: r.w - 16, h: 30 }, MODEL_COLORS[m], 0.6 + 0.3 * Math.sin(t * 5), 4);
      });
      break;
    }
    case 'violet-desk': {
      const moose = sim.getBot('moose');
      glowRect(ctx, r, '#8b5cf6', moose?.state === 'asleep' ? 0.2 : 0.55 + 0.2 * Math.sin(t * 1.7), 8);
      codeLines(ctx, r.x + 20, r.y + 12, 44, 24, t, '#c4b5fd', moose?.state !== 'asleep');
      codeLines(ctx, r.x + 72, r.y + 12, 44, 24, t + 2, '#99f6e4', moose?.state !== 'asleep');
      break;
    }
    case 'wave-indicator': {
      const active = sim.waveActive('bridge') || sim.waveActive('engine') || view.life.dictating;
      waveform(ctx, r.x + 8, cy, r.w - 16, active ? 7 : 0.8, t, active ? '#2dd4bf' : hexA('#94a3b8', 0.6));
      break;
    }
    case 'conduit': {
      ctx.save();
      ctx.strokeStyle = hexA('#2dd4bf', 0.7);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 10]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath();
      ctx.moveTo(r.x + 36, cy - 4);
      ctx.lineTo(r.x + r.w - 32, cy - 4);
      ctx.stroke();
      ctx.lineDashOffset = t * 40;
      ctx.strokeStyle = hexA('#6ea1ff', 0.6);
      ctx.beginPath();
      ctx.moveTo(r.x + 36, cy + 4);
      ctx.lineTo(r.x + r.w - 32, cy + 4);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'planner-board': {
      const work = view.life.cards.filter((c) => c.lane === 'work');
      const ai = view.life.cards.filter((c) => c.lane === 'ai');
      const drawLane = (cards: typeof work, x0: number) => {
        cards.slice(0, 6).forEach((c, i) => {
          const x = x0 + (i % 3) * 14;
          const y = r.y + 14 + Math.floor(i / 3) * 8;
          ctx.fillStyle = c.done ? '#4ade80' : th.name === 'dark' ? '#1e3a8a' : '#bfdbfe';
          roundRect(ctx, x, y, 12, 6, 1.5);
          ctx.fill();
        });
      };
      drawLane(work, r.x + 50);
      drawLane(ai, cx + 26);
      break;
    }
    case 'turntable': {
      const spinning = view.life.turntable && !view.life.dictating;
      const a = spinning ? t * 3.5 : 0;
      ctx.fillStyle = '#0b0e14';
      ctx.beginPath();
      ctx.arc(r.x + 34, cy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(r.x + 34, cy, 6 + i * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#2f6fed';
      ctx.beginPath();
      ctx.arc(r.x + 34, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(r.x + 34 + Math.cos(a) * 3, cy + Math.sin(a) * 3);
      ctx.lineTo(r.x + 34 + Math.cos(a) * 18, cy + Math.sin(a) * 18);
      ctx.stroke();
      // Tonearm lifts when ducked for dictation.
      ctx.strokeStyle = th.world.propLine;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(r.x + r.w - 14, r.y + 12);
      ctx.lineTo(view.life.dictating ? r.x + r.w - 22 : r.x + 48, view.life.dictating ? r.y + 22 : cy + 6);
      ctx.stroke();
      if (spinning) {
        for (let i = 0; i < 2; i++) {
          const k = (t * 0.7 + i * 0.5) % 1;
          label(ctx, '♪', r.x + r.w - 20 + k * 10, r.y + 10 - k * 16, th, 9, hexA('#6ea1ff', 1 - k));
        }
      }
      break;
    }
    case 'mic': {
      if (view.life.dictating) {
        for (let i = 0; i < 3; i++) {
          const k = (t * 1.2 + i / 3) % 1;
          ctx.strokeStyle = hexA('#2dd4bf', 1 - k);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy - 6, 6 + k * 22, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    }
    case 'vault-cabinet': {
      const n = Math.min(12, view.life.vault);
      for (let i = 0; i < n; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = r.x + 14 + col * 26;
        const y = r.y + 16 + row * 32;
        ctx.fillStyle = hexA('#6ea1ff', 0.55 + 0.25 * Math.sin(t * 2 + i));
        roundRect(ctx, x, y, 16, 8, 4);
        ctx.fill();
      }
      const since = sim.time - sim.marks.restored;
      if (since < 2) {
        ctx.save();
        ctx.globalAlpha = 1 - since / 2;
        ctx.fillStyle = '#2dd4bf';
        roundRect(ctx, cx - 26, r.y - 12, 52, 14, 7);
        ctx.fill();
        label(ctx, 'Restored', cx, r.y - 5, th, 7, '#04201c');
        ctx.restore();
      }
      if (view.life.archived > 0) label(ctx, `${view.life.archived} deleted`, cx, r.y + r.h - 8, th, 6.5);
      break;
    }
    case 'mcp-door': {
      const capsules = sim.packets.some((p) => p.kind === 'capsule');
      if (capsules) glowRect(ctx, r, '#6ea1ff', 0.6 + 0.4 * Math.sin(t * 8), 4);
      break;
    }
    case 'life-desk': {
      codeLines(ctx, cx - 18, r.y + 6, 36, r.h - 12, t, '#93c5fd', sim.getBot('barry')?.state !== 'asleep');
      break;
    }
    case 'monitor-wall': {
      // Reel (vertical) monitor.
      const rx = r.x + 10;
      ctx.fillStyle = '#0b0e14';
      roundRect(ctx, rx, r.y + 4, 22, r.h - 8, 3);
      ctx.fill();
      const hue = (t * 40) % 360;
      ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.9)`;
      ctx.fillRect(rx + 3, r.y + 7, 16, r.h - 14);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(rx + 3, r.y + r.h - 9, 16 * ((t * 0.3) % 1), 1.5);
      // YouTube (horizontal) monitor.
      const yx = r.x + 42;
      ctx.fillStyle = '#0b0e14';
      roundRect(ctx, yx, r.y + 4, r.w - 52, r.h - 8, 3);
      ctx.fill();
      const g = ctx.createLinearGradient(yx, 0, yx + r.w - 52, 0);
      g.addColorStop(0, '#1e293b');
      g.addColorStop((Math.sin(t) + 1) / 2, '#334155');
      g.addColorStop(1, '#0f172a');
      ctx.fillStyle = g;
      ctx.fillRect(yx + 3, r.y + 7, r.w - 58, r.h - 14);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(yx + (r.w - 52) / 2 - 4, cy - 5);
      ctx.lineTo(yx + (r.w - 52) / 2 + 6, cy);
      ctx.lineTo(yx + (r.w - 52) / 2 - 4, cy + 5);
      ctx.fill();
      ctx.fillRect(yx + 3, r.y + r.h - 9, (r.w - 58) * ((t * 0.12) % 1), 1.5);
      break;
    }
    case 'llm-console': {
      const local = view.media.llm === 'local';
      ctx.fillStyle = local ? '#22c55e' : hexA('#22c55e', 0.2);
      ctx.beginPath();
      ctx.arc(r.x + 16, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = !local ? '#6ea1ff' : hexA('#6ea1ff', 0.2);
      ctx.beginPath();
      ctx.arc(r.x + r.w - 16, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, 'LOCAL', r.x + 32, cy, th, 6, local ? th.world.label : hexA('#94a3b8', 0.5));
      label(ctx, 'CLOUD', r.x + r.w - 33, cy, th, 6, !local ? th.world.label : hexA('#94a3b8', 0.5));
      break;
    }
    case 'dimmer': {
      const pos = th.name === 'light' ? 0 : th.name === 'soft' ? 0.5 : 1;
      ctx.fillStyle = th.accent;
      roundRect(ctx, cx - 5, cy - 10 + pos * 14, 10, 6, 2);
      ctx.fill();
      break;
    }
    case 'fts-cabinet': {
      const n = Math.min(4, Math.ceil(view.media.insights / 2));
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i < n ? hexA('#22d3ee', 0.6 + 0.3 * Math.sin(t * 3 + i)) : hexA('#22d3ee', 0.12);
        ctx.fillRect(r.x + r.w - 16, r.y + 15 + i * 20, 5, 4);
      }
      break;
    }
    case 'intake-chute': {
      if (view.media.queued > 0) countBadge(ctx, r.x + r.w - 4, r.y + 4, view.media.queued, '#f59e0b');
      const since = sim.time - sim.marks.distill;
      if (since < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - since;
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 10 + since * 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'timeline-monitors': {
      const playhead = (t * 0.15) % 1;
      for (const [x0, w] of [
        [r.x + 8, r.w / 2 - 12],
        [cx + 4, r.w / 2 - 12],
      ] as const) {
        ctx.fillStyle = '#d946ef';
        ctx.fillRect(x0 + 3, cy - 3, w * 0.4, 2);
        ctx.fillStyle = '#22d3ee';
        ctx.fillRect(x0 + 3 + w * 0.45, cy + 1, w * 0.35, 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x0 + 3 + (w - 6) * playhead, r.y + 7, 1, r.h - 14);
      }
      break;
    }
    case 'jog-desk': {
      const greek = sim.getBot('greek');
      const a = greek?.state === 'working' ? t * 4 : 0;
      ctx.fillStyle = '#2a3142';
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d946ef';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 2, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i === Math.floor(t * 2) % 5 ? '#e879f9' : '#3b4357';
        ctx.fillRect(r.x + 10 + i * 9, cy - 3, 6, 6);
      }
      break;
    }
    case 'timeline-table': {
      // Magnetic timeline: queued clips snap in as colored blocks; render bar below.
      const n = Math.min(8, view.cutting.queued);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = ['#d946ef', '#22d3ee', '#f59e0b', '#4ade80'][i % 4]!;
        roundRect(ctx, r.x + 10 + i * 17, r.y + 12, 14, 12, 2);
        ctx.fill();
      }
      const barW = r.w - 20;
      ctx.fillStyle = '#0b0e14';
      roundRect(ctx, r.x + 10, r.y + r.h - 22, barW, 8, 4);
      ctx.fill();
      ctx.fillStyle = view.cutting.green ? '#22c55e' : '#d946ef';
      roundRect(ctx, r.x + 10, r.y + r.h - 22, Math.max(4, barW * view.cutting.render), 8, 4);
      ctx.fill();
      label(ctx, view.cutting.green ? 'RENDER GREEN' : `RENDER ${Math.round(view.cutting.render * 100)}%`, cx, r.y + r.h - 8, th, 6.5, '#cbd5e1');
      break;
    }
    case 'clip-bins': {
      const bw = (r.w - 12) / 2;
      const fill = (n: number) => Math.min(1, n / 10);
      ctx.fillStyle = hexA('#22c55e', 0.5);
      const kh = (r.h - 30) * fill(view.cutting.keepers);
      ctx.fillRect(r.x + 8, r.y + r.h - 22 - kh, bw - 8, kh);
      ctx.fillStyle = hexA('#94a3b8', 0.5);
      const oh = (r.h - 30) * fill(view.cutting.outtakes);
      ctx.fillRect(r.x + 12 + bw, r.y + r.h - 22 - oh, bw - 8, oh);
      break;
    }
    case 'render-lamp': {
      const green = view.cutting.green;
      const col = green ? '#22c55e' : view.cutting.render > 0 ? '#f59e0b' : '#64748b';
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = green ? 18 : 8;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy - 4, 7 + (green ? Math.sin(t * 4) : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      label(ctx, green ? 'TESTS PASSED' : 'RENDER', cx - 8, r.y + r.h + 6, th, 6, col);
      break;
    }
    case 'sorting-wall': {
      const sw = (r.w - 8) / 3;
      const counts = [view.mail.action, view.mail.fyi, view.mail.noise];
      counts.forEach((n, i) => {
        const shown = Math.min(5, n);
        for (let k = 0; k < shown; k++) {
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          roundRect(ctx, r.x + 8 + i * sw + k * 5, r.y + 9 + (k % 2), 12, 8, 1);
          ctx.fill();
          ctx.stroke();
        }
      });
      if (view.mail.noise >= 6) glowRect(ctx, { x: r.x + 4 + sw * 2, y: r.y, w: sw, h: r.h }, '#ef4444', 0.6 + 0.4 * Math.sin(t * 6), 4);
      if (view.mail.incoming > 0) countBadge(ctx, r.x + r.w, r.y + 2, view.mail.incoming, '#2f6fed');
      break;
    }
    case 'redpen-desk': {
      // Draft paper that visibly shrinks as Quill red-pens it.
      const words = view.mail.draftWords;
      if (words > 0) {
        const ratio = Math.max(0.25, Math.min(1, words / 180));
        const ph = (r.h - 16) * ratio;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        roundRect(ctx, r.x + 12, r.y + 8, 36, ph, 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        for (let y = r.y + 12; y < r.y + 8 + ph - 3; y += 4) ctx.fillRect(r.x + 15, y, 28, 1);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        const sy = r.y + 12 + ((t * 8) % Math.max(4, ph - 8));
        ctx.beginPath();
        ctx.moveTo(r.x + 15, sy);
        ctx.lineTo(r.x + 43, sy);
        ctx.stroke();
        // The red pen.
        ctx.save();
        ctx.translate(r.x + 52 + Math.sin(t * 6) * 3, sy - 4);
        ctx.rotate(0.7);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-1.5, -10, 3, 14);
        ctx.restore();
        label(ctx, `${words}w`, r.x + r.w - 18, r.y + r.h - 10, th, 7, '#ef4444');
      }
      break;
    }
    case 'stamp-press': {
      const since = sim.time - sim.marks.stamp;
      const down = since < 0.25 ? Math.sin((since / 0.25) * Math.PI) : 0;
      const pending = view.mail.pending > 0;
      if (pending) glowRect(ctx, r, '#d4a017', 0.6 + 0.4 * Math.sin(t * 5), 8);
      // Brass handle and head.
      ctx.fillStyle = '#b8860b';
      ctx.fillRect(cx - 3, r.y + 10, 6, 14 + down * 8);
      const hy = r.y + 24 + down * 8;
      const g = ctx.createLinearGradient(cx - 16, hy, cx + 16, hy + 14);
      g.addColorStop(0, '#f1c75b');
      g.addColorStop(1, '#a87b16');
      ctx.fillStyle = g;
      roundRect(ctx, cx - 16, hy, 32, 14, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, r.y + 9, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#d4a017';
      ctx.fill();
      if (pending) countBadge(ctx, r.x + r.w - 2, r.y + 2, view.mail.pending, '#d4a017');
      break;
    }
    case 'outbox': {
      const n = Math.min(5, view.mail.pending);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = '#fff7ed';
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        roundRect(ctx, r.x + 10 + i * 14, r.y + 8 - (i % 2) * 2, 12, 9, 1);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'tube-port': {
      if (view.mail.incoming > 0) {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = hexA('#6ea1ff', 0.25 + 0.25 * Math.sin(t * 6 + i));
          ctx.beginPath();
          ctx.arc(r.x + 16 + i * 32, cy, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'aura-bench': {
      const colors = ['#84cc16', '#f59e0b', '#f43f5e', '#10b981', '#0ea5e9', '#6366f1'];
      colors.forEach((c, i) => {
        const x = r.x + 14 + i * 18;
        const y = cy + Math.sin(t * 2 + i) * 2;
        ctx.save();
        ctx.shadowColor = c;
        ctx.shadowBlur = 8;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      break;
    }
    case 'skill-wall': {
      const all: SkillId[] = ['token-optimizer', 'claude-auto-mode', 'prompt-craft', 'zero-fluff-comms'];
      const since = sim.time - sim.marks.skill;
      all.forEach((s, i) => {
        const x = r.x + 10 + i * 36;
        const on = view.foundry.skills.includes(s);
        roundRect(ctx, x, r.y + 6, 28, r.h - 12, 3);
        ctx.fillStyle = on ? SKILL_COLORS[s] : hexA(SKILL_COLORS[s], 0.15);
        ctx.fill();
        if (on) {
          ctx.save();
          ctx.shadowColor = SKILL_COLORS[s];
          ctx.shadowBlur = 10 + 6 * Math.sin(t * 3 + i) + (since < 1 ? 20 * (1 - since) : 0);
          ctx.strokeStyle = SKILL_COLORS[s];
          ctx.stroke();
          ctx.restore();
        }
      });
      break;
    }
    case 'spawn-pod': {
      const since = sim.time - sim.marks.spawn;
      ctx.save();
      ctx.strokeStyle = hexA('#fb923c', 0.4 + 0.3 * Math.sin(t * 3));
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = t * 20;
      ctx.beginPath();
      ctx.arc(cx, cy, r.w / 2 - 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (since < 1.2) {
        ctx.save();
        ctx.globalAlpha = 1 - since / 1.2;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r.w / 2);
        g.addColorStop(0, '#fff7ed');
        g.addColorStop(1, hexA('#f97316', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      label(ctx, `${view.foundry.custom}/4`, cx, cy, th, 8, '#fb923c');
      break;
    }
    case 'retired-shelf': {
      RETIRED_BOTS.forEach((b, i) => {
        const x = r.x + 22 + i * 44;
        const y = cy - 10;
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = 0.55;
        traceShape(ctx, b.shape, 7, t);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.restore();
        label(ctx, `${b.name} ${b.daysLeft}d`, x, cy + 12, th, 6);
      });
      break;
    }
    default:
      break;
  }
}

function pkgBox(ctx: Ctx, x: number, y: number, s: number, th: ThemeTokens): void {
  ctx.fillStyle = '#e7d3a8';
  ctx.strokeStyle = 'rgba(120,80,20,0.5)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, s, s * 0.8, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = th.name === 'dark' ? '#6ea1ff' : '#2f6fed';
  ctx.fillRect(x + s * 0.35, y + s * 0.25, s * 0.3, s * 0.3);
}

function countBadge(ctx: Ctx, x: number, y: number, n: number, color: string): void {
  const text = n > 99 ? '99+' : String(n);
  ctx.save();
  ctx.font = '700 8px ui-sans-serif, system-ui';
  const w = Math.max(12, ctx.measureText(text).width + 7);
  roundRect(ctx, x - w / 2, y - 6, w, 12, 6);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

export function waveform(ctx: Ctx, x: number, y: number, w: number, amp: number, t: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= w; i += 2) {
    const k = i / w;
    const env = Math.sin(k * Math.PI);
    const v = Math.sin(k * 18 + t * 9) * 0.6 + Math.sin(k * 41 - t * 13) * 0.4;
    const yy = y + v * amp * env;
    if (i === 0) ctx.moveTo(x + i, yy);
    else ctx.lineTo(x + i, yy);
  }
  ctx.stroke();
  ctx.restore();
}

/** Draw a mini bot (used by the retired shelf + HUD previews). */
export function miniBot(ctx: Ctx, x: number, y: number, shape: Parameters<typeof traceShape>[1], color: string, glow: string, th: ThemeTokens, t: number): void {
  drawBotSprite(ctx, x, y, {
    shape,
    color,
    glowColor: glow,
    starred: false,
    state: 'idle',
    time: t,
    phase: 0,
    facing: 1,
    theme: th,
    radius: 8,
  });
}

export const TILE_PX = TILE;
