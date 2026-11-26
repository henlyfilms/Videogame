// @vitest-environment node
/**
 * Agent Player Protocol: external agents (the SDK + example agent) and the
 * built-in Marion bots finish matches in every mode on their own; agents only
 * ever receive per-seat snapshots; the LLM layer is optional and falls back.
 */
import { describe, expect, it } from 'vitest';
import { GameServer } from '../../src/mystery/server/room';
import { MysteryAgent, type AgentTransport } from '../../server/agent-sdk/index';
import { runExampleAgent } from '../../server/agent-sdk/example';
import { createLlmChat } from '../../server/llm';
import type { ServerMsg } from '../../src/mystery/net/protocol';
import type { ModeId } from '../../src/mystery/core/types';

function memTransport(srv: GameServer, id: string): AgentTransport {
  const handlers: ((m: ServerMsg) => void)[] = [];
  srv.connect({ id, send: (m) => handlers.forEach((h) => h(JSON.parse(JSON.stringify(m)))) });
  return { send: (m) => srv.receive(id, m), onMessage: (fn) => handlers.push(fn), onOpen: (fn) => fn(), close: () => srv.disconnect(id) };
}

async function playMatch(mode: ModeId, map: 'hq' | 'greenhouse' | 'express' | 'manor') {
  const srv = new GameServer({ seed: 42 });
  const host = new MysteryAgent({ name: 'Host Agent', transport: memTransport(srv, 'host') });
  runExampleAgent(host);
  await host.create({ mode, map, bots: 6, maxPlayers: 12, durationMin: 6 });
  await Promise.resolve();
  const code = host.room!.code;
  const guests = [1, 2].map((i) => new MysteryAgent({ name: `Guest ${i}`, transport: memTransport(srv, `g${i}`) }));
  for (const g of guests) {
    runExampleAgent(g);
    await g.join(code);
  }
  host.start();
  let leaked = false;
  for (const a of [host, ...guests])
    a.on('snap', (s) => {
      if (s.phase === 'ended' || !s.you.alive) return;
      for (const p of s.players) if (p.id !== s.you.id && p.role && s.you.team === 'crew' && p.role !== 'seeker' && p.role !== 'mayor' && !(p.role && !p.alive)) leaked = true;
    });
  for (let i = 0; i < 30 * 60 * 12 && !host.snap?.result; i++) srv.update(1 / 30);
  return { host, guests, leaked };
}

describe('agent protocol', () => {
  for (const mode of ['classic', 'lightsout', 'hideseek'] as ModeId[]) {
    it(`external agents + Marion bots finish a ${mode} match`, async () => {
      const { host, guests, leaked } = await playMatch(mode, mode === 'classic' ? 'hq' : mode === 'lightsout' ? 'manor' : 'express');
      expect(host.snap?.result).toBeTruthy();
      for (const g of guests) expect(g.snap?.result?.winningTeam).toBe(host.snap!.result!.winningTeam);
      expect(host.room!.players.filter((p) => p.kind === 'agent')).toHaveLength(3);
      expect(leaked).toBe(false);
    }, 120000);
  }

  it('rejects agents with a wrong token when one is configured', () => {
    const srv = new GameServer({ agentToken: 'secret' });
    const msgs: ServerMsg[] = [];
    srv.connect({ id: 'a', send: (m) => msgs.push(m) });
    srv.receive('a', { t: 'hello', v: 1, name: 'x', platform: 'agent', kind: 'agent', token: 'nope' });
    expect(msgs.some((m) => m.t === 'error' && m.code === 'auth')).toBe(true);
  });

  it('LLM chat layer is disabled without credentials and bots fall back to quick chat', () => {
    const k = process.env.ANTHROPIC_API_KEY;
    const t = process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    expect(createLlmChat()).toBeNull();
    if (k) process.env.ANTHROPIC_API_KEY = k;
    if (t) process.env.ANTHROPIC_AUTH_TOKEN = t;
  });

  it('bot chat provider lines reach meeting chat', async () => {
    const srv = new GameServer({ seed: 9, chatProvider: async (ctx) => `${ctx.botName} here — I was in my room.` });
    const host = new MysteryAgent({ name: 'Host', transport: memTransport(srv, 'h') });
    await host.create({ bots: 5, discussionTime: 30 });
    await Promise.resolve();
    host.start();
    for (let i = 0; i < 30 * 12; i++) srv.update(1 / 30);
    // Call a meeting from the button.
    const room = [...srv.rooms.values()][0]!;
    const st = room.match!;
    const me = st.players[host.pid]!;
    const e = room.ctx!.map.emergency!;
    me.pos = { x: e.x + 1, y: e.y };
    st.emergencyReadyAt = 0;
    host.act({ a: 'emergency' });
    const lines: string[] = [];
    host.on('snap', (s) => lines.push(...s.chat.map((c) => c.text)));
    for (let i = 0; i < 30 * 30; i++) {
      srv.update(1 / 30);
      await Promise.resolve();
    }
    expect(lines.some((l) => l.includes('I was in my room'))).toBe(true);
  }, 60000);
});
