/**
 * Canvas 2D renderer. The static world (floors, walls, labels, tubes, prop
 * bodies) is baked into an offscreen layer per theme + resolution bucket;
 * every frame only blits the visible slice and draws the animated parts.
 */
import type { RoomId } from '../data/bots';
import { bubbleAlpha, layoutBubbles, type Rect } from '../engine/bubbles';
import type { Camera } from '../engine/camera';
import type { Simulation, SimBot } from '../engine/sim';
import {
  doorTilesLocal,
  MAP_H,
  MAP_W,
  propCenter,
  roomRect,
  ROOMS,
  ROOM_BY_ID,
  TILE,
  TUBE_ROUTES,
  tubePort,
  WORLD_H,
  WORLD_W,
  type Point,
} from '../engine/world';
import { THEMES, type ThemeTokens } from '../theme/tokens';
import { drawPropDynamic, drawPropStatic, ROOM_ACCENT, waveform } from './props';
import { drawBotSprite, drawGlow, hexA, roundRect } from './sprites';
import { MODEL_COLORS, type RenderView } from './view';
import type { RelayModel } from '../adapters/events';

type Ctx = CanvasRenderingContext2D;

export interface RenderOptions {
  selectedBot: string | null;
  selectedRoom: RoomId | null;
  hoverRoom: RoomId | null;
  hoverHotspot: { roomId: RoomId; propId: string } | null;
  showNames: boolean;
}

export const MAX_CACHE_PIXELS = 16_000_000;

/** Choose the offscreen cache resolution for the current zoom × DPR. */
export function cacheScaleFor(zoom: number, dpr: number): number {
  const want = zoom * dpr > 1.25 ? 2 : 1;
  const maxByArea = Math.sqrt(MAX_CACHE_PIXELS / (WORLD_W * WORLD_H));
  return Math.max(0.5, Math.min(want, maxByArea));
}

/** Mac project workstations the relay rack tethers out to (world px). */
export const MAC_STATIONS: Record<RelayModel, Point> = (() => {
  const engine = ROOM_BY_ID.engine;
  const x = TILE * 1.5;
  const y0 = engine.y * TILE + TILE * 3;
  return {
    'claude-opus-auto': { x, y: y0 },
    codex: { x, y: y0 + TILE * 3 },
    gemini: { x, y: y0 + TILE * 6 },
  };
})();

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export class Renderer {
  readonly ctx: Ctx;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private staticLayer: HTMLCanvasElement | null = null;
  private staticKey = '';
  /** Counters for perf overlays/tests. */
  stats = { staticBuilds: 0, frames: 0, botsDrawn: 0 };

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = Math.max(1, Math.min(3, dpr));
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
  }

  /** Force the static layer to rebuild (e.g. on theme change). */
  invalidate(): void {
    this.staticKey = '';
  }

  private ensureStatic(theme: ThemeTokens, scale: number): HTMLCanvasElement {
    const key = `${theme.name}@${scale}`;
    if (this.staticLayer && this.staticKey === key) return this.staticLayer;
    const layer = makeCanvas(WORLD_W * scale, WORLD_H * scale);
    const c = layer.getContext('2d');
    if (c) {
      c.scale(scale, scale);
      drawStaticWorld(c, theme);
    }
    this.staticLayer = layer;
    this.staticKey = key;
    this.stats.staticBuilds++;
    return layer;
  }

  render(sim: Simulation, cam: Camera, view: RenderView, alpha: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    const theme = THEMES[view.theme];
    const t = sim.time;
    this.stats.frames++;
    cam.setViewport(this.cssW, this.cssH);

    // Background.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.world.void;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // World transform.
    const z = cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, (this.cssW / 2 - cam.x * cam.zoom) * this.dpr, (this.cssH / 2 - cam.y * cam.zoom) * this.dpr);
    ctx.imageSmoothingEnabled = true;

    // Static layer (blit only the visible slice).
    const scale = cacheScaleFor(cam.zoom, this.dpr);
    const layer = this.ensureStatic(theme, scale);
    const vis = cam.visibleRect();
    const sx = Math.max(0, vis.x);
    const sy = Math.max(0, vis.y);
    const ex = Math.min(WORLD_W, vis.x + vis.w);
    const ey = Math.min(WORLD_H, vis.y + vis.h);
    if (ex > sx && ey > sy) {
      ctx.drawImage(layer, sx * scale, sy * scale, (ex - sx) * scale, (ey - sy) * scale, sx, sy, ex - sx, ey - sy);
    }

    const inView = (x: number, y: number, pad = 64) => x > vis.x - pad && y > vis.y - pad && x < vis.x + vis.w + pad && y < vis.y + vis.h + pad;

    // Selection + hover outlines.
    for (const id of [opts.selectedRoom, opts.hoverRoom]) {
      if (!id) continue;
      const r = roomRect(ROOM_BY_ID[id]);
      ctx.save();
      ctx.strokeStyle = hexA(theme.accent, id === opts.selectedRoom ? 0.9 : 0.35);
      ctx.lineWidth = id === opts.selectedRoom ? 2.5 : 1.5;
      roundRect(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 12);
      ctx.stroke();
      ctx.restore();
    }

    // Animated props.
    const dyn = { t, theme, view, sim };
    for (const room of ROOMS) {
      const rr = roomRect(room);
      if (rr.x > vis.x + vis.w || rr.y > vis.y + vis.h || rr.x + rr.w < vis.x || rr.y + rr.h < vis.y) continue;
      for (const prop of room.props) drawPropDynamic(ctx, room, prop, dyn);
    }

    if (opts.hoverHotspot) {
      const room = ROOM_BY_ID[opts.hoverHotspot.roomId];
      const prop = room.props.find((p) => p.id === opts.hoverHotspot!.propId);
      if (prop) {
        ctx.save();
        ctx.strokeStyle = theme.accent;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -t * 20;
        ctx.lineWidth = 1.5;
        roundRect(ctx, (room.x + prop.x) * TILE - 3, (room.y + prop.y) * TILE - 3, prop.w * TILE + 6, prop.h * TILE + 6, 8);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Dictation waves (bridge, engine, life).
    this.drawWaves(ctx, sim, view, theme, t);

    // Ambient darkness (theme-aware lighting); glows are added on top.
    if (theme.world.ambientDark > 0) {
      ctx.fillStyle = `rgba(4, 6, 12, ${theme.world.ambientDark * 0.55})`;
      ctx.fillRect(vis.x, vis.y, vis.w, vis.h);
    }

    // Tube packets.
    for (const pk of sim.packets) {
      const p = sim.packetPos(pk);
      if (!inView(p.x, p.y)) continue;
      ctx.save();
      ctx.shadowColor = pk.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = pk.color;
      const horiz = isHorizontalAt(pk.points, pk.t);
      roundRect(ctx, p.x - (horiz ? 8 : 4), p.y - (horiz ? 4 : 8), horiz ? 16 : 8, horiz ? 8 : 16, 4);
      ctx.fill();
      ctx.restore();
    }

    // Relay tethers.
    for (const bot of sim.bots.values()) {
      if (!bot.tether) continue;
      const bp = lerpPos(bot, alpha);
      const color = MODEL_COLORS[bot.tether.model];
      const rack = propCenter('engine', 'relay');
      const mac = MAC_STATIONS[bot.tether.model];
      ctx.save();
      ctx.strokeStyle = hexA(color, 0.8);
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.moveTo(bp.x, bp.y);
      ctx.quadraticCurveTo((bp.x + rack.x) / 2, Math.min(bp.y, rack.y) - 40, rack.x, rack.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rack.x, rack.y);
      ctx.quadraticCurveTo((rack.x + mac.x) / 2, rack.y - 120, mac.x, mac.y);
      ctx.stroke();
      ctx.restore();
    }

    // Bots (y-sorted), glow first for a soft neon bloom.
    const bots = [...sim.bots.values()].sort((a, b) => a.y - b.y);
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = theme.name === 'light' ? 'source-over' : 'lighter';
    for (const bot of bots) {
      const p = lerpPos(bot, alpha);
      if (!inView(p.x, p.y)) continue;
      drawGlow(ctx, p.x, p.y, spriteOpts(bot, theme, t, opts));
    }
    ctx.globalCompositeOperation = prevComp;
    this.stats.botsDrawn = 0;
    for (const bot of bots) {
      const p = lerpPos(bot, alpha);
      if (!inView(p.x, p.y)) continue;
      drawBotSprite(ctx, p.x, p.y, spriteOpts(bot, theme, t, opts));
      this.stats.botsDrawn++;
      if (opts.showNames || bot.def.id === opts.selectedBot) {
        ctx.save();
        ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = theme.world.label;
        ctx.fillText(bot.def.name, p.x, p.y + 24);
        ctx.restore();
      }
    }

    // Particles.
    for (const pt of sim.particles) {
      if (!inView(pt.x, pt.y)) continue;
      const k = 1 - pt.life / pt.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, k);
      if (pt.kind === 'ring') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 2 * k;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size + (1 - k) * 26, 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.kind === 'text' && pt.text) {
        ctx.font = `700 ${pt.size}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = pt.color;
        ctx.fillText(pt.text, pt.x, pt.y);
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * k + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Speech bubbles in screen space (crisp text at any zoom).
    this.drawBubbles(sim, cam, theme, alpha);
  }

  private drawWaves(ctx: Ctx, sim: Simulation, view: RenderView, theme: ThemeTokens, t: number): void {
    for (const w of sim.waves) {
      const src = w.source === 'life' ? propCenter('life', 'mic') : w.source === 'engine' ? propCenter('engine', 'term3') : propCenter('bridge', 'wave');
      const fade = w.active ? 1 : Math.max(0, 1 - (sim.time - (w.endedAt ?? sim.time)) / 1.5);
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.9 + i / 4) % 1;
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.7 * fade;
        ctx.strokeStyle = theme.teal;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(src.x, src.y, 10 + k * 70, -Math.PI * 0.85, -Math.PI * 0.15);
        ctx.stroke();
        ctx.restore();
      }
      // A soundwave travels along the Agent ↔ Life conduit.
      if (w.source !== 'life') {
        const b = ROOM_BY_ID.bridge;
        const y = (b.y + 6) * TILE;
        const x0 = (b.x + 1) * TILE;
        const span = (b.w - 2) * TILE;
        const pos = ((t * 0.5) % 1) * span;
        ctx.save();
        ctx.globalAlpha = fade;
        waveform(ctx, x0 + pos - 30, y, 60, 6, t, theme.teal);
        ctx.restore();
      }
    }
    if (view.life.dictating && !sim.waveActive('life')) {
      const src = propCenter('life', 'mic');
      ctx.save();
      ctx.globalAlpha = 0.6;
      waveform(ctx, src.x - 40, src.y - 30, 80, 6, t, theme.teal);
      ctx.restore();
    }
  }

  private drawBubbles(sim: Simulation, cam: Camera, theme: ThemeTokens, alpha: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = '500 11px ui-sans-serif, system-ui, -apple-system, sans-serif';
    const items = sim.bubbles.items.filter((b) => sim.bots.has(b.botId));
    const desired: Rect[] = items.map((b) => {
      const bot = sim.bots.get(b.botId)!;
      const p = lerpPos(bot, alpha);
      const s = cam.worldToScreen(p.x, p.y - 18);
      const w = Math.min(220, ctx.measureText(b.text).width + 16);
      return { x: s.x - w / 2, y: s.y - 30 * Math.max(0.6, Math.min(1.2, cam.zoom)), w, h: 22 };
    });
    const placed = layoutBubbles(desired);
    items.forEach((b, i) => {
      const r = placed[i]!;
      const anchor = desired[i]!;
      if (r.x > this.cssW || r.y > this.cssH || r.x + r.w < 0 || r.y + r.h < 0) return;
      const a = bubbleAlpha(b);
      ctx.save();
      ctx.globalAlpha = a;
      const border = b.crossBot ? theme.teal : theme.world.bubbleLine;
      roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.fillStyle = b.crossBot ? (theme.name === 'dark' ? '#0d2a28' : '#ecfdf9') : theme.world.bubbleBg;
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();
      // Tail toward the bot.
      const tx = Math.max(r.x + 10, Math.min(r.x + r.w - 10, anchor.x + anchor.w / 2));
      ctx.beginPath();
      ctx.moveTo(tx - 4, r.y + r.h - 0.5);
      ctx.lineTo(tx, r.y + r.h + 5);
      ctx.lineTo(tx + 4, r.y + r.h - 0.5);
      ctx.fill();
      ctx.fillStyle = b.crossBot ? theme.teal : theme.world.bubbleInk;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(b.text, r.x + 8, r.y + r.h / 2 + 0.5, r.w - 16);
      ctx.restore();
    });
  }
}

function isHorizontalAt(points: Point[], t: number): boolean {
  if (points.length < 2) return true;
  const seg = Math.min(points.length - 2, Math.floor(t * (points.length - 1)));
  const a = points[seg]!;
  const b = points[seg + 1]!;
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
}

export function lerpPos(bot: SimBot, alpha: number): Point {
  return { x: bot.prevX + (bot.x - bot.prevX) * alpha, y: bot.prevY + (bot.y - bot.prevY) * alpha };
}

function spriteOpts(bot: SimBot, theme: ThemeTokens, t: number, opts: RenderOptions) {
  return {
    shape: bot.def.shape,
    color: bot.def.color,
    glowColor: bot.def.glowColor,
    starred: bot.def.starred,
    state: bot.state,
    time: t,
    phase: bot.phase,
    facing: bot.facing,
    selected: bot.def.id === opts.selectedBot,
    carry: bot.carry,
    buffed: bot.buffUntil > t,
    theme,
  };
}

/** Bot under a world point (largest y wins so front-most is picked). */
export function pickBot(sim: Simulation, p: Point, radius = 18): SimBot | null {
  let best: SimBot | null = null;
  let bestD = radius * radius;
  for (const b of sim.bots.values()) {
    const d = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
    if (d <= bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Static world (baked)
// ---------------------------------------------------------------------------

export function drawStaticWorld(ctx: Ctx, theme: ThemeTokens): void {
  const w = theme.world;
  // Void + subtle map hatch (flat, plan-view drafting feel).
  ctx.fillStyle = w.void;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.strokeStyle = w.corridorLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -WORLD_H; i < WORLD_W; i += 24) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i + WORLD_H, WORLD_H);
  }
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Corridor slab.
  roundRect(ctx, TILE * 0.5, TILE * 0.5, (MAP_W - 1) * TILE, (MAP_H - 1) * TILE, 18);
  ctx.fillStyle = w.corridor;
  ctx.fill();
  ctx.strokeStyle = w.corridorLine;
  ctx.stroke();

  // Rooms.
  for (const room of ROOMS) {
    const r = roomRect(room);
    const accent = ROOM_ACCENT[room.id];
    // Floor.
    let floor = w.floor;
    if (room.id === 'cutting') floor = theme.name === 'light' ? '#20242f' : theme.name === 'soft' ? '#262a33' : '#0c0f16';
    ctx.fillStyle = floor;
    roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    ctx.fillStyle = hexA(accent, room.id === 'media' ? 0.07 : 0.035);
    ctx.fill();
    // Floor tile grid.
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.clip();
    ctx.strokeStyle = room.id === 'cutting' ? 'rgba(255,255,255,0.03)' : hexA(theme.name === 'dark' ? '#ffffff' : '#0f172a', 0.035);
    ctx.beginPath();
    for (let x = r.x; x <= r.x + r.w; x += TILE) {
      ctx.moveTo(x, r.y);
      ctx.lineTo(x, r.y + r.h);
    }
    for (let y = r.y; y <= r.y + r.h; y += TILE) {
      ctx.moveTo(r.x, y);
      ctx.lineTo(r.x + r.w, y);
    }
    ctx.stroke();
    ctx.restore();

    // Walls (with door gaps).
    drawWalls(ctx, room.x, room.y, room.w, room.h, w.wall, w.door);
    // Accent strip along the top wall.
    ctx.fillStyle = hexA(accent, 0.75);
    roundRect(ctx, r.x + TILE * 0.6, r.y + 4, TILE * 2.2, 3, 1.5);
    ctx.fill();

    // Room label (sits in the corridor above the room, map-legend style).
    ctx.font = '700 11px ui-sans-serif, system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(r.x + 6, r.y - 12, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = w.label;
    ctx.fillText(room.name.toUpperCase(), r.x + 15, r.y - 8);
  }

  // Pneumatic tubes (overhead glass).
  for (const route of TUBE_ROUTES) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = hexA('#6ea1ff', theme.name === 'dark' ? 0.16 : 0.18);
    ctx.lineWidth = 9;
    ctx.beginPath();
    route.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.strokeStyle = hexA('#ffffff', theme.name === 'dark' ? 0.08 : 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Tube ports on each room's top wall.
  for (const room of ROOMS) {
    const p = tubePort(room.id);
    ctx.fillStyle = w.floor;
    ctx.strokeStyle = hexA('#6ea1ff', 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Mac project workstations (relay targets) on the west wall.
  for (const [model, p] of Object.entries(MAC_STATIONS) as [RelayModel, Point][]) {
    roundRect(ctx, p.x - 16, p.y - 12, 32, 22, 4);
    ctx.fillStyle = w.prop;
    ctx.fill();
    ctx.strokeStyle = hexA(MODEL_COLORS[model], 0.7);
    ctx.stroke();
    ctx.fillStyle = w.screen;
    roundRect(ctx, p.x - 12, p.y - 9, 24, 13, 2);
    ctx.fill();
    ctx.fillStyle = w.propLine;
    ctx.fillRect(p.x - 4, p.y + 10, 8, 3);
  }

  // Prop bodies.
  for (const room of ROOMS) for (const prop of room.props) drawPropStatic(ctx, room, prop, theme);
}

function drawWalls(ctx: Ctx, tx: number, ty: number, tw: number, th: number, wall: string, door: string): void {
  const x = tx * TILE;
  const y = ty * TILE;
  const w = tw * TILE;
  const h = th * TILE;
  ctx.save();
  ctx.strokeStyle = wall;
  ctx.lineWidth = 6;
  roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 9);
  ctx.stroke();
  // Punch doors.
  ctx.strokeStyle = door;
  ctx.lineWidth = 8;
  ctx.lineCap = 'butt';
  const doors = doorTilesLocal();
  const groups: [Point, Point][] = [
    [doors[0]!, doors[1]!],
    [doors[2]!, doors[3]!],
    [doors[4]!, doors[5]!],
    [doors[6]!, doors[7]!],
  ];
  for (const [a, b] of groups) {
    ctx.beginPath();
    if (a.y === b.y) {
      const yy = y + (a.y === 0 ? 3 : h - 3);
      ctx.moveTo(x + a.x * TILE + 2, yy);
      ctx.lineTo(x + (b.x + 1) * TILE - 2, yy);
    } else {
      const xx = x + (a.x === 0 ? 3 : w - 3);
      ctx.moveTo(xx, y + a.y * TILE + 2);
      ctx.lineTo(xx, y + (b.y + 1) * TILE - 2);
    }
    ctx.stroke();
  }
  ctx.restore();
}
