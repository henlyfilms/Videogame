/**
 * Map overview canvas: menu thumbnails, the in-match map, the admin table
 * and the murderers' sabotage map all reuse it.
 */
import { useEffect, useRef } from 'react';
import { Cell, type CompiledMap } from '../core/map';
import type { Vec2 } from '../core/types';
import { mix, rgba } from '../render2d/paint';

export interface MapMarker {
  pos: Vec2;
  color: string;
  kind: 'you' | 'task' | 'alert' | 'dot' | 'ping';
  label?: string;
}

const thumbCache = new Map<string, HTMLCanvasElement>();

function baseImage(map: CompiledMap, px: number, night: boolean): HTMLCanvasElement {
  const key = `${map.def.id}:${px}:${night}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = map.w * px;
  c.height = map.h * px;
  const g = c.getContext('2d');
  if (!g) return c;
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (map.cells[i] === Cell.Void) continue;
      const ri = map.roomIdx[i]!;
      const col = ri >= 0 ? map.def.rooms[ri]!.color : '#94a3b8';
      g.fillStyle = night ? mix(col, '#0b1022', 0.55) : mix(col, '#e2e8f0', ri >= 0 ? 0.55 : 0.2);
      g.fillRect(x * px, y * px, px, px);
    }
  g.fillStyle = night ? 'rgba(200,215,255,0.5)' : 'rgba(20,30,60,0.55)';
  for (const wi of map.walls) g.fillRect((wi % map.w) * px, Math.floor(wi / map.w) * px, px, px);
  thumbCache.set(key, c);
  return c;
}

export function MapThumb({
  map,
  height = 120,
  width,
  night = false,
  markers = [],
  labels = false,
  rooms,
  onRoom,
  highlightRooms,
}: {
  map: CompiledMap;
  height?: number;
  width?: number;
  night?: boolean;
  markers?: MapMarker[];
  labels?: boolean;
  rooms?: Record<string, string>;
  onRoom?: (roomId: string) => void;
  highlightRooms?: Record<string, string>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = width ?? Math.round((height * map.w) / map.h);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d');
    if (!g) return;
    let raf = 0;
    const draw = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, height);
      const s = Math.min(w / map.w, height / map.h);
      const ox = (w - map.w * s) / 2;
      const oy = (height - map.h * s) / 2;
      g.imageSmoothingEnabled = true;
      g.drawImage(baseImage(map, 3, night), ox, oy, map.w * s, map.h * s);
      if (highlightRooms) {
        for (const r of map.def.rooms) {
          const col = highlightRooms[r.id];
          if (!col) continue;
          const [x, y, rw, rh] = r.rect;
          g.fillStyle = rgba(col, 0.35);
          g.fillRect(ox + x * s, oy + y * s, rw * s, rh * s);
        }
      }
      if (labels && s > 1.6) {
        g.font = `700 ${Math.max(8, Math.min(12, s * 3.2))}px ui-sans-serif, system-ui`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const r of map.def.rooms) {
          const [x, y, rw, rh] = r.rect;
          const extra = rooms?.[r.id];
          g.fillStyle = night ? 'rgba(230,236,255,0.85)' : 'rgba(15,23,42,0.8)';
          g.fillText(r.name.replace(/^.*?'s /, ''), ox + (x + rw / 2) * s, oy + (y + rh / 2) * s - (extra ? 7 : 0));
          if (extra) {
            g.fillStyle = '#fbbf24';
            g.font = `900 ${Math.max(10, Math.min(16, s * 4))}px ui-sans-serif, system-ui`;
            g.fillText(extra, ox + (x + rw / 2) * s, oy + (y + rh / 2) * s + 8);
            g.font = `700 ${Math.max(8, Math.min(12, s * 3.2))}px ui-sans-serif, system-ui`;
          }
        }
      }
      const t = performance.now() / 1000;
      for (const m of markers) {
        const x = ox + m.pos.x * s;
        const y = oy + m.pos.y * s;
        if (m.kind === 'you') {
          g.fillStyle = m.color;
          g.strokeStyle = '#fff';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, 6, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        } else if (m.kind === 'task') {
          g.fillStyle = '#fde047';
          g.beginPath();
          g.moveTo(x, y + 5);
          g.lineTo(x - 5, y - 4);
          g.lineTo(x + 5, y - 4);
          g.fill();
        } else if (m.kind === 'alert') {
          const r = 6 + 4 * Math.abs(Math.sin(t * 4));
          g.strokeStyle = m.color;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.stroke();
        } else {
          g.fillStyle = m.color;
          g.beginPath();
          g.arc(x, y, m.kind === 'ping' ? 5 : 4, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (markers.some((m) => m.kind === 'alert')) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [map, w, height, night, markers, labels, rooms, highlightRooms]);
  return (
    <canvas
      ref={ref}
      style={{ width: w, height, borderRadius: 10, display: 'block', maxWidth: '100%', cursor: onRoom ? 'pointer' : undefined, background: night ? '#05070f' : 'rgba(255,255,255,0.04)' }}
      onClick={(e) => {
        if (!onRoom) return;
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const s = Math.min(rect.width / map.w, rect.height / map.h);
        const ox = (rect.width - map.w * s) / 2;
        const oy = (rect.height - map.h * s) / 2;
        const x = (e.clientX - rect.left - ox) / s;
        const y = (e.clientY - rect.top - oy) / s;
        const r = map.def.rooms.find((rm) => x >= rm.rect[0] && x <= rm.rect[0] + rm.rect[2] && y >= rm.rect[1] && y <= rm.rect[1] + rm.rect[3]);
        if (r) onRoom(r.id);
      }}
      aria-label={`${map.def.name} map`}
    />
  );
}
