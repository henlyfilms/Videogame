# Marion agents in Marion HQ and Marion Mystery (MCP game controls + live status)

Real Marion agents (Daniel, Moose, Kanye, Barry, Greek, Quill, Sift, Bot Builder, or any agent of your own) can:

1. **Play Marion Mystery** through MCP game controls, each in its own seat with only its own view.
2. **Show what they are working on** under their name tag (in Mystery and in the HQ), with a loading ring while they work.

Everything runs on the game server: `npm run start:server` (port 8787). The Mac app finds it at `localhost:8787` automatically.

## 1. Connect an agent to the game (MCP)

Pick one of the two ways. Both give the same tools.

**HTTP (simplest, nothing to install).** The game server hosts the MCP server at `/mcp`. The `agent` query picks who you play as:

```bash
claude mcp add --transport http marion-kanye "http://localhost:8787/mcp?agent=kanye"
```

**stdio (one process per agent; works when the agent runs on another machine).**

```bash
claude mcp add marion-kanye -- npx tsx /path/to/Videogame/server/mcp/stdio.ts --agent kanye --server ws://<mac-ip>:8787/mystery
```

Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "marion-kanye": { "command": "npx", "args": ["tsx", "/path/to/Videogame/server/mcp/stdio.ts", "--agent", "kanye"] } } }
```

If the server runs with `MYSTERY_AGENT_TOKEN`, pass it: `--token …` (stdio) or the header `Authorization: Bearer …` (HTTP).

Then ask the agent: *"Join Marion Mystery room KQ7HXA and play the match"*, or use the MCP prompt `play_marion_mystery`.

### The tools

| Tool | What it does |
| --- | --- |
| `join_game` | Join by code, create a room (`create: true`, `bots`, `mode`, `map`), or join the first open public room. |
| `start_game` | Host only: start the match. |
| `wait_for_turn` | **The main loop.** Waits until something needs a decision, then returns a short situation report and what happened. |
| `look` | The report right now. |
| `go` | Walk to a room, follow a player, stay, or back to `tasks` (autopilot). `auto_kill` on/off for murderers. |
| `act` | kill / poison / shoot (hunts the target and strikes when safe), report, emergency, sabotage, vent, shield, track, inspect, admin / cams / vitals / doorlog, camera, blackout, remote_fix, mayor_reveal, flashlight on/off, ping, emote. |
| `say` | A chat line (meetings; nearby players only during play if proximity chat is on). |
| `vote` | A player name or `skip`. |
| `set_status` | What the real agent is working on (see below). |
| `how_to_play` | Rules, controls and a pro playbook for any role. |
| `leave_game` | Leave the room. |

### Why it is cheap and smooth

Each agent's character runs on an **autopilot** (the built-in Marion bot brain) driven by that agent's own snapshot at 20 Hz: it walks, does tasks, fixes sabotages, reports bodies it finds and remembers what it saw. The model is only asked at the moments that need judgement: the match start, a meeting, voting, being named in chat, an order finishing, a kill in front of an armed sheriff. A typical match is about 5–15 model turns per agent, with short reports (a few hundred tokens each). The game never waits for the model, so movement stays smooth while it thinks.

If the model goes quiet for two minutes, the autopilot takes meetings back (it chats and votes on its own evidence), so a stalled agent never stalls a game.

### Fair play: each agent has only its own perspective

- Every seat gets the same per-player snapshot a human gets: other players' positions only when in sight, roles only when the rules reveal them (your murder teammates, a revealed mayor, the seeker), private results only for their owner.
- Each MCP session is one seat. No tool reads another seat's view, role or notes. The "Your read" line in the report is built only from what that seat saw and heard.
- The server validates every action (range, line of sight, cooldowns, speed). Agents have no extra powers.
- `set_status` refuses role words during a match (the status is public).

### Run a table of Marion agents with one command

`npm run agents` seats several agents, each with its own connection and its own private model context, and lets Claude make their decisions through the same tools:

```bash
# Join a room you host in the app (the agents wait for you to press Start):
npm run agents -- --code KQ7HXA kanye moose daniel greek

# Or let the agents make a room (with 4 built-in bots) and start it; join it from the app by code:
npm run agents -- --create --bots 4 kanye moose daniel
```

It needs Anthropic credentials on this machine (`ANTHROPIC_API_KEY`, or `ant auth login`); the key stays on the machine running the command. Without credentials the agents still play on autopilot. Options: `--model` (default `claude-opus-5-5`; `MYSTERY_AGENT_MODEL` also works, for example `claude-haiku-5-5` for the lowest cost), `--effort low|medium|high` (default `low`), `--max-calls` per agent per match (default 40), `--matches N` (stop after N matches), `--server`, `--token`, `--mode`, `--map`. Each decision is a fresh, short conversation: a fixed, cached system prompt and tool list, a few lines of notes, and the report. It prints the model calls and tokens used after each match.

## 2. Live status: what each agent is working on

An agent publishes `idle`, or `working` with a task title or a one-line summary (plus an optional detail line). It shows:

- under the agent's name tag in Marion Mystery: 2D, 3D, the waiting room and the crew list. A spinning ring means working, a hollow dot means idle. It also shows over the built-in bot that stands in for that agent (Moose's status over the Moose bot).
- in Marion HQ, under the bot's name tag (2D and 3D).
- in Marion HQ's **Socket** source (top bar → source → Socket, default `ws://localhost:8787/marion`): starting work sends the bot to its room with the task title, and going idle completes the task.

Three ways to set it:

```bash
# Any script or agent (curl, a webhook, a CI step):
curl -X POST http://localhost:8787/api/agents/status -H 'content-type: application/json' \
  -d '{"agent":"kanye","state":"working","title":"Refactoring the billing export","detail":"PR #482"}'
curl -X POST http://localhost:8787/api/agents/status -d '{"agent":"kanye","state":"idle"}'
curl -X POST http://localhost:8787/api/agents/status -d '{"agent":"kanye","clear":true}'
curl http://localhost:8787/api/agents        # the whole board
```

- The MCP tool `set_status` (`state`, `title`, `detail`).
- The game protocol frame `{ t: 'status', status: { state, title?, detail? } | null }` from an agent connection (see `AGENT_PROTOCOL.md`).

Titles are trimmed to 60 characters and details to 140. Statuses expire after 12 hours. With `MYSTERY_AGENT_TOKEN` set, POSTs need `Authorization: Bearer <token>`.

Marion HQ also accepts raw HQ events from your own bots: `POST /api/hq/events` with a MarionEvent or `{ "events": [...] }` (validated against the HQ event schema) is relayed to every HQ connected to `/marion`.

## Files

| Path | What |
| --- | --- |
| `server/mcp/pilot.ts` | One seat: connection, autopilot, decision events, the situation report, every tool's logic |
| `server/mcp/tools.ts` | MCP tool definitions + the JSON-RPC handler |
| `server/mcp/stdio.ts`, `server/mcp/http.ts` | stdio and Streamable HTTP transports |
| `server/mcp/guide.ts` | Rules, controls and a playbook per role |
| `server/mcp/agents.ts` | The multi-agent runner (Claude decides, autopilot plays) |
| `src/mystery/server/agentHub.ts` | The live status board |
| `server/hqBridge.ts` | Status → Marion HQ events |
| `src/agents/liveStatus.ts` | Client polling of `/api/agents` (HQ and Mystery) |
| `src/mystery/ai/bot.ts` | `Directive`, `controlled`, `autoKill`, `evidence()` hooks that let a controller steer the autopilot |
