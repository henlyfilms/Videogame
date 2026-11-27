/**
 * Shared mini-game toolkit: the focusable game shell (keyboard / pointer
 * normalisation), the 480x360 SVG stage with glow defs, completion guard,
 * hold/raf hooks, grid + spatial navigation, and small procedural art atoms.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { sfx, type HoldSound, type TaskSound } from '../../audio/sfx';
import { ensureMiniGameStyles } from './styles';
import { minTimeMs } from './timing';
import type { MiniGameKind } from './types';

export const W = 480;
export const H = 360;

/** Mini-game palette: dark panel surfaces with Marion HQ glow accents. */
export const C = {
  bg0: '#060a14',
  bg1: '#0b1222',
  bg2: '#111a2e',
  panel: '#16213a',
  panelHi: '#1e2b49',
  line: '#26345a',
  ink: '#e6ecff',
  muted: '#8b9bbd',
  dim: '#5b6a8c',
  cobalt: '#2f6fed',
  cobaltHi: '#6ea1ff',
  teal: '#14b8a6',
  tealHi: '#2dd4bf',
  berry: '#e0457b',
  berryHi: '#ff7aa8',
  marion: '#7c3aed',
  marionHi: '#a78bfa',
  brass: '#d4a24c',
  brassHi: '#f5d08a',
  good: '#4ade80',
  warn: '#f59e0b',
  bad: '#f43f5e',
  leaf: '#22c55e',
  leafDark: '#15803d',
} as const;

export const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/* ------------------------------------------------------------------ sound */

/**
 * Step feedback for mini-games: `good` (a correct step; pass progress 0..1 and
 * the note climbs), `bad` (a wrong move), `grab` / `drop` (pick up / place),
 * `move` (cursor hop). Every key press and tap already ticks (TaskModal); the
 * solve sparkle and the credited chime are played for you.
 */
export function tsfx(kind: TaskSound, progress?: number): void {
  sfx.task(kind, progress);
}

/** Loop `sound` while `on` is true (pouring, cranking, scanning…). */
export function useHoldSound(on: boolean, sound: HoldSound | undefined): void {
  useEffect(() => {
    if (!on || !sound) return;
    return sfx.hold(sound);
  }, [on, sound]);
}

/* ------------------------------------------------------------------ input */

export type Dir = 'up' | 'down' | 'left' | 'right';

export function keyDir(key: string): Dir | null {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down';
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    default:
      return null;
  }
}

export function isActionKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

export interface KeyInput {
  key: string;
  dir: Dir | null;
  action: boolean;
  /** true for keydown, false for keyup */
  down: boolean;
  repeat: boolean;
  shift: boolean;
}

export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Move a cursor around a row-major grid (clamped at the edges). */
export function gridMove(index: number, dir: Dir, cols: number, count: number): number {
  const rows = Math.ceil(count / cols);
  let c = index % cols;
  let r = Math.floor(index / cols);
  if (dir === 'left') c = Math.max(0, c - 1);
  if (dir === 'right') c = Math.min(cols - 1, c + 1);
  if (dir === 'up') r = Math.max(0, r - 1);
  if (dir === 'down') r = Math.min(rows - 1, r + 1);
  const n = r * cols + c;
  return n < count ? n : index;
}

/**
 * Spatial navigation between arbitrary points: picks the nearest point lying
 * in the pressed direction (weighted against sideways drift). Returns `from`
 * when nothing lies that way. `skip(i)` hides points (e.g. already solved).
 */
export function spatialMove(
  pts: readonly { x: number; y: number }[],
  from: number,
  dir: Dir,
  skip?: (i: number) => boolean,
): number {
  const o = pts[from];
  if (!o) return from;
  const v = DIR_VEC[dir];
  let best = from;
  let bestScore = Infinity;
  pts.forEach((p, i) => {
    if (i === from || skip?.(i)) return;
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const along = dx * v.x + dy * v.y;
    if (along <= 2) return;
    const side = Math.abs(dx * v.y - dy * v.x);
    const score = along + side * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** First index not skipped, scanning forward from `from` (wrapping). */
export function nextOpen(count: number, from: number, skip: (i: number) => boolean): number {
  for (let k = 0; k < count; k++) {
    const i = (from + k) % count;
    if (!skip(i)) return i;
  }
  return from;
}

/* ------------------------------------------------------------------ shell */

interface ShellState {
  kbd: boolean;
  rm: boolean;
}
const ShellCtx = createContext<ShellState>({ kbd: false, rm: false });
export const useShell = (): ShellState => useContext(ShellCtx);

function initialKbd(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try {
    return !window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return true;
  }
}

export interface GameShellProps {
  kind: MiniGameKind;
  label: string;
  reducedMotion?: boolean;
  /** Return false to let the browser keep the key's default behaviour. */
  onKey?: (k: KeyInput) => boolean | void;
  /** Screen-reader status line (aria-live). */
  status?: string;
  children: ReactNode;
}

/**
 * The focusable root of every mini-game. Normalises arrows/WASD + Enter/Space
 * (which is also how gamepads drive the panel), tracks whether the player is
 * using keys (to show the focus cursor), and focuses itself on mount.
 */
export function GameShell({ kind, label, reducedMotion, onKey, status, children }: GameShellProps) {
  ensureMiniGameStyles();
  const ref = useRef<HTMLDivElement>(null);
  const [kbd, setKbd] = useState(initialKbd);
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  const handle = (e: React.KeyboardEvent<HTMLDivElement>, down: boolean) => {
    if (e.key === 'Escape' || e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
    const k: KeyInput = {
      key: e.key,
      dir: keyDir(e.key),
      action: isActionKey(e.key),
      down,
      repeat: e.repeat,
      shift: e.shiftKey,
    };
    if (down && (k.dir || k.action)) setKbd(true);
    const used = onKeyRef.current?.(k);
    if (used !== false && (k.dir || k.action || used === true)) e.preventDefault();
  };
  const ctx = useMemo(() => ({ kbd, rm: !!reducedMotion }), [kbd, reducedMotion]);
  return (
    <ShellCtx.Provider value={ctx}>
      <div
        ref={ref}
        className={`mmg-root${reducedMotion ? ' mmg-rm' : ''}`}
        tabIndex={0}
        role="application"
        aria-roledescription="task mini-game"
        aria-label={label}
        data-minigame={kind}
        onKeyDown={(e) => handle(e, true)}
        onKeyUp={(e) => handle(e, false)}
        onPointerDown={() => setKbd(false)}
      >
        {children}
        <div className="mmg-sr" aria-live="polite">
          {status}
        </div>
      </div>
    </ShellCtx.Provider>
  );
}

/* ------------------------------------------------------------------ stage */

export interface Ids {
  id: (name: string) => string;
  url: (name: string) => string;
}

/** Per-instance SVG id helper so several stages can share a document. */
export function useIds(): Ids {
  const raw = useId();
  return useMemo(() => {
    const p = 'mmg' + raw.replace(/[^a-zA-Z0-9]/g, '');
    return { id: (n: string) => `${p}-${n}`, url: (n: string) => `url(#${p}-${n})` };
  }, [raw]);
}

export interface StageProps {
  ids: Ids;
  children: ReactNode;
  /** Background glow colour. */
  tone?: string;
  /** Secondary glow. */
  tone2?: string;
  defs?: ReactNode;
  svgRef?: RefObject<SVGSVGElement>;
  onPointerMove?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerDown?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  grid?: boolean;
}

/** The 480x360 SVG stage: deep navy surface, soft accent glows, dot grid, vignette. */
export function Stage({ ids, children, tone = C.cobalt, tone2 = C.teal, defs, svgRef, onPointerMove, onPointerUp, onPointerDown, grid = true }: StageProps) {
  return (
    <svg
      ref={svgRef}
      className="mmg-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
    >
      <defs>
        <radialGradient id={ids.id('bgA')} cx="22%" cy="12%" r="75%">
          <stop offset="0" stopColor={tone} stopOpacity="0.30" />
          <stop offset="1" stopColor={tone} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.id('bgB')} cx="88%" cy="96%" r="70%">
          <stop offset="0" stopColor={tone2} stopOpacity="0.22" />
          <stop offset="1" stopColor={tone2} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ids.id('vig')} cx="50%" cy="50%" r="72%">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </radialGradient>
        <pattern id={ids.id('dots')} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="8" r="0.9" fill="#9fb6ff" opacity="0.13" />
        </pattern>
        <filter id={ids.id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={ids.id('glowBig')} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={ids.id('blur')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={ids.id('shadow')} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.45" />
        </filter>
        <linearGradient id={ids.id('metal')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4a6e" />
          <stop offset="0.5" stopColor="#243150" />
          <stop offset="1" stopColor="#161f36" />
        </linearGradient>
        <linearGradient id={ids.id('brass')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe6a8" />
          <stop offset="0.45" stopColor="#d4a24c" />
          <stop offset="1" stopColor="#7a5418" />
        </linearGradient>
        <linearGradient id={ids.id('glass')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>
        {defs}
      </defs>
      <rect width={W} height={H} fill={C.bg1} />
      <rect width={W} height={H} fill={ids.url('bgA')} />
      <rect width={W} height={H} fill={ids.url('bgB')} />
      {grid && <rect width={W} height={H} fill={ids.url('dots')} />}
      {children}
      <rect width={W} height={H} fill={ids.url('vig')} pointerEvents="none" />
    </svg>
  );
}

/** Convert a pointer event to stage coordinates (handles letterboxing). */
export function svgPoint(svg: SVGSVGElement | null, e: { clientX: number; clientY: number }): { x: number; y: number } {
  if (!svg) return { x: 0, y: 0 };
  const r = svg.getBoundingClientRect();
  if (!r.width || !r.height) return { x: 0, y: 0 };
  const s = Math.min(r.width / W, r.height / H);
  const ox = (r.width - W * s) / 2;
  const oy = (r.height - H * s) / 2;
  return { x: (e.clientX - r.left - ox) / s, y: (e.clientY - r.top - oy) / s };
}

export function capture(e: ReactPointerEvent<Element>): void {
  try {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  } catch {
    /* ignore (synthetic events) */
  }
}

/* ------------------------------------------------------------------ hooks */

/**
 * Completion guard: `finish()` locks the game, then calls onComplete exactly
 * once after a short celebratory beat — never before the task's minTime.
 */
export function useFinish(kind: MiniGameKind, onComplete: () => void) {
  const t0 = useRef<number>(0);
  if (t0.current === 0) t0.current = now();
  const [done, setDone] = useState(false);
  const fired = useRef(false);
  const cb = useRef(onComplete);
  cb.current = onComplete;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const finish = useCallback(
    (hold = 450) => {
      if (fired.current) return;
      fired.current = true;
      setDone(true);
      const wait = Math.max(hold, minTimeMs(kind) - (now() - t0.current));
      timer.current = setTimeout(() => cb.current(), wait);
    },
    [kind],
  );
  return { done, finish };
}

export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** requestAnimationFrame loop delivering clamped dt (seconds). */
export function useRaf(cb: (dt: number, t: number) => void, active = true): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active) return;
    let id = 0;
    let last = now();
    const loop = () => {
      const t = now();
      const dt = Math.min(0.1, Math.max(0, (t - last) / 1000)); // keeps pace down to 10 fps
      last = t;
      ref.current(dt, t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

/** Schedule timeouts that are cleared on unmount. */
export function useTimers() {
  const ids = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const set = ids.current;
    return () => {
      set.forEach((i) => clearTimeout(i));
      set.clear();
    };
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      ids.current.delete(id);
      fn();
    }, ms);
    ids.current.add(id);
  }, []);
}

/**
 * Hold input: pointer press (with capture) or Space/Enter held down.
 * `extraKeys` lets a game also accept e.g. ArrowDown as the hold key.
 */
export function useHold(enabled: boolean, extraKeys: Dir[] = [], sound?: HoldSound) {
  const [holding, setHolding] = useState(false);
  useHoldSound(holding && enabled, sound);
  const ref = useRef(false);
  const set = useCallback((v: boolean) => {
    if (ref.current === v) return;
    ref.current = v;
    setHolding(v);
  }, []);
  useEffect(() => {
    if (!enabled) set(false);
  }, [enabled, set]);
  useEffect(() => {
    const off = () => set(false);
    window.addEventListener('blur', off);
    return () => window.removeEventListener('blur', off);
  }, [set]);
  const pointer = {
    onPointerDown: (e: ReactPointerEvent<Element>) => {
      if (!enabled) return;
      capture(e);
      set(true);
    },
    onPointerUp: () => set(false),
    onPointerCancel: () => set(false),
    onLostPointerCapture: () => set(false),
  };
  const key = (k: KeyInput): boolean => {
    if (k.action || (k.dir && extraKeys.includes(k.dir))) {
      if (!k.down) set(false);
      // A key already held when the control becomes live engages on its auto-repeat.
      else if (enabled && (!k.repeat || !ref.current)) set(true);
      return true;
    }
    return false;
  };
  return { holding, ref, set, pointer, key };
}

/** A counter you bump to retrigger keyed animations (ripples, shakes, bursts). */
export function useBump(): [number, () => void] {
  const [n, setN] = useState(0);
  return [n, useCallback(() => setN((v) => v + 1), [])];
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/* ------------------------------------------------------------------ atoms */

/** Glowing dashed focus ring that only shows while the player uses keys. */
export function FocusRing({ x, y, w, h, r = 12, color = C.cobaltHi, show = true }: { x: number; y: number; w: number; h: number; r?: number; color?: string; show?: boolean }) {
  const { kbd } = useShell();
  if (!kbd || !show) return null;
  return (
    <g pointerEvents="none">
      <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={r + 4} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={8} />
      <rect className="mmg-dash" x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={r + 4} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray="8 4" />
    </g>
  );
}

export function FocusCircle({ x, y, r, color = C.cobaltHi, show = true }: { x: number; y: number; r: number; color?: string; show?: boolean }) {
  const { kbd } = useShell();
  if (!kbd || !show) return null;
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={r + 5} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={8} />
      <circle className="mmg-dash" cx={x} cy={y} r={r + 5} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray="8 4" />
    </g>
  );
}

/** Radial particle burst; change `k` to replay. */
export function Burst({ x, y, k, color = C.tealHi, n = 12, dist = 46, size = 4 }: { x: number; y: number; k: number | string; color?: string; n?: number; dist?: number; size?: number }) {
  if (!k) return null;
  return (
    <g key={k} pointerEvents="none">
      <circle className="mmg-ripple" cx={x} cy={y} r={dist * 0.55} fill="none" stroke={color} strokeWidth={3} />
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2;
        const d = dist * (i % 2 ? 0.7 : 1);
        const style = { ['--dx' as string]: `${Math.cos(a) * d}px`, ['--dy' as string]: `${Math.sin(a) * d}px` } as React.CSSProperties;
        return <circle key={i} className="mmg-burst" cx={x} cy={y} r={i % 3 === 0 ? size * 1.3 : size} fill={i % 4 === 1 ? '#fff' : color} style={style} />;
      })}
    </g>
  );
}

/** Pill-shaped status toast; change `k` to replay. */
export function Toast({ k, text, tone = C.cobaltHi, y = 26 }: { k: number; text: string; tone?: string; y?: number }) {
  if (!k || !text) return null;
  const w = Math.max(90, text.length * 7.6 + 28);
  return (
    <g key={k} className="mmg-toast" pointerEvents="none">
      <rect x={W / 2 - w / 2} y={y - 15} width={w} height={30} rx={15} fill="#0b1222" fillOpacity={0.92} stroke={tone} strokeOpacity={0.8} />
      <text x={W / 2} y={y + 5} textAnchor="middle" fontSize={13.5} fontWeight={700} fill={tone}>
        {text}
      </text>
    </g>
  );
}

/** Small caption chip at the top-left of a stage. */
export function Caption({ text, x = 14, y = 14, tone = C.cobaltHi }: { text: string; x?: number; y?: number; tone?: string }) {
  const w = text.length * 7.5 + 28;
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={22} rx={11} fill="#0b1222" fillOpacity={0.75} stroke={tone} strokeOpacity={0.35} />
      <circle cx={x + 11} cy={y + 11} r={3} fill={tone} className="mmg-pulse" />
      <text x={x + 19} y={y + 15} fontSize={11} fontWeight={700} fill="#cbd8f5" letterSpacing={0.4}>
        {text}
      </text>
    </g>
  );
}

export type BerryKind = 'straw' | 'blue' | 'rasp' | 'marion' | 'cherry' | 'goose';

export const BERRY_COLORS: Record<BerryKind, { body: string; hi: string; dark: string }> = {
  straw: { body: '#ef4444', hi: '#ff8a8a', dark: '#991b1b' },
  blue: { body: '#3b5bdb', hi: '#7c9cff', dark: '#1e2f7a' },
  rasp: { body: '#e0457b', hi: '#ff8fb5', dark: '#8a1a43' },
  marion: { body: '#6d28d9', hi: '#a78bfa', dark: '#2e1065' },
  cherry: { body: '#dc2626', hi: '#fca5a5', dark: '#7f1d1d' },
  goose: { body: '#84cc16', hi: '#d9f99d', dark: '#3f6212' },
};

/**
 * Procedural berry (origin-centred, radius r). Optional cute face.
 * `tint` overrides body colour (used for ripeness).
 */
export function Berry({ kind = 'rasp', r = 16, face = false, tint, x = 0, y = 0, leaf = true }: { kind?: BerryKind; r?: number; face?: boolean; tint?: { body: string; hi: string; dark: string }; x?: number; y?: number; leaf?: boolean }) {
  const col = tint ?? BERRY_COLORS[kind];
  const drupes = kind === 'rasp' || kind === 'marion';
  const body =
    kind === 'straw' ? (
      <path d={`M0 ${r * 1.05} C ${-r * 1.25} ${r * 0.2} ${-r * 1.15} ${-r * 0.95} 0 ${-r * 0.78} C ${r * 1.15} ${-r * 0.95} ${r * 1.25} ${r * 0.2} 0 ${r * 1.05} Z`} fill={col.body} stroke={col.dark} strokeWidth={1.2} />
    ) : kind === 'marion' ? (
      <ellipse rx={r * 0.82} ry={r * 1.05} fill={col.body} stroke={col.dark} strokeWidth={1.2} />
    ) : (
      <circle r={r} fill={col.body} stroke={col.dark} strokeWidth={1.2} />
    );
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx={0} cy={r * 1.08} rx={r * 0.8} ry={r * 0.18} fill="#000" opacity={0.25} />
      {body}
      {drupes &&
        [-0.45, 0, 0.45].flatMap((dx, i) =>
          [-0.5, 0, 0.5].map((dy, j) => (
            <circle key={`${i}${j}`} cx={dx * r + (j % 2 ? r * 0.2 : 0)} cy={dy * r * (kind === 'marion' ? 1.15 : 1)} r={r * 0.3} fill={col.body} stroke={col.dark} strokeOpacity={0.55} strokeWidth={0.8} />
          )),
        )}
      {kind === 'straw' &&
        [
          [-0.4, -0.2],
          [0.35, -0.3],
          [0, 0.15],
          [-0.3, 0.45],
          [0.3, 0.4],
          [0.05, -0.45],
          [0.55, 0.05],
          [-0.6, 0.15],
        ].map(([sx, sy], i) => <ellipse key={i} cx={(sx ?? 0) * r} cy={(sy ?? 0) * r} rx={r * 0.06} ry={r * 0.1} fill="#fde68a" opacity={0.9} />)}
      {kind === 'blue' && <path d={`M${-r * 0.25} ${-r * 0.78} l${r * 0.25} ${r * 0.18} l${r * 0.25} ${-r * 0.18} l${-r * 0.08} ${r * 0.3} l${-r * 0.34} 0 Z`} fill={col.dark} />}
      <ellipse cx={-r * 0.35} cy={-r * 0.35} rx={r * 0.28} ry={r * 0.18} fill={col.hi} opacity={0.75} transform={`rotate(-30 ${-r * 0.35} ${-r * 0.35})`} />
      {leaf && kind !== 'blue' && (
        <g transform={`translate(0 ${kind === 'straw' ? -r * 0.78 : -r * 0.95})`}>
          <path d={`M0 0 C ${-r * 0.5} ${-r * 0.1} ${-r * 0.7} ${-r * 0.45} ${-r * 0.55} ${-r * 0.5} C ${-r * 0.3} ${-r * 0.35} ${-r * 0.1} ${-r * 0.2} 0 0 Z`} fill={C.leaf} />
          <path d={`M0 0 C ${r * 0.5} ${-r * 0.1} ${r * 0.7} ${-r * 0.45} ${r * 0.55} ${-r * 0.5} C ${r * 0.3} ${-r * 0.35} ${r * 0.1} ${-r * 0.2} 0 0 Z`} fill={C.leaf} />
          <path d={`M0 0 L0 ${-r * 0.45}`} stroke={C.leafDark} strokeWidth={r * 0.12} strokeLinecap="round" />
        </g>
      )}
      {face && (
        <g>
          <ellipse cx={-r * 0.32} cy={r * 0.05} rx={r * 0.12} ry={r * 0.17} fill="#0b1020" />
          <ellipse cx={r * 0.32} cy={r * 0.05} rx={r * 0.12} ry={r * 0.17} fill="#0b1020" />
          <circle cx={-r * 0.28} cy={-r * 0.02} r={r * 0.05} fill="#fff" />
          <circle cx={r * 0.36} cy={-r * 0.02} r={r * 0.05} fill="#fff" />
          <path d={`M${-r * 0.2} ${r * 0.35} Q0 ${r * 0.55} ${r * 0.2} ${r * 0.35}`} stroke="#0b1020" strokeWidth={r * 0.09} fill="none" strokeLinecap="round" />
          <ellipse cx={-r * 0.55} cy={r * 0.3} rx={r * 0.12} ry={r * 0.07} fill="#ff9ab8" opacity={0.6} />
          <ellipse cx={r * 0.55} cy={r * 0.3} rx={r * 0.12} ry={r * 0.07} fill="#ff9ab8" opacity={0.6} />
        </g>
      )}
    </g>
  );
}

/** A chunky rounded SVG button with gradient face and press depth. */
export function SvgButton({
  x,
  y,
  w,
  h,
  label,
  sub,
  color = C.cobalt,
  hi = C.cobaltHi,
  pressed = false,
  disabled = false,
  onPress,
  focus = false,
  ids,
  fontSize = 16,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: ReactNode;
  sub?: string;
  color?: string;
  hi?: string;
  pressed?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  focus?: boolean;
  ids: Ids;
  fontSize?: number;
}) {
  const gid = ids.id(`btn${x}_${y}`);
  return (
    <g
      className={disabled ? undefined : 'mmg-hit'}
      opacity={disabled ? 0.45 : 1}
      onPointerDown={(e) => {
        if (disabled) return;
        e.stopPropagation();
        onPress?.();
      }}
      role="button"
      aria-label={typeof label === 'string' ? label : sub}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="1" stopColor={color} />
        </linearGradient>
      </defs>
      <rect x={x} y={y + 5} width={w} height={h} rx={12} fill="#000" opacity={0.35} />
      <g className="mmg-fast" style={{ transform: `translateY(${pressed ? 4 : 0}px)` }}>
        <rect x={x} y={y} width={w} height={h} rx={12} fill={`url(#${gid})`} stroke="#fff" strokeOpacity={0.25} />
        <rect x={x + 4} y={y + 3} width={w - 8} height={h * 0.38} rx={9} fill="#fff" opacity={0.16} />
        <text x={x + w / 2} y={y + h / 2 + (sub ? -1 : fontSize * 0.36)} textAnchor="middle" fontSize={fontSize} fontWeight={800} fill="#fff" letterSpacing={0.3}>
          {label}
        </text>
        {sub && (
          <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill="#fff" opacity={0.8}>
            {sub}
          </text>
        )}
      </g>
      <FocusRing x={x} y={y} w={w} h={h} r={12} show={focus} />
    </g>
  );
}

/** Horizontal glowing progress bar. */
export function Meter({ x, y, w, h = 12, value, color = C.tealHi, ids, label }: { x: number; y: number; w: number; h?: number; value: number; color?: string; ids: Ids; label?: string }) {
  const v = clamp(value, 0, 1);
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#0a1020" stroke="#2a3a62" />
      {v > 0.001 && <rect x={x + 2} y={y + 2} width={Math.max(h - 4, (w - 4) * v)} height={h - 4} rx={(h - 4) / 2} fill={color} filter={ids.url('glow')} />}
      {v > 0.001 && <rect x={x + 4} y={y + 3} width={Math.max(0, (w - 8) * v)} height={(h - 4) / 3} rx={2} fill="#fff" opacity={0.35} />}
      {label && (
        <text x={x + w / 2} y={y - 6} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={C.muted} letterSpacing={1}>
          {label}
        </text>
      )}
    </g>
  );
}

/** Tiny decorative twinkling dots (stars / dust). Deterministic from seed. */
export function Twinkles({ seed, n = 18, area = { x: 0, y: 0, w: W, h: H }, color = '#cfe0ff' }: { seed: number; n?: number; area?: { x: number; y: number; w: number; h: number }; color?: string }) {
  const pts = useMemo(() => {
    let s = seed >>> 0 || 1;
    const r = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    return Array.from({ length: n }, () => ({ x: area.x + r() * area.w, y: area.y + r() * area.h, r: 0.6 + r() * 1.4, d: r() * 2.4 }));
  }, [seed, n, area.x, area.y, area.w, area.h]);
  return (
    <g pointerEvents="none">
      {pts.map((p, i) => (
        <circle key={i} className="mmg-twinkle" cx={p.x} cy={p.y} r={p.r} fill={color} style={{ animationDelay: `${-p.d}s` }} />
      ))}
    </g>
  );
}

/** Shape glyphs used where colour alone must not carry meaning. */
export type ShapeKind = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'heart';

export function shapePath(kind: ShapeKind, r: number): string {
  switch (kind) {
    case 'circle':
      return `M${-r} 0 a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
    case 'square':
      return `M${-r * 0.85} ${-r * 0.85} H${r * 0.85} V${r * 0.85} H${-r * 0.85} Z`;
    case 'triangle':
      return `M0 ${-r} L${r * 0.95} ${r * 0.75} L${-r * 0.95} ${r * 0.75} Z`;
    case 'diamond':
      return `M0 ${-r * 1.05} L${r * 0.9} 0 L0 ${r * 1.05} L${-r * 0.9} 0 Z`;
    case 'star': {
      let d = '';
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)} `;
      }
      return d + 'Z';
    }
    case 'heart':
      return `M0 ${r * 0.85} C ${-r * 1.4} ${-r * 0.1} ${-r * 0.6} ${-r * 1.2} 0 ${-r * 0.45} C ${r * 0.6} ${-r * 1.2} ${r * 1.4} ${-r * 0.1} 0 ${r * 0.85} Z`;
  }
}
