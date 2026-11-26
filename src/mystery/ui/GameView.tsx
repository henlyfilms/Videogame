/**
 * The playfield: owns the canvas, picks the 2D or 3D renderer for the
 * player's (locked) view, and runs the frame loop (input → prediction →
 * render). Used for both the waiting room and matches.
 */
import { useEffect, useRef, useState } from 'react';
import type { FrameData } from '../render2d/renderer';
import { Renderer2D } from '../render2d/renderer';
import type { MatchEvent, Vec2, ViewMode } from '../core/types';
import { doPing, input, refreshContext } from '../client/controls';
import { buildFrame } from '../client/frame';
import { runtime } from '../client/runtime';
import { useMystery } from '../client/store';

export interface ViewRenderer {
  resize(w: number, h: number, dpr: number): void;
  render(f: FrameData, dt: number): void;
  fx(ev: MatchEvent, reducedMotion: boolean): void;
  /** Convert view-space axes (x right, y back) to world movement. */
  axesToWorld?(ax: { x: number; y: number }): Vec2;
  /** Facing override (3D first person / pointer aim). */
  aimFacing?(): number | null;
  attachPointer?(el: HTMLElement): () => void;
  toScreen?(p: Vec2, zoom: number): Vec2 | null;
  dispose(): void;
  frameMs: number;
}

class TwoDView implements ViewRenderer {
  r: Renderer2D;
  private aim: number | null = null;
  private aimAt = 0;
  private mouse: Vec2 | null = null;
  frameMs = 0;
  constructor(canvas: HTMLCanvasElement) {
    this.r = new Renderer2D(canvas);
  }
  resize(w: number, h: number, dpr: number) {
    this.r.resize(w, h, dpr);
  }
  render(f: FrameData, dt: number) {
    if (this.mouse && performance.now() - this.aimAt < 2500) {
      const me = this.r.toScreen(f.focus, f.zoom);
      this.aim = Math.atan2(this.mouse.y - me.y, this.mouse.x - me.x);
      // Screen → world (the 2D camera is a plain scale + offset).
      const one = this.r.toScreen({ x: f.focus.x + 1, y: f.focus.y + 1 }, f.zoom);
      const kx = one.x - me.x;
      const ky = one.y - me.y;
      runtime.cursorWorld = kx && ky ? { x: f.focus.x + (this.mouse.x - me.x) / kx, y: f.focus.y + (this.mouse.y - me.y) / ky } : null;
    } else {
      this.aim = null;
      runtime.cursorWorld = null;
    }
    this.r.render(f, dt);
    this.frameMs = this.r.frameMs;
  }
  fx(ev: MatchEvent, rm: boolean) {
    this.r.fx(ev, rm);
  }
  aimFacing() {
    return this.aim;
  }
  toScreen(p: Vec2, zoom: number) {
    return this.r.toScreen(p, zoom);
  }
  attachPointer(el: HTMLElement) {
    const mv = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const rect = el.getBoundingClientRect();
      this.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.aimAt = performance.now();
    };
    // Middle click pings the spot under the mouse.
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 1) return;
      e.preventDefault();
      mv(e);
      doPing();
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerdown', down);
    return () => {
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerdown', down);
    };
  }
  dispose() {
    this.r.dispose();
  }
}

export function GameView({ view, onRenderer }: { view: ViewMode; onRenderer?: (r: ViewRenderer | null) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed3d, setFailed3d] = useState(false);
  const use3d = view !== '2d' && !failed3d;

  useEffect(() => {
    const canvas = canvasRef.current;
    const el = wrap.current;
    if (!canvas || !el) return;
    let renderer: ViewRenderer | null = null;
    let disposed = false;
    let raf = 0;
    let detachPointer: (() => void) | null = null;
    const offFx = runtime.on((ev) => renderer?.fx(ev, useMystery.getState().prefs.reducedMotion));
    const setup = (r: ViewRenderer) => {
      if (disposed) {
        r.dispose();
        return;
      }
      // Debug builds (?debug): expose the active view to probes as __mm.view.
      const dbg = (window as unknown as { __mm?: Record<string, unknown> }).__mm;
      if (dbg) dbg.view = r;
      renderer = r;
      onRenderer?.(r);
      const ro = new ResizeObserver(() => r.resize(el.clientWidth, el.clientHeight, window.devicePixelRatio || 1));
      ro.observe(el);
      r.resize(el.clientWidth, el.clientHeight, window.devicePixelRatio || 1);
      detachPointer = r.attachPointer?.(el) ?? null;
      let last = performance.now();
      const t0 = last;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const st = useMystery.getState();
        const room = st.room;
        if (!room) return;
        input.pollPad();
        const ax = input.axes();
        const w = r.axesToWorld ? r.axesToWorld(ax) : ax;
        runtime.input = w;
        runtime.aimFacing = r.aimFacing?.() ?? null;
        runtime.update(dt, room.settings.playerSpeed);
        const ctx = refreshContext();
        const frame = buildFrame({ map: runtime.map(), room, snap: st.snap, pid: st.pid, prefs: st.prefs, ctx, t: (now - t0) / 1000, zoom: 1 });
        r.render(frame, dt);
      };
      loop();
      cleanup.push(() => ro.disconnect());
    };
    const cleanup: (() => void)[] = [];
    if (use3d) {
      import('../render3d/view3d')
        .then(({ ThreeDView }) => setup(new ThreeDView(canvas, view === '3d-fp' ? 'fp' : 'tp', useMystery.getState().prefs)))
        .catch((e) => {
          console.warn('[mystery] 3D unavailable, falling back to 2D', e);
          setFailed3d(true);
        });
    } else setup(new TwoDView(canvas));
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      offFx();
      detachPointer?.();
      for (const c of cleanup) c();
      renderer?.dispose();
      onRenderer?.(null);
    };
  }, [use3d, view, onRenderer]);

  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0, touchAction: 'none' }}>
      <canvas key={use3d ? '3d' : '2d'} ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} aria-label="Game view" />
    </div>
  );
}
