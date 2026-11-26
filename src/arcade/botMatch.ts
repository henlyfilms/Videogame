/**
 * Bots-only Marion Mystery matches, played "off screen" by the HQ crew so the
 * Arcade feels alive. Used by the LiveSimAdapter and the ⌘K injector presets.
 * Everything comes from the supplied RNG, so the live sim stays deterministic.
 */
import { nextId, type ArcadeMode, type ArcadeResultRow, type ArcadeTeam, type EventPayloads } from '../adapters/events';
import { CORE_BOTS } from '../data/bots';
import { pick, type Rng } from '../game/content';

export const ARCADE_MAPS = ['hq', 'greenhouse', 'express', 'manor'] as const;

const CREW_ROLES = ['crewmate', 'crewmate', 'crewmate', 'sheriff', 'detective', 'medic', 'engineer', 'lookout'] as const;

export interface BotMatchPlan {
  matchId: string;
  joins: EventPayloads['arcade.player_joined'][];
  started: EventPayloads['arcade.match_started'];
  ended: EventPayloads['arcade.match_ended'];
}

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Plan one bots-only match: 3–5 Marion bots (optionally excluding busy ones),
 * a mode and map, and a plausible result with roles, winners and an MVP.
 */
export function planBotMatch(rng: Rng, exclude: readonly string[] = []): BotMatchPlan {
  const pool = CORE_BOTS.filter((b) => !exclude.includes(b.id));
  const roster = shuffled(rng, pool.length >= 3 ? pool : CORE_BOTS).slice(0, 3 + Math.floor(rng() * 3));
  const r = rng();
  const mode: ArcadeMode = r < 0.6 ? 'classic' : r < 0.82 ? 'lightsout' : 'hideseek';
  const map = pick(rng, ARCADE_MAPS);
  const matchId = nextId('mm');
  const players = Math.max(roster.length, 6 + Math.floor(rng() * 5));

  // Roles: one bot on the "other" team (murderer / seeker), the rest crew / hiders.
  const villain = Math.floor(rng() * roster.length);
  const villainWins = rng() < (mode === 'hideseek' ? 0.45 : 0.35);
  const winningTeam: ArcadeTeam = villainWins ? 'murderers' : 'crew';
  const results: ArcadeResultRow[] = roster.map((b, i) => {
    const isVillain = i === villain;
    const role = mode === 'hideseek' ? (isVillain ? 'seeker' : 'hider') : isVillain ? 'murderer' : pick(rng, CREW_ROLES);
    return { botId: b.id, won: isVillain === villainWins, role };
  });
  const winners = results.filter((x) => x.won);
  const mvp = winners.length ? pick(rng, winners).botId : undefined;
  const reason =
    mode === 'hideseek'
      ? villainWins
        ? 'all-found'
        : 'hiders-survived'
      : villainWins
        ? pick(rng, ['parity', 'critical'] as const)
        : pick(rng, ['tasks', 'murderers-eliminated'] as const);

  return {
    matchId,
    joins: roster.map((b) => ({ botId: b.id, name: b.name, matchId })),
    started: { matchId, mode, map, players, bots: roster.map((b) => b.id) },
    ended: { matchId, mode, map, winningTeam, reason, mvp, results },
  };
}
