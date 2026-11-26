/**
 * HQ ↔ Marion Mystery bridge. Watches the Mystery client store and publishes
 * `arcade.*` MarionEvents onto the HQ bus at the right moments:
 *
 * - `arcade.player_joined` when a Marion bot (a lobby player with a `look`)
 *   appears in the room — once per bot per room session;
 * - `arcade.match_started` when the room enters the `match` stage — once per match;
 * - `arcade.match_ended` when the snapshot carries a result — once per match.
 *
 * The pure `createArcadeBridge` takes any store with zustand's
 * `getState/subscribe` shape (tests drive it with a fake). `startArcadeBridge`
 * wires the real Mystery store; this module is only loaded lazily together with
 * the game, so the HQ bundle never pulls in the Mystery client.
 */
import { ARCADE_MODES, ARCADE_TEAMS, makeEvent, type ArcadeMode, type ArcadeResultRow, type ArcadeTeam, type MarionEvent } from '../adapters/events';
import { ARCADE_YOU } from '../game/mechanics';
import { useMystery } from '../mystery/client/store';
import type { ArcadeIntent } from './state';

/** The slice of the Mystery store the bridge reads (structural, JSON-simple). */
export interface MysteryRoomLike {
  code: string;
  stage: 'lobby' | 'countdown' | 'match' | 'results';
  settings: { mode: string; map: string };
  players: { id: string; name: string; kind: 'bot' | 'human' | 'agent'; look?: string }[];
}

export interface MysterySnapLike {
  mode?: string;
  map?: string;
  result: {
    winningTeam: string;
    reason: string;
    winners: string[];
    mvp: string | null;
    endedAt: number;
    roles: Record<string, string>;
  } | null;
}

export interface MysteryViewLike {
  pid: string;
  room: MysteryRoomLike | null;
  snap: MysterySnapLike | null;
}

export interface MysteryStoreLike<S extends MysteryViewLike = MysteryViewLike> {
  getState(): S;
  subscribe(listener: (state: S, prev: S) => void): () => void;
}

const asMode = (m: string | undefined): ArcadeMode => ((ARCADE_MODES as readonly string[]).includes(m ?? '') ? (m as ArcadeMode) : 'classic');
const asTeam = (t: string): ArcadeTeam => ((ARCADE_TEAMS as readonly string[]).includes(t) ? (t as ArcadeTeam) : 'draw');

/** Map a Mystery player id to the HQ id used on the leaderboard ('you', a Marion bot id, or null). */
function hqIdFor(room: MysteryRoomLike, pid: string, playerId: string): string | null {
  if (playerId === pid) return ARCADE_YOU;
  const p = room.players.find((q) => q.id === playerId);
  return p?.look ?? null;
}

export function createArcadeBridge(store: MysteryStoreLike, publish: (ev: MarionEvent) => void): () => void {
  let roomCode: string | null = null;
  let stage: MysteryRoomLike['stage'] | null = null;
  let generation = 0;
  let startedGen = -1;
  const joined = new Set<string>();
  const ended = new Set<string>();

  const matchId = () => `mm-${roomCode ?? 'solo'}-${generation}`;

  const check = (s: MysteryViewLike) => {
    const room = s.room;
    if (!room) {
      roomCode = null;
      stage = null;
      joined.clear();
      return;
    }
    if (room.code !== roomCode) {
      roomCode = room.code;
      stage = null;
      joined.clear();
    }
    // Back in the lobby after a match: the next match seats everyone again.
    if (room.stage === 'lobby' && (stage === 'match' || stage === 'results')) joined.clear();

    // Marion bots taking a seat at the cabinet.
    for (const p of room.players) {
      if (!p.look || p.id === s.pid || joined.has(p.look)) continue;
      joined.add(p.look);
      publish(makeEvent('arcade.player_joined', { botId: p.look, name: p.name, matchId: matchId() }));
    }

    // Lobby → match: one match_started per match.
    if (room.stage === 'match' && stage !== 'match') {
      generation++;
      if (startedGen !== generation) {
        startedGen = generation;
        const bots = Array.from(new Set(room.players.filter((p) => p.look && p.id !== s.pid).map((p) => p.look!)));
        publish(
          makeEvent('arcade.match_started', {
            matchId: matchId(),
            mode: asMode(room.settings.mode),
            map: String(room.settings.map ?? 'hq'),
            players: room.players.length,
            bots,
          }),
        );
      }
    }
    stage = room.stage;

    // Result: one match_ended per match.
    const result = s.snap?.result;
    if (result) {
      const key = `${room.code}|${result.endedAt}`;
      if (!ended.has(key)) {
        ended.add(key);
        const rows: ArcadeResultRow[] = [];
        const seen = new Set<string>();
        for (const p of room.players) {
          const id = hqIdFor(room, s.pid, p.id);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          rows.push({ botId: id, won: result.winners.includes(p.id), role: result.roles[p.id] ?? 'unknown' });
        }
        const mvp = result.mvp ? hqIdFor(room, s.pid, result.mvp) : null;
        publish(
          makeEvent('arcade.match_ended', {
            matchId: matchId(),
            mode: asMode(s.snap?.mode ?? room.settings.mode),
            map: String(s.snap?.map ?? room.settings.map ?? 'hq'),
            winningTeam: asTeam(result.winningTeam),
            reason: String(result.reason),
            mvp: mvp ?? undefined,
            results: rows,
          }),
        );
      }
    }
  };

  check(store.getState());
  const unsub = store.subscribe((st) => check(st));
  return unsub;
}

/** Wire the real Marion Mystery client store to the HQ bus. */
export function startArcadeBridge(publish: (ev: MarionEvent) => void): () => void {
  return createArcadeBridge(useMystery as unknown as MysteryStoreLike, publish);
}

/** Marion bots seated by "Quick Play vs Marion bots". */
export const QUICK_PLAY_LOOKS = ['daniel', 'moose', 'kanye', 'barry', 'greek', 'quill', 'sift'] as const;

/**
 * Apply a launch intent from the Arcade panel. Quick Play opens a local solo
 * room and seats the Marion crew as agents (so they show up in the lobby, and
 * walk to the HQ Arcade); Join connects to a room code.
 */
export function runIntent(intent: ArcadeIntent): () => void {
  const m = useMystery.getState();
  if (m.room) return () => undefined; // already in a room: just show it
  if (intent.kind === 'join') {
    m.joinRoom(intent.code);
    return () => undefined;
  }
  if (intent.kind !== 'quick') return () => undefined;
  m.startSolo();
  let seated = false;
  const seat = () => {
    const st = useMystery.getState();
    if (seated || !st.room || st.room.stage !== 'lobby' || st.room.hostId !== st.pid) return;
    seated = true;
    const have = new Set(st.room.players.map((p) => p.look).filter(Boolean));
    for (const look of QUICK_PLAY_LOOKS) if (!have.has(look)) st.send({ t: 'host.addBot', look });
    unsub();
  };
  const unsub = useMystery.subscribe(seat);
  seat();
  return unsub;
}
