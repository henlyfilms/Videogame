import { describe, expect, it } from 'vitest';
import { inferQuick } from '../../src/mystery/ai/bot';
import { AgentHub, cleanStatus, normalizeAgentId, statusLine } from '../../src/mystery/server/agentHub';
import { GameServer } from '../../src/mystery/server/room';
import { parseClientMsg, type ServerMsg } from '../../src/mystery/net/protocol';
import { localTransport } from '../../server/agent-sdk';
import { HqBridge } from '../../server/hqBridge';
import { AgentRunner, type Decider } from '../../server/mcp/agents';
import { matchName, Pilot } from '../../server/mcp/pilot';
import { McpSession, TOOLS } from '../../server/mcp/tools';

/** Advance a server in sim time, letting in-process agents react between ticks. */
async function tick(game: GameServer, secs: number): Promise<void> {
  for (let i = 0; i < Math.round(secs * 30); i++) {
    game.update(1 / 30);
    await Promise.resolve();
    await Promise.resolve();
  }
}

/** Run a promise that sleeps on real timers while the sim keeps ticking. */
async function during<T>(game: GameServer, p: Promise<T>, maxSecs = 3): Promise<T> {
  let done = false;
  let value: T;
  void p.then((v) => {
    done = true;
    value = v;
  });
  for (let i = 0; i < maxSecs * 20 && !done; i++) {
    await tick(game, 0.05);
    await new Promise((r) => setTimeout(r, 5));
  }
  if (!done) value = await p;
  return value!;
}

const text = (r: { content: { text: string }[] }) => r.content.map((c) => c.text).join('\n');

describe('agent hub', () => {
  it('normalizes ids and cleans statuses', () => {
    expect(normalizeAgentId('Bot Builder')).toBe('bot-builder');
    expect(normalizeAgentId('  KANYE ')).toBe('kanye');
    expect(normalizeAgentId(42)).toBe('');
    expect(cleanStatus({ state: 'busy' }, 1)).toBeNull();
    const s = cleanStatus({ state: 'working', title: '  Fix <b>login</b>\n bug ' + 'x'.repeat(100) }, 5)!;
    expect(s.title.length).toBeLessThanOrEqual(60);
    expect(s.title).not.toMatch(/[<>\n]/);
    expect(s.at).toBe(5);
    expect(statusLine({ state: 'idle', title: '', at: 0 })).toBe('Idle');
    expect(statusLine({ state: 'working', title: '', at: 0 })).toBe('Working…');
    expect(statusLine({ state: 'working', title: '', detail: 'Reading mail', at: 0 })).toBe('Reading mail');
  });

  it('notifies on change, not on identical re-sends, and clears', () => {
    let t = 1000;
    const hub = new AgentHub(() => t);
    const seen: string[] = [];
    hub.subscribe((id, s) => seen.push(`${id}:${s?.title ?? 'null'}`));
    hub.set('Kanye', { state: 'working', title: 'Billing export' });
    t += 10;
    hub.set('kanye', { state: 'working', title: 'Billing export' });
    expect(hub.get('kanye')?.at).toBe(1010);
    hub.set('kanye', null);
    expect(seen).toEqual(['kanye:Billing export', 'kanye:null']);
    expect(hub.all()).toEqual({});
  });

  it('accepts status frames and agent ids in hello', () => {
    expect(parseClientMsg({ t: 'status', status: { state: 'working', title: 'x' } })).toBeTruthy();
    expect(parseClientMsg({ t: 'status', status: null })).toBeTruthy();
    expect(parseClientMsg({ t: 'status', status: { state: 'nope' } })).toBeNull();
    expect(parseClientMsg({ t: 'hello', v: 1, name: 'K', platform: 'agent', kind: 'agent', agent: 'kanye' })).toBeTruthy();
  });
});

describe('room statuses', () => {
  it('shows an agent status on its seat (and on a built-in stand-in), only agents can publish', async () => {
    const hub = new AgentHub();
    const game = new GameServer({ hub, seed: 3 });
    const k = new Pilot({ agentId: 'kanye', transport: localTransport(game) });
    await during(game, k.join(undefined, { bots: 0 }));
    // Built-in Moose bot in the same room.
    game.rooms.get(k.room!.code)!.addBot('moose');
    // A human trying to set a status is ignored.
    const msgs: ServerMsg[] = [];
    game.connect({ id: 'h1', send: (m) => msgs.push(m) });
    game.receive('h1', { t: 'hello', v: 1, name: 'Human', platform: 'mac', kind: 'human' });
    game.receive('h1', { t: 'status', status: { state: 'working', title: 'hack' } });
    expect(hub.all()).toEqual({});
    k.setStatus('working', 'Refactoring billing export');
    await during(game, new Promise((r) => setTimeout(r, 30)));
    hub.set('moose', { state: 'idle' });
    await tick(game, 0.2);
    const seats = k.room!.players;
    expect(seats.find((p) => p.name === 'Kanye')?.status?.title).toBe('Refactoring billing export');
    expect(seats.find((p) => p.name === 'Kanye')?.look).toBe('kanye');
    expect(seats.find((p) => p.name === 'Moose')?.status?.state).toBe('idle');
    k.close();
  });
});

describe('HQ bridge', () => {
  it('maps working/idle statuses to HQ task events', () => {
    const b = new HqBridge();
    const w1 = { state: 'working' as const, title: 'Billing export', at: 1 };
    const e1 = b.events('kanye', w1, null).map((e) => e.type);
    expect(e1).toEqual(['task.created', 'bot.status']);
    const w2 = { state: 'working' as const, title: 'Release notes', detail: 'v2.3', at: 2 };
    expect(b.events('kanye', w2, w1).map((e) => e.type)).toEqual(['task.completed', 'task.created', 'bot.message']);
    expect(b.events('kanye', { state: 'idle', title: '', at: 3 }, w2).map((e) => e.type)).toEqual(['task.completed', 'bot.status']);
    expect(b.snapshot({ moose: { state: 'working', title: 'Inbox', at: 1 } }).map((e) => e.type)).toEqual(['task.created', 'bot.status']);
  });
});

describe('typed chat intent', () => {
  it('reads accusations, alibis and small talk', () => {
    expect(inferQuick('I saw Moose kill Quill!')).toBe('saw-kill');
    expect(inferQuick('Barry vented in the kitchen')).toBe('saw-vent');
    expect(inferQuick('I was with Greek the whole time')).toBe('with');
    expect(inferQuick('Sift is acting sus')).toBe('sus');
    expect(inferQuick('lets skip this one')).toBeUndefined();
    expect(inferQuick('hello all')).toBeUndefined();
  });
});

describe('MCP session', () => {
  it('speaks MCP: initialize, tools, prompts, resources, errors', async () => {
    const game = new GameServer({ seed: 1 });
    const s = new McpSession(new Pilot({ agentId: 'greek', transport: localTransport(game) }));
    const init = await s.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    expect((init!.result as { protocolVersion: string }).protocolVersion).toBe('2025-06-18');
    expect(await s.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    const list = await s.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect((list!.result as { tools: unknown[] }).tools).toHaveLength(TOOLS.length);
    const bad = await s.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'teleport' } });
    expect(bad!.error?.code).toBe(-32602);
    const nope = await s.handle({ jsonrpc: '2.0', id: 4, method: 'nope' });
    expect(nope!.error?.code).toBe(-32601);
    const guide = await s.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'how_to_play', arguments: { role: 'murderer' } } });
    expect(JSON.stringify(guide)).toContain('MURDERER');
    const prompt = await s.handle({ jsonrpc: '2.0', id: 6, method: 'prompts/get', params: { name: 'play_marion_mystery', arguments: { code: 'ABCDEF' } } });
    expect(JSON.stringify(prompt)).toContain('ABCDEF');
    const look = await s.callTool('look', {});
    expect(text(look)).toMatch(/Not in a room/);
    // Tool descriptions stay compact (they ride along with every model request).
    expect(JSON.stringify(TOOLS).length).toBeLessThan(6000);
  });

  it('matches names loosely', () => {
    const list = [{ name: 'Moose' }, { name: 'Bot Builder' }, { name: 'Bot 9' }];
    expect(matchName(list, 'moose')).toEqual({ name: 'Moose' });
    expect(matchName(list, 'builder')).toEqual({ name: 'Bot Builder' });
    expect(Array.isArray(matchName(list, 'bot'))).toBe(true);
    expect(matchName(list, 'zed')).toBeNull();
  });
});

describe('pilots play a full match', () => {
  it('two MCP agents play to the end with only their own view', async () => {
    const hub = new AgentHub();
    const game = new GameServer({ hub, seed: 11 });
    const k = new McpSession(new Pilot({ agentId: 'kanye', transport: localTransport(game) }));
    const m = new McpSession(new Pilot({ agentId: 'moose', transport: localTransport(game) }));
    expect(text(await during(game, k.callTool('join_game', { create: true, bots: 6 })))).toMatch(/You are the HOST/);
    const code = k.pilot.room!.code;
    expect(text(await during(game, m.callTool('join_game', { code })))).toMatch(new RegExp(code));
    expect(text(await during(game, m.callTool('start_game', {})))).toMatch(/Only the host/);
    await during(game, k.callTool('start_game', {}));
    await tick(game, 7);
    const start = text(await during(game, k.callTool('wait_for_turn', { max_wait: 1 })));
    expect(start).toMatch(/MATCH STARTED/);
    expect(start).toMatch(/Playbook:/);
    // Public status: no game secrets.
    expect(text(await m.callTool('set_status', { state: 'working', title: 'I am the murderer' }))).toMatch(/public/);
    let meetings = 0;
    for (let i = 0; i < 160 && k.pilot.snap?.phase !== 'ended'; i++) {
      await tick(game, 4);
      for (const s of [k, m]) {
        const snap = s.pilot.snap!;
        const report = s.pilot.report();
        // Never another player's hidden role in a living crewmate's view (ghosts may see roles by the rules).
        if (snap.you.team === 'crew' && snap.you.alive && snap.phase !== 'ended') expect(report).not.toMatch(/\[(Murderer|Poisoner|Accomplice)\]/);
        if (snap.phase === 'meeting' && snap.meeting && snap.you.alive && snap.meeting.stage === 'vote' && !snap.meeting.myVote) {
          meetings++;
          const r = text(await during(game, s.callTool('vote', { target: 'skip' })));
          expect(r).toMatch(/Voted skip|already voted|Voting is over/);
        }
      }
    }
    expect(k.pilot.snap?.phase).toBe('ended');
    const res = k.pilot.snap!.result!;
    expect(res.winningTeam).toBeTruthy();
    // The pilots did real work (tasks or kills).
    const work = (id: string) => (res.stats[id]?.tasksDone ?? 0) + (res.stats[id]?.kills ?? 0);
    expect(work(k.pilot.agent.pid) + work(m.pilot.agent.pid)).toBeGreaterThan(0);
    expect(text(await k.callTool('wait_for_turn', { max_wait: 1 }))).toMatch(/GAME OVER/);
    k.pilot.close();
    m.pilot.close();
  }, 120_000);
});

describe('agent runner', () => {
  it('calls the model only at decision points and acts through the game tools', async () => {
    const game = new GameServer({ seed: 5 });
    const pilot = new Pilot({ agentId: 'daniel', transport: localTransport(game) });
    const calls: string[] = [];
    const decider: Decider = {
      create: async ({ messages, tools }) => {
        expect(tools.map((t) => t.name).sort()).toEqual(['act', 'go', 'look', 'say', 'vote']);
        const first = messages[0]!.content as string;
        calls.push(first.split('\n').find((l) => l.startsWith('- ')) ?? '');
        if (messages.length > 1) return { content: [{ type: 'text', text: 'ok', citations: null }], stop_reason: 'end_turn' } as never;
        return { content: [{ type: 'tool_use', id: 't1', name: 'say', input: { text: 'Where was everyone?' }, caller: null }], stop_reason: 'tool_use' } as never;
      },
    };
    const runner = new AgentRunner(pilot, decider, { maxCallsPerMatch: 5, log: () => undefined });
    await during(game, pilot.join(undefined, { bots: 5 }));
    await during(game, pilot.start({}));
    void runner.loop();
    for (let i = 0; i < 200 && pilot.snap?.phase !== 'ended'; i++) {
      await tick(game, 3);
      await new Promise((r) => setTimeout(r, 2));
    }
    runner.stop();
    expect(runner.matchCalls + runner.usage.calls).toBeGreaterThan(0);
    expect(runner.usage.calls).toBeLessThanOrEqual(5 * 3);
    pilot.close();
  }, 120_000);
});
