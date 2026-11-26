/**
 * The HQ simulation: bots moving through the floorplan under an FSM, pneumatic
 * tube packets, particles, dictation waves and relay tethers. It consumes
 * MarionEvents and turns them into visible behaviour. Pure TypeScript — no DOM.
 */
import { BOT_SHAPES, makeCustomBot, type BotDef, type BotShape, type RoomId } from '../data/bots';
import type { BotState, DictationSource, MarionEvent, RelayModel } from '../adapters/events';
import { BubbleSystem } from './bubbles';
import { forceTransition, transition } from './fsm';
import { Pathfinder, simplifyPath } from './pathfinding';
import {
  ARCADE_SEATS,
  buildGrid,
  intakeRoute,
  pointAlong,
  polylineLength,
  propCenter,
  roomAtTile,
  ROOM_BY_ID,
  spotTile,
  TILE,
  tileCenter,
  tubePort,
  tubeRoute,
  worldToTile,
  type Grid,
  type Point,
} from './world';

export type CarryKind = 'box' | 'card' | 'mail';

export interface Intent {
  room: RoomId;
  spot: string;
  /** State to enter on arrival. */
  arrive: BotState;
  /** Seconds to stay before `then` (or returning home). */
  dwell?: number;
  then?: 'home' | 'stay';
  /** Called on arrival. */
  onArrive?: (bot: SimBot) => void;
}

export interface SimBot {
  def: BotDef;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  path: Point[];
  pathIdx: number;
  goal: Point | null;
  state: BotState;
  stateTime: number;
  intent: Intent | null;
  dwell: number;
  facing: 1 | -1;
  phase: number;
  carry: CarryKind | null;
  huddleId: string | null;
  tether: { model: RelayModel; until: number } | null;
  buffUntil: number;
  wanderIn: number;
  task: string | null;
  lastActive: number;
  /** Short-lived expressive pose (arcade play, celebrate, sulk). */
  mood: { kind: BotMood; until: number } | null;
}

export type BotMood = 'play' | 'cheer' | 'sulk';

const SULK_LINES = ['Rematch?', 'I was framed 😤', 'Sus lobby…', 'Next one’s mine', 'Lag. Definitely lag.'];
const CHEER_LINES = ['GG! 🏆', 'Too easy ✨', 'Called it!', 'Victory berry 🫐', 'Crew diff'];

export type PacketKind = 'mail' | 'capsule' | 'card' | 'msg' | 'reel' | 'clip' | 'command';

export interface Packet {
  id: number;
  kind: PacketKind;
  points: Point[];
  length: number;
  t: number;
  speed: number;
  color: string;
  onArrive?: () => void;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'spark' | 'ring' | 'text';
  text?: string;
}

export interface Wave {
  source: DictationSource;
  born: number;
  active: boolean;
  endedAt: number | null;
}

export type SimEffect = 'whoosh' | 'chime' | 'stamp' | 'spawn' | 'deliver' | 'pop' | 'sort';

export const PACKET_COLORS: Record<PacketKind, string> = {
  mail: '#f8fafc',
  capsule: '#6ea1ff',
  card: '#22d3ee',
  msg: '#2dd4bf',
  reel: '#fbbf24',
  clip: '#e879f9',
  command: '#a78bfa',
};

const WALK_SPEED = 3.4 * TILE; // px / s
const BUFF_MULT = 1.35;

export interface SimOptions {
  /** Deterministic RNG for tests/replay. */
  random?: () => number;
}

function tileCenterToTile(p: Point, sim: Simulation): Point | undefined {
  const t = worldToTile(p);
  return sim.pathfinder.nearestFree(t, () => false) ?? undefined;
}

export class Simulation {
  readonly grid: Grid;
  readonly pathfinder: Pathfinder;
  readonly bubbles = new BubbleSystem();
  bots = new Map<string, SimBot>();
  packets: Packet[] = [];
  particles: Particle[] = [];
  waves: Wave[] = [];
  time = 0;
  /** Global throughput multiplier (Universal Skill Wall + buffs). */
  throughput = 1;
  /** Moments of visual events the renderer animates against. */
  marks = { release: -99, skill: -99, stamp: -99, spawn: -99, distill: -99, sorted: -99, restored: -99, arcade: -99, arcadeStart: -99 };
  onEffect: ((e: SimEffect) => void) | null = null;
  private packetSeq = 0;
  private huddles = new Map<string, string[]>();
  private random: () => number;

  constructor(opts: SimOptions = {}) {
    this.grid = buildGrid();
    this.pathfinder = new Pathfinder(this.grid);
    this.random = opts.random ?? Math.random;
  }

  // ------------------------------------------------------------------ bots

  addBot(def: BotDef, at?: Point): SimBot {
    const existing = this.bots.get(def.id);
    if (existing) {
      existing.def = def;
      return existing;
    }
    const spotName = def.custom ? `c${this.customCount() % 4}` : 'desk';
    const start = at ?? this.freeTileNear(spotTile(def.home, spotName), def.id) ?? spotTile(def.home, 'center');
    const c = tileCenter(start);
    const bot: SimBot = {
      def,
      x: c.x,
      y: c.y,
      prevX: c.x,
      prevY: c.y,
      path: [],
      pathIdx: 0,
      goal: start,
      state: 'idle',
      stateTime: 0,
      intent: null,
      dwell: 0,
      facing: 1,
      phase: this.random() * Math.PI * 2,
      carry: null,
      huddleId: null,
      tether: null,
      buffUntil: 0,
      wanderIn: 3 + this.random() * 6,
      task: null,
      lastActive: 0,
      mood: null,
    };
    this.bots.set(def.id, bot);
    return bot;
  }

  removeBot(id: string): void {
    this.bots.delete(id);
  }

  private customCount(): number {
    let n = 0;
    for (const b of this.bots.values()) if (b.def.custom) n++;
    return n;
  }

  getBot(id: string): SimBot | undefined {
    return this.bots.get(id);
  }

  botTile(bot: SimBot): Point {
    return worldToTile({ x: bot.x, y: bot.y });
  }

  botRoom(bot: SimBot): RoomId | null {
    const t = this.botTile(bot);
    return roomAtTile(this.grid, t.x, t.y)?.id ?? null;
  }

  /** Tiles reserved by other bots (their goal or current tile). */
  private takenBy(exceptId: string): (x: number, y: number) => boolean {
    const taken = new Set<number>();
    for (const b of this.bots.values()) {
      if (b.def.id === exceptId) continue;
      const g = b.goal ?? this.botTile(b);
      taken.add(g.y * this.grid.w + g.x);
    }
    return (x, y) => taken.has(y * this.grid.w + x);
  }

  private freeTileNear(target: Point, botId: string): Point | null {
    return this.pathfinder.nearestFree(target, this.takenBy(botId));
  }

  /** Send a bot to a named spot in a room. Returns false when unreachable. */
  send(botId: string, intent: Intent): boolean {
    const bot = this.bots.get(botId);
    if (!bot) return false;
    if (bot.state === 'asleep') forceTransition(bot, 'idle');
    const goal = this.freeTileNear(spotTile(intent.room, intent.spot), botId);
    if (!goal) return false;
    const start = this.botTile(bot);
    const walkers = [...this.bots.values()].filter((b) => b.state === 'walking').length;
    let tiles: Point[] | null;
    if (walkers >= 4) {
      // Crowding avoidance: route around bots that are standing still.
      const standing = new Set<number>();
      for (const b of this.bots.values()) {
        if (b === bot || b.state === 'walking') continue;
        const t = this.botTile(b);
        standing.add(t.y * this.grid.w + t.x);
      }
      tiles = this.pathfinder.find(start, goal, {
        extraCost: (x, y) => (standing.has(y * this.grid.w + x) ? 4 : 0),
      });
    } else {
      tiles = this.pathfinder.find(start, goal);
    }
    if (!tiles) return false;
    bot.goal = goal;
    bot.intent = intent;
    bot.path = simplifyPath(tiles).map(tileCenter);
    bot.pathIdx = 0;
    bot.dwell = 0;
    if (tiles.length <= 1) {
      this.arrive(bot);
    } else {
      forceTransition(bot, 'walking');
    }
    return true;
  }

  sendHome(botId: string, arrive: BotState = 'working'): boolean {
    const bot = this.bots.get(botId);
    if (!bot) return false;
    const spot = bot.def.custom ? `c${[...this.bots.values()].filter((b) => b.def.custom).indexOf(bot) % 4}` : 'desk';
    return this.send(botId, { room: bot.def.home, spot, arrive, dwell: arrive === 'working' ? 8 + this.random() * 6 : undefined });
  }

  private arrive(bot: SimBot): void {
    const intent = bot.intent;
    bot.path = [];
    bot.pathIdx = 0;
    if (!intent) {
      forceTransition(bot, 'idle');
      return;
    }
    forceTransition(bot, intent.arrive);
    bot.dwell = intent.dwell ?? 0;
    intent.onArrive?.(bot);
    if (!intent.dwell) bot.intent = intent.then === 'home' ? intent : null;
  }

  // ------------------------------------------------------------------ update

  update(dt: number): void {
    this.time += dt;
    for (const bot of this.bots.values()) this.updateBot(bot, dt);
    this.updatePackets(dt);
    this.updateParticles(dt);
    this.bubbles.update(dt);
    this.waves = this.waves.filter((w) => w.active || (w.endedAt !== null && this.time - w.endedAt < 1.5));
  }

  private updateBot(bot: SimBot, dt: number): void {
    bot.prevX = bot.x;
    bot.prevY = bot.y;
    bot.stateTime += dt;
    bot.phase += dt * (bot.state === 'working' ? 6 : bot.state === 'asleep' ? 1 : 3);
    if (bot.tether && bot.tether.until < this.time) bot.tether = null;
    if (bot.mood && bot.mood.until < this.time) bot.mood = null;

    if (bot.state === 'walking' && bot.path.length > 0) {
      const speed = WALK_SPEED * this.throughput * (bot.buffUntil > this.time ? BUFF_MULT : 1);
      let budget = speed * dt;
      while (budget > 0 && bot.pathIdx < bot.path.length) {
        const target = bot.path[bot.pathIdx]!;
        const dx = target.x - bot.x;
        const dy = target.y - bot.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.5) bot.facing = dx > 0 ? 1 : -1;
        if (d <= budget) {
          bot.x = target.x;
          bot.y = target.y;
          budget -= d;
          bot.pathIdx++;
        } else {
          bot.x += (dx / d) * budget;
          bot.y += (dy / d) * budget;
          budget = 0;
        }
      }
      if (bot.pathIdx >= bot.path.length) this.arrive(bot);
      return;
    }

    // Dwell timers (e.g. working at a desk for a while, then idling).
    if (bot.dwell > 0) {
      bot.dwell -= dt * this.throughput;
      if (bot.dwell <= 0) {
        const intent = bot.intent;
        bot.intent = null;
        bot.carry = null;
        if (bot.mood?.kind === 'play') bot.mood = null;
        if (intent?.then === 'home') this.sendHome(bot.def.id, 'working');
        else transition(bot, 'idle');
      }
      return;
    }

    // Ambient life: idle bots occasionally wander within their wing.
    if (bot.state === 'idle') {
      bot.wanderIn -= dt;
      if (bot.wanderIn <= 0) {
        bot.wanderIn = 6 + this.random() * 10;
        const room = ROOM_BY_ID[bot.def.home];
        const spots = room.spots.filter((s) => !s.name.startsWith('seat'));
        const pick = spots[Math.floor(this.random() * spots.length)];
        if (pick) {
          const toDesk = pick.name === 'desk' || pick.name.startsWith('c');
          this.send(bot.def.id, { room: room.id, spot: pick.name, arrive: toDesk ? 'working' : 'idle', dwell: toDesk ? 6 + this.random() * 6 : undefined });
        }
      }
    }
  }

  // ------------------------------------------------------------------ packets & particles

  launch(kind: PacketKind, points: Point[], onArrive?: () => void, color?: string): Packet {
    const pk: Packet = {
      id: ++this.packetSeq,
      kind,
      points,
      length: Math.max(1, polylineLength(points)),
      t: 0,
      speed: 520,
      color: color ?? PACKET_COLORS[kind],
      onArrive,
    };
    this.packets.push(pk);
    this.onEffect?.('whoosh');
    return pk;
  }

  launchBetween(kind: PacketKind, from: RoomId, to: RoomId, onArrive?: () => void): Packet {
    const pts = from === to ? [tubePort(from), tubePort(to)] : tubeRoute(from, to);
    return this.launch(kind, pts, onArrive);
  }

  private updatePackets(dt: number): void {
    const arrived: Packet[] = [];
    for (const pk of this.packets) {
      pk.t += (pk.speed * this.throughput * dt) / pk.length;
      if (pk.t >= 1) arrived.push(pk);
    }
    if (arrived.length) {
      this.packets = this.packets.filter((p) => p.t < 1);
      for (const pk of arrived) {
        const end = pk.points[pk.points.length - 1]!;
        this.burst(end.x, end.y, pk.color, 6);
        pk.onArrive?.();
      }
    }
  }

  packetPos(pk: Packet): Point {
    return pointAlong(pk.points, pk.t);
  }

  burst(x: number, y: number, color: string, n = 10, speed = 60): void {
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2;
      const s = speed * (0.4 + this.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0, max: 0.6 + this.random() * 0.5, color, size: 1.5 + this.random() * 2, kind: 'spark' });
    }
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.6, color, size: 6, kind: 'ring' });
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  floatText(x: number, y: number, text: string, color: string): void {
    this.particles.push({ x, y, vx: 0, vy: -24, life: 0, max: 1.6, color, size: 11, kind: 'text', text });
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  waveActive(source?: DictationSource): boolean {
    return this.waves.some((w) => w.active && (!source || w.source === source));
  }

  // ------------------------------------------------------------------ events

  say(botId: string, text: string, crossBot = false): void {
    if (this.bots.has(botId)) this.bubbles.say(botId, text, crossBot);
  }

  apply(ev: MarionEvent): void {
    switch (ev.type) {
      case 'bot.status': {
        const { botId, status } = ev.payload;
        const bot = this.bots.get(botId);
        if (!bot) return;
        bot.lastActive = this.time;
        if (status === 'asleep') {
          if (bot.state === 'huddling') return;
          this.sendHome(botId, 'asleep');
        } else if (status === 'working') {
          this.sendHome(botId, 'working');
        } else if (status === 'huddling') {
          this.send(botId, { room: 'huddle', spot: 'seat0', arrive: 'huddling' });
        } else if (status === 'walking') {
          // Walking is derived from movement; ignore.
        } else {
          forceTransition(bot, status);
          if (status === 'needs_input') this.say(botId, 'Need your input');
        }
        return;
      }
      case 'bot.message': {
        const { botId, text, to } = ev.payload;
        this.say(botId, text, !!to);
        const a = this.bots.get(botId);
        const b = to ? this.bots.get(to) : undefined;
        if (a && b) {
          const ra = this.botRoom(a);
          const rb = this.botRoom(b);
          if (ra && rb && ra !== rb) this.launchBetween('msg', ra, rb);
        }
        return;
      }
      case 'bot.delegate': {
        const { from, to, task } = ev.payload;
        const a = this.bots.get(from);
        const b = this.bots.get(to);
        if (!a || !b) return;
        forceTransition(a, 'delegating');
        a.dwell = 2.5;
        this.say(from, `→ ${b.def.name}: ${task}`, true);
        const ra = this.botRoom(a) ?? a.def.home;
        const rb = this.botRoom(b) ?? b.def.home;
        this.launchBetween('command', ra, rb, () => {
          this.say(to, 'Got it', false);
          b.task = task;
          this.sendHome(to, 'working');
        });
        return;
      }
      case 'bot.tool_call': {
        const { botId, tool, model } = ev.payload;
        const bot = this.bots.get(botId);
        if (!bot) return;
        if (model) bot.tether = { model, until: this.time + 6 };
        this.say(botId, `⚙ ${tool}`);
        return;
      }
      case 'group.huddle_start': {
        const { huddleId, botIds, topic } = ev.payload;
        const members = botIds.filter((id) => this.bots.has(id));
        this.huddles.set(huddleId, members);
        members.forEach((id, i) => {
          const bot = this.bots.get(id)!;
          bot.huddleId = huddleId;
          this.send(id, { room: 'huddle', spot: `seat${i % 12}`, arrive: 'huddling' });
        });
        if (members[0]) this.say(members[0], `Huddle: ${topic}`, true);
        return;
      }
      case 'group.huddle_end': {
        const members = this.huddles.get(ev.payload.huddleId) ?? [];
        this.huddles.delete(ev.payload.huddleId);
        for (const id of members) {
          const bot = this.bots.get(id);
          if (!bot || bot.huddleId !== ev.payload.huddleId) continue;
          bot.huddleId = null;
          transition(bot, 'idle');
          this.sendHome(id, 'working');
        }
        return;
      }
      case 'task.created': {
        const { botId, title } = ev.payload;
        const bot = this.bots.get(botId);
        if (!bot) return;
        bot.task = title;
        this.say(botId, 'Got it');
        if (bot.state !== 'huddling') this.sendHome(botId, 'working');
        return;
      }
      case 'task.completed': {
        const { botId, title } = ev.payload;
        const deliverTo = ev.payload.deliverTo ?? 'daniel';
        const bot = this.bots.get(botId);
        if (!bot) return;
        bot.task = null;
        if (deliverTo === 'life') {
          const from = this.botRoom(bot) ?? bot.def.home;
          this.say(botId, `Capsule → Vault`);
          this.launchBetween('capsule', from, 'life', () => {
            const v = propCenter('life', 'vault');
            this.burst(v.x, v.y, PACKET_COLORS.capsule, 12);
            this.onEffect?.('chime');
          });
        } else if (botId === 'daniel' || bot.state === 'huddling') {
          this.say(botId, `Done: ${title}`);
        } else {
          bot.carry = 'box';
          this.send(botId, {
            room: 'command',
            spot: 'inbox',
            arrive: 'idle',
            dwell: 1.4,
            then: 'home',
            onArrive: (b) => {
              b.carry = null;
              this.say(b.def.id, `Shipped: ${title}`, true);
              const p = tileCenter(spotTile('command', 'inbox'));
              this.burst(p.x, p.y - 10, b.def.glowColor, 14);
              this.onEffect?.('deliver');
            },
          });
        }
        return;
      }
      case 'mail.received':
        this.launch('mail', intakeRoute('mail'));
        return;
      case 'mail.sorted': {
        const c = propCenter('mail', 'sortwall');
        this.marks.sorted = this.time;
        this.burst(c.x, c.y, ev.payload.slot === 'action' ? '#ef4444' : ev.payload.slot === 'fyi' ? '#6ea1ff' : '#94a3b8', 5, 40);
        this.onEffect?.('sort');
        return;
      }
      case 'mail.cleared': {
        const c = propCenter('mail', 'sortwall');
        this.burst(c.x, c.y, '#94a3b8', 16, 90);
        this.say('quill', 'Noise cleared');
        return;
      }
      case 'mail.pending_approval': {
        const quill = this.bots.get('quill');
        if (quill) {
          forceTransition(quill, 'needs_input');
          this.say('quill', `Draft ready (${ev.payload.words}w) — stamp?`);
        }
        return;
      }
      case 'mail.sent': {
        const c = propCenter('mail', 'stamp');
        this.marks.stamp = this.time;
        this.burst(c.x, c.y, '#d4a017', 18, 100);
        this.floatText(c.x, c.y - 20, 'APPROVED', '#d4a017');
        this.onEffect?.('stamp');
        const pts = intakeRoute('mail').slice().reverse();
        this.launch('mail', pts);
        const quill = this.bots.get('quill');
        if (quill && quill.state === 'needs_input') forceTransition(quill, 'working');
        return;
      }
      case 'reel.received':
        this.launch('reel', intakeRoute('media'));
        return;
      case 'reel.distilled': {
        const c = propCenter('media', 'intake');
        this.marks.distill = this.time;
        this.burst(c.x, c.y, PACKET_COLORS.card, 14);
        this.say('sift', `Insight: ${ev.payload.insight}`);
        this.launchBetween('card', 'media', 'command', () => {
          // A teammate picks up the insight card as a temporary buff.
          const pool = [...this.bots.values()].filter((b) => b.def.id !== 'sift' && b.state !== 'asleep');
          const lucky = pool[Math.floor(this.random() * pool.length)];
          if (lucky) {
            lucky.buffUntil = this.time + 25;
            this.floatText(lucky.x, lucky.y - 30, ev.payload.buff === 'speed' ? '+speed' : '+accuracy', PACKET_COLORS.card);
          }
        });
        return;
      }
      case 'clip.received':
        this.launch('clip', intakeRoute('cutting'));
        return;
      case 'clip.sorted': {
        const c = propCenter('cutting', 'bins');
        this.burst(c.x, c.y, ev.payload.bin === 'keeper' ? '#4ade80' : '#94a3b8', 8, 50);
        this.onEffect?.('sort');
        return;
      }
      case 'skill.slotted': {
        this.marks.skill = this.time;
        const c = propCenter('foundry', 'skills');
        this.burst(c.x, c.y, '#fb923c', ev.payload.slotted ? 20 : 6, 90);
        if (ev.payload.slotted) {
          for (const b of this.bots.values()) this.burst(b.x, b.y, b.def.glowColor, 4, 30);
          this.onEffect?.('chime');
        }
        return;
      }
      case 'dictation.wave': {
        const { active, source, transcript } = ev.payload;
        if (active) {
          if (!this.waveActive(source)) this.waves.push({ source, born: this.time, active: true, endedAt: null });
          if (source !== 'life') this.say('moose', '🎙 Listening…');
        } else {
          for (const w of this.waves) {
            if (w.source === source && w.active) {
              w.active = false;
              w.endedAt = this.time;
            }
          }
          if (transcript) this.say(source === 'life' ? 'barry' : 'moose', `“${transcript}”`, true);
        }
        return;
      }
      case 'relay.queued': {
        const { kind, text } = ev.payload;
        this.say('moose', kind === 'polaroid' ? '📸 Screenshot → Kanye' : `Routing: ${text}`, true);
        this.launchBetween('command', 'bridge', 'engine', () => this.say('kanye', 'Got it'));
        return;
      }
      case 'relay.dispatched': {
        const { botId, model } = ev.payload;
        const bot = this.bots.get(botId);
        if (!bot) return;
        this.send(botId, {
          room: 'engine',
          spot: 'relay',
          arrive: 'working',
          dwell: 4,
          then: 'home',
          onArrive: (b) => {
            b.tether = { model, until: this.time + 8 };
          },
        });
        return;
      }
      case 'release.shipped': {
        this.marks.release = this.time;
        const c = propCenter('command', 'chute');
        this.burst(c.x, c.y, '#6ea1ff', 16, 80);
        this.floatText(c.x, c.y - 24, `v${ev.payload.version}`, '#6ea1ff');
        this.onEffect?.('stamp');
        return;
      }
      case 'planner.toggled': {
        if (!ev.payload.done) return;
        const c = propCenter('life', 'planner');
        this.burst(c.x, c.y, '#4ade80', 10, 60);
        this.onEffect?.('chime');
        return;
      }
      case 'vault.archived':
        this.launchBetween('capsule', 'command', 'life');
        return;
      case 'vault.restored': {
        this.marks.restored = this.time;
        const c = propCenter('life', 'vault');
        this.burst(c.x, c.y, '#2dd4bf', 12, 60);
        this.floatText(c.x, c.y - 20, 'Restored', '#2dd4bf');
        return;
      }
      case 'bot.spawned': {
        const p = ev.payload;
        if (!this.bots.has(p.botId)) {
          const shape = (BOT_SHAPES as readonly string[]).includes(p.shape) ? (p.shape as BotShape) : 'blueberry';
          const def = makeCustomBot({ id: p.botId, name: p.name, job: p.job, shape, color: p.color, glowColor: p.glowColor });
          const bot = this.addBot(def, tileCenterToTile(propCenter('foundry', 'pod'), this));
          this.say(bot.def.id, `Hi! I'm ${def.name}`);
          this.sendHome(bot.def.id, 'working');
        }
        this.marks.spawn = this.time;
        const c = propCenter('foundry', 'pod');
        this.burst(c.x, c.y, ev.payload.glowColor, 28, 120);
        this.onEffect?.('spawn');
        return;
      }
      case 'arcade.player_joined': {
        const { botId } = ev.payload;
        if (this.goPlay(botId)) this.say(botId, '🕹 Joining Marion Mystery!');
        return;
      }
      case 'arcade.match_started': {
        this.marks.arcadeStart = this.time;
        const { bots, mode } = ev.payload;
        for (const id of bots) this.goPlay(id);
        const first = bots.find((id) => this.bots.has(id));
        if (first) this.say(first, mode === 'lightsout' ? 'Lights out… 👀' : mode === 'hideseek' ? 'Ready or not! 🙈' : 'Who’s sus? 🔍', true);
        const c = propCenter('arcade', 'mystery');
        this.burst(c.x, c.y, '#e879f9', 14, 70);
        this.onEffect?.('chime');
        return;
      }
      case 'arcade.match_ended': {
        this.marks.arcade = this.time;
        const { results, mvp } = ev.payload;
        const board = propCenter('arcade', 'board');
        this.burst(board.x, board.y, '#fbbf24', 18, 90);
        let celebrated = false;
        for (const r of results) {
          const bot = this.bots.get(r.botId);
          if (!bot) continue;
          if (r.won) {
            bot.mood = { kind: 'cheer', until: this.time + 4.5 };
            this.burst(bot.x, bot.y - 6, bot.def.glowColor, 16, 90);
            this.burst(bot.x, bot.y - 6, '#fbbf24', 8, 60);
            this.floatText(bot.x, bot.y - 30, mvp === r.botId ? 'MVP ★' : 'WIN!', '#fbbf24');
            this.say(r.botId, CHEER_LINES[Math.floor(this.random() * CHEER_LINES.length)]!);
            celebrated = true;
          } else {
            bot.mood = { kind: 'sulk', until: this.time + 5 };
            this.say(r.botId, SULK_LINES[Math.floor(this.random() * SULK_LINES.length)]!);
          }
          // Wrap up the session: linger a moment, then head home.
          if (bot.intent?.room === 'arcade') {
            if (bot.state === 'walking') bot.intent.dwell = 6;
            else bot.dwell = Math.min(bot.dwell || 6, 6);
          }
        }
        this.onEffect?.(celebrated ? 'deliver' : 'pop');
        return;
      }
      case 'planner.added':
      case 'settings.llm':
        return;
    }
  }

  /** Bots currently at (or walking to) an Arcade cabinet. */
  arcadePlayers(): SimBot[] {
    return [...this.bots.values()].filter((b) => b.intent?.room === 'arcade');
  }

  /** Walk a bot to a free Arcade cabinet and "play" there for a while. */
  goPlay(botId: string, minutes = 0.75): boolean {
    const bot = this.bots.get(botId);
    if (!bot || bot.huddleId) return false;
    if (bot.intent?.room === 'arcade') return false; // already there / on the way
    const taken = new Set<number>();
    for (const b of this.bots.values()) if (b !== bot && b.goal) taken.add(b.goal.y * this.grid.w + b.goal.x);
    const seat = ARCADE_SEATS.find((name) => {
      const t = spotTile('arcade', name);
      return !taken.has(t.y * this.grid.w + t.x);
    }) ?? 'center';
    const dwell = minutes * 60 * (0.8 + this.random() * 0.4);
    return this.send(botId, {
      room: 'arcade',
      spot: seat,
      arrive: 'working',
      dwell,
      then: 'home',
      onArrive: (b) => {
        if (!b.mood || b.mood.kind === 'play') b.mood = { kind: 'play', until: this.time + (b.intent?.dwell ?? dwell) + 1 };
        b.facing = seat === 'p6' || seat === 'p7' ? 1 : b.facing;
        this.burst(b.x, b.y - 10, '#e879f9', 6, 40);
      },
    });
  }

  /** Remove every bot and transient effect (caller re-populates). */
  clear(): void {
    this.bots.clear();
    this.packets = [];
    this.particles = [];
    this.waves = [];
    this.huddles.clear();
    this.bubbles.clear();
  }

  /** Reset everything except bot definitions (used by replay seeking). */
  reset(): void {
    const defs = [...this.bots.values()].map((b) => b.def);
    this.bots.clear();
    this.packets = [];
    this.particles = [];
    this.waves = [];
    this.huddles.clear();
    this.bubbles.clear();
    this.time = 0;
    for (const d of defs) this.addBot(d);
  }
}
