/**
 * Balance harness: N seeded all-bot matches per map × mode × player count with
 * each mode's default preset, printing win rates, match length, how matches
 * ended, vote accuracy and stuck-bot counts.
 *   npx tsx scripts/balance.ts [--n 20] [--modes classic,lightsout,hideseek]
 *     [--maps hq,greenhouse,express,manor] [--players 8,10,12] [--diff normal]
 *     [--preset chaos] [--seed 1] [--json]
 * The preset defaults to the mode's own (Classic / Lights Out / Hide & Seek);
 * any other preset (e.g. chaos, which adds a jester) is applied on top of it.
 */
import { Room } from '../src/mystery/server/room';
import { PRESETS, sanitizeSettings, type BotDifficulty } from '../src/mystery/core/settings';
import { taskProgress } from '../src/mystery/core/match';
import type { MapId, ModeId } from '../src/mystery/core/types';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
}
const N = Number(arg('n', '20'));
const modes = arg('modes', 'classic,lightsout,hideseek').split(',') as ModeId[];
const maps = arg('maps', 'hq,greenhouse,express,manor').split(',') as MapId[];
const counts = arg('players', '8,10,12').split(',').map(Number);
const diff = arg('diff', 'normal') as BotDifficulty;
const seed0 = Number(arg('seed', '1'));
const extraPreset = arg('preset', '');
const json = process.argv.includes('--json');

const PRESET_FOR: Record<ModeId, string> = { classic: 'classic', lightsout: 'lightsout', hideseek: 'hideseek' };
const DT = 1 / 30;
const STUCK_SECONDS = 25;

interface Row {
  mode: ModeId;
  map: MapId;
  players: number;
  games: number;
  crew: number;
  murderers: number;
  neutral: number;
  draw: number;
  len: number;
  reasons: Record<string, number>;
  weapons: Record<string, number>;
  ejectMurderer: number;
  ejectInnocent: number;
  skips: number;
  meetings: number;
  kills: number;
  taskPct: number;
  criticals: number;
  stuck: number;
  noFinish: number;
}

function runOne(mode: ModeId, map: MapId, players: number, seed: number) {
  const room = new Room('BALNCE', { seed }, seed);
  const preset = PRESETS.find((p) => p.id === PRESET_FOR[mode])!;
  let s = preset.apply(room.settings);
  const extra = extraPreset ? PRESETS.find((p) => p.id === extraPreset) : null;
  if (extra) s = { ...extra.apply(s), mode };
  room.settings = sanitizeSettings({ ...s, map, maxPlayers: Math.max(players, 12), botDifficulty: diff });
  for (let b = 0; b < players; b++) room.addBot();
  (room as unknown as { startMatch(): void }).startMatch();
  const st = room.match!;
  const ctx = { map: (room as unknown as { ctx: { map: never } }).ctx.map, settings: room.settings };
  let ticks = 0;
  let prevPhase = st.phase;
  const ej = { murderer: 0, innocent: 0, skip: 0 };
  let criticals = 0;
  let prevSab: string | null = null;
  // Stuck detection: an alive bot whose position barely changes for STUCK_SECONDS of play time.
  const still = new Map<string, { x: number; y: number; t: number }>();
  const stuck = new Set<string>();
  while (room.stage === 'match') {
    room.update(DT);
    if (++ticks > 30 * 60 * 40) break;
    if (st.phase === 'eject' && prevPhase !== 'eject') {
      const e = st.lastEject;
      if (e?.ejectedId) {
        const p = st.players[e.ejectedId]!;
        if (p.team === 'murderers') ej.murderer++;
        else ej.innocent++;
      } else ej.skip++;
    }
    prevPhase = st.phase;
    const sab = st.sabotage.active;
    if (sab !== prevSab && (sab === 'meltdown' || sab === 'pressure')) criticals++;
    prevSab = sab;
    if (st.phase !== 'play') {
      still.clear();
      continue;
    }
    if (ticks % 15 !== 0) continue;
    for (const p of Object.values(st.players)) {
      if (!p.alive || p.inVent) {
        still.delete(p.id);
        continue;
      }
      const s = still.get(p.id);
      if (!s || Math.hypot(s.x - p.pos.x, s.y - p.pos.y) > 0.75) still.set(p.id, { x: p.pos.x, y: p.pos.y, t: st.t });
      else if (st.t - s.t > STUCK_SECONDS) stuck.add(p.id);
    }
  }
  const kills = st.events.filter((e) => e.type === 'kill').length;
  const weapons: Record<string, number> = {};
  for (const e of st.events) {
    if (e.type === 'kill') weapons[String(e.data?.weapon ?? '?')] = (weapons[String(e.data?.weapon ?? '?')] ?? 0) + 1;
    if (e.type === 'misfire') weapons.misfire = (weapons.misfire ?? 0) + 1;
  }
  const tp = taskProgress(st, ctx as never);
  return {
    winner: st.result?.winningTeam ?? 'none',
    reason: st.result?.reason ?? 'unfinished',
    len: st.t,
    ej,
    meetings: st.meetingsHeld,
    kills,
    weapons,
    taskPct: tp.total ? tp.done / tp.total : 0,
    criticals,
    stuck: stuck.size,
    finished: !!st.result,
  };
}

const rows: Row[] = [];
const t0 = Date.now();
for (const mode of modes) {
  for (const map of maps) {
    for (const players of counts) {
      const r: Row = { mode, map, players, games: 0, crew: 0, murderers: 0, neutral: 0, draw: 0, len: 0, reasons: {}, weapons: {}, ejectMurderer: 0, ejectInnocent: 0, skips: 0, meetings: 0, kills: 0, taskPct: 0, criticals: 0, stuck: 0, noFinish: 0 };
      for (let i = 0; i < N; i++) {
        const o = runOne(mode, map, players, seed0 + i * 7919 + players * 31);
        r.games++;
        if (o.winner === 'crew') r.crew++;
        else if (o.winner === 'murderers') r.murderers++;
        else if (o.winner === 'neutral') r.neutral++;
        else r.draw++;
        r.len += o.len;
        r.reasons[o.reason] = (r.reasons[o.reason] ?? 0) + 1;
        for (const [k, v] of Object.entries(o.weapons)) r.weapons[k] = (r.weapons[k] ?? 0) + v;
        r.ejectMurderer += o.ej.murderer;
        r.ejectInnocent += o.ej.innocent;
        r.skips += o.ej.skip;
        r.meetings += o.meetings;
        r.kills += o.kills;
        r.taskPct += o.taskPct;
        r.criticals += o.criticals;
        r.stuck += o.stuck;
        if (!o.finished) r.noFinish++;
      }
      rows.push(r);
      if (!json) {
        const pct = (n: number) => `${Math.round((100 * n) / r.games)}%`.padStart(4);
        const reasons = Object.entries(r.reasons)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}:${v}`)
          .join(' ');
        console.log(
          `${mode.padEnd(9)} ${map.padEnd(10)} ${String(players).padStart(2)}p  crew ${pct(r.crew)}  mur ${pct(r.murderers)}  neu ${pct(r.neutral)}  len ${(r.len / r.games).toFixed(0).padStart(4)}s  ` +
            `tasks ${Math.round((100 * r.taskPct) / r.games)}%  kills ${(r.kills / r.games).toFixed(1)}  mtg ${(r.meetings / r.games).toFixed(1)}  ej M/I/skip ${r.ejectMurderer}/${r.ejectInnocent}/${r.skips}  crit ${r.criticals}  stuck ${r.stuck}  [${reasons}]  {${Object.entries(r.weapons).map(([k, v]) => `${k}:${v}`).join(' ')}}`,
        );
      }
    }
  }
}
// Mode summaries.
for (const mode of modes) {
  const rs = rows.filter((r) => r.mode === mode);
  const g = rs.reduce((a, r) => a + r.games, 0);
  const sum = (k: keyof Row) => rs.reduce((a, r) => a + (r[k] as number), 0);
  const reasons: Record<string, number> = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.reasons)) reasons[k] = (reasons[k] ?? 0) + v;
  console.log(
    `== ${mode}: ${g} games  crew ${((100 * sum('crew')) / g).toFixed(1)}%  murderers ${((100 * sum('murderers')) / g).toFixed(1)}%  neutral ${((100 * sum('neutral')) / g).toFixed(1)}%  avg len ${(sum('len') / g).toFixed(0)}s  stuck ${sum('stuck')}  unfinished ${sum('noFinish')}  ${JSON.stringify(reasons)}`,
  );
}
if (json) console.log(JSON.stringify(rows));
console.error(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
