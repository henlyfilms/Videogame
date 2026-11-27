import { useEffect, useMemo, useRef, useState } from 'react';
import { planBotMatch } from '../arcade/botMatch';
import { launchMystery } from '../arcade/state';
import { ARCADE_EVENT_TYPES, CORE_EVENT_TYPES, makeEvent, nextId, parseMarionEvent, type EventPayloads, type MarionEventType } from '../adapters/events';
import { SCENARIOS } from '../adapters/scenarios';
import { CORE_BOTS, type RoomId } from '../data/bots';
import { actions } from '../game/actions';
import { hq } from '../game/hq';
import { manager } from '../game/runtime';
import { ROOMS } from '../engine/world';
import { mulberry32, SKILLS } from '../game/content';
import { SKILL_LABELS } from '../render/view';
import { SPEEDS, useGame } from '../store/gameStore';
import { THEME_ORDER, THEMES } from '../theme/tokens';
import { Icon } from './Icon';
import { closingAttr, usePresence } from './motion';

export interface PaletteCommand {
  id: string;
  title: string;
  group: string;
  hint?: string;
  run: () => void;
}

/** Subsequence fuzzy score (higher is better, -1 = no match). */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let ti = 0;
  let score = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    score += found === ti ? 3 : 1;
    ti = found + 1;
  }
  return score;
}

/** Sample payloads for the event injector (one per core event type). */
export function sampleEvent(type: MarionEventType): EventPayloads[MarionEventType] {
  const samples: { [K in MarionEventType]?: EventPayloads[K] } = {
    'bot.status': { botId: 'kanye', status: 'needs_input' },
    'bot.message': { botId: 'moose', text: 'Synced Agent ↔ Life', to: 'barry' },
    'bot.delegate': { from: 'daniel', to: 'greek', task: 'Render teaser cut', taskId: nextId('task') },
    'bot.tool_call': { botId: 'kanye', tool: 'relay.run', model: 'claude-opus-auto' },
    'group.huddle_start': { huddleId: nextId('huddle'), botIds: ['daniel', 'moose', 'kanye', 'barry'], topic: 'Injected huddle' },
    'group.huddle_end': { huddleId: useGame.getState().mech.command.huddles[0]?.id ?? 'none' },
    'task.created': { taskId: nextId('task'), botId: 'sift', title: 'Injected task' },
    'task.completed': { taskId: nextId('task'), botId: 'barry', title: 'Injected delivery', deliverTo: 'life' },
    'mail.pending_approval': { mailId: nextId('mail'), draftId: nextId('draft'), subject: 'Re: Injected thread', words: 160 },
    'reel.distilled': { reelId: nextId('reel'), insight: 'Ship the smallest useful slice', buff: 'speed' },
    'clip.sorted': { clipId: useGame.getState().mech.cutting.queue[0]?.id ?? 'none', bin: 'keeper', by: 'greek' },
    'skill.slotted': { skillId: 'token-optimizer', slotted: !useGame.getState().mech.foundry.skills.includes('token-optimizer') },
    'dictation.wave': { active: !useGame.getState().bridgeDictating, source: 'bridge', transcript: useGame.getState().bridgeDictating ? 'Injected transcript' : undefined },
  };
  return samples[type] as EventPayloads[MarionEventType];
}

const arcadeRng = mulberry32(0xa5cade);

/** Sample payloads for the arcade injector presets (a coherent bots-only match). */
export function sampleArcadeEvent(type: MarionEventType): EventPayloads[MarionEventType] {
  const plan = planBotMatch(arcadeRng);
  const live = useGame.getState().mech.arcade.live;
  if (type === 'arcade.player_joined') return plan.joins[0]!;
  if (type === 'arcade.match_started') return plan.started;
  // End the running match when there is one, so the leaderboard updates coherently.
  if (live) {
    const results = live.bots.length ? live.bots.map((botId, i) => ({ botId, won: i % 2 === 0, role: i === 1 ? 'murderer' : 'crewmate' })) : plan.ended.results;
    return { ...plan.ended, matchId: live.id, mode: live.mode, map: live.map, winningTeam: 'crew', results, mvp: results.find((r) => r.won)?.botId };
  }
  return plan.ended;
}

/** Play a whole bots-only match over ~20 s of wall time. */
export function runBotMatchDemo(): void {
  const plan = planBotMatch(arcadeRng);
  plan.joins.forEach((j, i) => setTimeout(() => hq.emit('arcade.player_joined', j), i * 600));
  setTimeout(() => hq.emit('arcade.match_started', plan.started), 4000);
  setTimeout(() => hq.emit('arcade.match_ended', plan.ended), 20000);
}

export function buildCommands(toast: (m: string) => void): PaletteCommand[] {
  const s = useGame.getState();
  const cmds: PaletteCommand[] = [];
  const add = (group: string, title: string, run: () => void, hint?: string) => cmds.push({ id: `${group}:${title}`, group, title, hint, run });

  add('Camera', 'Overview', () => hq.overview(), '0');
  for (const b of CORE_BOTS) add('Bots', `Go to ${b.name} — ${b.role}`, () => { s.selectRoom(null); s.selectBot(b.id); hq.focusBot(b.id); }, String(b.hotkey));
  for (const c of s.mech.foundry.customBots) add('Bots', `Go to ${c.name} — custom`, () => { s.selectRoom(null); s.selectBot(c.botId); hq.focusBot(c.botId); });
  for (const r of ROOMS) add('Rooms', `Open ${r.name}`, () => { s.selectBot(null); s.selectRoom(r.id as RoomId); hq.focusRoom(r.id as RoomId); });

  add('Play', 'Stamp oldest draft (Quill)', () => toast(actions.approve() ? 'Stamped & sent' : 'No drafts waiting'));
  add('Play', 'Distill next reel (Sift)', () => toast(actions.distill() ? 'Distilled' : 'No reels queued'));
  add('Play', 'Drop a reel in the intake', () => actions.dropReel());
  add('Play', 'Pull a raw clip (Greek)', () => actions.requestClip());
  add('Play', 'Ship release from the chute', () => toast(actions.shipRelease() ? 'Shipped' : 'Need a Render Green build'));
  add('Play', s.mech.command.huddles.length ? 'End huddle' : 'Summon huddle', () => actions.summonHuddle());
  add('Play', 'Pin screenshot for Kanye', () => actions.pinScreenshot(), '⇧⌘S');
  add('Play', 'Relay next command', () => toast(actions.dispatch() ? 'Relayed' : 'Queue empty'));
  add('Play', 'Clear noise slot', () => actions.clearNoise());
  add('Play', 'Request mail', () => actions.requestMail());
  add('Play', s.mech.life.dictating ? 'Stop Life dictation' : 'Start Life dictation', () => (s.mech.life.dictating ? actions.stopLifeDictation('Quick voice note') : actions.startLifeDictation()));
  add('Play', 'Restore from deleted archive', () => toast(actions.restore() ? 'Restored' : 'Archive empty'));
  for (const sk of SKILLS) add('Foundry', `${s.mech.foundry.skills.includes(sk) ? 'Remove' : 'Slot'} ${SKILL_LABELS[sk]}`, () => actions.toggleSkill(sk));

  for (const t of THEME_ORDER) add('View', `Theme: ${THEMES[t].label}`, () => s.setTheme(t));
  add('View', s.muted ? 'Unmute audio' : 'Mute audio', () => s.toggleMute());
  add('View', s.showFps ? 'Hide FPS' : 'Show FPS', () => s.toggleFps());
  add('View', s.feedOpen ? 'Collapse activity feed' : 'Expand activity feed', () => s.toggleFeed());
  add('View', s.paused ? 'Resume' : 'Pause', () => s.togglePause(), 'Space');
  for (const sp of SPEEDS) add('View', `Speed ${sp}×`, () => s.setSpeed(sp));
  add('View', 'Show controls', () => s.setHelp(true), '?');
  add('View', 'Time of day: follow the clock', () => (hq.clockOverride = null));
  for (const [label, h] of [['Morning', 7.2], ['Noon', 12], ['Dusk', 18.9], ['Night', 23]] as const)
    add('View', `Time of day: ${label}`, () => (hq.clockOverride = h));

  add('Source', 'Use live simulation', () => manager.use('live'));
  add('Source', 'Connect WebSocket stream', () => manager.use('ws'));
  for (const sc of SCENARIOS) add('Source', `Replay: ${sc.title}`, () => {
    s.setReplay({ scenario: sc.id });
    if (manager.replay) manager.replay.setScenario(sc.id);
    else manager.use('replay');
  });

  for (const type of CORE_EVENT_TYPES) add('Inject', `Inject ${type}`, () => hq.publish(makeEvent(type, sampleEvent(type))));

  add('Arcade', 'Play Marion Mystery', () => launchMystery({ kind: 'menu' }));
  add('Arcade', 'Quick Play Marion Mystery vs bots', () => launchMystery({ kind: 'quick' }));
  add('Arcade', 'Bots play a Marion Mystery match', () => {
    runBotMatchDemo();
    toast('🕹 The bots are heading to the Arcade');
  });
  for (const type of ARCADE_EVENT_TYPES) add('Arcade', `Inject ${type}`, () => hq.publish(makeEvent(type, sampleArcadeEvent(type))));
  return cmds;
}

export function CommandPalette({ toast }: { toast: (m: string) => void }) {
  const open = useGame((s) => s.paletteOpen);
  const setOpen = useGame((s) => s.setPalette);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = () => {
    setOpen(false);
    setQ('');
    setActive(0);
  };

  const shown = usePresence(open);
  const commands = useMemo(() => (shown.mounted ? buildCommands(toast) : []), [shown.mounted, toast]);

  const jsonMode = q.trim().startsWith('{') || q.trim().startsWith('[');
  const parsed = jsonMode ? parseMarionEvent(q.trim()) : null;

  const results = useMemo(() => {
    if (jsonMode) return [];
    if (!q.trim()) return commands.slice(0, 60);
    return commands
      .map((c) => ({ c, s: Math.max(fuzzyScore(q, c.title), fuzzyScore(q, `${c.group} ${c.title}`) - 1) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map((x) => x.c);
  }, [q, commands, jsonMode]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);
  useEffect(() => setActive(0), [q]);

  if (!shown.mounted) return null;

  const runAt = (i: number) => {
    const c = results[i];
    if (!c) return;
    close();
    c.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (jsonMode) {
        if (parsed) {
          hq.publish(parsed);
          toast(`Injected ${parsed.type}`);
          close();
        }
      } else runAt(active);
    }
  };

  let lastGroup = '';
  return (
    <div className="hq-anim-fade fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-3 pt-[min(12vh,96px)] backdrop-blur-[2px]" onPointerDown={close} role="presentation" {...closingAttr(shown.closing)}>
      <div className="hq-card hq-anim-dialog flex max-h-[calc(100dvh-min(12vh,96px)-12px)] w-full max-w-[560px] flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="Command palette" onPointerDown={(e) => e.stopPropagation()} {...closingAttr(shown.closing)}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Icon name="command" size={14} className="text-muted" />
          <input
            ref={inputRef}
            autoFocus
            className="h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            placeholder="Search commands, bots, rooms… or paste MarionEvent JSON"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            aria-label="Command search"
            aria-activedescendant={results[active] ? `cmd-${active}` : undefined}
            spellCheck={false}
          />
          <kbd className="rounded border border-line px-1 font-mono text-[10px] text-muted">esc</kbd>
        </div>
        {jsonMode ? (
          <div className="space-y-1 px-4 py-3 text-xs">
            {parsed ? (
              <p className="text-good">
                ✓ Valid <b>{parsed.type}</b> — press Enter to inject
              </p>
            ) : (
              <p className="text-warn">✗ Not a valid MarionEvent yet. Expected {'{"type": "bot.status", "payload": {...}}'}</p>
            )}
          </div>
        ) : (
          <ul className="hq-scroll max-h-[52vh] min-h-0 overflow-y-auto py-1" role="listbox">
            {results.length === 0 && <li className="px-4 py-3 text-xs text-muted">No matches.</li>}
            {results.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <li key={c.id}>
                  {header && <div className="hq-label px-4 pb-1 pt-2">{header}</div>}
                  <button
                    id={`cmd-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-xs ${i === active ? 'bg-accent/10 text-accent' : 'text-ink'}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => runAt(i)}
                  >
                    <span className="truncate">{c.title}</span>
                    {c.hint && <kbd className="ml-2 shrink-0 rounded border border-line px-1 font-mono text-[10px] text-muted">{c.hint}</kbd>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
