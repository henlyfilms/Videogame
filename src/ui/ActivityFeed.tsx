import { useMemo, useState } from 'react';
import type { RoomId } from '../data/bots';
import { REPLAY_EPOCH } from '../adapters/replay';
import { useGame, type FeedItem } from '../store/gameStore';
import { Icon } from './Icon';

type Filter = 'all' | 'bots' | 'rooms' | 'cross';

function replayStamp(ts: number): string {
  const s = Math.max(0, Math.round((ts - REPLAY_EPOCH) / 1000));
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
}

const TYPE_DOT: Partial<Record<FeedItem['type'], string>> = {
  'mail.pending_approval': 'bg-[#d4a017]',
  'mail.sent': 'bg-[#d4a017]',
  'release.shipped': 'bg-accent',
  'task.completed': 'bg-good',
  'reel.distilled': 'bg-teal',
  'skill.slotted': 'bg-[#fb923c]',
  'bot.spawned': 'bg-[#fb923c]',
  'group.huddle_start': 'bg-teal',
  'dictation.wave': 'bg-teal',
};

export function ActivityFeed({ onPanRoom, onPanBot }: { onPanRoom: (r: RoomId) => void; onPanBot: (id: string) => void }) {
  const feed = useGame((s) => s.feed);
  const open = useGame((s) => s.feedOpen);
  const toggle = useGame((s) => s.toggleFeed);
  const replay = useGame((s) => s.adapter === 'replay');
  const [filter, setFilter] = useState<Filter>('all');
  const now = Date.now();
  const items = useMemo(
    () =>
      feed
        .filter((f) => (filter === 'all' ? true : filter === 'cross' ? f.cross : filter === 'bots' ? !!f.botId : !!f.room))
        .slice(0, 40),
    [feed, filter],
  );

  return (
    <section className="hq-card pointer-events-auto flex max-h-full w-full flex-col overflow-hidden sm:w-[320px]" aria-label="Activity feed" onPointerDown={(e) => e.stopPropagation()}>
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <button className="flex items-center gap-1.5 text-xs font-semibold" onClick={toggle} aria-expanded={open}>
          <Icon name="list" size={13} />
          Activity
          <span className="hq-chip px-1.5 py-0 tabular-nums">{feed.length}</span>
          <Icon name="chevron" size={12} className={`text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        {open && (
          <div className="flex gap-0.5" role="radiogroup" aria-label="Feed filter">
            {(['all', 'bots', 'rooms', 'cross'] as Filter[]).map((f) => (
              <button key={f} role="radio" aria-checked={filter === f} className={`rounded-[8px] px-1.5 py-0.5 text-[10px] ${filter === f ? 'bg-accent/10 font-semibold text-accent' : 'text-muted hover:text-ink'}`} onClick={() => setFilter(f)}>
                {f === 'cross' ? 'cross-bot' : f}
              </button>
            ))}
          </div>
        )}
      </header>
      {open && (
        <ol className="hq-scroll hq-anim-fade max-h-[34vh] overflow-y-auto border-t border-line px-1 py-1" aria-live="polite">
          {items.length === 0 && <li className="px-2 py-3 text-[11px] text-muted">Waiting for events…</li>}
          {items.map((f) => (
            <li key={f.id}>
              <button
                className="group flex w-full items-start gap-2 rounded-[8px] px-2 py-1 text-left hover:bg-accent/5"
                onClick={() => (f.botId && f.botId !== 'you' ? onPanBot(f.botId) : f.room ? onPanRoom(f.room) : undefined)}
                title="Pan to"
              >
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${f.cross ? 'bg-teal' : (TYPE_DOT[f.type] ?? 'bg-line')}`} />
                <span className={`min-w-0 flex-1 text-[11px] leading-snug ${f.cross ? 'text-teal' : 'text-ink/85'}`}>{f.text}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted">{replay ? replayStamp(f.ts) : timeAgo(f.ts, now)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
