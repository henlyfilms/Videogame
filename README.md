# Marion HQ

A calm, crisp, playable 2D **living office & operations game** for the Marion bot ecosystem — Marion Agent, Marion Life, Sift and Marion Engine. Eight glowing bots work across seven themed wings plus Moose's Co‑Pilot Bridge, and unwind in **The Arcade**, a neon annex where you (and they) play **Marion Mystery**. They operate the HQ on their own, every room has a mini‑mechanic you can play directly, and the whole map follows a day → night cycle tied to your clock.

Everything (rooms, props, tubes, particles, bot sprites, sound) is generated procedurally: no image, audio or font assets, and no external runtime requests.

```bash
npm install && npm run dev      # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc --noEmit` + production bundle in `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest (jsdom + canvas mock): HQ, Arcade and Marion Mystery suites |
| `npm run typecheck` | Strict TypeScript check |

---

## Controls

| Input | Action |
| --- | --- |
| Drag · WASD · Arrows | Pan |
| Scroll · pinch | Zoom toward the cursor |
| Click a bot | Open the Bot Inspector and follow |
| Click a room | Open the Room Action Popover (play its mechanic) |
| Click a glowing prop | Play it directly (stamp, dimmer, intake, mic, turntable, chute, relay rack…) |
| `1`–`8` | Jump to Daniel, Moose, Kanye, Barry, Greek, Quill, Sift, Bot Builder |
| `0` | Overview |
| `Space` | Pause / resume |
| `⌘K` / `Ctrl+K` | Command Palette & Event Injector |
| `⇧⌘S` / `Ctrl+Shift+S` | Pin a screenshot Polaroid for Kanye |
| `Esc` · `?` | Close panels · help |

The top bar shows live status counts, the Live / Replay / Socket switcher with a connection badge, pause and 0.5×–4× speed, Light / Soft / Dark themes, audio (muted by default), an FPS readout, the palette and help.

## The roster (all `glow: true`)

| # | Bot | Role | Color | Shape |
| --- | --- | --- | --- | --- |
| 1 | **Daniel** ★ | Chief Executor | white | funkyberry |
| 2 | **Moose** | Co-Pilot | violet | marionberry |
| 3 | **Kanye** | Marion Agent | red | heart |
| 4 | **Barry** | Marion Life | black, glowing rim | gem |
| 5 | **Greek** | Marion Engine | magenta | star |
| 6 | **Quill** | Email | blue | blueberry |
| 7 | **Sift** | Sift Dev | cyan | blueberry |
| 8 | **Bot Builder** ★ | Foundry | orange | cloud |

## Rooms & mechanics

| Wing | Play it |
| --- | --- |
| **Central Command** (+ Huddle Room) | Delegate tasks from Daniel (hub‑and‑spoke), summon or end huddles, mark tasks done (deliverables walk back to Command, or capsule to the Vault). The Universal Brain grows with every insight and send. The **Release Chute** stamps a Mac `.pkg` box once Greek has a Render Green build. |
| **Kanye's Engine Room** | Terminal desks glow while working and dim when Kanye sleeps. Commands arrive as dictation waves or ⇧⌘S Polaroids; relay them to **Claude Opus · auto / Codex / Gemini**, which draws glowing tethers to the Mac workstations. |
| **Moose's Co‑Pilot Bridge** | Start a cross‑chat dictation wave, then route the transcript to Kanye's queue or Barry's Planner. A recent‑screenshots board and the Agent ↔ Life sync conduit sit here too. |
| **Barry's Marion Life Hub & Vault** | Cobalt Planner (Work / AI lanes seeded with Life Dashboard, Marion Agent [Human/Bots], EDITING ENGINE, Sift, Hub, Apps, AI Club, Design, email sender reviewer). Checking cards advances a **daily streak** and room **polish** (+throughput). Stepping up to the **mic** ducks the **turntable** and turns your words into a tidy task card. Completed runs shoot **MCP capsules** into the Vault; restore deleted items for a glowing **Restored** badge. |
| **Sift's Media Vault** | Drop & Distill: drop reels or YouTube videos in the intake chute and distill them into FTS5 insight cards. A teammate picks each card up as a temporary speed or accuracy buff. Includes the Local / Cloud LLM console and a wall **dimmer** that switches Light / Soft / Dark. |
| **Greek's Cutting Room** | Clip Sorter: bin raw clips as keepers or outtakes. Correct sorts push the render bar (+25%), wrong ones barely move it (+5%). At 100% the lamp goes **Tests Passed / Render Green**. |
| **Quill's Mailroom** | Stamp‑to‑Send: mail shoots in by tube; sort it into *Needs Action / FYI / Noise*. Quill drafts replies (the red pen visibly shrinks them) into *Pending Approval*. **Only your brass Approval Stamp sends.** The bots never do, in any mode. Clear Noise before the inbox piles up. |
| **The Arcade** (annex, 4th row) | Neon cabinets with animated attract‑mode screens, a High Scores board, a velvet sofa and a flickering ARCADE sign on a confetti carpet. Click the **Marion Mystery** cabinet (or *Play* in the panel) to open the game full‑screen inside the HQ. The panel also has **Quick Play vs Marion bots** (a local room with the crew seated as agents), **Join by code**, the persisted **arcade leaderboard** (wins · games · MVPs per bot and for you), the last 10 results, and "coming soon" cabinets from `src/arcade/registry.ts`. Bots wander in to play on their own; when a match ends, winners celebrate and losers sulk. |
| **Bot Builder's Foundry** | Spec‑to‑Spawn: a 1‑line job card plus shape and aura color spawns a custom glowing specialist (max 4, persisted). Slot Universal Skill cartridges (Token Optimizer, Claude Auto Mode, Prompt Craft, Zero‑Fluff Comms) for +12% HQ throughput each. Gauge and Forge rest in the 30‑Day Vault. |

## Architecture

```
src/
  adapters/   MarionEvent contract + schema validation, EventSourceAdapter,
              LiveSimAdapter, ReplayAdapter (+3 scenarios), WebSocketAdapter, AdapterManager
  engine/     world (tilemap, rooms, props, tubes), A* pathfinding, bot FSM,
              fixed-timestep loop, camera, speech bubbles, Simulation
  render/     Canvas 2D renderer (tiled static cache), procedural sprites & props
  game/       HQ controller, event bus, mechanics reducer, player actions, wiring, content
  store/      Zustand store (mechanics, feed, settings) + localStorage persistence
  audio/      Procedural Web Audio engine
  ui/         React HUD: TopBar, BotInspector, RoomPopover + panels, ActivityFeed,
              CommandPalette, ReplayBar, HelpOverlay, shortcuts
  arcade/     Arcade wing: game registry, overlay state, ArcadeOverlay (lazy MysteryApp),
              the Marion Mystery → HQ bridge, bots-only match planner
  mystery/    Marion Mystery (standalone game; also served at `?mystery`)
```

**The Arcade wing.** The floorplan has a 4th annex row (`ROWS = 4`). Only its middle cell is a room (`arcade`). The cells either side are outdoor terrace (Void, painted as a garden), and only a 3‑tile corridor ring around the Arcade stays walkable, so the annex never becomes a corridor plaza.

- **Launching the game:** the Marion Mystery cabinet's hotspot (`arcade`), the panel's Play / Quick Play / Join buttons and the ⌘K *Arcade* commands all call `launchMystery()`. `ArcadeOverlay` lazy‑loads `import('../mystery/ui/MysteryApp')` and renders it full‑screen with `onExit`, which shows Marion Mystery's own "Marion HQ" back button.
- **While the game is open:** the HQ keeps **simulating** (bots walk to the Arcade as the game's agents join) but stops **painting** (`hq.renderSuspended`). HQ shortcuts and the lo‑fi loop are paused. Exiting restores the HQ exactly: camera, selection, panel and pause state are untouched.
- **The bridge:** `src/arcade/bridge.ts` subscribes to the Mystery client store (`useMystery`) only while the overlay is open, and publishes, once each per match:
  - `arcade.player_joined` when a Marion agent (a lobby player with a `look`) takes a seat;
  - `arcade.match_started` when the room enters `match`;
  - `arcade.match_ended` when `snap.result` arrives. Player ids are mapped to Marion bot ids, with `'you'` for the human.

  The bridge module (and with it the whole Mystery client) is only in the lazy chunk.

**One event pipeline.** Every source (live sim, replay, WebSocket, player clicks, palette injection) publishes `MarionEvent`s onto one bus. Two subscribers react:

1. `Simulation.apply(ev)` turns the event into something visible: walks, huddles, packets, tethers, bubbles, particles.
2. `reduceMechanics(state, ev)` is a pure reducer and the single source of truth for room state. The store holds its output plus the activity feed.

Player actions only publish events, so live play, replays and remote streams behave identically and are unit‑testable.

**Engine.** A fixed 60 Hz simulation step, decoupled from rendering (`requestAnimationFrame`, delta clamped at 250 ms, at most 8 steps per frame, interpolated positions). Speed and pause scale or stop sim time, and the adapters are driven by the same scaled clock, which makes them deterministic.

- **Pathfinding:** 8‑direction A* on a binary heap, with no corner cutting and an octile heuristic. Paths are cached in a 512‑entry LRU keyed by start→goal, and returned paths are copies.
- **Crowding avoidance:** each bot reserves a unique goal tile (nearest free tile by ring search). When four or more bots are walking, paths route around bots that are standing still (an extra‑cost A* pass).
- **Bot states:** `idle · walking · working · huddling · delegating · needs_input · asleep`, with a legal‑transition table. External events that must win, such as "working" on a sleeping bot, wake the bot through `idle`.

**Renderer.** The canvas is scaled by `devicePixelRatio`.

- **Static layer:** floors, walls, labels, tubes and prop bodies are baked. At about 1× device scale, a single 1× layer is blitted.
- **Above 1×:** the world is cut into 256 px chunks, each rendered at the next resolution step (1.5 / 2 / 3 / 4 / 5×) so blits are never upscaled. Chunks are frozen as `ImageBitmap`s from an `OffscreenCanvas` where supported, built at most 3 per frame (the 1× layer fills gaps meanwhile), and evicted least‑recently‑used under a 28 MP budget.
- **Baked lighting** (`render/lighting.ts`, `render/ground.ts`) is part of the static layer:
  - soft drop shadows under the building, rooms and props (layered strokes, never `shadowBlur`, so every cache scale matches);
  - ambient‑occlusion bands along the walls and a top‑left key light on floors;
  - two‑tone wall bevels and accent‑strip light spill;
  - the terrace garden, the Arcade carpet, and lamp fixtures and facade windows.
- **Every frame:** animated props, packets, bots, particles, and screen‑space speech bubbles laid out so they never overlap. Cross‑bot messages render teal.
  - Bots are y‑sorted with an additive neon glow in Soft and Dark. They hop with squash and stretch, breathe, blink, look where they walk, and pulse their glow with activity; Arcade moods add *play*, *cheer* and *sulk* poses.
  - Room‑name chips fade in when you zoom out. Name tags are pills, readable on any floor.
- **Day → night** (`render/daylight.ts`) follows the local clock: golden hour around 07:00 and 18:45, and full night from 20:30 to 05:30.
  - Night is a ¼‑resolution light mask (a navy multiply tint with holes where lamps shine) plus additive glows: 33 corridor lamps, ceiling pools, neon pools in the Arcade, garden lights and 44 lit windows.
  - It costs nothing by day and about 1–1.5 ms of JS at night. Pin the time with `?hour=22` or the ⌘K *Time of day* commands.
- **Camera:** critically damped springs (smooth‑damp) ease in and out, and zoom eases in log space. The overview framing keeps clear of the top bar and the activity feed.
- **Art passes:** screenshots and critiques are in `docs/art-passes/hq/pass-1…3`.

**Design system.** Light / Soft / Dark tokens live in `src/theme/tokens.ts` and are shared by the canvas and the HUD (through CSS variables for Tailwind). Cobalt `#2f6fed` / `#6ea1ff` accents, teal for cross‑bot traffic, flat 10 px‑radius cards with 1 px borders.

**Visual reference.** You pointed me to Silkworm's *Segregated by Design*. This environment's network blocks vimeo.com, so I couldn't view the film. The map look here (flat plan view, thin drafting lines, a subtle hatched ground plane, legend‑style room labels) is my own take on its general look, not a close match.

## Event sources

### Live (default)
`LiveSimAdapter` seeds a starter backlog, then keeps the HQ believable:

- mail, reels and clips arrive
- delegations, tool calls, chatter, huddles, dictation waves and sleep cycles

Bots also clear backlogs on their own: Quill triages and drafts, Greek sorts clips, Sift distills, Kanye relays. **Quill never stamps.** Every send waits for you. Every 75–130 s, a few idle bots sneak off to the Arcade for a bots‑only Marion Mystery round (`arcade.player_joined` → `match_started` → `match_ended`), which keeps the leaderboard moving.

### Replay
Three deterministic scenarios: *Marion Agent Feature Sprint*, *Multi‑Bot Orchestration* and *Morning Triage & Media Distill*. The scrubber plays at 0.5× / 1× / 2× / 4×. Seeking resets the world and re‑applies events up to the target time. IDs and timestamps are stable, so the same seek always produces the same state. Replays never touch your saved progress.

### WebSocket: connect a live Marion stream
Pick **Socket** in the top bar and enter a `ws://` or `wss://` URL (default `ws://localhost:8787/marion`). Send JSON frames in any of these shapes:

```jsonc
{ "type": "bot.status", "payload": { "botId": "kanye", "status": "working" } }
[ { "type": "task.created", "payload": { "taskId": "t1", "botId": "greek", "title": "Render teaser" } } ]
{ "events": [ { "type": "mail.pending_approval", "payload": { "mailId": "m1", "draftId": "d1", "subject": "Re: Q3", "words": 140 } } ] }
```

- `id` and `ts` are optional and filled in if missing.
- Every frame is validated against `EVENT_SCHEMA` (`src/adapters/events.ts`). Invalid events are counted and dropped, and unknown payload keys are stripped.
- Reconnects use exponential backoff (0.5 s doubling, capped at 15 s). After two consecutive failures the live sim fills in until the socket returns, and the badge shows *Connecting / Connected / Reconnecting / Fallback*.

**Core contract:** `bot.status`, `bot.message`, `bot.delegate`, `bot.tool_call`, `group.huddle_start`, `group.huddle_end`, `task.created`, `task.completed`, `mail.pending_approval`, `reel.distilled`, `clip.sorted`, `skill.slotted`, `dictation.wave`.

**Room extensions:** `mail.received/sorted/sent/cleared`, `reel.received`, `clip.received`, `planner.toggled/added`, `vault.archived/restored`, `relay.queued/dispatched`, `release.shipped`, `bot.spawned`, `settings.llm`.

**Arcade (HQ ↔ Marion Mystery bridge):**

| Event | Payload |
| --- | --- |
| `arcade.player_joined` | `{ botId, name, matchId? }` |
| `arcade.match_started` | `{ matchId?, mode: 'classic' \| 'lightsout' \| 'hideseek', map, players: number, bots: string[] }` |
| `arcade.match_ended` | `{ matchId?, mode, map, winningTeam: 'crew' \| 'murderers' \| 'neutral' \| 'draw', reason, mvp?, results: { botId, won, role }[] }` |

Arcade events are validated like the rest; `results` rows are checked field by field and their unknown keys are stripped too. The reducer counts each `matchId` once.

Bot IDs: `daniel moose kanye barry greek quill sift builder` (plus `you` on the arcade leaderboard).

A minimal test server:

```js
// node server.mjs  (npm i ws)
import { WebSocketServer } from 'ws';
new WebSocketServer({ port: 8787, path: '/marion' }).on('connection', (ws) =>
  setInterval(() => ws.send(JSON.stringify({ type: 'bot.message', payload: { botId: 'kanye', text: 'Hello from the real Agent', to: 'daniel' } })), 3000));
```

You can also paste raw event JSON into the **⌘K** palette to inject it, or use the 13 one‑click injector presets there. The *Arcade* group adds presets for the three arcade events, a "bots play a match" demo, and Play / Quick Play for Marion Mystery.

## Persistence & audio
- **Saved in `localStorage`** (`marion-hq:v1`): theme, mute, FPS toggle, WebSocket URL, turntable, custom bots, slotted skills, streak / polish progress, Planner cards, and the **arcade leaderboard + last 10 results** (validated on load; the live match is session‑only). Corrupt or blocked storage falls back to defaults.
- **Audio is muted by default.** The `AudioContext` is created on first unmute. Sounds include soft chimes, a pneumatic whoosh, a stamp thud, a spawn arpeggio and a lo‑fi turntable loop (Fmaj7–Em7–Dm7–Cmaj7, 72 bpm, vinyl crackle). The loop fades to silence during any dictation wave and comes back afterwards.

## Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors (strict, `noUncheckedIndexedAccess`) |
| `npx vitest run` | HQ suites cover pathfinding, the FSM, loop, camera, bubbles, sim, renderer, mechanics, actions, all three adapters, persistence, audio, the palette and a jsdom App smoke test. `tests/arcade.test.tsx` covers the arcade event schema, reducer, persistence round‑trip, sim reactions, the bridge's once‑per‑match publishing, the panel and the lazy MysteryApp mount, the live sim, palette presets, and the day/night, camera and pose helpers. The Marion Mystery suites are also included. |
| `npm run build` | Clean type check and bundle. HQ entry ~375 kB JS / ~122 kB gzip; Marion Mystery (menus, bridge, client store, 3D view) is split into lazy chunks, and Vite flags only the lazy three.js view chunk as over 500 kB |
| Headless Chromium (Playwright), dev and preview | No console errors across overview, room panels, bot inspector, palette, replay, all 3 themes and the phone viewport, plus the Arcade panel, launching Marion Mystery (menu and Quick Play) and exiting back to the HQ |

On frame time: in headless Chromium at 2× DPR, the renderer's JavaScript takes about 1–2 ms per frame at overview, including a busy dark scene with 12 bots. Zoomed in, frames measured around 23 ms. Profiling showed that time is spent waiting on that environment's software rasterizer (SwiftShader), not in the renderer's code; it stayed even with 1:1 blits. Real browsers with GPU‑accelerated canvas don't pay that cost, but I could only measure in this headless environment, so I haven't confirmed 60 fps on real hardware.

## Design decisions
- **Tick‑driven adapters** instead of timers make the live sim and replays deterministic and testable, and they pause with the game.
- **The mechanics reducer is the single source of truth**, so the canvas never owns game rules.
- **Replays are sandboxed.** Persistence pauses during a replay, and leaving it restores your saved HQ.
- **Human‑in‑the‑loop is enforced by design.** No adapter or bot emits `mail.sent`; only the stamp (or an explicit injected event) does.
- **No external runtime assets or fonts** and no icon libraries. Icons are inline SVG paths.

---

# Marion Mystery (the Arcade's social-deduction game)

A multiplayer murder-mystery for **4–20 players** — humans on Mac, Windows and iPhone, Marion agents (the HQ bots) and any external agent — played as animated berry characters in **3D third person, 3D first person or 2D**, chosen before the match and locked once it starts.

```bash
npm install
npm run dev        # client on :5173 (open /?mystery)
npm run server     # authoritative game server on :8787
# LAN party: npm run build && npm run start:server  → phones open http://<your-mac>:8787
```

| Script | What it does |
| --- | --- |
| `npm run server` / `start:server` | WebSocket game server (+ serves `dist/`) |
| `npm run e2e` | Playwright end-to-end (desktop + iPhone in one room, 2D/3D, full match) — run after `npm run build` |
| `npx tsx scripts/soak.ts 20` | 20 simulated hours of 20-bot matches across every mode/map |
| `npm run icons` | Regenerate the procedural PWA icons |

- **Modes:** Classic (bright; dark only when Lights are sabotaged), Lights Out (flashlights, batteries, dread, Blackout), Hide & Seek.
- **Maps:** Marion HQ After Hours, Orbital Greenhouse, Midnight Express, Hollowberry Manor — 15–18 rooms each, 46–67 s to cross, 9–18 loops, 4 vent networks, cameras, admin, vitals, door logs.
- **Roles:** Crewmate, Sheriff (+ Hero gun pickup), Detective, Medic, Engineer, Lookout, Tracker, Mayor, Murderer, Poisoner, Accomplice, Jester, Survivor (+ Seeker/Hider); every count, chance and rule is host-configurable, with presets and shareable settings codes.
- **Everything else:** 29 task mini-games, sabotage (lights, comms, doors, two themed criticals), emergency button + meetings with quick chat, ejection cinematics per map, role-filtered live stats, results with timeline/heatmap/awards, lifetime stats, waiting room with wardrobe (12 berries, 23 hairstyles, 35 hats, outfits, pets, nameplates, emotes), QR/invite links, reconnects, host migration, PWA offline shell, accessibility options.

Docs: [How to play](docs/mystery/HOW_TO_PLAY.md) · [Hosting](docs/mystery/HOSTING.md) · [Agent Protocol](docs/mystery/AGENT_PROTOCOL.md) · [Research & decisions](docs/mystery/RESEARCH.md) · [Progress](docs/mystery/PROGRESS.md) · [Art passes](docs/art-passes/)

Architecture: `src/mystery/core` is a DOM-free deterministic rules engine (settings, roles, maps, vision, match reducer, per-player projection). `src/mystery/server/room.ts` hosts rooms over any transport — the Node WebSocket server (`server/index.ts`) and the in-browser solo mode use the same code. Clients predict their own movement with the same collision code and interpolate everyone else; the server never sends hidden information.
