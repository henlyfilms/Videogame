/** Minimal inline stroke icons (no icon font, no external assets). */
const PATHS: Record<string, string> = {
  play: 'M7 5l11 7-11 7z',
  pause: 'M8 5v14M16 5v14',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  soft: 'M12 21a9 9 0 1 0 0-18v18z M12 3a9 9 0 0 1 0 18',
  volume: 'M4 9v6h4l5 4V5L8 9H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9v6h4l5 4V5L8 9H4z M17 9l5 6 M22 9l-5 6',
  gauge: 'M4 18a8 8 0 1 1 16 0 M12 14l4-5',
  command: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  close: 'M6 6l12 12M18 6 6 18',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12h.01',
  live: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M8.5 8.5a5 5 0 0 0 0 7 M15.5 8.5a5 5 0 0 1 0 7 M5.6 5.6a9 9 0 0 0 0 12.8 M18.4 5.6a9 9 0 0 1 0 12.8',
  film: 'M4 4h16v16H4z M8 4v16 M16 4v16 M4 9h4 M4 15h4 M16 9h4 M16 15h4',
  plug: 'M9 2v6 M15 2v6 M6 8h12v4a6 6 0 0 1-12 0V8z M12 18v4',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  home: 'M3 11l9-8 9 8 M5 10v10h14V10',
  chevron: 'M6 9l6 6 6-6',
  restart: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5',
};

export function Icon({ name, size = 14, className = '' }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  const d = PATHS[name] ?? PATHS.help!;
  const filled = name === 'play';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
