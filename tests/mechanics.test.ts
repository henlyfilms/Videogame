import { beforeEach, describe, expect, it } from 'vitest';
import { makeEvent, type MarionEvent } from '../src/adapters/events';
import { CORE_BOTS } from '../src/data/bots';
import { createActions } from '../src/game/actions';
import { HQ } from '../src/game/hq';
import {
  bumpVersion,
  dayKey,
  initialMechanics,
  MAX_CUSTOM,
  MAX_INBOX,
  reduceMechanics,
  redPenWords,
  shippableBuilds,
  throughputFor,
  tidy,
  type MechanicsState,
} from '../src/game/mechanics';
import { buildView, populateSim, wire } from '../src/game/wire';
import { useGame } from '../src/store/gameStore';
import { Simulation } from '../src/engine/sim';

const run = (s: MechanicsState, evs: MarionEvent[]) => evs.reduce(reduceMechanics, s);

describe('Quill mailroom: Stamp-to-Send', () => {
  it('sorts mail into slots and tracks mis-sorts', () => {
    const s = run(initialMechanics(), [
      makeEvent('mail.received', { mailId: 'm1', from: 'A', subject: 'x', hint: 'action' }),
      makeEvent('mail.received', { mailId: 'm2', from: 'B', subject: 'y', hint: 'noise' }),
      makeEvent('mail.sorted', { mailId: 'm1', slot: 'action' }),
      makeEvent('mail.sorted', { mailId: 'm2', slot: 'fyi' }),
    ]);
    expect(s.mail.inbox).toHaveLength(0);
    expect(s.mail.sorted.action.map((m) => m.id)).toEqual(['m1']);
    expect(s.mail.sorted.fyi.map((m) => m.id)).toEqual(['m2']);
    expect(s.mail.misSorted).toBe(1);
  });
  it('only the stamp sends a pending draft (human-in-the-loop)', () => {
    let s = run(initialMechanics(), [
      makeEvent('mail.received', { mailId: 'm1', from: 'A', subject: 'x', hint: 'action' }),
      makeEvent('mail.sorted', { mailId: 'm1', slot: 'action' }),
      makeEvent('mail.pending_approval', { mailId: 'm1', draftId: 'd1', subject: 'Re: x', words: 150 }),
    ]);
    expect(s.mail.drafts).toHaveLength(1);
    expect(s.mail.sorted.action).toHaveLength(0);
    expect(s.mail.sent).toBe(0);
    s = reduceMechanics(s, makeEvent('mail.sent', { draftId: 'd1' }));
    expect(s.mail.drafts).toHaveLength(0);
    expect(s.mail.sent).toBe(1);
    // Sending an unknown draft is a no-op.
    expect(reduceMechanics(s, makeEvent('mail.sent', { draftId: 'nope' }))).toBe(s);
  });
  it('clearing noise prevents pileups; overflow spills into noise', () => {
    let s = initialMechanics();
    for (let i = 0; i < MAX_INBOX + 3; i++) s = reduceMechanics(s, makeEvent('mail.received', { mailId: `m${i}`, from: 'x', subject: 'y', hint: 'noise' }));
    expect(s.mail.inbox).toHaveLength(MAX_INBOX);
    expect(s.mail.sorted.noise).toHaveLength(3);
    s = reduceMechanics(s, makeEvent('mail.cleared', {}));
    expect(s.mail.sorted.noise).toHaveLength(0);
    expect(s.mail.cleared).toBe(3);
  });
  it('red pen visibly shrinks drafts toward ~45%', () => {
    expect(redPenWords({ words: 200, at: 0 }, 0)).toBe(200);
    expect(redPenWords({ words: 200, at: 0 }, 8000)).toBe(90);
    expect(redPenWords({ words: 200, at: 0 }, 4000)).toBeGreaterThan(90);
  });
});

describe('Sift media vault: Drop & Distill', () => {
  it('distills queued reels into insight cards and feeds the brain', () => {
    const s = run(initialMechanics(), [
      makeEvent('reel.received', { reelId: 'r1', title: 'T', platform: 'reel' }),
      makeEvent('reel.distilled', { reelId: 'r1', insight: 'Cut on motion', buff: 'speed' }),
      makeEvent('settings.llm', { mode: 'cloud' }),
    ]);
    expect(s.media.queue).toHaveLength(0);
    expect(s.media.insights[0]?.text).toBe('Cut on motion');
    expect(s.media.distilled).toBe(1);
    expect(s.media.llm).toBe('cloud');
    expect(s.command.brain).toBe(1);
  });
});

describe('Greek cutting room: Clip Sorter & Render Queue', () => {
  const clip = (id: string, quality: 'good' | 'bad') => makeEvent('clip.received', { clipId: id, name: id, quality });
  it('correct sorts drive the render bar to green; wrong sorts barely move it', () => {
    let s = run(initialMechanics(), [clip('a', 'good'), clip('b', 'bad'), clip('c', 'good'), clip('d', 'good'), clip('e', 'good')]);
    s = reduceMechanics(s, makeEvent('clip.sorted', { clipId: 'a', bin: 'outtake', by: 'you' }));
    expect(s.cutting.render).toBeCloseTo(0.05);
    expect(s.cutting.wrong).toBe(1);
    s = run(s, [
      makeEvent('clip.sorted', { clipId: 'b', bin: 'outtake', by: 'you' }),
      makeEvent('clip.sorted', { clipId: 'c', bin: 'keeper', by: 'you' }),
      makeEvent('clip.sorted', { clipId: 'd', bin: 'keeper', by: 'you' }),
      makeEvent('clip.sorted', { clipId: 'e', bin: 'keeper', by: 'you' }),
    ]);
    expect(s.cutting.green).toBe(true);
    expect(s.cutting.greenBuilds).toBe(1);
    expect(s.cutting.keepers).toBe(3);
    expect(shippableBuilds(s)).toBe(1);
    s = reduceMechanics(s, makeEvent('release.shipped', { version: '1.0.1' }));
    expect(shippableBuilds(s)).toBe(0);
    expect(s.cutting.green).toBe(false);
    expect(s.command.version).toBe('1.0.1');
  });
});

describe('Barry life hub: Planner, Dictation, Vault', () => {
  it('seeds the real projects across Work and AI lanes', () => {
    const titles = initialMechanics().life.cards.map((c) => c.title);
    for (const t of ['Life Dashboard', 'Marion Agent [Human/Bots]', 'EDITING ENGINE', 'Sift', 'Hub', 'Apps', 'AI Club', 'Design', 'email sender reviewer']) expect(titles).toContain(t);
  });
  it('checking cards advances the daily streak and polish', () => {
    const day1 = new Date(2026, 10, 24, 10).getTime();
    const day2 = new Date(2026, 10, 25, 10).getTime();
    const day4 = new Date(2026, 10, 27, 10).getTime();
    let s = initialMechanics();
    s = reduceMechanics(s, { ...makeEvent('planner.toggled', { cardId: 'seed_0', done: true }), ts: day1 });
    s = reduceMechanics(s, { ...makeEvent('planner.toggled', { cardId: 'seed_1', done: true }), ts: day1 });
    expect(s.progress.streak).toBe(1);
    s = reduceMechanics(s, { ...makeEvent('planner.toggled', { cardId: 'seed_2', done: true }), ts: day2 });
    expect(s.progress.streak).toBe(2);
    expect(s.progress.polish).toBe(1);
    s = reduceMechanics(s, { ...makeEvent('planner.toggled', { cardId: 'seed_3', done: true }), ts: day4 });
    expect(s.progress.streak).toBe(1);
    expect(s.progress.lastCheckDay).toBe(dayKey(day4));
  });
  it('voice bubbles become tidy task cards', () => {
    const s = run(initialMechanics(), [
      makeEvent('dictation.wave', { active: true, source: 'life' }),
      makeEvent('dictation.wave', { active: false, source: 'life', transcript: 'um can you add dark mode to hub.' }),
    ]);
    expect(s.life.dictating).toBe(false);
    expect(s.life.cards.at(-1)?.title).toBe('Add dark mode to hub');
  });
  it('restores deleted archive items with a Restored badge', () => {
    let s = initialMechanics();
    const id = s.life.vault[0]!.id;
    s = reduceMechanics(s, makeEvent('vault.restored', { itemId: id }));
    expect(s.life.vault[0]).toMatchObject({ deleted: false, restored: true });
  });
  it('completed runs shoot capsules into the vault', () => {
    const s = run(initialMechanics(), [
      makeEvent('task.created', { taskId: 't', botId: 'kanye', title: 'Build' }),
      makeEvent('task.completed', { taskId: 't', botId: 'kanye', title: 'Build', deliverTo: 'life' }),
    ]);
    expect(s.life.vault.some((v) => v.id === 'cap_t')).toBe(true);
    expect(s.command.tasks[0]?.status).toBe('done');
  });
});

describe('Kanye & Moose: Dictation Wave & Relay Dispatch', () => {
  it('queues, dispatches and completes relay commands', () => {
    const s = run(initialMechanics(), [
      makeEvent('relay.queued', { commandId: 'c1', kind: 'polaroid', text: 'shot' }),
      makeEvent('relay.dispatched', { commandId: 'c1', model: 'gemini', botId: 'kanye' }),
    ]);
    expect(s.engine.polaroids).toBe(1);
    expect(s.engine.commands[0]).toMatchObject({ status: 'dispatched', model: 'gemini' });
    const done = reduceMechanics(s, makeEvent('task.completed', { taskId: 'c1', botId: 'kanye', title: 'shot' }));
    expect(done.engine.commands[0]?.status).toBe('done');
  });
});

describe('Bot Builder foundry: Spec-to-Spawn & Skill Slotting', () => {
  it('caps custom bots at 4 and toggles skills', () => {
    let s = initialMechanics();
    for (let i = 0; i < 6; i++) s = reduceMechanics(s, makeEvent('bot.spawned', { botId: `b${i}`, name: 'X', job: 'y', shape: 'gem', color: '#000', glowColor: '#fff' }));
    expect(s.foundry.customBots).toHaveLength(MAX_CUSTOM);
    s = reduceMechanics(s, makeEvent('skill.slotted', { skillId: 'prompt-craft', slotted: true }));
    s = reduceMechanics(s, makeEvent('skill.slotted', { skillId: 'prompt-craft', slotted: true }));
    expect(s.foundry.skills).toEqual(['prompt-craft']);
    expect(throughputFor(s.foundry.skills)).toBeCloseTo(1.12);
    s = reduceMechanics(s, makeEvent('skill.slotted', { skillId: 'prompt-craft', slotted: false }));
    expect(s.foundry.skills).toEqual([]);
  });
});

describe('helpers', () => {
  it('tidy cleans transcripts and bumpVersion increments patch', () => {
    expect(tidy('  so could you ship it?  ')).toBe('Ship it');
    expect(tidy('')).toBe('New task');
    expect(bumpVersion('1.2.9')).toBe('1.2.10');
  });
  it('reducer is pure (does not mutate input)', () => {
    const s = initialMechanics();
    const frozen = JSON.stringify(s);
    reduceMechanics(s, makeEvent('mail.received', { mailId: 'm', from: 'a', subject: 'b', hint: 'fyi' }));
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe('player actions → bus → store + sim (integration)', () => {
  let hq: HQ;
  let a: ReturnType<typeof createActions>;
  let unwire: () => void;
  beforeEach(() => {
    unwire?.();
    useGame.getState().resetMechanics(false);
    hq = new HQ(new Simulation({ random: () => 0.3 }));
    populateSim(hq);
    unwire = wire(hq);
    a = createActions(hq);
  });

  it('mail flow: receive → sort → draft → stamp', () => {
    a.requestMail();
    const m = useGame.getState().mech.mail.inbox[0]!;
    expect(a.sortMail(m.id, 'action')).toBe(true);
    expect(a.approve()).toBe(false);
    expect(a.requestDraft()).toBe(true);
    expect(hq.sim.getBot('quill')!.state).toBe('needs_input');
    expect(a.approve()).toBe(true);
    expect(useGame.getState().mech.mail.sent).toBe(1);
    expect(useGame.getState().feed.length).toBeGreaterThan(0);
  });

  it('clip sorting unlocks a release from the chute', () => {
    expect(a.shipRelease()).toBe(false);
    for (let i = 0; i < 4; i++) {
      hq.emit('clip.received', { clipId: `c${i}`, name: `c${i}`, quality: 'good' });
      a.sortClip(`c${i}`, 'keeper');
    }
    expect(useGame.getState().mech.cutting.green).toBe(true);
    expect(a.shipRelease()).toBe(true);
    expect(useGame.getState().mech.command.version).toBe('1.0.1');
  });

  it('foundry spawns a glowing custom bot into the sim and applies throughput', () => {
    expect(a.spawnBot({ name: 'Pixel Pusher', job: 'Writes release notes', shape: 'star', colorIndex: 2 })).toBeNull();
    const spec = useGame.getState().mech.foundry.customBots[0]!;
    expect(spec.name).toBe('Pixel');
    const bot = hq.sim.getBot(spec.botId)!;
    expect(bot.def.glow).toBe(true);
    expect(bot.def.custom).toBe(true);
    a.toggleSkill('token-optimizer');
    a.toggleSkill('prompt-craft');
    expect(hq.sim.throughput).toBeCloseTo(1.24);
    expect(a.spawnBot({ name: 'x', job: '', shape: 'gem', colorIndex: 0 })).toMatch(/job card/);
  });

  it('delegation and huddles flow to sim and store', () => {
    const id = a.delegate('greek', 'Render teaser');
    expect(useGame.getState().mech.command.tasks.find((t) => t.id === id)?.status).toBe('open');
    a.summonHuddle('Ship');
    expect(useGame.getState().mech.command.huddles).toHaveLength(1);
    a.summonHuddle();
    expect(useGame.getState().mech.command.huddles).toHaveLength(0);
    expect(a.completeTask(id)).toBe(true);
  });

  it('relay dispatch tethers Kanye; bridge dictation routes to Barry', () => {
    const cmd = a.queueCommand('make relay faster');
    expect(a.dispatch(cmd, 'codex')).toBe(true);
    expect(useGame.getState().mech.engine.commands[0]?.status).toBe('dispatched');
    a.startBridgeDictation();
    expect(useGame.getState().bridgeDictating).toBe(true);
    a.stopBridgeDictation('add streak badge', 'life');
    expect(useGame.getState().bridgeDictating).toBe(false);
    expect(useGame.getState().mech.life.cards.at(-1)?.title).toBe('Add streak badge');
  });

  it('hotspots trigger room mechanics', () => {
    expect(a.hotspot('mail', 'stamp')).toMatch(/No drafts/);
    expect(a.hotspot('media', 'intake')).toMatch(/Dropped/);
    expect(a.hotspot('media', 'intake')).toMatch(/Distilled/);
    const theme = useGame.getState().theme;
    a.hotspot('media', 'dimmer');
    expect(useGame.getState().theme).not.toBe(theme);
    a.hotspot('life', 'mic');
    expect(useGame.getState().mech.life.dictating).toBe(true);
  });

  it('buildView maps store state for the renderer', () => {
    a.requestMail();
    const v = buildView(useGame.getState());
    expect(v.mail.incoming).toBe(1);
    expect(v.life.cards.length).toBeGreaterThan(0);
    expect(CORE_BOTS.every((b) => hq.sim.getBot(b.id))).toBe(true);
  });
});
