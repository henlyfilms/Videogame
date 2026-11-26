/**
 * UI kit for the Marion Mystery chrome: enter/exit presence, eased numbers,
 * key-hint badges, hazard stripes, the schematic map (minimap + tablet),
 * and the original cutscene art (starfield, energy slash, siren).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Cell, type CompiledMap } from '../core/map';
import type { StationKind, Vec2 } from '../core/types';
import { useMystery } from '../client/store';
import type { Keybinds } from '../client/prefs';

// ---------------------------------------------------------------------------
// Presence: keep things mounted while they animate out.

export type PresenceState = 'in' | 'out';

/** `mounted` stays true for `exitMs` after `show` turns false. */
export function usePresence(show: boolean, exitMs = 240): { mounted: boolean; state: PresenceState } {
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [show, exitMs]);
  return { mounted: mounted || show, state: show ? 'in' : 'out' };
}

/** Last non-null value (so exiting content can still render what it showed). */
export function useSticky<T>(v: T | null | undefined): T | null {
  const ref = useRef<T | null>(v ?? null);
  if (v !== null && v !== undefined) ref.current = v;
  return ref.current;
}

/** Wrapper that animates children in/out (`.mm-pres` + an animation class). */
export function Presence({ show, className = '', anim = 'pop', exitMs = 240, style, children, ...rest }: { show: boolean; className?: string; anim?: 'pop' | 'rise' | 'drop' | 'fade' | 'left' | 'right' | 'sweep'; exitMs?: number; style?: CSSProperties; children: ReactNode; role?: string; 'aria-live'?: 'polite' | 'assertive' }) {
  const p = usePresence(show, exitMs);
  if (!p.mounted) return null;
  return (
    <div className={`mm-pres mm-pres-${anim} ${className}`} data-state={p.state} style={style} {...rest}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eased numbers (progress bars set their own transitions; counters tick).

function reducedNow(): boolean {
  return useMystery.getState().prefs.reducedMotion;
}

export function useTween(target: number, ms = 600): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reducedNow() || typeof requestAnimationFrame !== 'function') {
      cur.current = target;
      setV(target);
      return;
    }
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = from.current + (target - from.current) * e;
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** A number that counts toward its value. */
export function Tick({ value, ms = 600, fmt = (n) => String(Math.round(n)) }: { value: number; ms?: number; fmt?: (n: number) => string }) {
  const v = useTween(value, ms);
  return <>{fmt(v)}</>;
}

/** Re-keys its child when `value` changes so a CSS "bump" animation replays. */
export function Bump({ value, className = '', children }: { value: string | number; className?: string; children?: ReactNode }) {
  return (
    <span key={value} className={`mm-bump ${className}`}>
      {children ?? value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Key hints

const KEY_NAMES: Record<string, string> = { Tab: 'Tab', Enter: '↵', Escape: 'Esc', Space: '␣', ShiftLeft: '⇧', ShiftRight: '⇧', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`' };

export function keyLabel(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code]!;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace(/^(Numpad)/, '');
}

/** Square key badge for the player's current binding (hidden on touch). */
export function Kbd({ k, code, className = '' }: { k?: keyof Keybinds; code?: string; className?: string }) {
  const keys = useMystery((s) => s.prefs.keys);
  const c = code ?? (k ? keys[k] : '');
  if (!c) return null;
  return (
    <kbd className={`mm-kbd ${className}`} aria-hidden>
      {keyLabel(c)}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Decoration

export function Hazard({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={`mm-hazard ${className}`} style={style} aria-hidden>
      <i />
    </div>
  );
}

/** Deterministic star dots as a CSS background (no canvas, no per-frame work). */
export function starfield(seed = 7, n = 70): string {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const big = r() > 0.85;
    out.push(`radial-gradient(${big ? 2 : 1.2}px ${big ? 2 : 1.2}px at ${(r() * 100).toFixed(1)}% ${(r() * 100).toFixed(1)}%, rgba(255,255,255,${(0.45 + r() * 0.55).toFixed(2)}), transparent)`);
  }
  return out.join(',');
}

/** Horizontal red speed streaks (meeting banner), tiled and scrolled by CSS. */
export const STREAKS = (() => {
  let s = 99;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const shades = ['#ff4a4a', '#c3141a', '#7a070b', '#ff8080', '#9e0b10'];
  let rects = '';
  for (let i = 0; i < 70; i++) {
    const y = (r() * 100).toFixed(1);
    const h = (0.4 + r() * 2.2).toFixed(2);
    const x = (r() * 400).toFixed(0);
    const w = (40 + r() * 220).toFixed(0);
    const o = (0.25 + r() * 0.6).toFixed(2);
    const c = shades[i % shades.length];
    rects += `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${c}' opacity='${o}'/><rect x='${Number(x) - 400}' y='${y}' width='${w}' height='${h}' fill='${c}' opacity='${o}'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='100' viewBox='0 0 400 100' preserveAspectRatio='none'>${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

/** Original red energy slash for the elimination cutscene. */
export function EnergySlash({ className = '' }: { className?: string }) {
  return (
    <svg className={`mm-slash ${className}`} viewBox="0 0 1600 600" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="mm-slash-core" x1="0" x2="1">
          <stop offset="0" stopColor="#ffd6d6" stopOpacity="0" />
          <stop offset="0.25" stopColor="#ffe3e3" />
          <stop offset="1" stopColor="#ffb3b3" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <path className="mm-slash-a" fill="#e0141f" d="M0 250 L240 236 L300 200 L380 230 L520 160 L560 205 L700 140 L760 190 L900 120 L960 175 L1120 110 L1180 160 L1340 130 L1400 175 L1600 150 L1600 470 L1420 430 L1360 470 L1220 420 L1150 480 L1000 430 L930 500 L800 440 L720 520 L600 450 L520 500 L420 430 L330 470 L250 380 L0 390 Z" />
      <path className="mm-slash-b" fill="#ff3b3b" d="M0 285 L300 270 L420 240 L560 250 L720 210 L900 220 L1080 190 L1280 205 L1600 200 L1600 400 L1300 380 L1100 410 L900 380 L700 420 L520 380 L360 400 L0 350 Z" />
      <path className="mm-slash-c" fill="url(#mm-slash-core)" d="M0 300 L400 290 L800 275 L1200 270 L1600 262 L1600 335 L1200 330 L800 330 L400 322 L0 330 Z" />
      <g className="mm-slash-sparks" stroke="#ff4d4d" strokeWidth="4" fill="none" strokeLinecap="round">
        <path d="M1180 120 L1230 80 L1250 104 L1310 60" />
        <path d="M1050 470 L1100 520 L1120 500 L1180 560" />
        <path d="M640 150 L690 110 L700 128" />
      </g>
    </svg>
  );
}

/** Original siren: red dome with a glint, on a dark base. */
export function Siren({ size = 56 }: { size?: number }) {
  return (
    <svg className="mm-siren" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <g className="mm-siren-rays" stroke="#fff" strokeWidth="3.5" strokeLinecap="round">
        <path d="M32 4v7 M9 13l5 5 M55 13l-5 5" />
      </g>
      <path d="M14 46V34a18 18 0 0 1 36 0v12z" fill="#ff2a2a" stroke="#1a0b0b" strokeWidth="3" strokeLinejoin="round" />
      <path d="M22 34a10 10 0 0 1 8-9" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.9" />
      <rect x="9" y="46" width="46" height="10" rx="3" fill="#2b2f36" stroke="#1a0b0b" strokeWidth="3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Task icons (station kind → icon name from common.tsx)

export const STATION_ICON: Partial<Record<StationKind, string>> = {
  stampMail: 'mail',
  sortClips: 'clip',
  distillReel: 'reel',
  slotCartridge: 'cartridge',
  rerouteTube: 'pipe',
  calibrateTurntable: 'disc',
  sortBerries: 'berry',
  juicePress: 'press',
  alignDish: 'dish',
  fuelCan: 'can',
  fuelEngine: 'can',
  fixWiring: 'plug',
  swipeBadge: 'card',
  waterPlants: 'plant',
  cleanFilter: 'filter',
  download: 'download',
  upload: 'upload',
  unlockManifold: 'valve',
  simonSays: 'grid4',
  keypadCode: 'keypad',
  emptyChute: 'chute',
  medScan: 'scan',
  primeShields: 'hex',
  chartCourse: 'compass',
  replaceFuse: 'fuse',
  rechargeGenerator: 'battery',
  lightLantern: 'lantern',
  lightsPanel: 'bolt',
  commsPanel: 'wifi',
  meltdownA: 'siren',
  meltdownB: 'siren',
  pressureA: 'siren',
  pressureB: 'siren',
};

// ---------------------------------------------------------------------------
// Schematic map: drawn from the compiled cell grid, so it works for any room
// shape (rects + extra rects, halls, outdoor areas).

export type MapTheme = 'crew' | 'killer' | 'night' | 'admin';

const THEMES: Record<MapTheme, { room: string; hall: string; edge: string; outline: string; label: string }> = {
  crew: { room: '#2f5be6', hall: '#c9cdf6', edge: '#0d1a52', outline: '#e8ebff', label: '#ffffff' },
  killer: { room: '#e2262c', hall: '#f6c4c4', edge: '#4a0a0c', outline: '#ffe5e5', label: '#ffffff' },
  night: { room: '#26356b', hall: '#5d6493', edge: '#05081a', outline: '#9aa4d6', label: '#dfe5ff' },
  admin: { room: '#2b8f6e', hall: '#bfe9d9', edge: '#0a2c22', outline: '#e2fff3', label: '#ffffff' },
};

const schematicCache = new Map<string, HTMLCanvasElement>();
const PX = 8;

function schematic(map: CompiledMap, theme: MapTheme): HTMLCanvasElement {
  const key = `${map.def.id}:${map.w}x${map.h}:${theme}`;
  const hit = schematicCache.get(key);
  if (hit) return hit;
  const T = THEMES[theme];
  const c = document.createElement('canvas');
  c.width = map.w * PX;
  c.height = map.h * PX;
  const g = c.getContext('2d');
  if (!g) return c;
  const floor = (i: number) => map.cells[i] !== Cell.Void;
  // Soft outer outline: every walkable cell grown by a pixel.
  g.fillStyle = T.outline;
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) if (floor(y * map.w + x)) g.fillRect(x * PX - 1.5, y * PX - 1.5, PX + 3, PX + 3);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (!floor(i)) continue;
      const ri = map.roomIdx[i]!;
      g.fillStyle = ri >= 0 ? T.room : T.hall;
      g.fillRect(x * PX, y * PX, PX, PX);
    }
  // Room edges (where the room index changes) as ink lines.
  g.fillStyle = T.edge;
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (!floor(i)) continue;
      const ri = map.roomIdx[i]!;
      if (ri < 0) continue;
      const diff = (nx: number, ny: number) => nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || map.roomIdx[ny * map.w + nx] !== ri || !floor(ny * map.w + nx);
      if (diff(x - 1, y)) g.fillRect(x * PX, y * PX, 1.5, PX);
      if (diff(x + 1, y)) g.fillRect(x * PX + PX - 1.5, y * PX, 1.5, PX);
      if (diff(x, y - 1)) g.fillRect(x * PX, y * PX, PX, 1.5);
      if (diff(x, y + 1)) g.fillRect(x * PX, y * PX + PX - 1.5, PX, 1.5);
    }
  schematicCache.set(key, c);
  return c;
}

export interface SchematicMarker {
  pos: Vec2;
  kind: 'you' | 'task' | 'alert' | 'ping' | 'dot' | 'heat';
  color?: string;
  /** For `you`: facing in radians. */
  facing?: number;
}

/**
 * Canvas map. `live` follows the local player every frame (minimap);
 * otherwise it redraws only when inputs change (plus pulsing markers).
 */
export function SchematicMap({
  map,
  width,
  height,
  theme = 'crew',
  markers = [],
  you,
  labels = false,
  counts,
  highlight,
  onRoom,
  reducedMotion = false,
  className = '',
  ariaLabel,
}: {
  map: CompiledMap;
  width: number;
  height: number;
  theme?: MapTheme;
  markers?: SchematicMarker[];
  /** Local player marker (read live each frame). */
  you?: { get(): { pos: Vec2; facing: number }; color: string } | null;
  labels?: boolean;
  counts?: Record<string, string>;
  highlight?: Record<string, string>;
  onRoom?: (roomId: string) => void;
  reducedMotion?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const youRef = useRef(you);
  youRef.current = you;
  const pulse = markers.some((m) => m.kind === 'alert' || m.kind === 'task') || !!you;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    let raf = 0;
    let last = 0;
    const T = THEMES[theme];
    const draw = (now: number) => {
      // ~30 fps is plenty for a minimap.
      if (now - last < 32 && last) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = now;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);
      const pad = 8;
      const s = Math.min((width - pad * 2) / map.w, (height - pad * 2) / map.h);
      const ox = (width - map.w * s) / 2;
      const oy = (height - map.h * s) / 2;
      g.imageSmoothingEnabled = true;
      g.drawImage(schematic(map, theme), ox, oy, map.w * s, map.h * s);
      if (highlight)
        for (const r of map.def.rooms) {
          const col = highlight[r.id];
          if (!col) continue;
          g.fillStyle = col;
          g.globalAlpha = 0.45;
          for (const rr of [r.rect, ...(r.extra ?? [])]) g.fillRect(ox + rr[0] * s, oy + rr[1] * s, rr[2] * s, rr[3] * s);
          g.globalAlpha = 1;
        }
      if (labels || counts) {
        const fs = Math.max(8, Math.min(13, s * 2.6));
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const r of map.def.rooms) {
          const [x, y, rw, rh] = r.rect;
          const cx = ox + (x + rw / 2) * s;
          const cy = oy + (y + rh / 2) * s;
          const extra = counts?.[r.id];
          const name = r.name.replace(/^.*?'s /, '').toUpperCase();
          let lfs = fs;
          if (labels) {
            g.font = `600 ${lfs}px Oswald, 'Arial Narrow', sans-serif`;
            const tw = g.measureText(name).width;
            if (tw > rw * s - 6) lfs = Math.floor((fs * (rw * s - 6)) / tw);
          }
          if (labels && lfs >= 7) {
            g.font = `600 ${lfs}px Oswald, 'Arial Narrow', sans-serif`;
            g.lineWidth = 3;
            g.strokeStyle = 'rgba(0,0,0,0.55)';
            g.strokeText(name, cx, cy - (extra ? fs * 0.7 : 0));
            g.fillStyle = T.label;
            g.fillText(name, cx, cy - (extra ? fs * 0.7 : 0));
          }
          if (extra) {
            g.font = `700 ${fs * 1.5}px Oswald, 'Arial Narrow', sans-serif`;
            g.fillStyle = '#ffd426';
            g.strokeStyle = '#000';
            g.lineWidth = 3;
            g.strokeText(extra, cx, cy + fs * 0.6);
            g.fillText(extra, cx, cy + fs * 0.6);
          }
        }
      }
      const t = now / 1000;
      const R = Math.max(5, Math.min(11, s * 1.6));
      for (const m of markers) {
        const x = ox + m.pos.x * s;
        const y = oy + m.pos.y * s;
        if (m.kind === 'task') {
          const bob = reducedMotion ? 0 : Math.sin(t * 3 + m.pos.x) * 1.5;
          g.fillStyle = '#ffd426';
          g.strokeStyle = '#141414';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y + bob, R, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.fillStyle = '#141414';
          g.fillRect(x - R * 0.13, y + bob - R * 0.6, R * 0.26, R * 0.75);
          g.fillRect(x - R * 0.13, y + bob + R * 0.3, R * 0.26, R * 0.26);
        } else if (m.kind === 'alert') {
          const k = reducedMotion ? 0.5 : (t * 1.4) % 1;
          g.strokeStyle = m.color ?? '#ff2a2a';
          g.globalAlpha = 1 - k;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(x, y, R + k * R * 2, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          g.fillStyle = m.color ?? '#ff2a2a';
          g.strokeStyle = '#fff';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, R, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.fillStyle = '#fff';
          g.fillRect(x - R * 0.13, y - R * 0.6, R * 0.26, R * 0.75);
          g.fillRect(x - R * 0.13, y + R * 0.3, R * 0.26, R * 0.26);
        } else if (m.kind === 'heat') {
          g.fillStyle = m.color ?? 'rgba(255,120,60,0.35)';
          g.beginPath();
          g.arc(x, y, Math.max(2, s * 1.1), 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillStyle = m.color ?? '#38bdf8';
          g.strokeStyle = '#fff';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, m.kind === 'ping' ? R * 0.8 : R * 0.6, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        }
      }
      const yv = youRef.current;
      if (yv) {
        const { pos, facing } = yv.get();
        const x = ox + pos.x * s;
        const y = oy + pos.y * s;
        // Facing wedge.
        g.fillStyle = '#ffd426';
        g.strokeStyle = '#141414';
        g.lineWidth = 1.5;
        g.beginPath();
        const a = facing;
        g.moveTo(x + Math.cos(a) * R * 1.9, y + Math.sin(a) * R * 1.9);
        g.lineTo(x + Math.cos(a + 0.6) * R * 1.05, y + Math.sin(a + 0.6) * R * 1.05);
        g.lineTo(x + Math.cos(a - 0.6) * R * 1.05, y + Math.sin(a - 0.6) * R * 1.05);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = yv.color;
        g.strokeStyle = '#fff';
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(x, y, R * 0.95, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(190,230,255,0.95)';
        g.beginPath();
        g.ellipse(x + R * 0.25, y - R * 0.15, R * 0.45, R * 0.3, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (pulse && !reducedMotion) raf = requestAnimationFrame(draw);
      else if (yv) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [map, width, height, theme, markers, labels, counts, highlight, reducedMotion, pulse]);
  return (
    <canvas
      ref={ref}
      className={`mm-schem ${className}`}
      style={{ width, height, cursor: onRoom ? 'pointer' : undefined }}
      onClick={(e) => {
        if (!onRoom) return;
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const pad = 8;
        const s = Math.min((rect.width - pad * 2) / map.w, (rect.height - pad * 2) / map.h);
        const ox = (rect.width - map.w * s) / 2;
        const oy = (rect.height - map.h * s) / 2;
        const x = (e.clientX - rect.left - ox) / s;
        const y = (e.clientY - rect.top - oy) / s;
        const tx = Math.floor(x);
        const ty = Math.floor(y);
        const ri = tx >= 0 && ty >= 0 && tx < map.w && ty < map.h ? map.roomIdx[ty * map.w + tx]! : -1;
        const r = ri >= 0 ? map.def.rooms[ri] : null;
        if (r) onRoom(r.id);
      }}
      role="img"
      aria-label={ariaLabel ?? `${map.def.name} map`}
    />
  );
}

/** Size helper: track an element's box (for canvases that fill a panel). */
export function useBox<T extends HTMLElement>(): [(el: T | null) => void, { w: number; h: number }] {
  // Callback ref: the element may mount later than the hook's owner.
  const [el, ref] = useState<T | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBox({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }));
    ro.observe(el);
    setBox({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) });
    return () => ro.disconnect();
  }, [el]);
  return [ref, box];
}

/** Viewport-size hook (re-renders on resize/rotation). */
export function useViewport(): { w: number; h: number; phone: boolean; portrait: boolean } {
  const get = () => ({ w: typeof innerWidth === 'number' ? innerWidth : 1280, h: typeof innerHeight === 'number' ? innerHeight : 800 });
  const [v, setV] = useState(get);
  useEffect(() => {
    const on = () => setV(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return useMemo(() => ({ ...v, phone: Math.min(v.w, v.h) < 520, portrait: v.h > v.w }), [v]);
}
