import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BotShape } from '../data/bots';
import { drawBotSprite } from '../render/sprites';
import { useGame } from '../store/gameStore';
import { THEMES } from '../theme/tokens';

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="hq-label">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-card border border-dashed border-line px-3 py-2 text-[11px] text-muted">{children}</p>;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'warn' | 'accent' | 'teal' }) {
  const color = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent' : tone === 'teal' ? 'text-teal' : 'text-ink';
  return (
    <div className="rounded-card border border-line px-2.5 py-1.5">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export function Bar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'good' | 'teal' | 'warn' }) {
  const bg = tone === 'good' ? 'bg-good' : tone === 'teal' ? 'bg-teal' : tone === 'warn' ? 'bg-warn' : 'bg-accent';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${bg} transition-[width] duration-300`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

/** Tiny canvas preview of a bot sprite (Foundry bench, inspector, roster). */
export function BotPreview({ shape, color, glow, size = 44, starred = false }: { shape: BotShape; color: string; glow: string; size?: number; starred?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useGame((s) => s.theme);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      drawBotSprite(ctx, size / 2, size / 2, { shape, color, glowColor: glow, starred, state: 'idle', time: t, phase: 0, facing: 1, theme: THEMES[theme], radius: size * 0.24 });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [shape, color, glow, size, starred, theme]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-bg px-1 font-mono text-[10px] text-muted">{children}</kbd>;
}

/** Re-render every `ms` and return the current time (for live countdowns). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
