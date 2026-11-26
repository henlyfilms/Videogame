/**
 * Role catalogue + role assignment. Assignment is deterministic per seed and
 * always respects the configured counts (clamped so the game stays winnable).
 */
import { Rng } from './rng';
import type { ModeId, RoleId, Team } from './types';

export interface RoleDef {
  id: RoleId;
  name: string;
  team: Team;
  /** Short line on the reveal card. */
  blurb: string;
  /** Longer help entry. */
  help: string;
  abilities: string[];
  canKill: boolean;
  canVent: boolean;
  canSabotage: boolean;
  /** Counts as a "killer" for crew win (all killers gone → crew wins). */
  killer: boolean;
  color: string;
  icon: string; // UI glyph id
  /** Can be configured in the role table (seeker/hider are mode-driven). */
  configurable: boolean;
  /** Higher-priority roles are assigned first when slots are scarce. */
  priority: number;
}

export const ROLES: Record<RoleId, RoleDef> = {
  crewmate: {
    id: 'crewmate',
    name: 'Crewmate',
    team: 'crew',
    blurb: 'Finish your tasks. Find the murderers.',
    help: 'Complete tasks to fill the crew bar, report bodies, and vote out the murderers in meetings.',
    abilities: ['Tasks', 'Report', 'Emergency meeting'],
    canKill: false,
    canVent: false,
    canSabotage: false,
    killer: false,
    color: '#6ea1ff',
    icon: 'berry',
    configurable: false,
    priority: 0,
  },
  sheriff: {
    id: 'sheriff',
    name: 'Sheriff',
    team: 'crew',
    blurb: 'You carry the only gun. Make every shot count.',
    help: 'Shoot a player in range. Hit a murderer and they are out. Misfire on an innocent and the misfire rule applies. If you die, your gun drops and any crewmate can pick it up as the Hero.',
    abilities: ['Shoot (cooldown)', 'Tasks'],
    canKill: false,
    canVent: false,
    canSabotage: false,
    killer: false,
    color: '#f5b83d',
    icon: 'gun',
    configurable: true,
    priority: 9,
  },
  detective: {
    id: 'detective',
    name: 'Detective',
    team: 'crew',
    blurb: 'Every body tells a story. Read it.',
    help: 'Inspect a body to learn how long ago it died and a hint about the killer (their berry type or colour family). You also see fresh footprints for a short time.',
    abilities: ['Inspect body', 'Footprints', 'Tasks'],
    canKill: false,
    canVent: false,
    canSabotage: false,
    killer: false,
    color: '#2dd4bf',
    icon: 'magnifier',
    configurable: true,
    priority: 6,
  },
  medic: {
    id: 'medic',
    name: 'Medic',
    team: 'crew',
    blurb: 'Shield one berry each round. Keep the vitals.',
    help: 'Shield one player per round. If the shield is hit you see a flash and the attack fails. You can also check vitals from anywhere for a few seconds each round.',
    abilities: ['Shield (1/round)', 'Portable vitals', 'Tasks'],
    canKill: false,
    canVent: false,
    canSabotage: false,
    killer: false,
    color: '#4ade80',
    icon: 'cross',
    configurable: true,
    priority: 5,
  },
  engineer: {
    id: 'engineer',
    name: 'Engineer',
    team: 'crew',
    blurb: 'You know the vents. And how to fix anything.',
    help: 'Use vents like the murderers do, and remotely fix one sabotage per match from anywhere.',
    abilities: ['Vents', 'Remote fix (1/match)', 'Tasks'],
    canKill: false,
    canVent: true,
    canSabotage: false,
    killer: false,
    color: '#fb923c',
    icon: 'wrench',
    configurable: true,
    priority: 4,
  },
  lookout: {
    id: 'lookout',
    name: 'Lookout',
    team: 'crew',
    blurb: 'Eyes everywhere. Place one camera of your own.',
    help: 'Security cameras work for you even during comms sabotage, and you can place one portable camera anywhere on the map.',
    abilities: ['Portable camera', 'Comms-proof cams', 'Tasks'],
    canKill: false,
    canVent: false,
    canSabotage: false,
    killer: false,
    color: '#a78bfa',
    icon: 'eye',
    configurable: true,
    priority: 3,
  },
  tracker: {
    id: 'tracker',
    name: 'Tracker',
    team: 'crew',
    blurb: 'Tag a berry. Follow their every step.',
    help: 'Tag a nearby player and see an arrow to them for a while. Recharges each round.',
    abilities: ['Track (cooldown)', 'Tasks'],
    canKill: false,
    canVent: false,
    canSabotage: false,
    killer: false,
    color: '#38bdf8',
    icon: 'arrow',
    configurable: true,
    priority: 3,
  },
  mayor: {
    id: 'mayor',
    name: 'Mayor',
    team: 'crew',
    blurb: 'Your vote counts double.',
    help: 'Your vote counts twice. With the reveal rule, you can reveal yourself in a meeting to gain a third vote, but everyone knows who you are.',
    abilities: ['Double vote', 'Reveal (optional)', 'Tasks'],
    canKill: false,
    canVent: false,
    canSabotage: false,
    killer: false,
    color: '#e879f9',
    icon: 'crown',
    configurable: true,
    priority: 2,
  },
  murderer: {
    id: 'murderer',
    name: 'Murderer',
    team: 'murderers',
    blurb: 'Blend in. Sabotage. Eliminate the crew.',
    help: 'Kill with your knife (cooldown), throw it if enabled, sabotage the map, and use vents. Fake tasks to blend in.',
    abilities: ['Knife (cooldown)', 'Throw knife', 'Sabotage', 'Vents'],
    canKill: true,
    canVent: true,
    canSabotage: true,
    killer: true,
    color: '#ff4d5e',
    icon: 'knife',
    configurable: true,
    priority: 10,
  },
  accomplice: {
    id: 'accomplice',
    name: 'Accomplice',
    team: 'murderers',
    blurb: 'No knife. All chaos.',
    help: 'You cannot kill, but you can sabotage and use vents to help the murderers. Depending on settings, you know who they are.',
    abilities: ['Sabotage', 'Vents'],
    canKill: false,
    canVent: true,
    canSabotage: true,
    killer: false,
    color: '#f472b6',
    icon: 'mask',
    configurable: true,
    priority: 7,
  },
  poisoner: {
    id: 'poisoner',
    name: 'Poisoner',
    team: 'murderers',
    blurb: 'A touch now. A fall later.',
    help: 'Poison a player; they collapse a few seconds later, wherever they are. If a meeting starts first, they collapse as it begins.',
    abilities: ['Poison (cooldown)', 'Sabotage', 'Vents'],
    canKill: true,
    canVent: true,
    canSabotage: true,
    killer: true,
    color: '#a3e635',
    icon: 'vial',
    configurable: true,
    priority: 8,
  },
  jester: {
    id: 'jester',
    name: 'Jester',
    team: 'neutral',
    blurb: 'Get yourself voted out. That is the whole plan.',
    help: 'You win if the crew votes you out in a meeting. You have fake tasks and cannot kill.',
    abilities: ['Act suspicious'],
    canKill: false,
    canVent: false,
    canSabotage: false,
    killer: false,
    color: '#facc15',
    icon: 'jester',
    configurable: true,
    priority: 5,
  },
  survivor: {
    id: 'survivor',
    name: 'Survivor',
    team: 'neutral',
    blurb: 'Whoever wins, you just need to be alive.',
    help: 'You win alongside whichever team wins, as long as you are still alive at the end.',
    abilities: ['Stay alive'],
    canKill: false,
    canVent: false,
    canSabotage: false,
    killer: false,
    color: '#94a3b8',
    icon: 'shield',
    configurable: true,
    priority: 4,
  },
  seeker: {
    id: 'seeker',
    name: 'Seeker',
    team: 'murderers',
    blurb: 'Everyone knows it is you. Find them all.',
    help: 'Hide & Seek: tag every hider before the clock runs out. You speed up in the final countdown.',
    abilities: ['Tag', 'Danger meter'],
    canKill: true,
    canVent: false,
    canSabotage: false,
    killer: true,
    color: '#ff4d5e',
    icon: 'knife',
    configurable: false,
    priority: 10,
  },
  hider: {
    id: 'hider',
    name: 'Hider',
    team: 'crew',
    blurb: 'Hide. Do tasks to shorten the clock. Survive.',
    help: 'Hide & Seek: stay out of sight. Every task you finish takes time off the clock. Use vents to escape.',
    abilities: ['Tasks', 'Vents (limited)'],
    canKill: false,
    canVent: true,
    canSabotage: false,
    killer: false,
    color: '#6ea1ff',
    icon: 'berry',
    configurable: false,
    priority: 0,
  },
};

export const CONFIGURABLE_ROLES: readonly RoleId[] = (Object.keys(ROLES) as RoleId[]).filter((r) => ROLES[r].configurable);

export function teamOf(role: RoleId): Team {
  return ROLES[role].team;
}

export interface RoleSlot {
  count: number;
  /** 0-100. Each configured copy is included with this probability. */
  chance: number;
}

export type RoleTable = Record<RoleId, RoleSlot>;

export interface RoleValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function maxMurderers(players: number): number {
  // Murderer-team must stay strictly under half the lobby.
  return Math.max(1, Math.ceil(players / 2) - 1);
}

export function validateRoles(table: RoleTable, players: number, mode: ModeId): RoleValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (players < 4) errors.push('At least 4 players are needed to start.');
  if (players > 20) errors.push('At most 20 players can play.');
  if (mode === 'hideseek') return { ok: errors.length === 0, errors, warnings };
  const killers = table.murderer.count + table.poisoner.count;
  const murderTeam = killers + table.accomplice.count;
  if (killers < 1) errors.push('At least one Murderer or Poisoner is required.');
  if (murderTeam > maxMurderers(players))
    errors.push(`Too many on the murderer team: ${murderTeam} (max ${maxMurderers(players)} for ${players} players).`);
  let special = 0;
  for (const r of CONFIGURABLE_ROLES) special += table[r].count;
  if (special > players) errors.push(`More special roles (${special}) than players (${players}).`);
  if (table.sheriff.count > 0 && table.sheriff.count >= killers + 1)
    warnings.push('More sheriffs than murderers makes the crew very strong.');
  if (table.jester.count + table.survivor.count > Math.floor(players / 4))
    warnings.push('Lots of neutral roles can make games chaotic.');
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Assign roles to the given player ids. Returns map id -> role.
 * Counts are clamped to keep the game valid even if the table is not.
 */
export function assignRoles(
  playerIds: readonly string[],
  table: RoleTable,
  mode: ModeId,
  seed: number,
  opts: { seekers?: number } = {},
): Record<string, RoleId> {
  const rng = new Rng(seed ^ 0x9e3779b9);
  const ids = rng.shuffle([...playerIds]);
  const out: Record<string, RoleId> = {};
  const n = ids.length;
  if (mode === 'hideseek') {
    const seekers = Math.max(1, Math.min(opts.seekers ?? 1, Math.max(1, Math.floor(n / 3))));
    ids.forEach((id, i) => (out[id] = i < seekers ? 'seeker' : 'hider'));
    return out;
  }
  // Roll chance for each configured copy.
  const bag: RoleId[] = [];
  const byPriority = [...CONFIGURABLE_ROLES].sort((a, b) => ROLES[b].priority - ROLES[a].priority);
  for (const r of byPriority) {
    const slot = table[r];
    for (let i = 0; i < slot.count; i++) {
      if (r === 'murderer' || r === 'poisoner' || slot.chance >= 100 || rng.next() * 100 < slot.chance) bag.push(r);
    }
  }
  // Clamp murderer team.
  const cap = maxMurderers(n);
  let team = 0;
  const filtered: RoleId[] = [];
  for (const r of bag) {
    if (ROLES[r].team === 'murderers') {
      if (team >= cap) continue;
      team++;
    }
    filtered.push(r);
  }
  if (!filtered.some((r) => ROLES[r].killer)) {
    // Guarantee at least one killer.
    const i = filtered.findIndex((r) => ROLES[r].team === 'murderers');
    if (i >= 0) filtered[i] = 'murderer';
    else filtered.unshift('murderer');
  }
  const roles = filtered.slice(0, n);
  ids.forEach((id, i) => (out[id] = roles[i] ?? 'crewmate'));
  return out;
}
