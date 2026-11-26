/**
 * 2D (simplified) view: top-down 2.5D canvas renderer for the waiting room
 * and matches. Baked map chunks, y-sorted berries, visibility-polygon fog of
 * war, flashlight cones, lamps and juicy particle effects.
 */
import { drawBerry, drawBody, drawEmoteBubble, drawNameplate, drawPet } from '../characters/draw2d';
import { castRay, Cell, type CompiledMap } from '../core/map';
import type { Cosmetics, MatchEvent, RoleId, Vec2 } from '../core/types';
import { lampPool, type VisionShape } from '../core/vision';
import { floorBase, hash2, mix, paintFloorTile, paintProp, paintPropLive, paintStation, paintVent, rgba, stationStyle } from './paint';

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
    const theme = map.def.theme;
    const x0 = cx * CHUNK - 1;
    const y0 = cy * CHUNK - 1;
    const x1 = Math.min(map.w, x0 + CHUNK + 2);
    const y1 = Math.min(map.h, y0 + CHUNK + 3);
    const voidCol = night ? '#05070f' : mix(theme.void, '#1b2540', 0.2);
    g.fillStyle = voidCol;
    g.fillRect(x0 * s, y0 * s, (CHUNK + 3) * s, (CHUNK + 3) * s);
    // starfield / texture in the void
    for (let i = 0; i < 30; i++) {
      const sx = (cx * CHUNK + hash2(cx * 31 + i, cy * 17) * CHUNK) * s;
      const sy = (cy * CHUNK + hash2(cx * 13, cy * 29 + i) * CHUNK) * s;
      g.fillStyle = `rgba(255,255,255,${0.15 + hash2(i, cx + cy) * 0.35})`;
      g.fillRect(sx, sy, s * 0.05, s * 0.05);
    }
    const hallBase = night ? mix(theme.hall, '#0b1022', 0.6) : mix(theme.hall, '#475569', 0.22);
    for (let ty = Math.max(0, y0); ty < y1; ty++)
      for (let tx = Math.max(0, x0); tx < x1; tx++) {
        const i = ty * map.w + tx;
        if (map.cells[i] === Cell.Void) continue;
        const ri = map.roomIdx[i]!;
        if (ri >= 0) {
          const room = map.def.rooms[ri]!;
          paintFloorTile(g, room.floor, tx, ty, s, floorBase(room.floor, room.color, night));
        } else paintFloorTile(g, 'tile', tx, ty, s, hallBase);
      }
    // Soft contact shadows along walls.
    for (let ty = Math.max(0, y0); ty < y1; ty++)
      for (let tx = Math.max(0, x0); tx < x1; tx++) {
        const i = ty * map.w + tx;
        if (map.cells[i] === Cell.Void) continue;
        if (ty > 0 && map.cells[i - map.w] === Cell.Void) {
          const gr = g.createLinearGradient(0, ty * s, 0, ty * s + s * 0.7);
          gr.addColorStop(0, 'rgba(10,15,40,0.28)');
          gr.addColorStop(1, 'rgba(10,15,40,0)');
          g.fillStyle = gr;
          g.fillRect(tx * s, ty * s, s, s * 0.7);
        }
        if (tx > 0 && map.cells[i - 1] === Cell.Void) {
          g.fillStyle = 'rgba(10,15,40,0.12)';
          g.fillRect(tx * s, ty * s, s * 0.25, s);
        }
      }
    // Props, vents, stations bases.
    const inChunk = (x: number, y: number, pad = 3) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
    for (const p of map.def.props) if (p.kind === 'rug' && inChunk(p.x, p.y)) paintProp(g, p, s, night);
    for (const v of map.def.vents) if (inChunk(v.x, v.y)) paintVent(g, v, s, night);
    for (const st of map.def.stations) if (inChunk(st.x, st.y)) paintStation(g, st, s, night);
    for (const p of map.def.props) if (p.kind !== 'rug' && inChunk(p.x, p.y)) paintProp(g, p, s, night);
    // Walls: raised blocks with a lit top and a darker south face.
    const wallTop = night ? mix(theme.wallTop, '#0b1022', 0.6) : theme.wallTop;
    const wallFace = night ? mix(theme.wall, '#0b1022', 0.65) : mix(theme.wall, '#0f172a', 0.15);
    const trim = theme.trim;
    for (const wi of map.walls) {
      const tx = wi % map.w;
      const ty = (wi / map.w) | 0;
      if (tx < x0 - 1 || tx > x1 || ty < y0 - 1 || ty > y1) continue;
      const below = ty + 1 < map.h && map.cells[wi + map.w] !== Cell.Void;
      g.fillStyle = wallTop;
      g.fillRect(tx * s, ty * s - s * 0.35, s + 0.5, s);
      if (below) {
        g.fillStyle = wallFace;
        g.fillRect(tx * s, ty * s + s * 0.65, s + 0.5, s * 0.35);
        g.fillStyle = rgba(trim, night ? 0.5 : 0.35);
        g.fillRect(tx * s, ty * s + s * 0.62, s + 0.5, s * 0.05);
      }
    }
    // Room name legends.
    if (s >= 14) {
      for (const room of map.def.rooms) {
        const [rx, ry, rw] = room.rect;
        const lx = rx + rw / 2;
        const ly = ry + 0.9;
        if (!inChunk(lx, ly, 8)) continue;
        g.font = `700 ${Math.max(9, s * 0.36)}px ui-sans-serif, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = night ? rgba(room.color, 0.55) : rgba(mix(room.color, '#0f172a', 0.35), 0.55);
        g.fillText(room.name.toUpperCase(), lx * s, ly * s);
      }
    }
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
        if (!c && built < 4) {
          c = { canvas: this.bakeChunk(map, cx, cy, s, night), used: now };
          this.chunks.set(k, c);
          built++;
        }
        if (!c) continue;
        c.used = now;
        this.ctx.drawImage(c.canvas as CanvasImageSource, cx * CHUNK * s, cy * CHUNK * s, CHUNK * s, CHUNK * s);
      }
    if (this.chunks.size > 48) {
      const sorted = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
      for (const [k] of sorted.slice(0, this.chunks.size - 40)) this.chunks.delete(k);
    }
  }

  render(f: FrameData, dt: number): void {
    const t0 = performance.now();
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
    // Closed doors (shutters).
    for (const d of f.map.def.doors) {
      if (!f.closedDoors.has(d.id)) continue;
      const [x, y, w, h] = d.rect;
      ctx.fillStyle = '#334155';
      ctx.fillRect(x * s, y * s, w * s, h * s);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = s * 0.08;
      for (let i = 0; i < w + h; i++) {
        ctx.beginPath();
        ctx.moveTo((x + i) * s, y * s);
        ctx.lineTo((x + i - h) * s, (y + h) * s);
        ctx.stroke();
      }
    }
    // Station highlights (your tasks, facilities in range).
    for (const st of f.map.def.stations) {
      if (!inView(st)) continue;
      const hl = f.highlight.has(st.id);
      const near = f.near === st.id;
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
      if (!hl && !near && style.icon !== 'button' && style.icon !== 'recharge' && style.icon !== 'critical') continue;
      const pulse = 0.5 + 0.5 * Math.sin(f.t * 4 + st.x);
      const col = hl ? '#fde047' : style.color;
      ctx.strokeStyle = rgba(col, near ? 0.95 : 0.45 + pulse * 0.35);
      ctx.lineWidth = s * (near ? 0.1 : 0.07);
      ctx.beginPath();
      ctx.arc(st.x * s, st.y * s, s * (0.55 + pulse * 0.08), 0, Math.PI * 2);
      ctx.stroke();
      if (hl) {
        ctx.fillStyle = rgba('#fde047', 0.9);
        ctx.beginPath();
        const by = st.y * s - s * (1.05 + 0.12 * Math.sin(f.t * 3));
        ctx.moveTo(st.x * s, by + s * 0.25);
        ctx.lineTo(st.x * s - s * 0.18, by);
        ctx.lineTo(st.x * s + s * 0.18, by);
        ctx.fill();
      }
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
          if (!p.ghost) {
            ctx.fillStyle = 'rgba(10,15,40,0.22)';
            ctx.beginPath();
            ctx.ellipse(p.pos.x * s, p.pos.y * s, s * 0.34, s * 0.12, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          if (p.local && !p.ghost) {
            ctx.strokeStyle = 'rgba(110,161,255,0.55)';
            ctx.lineWidth = s * 0.04;
            ctx.beginPath();
            ctx.ellipse(p.pos.x * s, p.pos.y * s, s * 0.42, s * 0.16, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          drawBerry(ctx, p.cosmetics, p.pos.x * s, p.pos.y * s, s / 40, {
            time: f.t + hash2(p.id.length, p.id.charCodeAt(1) || 0) * 10,
            moving: p.moving,
            dir,
            emote: p.emote ?? null,
            ghost: p.ghost,
            hold: p.hasGun ? 'gun' : p.flashlight !== undefined && f.night ? 'flashlight' : null,
            flashlightOn: !!p.flashlight,
            scared: p.scared,
          });
          if (p.emote) drawEmoteBubble(ctx, p.emote, p.pos.x * s, p.pos.y * s - s * 1.5, s / 40, f.t);
          drawNameplate(ctx, p.cosmetics.nameplate, p.name, p.pos.x * s, p.pos.y * s - s * 1.45, Math.max(0.7, s / 44));
          if (p.nameColor) {
            ctx.fillStyle = p.nameColor;
            ctx.beginPath();
            ctx.arc(p.pos.x * s, p.pos.y * s - s * 1.85, s * 0.07, 0, Math.PI * 2);
            ctx.fill();
          }
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
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();
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
    if (f.critical && !f.reducedMotion) {
      const a = 0.12 + 0.1 * Math.sin(f.t * 6);
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      g.addColorStop(0, 'rgba(239,68,68,0)');
      g.addColorStop(1, `rgba(239,68,68,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    // Off-screen tracker arrow.
    if (f.trackPos) this.edgeArrow(f.trackPos, s, cx, cy, '#38bdf8');
    this.frameMs = performance.now() - t0;
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
        const d = Math.min(radius, castRay(f.map, origin, a, radius, closed) + 0.35);
        pts.push(toFog({ x: origin.x + Math.cos(a) * d, y: origin.y + Math.sin(a) * d }));
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
    if (v.cone) {
      const pts = poly(v.cone.range, v.cone.dir - v.cone.halfAngle, v.cone.dir + v.cone.halfAngle, 40);
      cut(pts, v.cone.range);
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
    if (v.cone && f.night) {
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
      ctx.arc(ox, oy, v.cone.range * s, v.cone.dir - v.cone.halfAngle, v.cone.dir + v.cone.halfAngle);
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
