/**
 * HQ controller: owns the simulation, camera, renderer and loop, and connects
 * them to the event bus. React components talk to this singleton; it never
 * imports React.
 */
import type { RoomId } from '../data/bots';
import { makeEvent, type EventPayloads, type MarionEvent, type MarionEventType } from '../adapters/events';
import { Camera } from '../engine/camera';
import { GameLoop } from '../engine/loop';
import { Simulation, type SimBot, type SimEffect } from '../engine/sim';
import { roomRect, ROOM_BY_ID, WORLD_H, WORLD_W } from '../engine/world';
import { Renderer, type RenderOptions } from '../render/renderer';
import { localHour } from '../render/daylight';
import { emptyView, type RenderView } from '../render/view';
import { EventBus } from './bus';

export type Ticker = (dtMs: number) => void;

/** What the HQ loop draws with: the 2D floorplan or the 3D diorama. */
export interface HqRenderer {
  render(sim: Simulation, cam: Camera, view: RenderView, alpha: number, opts: RenderOptions): void;
  resize(cssW: number, cssH: number, dpr: number): void;
  invalidate(): void;
  /** Ground point under a screen point (defaults to the 2D camera mapping). */
  screenToWorld?(sx: number, sy: number): { x: number; y: number };
  /** Screen-space bot picking (3D bodies stand up off the floor). */
  pickBotScreen?(sim: Simulation, sx: number, sy: number): SimBot | null;
  dispose?(): void;
}

export class HQ {
  readonly bus = new EventBus();
  readonly sim: Simulation;
  readonly camera = new Camera(WORLD_W, WORLD_H);
  readonly loop: GameLoop;
  renderer: HqRenderer | null = null;
  paused = false;
  speed = 1;
  /** Fixed hour for the day/night cycle (e.g. 22.5), or null to follow the local clock. */
  clockOverride: number | null = null;
  private clockHour = 12;
  private clockReadAt = -1;
  /** True while a full-screen Arcade game covers the HQ: simulate, don't paint. */
  renderSuspended = false;
  /** Keys currently held for WASD/arrow panning. */
  readonly keys = new Set<string>();
  ui: RenderOptions = {
    selectedBot: null,
    selectedRoom: null,
    hoverRoom: null,
    hoverHotspot: null,
    showNames: true,
  };
  getView: () => RenderView = () => emptyView();
  private tickers = new Set<Ticker>();
  private effectListeners = new Set<(e: SimEffect) => void>();
  private frameListeners = new Set<(fps: number) => void>();
  private frameCount = 0;

  constructor(sim?: Simulation) {
    this.sim = sim ?? new Simulation();
    this.sim.onEffect = (e) => this.effectListeners.forEach((fn) => fn(e));
    this.bus.subscribe((ev) => this.sim.apply(ev));
    this.loop = new GameLoop({
      update: (dt) => this.step(dt),
      render: (alpha, frameDt) => this.frame(alpha, frameDt),
    });
  }

  /** One fixed simulation step (exposed for tests). */
  step(dt: number): void {
    if (this.paused) return;
    const sdt = dt * this.speed;
    this.sim.update(sdt);
    for (const t of this.tickers) t(sdt * 1000);
  }

  private frame(alpha: number, frameDt: number): void {
    // Keyboard panning is frame-rate independent and works while paused.
    if (this.keys.size) {
      const v = 700 * frameDt;
      let dx = 0;
      let dy = 0;
      if (this.keys.has('left')) dx += v;
      if (this.keys.has('right')) dx -= v;
      if (this.keys.has('up')) dy += v;
      if (this.keys.has('down')) dy -= v;
      if (dx || dy) this.camera.panBy(dx, dy, false);
    }
    this.camera.update(frameDt);
    this.ui.hour = this.hour();
    if (this.renderer && !this.renderSuspended) this.renderer.render(this.sim, this.camera, this.getView(), this.paused ? 1 : alpha, this.ui);
    if (++this.frameCount % 15 === 0) this.frameListeners.forEach((fn) => fn(this.loop.fps));
  }

  /** Current hour for lighting (local clock, read at most once a second). */
  hour(now = Date.now()): number {
    if (this.clockOverride !== null) return this.clockOverride;
    if (now - this.clockReadAt > 1000 || this.clockReadAt < 0) {
      this.clockReadAt = now;
      this.clockHour = localHour(new Date(now));
    }
    return this.clockHour;
  }

  attach(canvas: HTMLCanvasElement): Renderer {
    const r = new Renderer(canvas);
    this.attachRenderer(r);
    return r;
  }

  /** Draw with any HQ renderer (2D floorplan or 3D diorama). */
  attachRenderer(r: HqRenderer): HqRenderer {
    this.renderer?.dispose?.();
    this.renderer = r;
    this.loop.start();
    return r;
  }

  /** World point under a screen point for the active renderer. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return this.renderer?.screenToWorld?.(sx, sy) ?? this.camera.screenToWorld(sx, sy);
  }

  detach(): void {
    this.loop.stop();
    this.renderer?.dispose?.();
    this.renderer = null;
  }

  publish(ev: MarionEvent): void {
    this.bus.publish(ev);
  }

  emit<K extends MarionEventType>(type: K, payload: EventPayloads[K]): void {
    this.bus.publish(makeEvent(type, payload));
  }

  addTicker(t: Ticker): () => void {
    this.tickers.add(t);
    return () => this.tickers.delete(t);
  }

  onEffect(fn: (e: SimEffect) => void): () => void {
    this.effectListeners.add(fn);
    return () => this.effectListeners.delete(fn);
  }

  onFps(fn: (fps: number) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  // ---------------------------------------------------------------- camera helpers

  /**
   * Screen area (CSS px) an open room panel / bot inspector covers: a side
   * panel on the right from 640 px wide, a bottom sheet on narrower screens.
   */
  panelCover(): { right: number; bottom: number } {
    const c = this.camera;
    return c.vw >= 640 ? { right: Math.min(384, c.vw * 0.48), bottom: 0 } : { right: 0, bottom: Math.round(c.vh * 0.55) };
  }

  /** Camera offset (world px) so a target centers in the area the top bar and a panel leave free. */
  private coverOffset(zoom: number, cover = this.panelCover()): { x: number; y: number } {
    const top = this.camera.insets.top;
    return { x: cover.right / 2 / zoom, y: -(top - cover.bottom) / 2 / zoom };
  }

  focusBot(id: string, follow = true): void {
    const bot = this.sim.getBot(id);
    if (!bot) return;
    this.ui.selectedBot = id;
    const zoom = Math.max(this.camera.targetZoom, 1.4);
    const at = (b: { x: number; y: number }, z: number) => {
      const o = this.coverOffset(z);
      return { x: b.x + o.x, y: b.y + o.y };
    };
    this.camera.focus(at(bot, zoom), zoom);
    this.camera.follow = follow
      ? () => {
          const b = this.sim.getBot(id);
          return b ? at(b, this.camera.targetZoom) : null;
        }
      : null;
  }

  /** Frame a room in the area left free by the top bar and `cover` (a panel). */
  frameRoom(id: RoomId, cover: { right: number; bottom: number } = { right: 0, bottom: 0 }): void {
    const r = roomRect(ROOM_BY_ID[id]);
    this.camera.follow = null;
    const availW = Math.max(120, this.camera.vw - cover.right);
    const availH = Math.max(120, this.camera.vh - cover.bottom - this.camera.insets.top);
    const fit = Math.min(availW / (r.w + 96), availH / (r.h + 96));
    const zoom = Math.max(0.35, Math.min(1.6, fit));
    const o = this.coverOffset(zoom, cover);
    this.camera.focus({ x: r.x + r.w / 2 + o.x, y: r.y + r.h / 2 + o.y }, zoom);
  }

  /** Select a room and frame it beside (or above) its panel. */
  focusRoom(id: RoomId, cover = this.panelCover()): void {
    this.ui.selectedRoom = id;
    this.frameRoom(id, cover);
  }

  overview(): void {
    this.ui.selectedBot = null;
    this.ui.selectedRoom = null;
    this.camera.overview();
  }
}

export const hq = new HQ();
