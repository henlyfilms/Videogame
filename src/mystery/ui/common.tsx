/**
 * Shared UI bits for Marion Mystery: icons, berry avatars, modals, bars.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { PALETTE } from '../characters/catalog';
import { drawBerry } from '../characters/draw2d';
import type { Cosmetics } from '../core/types';
import { sfx } from '../audio/sfx';

const P: Record<string, string> = {
  knife: 'M14 3l7 7-9.5 9.5a2 2 0 0 1-2.8 0L4.5 15.3a2 2 0 0 1 0-2.8L14 3z M4.5 15.3 2 21l5.7-2.5',
  gun: 'M3 9h14l2-2h2v5h-6l-1 3H9l-1 5H4l1-5H3z',
  report: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z M15 8a5 5 0 0 1 0 8 M18 5a9 9 0 0 1 0 14',
  use: 'M8 13V5a1.5 1.5 0 0 1 3 0v6 M11 11V4a1.5 1.5 0 0 1 3 0v7 M14 11V5.5a1.5 1.5 0 0 1 3 0V13 M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L4 14.6a1.6 1.6 0 0 1 2.4-2l1.6 1.6',
  vent: 'M3 6h18v12H3z M6 9h12 M6 12h12 M6 15h12',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14',
  flashlight: 'M7 3h10l-2 6H9L7 3z M9 9h6v12H9z M12 13v2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  magnifier: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-5-5',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  chat: 'M4 5h16v11H8l-4 4z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  door: 'M4 21h16 M6 21V3h12v18 M14 12h.01',
  ghost: 'M5 21V10a7 7 0 0 1 14 0v11l-2.5-2-2.5 2-2-2-2 2-2.5-2z M9 10h.01 M15 10h.01',
  task: 'M9 11l3 3 8-8 M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  stats: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  play: 'M7 5l11 7-11 7z',
  plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 18l-6-6 6-6',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20',
  bot: 'M12 8V4 M8 4h8 M5 8h14v11H5z M9 13h.01 M15 13h.01 M9 17h6',
  shirt: 'M8 3l4 2 4-2 5 4-3 3-2-1v12H8V9l-2 1-3-3z',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  vial: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3',
  mask: 'M3 8c3-2 15-2 18 0 0 6-3 10-9 10S3 14 3 8z M8 11h2 M14 11h2',
  jester: 'M4 20h16 M5 20l2-10 5 4 5-4 2 10 M7 10 4 5 M17 10l3-5 M12 14V6',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  berry: 'M12 21c-5 0-8-4-8-9 0-4 3-7 8-7s8 3 8 7c0 5-3 9-8 9z M12 5c0-2 1-3 3-3',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 10v4l2 2 M9 2h6',
  wifi: 'M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M2 9a15 15 0 0 1 20 0 M12 20h.01',
  qr: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20 14v1 M14 20h1 M18 18h3v3',
  door2: 'M3 21h18 M5 21V5l9-2v18 M14 5h5v16',
  emote: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
  ready: 'M20 6 9 17l-5-5',
  crosshair: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M22 12h-4 M6 12H2 M12 6V2 M12 22v-4',
  battery: 'M3 7h15v10H3z M21 10v4 M6 10h6v4H6z',
  skip: 'M5 4l10 8-10 8z M19 5v14',
};

export function MIcon({ name, size = 20, className = '', stroke = 2 }: { name: string; size?: number; className?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={P[name] ?? P.help} />
    </svg>
  );
}

export function colorHex(i: number): string {
  return PALETTE[i]?.hex ?? '#6ea1ff';
}

/** Animated berry portrait (canvas). */
export function BerryAvatar({
  cosmetics,
  size = 64,
  dir = 1,
  emote = null,
  ghost = false,
  animate = true,
  moving = false,
  className = '',
}: {
  cosmetics: Cosmetics;
  size?: number;
  dir?: 1 | -1;
  emote?: string | null;
  ghost?: boolean;
  animate?: boolean;
  moving?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const t0 = performance.now() + Math.random() * 3000;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      try {
        drawBerry(ctx, cosmetics, size / 2, size * 0.9, size / 56, { time: (performance.now() - t0) / 1000, moving, dir, emote, ghost });
      } catch {
        /* drawing must never break the UI */
      }
      if (animate) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [cosmetics, size, dir, emote, ghost, animate, moving]);
  return <canvas ref={ref} style={{ width: size, height: size }} className={className} aria-hidden />;
}

export function Modal({ children, onClose, wide = false, title }: { children: ReactNode; onClose?: () => void; wide?: boolean; title?: ReactNode }) {
  useEffect(() => {
    sfx.play('ui.open');
    return () => sfx.play('ui.close');
  }, []);
  useEffect(() => {
    if (!onClose) return;
    // Capture phase + stopPropagation: Escape closes this modal only (it must
    // not also reach the game's input layer and open the pause menu).
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <div className="mm-anim-fade" style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,6,18,0.6)' }} onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="mm-panel mm-anim-pop mm-safe" role="dialog" aria-modal style={{ width: wide ? 'min(960px, 96vw)' : 'min(560px, 94vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        {(title || onClose) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: '1.15em', flex: 1 }}>{title}</div>
            {onClose && (
              <button className="mm-btn" style={{ minHeight: 40, padding: 8 }} onClick={onClose} aria-label="Close">
                <MIcon name="close" />
              </button>
            )}
          </div>
        )}
        <div className="mm-scroll" style={{ flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Bar({ value, color, height = 10 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="mm-bar" style={{ height }}>
      <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, ...(color ? { background: color, boxShadow: `0 0 12px ${color}` } : {}) }} />
    </div>
  );
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const PLATFORM_ICON: Record<string, string> = {
  mac: '',
  windows: '⊞',
  iphone: '📱',
  android: '📱',
  linux: '🐧',
  agent: '🤖',
  bot: '🍓',
  other: '•',
};

/** Team colours, with a colourblind-safe set (blue / orange / purple). */
export function teamColors(cb: boolean) {
  return cb
    ? { crew: '#3b82f6', murderers: '#f97316', neutral: '#a855f7', good: '#38bdf8', bad: '#f97316' }
    : { crew: '#6ea1ff', murderers: '#ff4d5e', neutral: '#facc15', good: '#4ade80', bad: '#ff4d5e' };
}
