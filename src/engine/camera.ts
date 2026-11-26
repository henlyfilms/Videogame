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
    }
    this.clampTargets();
  }

  /** Zoom by `factor`, keeping the world point under the cursor fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    const nz = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.zoom = this.targetZoom = nz;
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
    const k = 1 - Math.exp(-dt * 8);
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;
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

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
