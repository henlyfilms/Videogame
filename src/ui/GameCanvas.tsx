import { useEffect, useRef } from 'react';
import type { RoomId } from '../data/bots';
import { hotspotAt, roomAtWorld, type HotspotAction } from '../engine/world';
import { hq } from '../game/hq';
import { pickBot } from '../render/renderer';

export interface GameCanvasProps {
  onSelectBot: (id: string | null) => void;
  onSelectRoom: (id: RoomId | null) => void;
  onHotspot: (room: RoomId, action: HotspotAction) => void;
}

const DRAG_THRESHOLD = 5;

/** Full-viewport canvas with drag-pan, cursor-anchored wheel zoom, pinch and click picking. */
export function GameCanvas({ onSelectBot, onSelectRoom, onHotspot }: GameCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cb = useRef({ onSelectBot, onSelectRoom, onHotspot });
  cb.current = { onSelectBot, onSelectRoom, onHotspot };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = hq.attach(canvas);
    const fit = () => {
      const rect = canvas.parentElement?.getBoundingClientRect() ?? { width: window.innerWidth, height: window.innerHeight };
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      hq.camera.setViewport(rect.width, rect.height);
      // Keep the overview clear of the top bar and (on wide screens) the activity feed.
      const phone = rect.width < 640;
      hq.camera.insets = phone ? { top: 112, right: 0, bottom: 56, left: 0 } : { top: 56, right: 0, bottom: 0, left: rect.width >= 1100 ? 330 : 0 };
    };
    fit();
    if (hq.camera.vw < 640) hq.frameRoom('command');
    else hq.camera.overview();
    hq.camera.snap();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(canvas.parentElement ?? canvas);
    window.addEventListener('resize', fit);

    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number } | null = null;
    let dragged = false;
    let pinchDist = 0;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        downAt = p;
        dragged = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        dragged = true;
      }
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (prev) {
        if (pointers.size === 2) {
          pointers.set(e.pointerId, p);
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          if (pinchDist > 0) hq.camera.zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, d / pinchDist);
          pinchDist = d;
          return;
        }
        if (downAt && !dragged && Math.hypot(p.x - downAt.x, p.y - downAt.y) > DRAG_THRESHOLD) dragged = true;
        if (dragged) hq.camera.panBy(p.x - prev.x, p.y - prev.y);
        pointers.set(e.pointerId, p);
        canvas.style.cursor = dragged ? 'grabbing' : canvas.style.cursor;
        return;
      }
      // Hover feedback.
      const w = hq.camera.screenToWorld(p.x, p.y);
      const bot = pickBot(hq.sim, w);
      const hs = bot ? null : hotspotAt(w.x, w.y);
      hq.ui.hoverHotspot = hs ? { roomId: hs.room.id, propId: hs.prop.id } : null;
      hq.ui.hoverRoom = roomAtWorld(hq.sim.grid, w.x, w.y)?.id ?? null;
      canvas.style.cursor = bot || hs ? 'pointer' : 'grab';
    };

    const onUp = (e: PointerEvent) => {
      const p = local(e);
      pointers.delete(e.pointerId);
      if (pointers.size > 0) return;
      if (!dragged && downAt) {
        const w = hq.camera.screenToWorld(p.x, p.y);
        const bot = pickBot(hq.sim, w);
        if (bot) {
          cb.current.onSelectBot(bot.def.id);
        } else {
          const hs = hotspotAt(w.x, w.y);
          if (hs?.prop.hotspot) {
            cb.current.onHotspot(hs.room.id, hs.prop.hotspot);
          } else {
            const room = roomAtWorld(hq.sim.grid, w.x, w.y);
            cb.current.onSelectRoom(room?.id ?? null);
          }
        }
      }
      downAt = null;
      dragged = false;
      canvas.style.cursor = 'grab';
    };

    const onLeave = () => {
      hq.ui.hoverHotspot = null;
      hq.ui.hoverRoom = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      hq.camera.zoomAt(p.x, p.y, factor);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      hq.detach();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="block h-full w-full touch-none select-none"
      style={{ cursor: 'grab' }}
      aria-label="Marion HQ floorplan. Drag to pan, scroll to zoom, click a bot or room."
      role="img"
      tabIndex={-1}
    />
  );
}
