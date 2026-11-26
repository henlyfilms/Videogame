# Handoff: Marion HQ + Marion Mystery

This file hands the project over to a new coding agent (Codex) mid-stream. It covers what the
project is, where the code lives, how to run and check it, what was just finished, and what is
next. Read it fully before changing anything.

- **Working branch:** `claude/optimistic-carson-j24o57` (all work below is committed and pushed
  there). Don't push to `main` without the owner's say-so.
- **State at handoff:** typecheck clean, `npx vitest run` 448/448 passing, `npm run build` OK,
  Marion Mystery e2e 12/12 passing.

## What the project is

One Vite + React app with two parts:

1. **Marion HQ**: a "living office" sim. Eight Marion bots (Daniel, Moose, Kanye, Barry, Greek,
   Quill, Sift, Bot Builder) work in ten rooms; each room has a playable mini-mechanic. It has
   a **2D floorplan** and a **3D diorama** view, **seasons** (Auto / Spring / Summer / Fall /
   Winter) and **time of day** (Auto / Day / Night), and a seasonal soundtrack. Entry: `/`.
2. **Marion Mystery**: a 4–20 player social-deduction game (crew vs murderers, plus neutral
   roles). It is launched from the HQ's Arcade room or opened directly at `/?mystery`. It has
   modes Classic, Lights Out (flashlights) and Hide & Seek, and four maps (HQ After Hours,
   Orbital Greenhouse, Midnight Express, Hollowberry Manor). Players and bots are animated
   **berry characters**, including the Marion agents. Views are 2D, 3D third person and 3D
   first person.

## Owner direction (keep following this)

- **Marion agents stay the players / characters.** Don't replace the berry characters.
- **Map design and UI/UX should follow the reference style** the owner supplied: a cel-shaded,
  VR-style social-deduction game. The goal is to match layout, HUD placement, panel and button
  shapes, banners, colours and flow as closely as possible, and to make maps irregular and
  organic (not grids).
- **IP line (important):** follow the references' structure and feel, but build **original**
  icons, wording, room names, floor plans and art. Never copy that game's character design,
  logos, names, map layouts or artwork.
- **Everything should animate smoothly**, in the UI (enter and exit) and in gameplay. Respect
  prefers-reduced-motion and the in-game reduced-motion setting.
- **Every interaction makes a sound** (buttons, footsteps, wall bumps, tasks, flashlight, and so
  on).

### Reference photos

There are 55 reference screenshots plus a README describing them (more may be added). They are deliberately **not**
in this branch, because they are captures of another game. Read them from the other branch:

```bash
git fetch origin claude/determined-bohr-fbkom9
git show FETCH_HEAD:reference-photos/marion-mystery/README.md
mkdir -p /tmp/refs && git archive FETCH_HEAD reference-photos/marion-mystery | tar -x -C /tmp/refs
```

Don't commit them into this branch.

## Commands

```bash
npm ci                     # deps (node_modules is not committed)
npm run dev                # Vite dev server → http://localhost:5173/ (HQ), /?mystery (game)
npx tsc --noEmit -p .      # typecheck (strict, noUncheckedIndexedAccess, noUnused*)
npx vitest run             # unit tests (jsdom + canvas mock)
npm run build              # tsc + vite build → dist/
npm run e2e                # Playwright e2e for Mystery; serves dist/ via server/index.ts, so build first
npm run start:server       # production server: static dist + WebSocket rooms on :8787 (/mystery, /healthz)
```

Debug hooks:
- HQ: `window.__hq = { hq, manager, store }`. Persisted state is in localStorage key
  `marion-hq:v1` (`hqView`, `season`, `timeMode`, `onboarded`, …).
- Mystery: open `/?mystery&debug=1` to get `window.__mm = { store, runtime, server }`.
  `__mm.store.getState().startFreeplay({ map, mode, role })` and `startSolo()` jump straight
  into a match. Prefs are in localStorage `marion-mystery:v1` (`view: '2d'|'3d-tp'|'3d-fp'`,
  `quality`, `name`).

## Code map

### Marion HQ (`src/`, excluding `src/mystery`)

| Path | What |
| --- | --- |
| `src/engine/world.ts` | HQ floorplan: rooms with their own position, size, outline polygon and doors, plus explicit `CORRIDORS`/`COURTYARDS`, tube routes and `buildGrid()`. The layout was just made irregular. |
| `src/engine/geometry.ts` | Room outline polygons, point-in-polygon, polygon offsets, outline tracing |
| `src/engine/sim.ts`, `camera.ts`, `loop.ts`, `bubbles.ts` | Bot simulation, pathing, camera springs, fixed-step loop, speech bubbles |
| `src/game/hq.ts` | HQ controller. `HqRenderer` interface; `attach` / `attachRenderer` / `screenToWorld` |
| `src/game/wire.ts` | Store → sim/renderer glue; syncs season and timeMode into `hq.ui.season` / `hq.clockOverride` |
| `src/render/renderer.ts` | 2D renderer (chunk cache, Mystery-style navy walls, berry bots via `drawBerryBot`) |
| `src/render/seasonal.ts` | Seasonal grounds, trees (`TREES`), particles, `groundCanvas()`, room floor textures, `lookFor()` (berry look per bot) |
| `src/render/ground.ts`, `daylight.ts`, `lighting.ts`, `props.ts` | Gardens, day/night lamps and windows, lighting, room props |
| `src/render3d/hq3d.ts` | 3D diorama (lazy-loaded three.js): walls merged into runs, props, berry rigs, overlay canvas for tags and bubbles, seasonal trees and particles, night lighting, screen-space picking |
| `src/theme/environment.ts` | `Season`, `TimeMode`, `HqView`, `SEASON_STYLE`, `seasonFor()`, `nightFactor()` |
| `src/ui/*` | HQ React UI (`TopBar` has the 2D/3D switch and the season/time picker `EnvPopover`; `GameCanvas` swaps renderers by view) |
| `src/audio/audio.ts` | Older sim-effects engine (chimes, whoosh, stamp) |
| `src/audio/hqSound.ts` | HQ soundtrack and ambience on the Mystery audio engine. Unlocks on first gesture, plays UI sounds, and hands music to and from Mystery |
| `src/arcade/*` | Arcade overlay (`useArcade.launch/close`), bridge to Mystery |
| `src/store/gameStore.ts` | Zustand store + persistence |

### Marion Mystery (`src/mystery/`)

| Path | What |
| --- | --- |
| `core/` | DOM-free deterministic rules: `types`, `settings` (versioned, presets, share codes), `roles`, `match` (reducer/tick/win), `project` (per-player hidden-info projection), `modes`, `vision`, `tasks` (26+ tasks), `map.ts` (tile map format + compile + A*) |
| `core/maps/*.ts` | The four maps + lobby, built with `MapBuilder` (`chamfer()` makes octagons and cut corners; `path()` builds bent corridors). `validate.ts` checks every map |
| `server/room.ts` | Transport-agnostic RoomHost/GameServer (used by the Node WS server and by the in-browser LocalTransport) |
| `net/protocol.ts` | Wire protocol |
| `ai/bot.ts` | Bot brains (tasks, sabotage response, evidence, voting, chat) |
| `client/` | `store` (Zustand), `runtime` (prediction and interpolation), `input`, `transport`, `prefs`, `frame` (per-frame data incl. in-world `prompts`) |
| `render2d/` | 2D renderer. `world.ts` holds the cel/ink style kit, `overview.ts` paints the map overview, `paint.ts` paints floors and props |
| `render3d/` | 3D (`scene.ts` map meshes, `worldkit.ts` cel/outline kit, `view3d.ts` cameras, lights, characters) |
| `characters/` | Berry catalog, 2D painter, 3D rig (`createBerry`) |
| `ui/` | React UI. `kit.tsx` has shared components and enter/exit motion helpers. Fonts (Oswald, Barlow; OFL) are self-hosted in `ui/fonts/`. Screens: `Menus`, `WaitingRoom`, `Hud`, `Overlays` (banners, meetings, ejection, results), `MatchSettingsPanel`, `CustomizeEditor`, `Freeplay`, `TouchControls`, `tasks/*` |
| `audio/` | `engine.ts` (procedural Web Audio synth), `music.ts` (18 tracks incl. `hq-spring/summer/fall/winter/night`, stingers, `renderTrack` for offline renders), `sfx.ts` (UI, footsteps, world events, ambience) |

Other: `server/index.ts` (Node HTTP + WS), `server/llm.ts` and `server/agent-sdk/` (external agent players), `docs/mystery/*` (how to play, hosting, agent protocol, research, progress), `tests/` (unit; `tests/mystery/*`; `tests/e2e/mystery.e2e.mjs`).

## What was just done (most recent first)

1. **Mystery UI/UX redo** (`src/mystery/ui/*`, commit `a8febe5`). Reference-style dark panels
   with thin outlines, condensed caps and pill buttons. HUD: role badge + task bar + checklist
   top-left, minimap bottom-left (drawn from the map grid), round buttons top-right, one big
   context action bottom-right (kill cooldown ring). Also done:
   - meeting banners (Emergency Meeting / Body Reported) and the voting panel;
   - sabotage siren banner;
   - lobby board with code, capacity, privacy and Edit/View;
   - settings tabs (Audio / Gameplay / Controls / Match);
   - tablet map with task list;
   - wardrobe grid, end-of-round board, and the elimination slash cutscene;
   - enter/exit motion everywhere.
2. **Mystery world art** (`render2d/`, `render3d/`, commit `94d5c7b`). Cel look with ink
   outlines; teal riveted walls with a beige wallpaper band and a dusty-pink stripe; corridor
   guide stripes; outdoor rock, snow and lava; room names on floors. Original in-world prompts:
   - report burst over a body;
   - kill-target red outline with a skull badge;
   - vent highlight, plus in-vent arrows to linked vents;
   - bobbing task arrow over a dotted ring;
   - pill name tags (the local player's tag has a green outline).
3. **Bot fix** (`ai/bot.ts`, commit `189a118`): bots whose route came back empty while doors were
   shut now re-plan every second and drop the goal after 8 s.
4. **Mystery maps** (`core/maps/*`, commit `76e14d3`): all four are now irregular (octagon hubs,
   L-shapes, bent corridors, dead ends, outdoor zones, four vent networks each), with original
   room names. They pass validation.
5. **HQ floorplan** (`src/engine/world.ts` and its consumers, commit `c910817`): the 3×3 grid is
   replaced by an irregular station (octagonal Command hub, L-shaped and angled rooms, dog-leg
   corridors, courtyard gardens).
6. **HQ 2D/3D views, seasons, day/night, soundtrack** (commits `34a4158`, `df269e6`).

## Known gaps / next steps (suggested order)

Done since the first handoff: Practice map thumbnails, tablet map and sabotage map checked on
the new maps (they use the new painter); meeting-seat rings and extra props in every map hub;
3D first-person ceilings with light panels and corridor strips; the sabotage arrow follows the
3D camera; HQ room hover/click uses the real room outline; fuller HQ Huddle and Foundry; and the
HQ 3D overview frames the whole station; HQ tube ports sit on hall-facing walls and tubes no longer cross open ground; phone elimination cutscene fits the screen and the Practice coach starts collapsed on phones; whole-character 3D ink outlines (`characters/outline3d.ts`) and per-room map icons (`render2d/roomIcons.ts`).

1. **Visual QA on real screens.** Check every Mystery screen on desktop and phone against the
   references (`git show` them from the reference branch). Room-name floor labels may clip in
   small rooms.
2. **Performance on real devices is unverified.** Headless 3D runs on software GL at 1–6 fps.
   2D first-time chunk bakes can hitch (about 130 ms). Test on Mac, Windows and iPhone.
3. **Audio on real devices**: check the iPhone first-tap unlock and the levels on real speakers.
4. **Map balance**: the all-bot sims show murderers winning most games, on both the old and new
   layouts. The tuning knobs are in `ai/bot.ts` and `core/settings.ts`.

## Gotchas

- **Vite "Invalid hook call" / duplicate React in dev** after dependency or config changes:
  restart with `npx vite --force`. Production builds are unaffected.
- **No Prettier config in the repo.** Don't run `npx prettier --write` on whole files: its
  defaults (double quotes, 80 columns) reformat everything. The house style is single quotes
  and long lines (~160–200 columns).
- **The e2e can be timing-sensitive:** bots may report a body early. The Stats step waits up to
  180 s for the HUD to return.
- **iOS audio** only starts after a user gesture. Both HQ and Mystery unlock on the first
  pointerdown or keydown.
- **Dynamic imports in page probes:** when importing a module in a Playwright probe, use the
  exact resource URL from `performance.getEntriesByType('resource')`. Otherwise you get a second
  module instance.
- **Never put API keys in client code.** LLM-backed agents run server-side (`server/llm.ts`).
- **Commit style**: conventional prefixes (`feat(mystery): …`, `fix(hq): …`).

## Where things are documented

- `README.md`: HQ + Mystery overview, controls, views and seasons, persistence and audio,
  verification.
- `docs/mystery/HOW_TO_PLAY.md`, `HOSTING.md`, `AGENT_PROTOCOL.md`, `RESEARCH.md`, `PROGRESS.md`.
- `docs/prompts/murder-mystery-prompt.md`: the original build brief.
- `docs/art-passes/`: screenshots from earlier art passes, including HQ contact sheets.
