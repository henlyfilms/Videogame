import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AdapterKind } from '../adapters/types';
import { manager } from '../game/runtime';
import { SPEEDS, useGame } from '../store/gameStore';
import { THEME_ORDER, THEMES, type ThemeName } from '../theme/tokens';
import { SEASONS, SEASON_STYLE, seasonFor, type Season, type TimeMode } from '../theme/environment';
import { countStates, useBots, useMediaQuery } from './hooks';
import { Icon } from './Icon';
import { setTopInset } from './layout';
import { closingAttr, usePresence } from './motion';

const ADAPTERS: { kind: AdapterKind; label: string; icon: string }[] = [
  { kind: 'live', label: 'Live', icon: 'live' },
  { kind: 'replay', label: 'Replay', icon: 'film' },
  { kind: 'ws', label: 'Socket', icon: 'plug' },
];

const THEME_ICON: Record<ThemeName, string> = {
  light: 'sun',
  soft: 'soft',
  dark: 'moon',
};

export const CONN_META: Record<string, { label: string; dot: string }> = {
  idle: { label: 'Simulated', dot: 'bg-muted' },
  connecting: { label: 'Connecting', dot: 'bg-warn animate-pulse' },
  open: { label: 'Connected', dot: 'bg-good' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-warn animate-pulse' },
  fallback: { label: 'Fallback · sim', dot: 'bg-warn' },
  closed: { label: 'Closed', dot: 'bg-[#ef4444]' },
};

type Pop = 'env' | 'ws' | 'more';

export function TopBar() {
  const s = useGame();
  const bots = useBots(500);
  const counts = countStates(bots);
  const [pop, setPop] = useState<Pop | null>(null);
  const shown = usePresence(pop);
  // Tablets and phones (portrait or landscape) fold the less-used controls into a "More" menu.
  const compact = useMediaQuery('(max-width: 1023px), (max-height: 500px)');
  const seasonNow: Season = s.season === 'auto' ? seasonFor() : s.season;
  const conn = CONN_META[s.conn] ?? CONN_META.idle!;
  const ref = useRef<HTMLElement>(null);

  // Panels, popovers and the camera keep clear of the bar however it wraps.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setTopInset(el.offsetHeight);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const close = useCallback(() => setPop(null), []);
  const toggle = (p: Pop) => setPop((o) => (o === p ? null : p));
  const switchAdapter = (k: AdapterKind) => {
    if (k === 'ws') setPop('ws');
    if (k !== s.adapter) manager.use(k);
  };

  return (
    <header ref={ref} className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start gap-2 p-3">
      {/* Brand + status counts */}
      <div className="hq-card pointer-events-auto flex h-10 items-center gap-3 px-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-accent/25 blur-[3px]" />
            <span className="relative h-3 w-3 rounded-full bg-accent" />
          </span>
          <span className="whitespace-nowrap text-sm font-semibold tracking-tight">Marion HQ</span>
        </div>
        <div className="hidden items-center gap-1 md:flex" aria-label="Bot status counts">
          <StatusChip label="working" n={counts.working + counts.delegating} cls="bg-good" />
          <StatusChip label="moving" n={counts.walking} cls="bg-accent" />
          <StatusChip label="huddle" n={counts.huddling} cls="bg-teal" />
          <StatusChip label="input" n={counts.needs_input} cls="bg-warn" />
          <StatusChip label="asleep" n={counts.asleep} cls="bg-muted" />
        </div>
      </div>

      <div className="flex-1" />

      {/* Controls */}
      <div className="hq-card hq-tb pointer-events-auto flex min-h-10 flex-wrap items-center gap-1 px-1.5 py-1 max-sm:w-full max-sm:justify-between">
        {!compact && (
          <>
            <SourceGroup adapter={s.adapter} onPick={switchAdapter} />
            <button className="hq-chip ml-0.5" title={s.connInfo ?? conn.label} onClick={() => s.adapter === 'ws' && toggle('ws')} aria-label={`Connection: ${conn.label}`} data-pop-toggle="">
              <span className={`h-1.5 w-1.5 rounded-full ${conn.dot}`} />
              <span className="hidden lg:inline">{s.adapter === 'replay' ? 'Replay' : conn.label}</span>
            </button>
            <Divider />
          </>
        )}
        <button className="hq-btn h-7 w-7 p-0" onClick={s.togglePause} aria-label={s.paused ? 'Resume (Space)' : 'Pause (Space)'} title={s.paused ? 'Resume (Space)' : 'Pause (Space)'}>
          <Icon name={s.paused ? 'play' : 'pause'} size={12} />
        </button>
        {!compact && <SpeedGroup speed={s.speed} onPick={s.setSpeed} />}

        <Divider />
        <div className="flex items-center rounded-card border border-line p-0.5" role="radiogroup" aria-label="HQ view">
          {(['2d', '3d'] as const).map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={s.hqView === v}
              title={v === '3d' ? '3D view' : '2D view'}
              aria-label={v === '3d' ? '3D view' : '2D view'}
              className={`rounded-[8px] px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${s.hqView === v ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
              onClick={() => s.setHqView(v)}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          className={`hq-btn h-7 gap-1 px-1.5 ${pop === 'env' ? 'border-accent' : ''}`}
          onClick={() => toggle('env')}
          aria-expanded={pop === 'env'}
          aria-label="Season and time of day"
          title="Season & time of day"
          data-pop-toggle=""
        >
          <span aria-hidden>{SEASON_STYLE[seasonNow].emoji}</span>
          <Icon name={s.timeMode === 'night' ? 'moon' : s.timeMode === 'day' ? 'sun' : 'clock'} size={12} />
        </button>
        {!compact && <ThemeGroup theme={s.theme} onPick={s.setTheme} />}
        <button
          className={`hq-btn h-7 w-7 p-0 ${!s.muted ? 'border-accent text-accent' : ''}`}
          onClick={s.toggleMute}
          aria-label={s.muted ? 'Unmute audio' : 'Mute audio'}
          aria-pressed={!s.muted}
          title={s.muted ? 'Sound off' : 'Sound on'}
        >
          <Icon name={s.muted ? 'mute' : 'volume'} size={13} />
        </button>
        {!compact && (
          <button className={`hq-btn h-7 px-1.5 ${s.showFps ? 'border-accent text-accent' : ''}`} onClick={s.toggleFps} aria-pressed={s.showFps} aria-label="Show FPS" title="Toggle FPS">
            <Icon name="gauge" size={13} />
            {s.showFps && <span className="tabular-nums">{s.fps}</span>}
          </button>
        )}
        {compact && s.showFps && <span className="hq-chip tabular-nums">{s.fps} fps</span>}
        <button className="hq-btn h-7 px-1.5" onClick={() => s.setPalette(true)} aria-label="Open command palette (Ctrl/Cmd+K)" title="Command palette (⌘K)">
          <Icon name="command" size={13} />
          <span className="hidden font-mono text-[10px] text-muted xl:inline">⌘K</span>
        </button>
        <button className="hq-btn h-7 w-7 p-0" onClick={() => s.setHelp(true)} aria-label="Controls & help" title="Controls (?)">
          <Icon name="help" size={13} />
        </button>
        {compact && (
          <button
            className={`hq-btn h-7 w-7 p-0 ${pop === 'more' ? 'border-accent text-accent' : ''}`}
            onClick={() => toggle('more')}
            aria-expanded={pop === 'more'}
            aria-label="More controls"
            title="Event source, speed, theme"
            data-pop-toggle=""
          >
            <Icon name="more" size={14} />
          </button>
        )}
      </div>

      {shown.mounted && shown.value === 'ws' && s.adapter === 'ws' && <WsPopover closing={shown.closing} onClose={close} />}
      {shown.mounted && shown.value === 'env' && <EnvPopover closing={shown.closing} onClose={close} />}
      {shown.mounted && shown.value === 'more' && <MorePopover closing={shown.closing} onClose={close} onSource={switchAdapter} />}
    </header>
  );
}

function SourceGroup({ adapter, onPick, labels = false }: { adapter: AdapterKind; onPick: (k: AdapterKind) => void; labels?: boolean }) {
  return (
    <div className="flex items-center rounded-card border border-line p-0.5" role="radiogroup" aria-label="Event source">
      {ADAPTERS.map((a) => (
        <button
          key={a.kind}
          role="radio"
          aria-checked={adapter === a.kind}
          className={`flex flex-1 items-center justify-center gap-1 rounded-[8px] px-2 py-1 text-[11px] font-medium transition-colors ${adapter === a.kind ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
          onClick={() => onPick(a.kind)}
          title={`${a.label} events`}
        >
          <Icon name={a.icon} size={12} />
          <span className={labels ? '' : 'hidden sm:inline'}>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

function SpeedGroup({ speed, onPick, wide = false }: { speed: number; onPick: (s: number) => void; wide?: boolean }) {
  return (
    <div className="flex items-center rounded-card border border-line p-0.5" role="radiogroup" aria-label="Simulation speed">
      {SPEEDS.map((sp) => (
        <button
          key={sp}
          role="radio"
          aria-checked={speed === sp}
          className={`rounded-[8px] px-1.5 py-0.5 text-[11px] tabular-nums transition-colors ${wide ? 'flex-1 py-1' : ''} ${speed === sp ? 'bg-ink/10 font-semibold text-ink' : 'text-muted hover:text-ink'}`}
          onClick={() => onPick(sp)}
        >
          {sp}×
        </button>
      ))}
    </div>
  );
}

function ThemeGroup({ theme, onPick, labels = false }: { theme: ThemeName; onPick: (t: ThemeName) => void; labels?: boolean }) {
  return (
    <div className="flex items-center rounded-card border border-line p-0.5" role="radiogroup" aria-label="Theme">
      {THEME_ORDER.map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          title={THEMES[t].label}
          aria-label={`${THEMES[t].label} theme`}
          className={`flex items-center justify-center gap-1 rounded-[8px] p-1 text-[11px] font-medium transition-colors ${labels ? 'flex-1 py-1' : ''} ${theme === t ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
          onClick={() => onPick(t)}
        >
          <Icon name={THEME_ICON[t]} size={13} />
          {labels && <span>{THEMES[t].label}</span>}
        </button>
      ))}
    </div>
  );
}

function StatusChip({ label, n, cls }: { label: string; n: number; cls: string }) {
  return (
    <span className="hq-chip tabular-nums" title={`${n} ${label}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />
      {n} <span className="hidden min-[1400px]:inline">{label}</span>
    </span>
  );
}

function Divider() {
  return <span className="mx-0.5 hidden h-5 w-px bg-line sm:block" />;
}

/** Close a popover on Escape or on a press outside it (the bar's popover toggles excluded). */
function useDismiss(ref: React.RefObject<HTMLElement>, onClose: () => void): void {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t) || t.closest?.('[data-pop-toggle]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [ref, onClose]);
}

function PopCard({ label, closing, onClose, width, children }: { label: string; closing: boolean; onClose: () => void; width: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  return (
    <div
      ref={ref}
      className="hq-card hq-anim-pop hq-scroll pointer-events-auto absolute right-3 z-30 space-y-3 overflow-y-auto p-3"
      style={{ top: 'var(--hq-top, 64px)', width: `min(${width}px, calc(100vw - 24px))`, maxHeight: 'calc(100dvh - var(--hq-top, 64px) - 12px)' }}
      role="dialog"
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      {...closingAttr(closing)}
    >
      {children}
    </div>
  );
}

function PopHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-semibold">{title}</h2>
      <button className="hq-btn h-6 w-6 p-0" onClick={onClose} aria-label="Close">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

const SECTION = 'mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted';

/** Phones and tablets: event source, speed, theme and FPS. */
function MorePopover({ closing, onClose, onSource }: { closing: boolean; onClose: () => void; onSource: (k: AdapterKind) => void }) {
  const s = useGame();
  const conn = CONN_META[s.conn] ?? CONN_META.idle!;
  return (
    <PopCard label="More controls" closing={closing} onClose={onClose} width={300}>
      <PopHeader title="Controls" onClose={onClose} />
      <section>
        <h3 className={`${SECTION} flex items-center justify-between`}>
          Event source
          <span className="flex items-center gap-1 font-medium normal-case tracking-normal">
            <span className={`h-1.5 w-1.5 rounded-full ${conn.dot}`} />
            {s.adapter === 'replay' ? 'Replay' : conn.label}
          </span>
        </h3>
        <SourceGroup adapter={s.adapter} onPick={onSource} labels />
      </section>
      <section>
        <h3 className={SECTION}>Speed</h3>
        <SpeedGroup speed={s.speed} onPick={s.setSpeed} wide />
      </section>
      <section>
        <h3 className={SECTION}>Theme</h3>
        <ThemeGroup theme={s.theme} onPick={s.setTheme} labels />
      </section>
      <button className={`hq-btn w-full justify-between ${s.showFps ? 'border-accent text-accent' : ''}`} onClick={s.toggleFps} aria-pressed={s.showFps}>
        <span className="flex items-center gap-1.5">
          <Icon name="gauge" size={13} />
          Show FPS
        </span>
        <span className="tabular-nums text-muted">{s.showFps ? `${s.fps} fps` : 'off'}</span>
      </button>
    </PopCard>
  );
}

const TIMES: { id: TimeMode; label: string; icon: string }[] = [
  { id: 'auto', label: 'Auto', icon: 'clock' },
  { id: 'day', label: 'Day', icon: 'sun' },
  { id: 'night', label: 'Night', icon: 'moon' },
];

/** Season, time-of-day and view picker for the HQ grounds. */
function EnvPopover({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  const s = useGame();
  const opt = (on: boolean) =>
    `hq-press flex flex-col items-center gap-0.5 rounded-[10px] border px-1 py-1.5 text-[11px] font-medium ${on ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:border-accent/50 hover:text-ink'}`;
  return (
    <PopCard label="Season and time of day" closing={closing} onClose={onClose} width={320}>
      <PopHeader title="HQ world" onClose={onClose} />
      <section>
        <h3 className={SECTION}>View</h3>
        <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="View">
          {(['2d', '3d'] as const).map((v) => (
            <button key={v} role="radio" aria-checked={s.hqView === v} className={opt(s.hqView === v)} onClick={() => s.setHqView(v)}>
              <span className="text-sm font-bold">{v.toUpperCase()}</span>
              <span>{v === '2d' ? 'Floorplan' : 'Diorama'}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className={SECTION}>Season</h3>
        <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Season">
          <button
            role="radio"
            aria-checked={s.season === 'auto'}
            className={opt(s.season === 'auto')}
            onClick={() => s.setSeason('auto')}
            title={`Follows the calendar (${SEASON_STYLE[seasonFor()].label})`}
          >
            <span className="text-base" aria-hidden>
              📅
            </span>
            Auto
          </button>
          {SEASONS.map((x) => (
            <button key={x} role="radio" aria-checked={s.season === x} className={opt(s.season === x)} onClick={() => s.setSeason(x)}>
              <span className="text-base" aria-hidden>
                {SEASON_STYLE[x].emoji}
              </span>
              {SEASON_STYLE[x].label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className={SECTION}>Time of day</h3>
        <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Time of day">
          {TIMES.map((x) => (
            <button key={x.id} role="radio" aria-checked={s.timeMode === x.id} className={opt(s.timeMode === x.id)} onClick={() => s.setTimeMode(x.id)}>
              <Icon name={x.icon} size={14} />
              {x.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted">Auto follows your local clock, with dusk and dawn.</p>
      </section>
    </PopCard>
  );
}

function WsPopover({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  const s = useGame();
  const [url, setUrl] = useState(s.wsUrl);
  const ws = manager.ws;
  return (
    <PopCard label="WebSocket settings" closing={closing} onClose={onClose} width={360}>
      <PopHeader title="Live event stream" onClose={onClose} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          s.setWsUrl(url.trim());
          manager.use('ws');
        }}
      >
        <input className="hq-input font-mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="wss://host/marion" aria-label="WebSocket URL" spellCheck={false} />
        <button className="hq-btn-primary shrink-0" type="submit">
          Connect
        </button>
      </form>
      <p className="text-[11px] text-muted">
        {CONN_META[s.conn]?.label}
        {s.connInfo ? ` · ${s.connInfo}` : ''}
      </p>
      {ws && (
        <p className="text-[11px] text-muted">
          {ws.received} events received · {ws.rejected} rejected by schema
        </p>
      )}
      <p className="text-[11px] leading-snug text-muted">Send MarionEvent JSON (single, array, or {'{events: [...]}'}). While the socket is down, the live sim keeps HQ moving.</p>
    </PopCard>
  );
}
