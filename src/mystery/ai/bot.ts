/**
 * Built-in AI brain for filling seats with Marion agents. Bots only see the
 * same per-player Snapshot a human in that seat would receive — no peeking.
 *
 * Layers: a deterministic heuristic brain (navigation, tasks, kills,
 * reporting, sabotage/fixes, sheriff judgement, flashlight, Hide & Seek,
 * suspicion from what was actually witnessed) + an optional async chat
 * provider (LLM) for meeting lines in each bot's personality.
 */
import { dist, findPath, INTERACT_RANGE, type CompiledMap } from '../core/map';
import type { Action } from '../core/match';
import { GUN_RANGE, REPORT_RANGE, VENT_RANGE } from '../core/match';
import type { PublicPlayer, Snapshot } from '../core/project';
import { QUICK_CHAT } from '../core/quickchat';
import { Rng } from '../core/rng';
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
  reasons: string[];
}

const DIFF: Record<BotDifficulty, { reaction: number; killBold: number; reportChance: number; aim: number; taskSlack: number }> = {
  easy: { reaction: 1.4, killBold: 0.35, reportChance: 0.55, aim: 0.6, taskSlack: 2.5 },
  normal: { reaction: 0.8, killBold: 0.6, reportChance: 0.85, aim: 0.85, taskSlack: 1.2 },
  sharp: { reaction: 0.4, killBold: 0.85, reportChance: 1, aim: 1, taskSlack: 0.5 },
};

export class BotBrain {
  readonly id: string;
  private rng: Rng;
  private path: Vec2[] = [];
  private goal: Vec2 | null = null;
  private goalKind: 'task' | 'wander' | 'body' | 'fix' | 'flee' | 'hunt' | 'recharge' | 'emergency' | 'vent' | null = null;
  private goalStation: string | null = null;
  private taskOpenedAt = -1;
  private taskDuration = 0;
  private seq = 1;
  private pos: Vec2 = { x: 0, y: 0 };
  private facing = 0;
  private think = 0;
  private sus = new Map<string, Sus>();
  private knownKillers = new Set<string>();
  private lastSeen = new Map<string, { pos: Vec2; t: number }>();
  private stuck = 0;
  private lastPos: Vec2 = { x: 0, y: 0 };
  private meetingSaid = 0;
  private voteAt = -1;
  private chatPending = false;
  private lastMeetingT = -1;
  private seenEvents = new Set<string>();
  private fixStartedAt = -1;
  private reactAt = 0;
  private pendingReport: string | null = null;
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
    this.observe(snap);
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.25 + this.rng.next() * 0.15;
      this.decide(snap, map, settings, out);
    }
    this.act(snap, map, settings, dt, out);
    return out;
  }

  // -------------------------------------------------------------------------
  private observe(snap: Snapshot): void {
    for (const p of snap.players) {
      if (p.id === this.id || !p.pos) continue;
      this.lastSeen.set(p.id, { pos: p.pos, t: snap.t });
    }
    for (const ev of snap.events) {
      const key = `${ev.t}|${ev.type}|${ev.actor ?? ''}|${ev.target ?? ''}`;
      if (this.seenEvents.has(key)) continue;
      this.seenEvents.add(key);
      if (this.seenEvents.size > 400) this.seenEvents.clear();
      if (ev.type === 'kill' && ev.actor && ev.actor !== this.id && ev.data?.weapon !== 'gun') {
        this.knownKillers.add(ev.actor);
        this.bump(ev.actor, 10, 'saw them kill');
      }
      if (ev.type === 'vent' && ev.actor && ev.actor !== this.id) {
        const p = snap.players.find((x) => x.id === ev.actor);
        if (p?.role !== 'engineer') this.bump(ev.actor, 6, 'vented');
      }
      if (ev.type === 'visual' && ev.actor) this.bump(ev.actor, -8, 'did a visual task');
      if (ev.type === 'shield.hit' && ev.actor && ev.actor !== this.id) {
        this.knownKillers.add(ev.actor);
        this.bump(ev.actor, 9, 'attacked a shielded player');
      }
    }
    // Players seen standing near a fresh body are suspicious.
    for (const b of snap.bodies) {
      for (const p of snap.players) {
        if (!p.pos || p.id === this.id || p.id === b.playerId) continue;
        if (dist(p.pos, b.pos) < 3) this.bump(p.id, 0.4, 'was near the body');
      }
    }
    for (const c of snap.you.clues) {
      for (const p of snap.players) {
        const hint = c.hintKind === 'berry' ? p.cosmetics.berry : null;
        if (hint && hint === c.killerHint && p.id !== this.id) this.bump(p.id, 0.2, `matches the ${c.killerHint} clue`);
      }
    }
  }

  private bump(id: string, n: number, reason: string): void {
    const s = this.sus.get(id) ?? { score: 0, reasons: [] };
    s.score += n;
    if (!s.reasons.includes(reason)) s.reasons.push(reason);
    this.sus.set(id, s);
  }

  private visibleOthers(snap: Snapshot): PublicPlayer[] {
    return snap.players.filter((p) => p.id !== this.id && p.pos && p.alive && !p.ghost);
  }

  private nearestStation(map: CompiledMap, kinds: string[]) {
    let best: { id: string; x: number; y: number } | null = null;
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

    if (mode === 'hideseek') return this.decideHns(snap, map);
    // Lights Out dread: something is close. Suspect whoever is nearby and run for company.
    if (you.dread > 0.35 && you.team !== 'murderers') {
      for (const p of this.visibleOthers(snap)) if (p.pos && dist(p.pos, this.pos) < 5) this.bump(p.id, 0.6 * you.dread, 'lurked near me in the dark');
      if (this.goalKind !== 'flee' && this.goalKind !== 'fix' && this.rng.next() < 0.5) {
        const e = this.nearestStation(map, ['emergency']);
        const friend = this.visibleOthers(snap).find((p) => p.pos && dist(p.pos, this.pos) > 5);
        const to = friend?.pos ?? e;
        if (to) {
          this.setGoal(map, snap, to, 'flee');
          return;
        }
      }
    }
    if (you.team === 'murderers') return this.decideMurderer(snap, map, settings, out);
    return this.decideCrew(snap, map, settings, out, d);
  }

  private decideCrew(snap: Snapshot, map: CompiledMap, _settings: Settings, out: Action[], d: (typeof DIFF)['normal']): void {
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
    // A witnessed kill with nobody else around: run to the button.
    if (this.knownKillers.size && you.emergencyLeft > 0 && !you.hasGun && snap.sabotage.active !== 'meltdown' && snap.sabotage.active !== 'pressure') {
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
    // Sabotage response.
    const sab = snap.sabotage.active;
    if (sab && this.goalKind !== 'fix') {
      if (you.role === 'engineer' && !you.remoteFixUsed && sab !== 'doors') {
        out.push({ a: 'remotefix' });
        return;
      }
      const kinds = sab === 'lights' ? ['lightsPanel'] : sab === 'comms' ? ['commsPanel'] : sab === 'meltdown' ? ['meltdownA', 'meltdownB'] : sab === 'pressure' ? ['pressureA', 'pressureB'] : [];
      // Spread fixers between the two critical stations.
      const k = kinds.length === 2 ? kinds[(this.id.charCodeAt(this.id.length - 1) + this.id.length) % 2]! : kinds[0];
      const st = k ? this.nearestStation(map, [k]) : null;
      if (st && (kinds.length === 2 || this.rng.next() < 0.6)) {
        this.setGoal(map, snap, st, 'fix', st.id);
        return;
      }
    }
    if (!sab && this.goalKind === 'fix') this.goal = null;
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
    const witnesses = this.visibleOthers(snap).length;
    const canKill = (you.role === 'murderer' || you.role === 'poisoner') && you.killCd <= 0;
    if (canKill && others.length > 0) {
      const range = KILL_RANGE[settings.killDistance];
      const target = others.find((p) => p.pos && dist(p.pos, this.pos) <= range);
      const alone = witnesses <= 1 || (witnesses === 2 && this.rng.next() < 0.15);
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
    if (!this.goal || (this.goalKind === 'hunt' && this.rng.next() < 0.1)) this.pickTask(snap, map, true) || this.wander(snap, map);
  }

  private decideHns(snap: Snapshot, map: CompiledMap): void {
    const you = snap.you;
    const others = this.visibleOthers(snap);
    if (you.role === 'seeker') {
      if (snap.hns && snap.t < snap.hns.hideUntil) return;
      const prey = others.sort((a, b) => dist(a.pos!, this.pos) - dist(b.pos!, this.pos))[0];
      if (prey?.pos) {
        this.setGoal(map, snap, prey.pos, 'hunt');
        return;
      }
      if (!this.goal || this.goalKind === 'hunt') this.wander(snap, map);
      return;
    }
    const seeker = others.find((p) => p.role === 'seeker');
    if (seeker?.pos && dist(seeker.pos, this.pos) < 9) {
      // Flee: pick the reachable station furthest from the seeker.
      let best = map.def.spawn as Vec2;
      let bd = -1;
      for (let i = 0; i < 6; i++) {
        const s = this.rng.pick(map.def.stations);
        const score = dist(s, seeker.pos) - dist(s, this.pos) * 0.3;
        if (score > bd) {
          bd = score;
          best = s;
        }
      }
      this.setGoal(map, snap, best, 'flee');
      return;
    }
    if (!this.goal || this.goalKind === 'wander' || this.goalKind === 'flee') this.pickTask(snap, map) || this.wander(snap, map);
  }

  private pickTask(snap: Snapshot, map: CompiledMap, fake = false): boolean {
    const todo = snap.you.tasks.filter((t) => !t.done);
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
    // At a task station: open, wait, complete.
    if (this.goalKind === 'task' && this.goalStation && this.goal && dist(this.goal, this.pos) <= INTERACT_RANGE * 0.85) {
      if (this.taskOpenedAt < 0) {
        out.push({ a: 'task.open', station: this.goalStation });
        this.taskOpenedAt = snap.t;
        const task = you.tasks.find((t) => t.stations[t.step] === this.goalStation);
        const def = task ? TASK_BY_ID[task.taskId] : null;
        this.taskDuration = (def?.minTime ?? 2) + 0.4 + this.rng.next() * d.taskSlack;
      } else if (snap.t - this.taskOpenedAt >= this.taskDuration) {
        out.push({ a: 'task.done', station: this.goalStation });
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
        // Two-person fix: if someone already holds this station, take the other one.
        const here = map.stationById.get(this.goalStation);
        const crowd = here
          ? this.visibleOthers(snap).filter((p) => p.pos && dist(p.pos, here) <= INTERACT_RANGE + 0.3 && (p.kind === 'human' || p.id < this.id))
          : [];
        if (here && crowd.length && snap.sabotage.progress < 1) {
          const pair = here.kind.endsWith('A') ? here.kind.slice(0, -1) + 'B' : here.kind.slice(0, -1) + 'A';
          const other = this.nearestStation(map, [pair]);
          if (other) {
            if (you.fixing) out.push({ a: 'fix', station: this.goalStation, on: false });
            this.setGoal(map, snap, other, 'fix', other.id);
            return this.emitMove(snap, out, false);
          }
        }
        if (you.fixing !== this.goalStation) out.push({ a: 'fix', station: this.goalStation, on: true });
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
      const t = this.visibleOthers(snap).find((p) => p.pos && dist(p.pos, this.pos) <= range && p.role !== 'murderer' && p.role !== 'seeker');
      if (t && (snap.mode === 'hideseek' || this.visibleOthers(snap).length <= 1)) out.push({ a: 'kill', target: t.id });
    }
    this.emitMove(snap, out, moved);
  }

  private emitMove(_snap: Snapshot, out: Action[], moved: boolean): void {
    if (!moved && this.seq % 6 !== 0) {
      this.seq++;
      return;
    }
    out.push({ a: 'move', x: this.pos.x, y: this.pos.y, facing: this.facing, seq: this.seq++ });
  }

  // -------------------------------------------------------------------------
  private meeting(snap: Snapshot, settings: Settings, out: Action[]): void {
    const m = snap.meeting;
    if (!m) return;
    const you = snap.you;
    if (!this.meetingEvaluated) {
      this.meetingEvaluated = true;
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

  /** Who was last seen near the victim around the time they vanished? */
  private evaluateMeeting(snap: Snapshot): void {
    const victim = snap.meeting?.victimId;
    if (!victim) return;
    const v = this.lastSeen.get(victim);
    if (!v) return;
    for (const [id, ls] of this.lastSeen) {
      if (id === victim || id === this.id) continue;
      if (Math.abs(ls.t - v.t) < 12 && dist(ls.pos, v.pos) < 9) this.bump(id, 2.5, 'was last seen with the victim');
    }
  }

  /** Weigh what others say in meeting chat. */
  private listen(snap: Snapshot): void {
    for (const c of snap.chat) {
      if (this.heardChat.has(c.id) || c.from === this.id || c.from === 'system') continue;
      this.heardChat.add(c.id);
      if (this.knownKillers.has(c.from)) continue;
      const speakerSus = this.sus.get(c.from)?.score ?? 0;
      const trust = speakerSus > 4 ? 0.3 : 1;
      for (const p of snap.players) {
        if (p.id === c.from || !c.text.includes(p.name)) continue;
        if (p.id === this.id) {
          this.bump(c.from, 1.5, 'accused me');
          continue;
        }
        if (c.quick === 'saw-kill' || c.quick === 'saw-vent') this.bump(p.id, 4 * trust, 'was called out');
        else if (c.quick === 'sus' || c.quick === 'near-body' || c.quick === 'vote' || c.quick === 'fake-task') this.bump(p.id, 1.5 * trust, 'was called sus');
        else if (c.quick === 'with' || c.quick === 'clear') this.bump(p.id, -1.5 * trust, 'was vouched for');
      }
    }
  }

  private topSuspect(snap: Snapshot): { id: string; s: Sus } | null {
    let best: { id: string; s: Sus } | null = null;
    for (const [id, s] of this.sus) {
      const p = snap.players.find((x) => x.id === id);
      if (!p || !p.alive) continue;
      if (snap.you.team === 'murderers' && (p.role === 'murderer' || p.role === 'poisoner' || p.role === 'accomplice')) continue;
      if (!best || s.score > best.s.score) best = { id, s };
    }
    return best;
  }

  private chooseVote(snap: Snapshot, settings: Settings): string {
    const you = snap.you;
    const alive = snap.players.filter((p) => p.alive && p.id !== this.id);
    if (you.role === 'jester') return this.rng.next() < 0.5 ? 'skip' : this.rng.pick(alive).id;
    if (you.team === 'murderers') {
      const crew = alive.filter((p) => !(p.role === 'murderer' || p.role === 'poisoner' || p.role === 'accomplice'));
      // Pile onto whoever the crew already suspects, or skip.
      const top = this.topSuspect(snap);
      if (top && top.s.score > 2) return top.id;
      return crew.length && this.rng.next() < 0.35 ? this.rng.pick(crew).id : settings.allowSkip ? 'skip' : (crew[0]?.id ?? 'skip');
    }
    const top = this.topSuspect(snap);
    const threshold = this.diff === 'easy' ? 1.5 : 3;
    if (top && top.s.score >= threshold) return top.id;
    if (!settings.allowSkip) return this.rng.pick(alive).id;
    return 'skip';
  }

  private say(snap: Snapshot, settings: Settings, out: Action[]): void {
    const top = this.topSuspect(snap);
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
    if (top && top.s.score >= 6 && this.knownKillers.has(top.id)) out.push({ a: 'quick', id: 'saw-kill', target: top.id });
    else if (top && top.s.score >= 2) out.push({ a: 'quick', id: this.rng.pick(['sus', 'near-body']), target: top.id });
    else out.push({ a: 'quick', id: this.rng.pick(QUICK_CHAT.filter((q) => !q.target && q.group !== 'accuse')).id });
  }

  /** Lines produced asynchronously by the chat provider, drained by the host. */
  pendingChat: string[] = [];
}
