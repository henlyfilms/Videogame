/**
 * Shared UI bits for Marion Mystery: icons, berry avatars, modals, bars.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
  backspace: 'M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z M12 9l6 6 M18 9l-6 6',
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
  // --- HUD / chrome (original line icons) ---
  megaphone: 'M3 10v4h3l7 5V5L6 10H3z M16 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5 M19 6c2 1.6 3 3.6 3 6s-1 4.4-3 6',
  claw: 'M5 20C9 15 11 9 10 3 M10 20c3-4.5 5-9.5 5-15 M15 20c2.5-3.5 4-7 4.5-11',
  grate: 'M4 5h16v14H4z M8 5v14 M12 5v14 M16 5v14',
  ballot: 'M4 11h16v9H4z M7 11V6l6-3 4 6 M9 15h6',
  siren: 'M6 18V12a6 6 0 0 1 12 0v6 M4 18h16v3H4z M12 2v2 M3.5 6l1.5 1.5 M20.5 6 19 7.5 M10 11a2 2 0 0 1 2-2',
  hanger: 'M12 7a2 2 0 1 1 2-2 M12 7v2L3 16h18l-9-7',
  invite: 'M15 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 3 17.5V19 M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19 8v6 M16 11h6',
  lock: 'M6 11h12v10H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v10H6z M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  speaker: 'M4 9v6h4l5 4V5L8 9H4z M16.5 9a4 4 0 0 1 0 6',
  pad: 'M7 8h10a4 4 0 0 1 4 4l.5 4a2.5 2.5 0 0 1-4.3 1.8L15 16H9l-2.2 1.8A2.5 2.5 0 0 1 2.5 16L3 12a4 4 0 0 1 4-4z M7 11v3 M5.5 12.5h3 M16 12h.01 M18 13.5h.01',
  sliders: 'M4 6h10 M18 6h2 M16 4v4 M4 12h3 M11 12h9 M9 10v4 M4 18h12 M18 16v4',
  flag: 'M5 21V4 M5 4h12l-2 4 2 4H5',
  ping: 'M12 21c-4-4.6-6.5-8-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 13 16 16.4 12 21z M12 6.5v4.2 M12 13.6v.2',
  check: 'M5 12.5l4.5 4.5L19 7',
  chevron: 'M9 6l6 6-6 6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  tablet: 'M6 2h12v20H6z M10 18h4',
  expand: 'M4 4h6 M4 4v6 M20 20h-6 M20 20v-6 M4 4l6 6 M20 20l-6-6',
  dice: 'M4 4h16v16H4z M8.5 8.5h.01 M15.5 15.5h.01 M12 12h.01',
  palette: 'M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z M7.5 11h.01 M10 7h.01 M15 7.5h.01',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.1 7.9 20 18 M8.1 16.1 20 6',
  hat: 'M3 18h18 M6 18c0-7 2-12 6-12s6 5 6 12 M7 14h10',
  glasses: 'M2 11h2.5 M19.5 11H22 M4.5 12a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z M12.5 12a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z',
  backpack: 'M7 8a5 5 0 0 1 10 0v12H7z M9 4.5V3h6v1.5 M9 13h6v4H9z',
  paw: 'M12 20c-3 0-5-1.5-5-3.5S9 12 12 12s5 2.5 5 4.5-2 3.5-5 3.5z M6 10h.01 M9.5 6.5h.01 M14.5 6.5h.01 M18 10h.01',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 7.5h.01',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H4a3 3 0 0 0 4 4 M16 6h4a3 3 0 0 1-4 4 M12 13v4 M8 21h8 M9 17h6',
  gift: 'M4 11h16v10H4z M3 7h18v4H3z M12 7v14 M12 7C10.5 3.5 6.5 3.5 7.5 6.2 8 7 12 7 12 7z M12 7c1.5-3.5 5.5-3.5 4.5-.8C16 7 12 7 12 7z',
  bag: 'M5 8h14l-1.2 13H6.2z M9 10V6.5a3 3 0 0 1 6 0V10',
  // --- task icons ---
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  clip: 'M8 12V6a4 4 0 0 1 8 0v10a2.5 2.5 0 0 1-5 0V8',
  reel: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M12 6.5h.01 M17.5 12h.01 M12 17.5h.01 M6.5 12h.01',
  cartridge: 'M6 3h12v12l-2 2v4H8v-4l-2-2z M9 7h6 M9 10h6',
  pipe: 'M3 8h7a4 4 0 0 1 4 4v9 M3 13h5a1 1 0 0 1 1 1v7 M3 6v9 M12 21h5',
  disc: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17 7l-3 3',
  dish: 'M5 12a8 8 0 0 0 9 7.9L5.1 11 M5 12A8 8 0 0 1 13 4 M10 14l5-5 M15 9h.01 M18 6a3 3 0 0 0-3-3 M8 18l-2 4h6',
  can: 'M7 5h7l3 3v13H7z M7 9h10 M10 5V3h4',
  plug: 'M9 3v5 M15 3v5 M6 8h12v4a6 6 0 0 1-12 0z M12 18v3',
  card: 'M3 6h18v12H3z M3 10h18 M6 15h4',
  plant: 'M12 21v-8 M12 13c0-4 3-6 7-6 0 4-3 6-7 6z M12 15c0-3-2-5-6-5 0 3 2 5 6 5z M7 21h10',
  filter: 'M3 4h18l-7 9v6l-4 2v-8z',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 20h16',
  upload: 'M12 21V9 M7 14l5-5 5 5 M4 4h16',
  valve: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 3v6 M12 15v6 M3 12h6 M15 12h6 M5.6 5.6l3.4 3.4 M15 15l3.4 3.4',
  grid4: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  keypad: 'M5 3h14v18H5z M8.5 7h.01 M12 7h.01 M15.5 7h.01 M8.5 11h.01 M12 11h.01 M15.5 11h.01 M8.5 15h.01 M12 15h.01 M15.5 15h.01',
  chute: 'M4 4h16l-4 8v8H8v-8z M10 16h4',
  scan: 'M3 8V4h4 M17 4h4v4 M21 16v4h-4 M7 20H3v-4 M7 12h10',
  hex: 'M12 2l8.5 5v10L12 22l-8.5-5V7z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M15.5 8.5l-2 5-5 2 2-5z',
  fuse: 'M8 4h8v16H8z M4 8h4 M16 8h4 M4 16h4 M16 16h4 M12 8v8',
  lantern: 'M9 3h6 M12 3v2 M7 7h10l-1 12H8z M5 21h14 M12 11c-1 1.5-1 3 0 4 1-1 1-2.5 0-4z',
  press: 'M4 20h16 M7 20v-6h10v6 M12 3v8 M8 11h8 M9 6h6',
};

export function MIcon({ name, size = 20, className = '', stroke = 2 }: { name: string; size?: number; className?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={P[name] ?? P.help} />
    </svg>
  );
}

/** The shop currency glyph: an original inked seed with a little sprout leaf. */
export function SeedGlyph({ size = 18, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`mm-seed ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`sg${id}`} x1="0.2" y1="0.1" x2="0.8" y2="1">
          <stop offset="0" stopColor="#ffe9a3" />
          <stop offset="0.45" stopColor="#f2b544" />
          <stop offset="1" stopColor="#b9671f" />
        </linearGradient>
      </defs>
      <path d="M12.6 6.2c3.6 1.4 5.6 5.3 4.6 9-.9 3.4-3.8 5.6-6.4 5.1-2.7-.5-4.3-3.6-3.6-7.2.7-3.5 2.8-6.1 5.4-6.9z" fill={`url(#sg${id})`} stroke="#2a1606" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12.3 8.6c-1.6 2.6-2.2 6.2-1.4 9.7" fill="none" stroke="#8a4a16" strokeWidth="1.2" strokeLinecap="round" opacity=".75" />
      <path d="M14.4 9.4c.9.8 1.4 1.9 1.5 3" fill="none" stroke="#fff6d6" strokeWidth="1.3" strokeLinecap="round" opacity=".9" />
      <path d="M12.7 6.3c-.1-1.8.6-3.4 2.2-4.2 1.9-.9 3.8-.4 4.6.4-1 1.6-3.3 2.9-6.8 3.8z" fill="#5fd36a" stroke="#123b17" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function colorHex(i: number): string {
  return PALETTE[i]?.hex ?? '#6ea1ff';
}

/** Lifts very dark player colours so names stay legible on black panels. */
export function readable(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum >= 0.42) return hex;
  const k = 0.42 / Math.max(0.05, lum) > 3 ? 0.62 : 0.45;
  const mix = (c: number) => Math.round(c + (255 - c) * k);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
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
    // Small portraits are cheap, so 3× phones get them at full sharpness.
    const dpr = Math.min(size <= 128 ? 3 : 2, window.devicePixelRatio || 1);
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
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
  // Closing plays an exit animation first; the parent unmounts us afterwards.
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closingRef = useRef(false);
  const close = useCallback(() => {
    if (closingRef.current || !closeRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => closeRef.current?.(), 170);
  }, []);
  useEffect(() => {
    sfx.play('ui.open');
    return () => sfx.play('ui.close');
  }, []);
  const closable = !!onClose;
  useEffect(() => {
    if (!closable) return;
    // Capture phase + stopPropagation: Escape closes this modal only (it must
    // not also reach the game's input layer and open the pause menu).
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A nested layer (e.g. the buy confirmation) handles its own Escape.
      if ((e.target as Element | null)?.closest?.('[data-own-escape]')) return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [closable, close]);
  // Keyboard users land inside the dialog and return to where they were when it closes.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    if (box && !box.contains(document.activeElement)) box.focus({ preventScroll: true });
    return () => {
      if (prev && prev.isConnected && prev !== document.body) prev.focus({ preventScroll: true });
    };
  }, []);
  // Tab cycles inside the dialog instead of wandering into the game behind it.
  const trap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const box = boxRef.current;
    if (!box) return;
    const items = [...box.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const st = closing ? 'out' : 'in';
  return (
    <div className="mm-modal-back mm-safe" data-state={st} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={boxRef} tabIndex={-1} onKeyDown={trap} className={`mm-modal${wide ? ' wide' : ''}`} data-state={st} role="dialog" aria-modal aria-label={typeof title === 'string' ? title : undefined}>
        {(title || onClose) && (
          <div className="mm-modal-head">
            <div className="mm-modal-title">{title}</div>
            {onClose && (
              <button className="mm-round" onClick={close} aria-label="Close">
                <MIcon name="close" />
              </button>
            )}
          </div>
        )}
        <div className="mm-scroll mm-modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Progress bar: the fill eases via transform (no layout work per frame). */
export function Bar({ value, color, height = 10, label }: { value: number; color?: string; height?: number; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="mm-bar" style={{ height }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <i style={{ transform: `scaleX(${v})`, ...(color ? { background: color } : {}) }} />
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
