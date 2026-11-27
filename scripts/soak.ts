/**
 * Soak test: back-to-back 20-bot matches across every mode and map at
 * accelerated tick, until N simulated hours have passed.
 *   npx tsx scripts/soak.ts [hours=20]
 * Fails on: exceptions, matches that never end (stuck > 30 sim-min),
 * or heap growth beyond 200 MB between the first and last quarter.
 */
import { Room } from '../src/mystery/server/room';
import { sanitizeSettings } from '../src/mystery/core/settings';
import type { MapId, ModeId } from '../src/mystery/core/types';

const hours = Number(process.argv[2] ?? 20);
const target = hours * 3600;
const modes: ModeId[] = ['classic', 'lightsout', 'hideseek'];
const maps: MapId[] = ['hq', 'greenhouse', 'express', 'manor'];
let simTime = 0;
let matches = 0;
const outcomes: Record<string, number> = {};
const t0 = Date.now();
const heap: number[] = [];
let i = 0;
while (simTime < target) {
  const mode = modes[i % modes.length]!;
  const map = maps[Math.floor(i / modes.length) % maps.length]!;
  const room = new Room('SOAKSK', { seed: i + 1 }, i + 1);
  room.settings = sanitizeSettings({ ...room.settings, mode, map, maxPlayers: 20, durationMin: 15, botDifficulty: (['easy', 'normal', 'sharp'] as const)[i % 3] });
  for (let b = 0; b < 20; b++) room.addBot();
  (room as unknown as { startMatch(): void }).startMatch();
  let ticks = 0;
  while (room.stage !== 'results') {
    room.update(1 / 30);
    if (++ticks > 30 * 60 * 30) throw new Error(`stuck match: ${mode} on ${map} (seed ${i + 1})`);
  }
  const st = room.match!;
  simTime += st.t;
  matches++;
  const k = `${mode}:${st.result!.winningTeam}:${st.result!.reason}`;
  outcomes[k] = (outcomes[k] ?? 0) + 1;
  if (matches % 10 === 0) {
    heap.push(process.memoryUsage().heapUsed / 1e6);
    console.log(`${matches} matches · ${(simTime / 3600).toFixed(2)} sim-h · ${((Date.now() - t0) / 1000).toFixed(0)} s real · heap ${heap.at(-1)!.toFixed(0)} MB`);
  }
  i++;
}
const q = Math.max(1, Math.floor(heap.length / 4));
const early = heap.slice(0, q).reduce((a, b) => a + b, 0) / q;
const late = heap.slice(-q).reduce((a, b) => a + b, 0) / q;
console.log(JSON.stringify({ matches, simHours: +(simTime / 3600).toFixed(2), realSeconds: Math.round((Date.now() - t0) / 1000), heapEarlyMB: +early.toFixed(0), heapLateMB: +late.toFixed(0), outcomes }, null, 2));
if (late - early > 200) {
  console.error('Possible leak: heap grew by', (late - early).toFixed(0), 'MB');
  process.exit(1);
}
