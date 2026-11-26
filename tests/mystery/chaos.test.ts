// @vitest-environment node
/**
 * Network chaos: an agent plays through a transport with 150 ± 50 ms latency,
 * 5 % packet loss and reordering. The match must finish, the server must stay
 * consistent, and server/agent positions must not drift apart (no rubber-band
 * beyond a threshold once packets settle).
 */
import { describe, expect, it } from 'vitest';
import { GameServer } from '../../src/mystery/server/room';
import { MysteryAgent, type AgentTransport } from '../../server/agent-sdk/index';
import { runExampleAgent } from '../../server/agent-sdk/example';
import { Rng } from '../../src/mystery/core/rng';
import type { ClientMsg, ServerMsg } from '../../src/mystery/net/protocol';

describe('network chaos', () => {
  it('a laggy, lossy agent still plays a full match without desync', async () => {
    const srv = new GameServer({ seed: 11 });
    const rng = new Rng(7);
    let now = 0;
    const queue: { at: number; fn: () => void }[] = [];
    const later = (fn: () => void, droppable: boolean) => {
      if (droppable && rng.next() < 0.05) return; // 5 % loss of movement frames
      queue.push({ at: now + 0.1 + rng.next() * 0.1, fn }); // 100–200 ms one way → reorders
    };
    const handlers: ((m: ServerMsg) => void)[] = [];
    srv.connect({ id: 'lag', send: (m) => later(() => handlers.forEach((h) => h(JSON.parse(JSON.stringify(m)))), m.t === 'snap' || m.t === 'lobby') });
    const transport: AgentTransport = {
      send: (m: ClientMsg) => later(() => srv.receive('lag', m), m.t === 'act' && m.action.a === 'move'),
      onMessage: (fn) => handlers.push(fn),
      onOpen: (fn) => fn(),
      close: () => srv.disconnect('lag'),
    };
    const agent = new MysteryAgent({ name: 'Laggy', transport });
    runExampleAgent(agent);
    await agent.create({ bots: 7, durationMin: 4 });
    let maxDrift = 0;
    let started = false;
    for (let i = 0; i < 30 * 60 * 6 && !agent.snap?.result; i++) {
      now += 1 / 30;
      for (const q of queue.splice(0).sort((a, b) => a.at - b.at)) {
        if (q.at <= now) q.fn();
        else queue.push(q);
      }
      if (!started && agent.room) {
        agent.start();
        started = true;
      }
      srv.update(1 / 30);
      const room = [...srv.rooms.values()][0];
      const s = agent.snap;
      if (room?.match && s && s.phase === 'play' && s.you.alive) {
        const sp = room.match.players[agent.pid]!.pos;
        maxDrift = Math.max(maxDrift, Math.hypot(sp.x - s.you.pos.x, sp.y - s.you.pos.y));
      }
    }
    expect(agent.snap?.result).toBeTruthy();
    // Snapshot lag (≤ 200 ms + 50 ms snapshot interval) at walking speed ≈ 0.85 m.
    expect(maxDrift).toBeLessThan(2.5);
  }, 120000);
});
