/**
 * Task catalogue and assignment. Each task maps to one or more stations on a
 * map (by station kind) and to a mini-game id the client renders.
 */
import type { CompiledMap } from './map';
import { Rng } from './rng';
import type { AssignedTask, ModeId, StationKind, TaskLength } from './types';

export interface TaskDef {
  id: string;
  name: string;
  length: TaskLength;
  steps: StationKind[];
  /** Bystanders can see this task happen (proves innocence). */
  visual: boolean;
  /** Minimum seconds the mini-game must be open before the server accepts it. */
  minTime: number;
  modes?: ModeId[];
  /** Marion-themed tasks show a little HQ badge. */
  marion?: boolean;
  blurb: string;
}

export const TASKS: TaskDef[] = [
  // Common (everyone gets the same one)
  { id: 'swipeBadge', name: 'Swipe Badge', length: 'common', steps: ['swipeBadge'], visual: false, minTime: 1.2, blurb: 'Swipe at the right speed.' },
  { id: 'fixWiring', name: 'Fix Wiring', length: 'common', steps: ['fixWiring'], visual: false, minTime: 2, blurb: 'Match the colours and shapes.' },
  { id: 'keypadCode', name: 'Enter Keypad Code', length: 'common', steps: ['keypadCode'], visual: false, minTime: 2, blurb: 'Punch in the code from the sticky note.' },
  // Short
  { id: 'stampMail', name: 'Approve-Stamp Mail', length: 'short', steps: ['stampMail'], visual: false, minTime: 2, marion: true, blurb: 'Only the brass stamp sends. Stamp the good ones.' },
  { id: 'sortClips', name: 'Sort Clips', length: 'short', steps: ['sortClips'], visual: false, minTime: 2.5, marion: true, blurb: 'Keepers left, outtakes right.' },
  { id: 'distillReel', name: 'Distill a Reel', length: 'short', steps: ['distillReel'], visual: false, minTime: 2, marion: true, blurb: 'Drop the reel in the chute and pull the lever.' },
  { id: 'slotCartridge', name: 'Slot Skill Cartridge', length: 'short', steps: ['slotCartridge'], visual: false, minTime: 1.5, marion: true, blurb: 'Seat the cartridge in the matching slot.' },
  { id: 'calibrateTurntable', name: 'Calibrate Turntable', length: 'short', steps: ['calibrateTurntable'], visual: false, minTime: 2, marion: true, blurb: 'Bring the pitch back to 72 bpm.' },
  { id: 'sortBerries', name: 'Sort Berries by Ripeness', length: 'short', steps: ['sortBerries'], visual: false, minTime: 2.5, marion: true, blurb: 'Ripe, almost, not yet.' },
  { id: 'alignDish', name: 'Align Satellite Dish', length: 'short', steps: ['alignDish'], visual: false, minTime: 2, blurb: 'Rotate until the signal locks.' },
  { id: 'waterPlants', name: 'Water Plants', length: 'short', steps: ['waterPlants'], visual: false, minTime: 2, blurb: 'Fill each pot to the line.' },
  { id: 'cleanFilter', name: 'Clean Filter', length: 'short', steps: ['cleanFilter'], visual: false, minTime: 2, blurb: 'Swipe out every leaf and seed.' },
  { id: 'unlockManifold', name: 'Unlock Manifold', length: 'short', steps: ['unlockManifold'], visual: false, minTime: 2, blurb: 'Press 1 to 10 in order.' },
  { id: 'simonSays', name: 'Repeat the Pattern', length: 'short', steps: ['simonSays'], visual: false, minTime: 3, blurb: 'Watch the lights, then repeat them.' },
  { id: 'emptyChute', name: 'Empty the Chute', length: 'short', steps: ['emptyChute'], visual: true, minTime: 2, blurb: 'Hold the lever until the chute is clear.' },
  { id: 'medScan', name: 'Submit Scan', length: 'short', steps: ['medScan'], visual: true, minTime: 6, blurb: 'Stand still on the scanner.' },
  { id: 'primeShields', name: 'Prime Shields', length: 'short', steps: ['primeShields'], visual: true, minTime: 1.5, blurb: 'Tap every red hex.' },
  { id: 'chartCourse', name: 'Chart Course', length: 'short', steps: ['chartCourse'], visual: false, minTime: 2, blurb: 'Drag the ship through the waypoints.' },
  // Long / multi-step
  { id: 'transferData', name: 'Transfer Data', length: 'long', steps: ['download', 'upload'], visual: false, minTime: 4, blurb: 'Download here, upload at Admin.' },
  { id: 'fuelEngine', name: 'Fuel the Engine', length: 'long', steps: ['fuelCan', 'fuelEngine'], visual: false, minTime: 2.5, blurb: 'Fill the can, then fuel the engine.' },
  { id: 'rerouteTube', name: 'Re-route Pneumatic Tube', length: 'long', steps: ['rerouteTube', 'rerouteTube'], visual: false, minTime: 2, marion: true, blurb: 'Rotate the pipes so the capsule reaches its port.' },
  { id: 'juicePress', name: 'Juice Press', length: 'long', steps: ['sortBerries', 'juicePress'], visual: true, minTime: 2.5, marion: true, blurb: 'Pick ripe berries, then press them.' },
  // Lights Out
  { id: 'replaceFuse', name: 'Replace Fuse', length: 'short', steps: ['replaceFuse'], visual: false, minTime: 2, modes: ['lightsout'], blurb: 'Find the blown fuse in the dark and swap it.' },
  { id: 'rechargeGenerator', name: 'Recharge Generator', length: 'short', steps: ['rechargeGenerator'], visual: true, minTime: 3, modes: ['lightsout'], blurb: 'Crank until the needle is green.' },
  { id: 'lightLanterns', name: 'Light the Lanterns', length: 'long', steps: ['lightLantern', 'lightLantern', 'lightLantern'], visual: true, minTime: 1.5, modes: ['lightsout'], blurb: 'Light three lanterns around the map.' },
];

export const TASK_BY_ID: Record<string, TaskDef> = Object.fromEntries(TASKS.map((t) => [t.id, t]));

/** Mini-game ids used by sabotage fixes (client renders them like tasks). */
export const FIX_GAMES = ['lightsPanel', 'commsPanel', 'handprint'] as const;

/** Tasks that are possible on this map (all step stations exist). */
export function availableTasks(m: CompiledMap, mode: ModeId): TaskDef[] {
  const kinds = new Set(m.def.stations.map((s) => s.kind));
  return TASKS.filter((t) => (!t.modes || t.modes.includes(mode)) && t.steps.every((k) => kinds.has(k)));
}

function stationsFor(m: CompiledMap, kind: StationKind): string[] {
  return m.def.stations.filter((s) => s.kind === kind).map((s) => s.id);
}

/**
 * Build task lists. Common tasks are shared (same stations) by everyone.
 * Returns a function so each player gets their own short/long picks.
 */
export function makeTaskAssigner(
  m: CompiledMap,
  mode: ModeId,
  counts: { common: number; short: number; long: number },
  seed: number,
): (playerIndex: number) => AssignedTask[] {
  const rng = new Rng(seed ^ 0x51f15e);
  const avail = availableTasks(m, mode);
  const pickStations = (t: TaskDef, r: Rng): string[] => {
    const used = new Set<string>();
    return t.steps.map((k) => {
      const opts = stationsFor(m, k).filter((s) => !used.has(s));
      const id = opts.length ? r.pick(opts) : r.pick(stationsFor(m, k));
      used.add(id);
      return id;
    });
  };
  const commons = rng.shuffle(avail.filter((t) => t.length === 'common')).slice(0, counts.common);
  const commonAssigned = commons.map((t) => ({ taskId: t.id, stations: pickStations(t, rng) }));
  // Lights Out tasks are favoured in Lights Out so the mode feels distinct.
  const shorts = avail.filter((t) => t.length === 'short');
  const longs = avail.filter((t) => t.length === 'long');
  return (playerIndex: number) => {
    const r = new Rng((seed ^ (playerIndex * 2654435761)) >>> 0);
    const pickN = (pool: TaskDef[], n: number) => {
      const ordered = r.shuffle([...pool]);
      if (mode === 'lightsout') ordered.sort((a, b) => (b.modes ? 1 : 0) - (a.modes ? 1 : 0));
      return ordered.slice(0, Math.min(n, ordered.length));
    };
    const list: AssignedTask[] = commonAssigned.map((c) => ({ ...c, stations: [...c.stations], step: 0, done: false }));
    for (const t of pickN(longs, counts.long)) list.push({ taskId: t.id, stations: pickStations(t, r), step: 0, done: false });
    for (const t of pickN(shorts, counts.short)) list.push({ taskId: t.id, stations: pickStations(t, r), step: 0, done: false });
    return list;
  };
}

export function taskStepCount(t: AssignedTask): number {
  return t.stations.length;
}
