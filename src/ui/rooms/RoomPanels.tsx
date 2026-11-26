import { useState } from 'react';
import type { MailSlot, RelayModel, SkillId } from '../../adapters/events';
import { BOT_SHAPES, CORE_BOTS, FOUNDRY_COLORS, RETIRED_BOTS, type BotShape, type RoomId } from '../../data/bots';
import { actions } from '../../game/actions';
import { SKILL_BLURBS, SKILLS, TASKS_BY_BOT, TRANSCRIPTS } from '../../game/content';
import { MAX_CUSTOM, NOISE_PILEUP, redPenWords, shippableBuilds, throughputFor } from '../../game/mechanics';
import { MODEL_LABELS, SKILL_COLORS, SKILL_LABELS } from '../../render/view';
import { botName, useGame } from '../../store/gameStore';
import { THEME_ORDER, THEMES } from '../../theme/tokens';
import { Bar, BotPreview, Empty, Kbd, Section, Stat, useNow } from '../common';
import { ArcadePanel } from './ArcadePanel';

const MODELS: RelayModel[] = ['claude-opus-auto', 'codex', 'gemini'];

export function RoomPanelBody({ room }: { room: RoomId }) {
  switch (room) {
    case 'command':
      return <CommandPanel />;
    case 'huddle':
      return <HuddlePanel />;
    case 'engine':
      return <EnginePanel />;
    case 'bridge':
      return <BridgePanel />;
    case 'life':
      return <LifePanel />;
    case 'media':
      return <MediaPanel />;
    case 'cutting':
      return <CuttingPanel />;
    case 'mail':
      return <MailPanel />;
    case 'foundry':
      return <FoundryPanel />;
    case 'arcade':
      return <ArcadePanel />;
  }
}

export const ROOM_BLURB: Record<RoomId, string> = {
  command: 'Hub-and-spoke delegation. Dispatch from Daniel, summon huddles, ship releases.',
  huddle: 'Group chats & orchestrations happen around this table.',
  engine: 'Dictation waves and Polaroids become relay runs on your Mac workstations.',
  bridge: 'Moose routes voice and screenshot drops between Kanye and Barry.',
  life: 'Planner, dictation, turntable, and the Vault. Check cards to grow your streak.',
  media: 'Drop raw reels in the intake and distill searchable insight cards.',
  cutting: 'Sort incoming footage into keepers vs. outtakes to drive the render bar.',
  mail: 'Sort mail, then stamp drafts to send. Nothing leaves without your stamp.',
  foundry: 'Spawn custom specialists and slot Universal Skill cartridges.',
  arcade: 'Neon cabinets, a leaderboard and Marion Mystery. Play with (or against) the bots.',
};

// ---------------------------------------------------------------------------

function CommandPanel() {
  const m = useGame((s) => s.mech);
  const [to, setTo] = useState('kanye');
  const [task, setTask] = useState('');
  const open = m.command.tasks.filter((t) => t.status === 'open').slice(-6).reverse();
  const ship = shippableBuilds(m);
  const suggestions = TASKS_BY_BOT[to] ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Version" value={`v${m.command.version}`} tone="accent" />
        <Stat label="Shipped" value={m.command.completed} />
        <Stat label="Brain" value={m.command.brain} tone="teal" />
      </div>
      <Section title="Delegate from Daniel">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            actions.delegate(to, task.trim() || suggestions[0] || 'New task');
            setTask('');
          }}
        >
          <div className="flex gap-2">
            <select className="hq-input w-32" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Delegate to">
              {CORE_BOTS.filter((b) => b.id !== 'daniel').map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <input className="hq-input" value={task} onChange={(e) => setTask(e.target.value)} placeholder={suggestions[0] ?? 'Task'} aria-label="Task" />
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestions.slice(0, 3).map((s) => (
              <button type="button" key={s} className="hq-chip hover:border-accent hover:text-accent" onClick={() => actions.delegate(to, s)}>
                {s}
              </button>
            ))}
          </div>
          <button className="hq-btn-primary w-full" type="submit">
            Dispatch →
          </button>
        </form>
      </Section>
      <Section title="Open tasks" right={<span className="text-[10px] text-muted">{open.length} open</span>}>
        {open.length === 0 ? (
          <Empty>Nothing in flight. Delegate something above.</Empty>
        ) : (
          <ul className="space-y-1">
            {open.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-card border border-line px-2 py-1.5 text-xs">
                <span className="truncate">
                  <b className="font-semibold">{botName(t.botId)}</b> · {t.title}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button className="hq-btn px-1.5 py-0.5" onClick={() => actions.completeTask(t.id, 'daniel')} title="Deliver to Command">
                    Done
                  </button>
                  <button className="hq-btn px-1.5 py-0.5" onClick={() => actions.completeTask(t.id, 'life')} title="Capsule to the Vault">
                    → Vault
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <div className="grid grid-cols-2 gap-2">
        <button className="hq-btn" onClick={() => actions.summonHuddle()}>
          {m.command.huddles.length ? 'End huddle' : 'Summon huddle'}
        </button>
        <button className="hq-btn" disabled={ship === 0} onClick={() => actions.shipRelease()} title="Needs a Render Green build from Greek">
          📦 Ship release {ship > 0 ? `(${ship})` : ''}
        </button>
      </div>
      {ship === 0 && <p className="text-[11px] text-muted">Release Chute unlocks when Greek's render bar goes green.</p>}
    </div>
  );
}

function HuddlePanel() {
  const huddles = useGame((s) => s.mech.command.huddles);
  const [topic, setTopic] = useState('');
  return (
    <div className="space-y-4">
      {huddles.length ? (
        huddles.map((h) => (
          <div key={h.id} className="rounded-card border border-teal/50 bg-teal/5 p-3 text-xs">
            <div className="font-semibold text-teal">{h.topic}</div>
            <div className="mt-1 text-muted">{h.botIds.map(botName).join(' · ')}</div>
          </div>
        ))
      ) : (
        <Empty>The huddle table is free.</Empty>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          actions.summonHuddle(topic.trim() || undefined);
          setTopic('');
        }}
      >
        <input className="hq-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Huddle topic" aria-label="Huddle topic" disabled={huddles.length > 0} />
        <button className="hq-btn-primary shrink-0" type="submit">
          {huddles.length ? 'End' : 'Summon'}
        </button>
      </form>
    </div>
  );
}

function EnginePanel() {
  const m = useGame((s) => s.mech.engine);
  const [text, setText] = useState('');
  const [model, setModel] = useState<RelayModel>('claude-opus-auto');
  const queue = m.commands.filter((c) => c.status !== 'done').slice(-8).reverse();
  return (
    <div className="space-y-4">
      <Section title="Relay model">
        <div className="grid grid-cols-3 gap-1">
          {MODELS.map((md) => (
            <button key={md} className={`hq-btn px-1.5 ${model === md ? 'border-accent text-accent' : ''}`} onClick={() => setModel(md)} aria-pressed={model === md}>
              {MODEL_LABELS[md]}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Queue" right={<span className="text-[10px] text-muted">{m.polaroids} polaroids</span>}>
        {queue.length === 0 ? (
          <Empty>No commands. Speak one or pin a screenshot.</Empty>
        ) : (
          <ul className="space-y-1">
            {queue.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-card border border-line px-2 py-1.5 text-xs">
                <span className="truncate">
                  {c.kind === 'polaroid' ? '📸' : '〰'} {c.text}
                </span>
                {c.status === 'queued' ? (
                  <button className="hq-btn-primary px-2 py-0.5" onClick={() => actions.dispatch(c.id, model)}>
                    Relay
                  </button>
                ) : (
                  <span className="hq-chip text-teal">{c.model ? MODEL_LABELS[c.model] : 'running'}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) actions.queueCommand(text);
          setText('');
        }}
      >
        <input className="hq-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a command for Kanye" aria-label="Command" />
        <button className="hq-btn shrink-0" type="submit">
          Queue
        </button>
      </form>
      <button className="hq-btn w-full" onClick={() => actions.pinScreenshot()}>
        📸 Pin screenshot <Kbd>⇧⌘S</Kbd>
      </button>
    </div>
  );
}

function BridgePanel() {
  const dictating = useGame((s) => s.bridgeDictating);
  const commands = useGame((s) => s.mech.engine.commands);
  const [text, setText] = useState('');
  const shots = commands.filter((c) => c.kind === 'polaroid').slice(-4).reverse();
  return (
    <div className="space-y-4">
      <Section title="Cross-chat dictation">
        <button
          className={`hq-btn w-full ${dictating ? 'border-teal text-teal' : ''}`}
          onClick={() => (dictating ? actions.stopBridgeDictation(text || TRANSCRIPTS[0]!, 'engine') : actions.startBridgeDictation())}
          aria-pressed={dictating}
        >
          {dictating ? '■ Stop wave (route to Kanye)' : '🎙 Start dictation wave'}
        </button>
        <input className="hq-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="What you said…" aria-label="Transcript" />
        <div className="grid grid-cols-2 gap-2">
          <button
            className="hq-btn"
            onClick={() => {
              actions.stopBridgeDictation(text || TRANSCRIPTS[1]!, 'engine');
              setText('');
            }}
          >
            → Kanye's queue
          </button>
          <button
            className="hq-btn"
            onClick={() => {
              actions.stopBridgeDictation(text || TRANSCRIPTS[0]!, 'life');
              setText('');
            }}
          >
            → Barry's Planner
          </button>
        </div>
      </Section>
      <Section title="Recent screenshots">
        {shots.length === 0 ? (
          <Empty>Pin one with ⇧⌘S.</Empty>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {shots.map((c, i) => (
              <button
                key={c.id}
                className="aspect-square rounded-card border border-line bg-gradient-to-br from-accent/20 to-teal/20 text-[10px] text-muted hover:border-accent"
                title={c.status === 'queued' ? 'Relay to Kanye' : c.status}
                onClick={() => actions.dispatch(c.id)}
              >
                #{shots.length - i}
              </button>
            ))}
          </div>
        )}
      </Section>
      <button className="hq-btn w-full" onClick={() => actions.pinScreenshot()}>
        📸 Drop screenshot
      </button>
    </div>
  );
}

function LifePanel() {
  const life = useGame((s) => s.mech.life);
  const progress = useGame((s) => s.mech.progress);
  const turntable = useGame((s) => s.turntable);
  const [title, setTitle] = useState('');
  const [lane, setLane] = useState<'work' | 'ai'>('work');
  const [transcript, setTranscript] = useState('');
  const deleted = life.vault.filter((v) => v.deleted);
  const stored = life.vault.filter((v) => !v.deleted).slice(-5).reverse();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Streak" value={`${progress.streak}🔥`} tone="warn" />
        <Stat label="Checked" value={progress.checkedTotal} tone="good" />
        <Stat label="Polish" value={`${'★'.repeat(progress.polish)}${'☆'.repeat(3 - progress.polish)}`} tone="accent" />
      </div>
      <Section title="Planner">
        <div className="grid grid-cols-2 gap-2">
          {(['work', 'ai'] as const).map((ln) => (
            <div key={ln} className="space-y-1">
              <div className="text-[10px] font-semibold text-accent">{ln === 'work' ? 'Work' : 'AI'}</div>
              {life.cards
                .filter((c) => c.lane === ln)
                .map((c) => (
                  <label key={c.id} className={`flex cursor-pointer items-start gap-1.5 rounded-card border px-2 py-1 text-[11px] ${c.done ? 'border-good/40 text-muted line-through' : 'border-line'}`}>
                    <input type="checkbox" className="mt-0.5 accent-[rgb(var(--hq-accent))]" checked={c.done} onChange={() => actions.toggleCard(c.id)} />
                    <span className="break-words">{c.title}</span>
                  </label>
                ))}
            </div>
          ))}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            actions.addCard(lane, title);
            setTitle('');
          }}
        >
          <select className="hq-input w-16" value={lane} onChange={(e) => setLane(e.target.value as 'work' | 'ai')} aria-label="Lane">
            <option value="work">Work</option>
            <option value="ai">AI</option>
          </select>
          <input className="hq-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a card" aria-label="New card" />
        </form>
      </Section>
      <Section title="Dictation mic & turntable">
        <div className="grid grid-cols-2 gap-2">
          <button
            className={`hq-btn ${life.dictating ? 'border-teal text-teal' : ''}`}
            onClick={() => {
              if (life.dictating) {
                actions.stopLifeDictation(transcript || TRANSCRIPTS[Math.floor(Math.random() * TRANSCRIPTS.length)]!);
                setTranscript('');
              } else actions.startLifeDictation();
            }}
            aria-pressed={life.dictating}
          >
            {life.dictating ? '■ Stop & make card' : '🎙 Step up to mic'}
          </button>
          <button className={`hq-btn ${turntable ? 'border-accent text-accent' : ''}`} onClick={() => actions.toggleTurntable()} aria-pressed={turntable}>
            {turntable ? (life.dictating ? '⏸ Ducked' : '♪ Turntable on') : '♪ Turntable off'}
          </button>
        </div>
        {life.dictating && <input className="hq-input" autoFocus value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Say it… (becomes a tidy task card)" aria-label="Dictation" />}
      </Section>
      <Section title="Vault & deleted archive">
        {stored.length > 0 && (
          <ul className="space-y-1">
            {stored.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-card border border-line px-2 py-1 text-[11px]">
                <span className="truncate">💊 {v.label}</span>
                {v.restored && <span className="hq-chip border-teal/60 text-teal">Restored</span>}
              </li>
            ))}
          </ul>
        )}
        {deleted.length === 0 ? (
          <Empty>Deleted archive is empty.</Empty>
        ) : (
          <ul className="space-y-1">
            {deleted.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-card border border-dashed border-line px-2 py-1 text-[11px] text-muted">
                <span className="truncate">🗑 {v.label}</span>
                <button className="hq-btn px-1.5 py-0.5" onClick={() => actions.restore(v.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function MediaPanel() {
  const media = useGame((s) => s.mech.media);
  const theme = useGame((s) => s.theme);
  const setTheme = useGame((s) => s.setTheme);
  const [title, setTitle] = useState('');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button className="hq-btn" onClick={() => actions.toggleLlm()} aria-label="Toggle LLM">
          LLM: <b className={media.llm === 'local' ? 'text-good' : 'text-accent'}>{media.llm === 'local' ? 'Local' : 'Cloud'}</b>
        </button>
        <div className="flex overflow-hidden rounded-card border border-line" role="radiogroup" aria-label="Wall dimmer">
          {THEME_ORDER.map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} className={`flex-1 py-1 text-[11px] ${theme === t ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`} onClick={() => setTheme(t)}>
              {THEMES[t].label}
            </button>
          ))}
        </div>
      </div>
      <Section title="Intake chute" right={<span className="text-[10px] text-muted">{media.queue.length} raw</span>}>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            actions.dropReel(title);
            setTitle('');
          }}
        >
          <input className="hq-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reel / YouTube title" aria-label="Reel title" />
          <button className="hq-btn shrink-0" type="submit">
            Drop
          </button>
        </form>
        {media.queue.length === 0 ? (
          <Empty>Drop raw reels to distill.</Empty>
        ) : (
          <ul className="space-y-1">
            {media.queue.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-card border border-line px-2 py-1.5 text-xs">
                <span className="truncate">
                  {r.platform === 'youtube' ? '▶︎' : '◼︎'} {r.title}
                </span>
                <button className="hq-btn-primary px-2 py-0.5" onClick={() => actions.distill(r.id)}>
                  Distill
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Insight cards (FTS5 index)" right={<span className="text-[10px] text-muted">{media.distilled} distilled</span>}>
        {media.insights.length === 0 ? (
          <Empty>Distilled insights land here and buff teammates.</Empty>
        ) : (
          <ul className="space-y-1">
            {media.insights
              .slice(-4)
              .reverse()
              .map((i) => (
                <li key={i.id} className="rounded-card border border-teal/40 bg-teal/5 px-2 py-1.5 text-[11px]">
                  <span className="mr-1 text-teal">{i.buff === 'speed' ? '⚡' : '◎'}</span>
                  {i.text}
                </li>
              ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function CuttingPanel() {
  const c = useGame((s) => s.mech.cutting);
  const accuracy = c.correct + c.wrong ? Math.round((c.correct / (c.correct + c.wrong)) * 100) : 100;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className={c.green ? 'font-semibold text-good' : 'text-muted'}>{c.green ? '● Tests Passed / Render Green' : `Render ${Math.round(c.render * 100)}%`}</span>
          <span className="text-muted">{c.greenBuilds} verified</span>
        </div>
        <Bar value={c.render} tone={c.green ? 'good' : 'accent'} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Keepers" value={c.keepers} tone="good" />
        <Stat label="Outtakes" value={c.outtakes} />
        <Stat label="Accuracy" value={`${accuracy}%`} tone="accent" />
      </div>
      <Section title="Magnetic timeline" right={<button className="hq-btn px-2 py-0.5" onClick={() => actions.requestClip()}>+ Clip</button>}>
        {c.queue.length === 0 ? (
          <Empty>No raw footage. Pull a clip.</Empty>
        ) : (
          <ul className="space-y-1">
            {c.queue.slice(0, 6).map((clip) => (
              <li key={clip.id} className="flex items-center justify-between gap-2 rounded-card border border-line px-2 py-1.5 text-xs">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[11px]">{clip.name}</span>
                  <span className={`text-[10px] ${clip.quality === 'good' ? 'text-good' : 'text-warn'}`}>{clip.quality === 'good' ? 'in focus · steady' : 'soft focus · shaky'}</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <button className="hq-btn px-1.5 py-0.5 text-good" onClick={() => actions.sortClip(clip.id, 'keeper')} aria-label={`Keep ${clip.name}`}>
                    Keep
                  </button>
                  <button className="hq-btn px-1.5 py-0.5" onClick={() => actions.sortClip(clip.id, 'outtake')} aria-label={`Outtake ${clip.name}`}>
                    Out
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

const SLOT_META: Record<MailSlot, { label: string; cls: string }> = {
  action: { label: 'Needs Action', cls: 'text-[#ef4444]' },
  fyi: { label: 'FYI', cls: 'text-accent' },
  noise: { label: 'Noise', cls: 'text-muted' },
};

function MailPanel() {
  const mail = useGame((s) => s.mech.mail);
  const now = useNow(500);
  return (
    <div className="space-y-4">
      <Section title="Pending approval" right={<span className="text-[10px] text-muted">{mail.sent} sent</span>}>
        {mail.drafts.length === 0 ? (
          <Empty>No drafts waiting. Quill drafts replies for Needs Action mail.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {mail.drafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-card border border-[#d4a017]/50 bg-[#d4a017]/5 px-2 py-1.5 text-xs">
                <span className="min-w-0">
                  <span className="block truncate">{d.subject}</span>
                  <span className="text-[10px] text-[#ef4444]">
                    red pen: {d.words}w → {redPenWords(d, now)}w
                  </span>
                </span>
                <button className="hq-btn shrink-0 border-[#d4a017] bg-[#d4a017] text-white hover:bg-[#b8860b] hover:text-white" onClick={() => actions.approve(d.id)}>
                  🔏 Stamp
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Incoming tube" right={<button className="hq-btn px-2 py-0.5" onClick={() => actions.requestMail()}>+ Mail</button>}>
        {mail.inbox.length === 0 ? (
          <Empty>Inbox clear.</Empty>
        ) : (
          <ul className="space-y-1">
            {mail.inbox.slice(0, 6).map((m) => (
              <li key={m.id} className="rounded-card border border-line px-2 py-1.5 text-xs">
                <div className="truncate">
                  <b className="font-semibold">{m.from}</b> · {m.subject}
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {(['action', 'fyi', 'noise'] as MailSlot[]).map((slot) => (
                    <button key={slot} className="hq-btn px-1 py-0.5 text-[10px]" onClick={() => actions.sortMail(m.id, slot)}>
                      {SLOT_META[slot].label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Sorting wall">
        <div className="grid grid-cols-3 gap-2">
          {(['action', 'fyi', 'noise'] as MailSlot[]).map((slot) => (
            <div key={slot} className={`rounded-card border px-2 py-1.5 ${slot === 'noise' && mail.sorted.noise.length >= NOISE_PILEUP ? 'border-[#ef4444] bg-[#ef4444]/5' : 'border-line'}`}>
              <div className={`text-[10px] font-semibold ${SLOT_META[slot].cls}`}>{SLOT_META[slot].label}</div>
              <div className="text-sm font-semibold tabular-nums">{mail.sorted[slot].length}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="hq-btn" disabled={!mail.sorted.action.length} onClick={() => actions.requestDraft()}>
            ✎ Ask Quill to draft
          </button>
          <button className="hq-btn" disabled={!mail.sorted.noise.length} onClick={() => actions.clearNoise()}>
            🧹 Clear noise
          </button>
        </div>
        {mail.sorted.noise.length >= NOISE_PILEUP && <p className="text-[11px] text-[#ef4444]">Noise is piling up. Clear it before the inbox jams.</p>}
      </Section>
    </div>
  );
}

function FoundryPanel() {
  const foundry = useGame((s) => s.mech.foundry);
  const polish = useGame((s) => s.mech.progress.polish);
  const [name, setName] = useState('');
  const [job, setJob] = useState('');
  const [shape, setShape] = useState<BotShape>('blueberry');
  const [color, setColor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const c = FOUNDRY_COLORS[color]!;
  return (
    <div className="space-y-4">
      <Section title="Spec-to-spawn" right={<span className="text-[10px] text-muted">{foundry.customBots.length}/{MAX_CUSTOM}</span>}>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const err = actions.spawnBot({ name, job, shape, colorIndex: color });
            setError(err);
            if (!err) {
              setName('');
              setJob('');
            }
          }}
        >
          <div className="flex gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-card border border-line">
              <BotPreview shape={shape} color={c.color} glow={c.glow} size={56} />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <input className="hq-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="1-word name" aria-label="Bot name" maxLength={12} />
              <input className="hq-input" value={job} onChange={(e) => setJob(e.target.value)} placeholder="1-line job card" aria-label="Job card" maxLength={80} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Shape">
            {BOT_SHAPES.map((s) => (
              <button type="button" key={s} role="radio" aria-checked={shape === s} className={`hq-chip ${shape === s ? 'border-accent text-accent' : ''}`} onClick={() => setShape(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Aura color">
            {FOUNDRY_COLORS.map((fc, i) => (
              <button
                type="button"
                key={fc.name}
                role="radio"
                aria-checked={color === i}
                aria-label={fc.name}
                className={`h-6 w-6 rounded-full border-2 ${color === i ? 'border-ink' : 'border-transparent'}`}
                style={{ background: fc.color, boxShadow: `0 0 10px ${fc.glow}` }}
                onClick={() => setColor(i)}
              />
            ))}
          </div>
          {error && <p className="text-[11px] text-warn">{error}</p>}
          <button className="hq-btn-primary w-full" type="submit" disabled={foundry.customBots.length >= MAX_CUSTOM}>
            Drop into pod & spawn
          </button>
        </form>
        {foundry.customBots.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {foundry.customBots.map((b) => (
              <li key={b.botId} className="hq-chip" title={b.job}>
                <span className="h-2 w-2 rounded-full" style={{ background: b.color, boxShadow: `0 0 6px ${b.glowColor}` }} />
                {b.name}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Universal skill wall" right={<span className="text-[10px] text-muted">×{throughputFor(foundry.skills, polish).toFixed(2)} throughput</span>}>
        <div className="grid grid-cols-2 gap-1.5">
          {SKILLS.map((s: SkillId) => {
            const on = foundry.skills.includes(s);
            return (
              <button
                key={s}
                className={`rounded-card border px-2 py-1.5 text-left text-[11px] transition-colors ${on ? 'text-ink' : 'border-line text-muted hover:text-ink'}`}
                style={on ? { borderColor: SKILL_COLORS[s], boxShadow: `0 0 12px ${SKILL_COLORS[s]}55` } : undefined}
                onClick={() => actions.toggleSkill(s)}
                aria-pressed={on}
              >
                <div className="font-semibold" style={on ? { color: SKILL_COLORS[s] } : undefined}>
                  {SKILL_LABELS[s]}
                </div>
                <div className="text-[10px] text-muted">{SKILL_BLURBS[s]}</div>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="30-day vault">
        <ul className="space-y-1">
          {RETIRED_BOTS.map((b) => (
            <li key={b.name} className="flex items-center justify-between rounded-card border border-dashed border-line px-2 py-1 text-[11px] text-muted">
              <span>
                {b.name} · {b.role}
              </span>
              <span>{b.daysLeft}d left</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
