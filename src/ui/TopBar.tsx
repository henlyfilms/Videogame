import { useState } from 'react';
import type { AdapterKind } from '../adapters/types';
import { manager } from '../game/runtime';
import { SPEEDS, useGame } from '../store/gameStore';
import { THEME_ORDER, THEMES, type ThemeName } from '../theme/tokens';
import { countStates, useBots } from './hooks';
import { Icon } from './Icon';

const ADAPTERS: { kind: AdapterKind; label: string; icon: string }[] = [
  { kind: 'live', label: 'Live', icon: 'live' },
  { kind: 'replay', label: 'Replay', icon: 'film' },
  { kind: 'ws', label: 'Socket', icon: 'plug' },
];

const THEME_ICON: Record<ThemeName, string> = { light: 'sun', soft: 'soft', dark: 'moon' };

export const CONN_META: Record<string, { label: string; dot: string }> = {
  idle: { label: 'Simulated', dot: 'bg-muted' },
  connecting: { label: 'Connecting', dot: 'bg-warn animate-pulse' },
  open: { label: 'Connected', dot: 'bg-good' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-warn animate-pulse' },
  fallback: { label: 'Fallback · sim', dot: 'bg-warn' },
  closed: { label: 'Closed', dot: 'bg-[#ef4444]' },
};

export function TopBar() {
  const s = useGame();
  const bots = useBots(500);
  const counts = countStates(bots);
  const [wsOpen, setWsOpen] = useState(false);
  const conn = CONN_META[s.conn] ?? CONN_META.idle!;

  const switchAdapter = (k: AdapterKind) => {
    if (k === 'ws') setWsOpen(true);
    if (k !== s.adapter) manager.use(k);
  };

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start gap-2 p-3">
      {/* Brand + status counts */}
      <div className="hq-card pointer-events-auto flex items-center gap-3 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-accent/25 blur-[3px]" />
            <span className="relative h-3 w-3 rounded-full bg-accent" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Marion HQ</span>
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
      <div className="hq-card pointer-events-auto flex flex-wrap items-center gap-1 px-1.5 py-1">
        <div className="flex items-center rounded-card border border-line p-0.5" role="radiogroup" aria-label="Event source">
          {ADAPTERS.map((a) => (
            <button
              key={a.kind}
              role="radio"
              aria-checked={s.adapter === a.kind}
              className={`flex items-center gap-1 rounded-[8px] px-2 py-1 text-[11px] font-medium ${s.adapter === a.kind ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
              onClick={() => switchAdapter(a.kind)}
              title={`${a.label} events`}
            >
              <Icon name={a.icon} size={12} />
              <span className="hidden sm:inline">{a.label}</span>
            </button>
          ))}
        </div>
        <button className="hq-chip ml-0.5" title={s.connInfo ?? conn.label} onClick={() => s.adapter === 'ws' && setWsOpen((o) => !o)} aria-label={`Connection: ${conn.label}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${conn.dot}`} />
          <span className="hidden lg:inline">{s.adapter === 'replay' ? 'Replay' : conn.label}</span>
        </button>

        <Divider />
        <button className="hq-btn h-7 w-7 p-0" onClick={s.togglePause} aria-label={s.paused ? 'Resume (Space)' : 'Pause (Space)'} title={s.paused ? 'Resume (Space)' : 'Pause (Space)'}>
          <Icon name={s.paused ? 'play' : 'pause'} size={12} />
        </button>
        <div className="flex items-center rounded-card border border-line p-0.5" role="radiogroup" aria-label="Simulation speed">
          {SPEEDS.map((sp) => (
            <button key={sp} role="radio" aria-checked={s.speed === sp} className={`rounded-[8px] px-1.5 py-0.5 text-[11px] tabular-nums ${s.speed === sp ? 'bg-ink/10 font-semibold text-ink' : 'text-muted hover:text-ink'}`} onClick={() => s.setSpeed(sp)}>
              {sp}×
            </button>
          ))}
        </div>

        <Divider />
        <div className="flex items-center rounded-card border border-line p-0.5" role="radiogroup" aria-label="Theme">
          {THEME_ORDER.map((t) => (
            <button key={t} role="radio" aria-checked={s.theme === t} title={THEMES[t].label} aria-label={`${THEMES[t].label} theme`} className={`rounded-[8px] p-1 ${s.theme === t ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`} onClick={() => s.setTheme(t)}>
              <Icon name={THEME_ICON[t]} size={13} />
            </button>
          ))}
        </div>
        <button className={`hq-btn h-7 w-7 p-0 ${!s.muted ? 'border-accent text-accent' : ''}`} onClick={s.toggleMute} aria-label={s.muted ? 'Unmute audio' : 'Mute audio'} aria-pressed={!s.muted} title={s.muted ? 'Sound off' : 'Sound on'}>
          <Icon name={s.muted ? 'mute' : 'volume'} size={13} />
        </button>
        <button className={`hq-btn h-7 px-1.5 ${s.showFps ? 'border-accent text-accent' : ''}`} onClick={s.toggleFps} aria-pressed={s.showFps} title="Toggle FPS">
          <Icon name="gauge" size={13} />
          {s.showFps && <span className="tabular-nums">{s.fps}</span>}
        </button>
        <button className="hq-btn h-7 px-1.5" onClick={() => s.setPalette(true)} aria-label="Open command palette (Ctrl/Cmd+K)" title="Command palette (⌘K)">
          <Icon name="command" size={13} />
          <span className="hidden font-mono text-[10px] text-muted xl:inline">⌘K</span>
        </button>
        <button className="hq-btn h-7 w-7 p-0" onClick={() => s.setHelp(true)} aria-label="Controls & help" title="Controls (?)">
          <Icon name="help" size={13} />
        </button>
      </div>

      {wsOpen && s.adapter === 'ws' && <WsPopover onClose={() => setWsOpen(false)} />}
    </header>
  );
}

function StatusChip({ label, n, cls }: { label: string; n: number; cls: string }) {
  return (
    <span className="hq-chip tabular-nums" title={`${n} ${label}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />
      {n} <span className="hidden xl:inline">{label}</span>
    </span>
  );
}

function Divider() {
  return <span className="mx-0.5 hidden h-5 w-px bg-line sm:block" />;
}

function WsPopover({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const [url, setUrl] = useState(s.wsUrl);
  const ws = manager.ws;
  return (
    <div className="hq-card pointer-events-auto absolute right-3 top-14 z-30 w-[min(360px,calc(100vw-24px))] space-y-2 p-3" role="dialog" aria-label="WebSocket settings">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold">Live event stream</h2>
        <button className="hq-btn h-6 w-6 p-0" onClick={onClose} aria-label="Close">
          <Icon name="close" size={12} />
        </button>
      </div>
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
    </div>
  );
}
