/**
 * Pilot: one Marion agent's seat at a Marion Mystery table.
 *
 * It connects to the game server like any player (so it only ever receives
 * its own per-player Snapshot: no other roles, no out-of-sight positions),
 * runs the built-in BotBrain on that snapshot as an AUTOPILOT at the server's
 * 20 Hz (walking, tasks, sabotage fixes, noticing evidence), and condenses the
 * stream into a few short reports at the moments an LLM should decide
 * something: match start, meetings, votes, deaths, finished orders, game over.
 *
 * That split is what keeps usage low: the model makes a handful of decisions
 * per round instead of steering every frame, and the game stays smooth while
 * it thinks.
 */
import { BotBrain, type Directive } from '../../src/mystery/ai/bot';
import { getMap } from '../../src/mystery/core/maps';
import { dist, INTERACT_RANGE, nearestFree, rectsOf, roomAt, type CompiledMap } from '../../src/mystery/core/map';
import { GUN_RANGE, REPORT_RANGE, VENT_RANGE, type Action } from '../../src/mystery/core/match';
import { MODES } from '../../src/mystery/core/modes';
import type { PublicPlayer, Snapshot } from '../../src/mystery/core/project';
import { ROLES } from '../../src/mystery/core/roles';
import { KILL_RANGE, type Settings } from '../../src/mystery/core/settings';
import { TASK_BY_ID } from '../../src/mystery/core/tasks';
import type { FacilityKind, MapId, ModeId, SabotageId, Vec2 } from '../../src/mystery/core/types';
import type { AgentState, RoomInfo, RoomListing } from '../../src/mystery/net/protocol';
import { normalizeAgentId } from '../../src/mystery/server/agentHub';
import { BOT_LOOKS } from '../../src/mystery/server/looks';
import { MysteryAgent, type AgentTransport } from '../agent-sdk';
import { roleGuide } from './guide';

export interface PilotEvent {
  t: number;
  text: string;
  urgent: boolean;
}

export interface PilotOptions {
  /** Marion agent id (kanye, moose, …) or any id of your own. */
  agentId: string;
  /** Display name (defaults to the Marion agent's name). */
  name?: string;
  transport: AgentTransport;
  token?: string;
  /** The controller (LLM) talks and votes in meetings; the autopilot only votes as a last-second fallback. Default true. */
  meetingControl?: boolean;
  /** Bot skill for the autopilot. Default 'sharp'. */
  skill?: 'easy' | 'normal' | 'sharp';
}

export type Result = { ok: boolean; text: string };

const ok = (text: string): Result => ({ ok: true, text });
const fail = (text: string): Result => ({ ok: false, text });

/** Words that would leak a game role into the public status line during a match. */
const ROLE_WORDS = /\b(murder(er)?s?|killer|kill(ing|ed)?|poison(er)?|accomplice|sheriff|detective|medic|engineer|lookout|tracker|mayor|jester|survivor|seeker|imposter|impostor|crewmate|my role|i am the)\b/i;

const clock = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;

/** Loose name matching: exact, then prefix, then substring (case-insensitive). */
export function matchName<T extends { name: string }>(list: readonly T[], raw: string): T | T[] | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const exact = list.filter((x) => x.name.toLowerCase() === q);
  if (exact.length === 1) return exact[0]!;
  const pre = list.filter((x) => x.name.toLowerCase().startsWith(q));
  if (pre.length === 1) return pre[0]!;
  const sub = list.filter((x) => x.name.toLowerCase().includes(q));
  if (sub.length === 1) return sub[0]!;
  const many = exact.length ? exact : pre.length ? pre : sub;
  return many.length ? many : null;
}

export class Pilot {
  readonly agent: MysteryAgent;
  readonly agentId: string;
  brain: BotBrain | null = null;
  private map: CompiledMap | null = null;
  private lastT = -1;
  private lastPhase = '';
  private lastStage = '';
  private lastRoomStage = '';
  private wasAlive = true;
  private knifeWasReady = false;
  private events: PilotEvent[] = [];
  private waiters = new Set<() => void>();
  private seenEv = new Set<string>();
  private seenBodies = new Set<string>();
  private meetingLines: string[] = [];
  private lastNack: { a: string; reason: string; at: number } | null = null;
  private lastError: { code: string; msg: string; at: number } | null = null;
  private rooms: RoomListing[] | null = null;
  private pending: { kind: 'emergency' | 'report' | 'vent' | 'use'; until: number; arg?: string } | null = null;
  private autoKill = true;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private statusQueued: { state: AgentState; title?: string; detail?: string } | null = null;
  private statusSentAt = 0;
  meetingControl: boolean;
  private skill: 'easy' | 'normal' | 'sharp';
  /** Wall-clock ms of the last controller (tool) call: an absent controller gets the autopilot back in meetings. */
  lastControlAt = Date.now();

  constructor(opts: PilotOptions) {
    this.agentId = normalizeAgentId(opts.agentId) || 'agent';
    const preset = BOT_LOOKS[this.agentId];
    this.meetingControl = opts.meetingControl ?? true;
    this.skill = opts.skill ?? 'sharp';
    this.agent = new MysteryAgent({ name: opts.name ?? preset?.name ?? opts.agentId, transport: opts.transport, token: opts.token, agentId: this.agentId, cosmetics: preset?.cosmetics });
    this.agent.on('snap', (s) => this.onSnap(s));
    this.agent.on('room', (r) => this.onRoom(r));
    this.agent.on('nack', (n) => {
      this.lastNack = { ...n, at: Date.now() };
    });
    this.agent.on('error', (e) => {
      this.lastError = { ...e, at: Date.now() };
      if (e.code === 'auth') this.push(0, `Server refused the agent: ${e.msg}`, true);
    });
    this.agent.on('list', (rooms) => {
      this.rooms = rooms;
    });
    this.agent.on('left', ({ reason }) => {
      this.brain = null;
      this.push(0, reason ? `You were removed from the room: ${reason}` : 'You left the room.', true);
    });
  }

  // ---------------------------------------------------------------------------
  // Event plumbing

  private push(t: number, text: string, urgent: boolean): void {
    this.events.push({ t, text, urgent });
    if (this.events.length > 40) this.events.splice(0, this.events.length - 40);
    if (urgent) for (const w of [...this.waiters]) w();
  }

  /** Resolve when an urgent event is queued (or after `ms`). */
  waitForTurn(ms: number): Promise<void> {
    this.lastControlAt = Date.now();
    if (this.events.some((e) => e.urgent)) return Promise.resolve();
    return new Promise((res) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        res();
      };
      const timer = setTimeout(done, ms);
      this.waiters.add(done);
    });
  }

  /** Take the queued events (oldest first). */
  drain(): PilotEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get snap(): Snapshot | null {
    return this.agent.snap;
  }

  get room(): RoomInfo | null {
    return this.agent.room;
  }

  private get settings(): Settings | null {
    return this.agent.room?.settings ?? null;
  }

  private nameOf(id: string | null | undefined): string {
    if (!id) return 'someone';
    if (id === this.agent.pid) return 'you';
    return this.agent.snap?.players.find((p) => p.id === id)?.name ?? this.agent.room?.players.find((p) => p.id === id)?.name ?? 'someone';
  }

  private roomName(p: Vec2 | undefined | null): string {
    if (!p || !this.map) return '';
    const id = roomAt(this.map, p);
    return id ? (this.map.roomById.get(id)?.name ?? '') : 'a hallway';
  }

  // ---------------------------------------------------------------------------
  // Network → autopilot

  private onRoom(r: RoomInfo): void {
    if (r.stage !== this.lastRoomStage) {
      if (r.stage === 'countdown') this.push(r.now, 'The match is about to start.', false);
      if (r.stage === 'lobby' && this.lastRoomStage && this.lastRoomStage !== 'lobby') {
        this.brain = null;
        this.push(r.now, 'Back in the waiting room.', r.hostId === this.agent.pid);
      }
      this.lastRoomStage = r.stage;
    }
  }

  private newMatch(s: Snapshot): void {
    const settings = this.settings;
    this.map = getMap(s.map);
    this.brain = new BotBrain(this.agent.pid, Math.floor(Math.random() * 1e9), this.skill);
    this.brain.persona = BOT_LOOKS[this.agentId]?.persona ?? 'friendly berry';
    this.brain.controlled = this.meetingControl;
    this.brain.autoKill = this.autoKill;
    this.seenEv.clear();
    this.seenBodies.clear();
    this.meetingLines = [];
    this.pending = null;
    this.wasAlive = true;
    this.knifeWasReady = false;
    this.lastStage = '';
    const role = ROLES[s.you.role];
    const mates = s.stats.murderers?.teammates.filter((m) => m.id !== this.agent.pid).map((m) => this.nameOf(m.id)) ?? [];
    this.push(
      s.t,
      `MATCH STARTED on ${this.map.def.name} (${MODES[s.mode].name}${settings ? `, ${settings.durationMin ? `${settings.durationMin} min` : 'no timer'}` : ''}). You are ${role.name.toUpperCase()} (${role.team}).${mates.length ? ` Your teammates: ${mates.join(', ')}.` : ''}\nPlaybook: ${roleGuide(s.you.role)}`,
      true,
    );
  }

  private onSnap(s: Snapshot): void {
    const settings = this.settings;
    if (!settings) return;
    if (!this.brain || (s.phase === 'intro' && this.lastPhase !== 'intro') || s.t < this.lastT - 2) this.newMatch(s);
    const brain = this.brain!;
    const dt = this.lastT < 0 ? 0.05 : Math.min(0.25, Math.max(0, s.t - this.lastT));
    this.lastT = s.t;
    this.observe(s);
    // A controller that went quiet for two minutes hands meetings back to the autopilot.
    brain.controlled = this.meetingControl && Date.now() - this.lastControlAt < 120_000;
    let acts: Action[] = [];
    try {
      acts = brain.update(s, this.map!, settings, dt);
    } catch {
      acts = [];
    }
    for (const a of acts) this.agent.act(a);
    if (brain.directiveNote) {
      this.push(s.t, `Order finished: ${brain.directiveNote}.`, true);
      brain.directiveNote = null;
    }
    this.runPending(s);
    this.lastPhase = s.phase;
  }

  /** Turn what this seat saw into short event lines. */
  private observe(s: Snapshot): void {
    const you = s.you;
    // Phase changes.
    if (s.phase === 'meeting' && s.meeting) {
      const stage = `${s.meeting.callerId}|${s.meeting.stage}`;
      if (this.lastPhase !== 'meeting') {
        this.meetingLines = [];
        const why = s.meeting.victimId ? `${this.nameOf(s.meeting.callerId)} reported ${this.nameOf(s.meeting.victimId)}'s body` : `${this.nameOf(s.meeting.callerId)} called an emergency meeting`;
        this.push(s.t, `MEETING: ${why}. Discuss, then vote.`, you.alive);
      } else if (stage !== this.lastStage && s.meeting.stage === 'vote' && you.alive && !s.meeting.myVote) this.push(s.t, `VOTING is open (${Math.round(s.meeting.stageEnds - s.t)}s).`, true);
      this.lastStage = stage;
    }
    if (s.phase === 'eject' && this.lastPhase !== 'eject' && s.eject) {
      const e = s.eject;
      const who = e.ejectedId ? `${this.nameOf(e.ejectedId)} was ejected${e.role ? ` (they were ${ROLES[e.role].name})` : ''}` : e.tie ? 'Tie vote: nobody was ejected' : 'Skipped: nobody was ejected';
      this.push(s.t, who + '.', false);
    }
    if (s.phase === 'ended' && this.lastPhase !== 'ended' && s.result) {
      const r = s.result;
      const won = r.winners.includes(this.agent.pid);
      const roles = Object.entries(r.roles)
        .map(([id, role]) => `${this.nameOf(id)}=${ROLES[role].name}`)
        .join(', ');
      this.push(s.t, `GAME OVER: ${r.winningTeam === 'draw' ? 'draw' : `${r.winningTeam} win`} (${r.reason}). You ${won ? 'WON' : 'lost'}. Roles: ${roles}.`, true);
    }
    // Chat (meetings, ghosts, nearby talk).
    for (const c of s.chat) {
      if (c.from === this.agent.pid) continue;
      const line = c.from === 'system' ? c.text : `${this.nameOf(c.from)}${c.ghost ? ' (ghost)' : ''}: ${c.text}`;
      if (s.phase === 'meeting') {
        this.meetingLines.push(line);
        if (this.meetingLines.length > 30) this.meetingLines.shift();
      }
      const me = this.nameOf(this.agent.pid) === 'you' ? (s.players.find((p) => p.id === this.agent.pid)?.name ?? '') : '';
      const aboutMe = !!me && c.text.toLowerCase().includes(me.toLowerCase());
      this.push(s.t, `Chat ${line}`, s.phase === 'meeting' && aboutMe && you.alive);
    }
    if (s.phase !== 'play') return;
    // Death.
    if (this.wasAlive && !you.alive) this.push(s.t, 'You were killed. You are a ghost now: you can finish tasks (crew) but cannot talk to the living or vote. Use long waits.', true);
    this.wasAlive = you.alive;
    // Bodies.
    for (const b of s.bodies) {
      if (this.seenBodies.has(b.id)) continue;
      this.seenBodies.add(b.id);
      this.push(s.t, `You see ${this.nameOf(b.playerId)}'s body in ${this.roomName(b.pos)}.`, false);
    }
    // Witnessed events.
    for (const ev of s.events) {
      const key = `${ev.t}|${ev.type}|${ev.actor ?? ''}|${ev.target ?? ''}`;
      if (this.seenEv.has(key)) continue;
      this.seenEv.add(key);
      const where = ev.pos ? ` in ${this.roomName(ev.pos)}` : '';
      switch (ev.type) {
        case 'kill':
          if (ev.actor === this.agent.pid) this.push(ev.t, `You took out ${this.nameOf(ev.target)}${where}.`, false);
          else if (ev.target !== this.agent.pid) this.push(ev.t, `You SAW ${this.nameOf(ev.actor)} kill ${this.nameOf(ev.target)}${where}!`, you.hasGun);
          break;
        case 'vent':
          if (ev.actor !== this.agent.pid) this.push(ev.t, `You saw ${this.nameOf(ev.actor)} use a vent${where}.`, false);
          break;
        case 'sabotage':
          this.push(ev.t, `Sabotage: ${String(ev.data?.kind ?? 'unknown')}${ev.data?.kind === 'meltdown' || ev.data?.kind === 'pressure' ? ' (CRITICAL, fix both stations!)' : ''}.`, false);
          break;
        case 'fixed':
          this.push(ev.t, 'Sabotage fixed.', false);
          break;
        case 'shot':
        case 'misfire':
          this.push(ev.t, `${this.nameOf(ev.actor)} fired at ${this.nameOf(ev.target)}${ev.type === 'misfire' ? ' and missed the mark (misfire)' : ''}.`, false);
          break;
        case 'shield.hit':
          this.push(ev.t, `${this.nameOf(ev.actor)} attacked a shielded player${where}!`, false);
          break;
        case 'inspect':
          if (ev.actor === this.agent.pid) this.push(ev.t, 'Body inspected: your clue is in the report.', false);
          break;
        default:
          break;
      }
    }
    // Knife ready (murderers): only wake the controller when it does the choosing.
    const knife = (you.role === 'murderer' || you.role === 'poisoner') && you.alive && you.killCd <= 0;
    if (knife && !this.knifeWasReady) this.push(s.t, 'Your knife is ready.', !this.autoKill);
    this.knifeWasReady = knife;
  }

  /** Actions waiting for the autopilot to walk into range (emergency, report, vent, console). */
  private runPending(s: Snapshot): void {
    const p = this.pending;
    if (!p || !this.map) return;
    if (s.phase !== 'play' || !s.you.alive || s.t > p.until) {
      if (s.phase === 'play' && s.t > p.until) this.push(s.t, `Gave up on ${p.kind}: couldn't get there in time.`, true);
      this.pending = null;
      return;
    }
    const me = s.you.pos;
    if (p.kind === 'emergency') {
      const st = this.map.def.stations.find((x) => x.kind === 'emergency');
      if (st && dist(st, me) <= INTERACT_RANGE * 0.95) {
        this.agent.act({ a: 'emergency' });
        this.pending = null;
      }
    } else if (p.kind === 'report') {
      const b = s.bodies.find((x) => x.id === p.arg) ?? s.bodies[0];
      if (b && dist(b.pos, me) <= REPORT_RANGE * 0.9) {
        this.agent.act({ a: 'report', body: b.id });
        this.pending = null;
      }
    } else if (p.kind === 'vent') {
      const v = this.map.def.vents.find((x) => x.id === p.arg);
      if (v && dist(v, me) <= VENT_RANGE * 0.95) {
        this.agent.act({ a: 'vent.enter', vent: v.id });
        this.pending = null;
      }
    } else if (p.kind === 'use') {
      const st = this.map.def.stations.find((x) => x.kind === p.arg);
      if (st && dist(st, me) <= INTERACT_RANGE * 0.95) {
        this.agent.act({ a: 'use', facility: p.arg as FacilityKind });
        this.brain?.setDirective({ kind: 'stay' }, s.t);
        this.pending = null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers for tools

  private stationPos(kind: string): Vec2 | null {
    if (!this.map) return null;
    const me = this.snap?.you.pos ?? { x: 0, y: 0 };
    let best: Vec2 | null = null;
    for (const st of this.map.def.stations) if (st.kind === kind && (!best || dist(st, me) < dist(best, me))) best = st;
    return best;
  }

  findPlayer(raw: string, opts: { alive?: boolean; others?: boolean } = {}): PublicPlayer | string {
    const s = this.snap;
    if (!s) return 'No match is running.';
    let list = s.players;
    if (opts.others) list = list.filter((p) => p.id !== this.agent.pid);
    if (opts.alive) list = list.filter((p) => p.alive);
    const m = matchName(list, raw);
    if (!m) return `No player called "${raw}". Players: ${list.map((p) => p.name).join(', ')}.`;
    if (Array.isArray(m)) return `"${raw}" could be ${m.map((p) => p.name).join(' or ')}. Be more specific.`;
    return m;
  }

  findPlace(raw: string): { pos: Vec2; label: string } | string {
    if (!this.map) return 'No match is running.';
    const q = raw.trim().toLowerCase();
    if (/(button|emergency|meeting|table)/.test(q)) {
      const st = this.stationPos('emergency');
      if (st) return { pos: st, label: this.map.roomById.get(this.map.def.meetingRoom)?.name ?? 'the meeting table' };
    }
    const m = matchName(this.map.def.rooms, raw);
    if (!m) return `No room called "${raw}". Rooms: ${this.map.def.rooms.map((r) => r.name).join(', ')}.`;
    if (Array.isArray(m)) return `"${raw}" could be ${m.map((r) => r.name).join(' or ')}.`;
    const [x, y, w, h] = rectsOf(m)[0]!;
    return { pos: nearestFree(this.map, { x: x + w / 2, y: y + h / 2 }), label: m.name };
  }

  /** Send an action and wait briefly for the server's verdict (a nack). */
  private async send(action: Action, ms = 350): Promise<Result> {
    const before = this.lastNack?.at ?? 0;
    this.agent.act(action);
    await new Promise((r) => setTimeout(r, ms));
    const n = this.lastNack;
    if (n && n.at > before && n.a === action.a) return fail(`Rejected (${n.reason}).`);
    return ok('Done.');
  }

  private order(d: Directive | null): void {
    this.brain?.setDirective(d, this.snap?.t ?? 0);
  }

  // ---------------------------------------------------------------------------
  // Tools

  async join(code: string | undefined, create: { mode?: ModeId; map?: MapId; bots?: number; maxPlayers?: number } | null): Promise<Result> {
    this.lastControlAt = Date.now();
    const before = Date.now();
    if (create) {
      const settings: Partial<Settings> = {};
      if (create.mode) settings.mode = create.mode;
      if (create.map) settings.map = create.map;
      if (create.bots !== undefined) settings.bots = Math.max(0, Math.min(19, Math.round(create.bots)));
      if (create.maxPlayers) settings.maxPlayers = create.maxPlayers;
      await this.agent.create(settings);
    } else if (code) {
      await this.agent.join(code);
    } else {
      const rooms = await this.listRooms();
      const open = rooms.find((r) => r.stage === 'lobby' && r.players < r.max);
      if (!open) return fail(`No open rooms to join${rooms.length ? ` (${rooms.map((r) => `${r.code} ${r.stage} ${r.players}/${r.max}`).join(', ')})` : ''}. Ask for a room code, or create one (create: true).`);
      await this.agent.join(open.code);
    }
    for (let i = 0; i < 40; i++) {
      if (this.lastError && this.lastError.at >= before) return fail(this.lastError.msg);
      if (this.agent.room && (create || !code || this.agent.room.code === code.toUpperCase().replace(/[^A-Z0-9]/g, ''))) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!this.agent.room) return fail('The server did not answer. Is it running (npm run start:server)?');
    return ok(this.lobbyReport());
  }

  /** Public / LAN rooms on the server. */
  async listRooms(): Promise<RoomListing[]> {
    this.rooms = null;
    await this.agent.list();
    for (let i = 0; i < 20; i++) {
      const got = this.rooms as RoomListing[] | null;
      if (got) return got;
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  }

  async start(patch: Partial<Settings>): Promise<Result> {
    this.lastControlAt = Date.now();
    const r = this.agent.room;
    if (!r) return fail('You are not in a room.');
    if (r.hostId !== this.agent.pid) return fail('Only the host can start the match.');
    if (Object.keys(patch).length) this.agent.settings(patch);
    await new Promise((res) => setTimeout(res, 150));
    const before = Date.now();
    this.agent.start();
    for (let i = 0; i < 15; i++) {
      await new Promise((res) => setTimeout(res, 100));
      if (this.lastError && this.lastError.at >= before) return fail(this.lastError.msg);
      if (this.agent.room?.stage === 'countdown' || this.agent.room?.stage === 'match') return ok('Starting! Call wait_for_turn.');
    }
    return ok('Start requested. Call wait_for_turn.');
  }

  go(args: { destination?: string; follow?: string; hold_seconds?: number; auto_kill?: boolean }): Result {
    this.lastControlAt = Date.now();
    const notes: string[] = [];
    if (args.auto_kill !== undefined) {
      this.autoKill = args.auto_kill;
      if (this.brain) this.brain.autoKill = args.auto_kill;
      notes.push(`auto_kill ${args.auto_kill ? 'on' : 'off'}`);
    }
    const s = this.snap;
    if (!args.destination && !args.follow) return notes.length ? ok(`OK: ${notes.join(', ')}.`) : fail('Say where: destination (room name, "tasks", "stay", "button") or follow (player).');
    if (!s || !this.brain || s.phase !== 'play') return fail('You can only move during play.');
    if (args.follow) {
      const p = this.findPlayer(args.follow, { others: true, alive: true });
      if (typeof p === 'string') return fail(p);
      this.order({ kind: 'follow', target: p.id, label: p.name });
      return ok(`Following ${p.name}.${notes.length ? ` (${notes.join(', ')})` : ''}`);
    }
    const dest = args.destination!.trim().toLowerCase();
    if (dest === 'tasks' || dest === 'auto' || dest === 'autopilot') {
      this.order(null);
      return ok('Autopilot: doing your tasks and reacting on its own.');
    }
    if (dest === 'stay' || dest === 'stop' || dest === 'here') {
      this.order({ kind: 'stay' });
      return ok('Staying put. Use go "tasks" to resume.');
    }
    const place = this.findPlace(args.destination!);
    if (typeof place === 'string') return fail(place);
    this.order({ kind: 'goto', pos: place.pos, label: place.label, hold: args.hold_seconds });
    return ok(`Heading to ${place.label}${args.hold_seconds ? `, then waiting ${args.hold_seconds}s` : ''}. Autopilot resumes after.`);
  }

  async act(args: { action: string; target?: string; kind?: string; room?: string }): Promise<Result> {
    this.lastControlAt = Date.now();
    const s = this.snap;
    const action = args.action.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!s || !this.map) return fail('No match is running.');
    const you = s.you;
    const map = this.map;
    const settings = this.settings!;
    const inPlay = s.phase === 'play';
    const needPlay = () => (!inPlay ? fail('Only during play.') : !you.alive && !['ping', 'emote'].includes(action) ? fail('Ghosts can only do tasks.') : null);
    const target = (o: { others?: boolean; alive?: boolean } = { others: true, alive: true }) => (args.target ? this.findPlayer(args.target, o) : 'Name a target player.');
    switch (action) {
      case 'kill':
      case 'poison':
      case 'shoot': {
        const bad = needPlay();
        if (bad) return bad;
        const p = target();
        if (typeof p === 'string') return fail(p);
        const killer = you.role === 'murderer' || you.role === 'poisoner';
        if (killer && ROLES[p.role ?? 'crewmate']?.team === 'murderers' && p.role) return fail(`${p.name} is your teammate.`);
        if (killer) {
          const range = KILL_RANGE[settings.killDistance];
          if (p.pos && dist(p.pos, you.pos) <= range && you.killCd <= 0) {
            const r = await this.send(you.role === 'poisoner' ? { a: 'poison', target: p.id } : { a: 'kill', target: p.id });
            if (r.ok) this.order(null);
            return r.ok ? ok(`You struck ${p.name}. Get away from the body.`) : r;
          }
          this.order({ kind: 'hunt', target: p.id, label: p.name });
          return ok(`Hunting ${p.name}: you'll strike when you're alone with them${you.killCd > 0 ? ` (knife ready in ${Math.ceil(you.killCd)}s)` : ''}.`);
        }
        if (you.hasGun) {
          if (p.pos && dist(p.pos, you.pos) <= GUN_RANGE && you.gunCd <= 0) return this.send({ a: 'shoot', target: p.id });
          this.order({ kind: 'hunt', target: p.id, label: p.name });
          return ok(`Closing in on ${p.name}; you'll fire when in range${you.gunCd > 0 ? ` (gun ready in ${Math.ceil(you.gunCd)}s)` : ''}.`);
        }
        return fail(`Your role (${ROLES[you.role].name}) can't attack.`);
      }
      case 'report': {
        const bad = needPlay();
        if (bad) return bad;
        const b = [...s.bodies].sort((a, c) => dist(a.pos, you.pos) - dist(c.pos, you.pos))[0];
        if (!b) return fail('No body in sight.');
        if (dist(b.pos, you.pos) <= REPORT_RANGE * 0.9) return this.send({ a: 'report', body: b.id });
        this.pending = { kind: 'report', until: s.t + 25, arg: b.id };
        this.order({ kind: 'goto', pos: b.pos, label: `${this.nameOf(b.playerId)}'s body`, hold: 2 });
        return ok("Walking to the body; you'll report it on arrival.");
      }
      case 'emergency': {
        const bad = needPlay();
        if (bad) return bad;
        if (you.emergencyLeft <= 0) return fail('You have no emergency meetings left.');
        const st = this.stationPos('emergency');
        if (!st) return fail('This map has no button.');
        if (dist(st, you.pos) <= INTERACT_RANGE * 0.95) return this.send({ a: 'emergency' });
        this.pending = { kind: 'emergency', until: s.t + 60 };
        this.order({ kind: 'goto', pos: st, label: 'the emergency button', hold: 3 });
        return ok("Heading to the emergency button; you'll press it on arrival.");
      }
      case 'sabotage': {
        const bad = needPlay();
        if (bad) return bad;
        const kind = (args.kind ?? args.target ?? '').toLowerCase() as SabotageId;
        if (!['lights', 'comms', 'doors', 'meltdown', 'pressure'].includes(kind)) return fail('kind must be lights, comms, doors, meltdown or pressure.');
        if (kind === 'doors') {
          const place = this.findPlace(args.room ?? '');
          if (typeof place === 'string') return fail(`Which room's doors? ${place}`);
          const room = roomAt(map, place.pos);
          if (!room || !map.def.doors.some((d) => d.room === room)) return fail(`${place.label} has no doors. Rooms with doors: ${[...new Set(map.def.doors.map((d) => map.roomById.get(d.room)?.name))].join(', ')}.`);
          return this.send({ a: 'sabotage', kind, room });
        }
        return this.send({ a: 'sabotage', kind });
      }
      case 'vent': {
        const bad = needPlay();
        if (bad) return bad;
        if (you.inVent) {
          const v = map.ventById.get(you.inVent);
          if (!args.target && !args.room) return this.send({ a: 'vent.exit' });
          const place = this.findPlace(args.room ?? args.target ?? '');
          if (typeof place === 'string' || !v) return fail(typeof place === 'string' ? place : 'Vent not found.');
          const to = v.links.map((id) => map.ventById.get(id)!).sort((a, b) => dist(a, place.pos) - dist(b, place.pos))[0];
          return to ? this.send({ a: 'vent.move', vent: to.id }) : fail('No linked vent.');
        }
        const v = [...map.def.vents].sort((a, b) => dist(a, you.pos) - dist(b, you.pos))[0];
        if (!v) return fail('No vents on this map.');
        if (dist(v, you.pos) <= VENT_RANGE * 0.95) {
          const r = await this.send({ a: 'vent.enter', vent: v.id });
          const dest = args.room ?? args.target;
          if (r.ok && dest) {
            const place = this.findPlace(dest);
            if (typeof place !== 'string') {
              const to = v.links.map((id) => map.ventById.get(id)!).sort((a, b) => dist(a, place.pos) - dist(b, place.pos))[0];
              if (to) this.agent.act({ a: 'vent.move', vent: to.id });
            }
          }
          return r;
        }
        this.pending = { kind: 'vent', until: s.t + 30, arg: v.id };
        this.order({ kind: 'goto', pos: v, label: `the vent in ${this.roomName(v)}`, hold: 2 });
        return ok(`Walking to the vent in ${this.roomName(v)}.`);
      }
      case 'shield':
      case 'track': {
        const bad = needPlay();
        if (bad) return bad;
        const p = target();
        if (typeof p === 'string') return fail(p);
        return this.send({ a: action, target: p.id });
      }
      case 'inspect': {
        const bad = needPlay();
        if (bad) return bad;
        const b = [...s.bodies].sort((a, c) => dist(a.pos, you.pos) - dist(c.pos, you.pos))[0];
        if (!b) return fail('No body in sight.');
        return this.send({ a: 'inspect', body: b.id });
      }
      case 'admin':
      case 'cams':
      case 'vitals':
      case 'doorlog': {
        const bad = needPlay();
        if (bad) return bad;
        if (action === 'vitals' && you.role === 'medic') return this.send({ a: 'vitals' });
        const st = this.stationPos(action);
        if (!st) return fail(`This map has no ${action} console.`);
        if (dist(st, you.pos) <= INTERACT_RANGE * 0.95) {
          const r = await this.send({ a: 'use', facility: action as FacilityKind });
          if (r.ok) this.order({ kind: 'stay' });
          return r.ok ? ok('Watching the console (see the report). Use go "tasks" to leave.') : r;
        }
        this.pending = { kind: 'use', until: s.t + 45, arg: action };
        this.order({ kind: 'goto', pos: st, label: `the ${action} console`, hold: 2 });
        return ok(`Walking to the ${action} console.`);
      }
      case 'camera':
      case 'blackout':
      case 'remotefix':
      case 'remote_fix':
      case 'mayor_reveal':
      case 'gun_pickup': {
        const a = action === 'remote_fix' ? 'remotefix' : action === 'mayor_reveal' ? 'mayor.reveal' : action === 'gun_pickup' ? 'gun.pickup' : action;
        if (a === 'mayor.reveal' ? s.phase !== 'meeting' : !inPlay) return fail(a === 'mayor.reveal' ? 'Only in a meeting.' : 'Only during play.');
        return this.send({ a } as Action);
      }
      case 'flashlight_on':
      case 'flashlight_off':
        return this.send({ a: 'flashlight', on: action === 'flashlight_on' });
      case 'ping': {
        if (!inPlay) return fail('Only during play.');
        const p = args.target ? this.findPlayer(args.target, { others: true }) : null;
        if (typeof p === 'string') return fail(p);
        const at = p?.pos ?? you.pos;
        return this.send({ a: 'ping', x: at.x, y: at.y });
      }
      case 'emote':
        return this.send({ a: 'emote', id: (args.kind ?? args.target ?? 'wave').slice(0, 24) });
      default:
        return fail(`Unknown action "${args.action}".`);
    }
  }

  async say(text: string): Promise<Result> {
    this.lastControlAt = Date.now();
    const s = this.snap;
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!clean) return fail('Say something.');
    if (!s) {
      if (!this.agent.room) return fail('You are not in a room.');
      this.agent.act({ a: 'chat', text: clean });
      return ok('Said.');
    }
    const r = await this.send({ a: 'chat', text: clean });
    return r.ok ? ok('Said.') : r;
  }

  async vote(who: string): Promise<Result> {
    this.lastControlAt = Date.now();
    const s = this.snap;
    if (!s || s.phase !== 'meeting' || !s.meeting) return fail('There is no meeting.');
    if (!s.you.alive) return fail('Ghosts cannot vote.');
    if (s.meeting.myVote) return fail(`You already voted (${s.meeting.myVote === 'skip' ? 'skip' : this.nameOf(s.meeting.myVote)}).`);
    if (s.meeting.stage === 'reveal') return fail('Voting is over.');
    let targetId = 'skip';
    if (!/^skip$/i.test(who.trim())) {
      const p = this.findPlayer(who, { alive: true });
      if (typeof p === 'string') return fail(p);
      targetId = p.id;
    }
    const r = await this.send({ a: 'vote', target: targetId });
    return r.ok ? ok(`Voted ${targetId === 'skip' ? 'skip' : this.nameOf(targetId)}.`) : r;
  }

  /** Publish what the real agent is working on (throttled; the last update always lands). */
  setStatus(state: AgentState, title?: string, detail?: string): Result {
    const s = this.snap;
    const text = `${title ?? ''} ${detail ?? ''}`;
    if (s && s.phase !== 'ended' && ROLE_WORDS.test(text)) return fail('Your status is public to every player. Describe your real work, not anything about the game.');
    this.statusQueued = { state, title, detail };
    const wait = Math.max(0, this.statusSentAt + 600 - Date.now());
    if (!this.statusTimer) {
      this.statusTimer = setTimeout(() => {
        this.statusTimer = null;
        if (!this.statusQueued) return;
        void this.agent.status(this.statusQueued);
        this.statusQueued = null;
        this.statusSentAt = Date.now();
      }, wait);
    }
    return ok(`Status set: ${state}${title ? ` · ${title}` : ''}.`);
  }

  leave(): Result {
    this.lastControlAt = Date.now();
    if (!this.agent.room) return fail('You are not in a room.');
    this.agent.leaveRoom();
    this.brain = null;
    return ok('Left the room.');
  }

  close(): void {
    if (this.statusTimer) clearTimeout(this.statusTimer);
    for (const w of [...this.waiters]) w();
    try {
      this.agent.leave();
    } catch {
      /* already closed */
    }
  }

  // ---------------------------------------------------------------------------
  // Reports

  lobbyReport(): string {
    const r = this.agent.room;
    if (!r) return 'Not in a room. Use join_game (code, or create: true).';
    const host = r.players.find((p) => p.id === r.hostId)?.name ?? '—';
    const you = r.hostId === this.agent.pid ? ' You are the HOST: call start_game when ready.' : ' Wait for the host to start (call wait_for_turn).';
    const val = r.validation.ok ? '' : ` Can't start yet: ${r.validation.errors[0] ?? ''}`;
    return `ROOM ${r.code} (${r.stage}) · ${MODES[r.settings.mode].name} on ${getMap(r.settings.map).def.name} · ${r.players.length}/${r.settings.maxPlayers} players: ${r.players.map((p) => p.name).join(', ')} · host ${host}.${you}${val}`;
  }

  /** The situation report: everything this seat knows that matters for a decision, in a few lines. */
  report(): string {
    const s = this.snap;
    const r = this.agent.room;
    if (!r) return 'Not in a room. Use join_game.';
    if (!s || r.stage === 'lobby' || r.stage === 'countdown') return this.lobbyReport();
    const map = this.map ?? getMap(s.map);
    const you = s.you;
    const role = ROLES[you.role];
    const lines: string[] = [];
    const where = you.inVent ? 'inside a vent' : `in ${this.roomName(you.pos)}`;
    const head = `[${clock(s.t)}] ${s.phase.toUpperCase()} · ${MODES[s.mode].name} · ${map.def.name} · You are ${role.name.toUpperCase()} (${role.team}) · ${you.alive ? 'alive' : 'GHOST'} · ${where}`;
    lines.push(head);
    if (s.phase === 'meeting' && s.meeting) {
      const m = s.meeting;
      const alive = s.players.filter((p) => p.alive);
      lines.push(`Meeting ${m.stage} (${Math.max(0, Math.round(m.stageEnds - s.t))}s left). Called by ${this.nameOf(m.callerId)}${m.victimId ? `, body: ${this.nameOf(m.victimId)}` : ' (emergency)'}.`);
      lines.push(`Alive: ${alive.map((p) => p.name + (p.id === this.agent.pid ? ' (you)' : '')).join(', ')}.`);
      if (m.voted.length) lines.push(`Voted: ${m.voted.map((id) => this.nameOf(id)).join(', ')}.`);
      if (m.myVote) lines.push(`Your vote: ${m.myVote === 'skip' ? 'skip' : this.nameOf(m.myVote)}.`);
      if (m.tally) lines.push(`Tally: ${Object.entries(m.tally).map(([id, n]) => `${id === 'skip' ? 'skip' : this.nameOf(id)} ${n}`).join(', ')}.`);
      if (this.meetingLines.length) lines.push(`Chat:\n${this.meetingLines.slice(-14).map((l) => `  ${l}`).join('\n')}`);
    }
    if (you.team === 'murderers') {
      const mates = s.stats.murderers?.teammates.filter((m) => m.id !== this.agent.pid) ?? [];
      if (mates.length) lines.push(`Teammates: ${mates.map((m) => `${this.nameOf(m.id)}${m.alive ? '' : ' (dead)'}`).join(', ')}.`);
      const mm = s.stats.murderers;
      if (mm) lines.push(`Crew alive ${mm.crewAlive}, your team ${mm.murderersAlive}, kills to win ${mm.killsToWin}. ${you.role === 'accomplice' ? '' : `Knife ${you.killCd <= 0 ? 'READY' : `in ${Math.ceil(you.killCd)}s`}`}${mm.sabotagesReady.length ? ` · sabotage ready: ${mm.sabotagesReady.join(', ')}` : ''} · auto_kill ${this.autoKill ? 'on' : 'off'}.`);
    }
    if (s.stats.taskBar !== null) lines.push(`Crew task bar ${Math.round((s.stats.taskBar ?? 0) * 100)}%${s.stats.timeLeft !== null ? ` · time left ${clock(s.stats.timeLeft)}` : ''}.`);
    if (s.stats.crew && you.team === 'crew') {
      const next = you.tasks.find((t) => !t.done);
      const st = next ? map.stationById.get(next.stations[next.step] ?? '') : null;
      lines.push(`Your tasks ${s.stats.crew.myDone}/${s.stats.crew.myTotal}${next ? ` (next: ${TASK_BY_ID[next.taskId]?.name ?? next.taskId}${st ? ` in ${this.roomName(st)}` : ''})` : ''} · emergency meetings left ${you.emergencyLeft}.`);
    }
    if (s.stats.neutral) lines.push(`Goal: ${s.stats.neutral.goal} (${s.stats.neutral.status}).`);
    if (s.hns) lines.push(`Hide & Seek: ${s.stats.hns ? `${s.stats.hns.hidersLeft} hiders left, danger ${Math.round(s.stats.hns.danger * 100)}%` : ''}${s.hns.final ? ' · FINAL COUNTDOWN' : ''}.`);
    if (you.hasGun) lines.push(`You carry the gun${you.gunCd > 0 ? ` (ready in ${Math.ceil(you.gunCd)}s)` : ' (READY)'}.`);
    if (MODES[s.mode].flashlights && you.team !== 'murderers') lines.push(`Flashlight ${you.flashlightOn ? 'on' : 'off'}, battery ${Math.round(you.battery * 100)}%${you.dread > 0.3 ? ' · something is lurking close!' : ''}.`);
    if (you.shieldTarget) lines.push(`Shielding ${this.nameOf(you.shieldTarget)}.`);
    if (you.trackTarget) lines.push(`Tracking ${this.nameOf(you.trackTarget)}${you.trackPos ? ` (in ${this.roomName(you.trackPos)})` : ''}.`);
    for (const c of you.clues) lines.push(`Clue: the killer is ${c.hintKind === 'berry' ? 'a' : 'in the'} ${c.killerHint} ${c.hintKind === 'berry' ? 'berry' : 'colour family'}.`);
    if (s.sabotage.active) lines.push(`SABOTAGE active: ${s.sabotage.active}${s.sabotage.timer > 0 && (s.sabotage.active === 'meltdown' || s.sabotage.active === 'pressure') ? ` (${Math.ceil(s.sabotage.timer)}s!)` : ''}.`);
    if (s.phase === 'play' && you.alive) {
      const seen = s.players.filter((p) => p.id !== this.agent.pid && p.pos && p.alive && !p.ghost && dist(p.pos, you.pos) < 16);
      const killRange = KILL_RANGE[this.settings?.killDistance ?? 'medium'];
      const fmt = (p: PublicPlayer) => `${p.name}${p.role && p.role !== 'crewmate' ? ` [${ROLES[p.role].name}]` : ''} ${dist(p.pos!, you.pos).toFixed(1)}m${dist(p.pos!, you.pos) <= killRange ? ' (in reach)' : ''}`;
      lines.push(seen.length ? `In view: ${seen.map(fmt).join(', ')}.` : 'Nobody in view.');
      if (s.bodies.length) lines.push(`Bodies in view: ${s.bodies.map((b) => `${this.nameOf(b.playerId)} (${dist(b.pos, you.pos).toFixed(1)}m)`).join(', ')}.`);
      if (s.security?.admin) lines.push(`Admin map: ${s.security.admin.filter((a) => a.count).map((a) => `${a.name} ${a.count}`).join(', ')}.`);
      if (s.security?.vitals) lines.push(`Vitals: dead ${s.security.vitals.filter((v) => !v.alive).map((v) => this.nameOf(v.id)).join(', ') || 'none'}.`);
      if (s.security?.doorlog) lines.push(`Door log: ${s.security.doorlog.slice(-8).map((d) => `${this.nameOf(d.playerId)}@${d.sensor}`).join(', ')}.`);
      const d = this.brain?.directive;
      const order = !d ? 'autopilot (tasks)' : d.kind === 'stay' ? 'staying put' : d.kind === 'goto' ? `going to ${d.label}` : `${d.kind === 'hunt' ? 'hunting' : 'following'} ${d.label}`;
      lines.push(`You are: ${order}${this.pending ? ` · then ${this.pending.kind}` : ''}.`);
    }
    if (this.brain && s.phase !== 'ended') {
      const ev = this.brain
        .evidence(s)
        .filter((e) => e.score >= 1 || e.sawKill)
        .slice(0, 4);
      if (ev.length) lines.push(`Your read (from what you saw/heard): ${ev.map((e) => `${this.nameOf(e.id)} ${e.score} (${e.sawKill ? 'SAW THEM KILL; ' : ''}${e.reasons.join(', ')})`).join('; ')}.`);
      if (s.phase === 'meeting' && you.alive && this.settings) {
        const v = this.brain.suggestVote(s, this.settings);
        lines.push(`Autopilot would vote: ${v === 'skip' ? 'skip' : this.nameOf(v)}.`);
      }
    }
    lines.push(this.hint(s));
    return lines.join('\n');
  }

  private hint(s: Snapshot): string {
    const you = s.you;
    if (s.phase === 'ended') return 'Next: wait_for_turn (the host can start another match), or leave_game.';
    if (s.phase === 'intro' || s.phase === 'eject') return 'Next: wait_for_turn.';
    if (s.phase === 'meeting') {
      if (!you.alive) return 'Next: wait_for_turn (ghosts sit this out).';
      if (s.meeting?.stage === 'discuss') return 'Next: say 1-2 short lines (alibi, what you saw, questions), then wait_for_turn for voting.';
      if (s.meeting?.stage === 'vote' && !s.meeting.myVote) return 'Next: vote (a name or "skip"); you may say one more line.';
      return 'Next: wait_for_turn.';
    }
    if (!you.alive) return 'Next: wait_for_turn with a long max_wait (the autopilot finishes your tasks as a ghost).';
    if (you.team === 'murderers') return 'Next: let auto_kill pick safe moments, or act kill <name> / sabotage / vent; then wait_for_turn.';
    return 'Next: usually just wait_for_turn (autopilot does tasks and reports bodies). Use go / act emergency when you have a reason.';
  }
}
