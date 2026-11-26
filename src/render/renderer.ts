/**
 * Canvas 2D renderer. The static world (floors, walls, labels, tubes, prop
 * bodies) is baked into an offscreen layer per theme + resolution bucket;
 * every frame only blits the visible slice and draws the animated parts.
 */
import type { RoomId } from '../data/bots';
import { bubbleAlpha, layoutBubbles, type Rect } from '../engine/bubbles';
import type { Camera } from '../engine/camera';
import type { Simulation, SimBot } from '../engine/sim';
import { doorTilesLocal, propCenter, propRect, roomRect, ROOMS, ROOM_BY_ID, TILE, TUBE_ROUTES, tubePort, WORLD_H, WORLD_W, type Point } from '../engine/world';
import { THEMES, type ThemeTokens } from '../theme/tokens';
import { drawBerry } from '../mystery/characters/draw2d';
import { env as seasonEnv, drawOutdoors, drawTrees, lookFor, roomFloorTexture, setEnvironment, updateDrawParticles } from './seasonal';
import type { Season } from '../theme/environment';
import { createNightMaskCanvas, drawDaylight, drawLightFixtures, NIGHT_MASK_SCALE, nightFactor } from './daylight';
import { arcadeFloor, drawArcadeCarpet, drawTerrace, traceBuildingOutline } from './ground';
import { accentSpill, floorKeyLight, propShadow, propShadowShape, roomOcclusion, softShadow, wallBevel } from './lighting';
import { drawPropDynamic, drawPropStatic, ROOM_ACCENT, waveform } from './props';
import { drawGlow, hexA, roundRect } from './sprites';
import { MODEL_COLORS, type RenderView } from './view';
import type { RelayModel } from '../adapters/events';

type Ctx = CanvasRenderingContext2D;

export interface RenderOptions {
  selectedBot: string | null;
  selectedRoom: RoomId | null;
  hoverRoom: RoomId | null;
  hoverHotspot: { roomId: RoomId; propId: string } | null;
  showNames: boolean;
  /** Local hour (0–24, fractional) for the day/night cycle; omitted = noon. */
  hour?: number;
  /** Season theme for the grounds, trees and falling particles. */
  season?: Season;
}

const envVersion = () => seasonEnv.version;

/** World-px size of one static-layer chunk. */
export const CHUNK = 256;
/** Resolution ladder for chunk caches (device px per world px). */
export const SCALE_LADDER = [1.5, 2, 3, 4, 5] as const;
/** Pixel budget for cached chunks (~4 bytes each). */
export const CHUNK_PIXEL_BUDGET = 28_000_000;
/** Max chunks rasterized per frame (the 1× base layer fills gaps meanwhile). */
export const CHUNK_BUILDS_PER_FRAME = 3;

/**
 * Cache resolution for the current zoom × DPR. At ≤1.05 the single 1× base
 * layer is used (downscaling is cheap); above that, tiled chunks are rendered
 * at the next ladder step so blits are ~1:1 and never upscaled.
 */
export function cacheScaleFor(zoom: number, dpr: number): number {
  const d = zoom * dpr;
  if (d <= 1.05) return 1;
  return SCALE_LADDER.find((s) => s >= d * 0.97) ?? SCALE_LADDER[SCALE_LADDER.length - 1]!;
}

interface Chunk {
  image: CanvasImageSource;
  pixels: number;
  used: number;
}

/**
 * Rasterize into an OffscreenCanvas and freeze it as an ImageBitmap when the
 * platform supports it (immutable, GPU-friendly, no per-frame re-upload);
 * otherwise fall back to a regular canvas.
 */
function rasterize(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): { image: CanvasImageSource; pixels: number } {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const oc = new OffscreenCanvas(W, H);
      const c = oc.getContext('2d') as unknown as CanvasRenderingContext2D | null;
      if (c) {
        draw(c);
        return { image: oc.transferToImageBitmap(), pixels: W * H };
      }
    } catch {
      /* fall through */
    }
  }
  const canvas = makeCanvas(W, H);
  const c = canvas.getContext('2d');
  if (c) draw(c);
  return { image: canvas, pixels: W * H };
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

function releaseImage(img: CanvasImageSource | null): void {
  if (img && typeof (img as ImageBitmap).close === 'function') (img as ImageBitmap).close();
}

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
  private baseLayer: CanvasImageSource | null = null;
  private baseKey = '';
  private chunks = new Map<string, Chunk>();
  private chunkPixels = 0;
  private lastParticleAt = performance.now();
  /** Disable falling particles (reduced motion). */
  reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Screen-sized offscreen for the night light mask (created on first dusk). */
  private nightMask: CanvasRenderingContext2D | null = null;
  private envVersion = -1;
  /** Counters for perf overlays/tests. */
  stats = {
    staticBuilds: 0,
    chunkBuilds: 0,
    frames: 0,
    botsDrawn: 0,
    lights: 0,
  };

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

  /** Drop every cached static layer (e.g. after a theme change). */
  invalidate(): void {
    this.baseKey = '';
    for (const ch of this.chunks.values()) releaseImage(ch.image);
    this.chunks.clear();
    this.chunkPixels = 0;
  }

  get cachedChunks(): number {
    return this.chunks.size;
  }

  private ensureBase(theme: ThemeTokens): CanvasImageSource {
    if (this.baseLayer && this.baseKey === theme.name) return this.baseLayer;
    releaseImage(this.baseLayer);
    this.baseLayer = rasterize(WORLD_W, WORLD_H, (c) => drawStaticWorld(c, theme)).image;
    this.baseKey = theme.name;
    this.stats.staticBuilds++;
    return this.baseLayer;
  }

  private buildChunk(theme: ThemeTokens, scale: number, cx: number, cy: number): Chunk {
    // 1px world bleed on every side hides seams between neighbouring chunks.
    const size = CHUNK + 2;
    const r = rasterize(size * scale, size * scale, (c) => {
      c.scale(scale, scale);
      c.translate(-(cx * CHUNK - 1), -(cy * CHUNK - 1));
      drawStaticWorld(c, theme, {
        x: cx * CHUNK - 1,
        y: cy * CHUNK - 1,
        w: size,
        h: size,
      });
    });
    this.stats.chunkBuilds++;
    return { image: r.image, pixels: r.pixels, used: this.stats.frames };
  }

  private evictChunks(): void {
    if (this.chunkPixels <= CHUNK_PIXEL_BUDGET) return;
    const byAge = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [key, ch] of byAge) {
      if (this.chunkPixels <= CHUNK_PIXEL_BUDGET * 0.8) break;
      if (ch.used === this.stats.frames) continue; // never evict what's on screen
      this.chunks.delete(key);
      this.chunkPixels -= ch.pixels;
      releaseImage(ch.image);
    }
  }

  /** Blit the static world for the visible rect. */
  private drawStatic(theme: ThemeTokens, cam: Camera, vis: { x: number; y: number; w: number; h: number }): void {
    const ctx = this.ctx;
    const sx = Math.max(0, vis.x);
    const sy = Math.max(0, vis.y);
    const ex = Math.min(WORLD_W, vis.x + vis.w);
    const ey = Math.min(WORLD_H, vis.y + vis.h);
    if (ex <= sx || ey <= sy) return;
    const scale = cacheScaleFor(cam.zoom, this.dpr);
    const blitBase = () => {
      const base = this.ensureBase(theme);
      ctx.drawImage(base, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
    };
    if (scale === 1) {
      blitBase();
      return;
    }
    const c0 = Math.floor(sx / CHUNK);
    const r0 = Math.floor(sy / CHUNK);
    const c1 = Math.floor((ex - 0.001) / CHUNK);
    const r1 = Math.floor((ey - 0.001) / CHUNK);
    const ready: [number, number, Chunk][] = [];
    const missing: [number, number][] = [];
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const ch = this.chunks.get(`${theme.name}|${scale}|${cx},${cy}`);
        if (ch) ready.push([cx, cy, ch]);
        else missing.push([cx, cy]);
      }
    }
    if (missing.length) {
      // Build the chunks nearest the view center first; base layer fills the rest.
      const mx = (sx + ex) / 2 / CHUNK;
      const my = (sy + ey) / 2 / CHUNK;
      missing.sort((a, b) => Math.hypot(a[0] + 0.5 - mx, a[1] + 0.5 - my) - Math.hypot(b[0] + 0.5 - mx, b[1] + 0.5 - my));
      for (const [cx, cy] of missing.slice(0, CHUNK_BUILDS_PER_FRAME)) {
        const ch = this.buildChunk(theme, scale, cx, cy);
        this.chunks.set(`${theme.name}|${scale}|${cx},${cy}`, ch);
        this.chunkPixels += ch.pixels;
        ready.push([cx, cy, ch]);
      }
      if (missing.length > CHUNK_BUILDS_PER_FRAME) blitBase();
    }
    for (const [cx, cy, ch] of ready) {
      ch.used = this.stats.frames;
      ctx.drawImage(ch.image, cx * CHUNK - 1, cy * CHUNK - 1, CHUNK + 2, CHUNK + 2);
    }
    this.evictChunks();
  }

  render(sim: Simulation, cam: Camera, view: RenderView, alpha: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    const theme = THEMES[view.theme];
    const t = sim.time;
    this.stats.frames++;
    setEnvironment(opts.season ?? 'spring', nightFactor(opts.hour ?? 12));
    if (envVersion() !== this.envVersion) {
      this.envVersion = envVersion();
      this.invalidate();
    }
    cam.setViewport(this.cssW, this.cssH);

    // Background.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.world.void;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // World transform.
    const z = cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, (this.cssW / 2 - cam.x * cam.zoom) * this.dpr, (this.cssH / 2 - cam.y * cam.zoom) * this.dpr);
    ctx.imageSmoothingEnabled = true;

    // Seasonal outdoors (lawn / meadow / leaf litter / snow) around the building.
    const vis = cam.visibleRect();
    drawOutdoors(ctx, vis);
    // Static world (cached; only the visible slice is blitted).
    this.drawStatic(theme, cam, vis);
    drawTrees(ctx, vis);

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

    // Time of day: dusk warmth, night tint, lamp pools and lit windows.
    if (opts.hour !== undefined) {
      if (nightFactor(opts.hour) > 0.004 && !this.nightMask) this.nightMask = createNightMaskCanvas();
      // The light mask is all soft gradients, so it renders at 1/4 resolution and is upscaled.
      const q = NIGHT_MASK_SCALE;
      const mask = this.nightMask
        ? {
            ctx: this.nightMask,
            width: Math.ceil(this.canvas.width * q),
            height: Math.ceil(this.canvas.height * q),
            transform: [z * q, (this.cssW / 2 - cam.x * cam.zoom) * this.dpr * q, (this.cssH / 2 - cam.y * cam.zoom) * this.dpr * q] as [number, number, number],
            destW: this.canvas.width,
            destH: this.canvas.height,
          }
        : null;
      const ds = drawDaylight(ctx, vis, theme, opts.hour, t, mask);
      this.stats.lights = ds.lamps + ds.windows;
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

    // Bots (y-sorted), glow first for a soft neon bloom. At overview zoom the
    // sprites keep a minimum on-screen size so the crew stays readable.
    const bots = [...sim.bots.values()].sort((a, b) => a.y - b.y);
    const botScale = Math.min(1.8, Math.max(1, 0.62 / cam.zoom));
    const radius = 11 * botScale;
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = theme.name === 'light' ? 'source-over' : 'lighter';
    for (const bot of bots) {
      const p = lerpPos(bot, alpha);
      if (!inView(p.x, p.y)) continue;
      drawGlow(ctx, p.x, p.y, spriteOpts(bot, theme, t, opts, radius));
    }
    ctx.globalCompositeOperation = prevComp;
    this.stats.botsDrawn = 0;
    const namesOn = cam.zoom >= 0.55;
    for (const bot of bots) {
      const p = lerpPos(bot, alpha);
      if (!inView(p.x, p.y)) continue;
      drawBerryBot(ctx, bot, p.x, p.y, radius, t, spriteOpts(bot, theme, t, opts, radius));
      this.stats.botsDrawn++;
      if ((opts.showNames && namesOn) || bot.def.id === opts.selectedBot) drawNameTag(ctx, bot.def.name, p.x, p.y + radius + 12, theme, bot.def.id === opts.selectedBot);
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

    // Seasonal weather: petals, fireflies, leaves or snow.
    const now = performance.now();
    const pdt = Math.min(0.05, (now - this.lastParticleAt) / 1000);
    this.lastParticleAt = now;
    updateDrawParticles(ctx, vis, pdt, t, this.reducedMotion);

    // Room name chips (screen space) once baked labels get too small to read.
    this.drawRoomChips(cam, theme, opts);

    // Speech bubbles in screen space (crisp text at any zoom).
    this.drawBubbles(sim, cam, theme, alpha);
  }

  private drawRoomChips(cam: Camera, theme: ThemeTokens, opts: RenderOptions): void {
    const fade = Math.max(0, Math.min(1, (0.8 - cam.zoom) / 0.2));
    if (fade <= 0) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = '650 11px ui-sans-serif, system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const room of ROOMS) {
      const r = roomRect(room);
      // Sits exactly over the baked legend label (top-left, in the corridor) so the two never double up.
      const s = cam.worldToScreen(r.x, r.y - 12);
      if (s.x < -200 || s.x > this.cssW + 20 || s.y < -20 || s.y > this.cssH + 20) continue;
      const label = room.short;
      const tw = ctx.measureText(label).width;
      const w = tw + 24;
      const x = Math.round(s.x - 4);
      const y = Math.round(s.y - 9);
      const accent = ROOM_ACCENT[room.id];
      const sel = room.id === opts.selectedRoom;
      ctx.globalAlpha = fade;
      roundRect(ctx, x, y, w, 18, 9);
      ctx.fillStyle = hexA(theme.world.bubbleBg, 0.94);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = sel ? theme.accent : hexA(accent, 0.55);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x + 9, y + 9, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.world.bubbleInk;
      ctx.fillText(label, x + 16, y + 9.5);
    }
    ctx.globalAlpha = 1;
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
      return {
        x: s.x - w / 2,
        y: s.y - 30 * Math.max(0.6, Math.min(1.2, cam.zoom)),
        w,
        h: 22,
      };
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
  return {
    x: bot.prevX + (bot.x - bot.prevX) * alpha,
    y: bot.prevY + (bot.y - bot.prevY) * alpha,
  };
}

/** Name tag under a bot: a small pill so it reads on any floor (dark Arcade carpet included). */
function drawNameTag(ctx: Ctx, name: string, x: number, y: number, theme: ThemeTokens, selected: boolean): void {
  ctx.save();
  ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
  const w = ctx.measureText(name).width + 8;
  roundRect(ctx, x - w / 2, y - 6.5, w, 12, 6);
  ctx.fillStyle = hexA(theme.world.bubbleBg, theme.name === 'dark' ? 0.82 : 0.88);
  ctx.fill();
  if (selected) {
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = selected ? theme.accent : theme.world.bubbleInk;
  ctx.fillText(name, x, y + 0.5);
  ctx.restore();
}

function spriteOpts(bot: SimBot, theme: ThemeTokens, t: number, opts: RenderOptions, radius = 11) {
  return {
    radius,
    shape: bot.def.shape,
    color: bot.def.color,
    glowColor: bot.def.glowColor,
    starred: bot.def.starred,
    state: bot.state,
    time: t,
    phase: bot.phase,
    facing: bot.facing,
    selected: bot.def.id === opts.selectedBot,
    mood: bot.mood?.kind ?? null,
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

type Region = { x: number; y: number; w: number; h: number };

function hits(a: Region | undefined, x: number, y: number, w: number, h: number, pad = 0): boolean {
  if (!a) return true;
  return x - pad < a.x + a.w && x + w + pad > a.x && y - pad < a.y + a.h && y + h + pad > a.y;
}

/**
 * Draw the static world. With `region`, only geometry intersecting it is
 * drawn (used to rasterize individual cache chunks cheaply).
 */
export function drawStaticWorld(ctx: Ctx, theme: ThemeTokens, region?: Region): void {
  const w = theme.world;
  if (region) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.w, region.h);
    ctx.clip();
  }
  // The ground outside the building is transparent here: the seasonal
  // outdoors (drawn per frame underneath) shows through.

  // Outdoor terrace garden on the annex Void cells.
  drawTerrace(ctx, theme, region);

  // Corridor slab (core block + the corridor ring around the Arcade), lifted off
  // the ground by a soft drop shadow.
  softShadow(ctx, () => traceBuildingOutline(ctx), theme, 20, 3, 9, 0.035);
  traceBuildingOutline(ctx);
  ctx.fillStyle = w.corridor;
  ctx.fill();
  ctx.strokeStyle = w.corridorLine;
  ctx.stroke();
  // Window glass on the facade + corridor lamp fixtures (lit at night per frame).
  drawLightFixtures(ctx, theme, region);

  // Rooms.
  for (const room of ROOMS) {
    const r = roomRect(room);
    if (!hits(region, r.x, r.y - 24, r.w, r.h + 24, 24)) continue;
    const accent = ROOM_ACCENT[room.id];
    // Drop shadow: rooms sit a step above the corridor.
    softShadow(ctx, () => roundRect(ctx, r.x, r.y, r.w, r.h, 10), theme, 10, 1.5, 5, 0.04);
    // Floor.
    let floor = w.floor;
    const darkFloor = room.id === 'cutting' || room.id === 'arcade';
    if (room.id === 'cutting') floor = theme.name === 'light' ? '#20242f' : theme.name === 'soft' ? '#262a33' : '#0c0f16';
    if (room.id === 'arcade') {
      drawArcadeCarpet(ctx, room, theme);
      floorKeyLight(ctx, r, theme, '#ff8fe6', true);
    } else if (room.id === 'cutting') {
      ctx.fillStyle = floor;
      roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      floorKeyLight(ctx, r, theme, '#ffffff', darkFloor);
    } else {
      // Marion Mystery floor materials (tile, wood, carpet, metal, rug…).
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.clip();
      ctx.drawImage(roomFloorTexture(room, accent, floor), r.x, r.y, r.w, r.h);
      if (theme.name !== 'light') {
        ctx.fillStyle = `rgba(6,10,24,${theme.name === 'dark' ? 0.45 : 0.22})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      ctx.restore();
      floorKeyLight(ctx, r, theme, '#ffffff', darkFloor);
    }
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
    // Ambient occlusion where floor meets wall.
    roomOcclusion(ctx, r, theme, darkFloor);

    // Walls (with door gaps; thresholds match this room's floor).
    drawWalls(ctx, room.x, room.y, room.w, room.h, w.wall, room.id === 'arcade' ? arcadeFloor(theme) : room.id === 'cutting' ? floor : w.door, theme);
    // Accent strip along the top wall, spilling a little coloured light onto the floor.
    accentSpill(ctx, r, accent, theme);
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
    if (region) {
      const xs = route.points.map((p) => p.x);
      const ys = route.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      if (!hits(region, minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY, 10)) continue;
    }
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = hexA('#6ea1ff', theme.name === 'dark' ? 0.16 : 0.15);
    ctx.lineWidth = 8;
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
  for (const room of ROOMS) {
    const r = roomRect(room);
    if (!hits(region, r.x, r.y, r.w, r.h, 16)) continue;
    for (const prop of room.props) {
      const shape = prop.blocking ? propShadowShape(prop.kind, propRect(room, prop)) : null;
      if (shape) propShadow(ctx, propRect(room, prop), theme, shape.inset, shape.radius);
      drawPropStatic(ctx, room, prop, theme);
    }
  }
  if (region) ctx.restore();
}

function drawWalls(ctx: Ctx, tx: number, ty: number, tw: number, th: number, wall: string, door: string, theme?: ThemeTokens): void {
  const x = tx * TILE;
  const y = ty * TILE;
  const w = tw * TILE;
  const h = th * TILE;
  ctx.save();
  // Marion Mystery-style 2.5D walls: thick body, a darker inner face under the
  // top wall (so rooms read as raised boxes) and a lit cap line.
  // Mystery's navy walls in light/soft themes; the dark theme keeps its own.
  const body = theme?.name === 'light' ? '#3a4874' : theme?.name === 'soft' ? '#59627f' : wall;
  ctx.strokeStyle = body;
  ctx.lineWidth = 10;
  roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 10);
  ctx.stroke();
  ctx.fillStyle = 'rgba(10,15,35,0.22)';
  ctx.fillRect(x + 10, y + 10, w - 20, 8);
  ctx.strokeStyle = theme?.name === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(150,170,220,0.95)';
  ctx.lineWidth = 2;
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 11);
  ctx.stroke();
  if (theme) wallBevel(ctx, { x, y, w, h }, theme);
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

/** HQ bots drawn as Marion berry characters (state badges kept). */
function drawBerryBot(ctx: Ctx, bot: SimBot, x: number, y: number, radius: number, t: number, o: ReturnType<typeof spriteOpts>): void {
  const scale = radius / 15;
  const look = lookFor(bot.def.id, bot.def.color);
  const emote = o.mood === 'cheer' ? 'cheer' : o.mood === 'play' ? 'dance' : o.mood === 'sulk' ? 'shrug' : bot.state === 'huddling' ? 'wave' : null;
  ctx.save();
  if (bot.state === 'asleep') ctx.globalAlpha = 0.75;
  if (o.selected) {
    ctx.strokeStyle = 'rgba(110,161,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + radius * 0.95, radius * 1.15, radius * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(10,15,40,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.95, radius * 0.9, radius * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  drawBerry(ctx, look, x, y + radius, scale, {
    time: t + bot.phase,
    moving: bot.state === 'walking',
    dir: bot.facing,
    emote,
    blink: bot.state === 'asleep',
  });
  ctx.restore();
  const top = y - radius * 1.9;
  if (bot.state === 'needs_input') {
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(x + radius * 0.9, top, 6 + Math.sin(t * 6) * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f1300';
    ctx.font = '900 9px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('!', x + radius * 0.9, top + 3.2);
  } else if (bot.state === 'asleep') {
    ctx.fillStyle = 'rgba(199,210,254,0.9)';
    ctx.font = `700 ${8 + Math.sin(t * 2) * 1.5}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('z', x + radius * 0.8, top + 2 - (t % 2) * 3);
    ctx.fillText('Z', x + radius * 1.2, top - 6 - (t % 2) * 3);
  } else if (bot.state === 'working') {
    ctx.fillStyle = o.color;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.4 + 0.6 * Math.max(0, Math.sin(t * 6 - i));
      ctx.beginPath();
      ctx.arc(x - 5 + i * 5, top + 2, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
