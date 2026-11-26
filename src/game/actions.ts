/**
 * Player actions. Each action only publishes MarionEvents; the mechanics
 * reducer and the simulation react to them like any other event source.
 */
import { launchMystery } from '../arcade/state';
import { nextId, type ClipBin, type MailSlot, type PlannerLane, type RelayModel, type SkillId } from '../adapters/events';
import { BOT_SHAPES, CORE_BOTS, FOUNDRY_COLORS, type BotShape, type RoomId } from '../data/bots';
import type { HotspotAction } from '../engine/world';
import { useGame } from '../store/gameStore';
import { HUDDLE_TOPICS, insightFor, MAIL_POOL, mulberry32, pick, REEL_POOL, CLIP_NAMES, clipQuality } from './content';
import { hq as defaultHq, type HQ } from './hq';
import { bumpVersion, MAX_CUSTOM, shippableBuilds, tidy } from './mechanics';

const rng = mulberry32(Date.now() & 0xffff);

export function createActions(hq: HQ, get = useGame.getState) {
  const mech = () => get().mech;

  const a = {
    // ---------------------------------------------------------------- command
    delegate(to: string, title: string): string {
      const taskId = nextId('task');
      hq.emit('bot.delegate', { from: 'daniel', to, task: title, taskId });
      hq.emit('task.created', { taskId, botId: to, title });
      return taskId;
    },
    completeTask(taskId: string, deliverTo: 'daniel' | 'life' = 'daniel'): boolean {
      const t = mech().command.tasks.find((x) => x.id === taskId && x.status === 'open');
      if (!t) return false;
      hq.emit('task.completed', { taskId, botId: t.botId, title: t.title, deliverTo });
      return true;
    },
    summonHuddle(topic = pick(rng, HUDDLE_TOPICS), botIds?: string[]): string | null {
      if (mech().command.huddles.length) {
        a.endHuddles();
        return null;
      }
      const huddleId = nextId('huddle');
      hq.emit('group.huddle_start', { huddleId, botIds: botIds ?? CORE_BOTS.map((b) => b.id), topic });
      return huddleId;
    },
    endHuddles(): void {
      for (const h of mech().command.huddles) hq.emit('group.huddle_end', { huddleId: h.id });
    },
    shipRelease(): boolean {
      const m = mech();
      if (shippableBuilds(m) <= 0) return false;
      const version = bumpVersion(m.command.version);
      hq.emit('release.shipped', { version });
      hq.emit('bot.message', { botId: 'daniel', text: `Marion v${version} shipped` });
      return true;
    },

    // ---------------------------------------------------------------- engine + bridge
    pinScreenshot(): string {
      const commandId = nextId('cmd');
      hq.emit('relay.queued', { commandId, kind: 'polaroid', text: `Screenshot #${mech().engine.polaroids + 1}` });
      return commandId;
    },
    queueCommand(text: string): string {
      const commandId = nextId('cmd');
      hq.emit('relay.queued', { commandId, kind: 'wave', text: tidy(text) });
      return commandId;
    },
    dispatch(commandId?: string, model: RelayModel = 'claude-opus-auto'): boolean {
      const cmd = mech().engine.commands.find((c) => (commandId ? c.id === commandId : c.status === 'queued'));
      if (!cmd || cmd.status !== 'queued') return false;
      hq.emit('relay.dispatched', { commandId: cmd.id, model, botId: 'kanye' });
      hq.emit('bot.tool_call', { botId: 'kanye', tool: 'relay.run', model });
      hq.emit('task.created', { taskId: cmd.id, botId: 'kanye', title: cmd.text });
      return true;
    },
    startBridgeDictation(): void {
      hq.emit('dictation.wave', { active: true, source: 'bridge' });
    },
    stopBridgeDictation(text: string, route: 'engine' | 'life'): void {
      const clean = tidy(text);
      hq.emit('dictation.wave', { active: false, source: 'bridge', transcript: clean });
      if (route === 'engine') a.queueCommand(clean);
      else hq.emit('planner.added', { cardId: nextId('card'), lane: 'work', title: clean });
    },

    // ---------------------------------------------------------------- life hub
    toggleCard(cardId: string): void {
      const c = mech().life.cards.find((x) => x.id === cardId);
      if (c) hq.emit('planner.toggled', { cardId, done: !c.done });
    },
    addCard(lane: PlannerLane, title: string): void {
      if (!title.trim()) return;
      hq.emit('planner.added', { cardId: nextId('card'), lane, title: tidy(title) });
    },
    startLifeDictation(): void {
      hq.emit('dictation.wave', { active: true, source: 'life' });
    },
    stopLifeDictation(transcript: string): void {
      hq.emit('dictation.wave', { active: false, source: 'life', transcript: transcript.trim() || undefined });
    },
    toggleTurntable(): void {
      get().setTurntable(!get().turntable);
    },
    restore(itemId?: string): boolean {
      const item = mech().life.vault.find((v) => (itemId ? v.id === itemId : v.deleted));
      if (!item || !item.deleted) return false;
      hq.emit('vault.restored', { itemId: item.id });
      return true;
    },

    // ---------------------------------------------------------------- media vault
    dropReel(title?: string, platform?: 'reel' | 'youtube'): string {
      const base = pick(rng, REEL_POOL);
      const reelId = nextId('reel');
      hq.emit('reel.received', { reelId, title: title?.trim() || base.title, platform: platform ?? base.platform });
      return reelId;
    },
    distill(reelId?: string): boolean {
      const m = mech();
      const reel = reelId ? m.media.queue.find((r) => r.id === reelId) : m.media.queue[0];
      if (!reel) return false;
      hq.emit('reel.distilled', { reelId: reel.id, insight: insightFor(reel.title), buff: m.media.llm === 'cloud' ? 'speed' : 'accuracy' });
      return true;
    },
    toggleLlm(): void {
      hq.emit('settings.llm', { mode: mech().media.llm === 'local' ? 'cloud' : 'local' });
    },
    dimmer(): void {
      get().cycleTheme();
    },

    // ---------------------------------------------------------------- cutting room
    requestClip(): void {
      const name = `${pick(rng, CLIP_NAMES)} #${Math.floor(rng() * 90 + 10)}`;
      hq.emit('clip.received', { clipId: nextId('clip'), name, quality: clipQuality(name) });
    },
    sortClip(clipId: string, bin: ClipBin): boolean {
      if (!mech().cutting.queue.some((c) => c.id === clipId)) return false;
      hq.emit('clip.sorted', { clipId, bin, by: 'you' });
      return true;
    },

    // ---------------------------------------------------------------- mailroom
    requestMail(): void {
      const m = pick(rng, MAIL_POOL);
      hq.emit('mail.received', { mailId: nextId('mail'), ...m });
    },
    sortMail(mailId: string, slot: MailSlot): boolean {
      const m = mech().mail;
      if (![...m.inbox, ...m.sorted.action, ...m.sorted.fyi, ...m.sorted.noise].some((x) => x.id === mailId)) return false;
      hq.emit('mail.sorted', { mailId, slot });
      return true;
    },
    requestDraft(mailId?: string): boolean {
      const item = mailId ? mech().mail.sorted.action.find((x) => x.id === mailId) : mech().mail.sorted.action[0];
      if (!item) return false;
      hq.emit('mail.pending_approval', { mailId: item.id, draftId: nextId('draft'), subject: `Re: ${item.subject}`, words: 120 + Math.floor(rng() * 120) });
      return true;
    },
    /** The brass Approval Stamp — the only way a draft is ever sent. */
    approve(draftId?: string): boolean {
      const d = draftId ? mech().mail.drafts.find((x) => x.id === draftId) : mech().mail.drafts[0];
      if (!d) return false;
      hq.emit('mail.sent', { draftId: d.id });
      return true;
    },
    clearNoise(): boolean {
      if (!mech().mail.sorted.noise.length) return false;
      hq.emit('mail.cleared', {});
      return true;
    },

    // ---------------------------------------------------------------- foundry
    spawnBot(input: { name: string; job: string; shape: BotShape; colorIndex: number }): string | null {
      const m = mech();
      if (m.foundry.customBots.length >= MAX_CUSTOM) return `The Foundry holds ${MAX_CUSTOM} custom bots`;
      if (!input.job.trim()) return 'Write a 1-line job card first';
      if (!BOT_SHAPES.includes(input.shape)) return 'Pick a shape';
      const c = FOUNDRY_COLORS[input.colorIndex % FOUNDRY_COLORS.length]!;
      const name = input.name.trim().split(/\s+/)[0]?.slice(0, 12) || 'Sprout';
      hq.emit('bot.spawned', { botId: nextId('bot'), name, job: input.job.trim().slice(0, 80), shape: input.shape, color: c.color, glowColor: c.glow });
      return null;
    },
    toggleSkill(skillId: SkillId): void {
      hq.emit('skill.slotted', { skillId, slotted: !mech().foundry.skills.includes(skillId) });
    },

    // ---------------------------------------------------------------- hotspots
    /** Click on a prop in the world. Returns a short toast-able result. */
    hotspot(room: RoomId, action: HotspotAction): string | null {
      switch (action) {
        case 'stamp':
          return a.approve() ? 'Stamped & sent' : 'No drafts awaiting approval';
        case 'dimmer':
          a.dimmer();
          return `Lights: ${get().theme}`;
        case 'intake':
          return a.distill() ? 'Distilled an insight card' : (a.dropReel(), 'Dropped a reel into the intake');
        case 'turntable':
          a.toggleTurntable();
          return get().turntable ? 'Turntable on' : 'Turntable off';
        case 'mic':
          if (mech().life.dictating) a.stopLifeDictation('Quick voice note');
          else a.startLifeDictation();
          return null;
        case 'release':
          return a.shipRelease() ? 'Release shipped' : 'Need a Render Green build first';
        case 'huddle':
          a.summonHuddle();
          return null;
        case 'polaroid':
          a.pinScreenshot();
          return 'Screenshot pinned';
        case 'relay':
          return a.dispatch() ? 'Relay dispatched' : 'Relay queue is empty';
        case 'llm':
          a.toggleLlm();
          return null;
        case 'wave':
          if (get().bridgeDictating) a.stopBridgeDictation('Quick voice note', 'engine');
          else a.startBridgeDictation();
          return null;
        case 'tubes':
          a.requestMail();
          return 'Mail incoming';
        case 'arcade':
          launchMystery({ kind: 'menu' });
          return 'Booting Marion Mystery…';
        case 'timeline':
        case 'bins':
          if (!mech().cutting.queue.length) a.requestClip();
          return null;
        default:
          void room;
          return null;
      }
    },
  };
  return a;
}

export type Actions = ReturnType<typeof createActions>;
export const actions = createActions(defaultHq);
