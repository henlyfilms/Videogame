/**
 * Built-in AI brain for filling seats with Marion agents. Bots only see the
 * same per-player Snapshot a human in that seat would receive — no peeking.
 *
 * Layers: a deterministic heuristic brain (navigation, tasks, kills,
 * reporting, sabotage/fixes, sheriff judgement, flashlight, Hide & Seek,
 * suspicion from what was actually witnessed) + an optional async chat
 * provider (LLM) for meeting lines in each bot's personality.
 */
import { dist, distanceField, findPath, INTERACT_RANGE, type CompiledMap } from '../core/map';
import type { Action } from '../core/match';
import { colorFamily, GUN_RANGE, REPORT_RANGE, VENT_RANGE } from '../core/match';
import type { PublicPlayer, Snapshot } from '../core/project';
import { QUICK_CHAT } from '../core/quickchat';
import { Rng } from '../core/rng';
import { maxMurderers } from '../core/roles';
import { BASE_SPEED, KILL_RANGE, type BotDifficulty, type Settings } from '../core/settings';
import { TASK_BY_ID } from '../core/tasks';
import type { Vec2 } from '../core/types';

export interface ChatContext {
  botId: string;
  botName: string;
  persona: string;
  role: string;
  team: string;
  alive: { id: string; name: string }[];
  victim: string | null;
  caller: string | null;
  suspicions: { name: string; score: number; reasons: string[] }[];
  recentChat: { from: string; text: string }[];
}

/** Async meeting-line provider (e.g. an LLM). Must resolve fast or null. */
export type ChatProvider = (ctx: ChatContext) => Promise<string | null>;

interface Sus {
  score: number;
  /** The first-hand part of `score` (what this bot saw itself, not meeting hearsay). */
  own: number;
  reasons: string[];
}

const DIFF: Record<BotDifficulty, { reaction: number; killBold: number; reportChance: number; aim: number; taskSlack: number }> = {
  easy: { reaction: 1.4, killBold: 0.35, reportChance: 0.55, aim: 0.6, taskSlack: 2.5 },
  normal: { reaction: 0.8, killBold: 0.6, reportChance: 0.85, aim: 0.85, taskSlack: 1.2 },
  sharp: { reaction: 0.4, killBold: 0.85, reportChance: 1, aim: 1, taskSlack: 0.5 },
};

const MURDER_TEAM = new Set(['murderer', 'poisoner', 'accomplice']);

export class BotBrain {
  readonly id: string;
  private rng: Rng;
  private path: Vec2[] = [];
  private goal: Vec2 | null = null;
  private pendingPing: Vec2 | null = null;
  private goalKind: 'task' | 'wander' | 'body' | 'fix' | 'flee' | 'hunt' | 'recharge' | 'emergency' | 'vent' | 'investigate' | null = null;
  private goalStation: string | null = null;
  private taskOpenedAt = -1;
  private taskDuration = 0;
  private seq = 1;
  private pos: Vec2 = { x: 0, y: 0 };
  private facing = 0;
  /** Flashlight sweep phase (Lights Out). */
  private sweep = 0;
  private think = 0;
  private sus = new Map<string, Sus>();
  private knownKillers = new Set<string>();
  private lastSeen = new Map<string, { pos: Vec2; t: number }>();
  private stuck = 0;
  /** Re-plan timer for a goal whose route was empty (e.g. doors were shut). */
  private replanAt = 0;
  private noRouteSince = -1;
  private lastPos: Vec2 = { x: 0, y: 0 };
  private meetingSaid = 0;
  private voteAt = -1;
  private chatPending = false;
  private lastMeetingT = -1;
  private seenEvents = new Set<string>();
  private fixStartedAt = -1;
  private reactAt = 0;
  private pendingReport: string | null = null;
  /** (body, player) pairs already counted as "near the body". */
  private nearBody = new Set<string>();
  private cluesRead = new Set<string>();
  private dreadAt = new Map<string, number>();
  private darkAt = new Map<string, number>();
  private ejectedKillers = new Set<string>();
  private ownAtMeeting = new Map<string, number>();
  private lookAt: { pos: Vec2; until: number } | null = null;
  private seekerSeen: { pos: Vec2; t: number } | null = null;
  private preySeen: { pos: Vec2; t: number } | null = null;
  private fleeAfter = 0;
  private trail = new Map<string, { x: number; y: number; t: number }[]>();
  private bodySeen = new Map<string, { pos: Vec2; t: number }>();
  /** When the current round of play started (sightings before it are stale). */
  private playSince = 0;
  private lastPhase = '';
  /** Sabotage response: whether this bot answers the current lights/comms call. */
  private sabSeen: string | null = null;
  private sabGo = false;
  private sabRollAt = 0;
  private holdProg = 0;
  private holdSince = 0;
  /** Task list remembered from before comms went down (the HUD hides it, a player would remember). */
  private taskMemory: Snapshot['you']['tasks'] = [];
  /** Stations where this murderer already faked a task (so it moves on instead of looping). */
  private faked = new Map<string, number>();
  persona = 'friendly berry';
  chatProvider: ChatProvider | null = null;

  constructor(
    id: string,
    seed: number,
    private diff: BotDifficulty = 'normal',
  ) {
    this.id = id;
    this.rng = new Rng(seed);
  }

  /** Called every server tick with the bot's own (fair) snapshot. */
  update(snap: Snapshot, map: CompiledMap, settings: Settings, dt: number): Action[] {
    const out: Action[] = [];
    const you = snap.you;
    if (snap.phase !== 'meeting') this.meetingEvaluated = false;
    if (snap.phase === 'play' && this.lastPhase !== 'play') {
      this.playSince = snap.t;
      // What was already aired at the table doesn't justify calling another meeting.
      this.ownAtMeeting = new Map([...this.sus].map(([id, s]) => [id, s.own]));
    }
    this.lastPhase = snap.phase;
    if (snap.eject?.ejectedId && snap.eject.team === 'murderers') this.ejectedKillers.add(snap.eject.ejectedId);
    if (snap.phase === 'meeting' || snap.phase === 'eject') {
      this.path = [];
      this.goal = null;
      this.pos = { ...you.pos };
      if (snap.phase === 'meeting') this.meeting(snap, settings, out);
      return out;
    }
    if (snap.phase !== 'play') {
      this.pos = { ...you.pos };
      return out;
    }
    if (you.corrected || dist(this.pos, you.pos) > 1.2) this.pos = { ...you.pos };
    if (you.tasks.length || snap.sabotage.active !== 'comms') this.taskMemory = you.tasks;
    this.observe(snap);
    // Point out what we just saw (a kill or a vent) to anyone nearby.
    if (this.pendingPing && you.alive && !you.inVent) out.push({ a: 'ping', x: this.pendingPing.x, y: this.pendingPing.y });
    this.pendingPing = null;
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.25 + this.rng.next() * 0.15;
      this.decide(snap, map, settings, out);
    }
    this.act(snap, map, settings, dt, out);
    return out;
  }

  /** Crew bots usually ping where they just saw a kill or a vent (the culprit if still in view). */
  private callOut(snap: Snapshot, actor: string, at?: Vec2): void {
    if (snap.you.team !== 'crew' || !snap.you.alive || this.rng.next() > 0.7) return;
    const spot = snap.players.find((x) => x.id === actor)?.pos ?? at;
    if (spot) this.pendingPing = { x: spot.x, y: spot.y };
  }

  // -------------------------------------------------------------------------
  private observe(snap: Snapshot): void {
    for (const p of snap.players) {
      if (p.id === this.id || !p.pos) continue;
      this.lastSeen.set(p.id, { pos: p.pos, t: snap.t });
      // A short trail of sightings (one per second, last 40 s) for "who was around there?".
      const h = this.trail.get(p.id) ?? [];
      if (!h.length || snap.t - h[h.length - 1]!.t >= 1) {
        h.push({ x: p.pos.x, y: p.pos.y, t: snap.t });
        while (h.length && snap.t - h[0]!.t > 40) h.shift();
        this.trail.set(p.id, h);
      }
    }
    for (const b of snap.bodies) if (!this.bodySeen.has(b.playerId)) this.bodySeen.set(b.playerId, { pos: { ...b.pos }, t: snap.t });
    // Lights Out: every crewmate carries a beam, so someone moving about without one stands out.
    if (snap.mode === 'lightsout' && snap.you.team === 'crew' && snap.you.alive && !snap.you.blackout && snap.t > this.playSince + 3) {
      for (const p of snap.players) {
        if (p.id === this.id || !p.pos || !p.alive || p.flashlight !== false) continue;
        if (snap.t - (this.darkAt.get(p.id) ?? -99) < 6) continue;
        this.darkAt.set(p.id, snap.t);
        this.bump(p.id, 0.8, 'had no light');
      }
    }
    for (const ev of snap.events) {
      const key = `${ev.t}|${ev.type}|${ev.actor ?? ''}|${ev.target ?? ''}`;
      if (this.seenEvents.has(key)) continue;
      this.seenEvents.add(key);
      if (this.seenEvents.size > 400) this.seenEvents.clear();
      if (ev.type === 'kill' && ev.actor && ev.actor !== this.id && ev.data?.weapon !== 'gun') {
        this.knownKillers.add(ev.actor);
        this.bump(ev.actor, 10, 'saw them kill');
        this.callOut(snap, ev.actor, ev.pos);
      }
      if (ev.type === 'vent' && ev.actor && ev.actor !== this.id) {
        const p = snap.players.find((x) => x.id === ev.actor);
        if (p?.role !== 'engineer') {
          this.bump(ev.actor, 6, 'vented');
          this.callOut(snap, ev.actor, ev.pos);
        }
      }
      if (ev.type === 'visual' && ev.actor) this.bump(ev.actor, -8, 'did a visual task');
      // Lights Out: the lights flicker where someone was just killed. Go and look.
      if (ev.type === 'flicker' && ev.pos && snap.you.alive && snap.you.team === 'crew') this.lookAt = { pos: { ...ev.pos }, until: snap.t + 15 };
      if (ev.type === 'shield.hit' && ev.actor && ev.actor !== this.id) {
        this.knownKillers.add(ev.actor);
        this.bump(ev.actor, 9, 'attacked a shielded player');
      }
    }
    // Players seen standing near a body are a little suspicious (counted once per body:
    // whoever finds and reports a body is usually innocent).
    for (const b of snap.bodies) {
      for (const p of snap.players) {
        if (!p.pos || p.id === this.id || p.id === b.playerId) continue;
        const key = `${b.id}|${p.id}`;
        if (dist(p.pos, b.pos) < 3 && !this.nearBody.has(key)) {
          this.nearBody.add(key);
          this.bump(p.id, 1, 'was near the body');
        }
      }
    }
    // Detective clues: weigh each clue once, split across everyone who matches it.
    for (const c of snap.you.clues) {
      if (this.cluesRead.has(c.bodyId)) continue;
      this.cluesRead.add(c.bodyId);
      const match = snap.players.filter((p) => p.id !== this.id && p.alive && (c.hintKind === 'berry' ? p.cosmetics.berry : colorFamily(p.cosmetics.color)) === c.killerHint);
      for (const p of match) this.bump(p.id, Math.min(4, 6 / match.length), `matches the ${c.killerHint} clue`);
    }
  }

  private bump(id: string, n: number, reason: string, firstHand = true): void {
    const s = this.sus.get(id) ?? { score: 0, own: 0, reasons: [] };
    s.score += n;
    if (firstHand) s.own += n;
    if (!s.reasons.includes(reason)) s.reasons.push(reason);
    this.sus.set(id, s);
  }

  private visibleOthers(snap: Snapshot): PublicPlayer[] {
    return snap.players.filter((p) => p.id !== this.id && p.pos && p.alive && !p.ghost);
  }

  private nearestStation(map: CompiledMap, kinds: string[]) {
    let best: { id: string; kind: string; x: number; y: number } | null = null;
    let bd = Infinity;
    for (const s of map.def.stations) {
      if (!kinds.includes(s.kind)) continue;
      const d = dist(s, this.pos);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private setGoal(map: CompiledMap, snap: Snapshot, to: Vec2, kind: BotBrain['goalKind'], station: string | null = null): void {
    if (this.goal && this.goalKind === kind && dist(this.goal, to) < 0.5 && this.path.length) return;
    const closed = new Set(snap.sabotage.closedDoors);
    const p = findPath(map, this.pos, to, closed, 20000);
    this.goal = to;
    this.goalKind = kind;
    this.goalStation = station;
    this.path = p ?? [];
    if (p && p.length) this.path[this.path.length - 1] = { ...to };
  }

  private decide(snap: Snapshot, map: CompiledMap, settings: Settings, out: Action[]): void {
    const you = snap.you;
    const d = DIFF[this.diff];
    if (!you.alive) {
      if (this.goalKind && this.goalKind !== 'task' && this.goalKind !== 'wander') {
        this.goal = null;
        this.goalKind = null;
        this.path = [];
      }
      // Ghost: finish tasks if allowed, otherwise drift.
      if (settings.ghostTasks && you.team === 'crew') this.pickTask(snap, map);
      else if (!this.goal) this.wander(snap, map);
      return;
    }
    if (you.inVent) {
      out.push({ a: 'vent.exit' });
      return;
    }
    const mode = snap.mode;
    // Flashlight management (a critical sabotage beats a low battery).
    const critical = snap.sabotage.active === 'meltdown' || snap.sabotage.active === 'pressure';
    if (mode === 'lightsout' && you.team !== 'murderers') {
      if (!you.flashlightOn && you.battery > 0.15) out.push({ a: 'flashlight', on: true });
      if (you.flashlightOn && you.battery < 0.06) out.push({ a: 'flashlight', on: false });
      if (!critical && you.battery < 0.2 && this.goalKind !== 'recharge' && this.goalKind !== 'fix') {
        const r = this.nearestStation(map, ['recharge']);
        if (r) this.setGoal(map, snap, r, 'recharge');
        return;
      }
      for (const b of snap.batteries) if (dist(b.pos, this.pos) < 1.4) out.push({ a: 'battery.pickup', id: b.id });
    }
    if (snap.gunDrop && you.team === 'crew' && !you.hasGun && dist(snap.gunDrop, this.pos) < 1.5) out.push({ a: 'gun.pickup' });

    if (mode === 'hideseek') return this.decideHns(snap, map, out);
    // Lights Out dread: something is close. Suspect whoever is nearby and run for company.
    if (you.dread > 0.2 && you.team !== 'murderers') {
      // The dread meter says how close the unseen killer is: only someone standing at
      // about that distance fits (often the killer is simply out of the light).
      // In a crowd (or at the table right after a meeting) it says nothing.
      const at = 5 * (1 - you.dread);
      const close = this.visibleOthers(snap).filter((p) => p.pos && dist(p.pos, you.pos) < 6.5);
      const fits = close.filter((p) => Math.abs(dist(p.pos!, you.pos) - at) < 0.5);
      const p = fits[0];
      if (p && you.dread > 0.35 && fits.length === 1 && close.length <= 2 && snap.t > this.playSince + 8 && snap.t - (this.dreadAt.get(p.id) ?? -99) >= 5) {
        this.dreadAt.set(p.id, snap.t);
        // Standing right where the dread says, with no beam of their own: that is the one.
        this.bump(p.id, p.flashlight === false ? 2.5 : 1, 'lurked near me in the dark');
      }
      if (this.goalKind !== 'flee' && this.goalKind !== 'fix') {
        // Run for company (someone carrying a beam) unless that means passing a figure lurking
        // without a light; else away from that figure; else for the nearest pool of light.
        const lurker = close.filter((o) => o.flashlight === false).sort((a, b) => dist(a.pos!, this.pos) - dist(b.pos!, this.pos))[0];
        const friend = this.visibleOthers(snap)
          .filter((o) => o.pos && o.flashlight && dist(o.pos, this.pos) > 2.5 && (this.sus.get(o.id)?.score ?? 0) < 3)
          .filter((o) => !lurker || dist(o.pos!, lurker.pos!) > dist(o.pos!, this.pos))
          .sort((a, b) => dist(a.pos!, this.pos) - dist(b.pos!, this.pos))[0];
        const to = friend?.pos ?? (lurker ? this.fleeTarget(map, lurker.pos!) : null) ?? this.nearestStation(map, ['recharge']) ?? this.nearestStation(map, ['emergency']);
        if (to) {
          this.setGoal(map, snap, to, 'flee');
          return;
        }
      }
    }
    if (you.team === 'murderers') return this.decideMurderer(snap, map, settings, out);
    return this.decideCrew(snap, map, settings, out, d);
  }

  private decideCrew(snap: Snapshot, map: CompiledMap, settings: Settings, out: Action[], d: (typeof DIFF)['normal']): void {
    const you = snap.you;
    // Sheriff / hero: shoot known killers in range.
    if (you.hasGun && you.gunCd <= 0) {
      for (const p of this.visibleOthers(snap)) {
        const known = this.knownKillers.has(p.id) || (this.sus.get(p.id)?.score ?? 0) >= 9;
        if (known && p.pos && dist(p.pos, this.pos) <= GUN_RANGE * 0.9 && this.rng.next() < d.aim) {
          out.push({ a: 'shoot', target: p.id });
          return;
        }
      }
    }
    // Medic shields the nearest player once per round.
    if (you.role === 'medic' && !you.shieldTarget) {
      const t = this.visibleOthers(snap).find((p) => p.pos && dist(p.pos, this.pos) < 2.5);
      if (t) out.push({ a: 'shield', target: t.id });
    }
    if (you.role === 'tracker' && you.abilityCd <= 0) {
      const top = [...this.sus.entries()].sort((a, b) => b[1].score - a[1].score)[0];
      const t = this.visibleOthers(snap).find((p) => p.pos && dist(p.pos, this.pos) < 2.8 && (!top || p.id === top[0]));
      if (t) out.push({ a: 'track', target: t.id });
    }
    if (you.role === 'lookout' && !you.portableCam && snap.t > 25 && this.rng.next() < 0.05) out.push({ a: 'camera' });
    // Bodies.
    const body = snap.bodies[0];
    if (body) {
      if (you.role === 'detective' && dist(body.pos, this.pos) < REPORT_RANGE && !you.clues.some((c) => c.bodyId === body.id)) {
        out.push({ a: 'inspect', body: body.id });
        return;
      }
      if (!this.pendingReport) {
        this.pendingReport = body.id;
        this.reactAt = snap.t + d.reaction * (0.6 + this.rng.next());
      }
      if (snap.t >= this.reactAt && this.rng.next() < d.reportChance + 0.1) {
        if (dist(body.pos, this.pos) <= REPORT_RANGE * 0.9) {
          out.push({ a: 'report', body: body.id });
          this.pendingReport = null;
          return;
        }
        this.setGoal(map, snap, body.pos, 'body');
        return;
      }
    } else this.pendingReport = null;
    // A witnessed kill, or strong new first-hand suspicion since the last meeting (seen venting,
    // lurking without a light...): call a meeting.
    const killerAtLarge = snap.players.some((p) => p.alive && this.knownKillers.has(p.id));
    const strong = this.topSuspect(snap, true);
    const fresh = strong ? strong.s.own - (this.ownAtMeeting.get(strong.id) ?? 0) : 0;
    const callIt = killerAtLarge || (fresh >= 4 && snap.t > this.playSince + 20);
    if (callIt && you.emergencyLeft > 0 && !you.hasGun && snap.sabotage.active !== 'meltdown' && snap.sabotage.active !== 'pressure') {
      const e = this.nearestStation(map, ['emergency']);
      if (e) {
        if (dist(e, this.pos) < INTERACT_RANGE * 1.2) {
          out.push({ a: 'emergency' });
          return;
        }
        this.setGoal(map, snap, e, 'emergency');
        return;
      }
    }
    // Sabotage response: whoever is close answers it, plus volunteers, while the rest keep
    // working. A critical countdown pulls in everyone who would otherwise be too late.
    const sab = snap.sabotage.active;
    const kinds = sab === 'lights' ? ['lightsPanel'] : sab === 'comms' ? ['commsPanel'] : sab === 'meltdown' ? ['meltdownA', 'meltdownB'] : sab === 'pressure' ? ['pressureA', 'pressureB'] : [];
    // Head for the nearest of the two critical stations; arriving at one that is already
    // held sends the bot on to the other (see act()).
    let fixAt = kinds.length ? this.nearestStation(map, kinds) : null;
    if (fixAt && kinds.length === 2) {
      const near = fixAt;
      const closer = this.visibleOthers(snap).some((p) => p.pos && !this.knownKillers.has(p.id) && p.role !== 'murderer' && dist(p.pos, near) < dist(this.pos, near) - 0.5);
      const other = this.nearestStation(map, kinds.filter((k) => k !== near.kind));
      if (closer && other) fixAt = other;
    }
    if (sab !== this.sabSeen || (sab && !this.sabGo && snap.t >= this.sabRollAt)) {
      const fresh = sab !== this.sabSeen;
      const crit = kinds.length === 2;
      this.sabGo = !!fixAt && ((fresh && dist(fixAt, this.pos) < (crit ? 30 : 22)) || this.rng.next() < (crit ? 0.5 : 0.3));
      this.sabSeen = sab;
      this.sabRollAt = snap.t + (crit ? 10 : 15);
    }
    // A fix goal left over from an earlier sabotage (one was fixed and another called straight away).
    if (this.goalKind === 'fix' && !kinds.includes(map.stationById.get(this.goalStation ?? '')?.kind ?? '')) {
      if (you.fixing) out.push({ a: 'fix', station: you.fixing, on: false });
      this.goal = null;
      this.goalKind = null;
    }
    if (fixAt && kinds.length === 2 && !this.sabGo) {
      const walk = (dist(fixAt, this.pos) * 1.8) / (BASE_SPEED * settings.playerSpeed);
      if (walk + 20 >= snap.sabotage.timer) this.sabGo = true;
    }
    // The button is locked during a critical sabotage.
    if (kinds.length === 2 && this.goalKind === 'emergency') this.goal = null;
    if (sab && this.goalKind !== 'fix' && this.sabGo) {
      if (you.role === 'engineer' && !you.remoteFixUsed && sab !== 'doors') {
        out.push({ a: 'remotefix' });
        return;
      }
      const st = fixAt;
      if (st) {
        this.setGoal(map, snap, st, 'fix', st.id);
        return;
      }
    }
    if (!sab && this.goalKind === 'fix') this.goal = null;
    if (this.lookAt && (snap.t > this.lookAt.until || dist(this.lookAt.pos, this.pos) < 2)) this.lookAt = null;
    if (this.lookAt && !(sab && this.sabGo)) {
      this.setGoal(map, snap, this.lookAt.pos, 'investigate');
      return;
    }
    if (!this.goal || this.goalKind === 'wander' || this.goalKind === 'body' || this.goalKind === 'recharge' || this.goalKind === 'flee') {
      if (this.goalKind === 'recharge' && you.battery < 0.95) return;
      if (this.goalKind === 'flee' && this.path.length) return;
      this.pickTask(snap, map) || this.wander(snap, map);
    }
  }

  private decideMurderer(snap: Snapshot, map: CompiledMap, settings: Settings, out: Action[]): void {
    const you = snap.you;
    const d = DIFF[this.diff];
    const others = this.visibleOthers(snap).filter((p) => !p.role || (p.role !== 'murderer' && p.role !== 'poisoner' && p.role !== 'accomplice'));
    // A teammate standing by is not a witness.
    const witnesses = others.length;
    const canKill = (you.role === 'murderer' || you.role === 'poisoner') && you.killCd <= 0;
    if (canKill && others.length > 0) {
      const range = KILL_RANGE[settings.killDistance];
      const target = others.find((p) => p.pos && dist(p.pos, this.pos) <= range);
      // Bystanders at the edge of sight may not notice; in a big lobby that risk is worth taking.
      const bystanders = others.filter((p) => p !== target);
      const nearBy = bystanders.filter((p) => p.pos && dist(p.pos, this.pos) < 6.5).length;
      const crowd = snap.players.filter((p) => p.alive).length;
      const alone = bystanders.length === 0 || (bystanders.length === 1 && this.rng.next() < 0.15) || (nearBy === 0 && crowd >= 9 && this.rng.next() < 0.25);
      if (target && alone && this.rng.next() < d.killBold + 0.2) {
        out.push(you.role === 'poisoner' ? { a: 'poison', target: target.id } : { a: 'kill', target: target.id });
        // Escape through a nearby vent if there is one.
        const v = map.def.vents.find((x) => dist(x, this.pos) < VENT_RANGE * 2.5);
        if (v && this.rng.next() < 0.6) this.setGoal(map, snap, v, 'vent', v.id);
        else this.wander(snap, map);
        return;
      }
      // Stalk a lone target.
      if (witnesses === 1 && others[0]?.pos && this.rng.next() < d.killBold) {
        this.setGoal(map, snap, others[0].pos, 'hunt');
        return;
      }
    }
    // Knife throw at a lone target in a line.
    if (you.role === 'murderer' && settings.knifeThrow && you.killCd <= 0 && witnesses === 1 && others[0]?.pos) {
      const t = others[0];
      const dd = dist(t.pos!, this.pos);
      if (dd > KILL_RANGE[settings.killDistance] && dd < 7 && this.rng.next() < 0.15 * d.killBold) {
        out.push({ a: 'throw', dir: Math.atan2(t.pos!.y - this.pos.y, t.pos!.x - this.pos.x) });
        return;
      }
    }
    // Sabotage now and then.
    const ready = snap.stats.murderers?.sabotagesReady ?? [];
    if (ready.length && snap.t > 20 && this.rng.next() < 0.03) {
      const pick = this.rng.pick(ready);
      if (pick === 'doors') {
        const rooms = [...new Set(map.def.doors.map((x) => x.room))];
        if (rooms.length) out.push({ a: 'sabotage', kind: 'doors', room: this.rng.pick(rooms) });
      } else out.push({ a: 'sabotage', kind: pick });
    }
    if (snap.mode === 'lightsout' && you.abilityCd <= 0 && others.length >= 1 && this.rng.next() < 0.05) out.push({ a: 'blackout' });
    // Self-report sometimes (sharp bots) or walk away.
    if (snap.bodies.length && this.goalKind !== 'wander' && this.goalKind !== 'vent') {
      if (this.diff === 'sharp' && witnesses > 1 && this.rng.next() < 0.3) {
        out.push({ a: 'report', body: snap.bodies[0]!.id });
        return;
      }
      this.wander(snap, map);
      return;
    }
    if (this.goalKind === 'vent' && this.goal && dist(this.goal, this.pos) < VENT_RANGE && this.goalStation) {
      out.push({ a: 'vent.enter', vent: this.goalStation });
      const v = map.ventById.get(this.goalStation);
      if (v && v.links.length) out.push({ a: 'vent.move', vent: this.rng.pick(v.links) });
      this.goal = null;
      return;
    }
    if (!this.goal || (this.goalKind === 'hunt' && this.rng.next() < 0.1)) {
      // Fake tasks to blend in while the knife cools or someone is watching; otherwise go
      // looking where a crewmate was last seen.
      if (canKill && witnesses === 0 && this.rng.next() < 0.6 && this.prowl(snap, map)) return;
      this.pickTask(snap, map, true) || this.wander(snap, map);
    }
  }

  private prowl(snap: Snapshot, map: CompiledMap): boolean {
    let best: { pos: Vec2; t: number } | null = null;
    for (const [id, ls] of this.lastSeen) {
      const p = snap.players.find((x) => x.id === id);
      if (!p?.alive || MURDER_TEAM.has(p.role ?? '')) continue;
      if (snap.t - ls.t > 15 || dist(ls.pos, this.pos) < 3) continue;
      if (!best || ls.t > best.t) best = ls;
    }
    if (!best) return false;
    this.setGoal(map, snap, best.pos, 'hunt');
    return true;
  }

  private decideHns(snap: Snapshot, map: CompiledMap, out: Action[]): void {
    const you = snap.you;
    const others = this.visibleOthers(snap);
    if (you.role === 'seeker') {
      if (snap.hns && snap.t < snap.hns.hideUntil) return;
      const prey = others.sort((a, b) => dist(a.pos!, this.pos) - dist(b.pos!, this.pos))[0];
      if (prey?.pos) {
        this.preySeen = { pos: { ...prey.pos }, t: snap.t };
        this.setGoal(map, snap, prey.pos, 'hunt');
        return;
      }
      // Lost sight: check where they were last seen before searching elsewhere.
      if (this.preySeen && snap.t - this.preySeen.t < 6 && dist(this.preySeen.pos, this.pos) > 1.5) {
        this.setGoal(map, snap, this.preySeen.pos, 'hunt');
        return;
      }
      if (!this.goal || this.goalKind === 'hunt') this.wander(snap, map);
      return;
    }
    const seeker = others.find((p) => p.role === 'seeker');
    if (seeker?.pos) {
      // Spotting the seeker takes a moment (reaction time) before the bot bolts.
      if (!this.seekerSeen || snap.t - this.seekerSeen.t > 3) this.fleeAfter = snap.t + DIFF[this.diff].reaction * (0.5 + this.rng.next());
      this.seekerSeen = { pos: { ...seeker.pos }, t: snap.t };
    }
    const threat = this.seekerSeen && snap.t - this.seekerSeen.t < 3 && snap.t >= this.fleeAfter ? this.seekerSeen.pos : null;
    // The danger meter rises as the (unseen) seeker closes in: move off, away from where it was last spotted.
    const danger = snap.stats.hns?.danger ?? 0;
    if (!threat && danger >= 0.75 && this.seekerSeen && snap.t - this.seekerSeen.t < 6 && !(this.goalKind === 'flee' && this.path.length)) {
      const to = this.fleeTarget(map, this.seekerSeen.pos);
      if (to) {
        this.setGoal(map, snap, to, 'flee');
        return;
      }
    }
    if (threat && dist(threat, this.pos) < 9) {
      // Slip into a vent when the seeker is right there (hiders get a few uses).
      if (you.ventUses > 0 && you.ventCd <= 0 && dist(threat, this.pos) < 4) {
        const v = map.def.vents.find((x) => dist(x, this.pos) <= VENT_RANGE * 0.9);
        const link = v?.links.map((id) => map.ventById.get(id)).filter((x) => !!x).sort((a, b) => dist(b!, threat) - dist(a!, threat))[0];
        if (v && link) {
          out.push({ a: 'vent.enter', vent: v.id }, { a: 'vent.move', vent: link.id });
          this.goal = null;
          this.path = [];
          return;
        }
      }
      // Keep running for the current hideout while it is still away from the seeker.
      if (this.goalKind === 'flee' && this.goal && this.path.length && dist(this.goal, threat) > dist(this.goal, this.pos) + 3) return;
      const to = this.fleeTarget(map, threat);
      if (to) {
        this.setGoal(map, snap, to, 'flee');
        return;
      }
    }
    if (this.goalKind === 'flee' && this.path.length) return;
    if (!this.goal || this.goalKind === 'wander' || this.goalKind === 'flee') this.pickTask(snap, map) || this.wander(snap, map);
  }

  /** A spot (station or vent) this bot reaches well before the seeker, by walking distance. */
  private fleeTarget(map: CompiledMap, threat: Vec2): Vec2 | null {
    const dS = distanceField(map, threat);
    const dM = distanceField(map, this.pos);
    const at = (d: Int32Array, p: Vec2) => {
      let best = -1;
      for (let y = Math.floor(p.y) - 1; y <= Math.floor(p.y) + 1; y++)
        for (let x = Math.floor(p.x) - 1; x <= Math.floor(p.x) + 1; x++) {
          if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
          const v = d[y * map.w + x]!;
          if (v >= 0 && (best < 0 || v < best)) best = v;
        }
      return best;
    };
    let best: Vec2 | null = null;
    let bs = -Infinity;
    for (const s of [...map.def.stations, ...map.def.vents]) {
      const a = at(dS, s);
      const b = at(dM, s);
      if (a < 0 || b < 0 || b + 2 >= a) continue;
      const score = a - 0.6 * b + this.rng.next() * 4;
      if (score > bs) {
        bs = score;
        best = s;
      }
    }
    return best;
  }

  /** The task list, from memory while comms are down. */
  private tasks(snap: Snapshot): Snapshot['you']['tasks'] {
    return snap.you.tasks.length || snap.sabotage.active !== 'comms' ? snap.you.tasks : this.taskMemory;
  }

  private pickTask(snap: Snapshot, map: CompiledMap, fake = false): boolean {
    // A murderer moves on from stations it has just faked instead of looping on one.
    const todo = this.tasks(snap).filter((t) => !t.done && !(fake && snap.t - (this.faked.get(t.stations[t.step] ?? '') ?? -999) < 90));
    if (!todo.length) return false;
    let best: { id: string; x: number; y: number } | null = null;
    let bd = Infinity;
    for (const t of todo) {
      const sid = t.stations[t.step];
      const s = sid ? map.stationById.get(sid) : null;
      if (!s) continue;
      const d = dist(s, this.pos) + this.rng.next() * 12;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best) return false;
    if (fake && this.rng.next() < 0.3) return false;
    this.setGoal(map, snap, best, 'task', best.id);
    return true;
  }

  private wander(snap: Snapshot, map: CompiledMap): boolean {
    const s = this.rng.pick(map.def.stations);
    this.setGoal(map, snap, s, 'wander');
    return true;
  }

  // -------------------------------------------------------------------------
  private act(snap: Snapshot, map: CompiledMap, settings: Settings, dt: number, out: Action[]): void {
    const you = snap.you;
    const d = DIFF[this.diff];
    this.sweep += dt * (you.dread > 0.1 ? 5 : 2.5);
    // At a task station: open, wait, complete.
    if (this.goalKind === 'task' && this.goalStation && this.goal && dist(this.goal, this.pos) <= INTERACT_RANGE * 0.85) {
      if (this.taskOpenedAt < 0) {
        out.push({ a: 'task.open', station: this.goalStation });
        this.taskOpenedAt = snap.t;
        const task = this.tasks(snap).find((t) => t.stations[t.step] === this.goalStation);
        const def = task ? TASK_BY_ID[task.taskId] : null;
        this.taskDuration = (def?.minTime ?? 2) + 0.4 + this.rng.next() * d.taskSlack;
      } else if (snap.t - this.taskOpenedAt >= this.taskDuration) {
        out.push({ a: 'task.done', station: this.goalStation });
        if (you.team !== 'crew') this.faked.set(this.goalStation, snap.t);
        else if (!you.tasks.length) {
          // Comms are down: track progress on the remembered list.
          const t = this.taskMemory.find((x) => !x.done && x.stations[x.step] === this.goalStation);
          if (t) this.taskMemory = this.taskMemory.map((x) => (x === t ? { ...x, step: x.step + 1, done: x.step + 1 >= x.stations.length } : x));
        }
        this.taskOpenedAt = -1;
        this.goal = null;
        this.goalKind = null;
      }
      return this.emitMove(snap, out, false);
    }
    if (this.taskOpenedAt >= 0 && this.goalKind !== 'task') this.taskOpenedAt = -1;
    // Holding a critical fix.
    if (this.goalKind === 'fix' && this.goalStation && this.goal && dist(this.goal, this.pos) <= INTERACT_RANGE * 0.85) {
      const sab = snap.sabotage.active;
      if (!sab) {
        this.goal = null;
        return this.emitMove(snap, out, false);
      }
      if (sab === 'lights' || sab === 'comms') {
        if (this.fixStartedAt < 0) this.fixStartedAt = snap.t + this.rng.next() * d.taskSlack;
        else if (snap.t - this.fixStartedAt > 2.5) {
          out.push({ a: 'fix.done', station: this.goalStation });
          this.fixStartedAt = -1;
          this.goal = null;
        }
      } else {
        // Two-person fix: if someone is already at this station, take the other one. A bot
        // already holding stays put (newcomers move on, so holders are not shuffled about).
        const here = map.stationById.get(this.goalStation);
        const crowd =
          here && you.fixing !== this.goalStation
            ? this.visibleOthers(snap).filter((p) => p.pos && dist(p.pos, here) <= INTERACT_RANGE + 0.3 && (p.kind === 'human' || p.id < this.id))
            : [];
        // Or, unseen in the dark: the bar was already half full when this bot took hold and
        // has not moved since, so the other half is this station's and the pair is empty.
        const doubled = you.fixing === this.goalStation && this.holdProg >= 0.5 && snap.t - this.holdSince > 2 && snap.sabotage.progress <= 0.5;
        if (here && (crowd.length || doubled) && snap.sabotage.progress < 1) {
          const pair = here.kind.endsWith('A') ? here.kind.slice(0, -1) + 'B' : here.kind.slice(0, -1) + 'A';
          const other = this.nearestStation(map, [pair]);
          if (other) {
            if (you.fixing) out.push({ a: 'fix', station: this.goalStation, on: false });
            this.setGoal(map, snap, other, 'fix', other.id);
            return this.emitMove(snap, out, false);
          }
        }
        if (you.fixing !== this.goalStation) {
          out.push({ a: 'fix', station: this.goalStation, on: true });
          this.holdProg = snap.sabotage.progress;
          this.holdSince = snap.t;
        }
      }
      return this.emitMove(snap, out, false);
    }
    // Follow path.
    const speed = BASE_SPEED * settings.playerSpeed * (you.alive ? 1 : 1.25) * (snap.hns && you.role === 'seeker' ? (snap.hns.final ? settings.hnsSeekerBoost : 1.05) : 1);
    let budget = speed * dt;
    let moved = false;
    while (budget > 0 && this.path.length) {
      const next = this.path[0]!;
      const dd = dist(next, this.pos);
      if (dd <= budget) {
        this.pos = { ...next };
        budget -= dd;
        this.path.shift();
      } else {
        this.pos = { x: this.pos.x + ((next.x - this.pos.x) / dd) * budget, y: this.pos.y + ((next.y - this.pos.y) / dd) * budget };
        budget = 0;
      }
      this.facing = Math.atan2(next.y - this.pos.y, next.x - this.pos.x) || this.facing;
      moved = true;
    }
    if (!this.path.length && this.goal && this.goalKind !== 'task' && this.goalKind !== 'fix' && this.goalKind !== 'vent') {
      if (this.goalKind === 'recharge' && you.battery < 0.95) {
        /* wait */
      } else {
        this.goal = null;
      }
    }
    // A goal with no route (doors were shut when it was planned): re-plan every
    // second; give the goal up after 8 s so the bot does something else.
    if (!this.path.length && this.goal && dist(this.goal, this.pos) > INTERACT_RANGE * 0.9) {
      if (this.noRouteSince < 0) this.noRouteSince = snap.t;
      if (snap.t >= this.replanAt) {
        this.replanAt = snap.t + 1;
        this.setGoal(map, snap, this.goal, this.goalKind, this.goalStation);
      }
      if (!this.path.length && snap.t - this.noRouteSince > 8) {
        this.goal = null;
        this.goalKind = null;
        this.goalStation = null;
        this.noRouteSince = -1;
      }
    } else this.noRouteSince = -1;
    // Stuck detection.
    if (moved && dist(this.lastPos, you.pos) < 0.01) this.stuck += dt;
    else this.stuck = 0;
    this.lastPos = { ...you.pos };
    if (this.stuck > 1.5) {
      this.stuck = 0;
      this.pos = { ...you.pos };
      this.path = [];
      this.goal = null;
    }
    // Opportunistic actions while walking.
    if (you.team === 'murderers' && this.goalKind === 'hunt' && (you.role === 'murderer' || you.role === 'seeker') && you.killCd <= 0) {
      const range = snap.mode === 'hideseek' ? 1.3 : KILL_RANGE[settings.killDistance];
      const prey = this.visibleOthers(snap).filter((p) => !MURDER_TEAM.has(p.role ?? '') && p.role !== 'seeker');
      const t = prey.find((p) => p.pos && dist(p.pos, this.pos) <= range);
      if (t && (snap.mode === 'hideseek' || prey.length <= 1)) out.push({ a: 'kill', target: t.id });
    }
    this.emitMove(snap, out, moved);
  }

  private emitMove(snap: Snapshot, out: Action[], moved: boolean): void {
    if (!moved && this.seq % 6 !== 0) {
      this.seq++;
      return;
    }
    // Lights Out: keep the beam moving to catch whoever lurks in the dark: swing it either
    // side of the way ahead, or turn full circle while standing at a task.
    const sweeping = snap.mode === 'lightsout' && snap.you.alive && snap.you.team === 'crew';
    const facing = sweeping ? (moved ? this.facing + Math.sin(this.sweep) * 1.2 : this.sweep) : this.facing;
    out.push({ a: 'move', x: this.pos.x, y: this.pos.y, facing, seq: this.seq++ });
  }

  // -------------------------------------------------------------------------
  private meeting(snap: Snapshot, settings: Settings, out: Action[]): void {
    const m = snap.meeting;
    if (!m) return;
    const you = snap.you;
    if (!this.meetingEvaluated) {
      this.meetingEvaluated = true;
      this.meetingNo++;
      this.meetingSaid = 0;
      this.evaluateMeeting(snap);
    }
    this.listen(snap);
    if (this.lastMeetingT !== m.stageEnds && m.stage === 'discuss' && this.lastMeetingT < 0) this.meetingSaid = 0;
    if (this.voteAt < 0 || m.stage === 'discuss') {
      this.voteAt = snap.t + 2 + this.rng.next() * Math.min(12, Math.max(3, (m.stageEnds - snap.t) * 0.5));
    }
    this.lastMeetingT = m.stageEnds;
    if (!you.alive) return;
    // Say something (1–2 lines per meeting).
    if (this.meetingSaid < 2 && this.rng.next() < 0.02 && (settings.chat || settings.quickChat)) {
      this.meetingSaid++;
      this.say(snap, settings, out);
    }
    if (you.role === 'mayor' && settings.mayorReveal && !you.mayorRevealed && this.knownKillers.size && this.rng.next() < 0.05) out.push({ a: 'mayor.reveal' });
    if (m.stage === 'vote' && !m.myVote && snap.t >= this.voteAt) {
      out.push({ a: 'vote', target: this.chooseVote(snap, settings) });
      this.voteAt = -1;
    }
  }

  private meetingEvaluated = false;
  private heardChat = new Set<number>();
  private heardPairs = new Set<string>();
  private meetingNo = 0;

  /**
   * Who was last seen near the victim around the time they vanished? Only
   * sightings from this round count (everyone stands together at the table
   * after a meeting), and the blame is split across everyone who was there.
   */
  private evaluateMeeting(snap: Snapshot): void {
    const victim = snap.meeting?.victimId;
    if (!victim) return;
    // Whoever reports a body is usually innocent (it is also why they were near it).
    const caller = snap.meeting?.callerId;
    if (caller && caller !== this.id) this.bump(caller, -1, 'reported the body');
    const since = this.playSince + 3;
    // In the dark only crewmates' beams show where people were, so position says little.
    const posW = snap.mode === 'lightsout' ? 0.4 : 1;
    const alive = (id: string) => id !== victim && id !== this.id && !!snap.players.find((p) => p.id === id)?.alive;
    const v = this.lastSeen.get(victim);
    if (v && v.t >= since) {
      const near: string[] = [];
      for (const [id, ls] of this.lastSeen) {
        if (!alive(id) || ls.t < since) continue;
        if (Math.abs(ls.t - v.t) < 8 && dist(ls.pos, v.pos) < 7) near.push(id);
      }
      const stale = snap.t - v.t > 40 ? 0.5 : 1;
      for (const id of near) this.bump(id, Math.min(2.5, 3 / near.length) * stale * posW, 'was last seen with the victim');
    }
    // Who was around where the body turned up, shortly before it was found?
    const body = this.bodySeen.get(victim);
    const at = body?.pos ?? (v && v.t >= since ? v.pos : null);
    if (!at) return;
    const t1 = body?.t ?? snap.t;
    const around: string[] = [];
    for (const [id, h] of this.trail) {
      if (!alive(id)) continue;
      if (h.some((x) => x.t >= since && x.t >= t1 - 30 && x.t <= t1 + 2 && dist(x, at) < 7)) around.push(id);
    }
    for (const id of around) this.bump(id, Math.min(3, 5 / around.length) * posW, 'was around where the body was');
  }

  /**
   * Weigh what others say in meeting chat. Each speaker counts once per target
   * per meeting (repeating an accusation adds nothing), and hearsay is kept
   * apart from first-hand evidence so bots don't echo each other into a pile-on.
   */
  private listen(snap: Snapshot): void {
    for (const c of snap.chat) {
      if (this.heardChat.has(c.id) || c.from === this.id || c.from === 'system' || c.ghost) continue;
      this.heardChat.add(c.id);
      if (this.knownKillers.has(c.from)) continue;
      const speakerSus = this.sus.get(c.from)?.score ?? 0;
      const trust = speakerSus > 4 ? 0.3 : 1;
      const named = snap.players.filter((p) => p.id !== c.from && c.text.includes(p.name));
      for (const p of named) {
        // "Bot 1" is inside "Bot 10": keep only the longest names mentioned.
        if (named.some((o) => o !== p && o.name.length > p.name.length && o.name.includes(p.name))) continue;
        const key = `${this.meetingNo}|${c.from}|${p.id}`;
        if (this.heardPairs.has(key)) continue;
        this.heardPairs.add(key);
        if (p.id === this.id) {
          // First-hand: this bot knows its own innocence.
          if (snap.you.team === 'crew' && c.quick !== 'with' && c.quick !== 'clear') this.bump(c.from, 2, 'accused me');
          continue;
        }
        if (c.quick === 'saw-kill' || c.quick === 'saw-vent') this.bump(p.id, 4 * trust, 'was called out', false);
        else if (c.quick === 'sus' || c.quick === 'near-body' || c.quick === 'vote' || c.quick === 'fake-task') this.bump(p.id, 1.5 * trust, 'was called sus', false);
        else if (c.quick === 'with' || c.quick === 'clear') this.bump(p.id, -1.5 * trust, 'was vouched for', false);
      }
    }
  }

  private topSuspect(snap: Snapshot, firstHand = false): { id: string; s: Sus } | null {
    let best: { id: string; s: Sus } | null = null;
    for (const [id, s] of this.sus) {
      const p = snap.players.find((x) => x.id === id);
      if (!p || !p.alive) continue;
      if (snap.you.team === 'murderers' && (p.role === 'murderer' || p.role === 'poisoner' || p.role === 'accomplice')) continue;
      if (!best || (firstHand ? s.own > best.s.own : s.score > best.s.score)) best = { id, s };
    }
    return best;
  }

  private chooseVote(snap: Snapshot, settings: Settings): string {
    const you = snap.you;
    const alive = snap.players.filter((p) => p.alive && p.id !== this.id);
    if (you.role === 'jester') return this.rng.next() < 0.5 ? 'skip' : this.rng.pick(alive).id;
    if (you.team === 'murderers') {
      const crew = alive.filter((p) => !(p.role === 'murderer' || p.role === 'poisoner' || p.role === 'accomplice'));
      // Pile onto whoever the crew already suspects, or skip (but never skip while a
      // teammate is the one under fire: split the vote onto someone else).
      const top = this.topSuspect(snap);
      if (top && top.s.score > 2) return top.id;
      const heat = snap.players.some((p) => p.alive && p.id !== this.id && MURDER_TEAM.has(p.role ?? '') && (this.sus.get(p.id)?.score ?? 0) >= 3);
      if (heat && crew.length) return top?.id ?? this.rng.pick(crew).id;
      return crew.length && this.rng.next() < 0.35 ? this.rng.pick(crew).id : settings.allowSkip ? 'skip' : (crew[0]?.id ?? 'skip');
    }
    // Crew: a killer seen in the act gets the vote.
    const known = alive.find((p) => this.knownKillers.has(p.id));
    if (known) return known.id;
    const ranked = [...this.sus.entries()]
      .filter(([id]) => alive.some((p) => p.id === id))
      .sort((a, b) => b[1].score - a[1].score);
    const top = ranked[0];
    const second = Math.max(0, ranked[1]?.[1].score ?? 0);
    // Endgame: if skipping lets the murderers reach parity with one more kill, vote on thinner evidence.
    const mustVote = alive.length + 1 <= 2 * this.killersLeft(snap, settings) + 1;
    const threshold = mustVote ? 0.5 : this.diff === 'easy' ? 2 : 3;
    const margin = mustVote ? 0.25 : 1;
    if (top && top[1].score >= threshold && top[1].score - second >= margin) return top[0];
    if (!settings.allowSkip) return this.rng.pick(alive).id;
    return 'skip';
  }

  /** Murderer-team members believed still alive: the lobby's configured count minus confirmed ejections. */
  private killersLeft(snap: Snapshot, settings: Settings): number {
    const r = settings.roles;
    const configured = r.murderer.count + r.poisoner.count + r.accomplice.count;
    let gone = this.ejectedKillers.size;
    for (const id of this.knownKillers) if (!this.ejectedKillers.has(id) && snap.players.some((p) => p.id === id && !p.alive)) gone++;
    return Math.max(1, Math.min(configured, maxMurderers(snap.players.length)) - gone);
  }

  private say(snap: Snapshot, settings: Settings, out: Action[]): void {
    const you = snap.you;
    if (this.chatProvider && settings.chat && !this.chatPending) {
      this.chatPending = true;
      const ctx: ChatContext = {
        botId: this.id,
        botName: snap.players.find((p) => p.id === this.id)?.name ?? 'Bot',
        persona: this.persona,
        role: you.role,
        team: you.team,
        alive: snap.players.filter((p) => p.alive).map((p) => ({ id: p.id, name: p.name })),
        victim: snap.meeting?.victimId ? snap.players.find((p) => p.id === snap.meeting!.victimId)?.name ?? null : null,
        caller: snap.players.find((p) => p.id === snap.meeting?.callerId)?.name ?? null,
        suspicions: [...this.sus.entries()]
          .map(([id, s]) => ({ name: snap.players.find((p) => p.id === id)?.name ?? id, score: s.score, reasons: s.reasons }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3),
        recentChat: snap.chat.slice(-8).map((c) => ({ from: c.from, text: c.text })),
      };
      // Fire-and-forget; the room host delivers the line via `pendingChat`.
      this.chatProvider(ctx)
        .then((line) => {
          if (line) this.pendingChat.push(line);
        })
        .catch(() => {})
        .finally(() => {
          this.chatPending = false;
        });
      return;
    }
    if (!settings.quickChat) return;
    // A murderer covers for a teammate who is drawing suspicion.
    if (you.team === 'murderers') {
      const mate = snap.players.find((p) => p.alive && p.id !== this.id && MURDER_TEAM.has(p.role ?? '') && (this.sus.get(p.id)?.score ?? 0) >= 3);
      if (mate && !this.heardPairs.has(`${this.meetingNo}|vouch|${mate.id}`)) {
        this.heardPairs.add(`${this.meetingNo}|vouch|${mate.id}`);
        out.push({ a: 'quick', id: 'with', target: mate.id });
        return;
      }
    }
    // Speak from what this bot saw itself, not from what it heard.
    const own = this.topSuspect(snap, true);
    if (own && own.s.own >= 6 && this.knownKillers.has(own.id)) out.push({ a: 'quick', id: 'saw-kill', target: own.id });
    else if (own && own.s.own >= 2) out.push({ a: 'quick', id: this.rng.pick(['sus', 'near-body']), target: own.id });
    else out.push({ a: 'quick', id: this.rng.pick(QUICK_CHAT.filter((q) => !q.target && (q.group === 'info' || q.group === 'defend'))).id });
  }

  /** Lines produced asynchronously by the chat provider, drained by the host. */
  pendingChat: string[] = [];
}
