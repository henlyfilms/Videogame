import { useState } from 'react';
import { TASKS_BY_BOT } from '../game/content';
import { actions } from '../game/actions';
import { hq } from '../game/hq';
import { STATE_LABEL } from '../engine/fsm';
import { ROOM_BY_ID } from '../engine/world';
import { MODEL_LABELS } from '../render/view';
import type { RelayModel } from '../adapters/events';
import type { RoomId } from '../data/bots';
import { useGame } from '../store/gameStore';
import { BotPreview, Section } from './common';
import { useBots } from './hooks';
import { Icon } from './Icon';

const STATE_TONE: Record<string, string> = {
  working: 'text-good',
  delegating: 'text-teal',
  huddling: 'text-teal',
  needs_input: 'text-warn',
  asleep: 'text-muted',
  walking: 'text-accent',
  idle: 'text-muted',
};

export function BotInspector({ botId, onClose }: { botId: string; onClose: () => void }) {
  const bots = useBots(250);
  const feed = useGame((s) => s.feed);
  const [task, setTask] = useState('');
  const [following, setFollowing] = useState(true);
  const bot = bots.find((b) => b.id === botId);
  if (!bot) return null;
  const recent = feed.filter((f) => f.botId === botId).slice(0, 6);
  const suggestions = TASKS_BY_BOT[botId] ?? [];
  const room = bot.room ? ROOM_BY_ID[bot.room as RoomId] : null;

  return (
    <aside className="hq-card pointer-events-auto flex max-h-full w-full flex-col overflow-hidden sm:w-[340px]" aria-label={`${bot.name} inspector`} onPointerDown={(e) => e.stopPropagation()}>
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card border border-line">
          <BotPreview shape={bot.shape} color={bot.color} glow={bot.glow} size={52} starred={bot.starred} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-sm font-semibold">{bot.name}</h2>
            {bot.starred && <span className="text-[11px] text-[#fbbf24]">★</span>}
            {bot.hotkey && <span className="hq-chip px-1.5 py-0 font-mono">{bot.hotkey}</span>}
          </div>
          <div className="text-[11px] text-muted">{bot.role}</div>
          <div className={`mt-1 text-[11px] font-medium ${STATE_TONE[bot.state] ?? ''}`}>● {STATE_LABEL[bot.state]}</div>
        </div>
        <button className="hq-btn h-7 w-7 shrink-0 p-0" onClick={onClose} aria-label="Close inspector">
          <Icon name="close" size={12} />
        </button>
      </header>
      <div className="hq-scroll space-y-4 overflow-y-auto px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
          <dt className="text-muted">Location</dt>
          <dd className="truncate">{room?.short ?? 'Corridor'}</dd>
          <dt className="text-muted">Glow</dt>
          <dd className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: bot.color, boxShadow: `0 0 8px ${bot.glow}`, outline: '1px solid rgba(127,127,127,.35)' }} />
            {bot.colorName} · {bot.shape}
          </dd>
          <dt className="text-muted">Task</dt>
          <dd className="truncate">{bot.task ?? '—'}</dd>
          <dt className="text-muted">Relay</dt>
          <dd>{bot.tether ? MODEL_LABELS[bot.tether as RelayModel] : '—'}</dd>
          {bot.buffed && (
            <>
              <dt className="text-muted">Buff</dt>
              <dd className="text-teal">Insight card ⚡</dd>
            </>
          )}
          {bot.job && (
            <>
              <dt className="text-muted">Job card</dt>
              <dd className="col-span-1">{bot.job}</dd>
            </>
          )}
        </dl>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            className={`hq-btn ${following ? 'border-accent text-accent' : ''}`}
            onClick={() => {
              if (following) hq.camera.follow = null;
              else hq.focusBot(botId, true);
              setFollowing(!following);
            }}
            aria-pressed={following}
          >
            <Icon name="target" size={12} /> {following ? 'Following' : 'Follow'}
          </button>
          <button className="hq-btn" onClick={() => hq.emit('bot.status', { botId, status: bot.state === 'asleep' ? 'working' : 'asleep' })}>
            {bot.state === 'asleep' ? 'Wake' : 'Rest'}
          </button>
          <button className="hq-btn" onClick={() => hq.emit('bot.status', { botId, status: 'working' })}>
            To desk
          </button>
        </div>

        {botId !== 'daniel' && (
          <Section title="Delegate from Daniel">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                actions.delegate(botId, task.trim() || suggestions[0] || 'New task');
                setTask('');
              }}
            >
              <input className="hq-input" value={task} onChange={(e) => setTask(e.target.value)} placeholder={suggestions[0] ?? 'Task'} aria-label={`Task for ${bot.name}`} />
              <button className="hq-btn-primary shrink-0" type="submit">
                Send
              </button>
            </form>
          </Section>
        )}

        <Section title="Recent activity">
          {recent.length === 0 ? (
            <p className="text-[11px] text-muted">Nothing yet.</p>
          ) : (
            <ul className="space-y-1">
              {recent.map((f) => (
                <li key={f.id} className={`text-[11px] leading-snug ${f.cross ? 'text-teal' : 'text-ink/80'}`}>
                  {f.text}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  );
}
