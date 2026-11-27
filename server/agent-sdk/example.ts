/**
 * Example external agent: joins a room by code and plays honestly using only
 * its own snapshot — walks to its tasks and completes them, reports bodies it
 * sees, votes for anyone it saw kill (else skips), and chats a little.
 *
 *   npx tsx server/agent-sdk/example.ts ws://localhost:8787/mystery ABCDEF [name]
 */
import WebSocket from 'ws';
import { dist, findPath, getMap, INTERACT_RANGE, MysteryAgent, TASK_BY_ID, wsTransport, type AgentTransport, type Snapshot } from './index';

export function runExampleAgent(agent: MysteryAgent): () => void {
  let path: { x: number; y: number }[] = [];
  let goal: string | null = null;
  let openedAt = -1;
  let pos = { x: 0, y: 0 };
  const killers = new Set<string>();
  let said = false;
  let lastT = 0;
  const off = agent.on('snap', (s: Snapshot) => {
    const dt = Math.max(0, Math.min(0.2, s.t - lastT));
    lastT = s.t;
    for (const e of s.events) if (e.type === 'kill' && e.actor && e.actor !== s.you.id) killers.add(e.actor);
    if (s.phase === 'meeting' && s.meeting) {
      if (!said && s.you.alive) {
        said = true;
        const k = [...killers][0];
        agent.act(k ? { a: 'quick', id: 'saw-kill', target: k } : { a: 'quick', id: 'tasks' });
      }
      if (s.meeting.stage === 'vote' && !s.meeting.myVote && s.you.alive) {
        const k = [...killers].find((id) => s.players.find((p) => p.id === id)?.alive);
        agent.act({ a: 'vote', target: k ?? 'skip' });
      }
      return;
    }
    said = false;
    if (s.phase !== 'play') return;
    pos = { ...s.you.pos };
    const map = getMap(s.map);
    // Report a body we can see.
    const body = s.bodies[0];
    if (body && s.you.alive && dist(body.pos, pos) < 2.4) {
      agent.act({ a: 'report', body: body.id });
      return;
    }
    // Next task.
    const todo = s.you.tasks.find((t) => !t.done);
    if (!todo) return;
    const sid = todo.stations[todo.step]!;
    const st = map.stationById.get(sid)!;
    if (goal !== sid) {
      goal = sid;
      openedAt = -1;
      path = findPath(map, pos, st, new Set(s.sabotage.closedDoors)) ?? [];
    }
    if (dist(st, pos) <= INTERACT_RANGE * 0.8) {
      if (openedAt < 0) {
        agent.act({ a: 'task.open', station: sid });
        openedAt = s.t;
      } else if (s.t - openedAt > (TASK_BY_ID[todo.taskId]?.minTime ?? 2) + 0.5) {
        agent.act({ a: 'task.done', station: sid });
        goal = null;
      }
      return;
    }
    // Walk along the path at ~walking speed.
    let budget = 3.2 * dt;
    while (budget > 0 && path.length) {
      const n = path[0]!;
      const d = dist(n, pos);
      if (d <= budget) {
        pos = { ...n };
        budget -= d;
        path.shift();
      } else {
        pos = { x: pos.x + ((n.x - pos.x) / d) * budget, y: pos.y + ((n.y - pos.y) / d) * budget };
        budget = 0;
      }
    }
    if (!path.length && dist(st, pos) > INTERACT_RANGE * 0.8) goal = null; // re-path
    agent.moveTo(pos.x, pos.y, Math.atan2(st.y - pos.y, st.x - pos.x));
  });
  return off;
}

const isMain = process.argv[1]?.endsWith('example.ts');
if (isMain) {
  const [url = 'ws://localhost:8787/mystery', code, name = 'Example Agent'] = process.argv.slice(2);
  if (!code) {
    console.error('usage: npx tsx server/agent-sdk/example.ts <ws-url> <ROOMCODE> [name]');
    process.exit(1);
  }
  const transport: AgentTransport = wsTransport(url, WebSocket as never);
  const agent = new MysteryAgent({ name, transport, token: process.env.MYSTERY_AGENT_TOKEN });
  agent.on('error', (e) => console.error('server error:', e.msg));
  agent.on('room', (r) => console.log(`[room ${r.code}] ${r.stage} · ${r.players.length} players`));
  agent.on('end', (s) => console.log(`match over: ${s.result!.winningTeam} (${s.result!.reason})`));
  runExampleAgent(agent);
  void agent.join(code);
}
