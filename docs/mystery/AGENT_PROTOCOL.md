# Marion Mystery — Agent Player Protocol

Any agent (an LLM-driven Marion agent, a script, a bot from another project) can join a Marion Mystery room as a player. **Agents get exactly what a human in that seat would get** — the same per-player `Snapshot` (positions only of what you can see, your own role/tasks, filtered stats) — and send the same actions. The server validates every action (range, line of sight, cooldowns, speed); agents have no extra powers.

Transport: WebSocket, JSON text frames, at `ws://<host>:8787/mystery` (or `wss://` behind TLS).

## Quick start (TypeScript SDK)

```ts
import WebSocket from 'ws';
import { MysteryAgent, wsTransport } from './server/agent-sdk';

const agent = new MysteryAgent({ name: 'Kanye', transport: wsTransport('ws://localhost:8787/mystery', WebSocket as never), token: process.env.MYSTERY_AGENT_TOKEN });
agent.on('snap', (s) => {
  // s.you, s.players, s.bodies, s.meeting, s.stats … decide and act:
  if (s.phase === 'meeting' && s.meeting?.stage === 'vote' && !s.meeting.myVote) agent.act({ a: 'vote', target: 'skip' });
});
await agent.join('ABCDEF');
```

Runnable example (walks to tasks, completes them, reports bodies it sees, votes for anyone it saw kill):

```bash
npx tsx server/agent-sdk/example.ts ws://localhost:8787/mystery ABCDEF "My Agent"
```

The SDK also re-exports `getMap`, `findPath`, `dist`, `INTERACT_RANGE` and `TASK_BY_ID` so agents can path-find on the same map data the server uses.

## Authentication

If the server is started with `MYSTERY_AGENT_TOKEN=...`, agents must send that token in `hello`. Without it, agents are allowed freely (fine for LAN parties).

## Client → server

| Frame | Meaning |
| --- | --- |
| `{ t:'hello', v:1, name, platform:'agent', kind:'agent', token?, cosmetics?, resume? }` | First frame. `resume: {code, pid, secret}` reclaims a seat after a disconnect (60 s grace in a match). |
| `{ t:'create', settings? }` | Create a room (you become host). |
| `{ t:'join', code }` | Join by 6-character code (case-insensitive). |
| `{ t:'list' }` | Public/LAN rooms → `{t:'list', rooms}`. |
| `{ t:'lobby.ready', ready }`, `{ t:'lobby.cos', cosmetics }`, `{ t:'lobby.name', name }`, `{ t:'lobby.move', x, y, facing, seq }`, `{ t:'lobby.emote', id }`, `{ t:'lobby.chat', text }` | Waiting room. |
| `{ t:'host.settings', settings }`, `{ t:'host.start' }`, `{ t:'host.addBot', look? }`, `{ t:'host.kick', pid, ban? }`, `{ t:'host.lobby' }` | Host only. `look` = Marion bot id (`daniel moose kanye barry greek quill sift builder`). |
| `{ t:'act', action }` | In-match action (below). |
| `{ t:'ping', n }` | → `{ t:'pong', n, now }`. |

### Actions (`act.action`)

`move {x, y, facing, seq}` (absolute target position; the server clamps speed and collides — send ~20 Hz with increasing `seq`) · `task.open {station}` · `task.done {station}` (must have been open ≥ the task's `minTime`) · `task.close` · `kill {target}` · `throw {dir}` · `poison {target}` · `shoot {target}` · `report {body}` · `emergency` · `vent.enter {vent}` · `vent.move {vent}` · `vent.exit` · `sabotage {kind: lights|comms|doors|meltdown|pressure, room?}` · `fix {station, on}` (hold, criticals) · `fix.done {station}` (lights/comms) · `remotefix` · `use {facility: admin|cams|vitals|doorlog|null}` · `vote {target|'skip'}` · `chat {text}` · `quick {id, target?}` · `shield {target}` · `track {target}` · `inspect {body}` · `camera` · `vitals` · `blackout` · `mayor.reveal` · `flashlight {on}` · `gun.pickup` · `battery.pickup {id}` · `emote {id}`.

Rejected actions come back as `{ t:'nack', a, reason }` (e.g. `cooldown`, `out of range`, `no line of sight`).

## Server → client

| Frame | Meaning |
| --- | --- |
| `{ t:'welcome', pid, secret }` | Your player id + the secret for `resume`. |
| `{ t:'room', room }` | Waiting-room state (`RoomInfo`: code, host, stage, settings, players, validation, chat). |
| `{ t:'lobby', players }` | Waiting-room positions (10 Hz). |
| `{ t:'snap', s }` | Match snapshot (20 Hz) — see `Snapshot` in `src/mystery/core/project.ts`. |
| `{ t:'error', code, msg }`, `{ t:'kicked', reason }`, `{ t:'left' }` | |

Snapshot highlights: `phase` (`intro|play|meeting|eject|ended`), `you` (role, team, tasks with station ids, cooldowns, battery, clues, dread), `players[]` (position only when visible; `role` only when revealed to you), `bodies` (visible), `meeting` (stage, who voted; votes revealed only at the reveal stage unless anonymous), `sabotage`, `stats` (role-filtered), `security` (only while at a console), `events` (only those you could witness), `chat` (new messages), `result` (when the match ends, everything is revealed: roles, timeline, stats, heatmap).

## Fair play guarantees (enforced server-side, covered by tests)

- Roles of others are never sent unless the rules reveal them (murderer teammates, seekers, revealed mayor, ghosts if enabled, end of match).
- Positions outside your vision/flashlight and line of sight are never sent; vent users are invisible.
- Private results (detective clues, shield hits, tracker targets) go only to their owner.
- Movement is clamped to legal speed and collision; tasks can't be completed faster than their minimum time or from out of range.

## LLM-driven meeting chat for built-in Marion bots

The server's built-in bots can speak in meetings with an LLM: set `ANTHROPIC_API_KEY` on the **server** (never in a client) and optionally `MYSTERY_LLM_MODEL` (default `claude-haiku-5-5`, a fast low-cost model). Calls have a 4 s timeout, a per-minute budget, and fall back silently to quick-chat when unavailable.
