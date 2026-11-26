/**
 * On-screen joystick (left thumb, appears where you touch) and a right-side
 * touch-look area for 3D views. Hidden on devices without touch.
 */
import { useEffect, useRef, useState } from 'react';
import { input } from '../client/controls';

export function useCoarsePointer(): boolean {
  const [c, setC] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(pointer: coarse)');
    const h = () => setC(mq.matches);
    mq.addEventListener?.('change', h);
    const t = () => setC(true);
    window.addEventListener('touchstart', t, { once: true });
    return () => {
      mq.removeEventListener?.('change', h);
      window.removeEventListener('touchstart', t);
    };
  }, []);
  return c;
}

export function Joystick() {
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const id = useRef<number | null>(null);
  const R = 56;
  return (
    <div
      style={{ position: 'absolute', left: 0, bottom: 0, width: '45%', height: '55%', touchAction: 'none', zIndex: 5 }}
      onPointerDown={(e) => {
        if (id.current !== null) return;
        id.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setKnob({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== id.current || !knob) return;
        let dx = e.clientX - knob.ox;
        let dy = e.clientY - knob.oy;
        const len = Math.hypot(dx, dy);
        if (len > R) {
          dx = (dx / len) * R;
          dy = (dy / len) * R;
        }
        setKnob({ ...knob, x: dx, y: dy });
        const m = Math.min(1, len / R);
        input.touch = len > 6 ? { x: (dx / Math.max(1, Math.hypot(dx, dy))) * m, y: (dy / Math.max(1, Math.hypot(dx, dy))) * m } : { x: 0, y: 0 };
      }}
      onPointerUp={(e) => {
        if (e.pointerId !== id.current) return;
        id.current = null;
        setKnob(null);
        input.touch = { x: 0, y: 0 };
      }}
      onPointerCancel={() => {
        id.current = null;
        setKnob(null);
        input.touch = { x: 0, y: 0 };
      }}
      aria-label="Movement joystick"
    >
      {knob ? (
        <div style={{ position: 'fixed', left: knob.ox - R, top: knob.oy - R, width: R * 2, height: R * 2, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.25)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: R - 26 + knob.x, top: R - 26 + knob.y, width: 52, height: 52, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #9cc0ff, #2f6fed)', boxShadow: '0 0 20px rgba(47,111,237,0.6)' }} />
        </div>
      ) : (
        <div style={{ position: 'absolute', left: 'max(24px, env(safe-area-inset-left))', bottom: 'max(28px, env(safe-area-inset-bottom))', width: 110, height: 110, borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.18)', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 700 }}>
          MOVE
        </div>
      )}
    </div>
  );
}

/** Right-half drag area that feeds camera look deltas (3D on touch). */
export function TouchLook({ sensitivity }: { sensitivity: number }) {
  const last = useRef<{ id: number; x: number; y: number } | null>(null);
  return (
    <div
      style={{ position: 'absolute', right: 0, top: '12%', width: '55%', height: '50%', touchAction: 'none', zIndex: 4 }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return;
        last.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const l = last.current;
        if (!l || l.id !== e.pointerId) return;
        input.look.x += (e.clientX - l.x) * 0.9 * sensitivity;
        input.look.y += (e.clientY - l.y) * 0.9 * sensitivity;
        last.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
      aria-hidden
    />
  );
}
