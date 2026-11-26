/**
 * 2D menu backdrop: a slow illustrated pan across a random Marion Mystery map
 * at dusk, with berries wandering and floating glow motes.
 */
import { useEffect, useRef } from 'react';
import { randomCosmetics } from '../characters/catalog';
import { availableMaps, getMap } from '../core/maps';
import { Renderer2D, type FrameData } from '../render2d/renderer';
import type { MapId } from '../core/types';

export function MenuBackdrop2D() {
  const ref = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const o = over.current;
    if (!c || !o) return;
    let r: Renderer2D;
    try {
      r = new Renderer2D(c);
    } catch {
      return;
    }
    const maps = availableMaps();
    const map = getMap((maps[Math.floor(Math.random() * maps.length)]?.id ?? 'hq') as MapId);
    const berries = Array.from({ length: 8 }, (_, i) => ({ c: randomCosmetics(i * 7919 + 13), x: 0, y: 0, phase: Math.random() * 6 }));
    const route = map.def.rooms.map((room) => ({ x: room.rect[0] + room.rect[2] / 2, y: room.rect[1] + room.rect[3] / 2 }));
    const resize = () => {
      r.resize(c.clientWidth, c.clientHeight, devicePixelRatio || 1);
      o.width = c.clientWidth * Math.min(2, devicePixelRatio || 1);
      o.height = c.clientHeight * Math.min(2, devicePixelRatio || 1);
    };
    resize();
    window.addEventListener('resize', resize);
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const g = o.getContext('2d');
    const motes = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), v: 0.01 + Math.random() * 0.03, s: 1 + Math.random() * 2.5 }));
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const seg = (t / 9) % route.length;
      const a = route[Math.floor(seg)]!;
      const b = route[(Math.floor(seg) + 1) % route.length]!;
      const k = seg % 1;
      const e = k * k * (3 - 2 * k);
      const focus = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
      const frame: FrameData = {
        mode: 'lobby',
        map,
        t,
        focus,
        players: berries.map((bb, i) => {
          const ang = t * 0.4 + bb.phase + i;
          const pos = { x: focus.x + Math.cos(ang) * (3 + i * 0.6), y: focus.y + Math.sin(ang * 0.7) * 2.5 };
          return { id: `b${i}`, name: '', cosmetics: bb.c, pos, facing: ang + Math.PI / 2, moving: true, ghost: false };
        }),
        bodies: [],
        projectiles: [],
        gunDrop: null,
        batteries: [],
        closedDoors: new Set(),
        litLanterns: new Set(),
        highlight: new Set(),
        near: null,
        vision: null,
        night: false,
        lightsSabotaged: false,
        critical: false,
        reducedMotion: true,
        highVisibility: false,
        footprints: false,
        trackPos: null,
        zoom: 0.8,
      };
      try {
        r.render(frame, dt);
      } catch {
        /* never break the menu */
      }
      if (g) {
        const dpr = Math.min(2, devicePixelRatio || 1);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const w = o.clientWidth;
        const h = o.clientHeight;
        g.clearRect(0, 0, w, h);
        const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
        grad.addColorStop(0, 'rgba(7,11,24,0.35)');
        grad.addColorStop(1, 'rgba(7,11,24,0.92)');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        for (const m of motes) {
          m.y -= m.v * dt;
          if (m.y < -0.05) m.y = 1.05;
          g.fillStyle = `rgba(150,190,255,${0.25 + 0.2 * Math.sin(t * 2 + m.x * 10)})`;
          g.beginPath();
          g.arc(m.x * w + Math.sin(t + m.y * 6) * 12, m.y * h, m.s, 0, Math.PI * 2);
          g.fill();
        }
      }
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      r.dispose();
    };
  }, []);
  return (
    <div style={{ position: 'absolute', inset: 0 }} aria-hidden>
      <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <canvas ref={over} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
