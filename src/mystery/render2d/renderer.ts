/**
 * 2D (simplified) view: top-down 2.5D canvas renderer for the waiting room
 * and matches. Baked map chunks, y-sorted berries, visibility-polygon fog of
 * war, flashlight cones, lamps and juicy particle effects.
 */
import { NAMEPLATE_BY_ID, paletteColor } from '../characters/catalog';
import { drawBerry, drawBody, drawEmoteBubble, drawPet } from '../characters/draw2d';
import { castRay, Cell, roomAt, type CompiledMap } from '../core/map';
import type { Cosmetics, MatchEvent, RoleId, Vec2 } from '../core/types';
import { lampPool, type VisionShape } from '../core/vision';
import { hash2, inked, paintProp, paintPropLive, paintStation, paintVent, paintVentShape, paintWorldFloor, rgba, softShadow, stationStyle, WORLD, worldFloorBase } from './paint';
import { PING_TTL } from '../core/match';
import { drawDottedRing, drawKeyHint, drawKillBadge, drawPing, drawNameTag, drawReportBadge, drawTaskArrow, drawVentArrow, easeOutBack, measureTag, PromptFader, type TagStyle } from './prompts';

const tagWidths = new Map<string, number>();
function measureTagCached(g: CanvasRenderingContext2D, name: string, h: number): number {
  const k = `${name}|${Math.round(h)}`;
  let w = tagWidths.get(k);
  if (w === undefined) {
    w = measureTag(g, name.slice(0, 20), h);
    if (tagWidths.size > 400) tagWidths.clear();
    tagWidths.set(k, w);
  }
  return w;
}
import { floorAt, paintDiagFloor, paintDoorSills, paintHallEdges, paintLavaGlow, paintRoomNames, paintVoidTile, paintWalls, paintWallShadows, WALL_H, worldInfo } from './world';

export interface DrawPlayer {
  id: string;
  name: string;
  cosmetics: Cosmetics;
  pos: Vec2;
  facing: number;
  moving: boolean;
  ghost: boolean;
  role?: RoleId;
  emote?: string | null;
  hasGun?: boolean;
  flashlight?: boolean;
  nameColor?: string;
  local?: boolean;
  scared?: boolean;
}

export interface FrameData {
  mode: 'lobby' | 'match';
  map: CompiledMap;
  t: number;
  focus: Vec2;
  players: DrawPlayer[];
  bodies: { id: string; cosmetics: Cosmetics; pos: Vec2 }[];
  projectiles: { id: string; pos: Vec2; dir: Vec2 }[];
  gunDrop: Vec2 | null;
  batteries: { id: string; pos: Vec2 }[];
  closedDoors: ReadonlySet<string>;
  litLanterns: ReadonlySet<string>;
  highlight: ReadonlySet<string>;
  near: string | null;
  vision: VisionShape | null;
  /** Lights Out ambience. */
  night: boolean;
  lightsSabotaged: boolean;
  critical: boolean;
  reducedMotion: boolean;
  highVisibility: boolean;
  footprints: boolean;
  trackPos: Vec2 | null;
  zoom: number;
  /** In-world prompts (filled in matches by client/frame; optional elsewhere). */
  prompts?: WorldPrompts;
  /** Live "look here" pings. */
  pings?: PingDraw[];
}

export interface PingDraw {
  /** Pinger id (also keys the animation). */
  id: string;
  /** Pinger position when visible (draws the pointer line), else null. */
  from: Vec2 | null;
  to: Vec2;
  /** Seconds since placed (smooth, client clock). */
  age: number;
  color: string;
  local: boolean;
}

export interface WorldPrompts {
  /** Player id the local killer would hit right now. */
  kill: string | null;
  /** Body id in report range. */
  report: string | null;
  /** Vent in range (not inside one). */
  vent: string | null;
  /** Vent the local player is hiding in. */
  inVent: string | null;
  /** Key-hint labels (empty strings on touch devices). */
  keys: { use: string; kill: string; report: string; vent: string };
}

/** Name tag style for a player (shared by the 2D and 3D views). */
export function tagStyleFor(p: Pick<DrawPlayer, 'name' | 'cosmetics' | 'nameColor' | 'local' | 'ghost'>): TagStyle {
  const pal = paletteColor(p.cosmetics.color);
  return {
    name: p.name,
    color: p.nameColor,
    avatar: pal.hex,
    avatarDark: pal.dark,
    ring: NAMEPLATE_BY_ID.get(p.cosmetics.nameplate)?.stops ?? ['#ffffff'],
    local: p.local,
    ghost: p.ghost,
  };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'drop' | 'seed' | 'spark' | 'puff' | 'ring' | 'text' | 'confetti';
  text?: string;
  g: number;
  rot?: number;
}

const CHUNK = 16;

/**
 * Wall runs whose lifted cap hangs over the floor to their north: a berry
 * standing against such a wall must be drawn behind its cap (2.5D depth),
 * so these runs are y-sorted with the entities and re-blitted from the baked
 * chunks. One entry per horizontal run of straight wall tiles.
 */
interface CapRun {
  y: number;
  x0: number;
  x1: number; // exclusive
}
const capRunCache = new WeakMap<CompiledMap, CapRun[]>();
function capRuns(map: CompiledMap): CapRun[] {
  let runs = capRunCache.get(map);
  if (runs) return runs;
  runs = [];
  const info = worldInfo(map);
  const { w, h, cells } = map;
  for (let ty = 1; ty < h; ty++) {
    let start = -1;
    for (let tx = 0; tx <= w; tx++) {
      const i = ty * w + tx;
      const on = tx < w && info.wall[i] === 1 && !info.diag[i] && cells[(ty - 1) * w + tx] !== Cell.Void;
      if (on && start < 0) start = tx;
      if (!on && start >= 0) {
        // Corner tiles at either end (the wall turning north) overlap the berry too.
        const wallAt = (x: number) => x >= 0 && x < w && info.wall[ty * w + x] === 1;
        runs.push({ y: ty, x0: wallAt(start - 1) ? start - 1 : start, x1: wallAt(tx) ? tx + 1 : tx });
        start = -1;
      }
    }
  }
  capRunCache.set(map, runs);
  return runs;
}

export class Renderer2D {
  private ctx: CanvasRenderingContext2D;
  private fog: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private chunks = new Map<string, { canvas: HTMLCanvasElement | OffscreenCanvas; used: number }>();
  private chunkScale = 0;
  private chunkMap = '';
  private chunkNight = false;
  private cam: Vec2 = { x: 0, y: 0 };
  private camInit = false;
  private shake = 0;
  private particles: Particle[] = [];
  private pets = new Map<string, Vec2>();
  private trails = new Map<string, { x: number; y: number; t: number }[]>();
  private flicker = 0;
  private fader = new PromptFader();
  private bitmaps = new Map<string, { c: HTMLCanvasElement | OffscreenCanvas; used: number }>();
  private frameNo = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  frameMs = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.fog = document.createElement('canvas');
    const f = this.fog.getContext('2d');
    if (!f) throw new Error('2D canvas unavailable');
    this.fogCtx = f;
  }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = Math.min(dpr, 2.5);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.fog.width = Math.round(w * this.dpr * 0.5);
    this.fog.height = Math.round(h * this.dpr * 0.5);
  }

  /** Pixels per tile on screen. */
  scale(zoom: number): number {
    const base = Math.min(this.w, this.h) / 13;
    return Math.max(18, Math.min(64, base)) * zoom;
  }

  fx(ev: MatchEvent, reducedMotion: boolean): void {
    const p = ev.pos;
    if (!p) return;
    const burst = (n: number, color: string, kind: Particle['kind'], speed = 3, size = 0.12, life = 0.9) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        this.particles.push({ x: p.x, y: p.y - 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life, max: life, size: size * (0.6 + Math.random() * 0.8), color, kind, g: 6 });
      }
    };
    switch (ev.type) {
      case 'kill': {
        const juice = ['#e11d48', '#be123c', '#f43f5e', '#7c3aed'][Math.floor(Math.random() * 4)]!;
        burst(18, juice, 'drop', 4, 0.14, 1.1);
        burst(10, '#fde68a', 'seed', 3, 0.07, 1.2);
        this.particles.push({ x: p.x, y: p.y - 0.4, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 1.6, color: '#ffffff', kind: 'ring', g: 0 });
        if (!reducedMotion) this.shake = Math.max(this.shake, 0.35);
        break;
      }
      case 'shot':
        burst(8, '#fde047', 'spark', 5, 0.08, 0.35);
        burst(4, '#e5e7eb', 'puff', 1, 0.3, 0.8);
        break;
      case 'misfire':
        burst(10, '#94a3b8', 'puff', 1.4, 0.35, 1);
        break;
      case 'vent':
        burst(10, '#94a3b8', 'puff', 1.6, 0.3, 0.7);
        break;
      case 'visual':
      case 'task':
        burst(12, '#fbbf24', 'confetti', 3, 0.09, 1);
        break;
      case 'gun.pickup':
        this.particles.push({ x: p.x, y: p.y - 1.4, vx: 0, vy: -0.6, life: 1.6, max: 1.6, size: 0.5, color: '#fbbf24', kind: 'text', text: 'HERO!', g: 0 });
        burst(14, '#fbbf24', 'spark', 3, 0.08, 0.8);
        break;
      case 'shield.hit':
        this.particles.push({ x: p.x, y: p.y - 0.5, vx: 0, vy: 0, life: 0.6, max: 0.6, size: 1.2, color: '#4ade80', kind: 'ring', g: 0 });
        break;
      case 'flicker':
        this.flicker = reducedMotion ? 0.3 : 1.2;
        break;
      case 'blackout':
        this.flicker = 0.8;
        break;
    }
  }

  private bakeChunk(map: CompiledMap, cx: number, cy: number, s: number, night: boolean): HTMLCanvasElement | OffscreenCanvas {
    const px = Math.ceil(CHUNK * s * this.dpr);
    const c: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), { width: px, height: px });
    const g = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (!g) return c;
    g.scale(this.dpr, this.dpr);
    g.translate(-cx * CHUNK * s, -cy * CHUNK * s);
    const info = worldInfo(map);
    const x0 = cx * CHUNK - 1;
    const y0 = cy * CHUNK - 1;
    const x1 = Math.min(map.w, x0 + CHUNK + 2);
    const y1 = Math.min(map.h, y0 + CHUNK + 3);
    g.fillStyle = night ? '#05070f' : WORLD.void;
    g.fillRect(x0 * s, y0 * s, (CHUNK + 3) * s, (CHUNK + 3) * s);
    // Void: space far out, purple rock / snow / lava near exterior zones.
    for (let ty = Math.max(0, y0); ty < y1; ty++)
      for (let tx = Math.max(0, x0); tx < x1; tx++) if (map.cells[ty * map.w + tx] === Cell.Void) paintVoidTile(g, info, map, tx, ty, s, night);
    paintLavaGlow(g, info, map, x0 - 2, y0 - 2, x1 + 2, y1 + 2, s);
    // Floors (cel-shaded plates / grates / carpets / exterior ground).
    for (let ty = Math.max(0, y0); ty < y1; ty++)
      for (let tx = Math.max(0, x0); tx < x1; tx++) {
        const i = ty * map.w + tx;
        if (map.cells[i] === Cell.Void) {
          const d = info.diag[i]!;
          if (d) paintDiagFloor(g, map, d, tx, ty, s, night);
          continue;
        }
        const f = floorAt(map, tx, ty);
        paintWorldFloor(g, f.style, tx, ty, s, worldFloorBase(f.style, f.accent, night));
      }
    paintWallShadows(g, map, x0, y0, x1, y1, s);
    paintHallEdges(g, info, map, x0, y0, x1, y1, s, night);
    paintDoorSills(g, map, x0, y0, x1, y1, s, night);
    // Room names painted on the floor like a map legend.
    if (s >= 14) paintRoomNames(g, map, x0, y0, x1, y1, s, night);
    // Props, vents, stations bases (inked).
    const inChunk = (x: number, y: number, pad = 3) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
    for (const p of map.def.props) if (p.kind === 'rug' && inChunk(p.x, p.y)) paintProp(g, p, s, night);
    for (const v of map.def.vents) if (inChunk(v.x, v.y)) paintVent(g, v, s, night);
    for (const st of map.def.stations) if (inChunk(st.x, st.y)) paintStation(g, st, s, night);
    for (const p of map.def.props) if (p.kind !== 'rug' && inChunk(p.x, p.y, 3 + Math.max(p.w ?? 1, p.h ?? 1) / 2)) paintProp(g, p, s, night);
    // Walls: riveted panels / wallpaper faces, dark caps, one ink pass.
    paintWalls(g, info, map, x0 - 1, y0 - 1, x1 + 1, y1 + 2, s, night);
    return c;
  }

  private drawMapLayer(map: CompiledMap, s: number, night: boolean, view: { x0: number; y0: number; x1: number; y1: number }): void {
    const key = `${map.def.id}`;
    if (this.chunkScale !== s * this.dpr || this.chunkMap !== key || this.chunkNight !== night) {
      this.chunks.clear();
      this.chunkScale = s * this.dpr;
      this.chunkMap = key;
      this.chunkNight = night;
    }
    let built = 0;
    const now = performance.now();
    for (let cy = Math.floor(view.y0 / CHUNK); cy <= Math.floor(view.y1 / CHUNK); cy++)
      for (let cx = Math.floor(view.x0 / CHUNK); cx <= Math.floor(view.x1 / CHUNK); cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK > map.w || cy * CHUNK > map.h) continue;
        const k = `${cx},${cy}`;
        let c = this.chunks.get(k);
        if (!c && built < 2) {
          c = { canvas: this.bakeChunk(map, cx, cy, s, night), used: now };
          this.chunks.set(k, c);
          built++;
        }
        if (!c) continue;
        c.used = now;
        this.ctx.drawImage(c.canvas as CanvasImageSource, cx * CHUNK * s, cy * CHUNK * s, CHUNK * s, CHUNK * s);
      }
    // Idle frames pre-bake one ring of chunks around the view, so walking
    // into a new area rarely has to bake (and hitch) on the spot.
    if (built === 0) {
      outer: for (let cy = Math.floor(view.y0 / CHUNK) - 1; cy <= Math.floor(view.y1 / CHUNK) + 1; cy++)
        for (let cx = Math.floor(view.x0 / CHUNK) - 1; cx <= Math.floor(view.x1 / CHUNK) + 1; cx++) {
          if (cx < 0 || cy < 0 || cx * CHUNK > map.w || cy * CHUNK > map.h) continue;
          const k = `${cx},${cy}`;
          if (this.chunks.has(k)) continue;
          this.chunks.set(k, { canvas: this.bakeChunk(map, cx, cy, s, night), used: now - 1 });
          break outer; // one per idle frame
        }
    }
    if (this.chunks.size > 64) {
      const sorted = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
      for (const [k] of sorted.slice(0, this.chunks.size - 56)) this.chunks.delete(k);
    }
  }

  render(f: FrameData, dt: number): void {
    const t0 = performance.now();
    this.frameNo++;
    const ctx = this.ctx;
    const s = this.scale(f.zoom);
    // Camera: smooth follow + look-ahead.
    if (!this.camInit) {
      this.cam = { ...f.focus };
      this.camInit = true;
    }
    const k = 1 - Math.exp(-dt * 8);
    this.cam.x += (f.focus.x - this.cam.x) * k;
    this.cam.y += (f.focus.y - this.cam.y) * k;
    this.shake = Math.max(0, this.shake - dt);
    this.flicker = Math.max(0, this.flicker - dt);
    const sh = f.reducedMotion ? 0 : this.shake * 0.25;
    const cx = this.cam.x + (Math.random() - 0.5) * sh;
    const cy = this.cam.y + (Math.random() - 0.5) * sh;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = f.night ? '#05070f' : f.map.def.theme.void;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(Math.round(this.w / 2 - cx * s), Math.round(this.h / 2 - cy * s));
    const view = { x0: cx - this.w / 2 / s - 1, y0: cy - this.h / 2 / s - 1, x1: cx + this.w / 2 / s + 1, y1: cy + this.h / 2 / s + 2 };
    this.drawMapLayer(f.map, s, f.night, view);
    const inView = (p: Vec2, pad = 2) => p.x > view.x0 - pad && p.x < view.x1 + pad && p.y > view.y0 - pad && p.y < view.y1 + pad;
    // Live prop details.
    for (const p of f.map.def.props) if ((p.kind === 'server' || p.kind === 'screen' || p.kind === 'console' || p.kind === 'arcade' || p.kind === 'turntable' || p.kind === 'fireplace') && inView(p)) paintPropLive(ctx, p, s, f.t, f.night);
    // Prompt visibility (eased in/out so nothing pops).
    const pr = f.prompts;
    const active = new Set<string>();
    for (const id of f.highlight) active.add(`task:${id}`);
    if (f.near) active.add(`near:${f.near}`);
    if (pr?.kill) active.add(`kill:${pr.kill}`);
    if (pr?.report) active.add(`report:${pr.report}`);
    if (pr?.vent && !pr.inVent) active.add(`vent:${pr.vent}`);
    if (pr?.inVent) active.add(`invent:${pr.inVent}`);
    for (const d of f.map.def.doors) if (f.closedDoors.has(d.id)) active.add(`door:${d.id}`);
    this.fader.update(active, dt, f.reducedMotion);
    const fade = (k: string) => this.fader.get(k);
    // Closed doors: hazard-striped shutters that slide down.
    for (const d of f.map.def.doors) {
      const k = easeOutBack(fade(`door:${d.id}`));
      if (k <= 0.001) continue;
      const [x, y, w, h] = d.rect;
      const top = (y - WALL_H) * s;
      const full = (h + 0.02) * s;
      const hh = full * Math.min(1, k);
      inked(ctx, x * s, top, w * s, full, Math.max(1.2, s * 0.06), (g) => {
        g.fillStyle = WORLD.capTop;
        g.fillRect(x * s, top, w * s, hh);
        g.save();
        g.beginPath();
        g.rect(x * s, top + hh - WALL_H * s, w * s, WALL_H * s);
        g.clip();
        g.fillStyle = WORLD.guideYellow;
        g.fillRect(x * s, top + hh - WALL_H * s, w * s, WALL_H * s);
        g.fillStyle = WORLD.ink;
        for (let i = -2; i < (w + WALL_H) / 0.4 + 2; i++) {
          const bx = (x + i * 0.4) * s;
          const by = top + hh;
          g.beginPath();
          g.moveTo(bx, by);
          g.lineTo(bx + 0.2 * s, by);
          g.lineTo(bx + (0.2 + WALL_H) * s, by - WALL_H * s);
          g.lineTo(bx + WALL_H * s, by - WALL_H * s);
          g.fill();
        }
        g.restore();
      });
    }
    // Floor-level markers: dotted rings under your tasks, a solid ring on the
    // station in reach, pulsing rings on facilities, orange vent outline.
    const rm = f.reducedMotion;
    for (const st of f.map.def.stations) {
      if (!inView(st)) continue;
      const lit = st.kind === 'lightLantern' && f.litLanterns.has(st.id);
      const style = stationStyle(st.kind);
      if (lit) {
        const g = ctx.createRadialGradient(st.x * s, st.y * s, 0, st.x * s, st.y * s, s * 2.4);
        g.addColorStop(0, 'rgba(253,224,71,0.55)');
        g.addColorStop(1, 'rgba(253,224,71,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(st.x * s, st.y * s, s * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      const kt = fade(`task:${st.id}`);
      const kn = fade(`near:${st.id}`);
      if (kt > 0) {
        const e = easeOutBack(kt);
        const pulse = rm ? 1 : 1 + Math.sin(f.t * 3 + st.x) * 0.04;
        ctx.save();
        ctx.globalAlpha = Math.min(1, kt * 1.4);
        this.blit('ring', st.x * s, st.y * s + s * 0.15, s * 1.7, s * 0.9, e * pulse, (g, w, h) => drawDottedRing(g, 0, 0, w * 0.46, h * 0.44, s * 0.055, 0));
        ctx.restore();
      }
      if (kn > 0) {
        const pulse = rm ? 0.5 : 0.5 + 0.5 * Math.sin(f.t * 5);
        const col = f.highlight.has(st.id) ? WORLD.task : style.color;
        ctx.save();
        ctx.globalAlpha = kn;
        ctx.lineWidth = s * 0.14;
        ctx.strokeStyle = rgba(WORLD.ink, 0.6);
        ctx.beginPath();
        ctx.ellipse(st.x * s, st.y * s + s * 0.15, s * (0.66 + pulse * 0.05), s * (0.36 + pulse * 0.03), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = s * 0.08;
        ctx.strokeStyle = col;
        ctx.stroke();
        ctx.restore();
      } else if (kt <= 0 && (style.icon === 'button' || style.icon === 'recharge' || style.icon === 'critical')) {
        const pulse = rm ? 0.5 : 0.5 + 0.5 * Math.sin(f.t * 3 + st.x);
        ctx.strokeStyle = rgba(style.color, 0.35 + pulse * 0.3);
        ctx.lineWidth = s * 0.06;
        ctx.beginPath();
        ctx.ellipse(st.x * s, st.y * s + s * 0.15, s * 0.62, s * 0.34, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const v of f.map.def.vents) {
      const k = Math.max(fade(`vent:${v.id}`), fade(`invent:${v.id}`));
      if (k <= 0 || !inView(v)) continue;
      const pulse = rm ? 0.6 : 0.6 + 0.4 * Math.sin(f.t * 6);
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.3);
      const night = f.night;
      // Orange outline around the vent; the outline "breathes" with a slight scale pulse.
      this.blit(`ventglow|${night ? 1 : 0}`, v.x * s, v.y * s, s * 1.6, s * 1.4, (0.94 + 0.06 * easeOutBack(k)) * (1 + 0.03 * pulse), (g) => {
        inked(g, -s * 0.7, -s * 0.6, s * 1.4, s * 1.2, s * 0.1, (h) => paintVentShape(h, 0, 0, s, night), WORLD.vent);
      });
      ctx.restore();
    }
    // Footprints (detective).
    if (f.footprints) {
      const now = f.t;
      for (const [id, trail] of this.trails) {
        const pl = f.players.find((p) => p.id === id);
        for (const fp of trail) {
          const age = now - fp.t;
          if (age > 4 || !pl || pl.local) continue;
          ctx.fillStyle = rgba('#2dd4bf', 0.35 * (1 - age / 4));
          ctx.beginPath();
          ctx.ellipse(fp.x * s - s * 0.07, fp.y * s, s * 0.05, s * 0.08, 0, 0, Math.PI * 2);
          ctx.ellipse(fp.x * s + s * 0.07, fp.y * s + s * 0.05, s * 0.05, s * 0.08, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    for (const p of f.players) {
      if (!p.moving || p.ghost) continue;
      const arr = this.trails.get(p.id) ?? [];
      const last = arr[arr.length - 1];
      if (!last || Math.hypot(last.x - p.pos.x, last.y - p.pos.y) > 0.6) {
        arr.push({ x: p.pos.x, y: p.pos.y + 0.05, t: f.t });
        if (arr.length > 30) arr.shift();
      }
      this.trails.set(p.id, arr);
    }
    // Entities (y-sorted).
    type Ent = { y: number; draw: () => void };
    const ents: Ent[] = [];
    for (const b of f.bodies) ents.push({ y: b.pos.y - 0.2, draw: () => drawBody(ctx, b.cosmetics, b.pos.x * s, b.pos.y * s, s / 40, f.t) });
    for (const bat of f.batteries)
      ents.push({
        y: bat.pos.y,
        draw: () => {
          const bob = Math.sin(f.t * 3 + bat.pos.x) * s * 0.08;
          ctx.fillStyle = '#facc15';
          ctx.shadowColor = '#facc15';
          ctx.shadowBlur = s * 0.4;
          ctx.fillRect(bat.pos.x * s - s * 0.15, bat.pos.y * s - s * 0.5 + bob, s * 0.3, s * 0.45);
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#713f12';
          ctx.fillRect(bat.pos.x * s - s * 0.06, bat.pos.y * s - s * 0.56 + bob, s * 0.12, s * 0.07);
        },
      });
    if (f.gunDrop) {
      const g = f.gunDrop;
      ents.push({
        y: g.y,
        draw: () => {
          const bob = Math.sin(f.t * 3) * s * 0.06;
          ctx.save();
          ctx.translate(g.x * s, g.y * s - s * 0.3 + bob);
          ctx.rotate(-0.3);
          ctx.fillStyle = '#fbbf24';
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = s * 0.5;
          ctx.fillRect(-s * 0.3, -s * 0.08, s * 0.6, s * 0.16);
          ctx.fillRect(-s * 0.28, 0, s * 0.14, s * 0.28);
          ctx.restore();
        },
      });
    }
    for (const p of f.players) {
      if (!inView(p.pos, 3)) continue;
      const dir: 1 | -1 = Math.cos(p.facing) >= 0 ? 1 : -1;
      // Pet follows with lag.
      if (p.cosmetics.pet && p.cosmetics.pet !== 'none' && !p.ghost) {
        const target = { x: p.pos.x - dir * 0.7, y: p.pos.y + 0.2 };
        const cur = this.pets.get(p.id) ?? target;
        const kk = 1 - Math.exp(-dt * 4);
        const np = { x: cur.x + (target.x - cur.x) * kk, y: cur.y + (target.y - cur.y) * kk };
        this.pets.set(p.id, np);
        ents.push({ y: np.y, draw: () => drawPet(ctx, p.cosmetics.pet, np.x * s, np.y * s, s / 40, f.t, dir) });
      }
      ents.push({
        y: p.pos.y,
        draw: () => {
          if (!p.ghost) softShadow(ctx, p.pos.x * s, p.pos.y * s + s * 0.02, s * 0.42, s * 0.15, 0.38);
          const pose = {
            time: f.t + hash2(p.id.length, p.id.charCodeAt(1) || 0) * 10,
            moving: p.moving,
            dir,
            emote: p.emote ?? null,
            ghost: p.ghost,
            hold: p.hasGun ? ('gun' as const) : p.flashlight !== undefined && f.night ? ('flashlight' as const) : null,
            flashlightOn: !!p.flashlight,
            aimY: Math.sin(p.facing),
            scared: p.scared,
          };
          const kk = fade(`kill:${p.id}`);
          if (kk > 0 && !p.ghost) {
            // Kill target: thick red outline around the whole berry.
            const pulse = f.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(f.t * 8);
            ctx.save();
            ctx.globalAlpha = Math.min(1, kk * 1.4);
            inked(ctx, p.pos.x * s - s, p.pos.y * s - s * 1.7, s * 2, s * 2.1, s * 0.075 * pulse * easeOutBack(kk), (g) => drawBerry(g, p.cosmetics, p.pos.x * s, p.pos.y * s, s / 40, pose), WORLD.kill);
            ctx.restore();
            if (kk < 1) drawBerry(ctx, p.cosmetics, p.pos.x * s, p.pos.y * s, s / 40, pose);
          } else drawBerry(ctx, p.cosmetics, p.pos.x * s, p.pos.y * s, s / 40, pose);
          if (p.emote) drawEmoteBubble(ctx, p.emote, p.pos.x * s, p.pos.y * s - s * 1.5, s / 40, f.t);
        },
      });
    }
    for (const pr of f.projectiles)
      ents.push({
        y: pr.pos.y,
        draw: () => {
          ctx.save();
          ctx.translate(pr.pos.x * s, pr.pos.y * s - s * 0.5);
          ctx.rotate(f.t * 20);
          ctx.fillStyle = '#e5e7eb';
          ctx.fillRect(-s * 0.25, -s * 0.04, s * 0.38, s * 0.08);
          ctx.fillStyle = '#7c2d12';
          ctx.fillRect(s * 0.1, -s * 0.06, s * 0.15, s * 0.12);
          ctx.restore();
        },
      });
    // Wall caps in front of anyone standing just north of a wall.
    for (const run of capRuns(f.map)) {
      if (run.x1 < view.x0 || run.x0 > view.x1 || run.y < view.y0 || run.y > view.y1 + 1) continue;
      const near = (p: Vec2) => p.y > run.y - 1.6 && p.y < run.y && p.x > run.x0 - 1 && p.x < run.x1 + 1;
      if (!f.players.some((p) => near(p.pos)) && !f.bodies.some((b) => near(b.pos)) && ![...this.pets.values()].some(near)) continue;
      ents.push({ y: run.y - 0.01, draw: () => this.blitCapRun(run, s) });
    }
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();
    // Pings sit over the scene (they are callouts, not props).
    if (f.pings) for (const pg of f.pings) drawPing(ctx, pg.from ? { x: pg.from.x * s, y: pg.from.y * s } : null, { x: pg.to.x * s, y: pg.to.y * s }, s, pg.age, PING_TTL, pg.color, f.reducedMotion);
    // Particles.
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.5;
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'ring') {
        ctx.strokeStyle = rgba(p.color, a);
        ctx.lineWidth = s * 0.08 * a;
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s, s * p.size * (1 - a) + s * 0.2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'text') {
        ctx.font = `900 ${s * p.size}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.fillStyle = rgba(p.color, a);
        ctx.fillText(p.text ?? '', p.x * s, p.y * s);
      } else if (p.kind === 'puff') {
        ctx.fillStyle = rgba(p.color, a * 0.5);
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s, s * p.size * (1.6 - a), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'confetti') {
        ctx.fillStyle = rgba(['#fbbf24', '#2f6fed', '#14b8a6', '#ec4899'][Math.floor(p.x * 10) % 4]!, a);
        ctx.fillRect(p.x * s, p.y * s, s * p.size, s * p.size * 0.6);
      } else {
        ctx.fillStyle = rgba(p.color, a);
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s, s * p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Tracker arrow target ring.
    if (f.trackPos) {
      ctx.strokeStyle = 'rgba(56,189,248,0.8)';
      ctx.lineWidth = s * 0.06;
      ctx.setLineDash([s * 0.2, s * 0.15]);
      ctx.beginPath();
      ctx.arc(f.trackPos.x * s, f.trackPos.y * s, s * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    // Lighting / fog of war.
    if (f.vision && !f.vision.all) this.drawFog(f, s, cx, cy);
    else if (f.night && f.mode === 'match') this.drawNightTint(0.25);
    {
      const v = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72);
      v.addColorStop(0, 'rgba(5,8,22,0)');
      v.addColorStop(1, 'rgba(5,8,22,0.38)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (f.critical) {
      // Red alert edge: pulses, or holds steady with reduced motion (never hidden).
      const a = f.reducedMotion ? 0.18 : 0.12 + 0.1 * Math.sin(f.t * 6);
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      g.addColorStop(0, 'rgba(239,68,68,0)');
      g.addColorStop(1, `rgba(239,68,68,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    // Name tags + in-world prompts stay crisp above fog and vignette.
    ctx.save();
    ctx.translate(Math.round(this.w / 2 - cx * s), Math.round(this.h / 2 - cy * s));
    this.drawOverlays(f, s, inView);
    ctx.restore();
    // Off-screen tracker arrow.
    if (f.trackPos) this.edgeArrow(f.trackPos, s, cx, cy, '#38bdf8');
    this.frameMs = performance.now() - t0;
  }

  /** Name tags, task arrows, report / kill / vent badges, vent travel arrows. */
  private drawOverlays(f: FrameData, s: number, inView: (p: Vec2, pad?: number) => boolean): void {
    const ctx = this.ctx;
    const rm = f.reducedMotion;
    const keys = f.prompts?.keys;
    const fade = (k: string) => this.fader.get(k);
    const pop = (k: number) => (rm ? Math.min(1, k) : easeOutBack(k));
    // Name tags (dark pill, avatar dot, local player outlined green).
    const tagH = Math.max(13, s * 0.34);
    for (const p of f.players) {
      if (!inView(p.pos, 3) || (p.ghost && !p.local && !f.players.find((q) => q.local)?.ghost)) continue;
      const lift = p.emote ? 1.95 : 1.5;
      const st = tagStyleFor(p);
      const tw = measureTagCached(ctx, st.name, tagH) + 8;
      this.blit(`tag|${st.name}|${st.color}|${st.avatar}|${st.ring.join()}|${st.local ? 1 : 0}|${st.ghost ? 1 : 0}`, p.pos.x * s, p.pos.y * s - s * lift, tw, tagH + 8, 1, (g) => drawNameTag(g, 0, -2, tagH, st));
    }
    // Task arrows (bob over the dotted ring) + "use" key hint on the station in reach.
    for (const st of f.map.def.stations) {
      if (!inView(st)) continue;
      const kt = fade(`task:${st.id}`);
      if (kt > 0) {
        const bob = rm ? 0 : Math.sin(f.t * 3.2 + st.x) * s * 0.12;
        ctx.save();
        ctx.globalAlpha = Math.min(1, kt * 1.4);
        const e = pop(kt);
        ctx.translate(st.x * s, st.y * s - s * 1.25 + bob);
        ctx.scale(e, e);
        this.blit('arrow', 0, 0, s * 0.7, s * 0.7, 1, (g) => drawTaskArrow(g, 0, -s * 0.02, s * 0.26));
        ctx.restore();
      }
      const kn = fade(`near:${st.id}`);
      if (kn > 0 && keys?.use) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, kn * 1.4);
        const e = pop(kn);
        ctx.translate(st.x * s + s * 0.55, st.y * s - s * 0.55);
        ctx.scale(e, e);
        this.blit(`key|${keys.use}`, 0, 0, s * 0.5, s * 0.5, 1, (g) => drawKeyHint(g, 0, 0, s * 0.2, keys.use));
        ctx.restore();
      }
    }
    // Report: burst badge over a body in range.
    for (const b of f.bodies) {
      const k = fade(`report:${b.id}`);
      if (k <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.4);
      const e = pop(k);
      const bob = rm ? 0 : Math.sin(f.t * 4) * s * 0.05;
      ctx.translate(b.pos.x * s, b.pos.y * s - s * 1.05 + bob);
      ctx.scale(e, e);
      const rk = keys?.report ?? '';
      this.blit(`report|${rk}`, 0, 0, s * 1.1, s * 1.1, 1, (g) => drawReportBadge(g, 0, 0, s * 0.42, 0, rk, true));
      ctx.restore();
    }
    // Kill target: berry-skull badge above the target's tag.
    for (const p of f.players) {
      const k = fade(`kill:${p.id}`);
      if (k <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.4);
      const e = pop(k);
      ctx.translate(p.pos.x * s, p.pos.y * s - s * 0.95);
      ctx.scale(e, e);
      const kk = keys?.kill ?? '';
      this.blit(`kill|${kk}`, 0, 0, s * 0.8, s * 0.8, 1, (g) => drawKillBadge(g, 0, 0, s * 0.3, kk));
      ctx.restore();
    }
    // Vent in reach: key hint; inside a vent: arrows to linked vents.
    for (const v of f.map.def.vents) {
      const kv = fade(`vent:${v.id}`);
      if (kv > 0 && keys?.vent) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, kv * 1.4);
        const e = pop(kv);
        ctx.translate(v.x * s - s * 0.55, v.y * s + s * 0.1);
        ctx.scale(e, e);
        this.blit(`key|${keys.vent}`, 0, 0, s * 0.5, s * 0.5, 1, (g) => drawKeyHint(g, 0, 0, s * 0.2, keys.vent));
        ctx.restore();
      }
      const ki = fade(`invent:${v.id}`);
      if (ki <= 0) continue;
      const e = pop(ki);
      for (const lid of v.links) {
        const lv = f.map.ventById.get(lid);
        if (!lv) continue;
        const a = Math.atan2(lv.y - v.y, lv.x - v.x);
        const pulse = rm ? 0 : Math.sin(f.t * 4) * 0.08;
        const r = (1.3 + pulse) * e;
        const roomId = roomAt(f.map, lv);
        const label = (roomId ? f.map.roomById.get(roomId)?.name : '') ?? '';
        ctx.save();
        ctx.globalAlpha = Math.min(1, ki * 1.4);
        drawVentArrow(ctx, (v.x + Math.cos(a) * r) * s, (v.y + Math.sin(a) * r) * s - s * 0.3, a, s * 0.28 * e, label.replace(/^.*?'s /, ''));
        ctx.restore();
      }
    }
  }

  /**
   * Cached bitmap blit: `draw` renders once (centred at 0,0 in a w×h CSS-px
   * box at device resolution), later frames just drawImage it. Keeps prompts,
   * tags and rings cheap on software rasterisers.
   */
  private blit(key: string, x: number, y: number, w: number, h: number, scale: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): void {
    const k = `${key}|${Math.round(w)}x${Math.round(h)}|${this.dpr}`;
    let e = this.bitmaps.get(k);
    if (!e) {
      const W = Math.max(1, Math.ceil(w * this.dpr));
      const H = Math.max(1, Math.ceil(h * this.dpr));
      const c: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
      const g = c.getContext('2d') as CanvasRenderingContext2D | null;
      if (g) {
        g.scale(this.dpr, this.dpr);
        g.translate(w / 2, h / 2);
        draw(g, w, h);
      }
      e = { c, used: 0 };
      this.bitmaps.set(k, e);
      if (this.bitmaps.size > 160) {
        const old = [...this.bitmaps.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, 40);
        for (const [ok] of old) this.bitmaps.delete(ok);
      }
    }
    e.used = this.frameNo;
    const sw = w * scale;
    const sh = h * scale;
    if (sw < 0.5 || sh < 0.5) return;
    this.ctx.drawImage(e.c as CanvasImageSource, x - sw / 2, y - sh / 2, sw, sh);
  }

  /** Re-draw a wall run's cap (and its top ink edge) from the baked chunks. */
  private blitCapRun(run: CapRun, s: number): void {
    const ink = Math.max(1.5, s * 0.075) / 2 / s; // half the wall ink width, in tiles
    // Slightly see-through, so whoever stands behind still reads as a silhouette.
    this.ctx.save();
    this.ctx.globalAlpha = 0.8;
    const wy0 = run.y - WALL_H - ink;
    const wy1 = run.y + 1 - WALL_H + ink;
    for (let cy = Math.floor(wy0 / CHUNK); cy <= Math.floor(wy1 / CHUNK); cy++)
      for (let cx = Math.floor(run.x0 / CHUNK); cx <= Math.floor((run.x1 - 0.001) / CHUNK); cx++) {
        const c = this.chunks.get(`${cx},${cy}`);
        if (!c) continue;
        const ox = cx * CHUNK;
        const oy = cy * CHUNK;
        const ax = Math.max(run.x0, ox);
        const bx = Math.min(run.x1, ox + CHUNK);
        const ay = Math.max(wy0, oy);
        const by = Math.min(wy1, oy + CHUNK);
        if (bx <= ax || by <= ay) continue;
        const k = c.canvas.width / CHUNK; // chunk px per tile
        this.ctx.drawImage(c.canvas as CanvasImageSource, (ax - ox) * k, (ay - oy) * k, (bx - ax) * k, (by - ay) * k, ax * s, ay * s, (bx - ax) * s, (by - ay) * s);
      }
    this.ctx.restore();
  }

  private drawNightTint(a: number): void {
    this.ctx.fillStyle = `rgba(5,8,20,${a})`;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  private edgeArrow(p: Vec2, s: number, cx: number, cy: number, color: string): void {
    const sx = this.w / 2 + (p.x - cx) * s;
    const sy = this.h / 2 + (p.y - cy) * s;
    if (sx > 20 && sx < this.w - 20 && sy > 20 && sy < this.h - 20) return;
    const a = Math.atan2(sy - this.h / 2, sx - this.w / 2);
    const r = Math.min(this.w, this.h) / 2 - 30;
    const ax = this.w / 2 + Math.cos(a) * r;
    const ay = this.h / 2 + Math.sin(a) * r;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.fill();
    ctx.restore();
  }

  /** Visibility polygon fog: darkness everywhere you can't see. */
  private drawFog(f: FrameData, s: number, cx: number, cy: number): void {
    const v = f.vision!;
    const fg = this.fogCtx;
    const fs = 0.5 * this.dpr; // fog canvas is half resolution
    const W = this.fog.width;
    const H = this.fog.height;
    const toFog = (p: Vec2) => ({ x: (this.w / 2 + (p.x - cx) * s) * fs, y: (this.h / 2 + (p.y - cy) * s) * fs });
    fg.globalCompositeOperation = 'source-over';
    const flick = this.flicker > 0 ? 0.2 * Math.abs(Math.sin(this.flicker * 30)) : 0;
    let base = f.night ? 0.95 : f.lightsSabotaged ? 0.92 : 0.8;
    if (f.highVisibility) base -= 0.18;
    fg.clearRect(0, 0, W, H);
    fg.fillStyle = f.night ? `rgba(3,5,16,${Math.min(1, base + flick)})` : `rgba(10,14,38,${Math.min(1, base + flick)})`;
    fg.fillRect(0, 0, W, H);
    fg.globalCompositeOperation = 'destination-out';
    const origin = f.focus;
    const o = toFog(origin);
    const closed = f.closedDoors;
    const poly = (radius: number, a0: number, a1: number, steps: number): Vec2[] => {
      const pts: Vec2[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        const hit = castRay(f.map, origin, a, radius, closed);
        const d = Math.min(radius, hit + 0.35);
        // Rays that stop on a wall to the north also reveal its (lifted) face.
        const up = hit < radius && Math.sin(a) < 0 ? WALL_H * Math.min(1, -Math.sin(a) * 1.6) : 0;
        pts.push(toFog({ x: origin.x + Math.cos(a) * d, y: origin.y + Math.sin(a) * d - up }));
      }
      return pts;
    };
    const cut = (pts: Vec2[], radius: number, center = o, alpha = 1) => {
      const g = fg.createRadialGradient(center.x, center.y, radius * s * fs * 0.55, center.x, center.y, radius * s * fs);
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      fg.fillStyle = g;
      fg.beginPath();
      fg.moveTo(center.x, center.y);
      for (const p of pts) fg.lineTo(p.x, p.y);
      fg.closePath();
      fg.fill();
    };
    if (v.radius > 0.05) cut(poly(v.radius, 0, Math.PI * 2, 120), v.radius);
    // Flashlight: three nested cuts (the outer ones fainter) feather the beam's edges.
    let beam: Vec2[] | null = null;
    if (v.cone) {
      const { dir, halfAngle, range } = v.cone;
      for (const [k, a] of [
        [1, 0.45],
        [0.8, 0.6],
        [0.6, 1],
      ] as const) {
        const pts = poly(range, dir - halfAngle * k, dir + halfAngle * k, Math.round(44 * k));
        if (k === 0.8) beam = pts;
        cut(pts, range, o, a);
      }
    }
    // World light pools (Lights Out): lamps, lanterns, recharge stations.
    if (f.night) {
      const pool = (p: Vec2, r: number, a = 0.85) => {
        const c = toFog(p);
        const g = fg.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * s * fs);
        g.addColorStop(0, `rgba(0,0,0,${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        fg.fillStyle = g;
        fg.beginPath();
        fg.arc(c.x, c.y, r * s * fs, 0, Math.PI * 2);
        fg.fill();
      };
      for (const l of f.map.def.lamps) pool(l, lampPool(l.r) * 1.15, 0.6);
      for (const st of f.map.def.stations) {
        if (st.kind === 'recharge') pool(st, 2.2, 0.8);
        if (st.kind === 'lightLantern' && f.litLanterns.has(st.id)) pool(st, 3.2, 0.85);
      }
      // Other players' flashlights glow.
      for (const p of f.players) if (p.flashlight && !p.local) pool(p.pos, 1.6, 0.6);
    }
    fg.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.fog, 0, 0, this.w, this.h);
    // Warm additive glow for flashlight beam.
    // Warm additive glow for the flashlight beam, clipped by the same rays (never through walls).
    if (v.cone && f.night && beam) {
      const ctx = this.ctx;
      const ox = this.w / 2 + (origin.x - cx) * s;
      const oy = this.h / 2 + (origin.y - cy) * s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, v.cone.range * s);
      g.addColorStop(0, 'rgba(255,236,170,0.22)');
      g.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      for (const p of beam) ctx.lineTo(p.x / fs, p.y / fs);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /** Screen-space position of a world point (for HUD prompts). */
  toScreen(p: Vec2, zoom: number): Vec2 {
    const s = this.scale(zoom);
    return { x: this.w / 2 + (p.x - this.cam.x) * s, y: this.h / 2 + (p.y - this.cam.y) * s };
  }

  dispose(): void {
    this.chunks.clear();
    this.particles = [];
  }
}
