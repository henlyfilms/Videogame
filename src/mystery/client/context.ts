/**
 * What the action buttons would do right now: nearest usable station, kill /
 * shoot / report / vent targets. Computed client-side from the (filtered)
 * snapshot; the server re-validates every action anyway.
 */
import { dist, INTERACT_RANGE, lineOfSight, type CompiledMap } from '../core/map';
import { GUN_RANGE, REPORT_RANGE, VENT_RANGE } from '../core/match';
import { MODES } from '../core/modes';
import type { Snapshot } from '../core/project';
import { ROLES } from '../core/roles';
import { KILL_RANGE, type Settings } from '../core/settings';
import { TASK_BY_ID } from '../core/tasks';
import type { FacilityKind, StationKind, Vec2 } from '../core/types';
import { runtime } from './runtime';

export type UseKind = 'task' | 'fake' | 'emergency' | 'facility' | 'fix' | 'critical' | 'gun' | 'battery' | 'wardrobe' | 'laptop' | 'lantern';

export interface UseTarget {
  kind: UseKind;
  id: string;
  station?: StationKind;
  label: string;
  pos: Vec2;
}

export interface Context {
  use: UseTarget | null;
  kill: string | null;
  shoot: string | null;
  report: string | null;
  vent: string | null;
  inspect: string | null;
  near: string | null;
  highlight: Set<string>;
}

const FACILITY_LABEL: Partial<Record<FacilityKind, string>> = {
  admin: 'Admin map',
  cams: 'Security cams',
  vitals: 'Vitals',
  doorlog: 'Door log',
  emergency: 'Emergency button',
};

export function computeContext(snap: Snapshot | null, map: CompiledMap, settings: Settings | null, lobby = false): Context {
  const me = runtime.local.pos;
  const ctx: Context = { use: null, kill: null, shoot: null, report: null, vent: null, inspect: null, near: null, highlight: new Set() };
  if (lobby) {
    let best: UseTarget | null = null;
    let bd = INTERACT_RANGE + 0.4;
    for (const s of map.def.stations) {
      const d = dist(s, me);
      if (d < bd && (s.kind === 'wardrobe' || s.kind === 'laptop')) {
        bd = d;
        best = { kind: s.kind, id: s.id, station: s.kind, label: s.kind === 'wardrobe' ? 'Wardrobe' : 'Match settings', pos: s };
      }
    }
    ctx.use = best;
    ctx.near = best?.id ?? null;
    return ctx;
  }
  if (!snap || snap.phase !== 'play' || !settings) return ctx;
  const you = snap.you;
  const mode = MODES[snap.mode];
  const closed = new Set(snap.sabotage.closedDoors);
  // Highlights: next step of each task.
  for (const t of you.tasks) if (!t.done && t.stations[t.step]) ctx.highlight.add(t.stations[t.step]!);
  const sab = snap.sabotage.active;
  const candidates: (UseTarget & { d: number })[] = [];
  const add = (u: UseTarget) => {
    const d = dist(u.pos, me);
    if (d <= INTERACT_RANGE + 0.15) candidates.push({ ...u, d });
  };
  if (you.alive || settings.ghostTasks) {
    for (const t of you.tasks) {
      if (t.done) continue;
      const sid = t.stations[t.step];
      const st = sid ? map.stationById.get(sid) : null;
      if (!st) continue;
      const def = TASK_BY_ID[t.taskId];
      add({ kind: t.fake ? 'fake' : 'task', id: st.id, station: st.kind, label: def?.name ?? 'Task', pos: st });
    }
  }
  if (you.alive) {
    for (const st of map.def.stations) {
      const k = st.kind;
      if (k === 'emergency' && mode.meetings) add({ kind: 'emergency', id: st.id, station: k, label: 'Emergency meeting', pos: st });
      else if ((k === 'admin' || k === 'cams' || k === 'vitals' || k === 'doorlog') && mode.id !== 'hideseek') add({ kind: 'facility', id: st.id, station: k, label: FACILITY_LABEL[k] ?? k, pos: st });
      else if ((k === 'lightsPanel' && sab === 'lights') || (k === 'commsPanel' && sab === 'comms')) add({ kind: 'fix', id: st.id, station: k, label: k === 'lightsPanel' ? 'Fix lights' : 'Fix comms', pos: st });
      else if (((k === 'meltdownA' || k === 'meltdownB') && sab === 'meltdown') || ((k === 'pressureA' || k === 'pressureB') && sab === 'pressure'))
        add({ kind: 'critical', id: st.id, station: k, label: 'Hold to fix', pos: st });
    }
    if (snap.gunDrop && you.team === 'crew' && !you.hasGun) add({ kind: 'gun', id: 'gun', label: 'Pick up the gun', pos: snap.gunDrop });
    for (const b of snap.batteries) add({ kind: 'battery', id: b.id, label: 'Grab battery', pos: b.pos });
  }
  candidates.sort((a, b) => {
    const pr = (u: UseTarget) => (u.kind === 'critical' || u.kind === 'fix' ? 0 : u.kind === 'task' || u.kind === 'fake' ? 1 : 2);
    return pr(a) - pr(b) || a.d - b.d;
  });
  ctx.use = candidates[0] ?? null;
  ctx.near = ctx.use?.id ?? null;
  if (!you.alive || you.inVent) {
    if (you.inVent) ctx.vent = you.inVent;
    return ctx;
  }
  const role = ROLES[you.role];
  const others = snap.players.filter((p) => p.id !== you.id && p.pos && p.alive && !p.ghost);
  const nearest = (range: number, filter: (id: string) => boolean) => {
    let best: string | null = null;
    let bd = range;
    for (const p of others) {
      if (!filter(p.id)) continue;
      const pos = runtime.remote(p.id)?.pos ?? p.pos!;
      const d = dist(pos, me);
      if (d <= bd && lineOfSight(map, me, pos, closed)) {
        bd = d;
        best = p.id;
      }
    }
    return best;
  };
  const teammate = (id: string) => {
    const r = snap.players.find((p) => p.id === id)?.role;
    return !!r && ROLES[r].team === 'murderers';
  };
  if (role.canKill && !(snap.hns && snap.t < snap.hns.hideUntil && you.role === 'seeker')) {
    const range = snap.hns ? 1.4 : KILL_RANGE[settings.killDistance];
    ctx.kill = nearest(range, (id) => !teammate(id));
  }
  if (you.hasGun) ctx.shoot = nearest(GUN_RANGE, () => true);
  if (mode.reports) {
    let bd = REPORT_RANGE;
    for (const b of snap.bodies) {
      const d = dist(b.pos, me);
      if (d <= bd) {
        bd = d;
        ctx.report = b.id;
      }
    }
    if (you.role === 'detective' && ctx.report && !you.clues.some((c) => c.bodyId === ctx.report)) ctx.inspect = ctx.report;
  }
  if (role.canVent && (you.role !== 'hider' || you.ventUses > 0)) {
    let bd = VENT_RANGE;
    for (const v of map.def.vents) {
      const d = dist(v, me);
      if (d <= bd) {
        bd = d;
        ctx.vent = v.id;
      }
    }
  }
  return ctx;
}
