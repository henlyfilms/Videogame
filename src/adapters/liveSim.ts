/**
 * LiveSimAdapter (default): believable, continuous HQ activity. Bots also
 * operate room mechanics autonomously when backlogs grow — except the Approval
 * Stamp, which always waits for the human.
 */
import { CORE_BOTS } from '../data/bots';
import {
  CHATTER,
  CLIP_NAMES,
  clipQuality,
  HUDDLE_TOPICS,
  insightFor,
  MAIL_POOL,
  MODELS,
  mulberry32,
  pick,
  REEL_POOL,
  SOLO_LINES,
  TASKS_BY_BOT,
  TRANSCRIPTS,
  type Rng,
} from '../game/content';
import { makeEvent, nextId, type EventPayloads, type MarionEventType } from './events';
import type { AdapterContext, EventSourceAdapter } from './types';

interface Timer {
  name: string;
  next: number;
  min: number;
  max: number;
  run: () => void;
}

export interface LiveSimOptions {
  rng?: Rng;
  /** Emit a starter backlog on start so every room has something to play. */
  seedBacklog?: boolean;
}

export class LiveSimAdapter implements EventSourceAdapter {
  readonly kind = 'live' as const;
  private ctx: AdapterContext | null = null;
  private clock = 0;
  private timers: Timer[] = [];
  private rng: Rng;
  private seen = new Map<string, number>();
  private pending: { at: number; run: () => void }[] = [];
  private seedBacklog: boolean;
  emitted = 0;

  constructor(opts: LiveSimOptions = {}) {
    this.rng = opts.rng ?? mulberry32((Date.now() ^ 0x5eed) >>> 0);
    this.seedBacklog = opts.seedBacklog ?? true;
  }

  private emit<K extends MarionEventType>(type: K, payload: EventPayloads[K]): void {
    if (!this.ctx) return;
    this.emitted++;
    this.ctx.emit(makeEvent(type, payload));
  }

  private later(ms: number, run: () => void): void {
    this.pending.push({ at: this.clock + ms, run });
  }

  private every(name: string, minS: number, maxS: number, run: () => void, firstS?: number): void {
    this.timers.push({ name, min: minS * 1000, max: maxS * 1000, next: (firstS ?? minS + this.rng() * (maxS - minS)) * 1000, run });
  }

  start(ctx: AdapterContext): void {
    this.ctx = ctx;
    this.clock = 0;
    this.timers = [];
    this.pending = [];
    ctx.setStatus('idle', null);

    this.every('mail', 7, 12, () => this.newMail());
    this.every('reel', 10, 16, () => this.newReel());
    this.every('clip', 8, 13, () => this.newClip());
    this.every('chatter', 4, 8, () => this.chatter());
    this.every('delegate', 16, 26, () => this.delegate());
    this.every('complete', 3, 5, () => this.completeTasks());
    this.every('quill', 6, 9, () => this.quillWorks());
    this.every('greek', 7, 11, () => this.greekWorks());
    this.every('sift', 9, 14, () => this.siftWorks());
    this.every('kanye', 6, 9, () => this.kanyeWorks());
    this.every('huddle', 50, 80, () => this.huddle(), 28);
    this.every('huddleEnd', 3, 3, () => this.endHuddles());
    this.every('dictation', 35, 55, () => this.dictation(), 18);
    this.every('sleep', 18, 30, () => this.sleepCycle());

    if (this.seedBacklog) {
      for (let i = 0; i < 3; i++) this.newMail();
      this.newReel();
      this.newReel();
      for (let i = 0; i < 3; i++) this.newClip();
      this.later(1500, () => this.delegate());
    }
  }

  stop(): void {
    this.ctx = null;
    this.timers = [];
    this.pending = [];
  }

  tick(dtMs: number): void {
    if (!this.ctx) return;
    this.clock += dtMs;
    for (const t of this.timers) {
      if (this.clock >= t.next) {
        t.next = this.clock + t.min + this.rng() * (t.max - t.min);
        t.run();
        if (!this.ctx) return;
      }
    }
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.clock);
      if (due.length) {
        this.pending = this.pending.filter((p) => p.at > this.clock);
        due.forEach((p) => p.run());
      }
    }
  }

  get time(): number {
    return this.clock;
  }

  // ------------------------------------------------------------------ generators

  private mech() {
    return this.ctx!.getMechanics();
  }

  private firstSeen(id: string): number {
    let t = this.seen.get(id);
    if (t === undefined) {
      t = this.clock;
      this.seen.set(id, t);
      if (this.seen.size > 500) this.seen.delete(this.seen.keys().next().value as string);
    }
    return t;
  }

  private waits = new Map<string, number>();
  /** Per-task work duration drawn from the seeded RNG (deterministic). */
  private waitFor(id: string): number {
    let w = this.waits.get(id);
    if (w === undefined) {
      w = 14000 + this.rng() * 8000;
      this.waits.set(id, w);
      if (this.waits.size > 500) this.waits.delete(this.waits.keys().next().value as string);
    }
    return w;
  }

  newMail(): void {
    const m = pick(this.rng, MAIL_POOL);
    this.emit('mail.received', { mailId: nextId('mail'), ...m });
  }

  newReel(): void {
    const r = pick(this.rng, REEL_POOL);
    this.emit('reel.received', { reelId: nextId('reel'), ...r });
  }

  newClip(): void {
    const name = `${pick(this.rng, CLIP_NAMES)} #${Math.floor(this.rng() * 90 + 10)}`;
    this.emit('clip.received', { clipId: nextId('clip'), name, quality: clipQuality(name) });
  }

  private chatter(): void {
    if (this.rng() < 0.55) {
      const c = pick(this.rng, CHATTER);
      this.emit('bot.message', { botId: c.from, text: c.text, to: c.to });
    } else {
      const bot = pick(this.rng, CORE_BOTS);
      this.emit('bot.message', { botId: bot.id, text: pick(this.rng, SOLO_LINES[bot.id] ?? ['On it']) });
    }
  }

  private delegate(): void {
    const targets = CORE_BOTS.filter((b) => b.id !== 'daniel');
    const to = pick(this.rng, targets);
    const title = pick(this.rng, TASKS_BY_BOT[to.id] ?? ['Follow up']);
    const taskId = nextId('task');
    this.emit('bot.delegate', { from: 'daniel', to: to.id, task: title, taskId });
    this.emit('task.created', { taskId, botId: to.id, title });
  }

  private completeTasks(): void {
    for (const t of this.mech().command.tasks) {
      if (t.status !== 'open') continue;
      const age = this.clock - this.firstSeen(t.id);
      if (age < this.waitFor(t.id)) continue;
      const deliverTo = this.rng() < 0.4 ? 'life' : 'daniel';
      this.emit('task.completed', { taskId: t.id, botId: t.botId, title: t.title, deliverTo });
      if (t.botId === 'kanye' && this.rng() < 0.5) this.emit('bot.message', { botId: 'kanye', text: 'Build green → Daniel', to: 'daniel' });
      return; // one at a time keeps it readable
    }
  }

  private quillWorks(): void {
    const mail = this.mech().mail;
    // Triage autonomously once the tube backs up.
    if (mail.inbox.length > 3) {
      const m = mail.inbox[0]!;
      this.emit('mail.sorted', { mailId: m.id, slot: m.hint });
    }
    // Draft replies for Needs Action — but never send them.
    if (mail.sorted.action.length && mail.drafts.length < 3) {
      const m = mail.sorted.action[0]!;
      this.emit('mail.pending_approval', { mailId: m.id, draftId: nextId('draft'), subject: `Re: ${m.subject}`, words: 110 + Math.floor(this.rng() * 140) });
    }
    if (mail.sorted.noise.length >= 8) this.emit('mail.cleared', {});
  }

  private greekWorks(): void {
    const q = this.mech().cutting.queue;
    if (q.length > 4) {
      const c = q[0]!;
      this.emit('clip.sorted', { clipId: c.id, bin: c.quality === 'good' ? 'keeper' : 'outtake', by: 'greek' });
    }
  }

  private siftWorks(): void {
    const media = this.mech().media;
    if (media.queue.length > 3) {
      const r = media.queue[0]!;
      this.emit('reel.distilled', { reelId: r.id, insight: insightFor(r.title), buff: this.rng() < 0.5 ? 'speed' : 'accuracy' });
    }
  }

  private kanyeWorks(): void {
    const engine = this.mech().engine;
    const queued = engine.commands.find((c) => c.status === 'queued' && this.clock - this.firstSeen(c.id) > 9000);
    if (queued) {
      const model = pick(this.rng, MODELS);
      this.emit('relay.dispatched', { commandId: queued.id, model, botId: 'kanye' });
      this.emit('task.created', { taskId: queued.id, botId: 'kanye', title: queued.text });
    } else if (this.rng() < 0.35) {
      this.emit('bot.tool_call', { botId: 'kanye', tool: pick(this.rng, ['git.push', 'npm test', 'relay.ping', 'fs.write']), model: pick(this.rng, MODELS) });
    }
  }

  private huddle(): void {
    if (this.mech().command.huddles.length) return;
    const pool = CORE_BOTS.filter(() => this.rng() < 0.6).map((b) => b.id);
    const ids = Array.from(new Set(['daniel', ...pool])).slice(0, 6);
    if (ids.length < 3) ids.push('moose', 'kanye');
    const huddleId = nextId('huddle');
    this.emit('group.huddle_start', { huddleId, botIds: Array.from(new Set(ids)), topic: pick(this.rng, HUDDLE_TOPICS) });
  }

  private endHuddles(): void {
    for (const h of this.mech().command.huddles) {
      if (this.clock - this.firstSeen(h.id) > 16000) this.emit('group.huddle_end', { huddleId: h.id });
    }
  }

  private dictation(): void {
    const text = pick(this.rng, TRANSCRIPTS);
    this.emit('dictation.wave', { active: true, source: 'bridge' });
    this.later(4200, () => {
      this.emit('dictation.wave', { active: false, source: 'bridge', transcript: text });
      this.emit('relay.queued', { commandId: nextId('cmd'), kind: this.rng() < 0.3 ? 'polaroid' : 'wave', text });
    });
  }

  private sleepCycle(): void {
    const open = new Set(this.mech().command.tasks.filter((t) => t.status === 'open').map((t) => t.botId));
    const candidates = CORE_BOTS.filter((b) => b.id !== 'daniel' && !open.has(b.id));
    if (!candidates.length) return;
    const bot = pick(this.rng, candidates);
    this.emit('bot.status', { botId: bot.id, status: 'asleep' });
    this.later(9000 + this.rng() * 8000, () => this.emit('bot.status', { botId: bot.id, status: 'working' }));
  }
}
