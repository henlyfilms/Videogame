/**
 * Smooth 2D camera: world-space center + zoom, eased toward a target. Supports
 * drag panning, cursor-anchored wheel zoom, and follow mode.
 */
import type { Point } from './world';

export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2.5;

export class Camera {
  x: number;
  y: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
  /** Screen (CSS px) viewport size. */
  vw = 800;
  vh = 600;
  follow: (() => Point | null) | null = null;
  /** Spring velocities (world px/s, log-zoom/s) for critically damped easing. */
  private vx = 0;
  private vy = 0;
  private vz = 0;
  /** Seconds to (mostly) settle on a new target; follow mode is snappier. */
  smoothTime = 0.32;
  /** Screen-space HUD insets (CSS px) that overview framing keeps clear. */
  insets = { top: 0, right: 0, bottom: 0, left: 0 };

  constructor(
    public worldW: number,
    public worldH: number,
  ) {
    this.x = this.targetX = worldW / 2;
    this.y = this.targetY = worldH / 2;
    this.zoom = this.targetZoom = 1;
  }

  setViewport(w: number, h: number): void {
    this.vw = Math.max(1, w);
    this.vh = Math.max(1, h);
  }

  /** Zoom that fits the whole world in the viewport (with margin). */
  fitZoom(margin = 40): number {
    const i = this.insets;
    const w = Math.max(80, this.vw - i.left - i.right - margin * 2);
    const h = Math.max(80, this.vh - i.top - i.bottom - margin * 2);
    return clamp(Math.min(w / this.worldW, h / this.worldH), MIN_ZOOM, MAX_ZOOM);
  }

  /** Frame the whole world inside the area the HUD leaves free. */
  overview(): void {
    this.follow = null;
    this.targetZoom = this.fitZoom();
    const i = this.insets;
    this.targetX = this.worldW / 2 - (i.left - i.right) / 2 / this.targetZoom;
    this.targetY = this.worldH / 2 - (i.top - i.bottom) / 2 / this.targetZoom;
  }

  snap(): void {
    this.x = this.targetX;
    this.y = this.targetY;
    this.zoom = this.targetZoom;
    this.vx = this.vy = this.vz = 0;
  }

  focus(p: Point, zoom?: number): void {
    this.targetX = p.x;
    this.targetY = p.y;
    if (zoom !== undefined) this.targetZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  }

  screenToWorld(sx: number, sy: number): Point {
    return { x: (sx - this.vw / 2) / this.zoom + this.x, y: (sy - this.vh / 2) / this.zoom + this.y };
  }

  worldToScreen(wx: number, wy: number): Point {
    return { x: (wx - this.x) * this.zoom + this.vw / 2, y: (wy - this.y) * this.zoom + this.vh / 2 };
  }

  /** Pan by a screen-space delta (drag). Cancels follow. */
  panBy(dsx: number, dsy: number, immediate = true): void {
    this.follow = null;
    this.targetX -= dsx / this.zoom;
    this.targetY -= dsy / this.zoom;
    if (immediate) {
      this.x -= dsx / this.zoom;
      this.y -= dsy / this.zoom;
      this.vx = this.vy = 0;
    }
    this.clampTargets();
  }

  /** Zoom by `factor`, keeping the world point under the cursor fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    const nz = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.zoom = this.targetZoom = nz;
    this.vz = 0;
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.targetX = this.x;
    this.targetY = this.y;
    if (this.follow) {
      // Keep following but respect the new zoom.
      this.targetZoom = nz;
    }
    this.clampTargets();
  }

  update(dt: number): void {
    if (this.follow) {
      const p = this.follow();
      if (p) {
        this.targetX = p.x;
        this.targetY = p.y;
      }
    }
    // Critically damped springs: eases in *and* out (no velocity pop when a new
    // target arrives mid-flight). Zoom eases in log space so zooming in and out
    // feel equally paced.
    const st = this.follow ? this.smoothTime * 0.6 : this.smoothTime;
    [this.x, this.vx] = smoothDamp(this.x, this.targetX, this.vx, st, dt);
    [this.y, this.vy] = smoothDamp(this.y, this.targetY, this.vy, st, dt);
    let lz: number;
    [lz, this.vz] = smoothDamp(Math.log(this.zoom), Math.log(this.targetZoom), this.vz, st, dt);
    this.zoom = Math.exp(lz);
  }

  private clampTargets(): void {
    const pad = 200;
    this.targetX = clamp(this.targetX, -pad, this.worldW + pad);
    this.targetY = clamp(this.targetY, -pad, this.worldH + pad);
  }

  /** Visible world rect (for culling). */
  visibleRect(): { x: number; y: number; w: number; h: number } {
    const w = this.vw / this.zoom;
    const h = this.vh / this.zoom;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }
}

/**
 * Critically damped spring step (Game Programming Gems 4, "smooth damp").
 * Returns [value, velocity]. Frame-rate independent and never overshoots.
 */
export function smoothDamp(current: number, target: number, velocity: number, smoothTime: number, dt: number): [number, number] {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  let v = (velocity - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  // Prevent overshoot.
  if (target - current > 0 === out > target) {
    out = target;
    v = 0;
  }
  return [out, v];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
