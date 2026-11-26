/**
 * HQ controller: owns the simulation, camera, renderer and loop, and connects
 * them to the event bus. React components talk to this singleton; it never
 * imports React.
 */
import type { RoomId } from '../data/bots';
import { makeEvent, type EventPayloads, type MarionEvent, type MarionEventType } from '../adapters/events';
import { Camera } from '../engine/camera';
import { GameLoop } from '../engine/loop';
import { Simulation, type SimEffect } from '../engine/sim';
import { roomRect, ROOM_BY_ID, WORLD_H, WORLD_W } from '../engine/world';
import { Renderer, type RenderOptions } from '../render/renderer';
import { emptyView, type RenderView } from '../render/view';
import { EventBus } from './bus';

export type Ticker = (dtMs: number) => void;

export class HQ {
  readonly bus = new EventBus();
  readonly sim: Simulation;
  readonly camera = new Camera(WORLD_W, WORLD_H);
  readonly loop: GameLoop;
  renderer: Renderer | null = null;
  paused = false;
  speed = 1;
  /** True while a full-screen Arcade game covers the HQ: simulate, don't paint. */
  renderSuspended = false;
  /** Keys currently held for WASD/arrow panning. */
  readonly keys = new Set<string>();
  ui: RenderOptions = { selectedBot: null, selectedRoom: null, hoverRoom: null, hoverHotspot: null, showNames: true };
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
    if (this.renderer && !this.renderSuspended) this.renderer.render(this.sim, this.camera, this.getView(), this.paused ? 1 : alpha, this.ui);
    if (++this.frameCount % 15 === 0) this.frameListeners.forEach((fn) => fn(this.loop.fps));
  }

  attach(canvas: HTMLCanvasElement): Renderer {
    this.renderer = new Renderer(canvas);
    this.loop.start();
    return this.renderer;
  }

  detach(): void {
    this.loop.stop();
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

  /** Horizontal world offset so a target centers in the area left of a side panel. */
  private panelOffset(zoom: number, panelWidth?: number): number {
    const w = panelWidth ?? (this.camera.vw > 720 ? 370 : 0);
    return w / 2 / zoom;
  }

  focusBot(id: string, follow = true): void {
    const bot = this.sim.getBot(id);
    if (!bot) return;
    this.ui.selectedBot = id;
    const zoom = Math.max(this.camera.targetZoom, 1.4);
    const off = () => this.panelOffset(this.camera.targetZoom);
    this.camera.focus({ x: bot.x + this.panelOffset(zoom), y: bot.y }, zoom);
    this.camera.follow = follow
      ? () => {
          const b = this.sim.getBot(id);
          return b ? { x: b.x + off(), y: b.y } : null;
        }
      : null;
  }

  /** Move the camera to frame a room without selecting it. */
  frameRoom(id: RoomId, panelWidth = 0): void {
    const r = roomRect(ROOM_BY_ID[id]);
    this.camera.follow = null;
    const availW = this.camera.vw - panelWidth;
    const fit = Math.min(availW / (r.w + 120), this.camera.vh / (r.h + 200));
    const zoom = Math.max(0.35, Math.min(1.6, fit));
    this.camera.focus({ x: r.x + r.w / 2 + panelWidth / 2 / zoom, y: r.y + r.h / 2 }, zoom);
  }

  focusRoom(id: RoomId, panelWidth = this.camera.vw > 720 ? 390 : 0): void {
    this.ui.selectedRoom = id;
    this.frameRoom(id, panelWidth);
  }

  overview(): void {
    this.ui.selectedBot = null;
    this.ui.selectedRoom = null;
    this.camera.overview();
  }
}

export const hq = new HQ();
