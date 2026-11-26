# Build prompt: "Marion Mystery", a multiplayer social-deduction mode for the Marion HQ Arcade

> Paste everything below the line into a fresh Claude Code session on the `henlyfilms/Videogame` repository.

---

You are building a complete, polished, release-ready **multiplayer murder-mystery / social-deduction game mode** for the Marion HQ project, plus the **Arcade** inside Marion HQ that launches it, plus a visual upgrade of Marion HQ itself. Ship working software. No stubs, TODOs, placeholder screens, or "left as an exercise" sections. If something truly can't be done in this environment, such as testing on a physical iPhone, finish everything around it and list it plainly under "Not verified" in the final report.

This job is large. Work in the numbered milestones below. Commit and push after each one. Keep a running `docs/mystery/PROGRESS.md` (what's done, what's next, any open decisions) so the work can resume cleanly after context compaction or a new session.

## 0. Ground yourself in the repo first

Read `README.md` and skim `src/` before writing code. Here is what's already there:

- **Marion HQ** is a Vite 5 + React 18 + strict TypeScript (`noUncheckedIndexedAccess`) + Zustand + Tailwind app, tested with Vitest (jsdom + canvas mock, 111 tests). It renders a procedural Canvas 2D office with no external image, audio or font assets.
- **One event pipeline:** every source publishes `MarionEvent`s (`src/adapters/events.ts`, validated against `EVENT_SCHEMA`) onto a bus. A pure reducer (`src/game/mechanics.ts`) is the single source of truth. Keep that architecture style: game rules live in pure, testable reducers, and renderers never own rules.
- **Bot roster** (`src/data/bots.ts`): Daniel, Moose, Kanye (Marion Agent), Barry (Marion Life), Greek (Marion Engine), Quill, Sift and Bot Builder. Each has a color, a glow color and a distinct **shape** (funkyberry, marionberry, heart, gem, star, blueberry, cloud). Custom bots from the Foundry are persisted too. These are the "Marion agents" that must be able to play.
- There's already a `WebSocketAdapter` with backoff and fallback, a procedural Web Audio engine (`src/audio/audio.ts`), and Light / Soft / Dark theme tokens (`src/theme/tokens.ts`).
- The **default branch, `claude/tender-davinci-w8ctcn`, is the Marion HQ branch.**

## 1. Branching and merge plan

1. Create `feature/marion-mystery` from the Marion HQ branch. All game-mode work goes there.
2. When the mode is complete and tested, create `feature/marion-arcade` from the Marion HQ branch. Build the Arcade and the HQ visual upgrade there, merge `feature/marion-mystery` into it, resolve conflicts, and re-run every test.
3. Open a PR from `feature/marion-arcade` into the Marion HQ branch only if I ask for one.

If your environment assigns you a specific branch to push to, push there instead and treat the names above as the logical structure. Note the mapping in `PROGRESS.md`.

## 2. Architecture

- **Shared pure core: `src/mystery/core/`.** No DOM, no Three.js. It runs identically in the browser and in Node and holds:
  - match state
  - the rules reducer
  - role assignment
  - the settings schema and validation
  - map data
  - collision and line-of-sight
  - task definitions
  - win conditions
  - a seeded RNG
- **Authoritative server: `server/`.** A Node + `ws` server that runs the core and owns every rule decision: kills, cooldowns, votes, task completion, win checks. Requirements:
  - Fixed 30 Hz tick. Snapshots at 20 Hz, sent as delta-compressed JSON (or a compact binary format if it measurably helps).
  - **Hidden information is enforced on the server.** A client never receives another player's role (unless the rules reveal it), positions outside its own vision radius and line of sight, or private ability results. This blocks wallhacks and role-sniffing from devtools.
  - Rooms and lobbies with 6-character join codes, plus a QR code for phones.
  - Reconnect within 60 s, keeping the same seat and role.
  - The host can kick players. If the host leaves, host status passes to another player.
  - Per-connection rate limits and server-side validation of every action. Never trust the client.
  - `npm run server` (dev) and `npm run start:server` (prod). Include a `Dockerfile` and short deploy notes for one host (Fly.io or Render), plus **LAN play**: a Mac on the same Wi-Fi hosts it and an iPhone joins by code.
- **Client: `src/mystery/`.**
  - `client3d/`: Three.js, pinned to an exact version and lazy-loaded so the HQ bundle doesn't grow.
  - `client2d/`: Canvas 2D, reusing the HQ renderer's techniques.
  - `ui/`: React HUD, lobby, settings, meetings and results.
  - `net/`: client prediction for the local player, interpolation for remote players, reconciliation, latency display.
- **Assets:** keep the HQ rule of no fetched runtime assets. Build geometry, materials, textures (via canvas/noise), particles and audio procedurally in code. If you want glTF, generate it in code at build time and commit it.

## 3. Players, agents and people

- **4–20 players** per match. Any mix of:
  - humans on Mac, Windows or iPhone
  - **Marion agents** (the roster plus Foundry custom bots, keeping their names, colors, glow and shapes)
  - **external agents**
- **Agent Player Protocol** (`docs/mystery/AGENT_PROTOCOL.md`): a documented WebSocket JSON protocol that any agent can use to join a lobby by code with a token.
  - Agents get the *same* observations a human in that seat would get (a structured version: visible players, their own tasks, nearby bodies, chat, meeting state) and send the *same* actions. No extra information, ever.
  - Ship a small TypeScript SDK (`packages/mystery-agent-sdk/` or `server/agent-sdk/`) and an example agent.
- **Built-in AI brain** so the host can fill empty seats with Marion agents:
  - A deterministic heuristic layer handles navigation, doing tasks, faking tasks as a murderer, killing only when unobserved, self-reporting rules, sheriff judgment, and suspicion tracking from what the agent actually witnessed.
  - An optional LLM layer writes meeting chat and voting reasoning in each bot's personality. Use the Anthropic SDK (check the `claude-api` skill for current model IDs; use a fast, cheap model for chatter). Read the API key from server env only, never ship it to clients. Add hard timeouts and a per-match budget, and fall back to the heuristic layer whenever the LLM is unavailable.
  - Difficulty levels: Easy, Normal, Sharp.
- **Bridge to HQ:** emit `arcade.match_started`, `arcade.player_joined`, `arcade.match_ended` (with winners, MVP and each Marion bot's result) as `MarionEvent`s. Add them to `EVENT_SCHEMA` so the HQ activity feed and bots react: a bot walks to the Arcade when it joins a match, and celebrates or sulks afterwards.

## 4. Game design

Blend **Among Us–style social deduction** (tasks, meetings, voting, sabotage) with **Murder Mystery–style weapons** (the sheriff's gun, a gun that drops when the sheriff dies, a murderer's knife).

### View mode (chosen in the lobby, locked for the whole match)

- **3D First Person:** pointer-lock mouselook on desktop, touch-look on iPhone.
- **3D Third Person:** over-the-shoulder follow camera with collision so it never clips through walls.
- **2D Simplified:** top-down, readable, lightweight. Also the low-end and accessibility option.

The host picks either one mode for everyone or "player's choice". Either way, each player's mode is fixed once the match starts. All three modes run the same server simulation and the same map data.

### Roles

Every role has: an enabled toggle, a count (or a % chance), and its own tuning values. Give each one a clear role-reveal card and a help entry.

| Team | Role | Ability |
| --- | --- | --- |
| Murderers | **Murderer** | Knife kill with cooldown. Optional throwable knife. Sabotage. Shortcut vents. Can fake tasks. |
| Murderers | **Accomplice** | Can't kill. Can sabotage and use vents. Knows the murderers (configurable). |
| Murderers | **Poisoner** | Delayed kill: the target drops N seconds later. |
| Crew | **Crewmate** | Tasks. |
| Crew | **Sheriff** | Gun with cooldown. Misfire rule on an innocent is configurable: sheriff dies / both die / gun is lost. When the sheriff dies the gun drops and any crewmate can pick it up as the **Hero** (configurable). |
| Crew | **Detective** | Inspects bodies for clues: time since death, the killer's shape *or* color family (configurable), footprints for a short time. |
| Crew | **Medic** | Shields one player per round and sees a flash if the shield is hit. |
| Crew | **Engineer** | Uses vents. Remote-fixes one sabotage per match. |
| Crew | **Lookout** | Watches security cams. Can place one portable camera. |
| Crew | **Tracker** | Tags a player and sees their arrow for N seconds. |
| Crew | **Mayor** | Hidden double vote, or a reveal that grants extra votes. |
| Neutral | **Jester** | Wins if voted out. |
| Neutral | **Survivor** | Wins if alive at the end. |

Validate role counts against the player count with clear inline errors. Examples: murderers must be fewer than half the players, and special roles can't exceed the number of players. Include presets: **Classic**, **Chaos**, **Detective Night**, **Quick Match** and **Custom**. Presets can be saved, loaded, and shared as a URL/code.

### Settings (everything is host-configurable)

- **Map**
- **Match duration** (off, or 5–30 min) and what timer expiry means: murderers win / crew wins / draw
- **Movement and vision:** player speed, crew vision, murderer vision, lights-sabotage vision
- **Murderer combat:** kill cooldown, kill distance, knife throw on/off
- **Sheriff combat:** gun cooldown, misfire rule, gun-drop/Hero
- **Tasks:**
  - common / short / long task counts
  - whether tasks are visual-confirm
  - whether task bar updates are live, at meetings, or never
- **Meetings:**
  - emergency meetings per player and their cooldown
  - discussion time and voting time
  - anonymous votes
  - confirm ejects
  - skip-vote rules
- **Sabotage:**
  - which sabotages are enabled
  - critical sabotage timers
- **Ghost rules:** ghosts finish tasks (on/off), ghost chat
- **Chat:** text chat on/off, quick-chat wheel, proximity text chat
- **Bots:** count and difficulty
- **Lobby:** privacy (public, code-only, LAN)

Store settings in a versioned schema with migrations, and validate them on the server.

### Core loop

Lobby (cosmetics, a free-walk lobby area) → role reveal → free roam with tasks, kills, sabotage and vents → report a body or call an emergency meeting → discussion (text chat, quick-chat, evidence such as "last seen" and the detective's notes) → vote → eject reveal (honoring confirm-ejects) → repeat. Then a results screen with the winning team, everyone's roles, a timeline of kills and votes, an MVP, and per-player stats. Ghosts stay in the game: they can do tasks and use ghost chat.

**Win conditions:**

- **Crew wins** when all tasks are done, or all murderers are eliminated.
- **Murderers win** when they equal or outnumber the crew, when a critical sabotage isn't repaired in time, or on timer expiry if the setting says so.
- **Neutral roles** win alongside either side.

### Tasks

Build at least **16 distinct, touch-friendly mini-games**. Each must be playable with mouse, keyboard, touch and a controller, playable in both 3D (as a world-anchored panel) and 2D, and take 3–15 s. Mix them across the maps, and theme some to Marion HQ:

- Approve-stamp the mail
- Sort clips
- Distill a reel
- Slot a skill cartridge
- Re-route a pneumatic tube
- Calibrate the turntable
- Align a satellite dish
- Fuel an engine
- Wire matching colors+shapes
- Swipe a badge
- Water plants
- Clean filters
- Download/upload a file
- Unlock a manifold
- A Simon-says panel
- A keypad code

Murderers see fake-task prompts so they can fake convincingly.

### Sabotage

At least: Lights, Comms (hides the task list and meeting info), Doors (lock a room), and two critical sabotages with countdowns and two-person fixes.

### Maps (data-driven, shared by 3D and 2D)

At least **three original maps**, each 8–14 rooms with vents, cameras, an admin/map table, and good sightline variety:

1. **Marion HQ After Hours:** the HQ wings reimagined at night: Command, Engine Room, Co-Pilot Bridge, Life Hub & Vault, Media Vault, Cutting Room, Mailroom, Foundry, and the new Arcade.
2. **Orbital Greenhouse:** a space station farm ring.
3. **Midnight Express:** a snow-bound sleeper train / mansion, with a murder-mystery feel.

The map format is JSON plus a validation test (connectivity, spawn points, task reachability, vent graph), so adding a map later is just adding data.

## 5. Visual direction (multiple art passes are required)

**Reference:** use *Among Us 3D* (for 3D) and *Among Us* (for 2D) as a reference for **feel only**. The feel means chunky, toy-like, highly readable characters; bold saturated team colors; soft toon lighting; cozy-but-eerie sci-fi interiors; clear silhouettes; and juicy, funny kill and eject moments. **Do not copy Among Us IP:** no bean-with-visor crewmate silhouette, no copied maps, UI, sounds, logos or names. The characters are the **Marion bots' own shapes**, made into expressive 3D toys (and crisp 2D sprites). Glow stays part of their identity.

- **3D look:**
  - toon/cel shading with soft rim light
  - baked-feel ambient occlusion
  - a per-map color script, plus a distinct palette for sabotage states (red alarm wash for criticals, darkness with flashlight cones for Lights)
  - instanced props, light bloom on glows (with a low-quality fallback that skips post-processing)
  - squash-and-stretch walk cycles, idle fidgets, emotes
  - cosmetic hats/trails
  - stylized, non-gory kill animations, plus a fun eject sequence per map
- **2D look:** a flat top-down style matching the HQ's drafting-line aesthetic, with crisp shapes, glow, readable vision cones, and lighting through a darkness mask.
- **UI:** reuse HQ design tokens (cobalt accents, 10 px radius cards, Light / Soft / Dark). Big, thumb-friendly buttons on phones; respect safe areas. Role-reveal, meeting and results screens should feel like *moments*.
- **Audio:** procedural Web Audio consistent with the HQ: ambient beds per map, footsteps, task blips, kill sting, meeting alarm, a vote tally drumroll, an eject whoosh. Muted until the first user gesture (iOS requires that).
- **The art-pass process (do this for real):** for each of 3D-FP, 3D-TP, 2D, the lobby/menus, and Marion HQ, run **at least three passes**:
  1. readability/blockout
  2. lighting, materials and color
  3. polish (VFX, animation, juice, typography)

  After each pass:
  - capture Playwright screenshots from a fixed set of camera positions at a desktop size (1440×900) and an iPhone profile
  - save them to `docs/art-passes/<area>/pass-N/`
  - write a short critique against a checklist (silhouette readability, color harmony, contrast and accessibility, visual hierarchy, consistency with the HQ, "does it feel alive"), then fix what you found

  Show the before/after in the final report.

## 6. Marion HQ: the Arcade and a graphics upgrade

- Add an **Arcade** wing to the HQ floorplan, with glowing cabinets as playable props. The Marion Mystery cabinet opens a lobby browser:
  - Create Lobby (settings screen)
  - Join by Code
  - Quick Play vs Marion bots
  - a "coming soon" slot structure, so future arcade games can register through a small `ArcadeGame` interface
- HQ bots wander over to play, queue up and spectate. An arcade leaderboard is persisted in the HQ store.
- **HQ visual iteration:** do the same three-pass process on the existing HQ renderer. Targets:
  - richer lighting and depth (soft shadows, ambient occlusion-like edge darkening)
  - better bot animation (bob, squash, blink, glow pulse)
  - more detailed props
  - a polished day→night cycle that ties into the "After Hours" map
  - smoother camera feel

  Don't regress the HQ's perf budgets or its 111 existing tests.

## 7. Platforms and performance

- **Mac and Windows:** Chrome, Safari, Edge and Firefox. Keyboard and mouse with pointer lock, a gamepad (Gamepad API), and rebindable keys.
- **iPhone (Safari, plus installed as a PWA):**
  - a virtual joystick and a context action button (Use / Kill / Report / Shoot / Vent), plus touch-look in FP/TP
  - safe-area insets, no accidental zoom or scroll, handling for orientation changes
  - recovery from WebGL context loss
  - handling iOS audio unlock and backgrounding (reconnect on return)
- **Quality tiers** chosen automatically from a quick GPU/frame probe and overridable in settings:
  - Low: no post-processing, DPR ≤ 1.5, reduced shadows
  - Medium
  - High
- **Budgets:**
  - 60 fps target on desktop and recent iPhones (30 fps floor on Low)
  - fewer than 150 draw calls on Low
  - JS frame time under 6 ms
  - initial HQ bundle unchanged (±10%); the mystery code loads as its own lazy chunk
- Make it an installable **PWA** (manifest, icons drawn procedurally to PNG at build time, offline shell). Optional: a Tauri or Electron wrapper for a desktop app, only after everything else is done.

## 8. Accessibility and safety

- Roles and players are never identified by color alone: shape, name and pattern too.
- Colorblind palettes, a reduced-motion option that removes camera shake and flashes, a text-size setting, captions for audio cues, and remappable controls.
- A chat profanity filter (toggle), mute per player, kick/ban for the host. Names are sanitized server-side.

## 9. Testing (thorough, automated, and honest)

1. **Core unit tests (Vitest):** the rules reducer, every role ability and its edge cases (sheriff misfire variants, medic shield vs knife vs gun, poisoner timing across a meeting, jester ejection, gun pickup), every win condition, tie votes and skips, timer expiry variants, sabotage timers, and task progress modes.
2. **Property and fuzz tests:** role assignment for every player count 4–20 against random valid and invalid configs (counts always respected, never more than allowed, deterministic per seed). Run random action streams through the reducer and assert invariants (dead players can't act, cooldowns are respected, exactly one winner set).
3. **Map validation tests** for every map.
4. **Server integration tests:** spin up the real server in-process and connect headless clients to run **full matches at 4, 10 and 20 players** with bots. Cover reconnect mid-match, host leaving, kicking, and invalid or malicious messages (they're rejected and the server stays up). **Hidden-info tests** assert that crewmate clients never receive murderer roles or out-of-vision positions.
5. **Network chaos:** run matches through injected latency (150 ± 50 ms) and 5% packet loss/reorder. Assert there's no desync and no rubber-banding beyond a threshold.
6. **Soak test:** 20-bot matches running back to back at accelerated tick for at least 20 simulated hours. No crashes, leaks or stuck states.
7. **Playwright end-to-end tests:** several browser contexts as separate humans (desktop and the iPhone device profile; WebKit too if it's available) create a lobby, join by code, pick each view mode, play to a result screen, and check for zero console errors. Also cover the HQ → Arcade → lobby → match → back to HQ flow, and that the `arcade.*` events reach the HQ feed.
8. **Agent protocol tests:** the example external agent and the Marion AI bots can finish a match on their own, and the LLM layer falls back cleanly when no key is set.
9. **Performance capture:** record frame times per view mode and quality tier. Headless Chromium uses SwiftShader, so label those numbers as software-rendered and don't claim real-device fps you didn't measure.
10. `npm run typecheck`, `npm test`, `npm run build` and the e2e suite must all pass, and the existing 111 HQ tests stay green.

## 10. Milestones (commit and push after each)

| # | Milestone |
| --- | --- |
| M1 | Core: types, settings schema and validation, seeded RNG, map format and 1 map, role assignment, rules reducer, and tests |
| M2 | Server: lobbies, ticks, snapshots, hidden-info filtering, reconnect, and integration tests |
| M3 | 2D client: full playable loop (lobby → match → meeting → results) |
| M4 | All roles, sabotages, 16+ tasks, ghosts, and the full settings UI with presets |
| M5 | 3D client: third person, then first person, with touch and gamepad controls |
| M6 | AI bots (heuristic + LLM), the Agent Protocol, the SDK and the example agent |
| M7 | Remaining maps, audio, accessibility, PWA, and quality tiers |
| M8 | Art passes 1–3 for every area, with screenshots and critiques |
| M9 | Arcade wing in Marion HQ, `arcade.*` events, HQ art passes, and the merge into the arcade branch |
| M10 | Full test sweep, soak and chaos tests, perf capture, docs (README section, `HOW_TO_PLAY.md`, `HOSTING.md`, `AGENT_PROTOCOL.md`), and the final report |

## 11. Definition of done and final report

The job is done when someone can:

- run `npm install && npm run dev` plus `npm run server`
- open Marion HQ, walk into the Arcade and create a lobby
- have an iPhone on the same network join by code or QR
- fill the remaining seats with Marion bots, choose 2D / FP / TP
- tune every setting, and play full matches to a results screen

…with all of it looking deliberate and polished.

End with a report containing:

- a verification table (command → result)
- per-platform status (verified in emulation vs. on real hardware)
- art-pass before/after links
- known limitations
- a **"Not verified"** list (for example: a real iPhone, a real GPU fps, internet-hosted latency)
- a short real-device QA checklist for me to run on Mac, Windows and iPhone
