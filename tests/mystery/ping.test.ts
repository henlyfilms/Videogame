// @vitest-environment node
/**
 * "Look here" pings: placement (range cap, stops at walls), rate limit,
 * expiry and meeting reset, and who gets to see them.
 */
import { describe, expect, it } from 'vitest';
import { getMap } from '../../src/mystery/core/maps';
import { dist, lineOfSight, nearestFree } from '../../src/mystery/core/map';
import { applyAction, createMatch, PING_COOLDOWN, PING_RANGE, PING_TTL, pingSpot, tick, type MatchCtx, type PlayerSeed } from '../../src/mystery/core/match';
import { project } from '../../src/mystery/core/project';
import { defaultSettings, sanitizeSettings } from '../../src/mystery/core/settings';
import type { MatchState, Vec2 } from '../../src/mystery/core/types';
import { randomCosmetics } from '../../src/mystery/characters/catalog';

function setup(n = 5) {
  const settings = sanitizeSettings({ ...defaultSettings(), map: 'hq' });
  const ctx: MatchCtx = { map: getMap(settings.map), settings };
  const seeds: PlayerSeed[] = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: 'bot', platform: 'bot', cosmetics: randomCosmetics(i + 1) }));
  const st = createMatch(seeds, ctx, 99);
  for (const p of Object.values(st.players)) {
    p.role = p.id === 'p0' ? 'murderer' : 'crewmate';
    p.team = p.id === 'p0' ? 'murderers' : 'crew';
  }
  tick(st, ctx, 7);
  expect(st.phase).toBe('play');
  return { st, ctx };
}

/** Two stations as far apart as the map allows (no sight between them). */
function farPair(ctx: MatchCtx): [Vec2, Vec2] {
  const ss = ctx.map.def.stations;
  let best: [Vec2, Vec2] = [ss[0]!, ss[1]!];
  let bd = 0;
  for (const a of ss) for (const b of ss) if (dist(a, b) > bd) ((bd = dist(a, b)), (best = [a, b]));
  return [nearestFree(ctx.map, best[0]), nearestFree(ctx.map, best[1])];
}

const place = (st: MatchState, id: string, v: Vec2) => (st.players[id]!.pos = { ...v });

describe('pings', () => {
  it('lands within range and in sight, even when aimed through a wall', () => {
    const { st, ctx } = setup();
    const [a] = farPair(ctx);
    place(st, 'p1', a);
    for (const aim of [
      { x: a.x + 100, y: a.y },
      { x: a.x, y: a.y - 100 },
      { x: a.x - 3, y: a.y + 2 },
    ]) {
      const spot = pingSpot(ctx.map, a, aim);
      expect(dist(a, spot)).toBeLessThanOrEqual(PING_RANGE + 1e-6);
      expect(lineOfSight(ctx.map, a, spot)).toBe(true);
    }
    expect(applyAction(st, ctx, 'p1', { a: 'ping', x: a.x + 100, y: a.y }).ok).toBe(true);
    const p = st.players.p1!.ping!;
    expect(p).toBeTruthy();
    expect(lineOfSight(ctx.map, a, p)).toBe(true);
  });

  it('is rate limited and rejects bad input', () => {
    const { st, ctx } = setup();
    const at = st.players.p1!.pos;
    expect(applyAction(st, ctx, 'p1', { a: 'ping', x: NaN, y: 0 }).ok).toBe(false);
    expect(applyAction(st, ctx, 'p1', { a: 'ping', x: at.x + 1, y: at.y }).ok).toBe(true);
    expect(applyAction(st, ctx, 'p1', { a: 'ping', x: at.x + 1, y: at.y }).ok).toBe(false);
    tick(st, ctx, PING_COOLDOWN + 0.05);
    expect(applyAction(st, ctx, 'p1', { a: 'ping', x: at.x, y: at.y + 1 }).ok).toBe(true);
    st.players.p2!.inVent = 'x';
    expect(applyAction(st, ctx, 'p2', { a: 'ping', x: at.x, y: at.y }).ok).toBe(false);
  });

  it('expires after its lifetime and clears when a meeting starts', () => {
    const { st, ctx } = setup();
    const at = st.players.p1!.pos;
    applyAction(st, ctx, 'p1', { a: 'ping', x: at.x + 1, y: at.y });
    tick(st, ctx, PING_TTL - 0.5);
    expect(st.players.p1!.ping).not.toBeNull();
    tick(st, ctx, 1);
    expect(st.players.p1!.ping).toBeNull();
    tick(st, ctx, PING_COOLDOWN);
    applyAction(st, ctx, 'p1', { a: 'ping', x: at.x + 1, y: at.y });
    st.emergencyReadyAt = 0;
    const btn = ctx.map.def.stations.find((s) => s.kind === 'emergency')!;
    place(st, 'p2', { x: btn.x + 0.5, y: btn.y + 0.5 });
    expect(applyAction(st, ctx, 'p2', { a: 'emergency' }).ok).toBe(true);
    expect(st.phase).toBe('meeting');
    expect(st.players.p1!.ping).toBeNull();
  });

  it('is seen by players near the pinger or the spot, not across the map', () => {
    const { st, ctx } = setup();
    const [a, b] = farPair(ctx);
    place(st, 'p1', a);
    place(st, 'p2', a);
    place(st, 'p3', b);
    expect(applyAction(st, ctx, 'p1', { a: 'ping', x: a.x + 1.5, y: a.y }).ok).toBe(true);
    tick(st, ctx, 0.5);
    const near = project(st, ctx, 'p2', { chatSince: 0 }).players.find((p) => p.id === 'p1')!;
    expect(near.ping).toBeTruthy();
    expect(near.ping!.age).toBeGreaterThan(0.4);
    expect(project(st, ctx, 'p1', { chatSince: 0 }).players.find((p) => p.id === 'p1')!.ping).toBeTruthy();
    expect(project(st, ctx, 'p3', { chatSince: 0 }).players.find((p) => p.id === 'p1')!.ping).toBeUndefined();
  });

  it("keeps ghosts' pings among ghosts", () => {
    const { st, ctx } = setup();
    const at = st.players.p1!.pos;
    place(st, 'p2', { x: at.x + 0.4, y: at.y });
    place(st, 'p3', { x: at.x - 0.4, y: at.y });
    st.players.p1!.alive = false;
    st.players.p3!.alive = false;
    expect(applyAction(st, ctx, 'p1', { a: 'ping', x: at.x + 1, y: at.y }).ok).toBe(true);
    expect(project(st, ctx, 'p2', { chatSince: 0 }).players.find((p) => p.id === 'p1')!.ping).toBeUndefined();
    expect(project(st, ctx, 'p3', { chatSince: 0 }).players.find((p) => p.id === 'p1')!.ping).toBeTruthy();
  });
});
