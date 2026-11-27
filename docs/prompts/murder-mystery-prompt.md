# Build prompt: "Marion Mystery", a multiplayer social-deduction game for the Marion HQ Arcade

> Paste everything below the line into a fresh Claude Code session on the `henlyfilms/Videogame` repository.

---

You are building **Marion Mystery**: a complete, polished, release-ready **multiplayer murder-mystery / social-deduction game**, with several game modes, four large maps and customizable berry characters. It is playable in 3D (first or third person) and in a simplified 2D view. You are also building the **Arcade** inside Marion HQ that launches it, plus a visual upgrade of Marion HQ itself.

Ship working software. No stubs, TODOs, placeholder screens, or "left as an exercise" sections. If something truly can't be done in this environment, such as testing on a physical iPhone, finish everything around it and list it plainly under "Not verified" in the final report.

This job is large. Work in the numbered milestones below. Commit and push after each one. Keep a running `docs/mystery/PROGRESS.md` (what's done, what's next, any open decisions) so the work can resume cleanly after context compaction or a new session.

## 0. Ground yourself in the repo, then research

### 0a. Read the repo

Read `README.md` and skim `src/` before writing code. Here is what's already there:

- **Marion HQ** is a Vite 5 + React 18 + strict TypeScript (`noUncheckedIndexedAccess`) + Zustand + Tailwind app, tested with Vitest (jsdom + canvas mock, 111 tests). It renders a procedural Canvas 2D office with no external image, audio or font assets.
- **One event pipeline:** every source publishes `MarionEvent`s (`src/adapters/events.ts`, validated against `EVENT_SCHEMA`) onto a bus. A pure reducer (`src/game/mechanics.ts`) is the single source of truth. Keep that architecture style: game rules live in pure, testable reducers, and renderers never own rules.
- **Bot roster** (`src/data/bots.ts`): Daniel, Moose, Kanye (Marion Agent), Barry (Marion Life), Greek (Marion Engine), Quill, Sift and Bot Builder. Each has a color, a glow color and a signature **shape** (funkyberry, marionberry, heart, gem, star, blueberry, cloud). Custom bots from the Foundry are persisted too. These are the "Marion agents" that must be able to play.
- There's already a `WebSocketAdapter` with backoff and fallback, a procedural Web Audio engine (`src/audio/audio.ts`), and Light / Soft / Dark theme tokens (`src/theme/tokens.ts`).
- The **default branch, `claude/tender-davinci-w8ctcn`, is the Marion HQ branch.**

### 0b. Research and analysis (do this before M1, and write it down)

Write `docs/mystery/RESEARCH.md`. Use web search if it's available; otherwise work from what you already know, and say which.

Study what makes these games work, and how their mechanics and UX are built:

- **Among Us and Among Us 3D** (the primary reference)
- **Phasmophobia** (secondary: dark-mode atmosphere, flashlights, tension, sound)
- **Murder Mystery 2** (the sheriff and gun mechanics)
- popular social-deduction mods and role packs (for example, Town of Us–style roles)

Cover at least:

- the feature checklist of the genre:
  - emergency button and meetings, body reports
  - task types (common/short/long, visual tasks), task bar modes
  - sabotages (lights, comms, doors, two critical ones)
  - vents
  - security tools: admin map, cameras, vitals, door logs
  - ghosts
  - the Hide & Seek mode
  - lobby customization, cosmetics (hats, visors, skins, pets, nameplates), quick chat
  - meeting UI conventions, the eject screen, post-game summaries
  - anti-grief tools
- what makes a map good: loops vs. dead ends, chokepoints, sightlines, vent placement, task spread, meeting walk-times
- what makes the dark-mode tension work: limited light, sound cues, flicker, battery pressure
- onboarding for new players, and pacing for 4 vs. 20 players

End the doc with a **decision table**: each idea marked **Implement / Adapt (with the Marion twist) / Skip (with reason)**. Then implement everything marked Implement or Adapt. Treat this as the "and anything else that would be good for Marion Mystery" requirement; don't stop at the list in this prompt.

**IP rule:** these games are references for *mechanics and feel*. Don't copy their characters (including the bean-with-visor silhouette), maps, art, UI layouts, sounds, logos or names. Everything visual and audible is original and in **Marion style** (defined in §5).

## 1. Branching and merge plan

1. Create `feature/marion-mystery` from the Marion HQ branch. All game work goes there.
2. When the game is complete and tested, create `feature/marion-arcade` from the Marion HQ branch. Build the Arcade and the HQ visual upgrade there, merge `feature/marion-mystery` into it, resolve conflicts, and re-run every test.
3. Open a PR from `feature/marion-arcade` into the Marion HQ branch only if I ask for one.

If your environment assigns you a specific branch to push to, push there instead and treat the names above as the logical structure. Note the mapping in `PROGRESS.md`.

## 2. Architecture

- **Shared pure core: `src/mystery/core/`.** No DOM, no Three.js. It runs identically in the browser and in Node and holds:
  - match state
  - the rules reducer, with **game-mode plug-ins** (each mode adds rules, win conditions and settings through one `GameModeDef` interface)
  - role assignment
  - the settings schema and validation
  - map data
  - collision, line-of-sight and light/visibility queries
  - task definitions
  - win conditions
  - stats aggregation
  - a seeded RNG
- **Authoritative server: `server/`.** A Node + `ws` server that runs the core and owns every rule decision: kills, cooldowns, votes, task completion, flashlight battery, win checks. Requirements:
  - Fixed 30 Hz tick. Snapshots at 20 Hz, sent as delta-compressed JSON (or a compact binary format if it measurably helps).
  - **Hidden information is enforced on the server.** A client never receives another player's role (unless the rules reveal it), positions outside its own vision/light and line of sight, private ability results, or stats its role shouldn't see. This blocks wallhacks and role-sniffing from devtools.
  - Rooms and lobbies with 6-character join codes (no confusable characters like O/0, I/1), plus a QR code for phones and shareable invite links.
  - Reconnect within 60 s, keeping the same seat, role and cosmetics.
  - The host can kick players. If the host leaves, host status passes to another player.
  - Per-connection rate limits and server-side validation of every action. Never trust the client.
  - `npm run server` (dev) and `npm run start:server` (prod). Include a `Dockerfile` and short deploy notes for one host (Fly.io or Render), plus **LAN play**: a Mac on the same Wi-Fi hosts it and an iPhone joins by code.
- **Client: `src/mystery/`.**
  - `client3d/`: Three.js, pinned to an exact version and lazy-loaded so the HQ bundle doesn't grow.
  - `client2d/`: Canvas 2D, reusing the HQ renderer's techniques.
  - `characters/`: the berry character system, shared by both renderers.
  - `ui/`: the React HUD, menus, lobby, settings, meetings, stats and results. Both 2D and 3D skins are built (§6).
  - `net/`: client prediction for the local player, interpolation for remote players, reconciliation, latency display.
- **Assets:** keep the HQ rule of no fetched runtime assets. Build geometry, materials, textures (via canvas/noise), hair, particles and audio procedurally in code. If you want glTF, generate it in code at build time and commit it.

## 3. Players, agents and people

- **4–20 players** per match. Any mix of:
  - humans on Mac, Windows or iPhone
  - **Marion agents** (the roster plus Foundry custom bots)
  - **external agents**
- Each Marion agent appears as a **berry character** with its signature color and glow, and an accessory that nods to its HQ shape: a heart pin for Kanye, a gem crown for Barry, a star badge for Greek, a cloud hat for Bot Builder, and so on.
- **Agent Player Protocol** (`docs/mystery/AGENT_PROTOCOL.md`): a documented WebSocket JSON protocol that any agent can use to join a lobby by code with a token.
  - Agents get the *same* observations a human in that seat would get (a structured version: visible players, their own tasks, nearby bodies, chat, meeting state, the stats their role can see) and send the *same* actions. No extra information, ever. In dark mode, that means only what their flashlight reveals.
  - Ship a small TypeScript SDK (`packages/mystery-agent-sdk/` or `server/agent-sdk/`) and an example agent.
- **Built-in AI brain** so the host can fill empty seats with Marion agents:
  - A deterministic heuristic layer handles navigation, doing tasks, faking tasks as a murderer, killing only when unobserved, self-reporting rules, sheriff judgment, flashlight use, hide & seek behavior, and suspicion tracking from what the agent actually witnessed.
  - An optional LLM layer writes meeting chat and voting reasoning in each bot's personality. Use the Anthropic SDK (check the `claude-api` skill for current model IDs; use a fast, cheap model for chatter). Read the API key from server env only, never ship it to clients. Add hard timeouts and a per-match budget, and fall back to the heuristic layer whenever the LLM is unavailable.
  - Difficulty levels: Easy, Normal, Sharp.
- **Bridge to HQ:** emit `arcade.match_started`, `arcade.player_joined`, `arcade.match_ended` (with mode, winners, MVP and each Marion bot's result) as `MarionEvent`s. Add them to `EVENT_SCHEMA` so the HQ activity feed and bots react: a bot walks to the Arcade when it joins a match, and celebrates or sulks afterwards.

## 4. Game design

Blend **Among Us–style social deduction** (tasks, emergency meetings, voting, sabotage, vents, security tools) with **Murder Mystery–style weapons** (the sheriff's gun, a gun that drops when the sheriff dies, a murderer's knife).

### 4a. Game modes

All modes share the core loop, roles, maps, characters, stats and Marion style. The host picks the mode in the lobby. Each mode has its own settings page, its own icon/key art, and a short "how this mode works" card shown on match start.

1. **Classic (the default).** Bright, well-lit maps; everyone sees clearly. It only goes dark when a murderer sabotages the **Lights**: crew vision shrinks to a small radius with a soft vignette until the lights are fixed at the breaker panel, while murderers keep their vision. The full genre feature set applies:
   - emergency button and meetings, body reports
   - common/short/long tasks and visual tasks, and a crew task bar
   - all sabotages, vents
   - admin map, cameras, vitals and door logs
   - ghosts
2. **Lights Out (the in-the-dark mode).** Maps run at night with minimal ambient light. **Every crewmate carries a flashlight**: a cone light in 3D and a light wedge in 2D.
   - **Flashlight:** you can toggle it, it has a limited battery, and there are recharge stations and battery pickups around the map. Low battery makes it flicker. The beam shows other players *only* where it lands, so the server culls positions by light and line of sight.
   - **Murderers:** they have no flashlight but slightly better dark vision (configurable). Extra ability: **Blackout** briefly kills every flashlight in one room.
   - **Atmosphere:** Phasmophobia-style tension done in Marion style:
     - creaks, distant footsteps and positional audio
     - breath-fog in cold rooms
     - glow-in-the-dark task panels and emergency strip lighting
     - a light-flicker warning shortly before a nearby kill (toggleable for accessibility)
   - Keep it **spooky-fun, not horror**: no jump-scare gore.
3. **Hide & Seek.** A genre staple. One or more seekers are revealed at the start. Crewmates hide and finish tasks to shorten the clock, and there's a final countdown where the seekers speed up. There are no meetings, and seekers get a proximity "danger" meter.
4. **More modes from your research.** If your research shows other strong modes (for example, *Sheriff Showdown* or a *Detective Night* clue-gathering mode), add them through the same `GameModeDef` plug-in. Only do this after modes 1–3 are polished.

### 4b. View mode (locked once the match starts)

- **3D First Person:** pointer-lock mouselook on desktop, touch-look on iPhone.
- **3D Third Person:** over-the-shoulder follow camera with collision so it never clips through walls.
- **2D Simplified:** top-down, readable, lightweight. Also the low-end and accessibility option.

The host picks either one view for everyone or "player's choice". Either way, each player's view is fixed once the match starts. Every game mode works in all three views, on the same server simulation and the same map data.

### 4c. Roles

Every role has: an enabled toggle, a count (or a % chance), and its own tuning values. Give each one a clear role-reveal card and a help entry.

| Team | Role | Ability |
| --- | --- | --- |
| Murderers | **Murderer** | Knife kill with cooldown. Optional throwable knife. Sabotage. Shortcut vents. Can fake tasks. |
| Murderers | **Accomplice** | Can't kill. Can sabotage and use vents. Knows the murderers (configurable). |
| Murderers | **Poisoner** | Delayed kill: the target drops N seconds later. |
| Crew | **Crewmate** | Tasks. |
| Crew | **Sheriff** | Gun with cooldown. Misfire rule on an innocent is configurable: sheriff dies / both die / gun is lost. When the sheriff dies the gun drops and any crewmate can pick it up as the **Hero** (configurable). |
| Crew | **Detective** | Inspects bodies for clues: time since death, the killer's berry type *or* color family (configurable), footprints for a short time. |
| Crew | **Medic** | Shields one player per round, sees a flash if the shield is hit, and has access to vitals from anywhere for a short time. |
| Crew | **Engineer** | Uses vents. Remote-fixes one sabotage per match. |
| Crew | **Lookout** | Watches security cams. Can place one portable camera. |
| Crew | **Tracker** | Tags a player and sees their arrow for N seconds. |
| Crew | **Mayor** | Hidden double vote, or a reveal that grants extra votes. |
| Neutral | **Jester** | Wins if voted out. |
| Neutral | **Survivor** | Wins if alive at the end. |

Also add any more roles your research marked Implement/Adapt, such as a Guardian-style ghost role or a role that can disguise as another player.

Validate role counts against the player count with clear inline errors. Examples: murderers must be fewer than half the players, and special roles can't exceed the number of players. Include presets: **Classic**, **Lights Out**, **Hide & Seek**, **Chaos**, **Detective Night**, **Quick Match** and **Custom**. Presets can be saved, loaded, and shared as a URL/code.

### 4d. Settings (everything is host-configurable)

- **Game mode, map and view mode**
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
- **Lights Out:** flashlight cone angle and range, battery life, recharge rate, number of pickups, murderer dark vision, Blackout cooldown, kill-flicker warning on/off
- **Hide & Seek:** number of seekers, hide time, final countdown length, seeker speed boost
- **Ghost rules:** ghosts finish tasks (on/off), ghost chat
- **Chat:** text chat on/off, quick-chat wheel, proximity text chat
- **Bots:** count and difficulty
- **Lobby:** privacy (public, code-only, LAN)

Store settings in a versioned schema with migrations, and validate them on the server.

### 4e. Core loop and win conditions

**The loop:**

1. Title screen
2. Create or Join Room
3. **Waiting room** (§5c)
4. Role-reveal animation
5. Free roam with tasks, kills, sabotage and vents
6. Report a body, or hit the **emergency button** (it has a physical, animated button prop in the meeting room of every map)
7. Meeting: discussion (text chat, quick chat, "last seen" and detective evidence), then the vote
8. Eject reveal, honoring confirm-ejects
9. Repeat from step 5 until a win condition is met, then the results screen

Ghosts stay in the game: they can do tasks and use ghost chat.

**Win conditions:**

- **Crew wins** when all tasks are done, or all murderers are eliminated.
- **Murderers win** when they equal or outnumber the crew, when a critical sabotage isn't repaired in time, or on timer expiry if the setting says so.
- **Neutral roles** win alongside either side.
- **Mode-specific conditions** come from each `GameModeDef`.

### 4f. Tasks

Build at least **24 distinct, touch-friendly task mini-games**. Each must be playable with mouse, keyboard, touch and a controller, playable in both 3D (as a world-anchored panel) and 2D, and take 3–15 s.

- **Task types:** common (everyone shares them), short, long/multi-step (go to room A, then room B), and **visual tasks** that bystanders can see happen (they prove innocence, and you can turn them off in settings).
- **Spread:** every map spreads tasks so players have to move around the whole map.
- **Theming:** some tasks are themed to Marion HQ:
  - Approve-stamp the mail
  - Sort clips
  - Distill a reel
  - Slot a skill cartridge
  - Re-route a pneumatic tube
  - Calibrate the turntable
  - Sort berries by ripeness
  - Juice press
- **Genre classics** are included too, each rebuilt in Marion style:
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
  - Empty the trash chute
  - Scan at the med-bay (a visual task)
- **Lights Out–specific tasks:** replace a fuse in the dark, recharge the generator, find and light the lanterns.
- **Murderers:** see fake-task prompts so they can fake convincingly.

### 4g. Sabotage and security

- **Sabotages:** at least Lights, Comms (hides the task list and meeting info), Doors (lock a room), and two critical sabotages with countdowns and two-person fixes. Each map gives its criticals its own theme: in Marion HQ After Hours, for example, the server-room overheat and the pneumatic-pressure burst.
- **Security tools:** admin map (room occupancy counts), cameras, vitals and door logs. Spread them across the maps so no single spot sees everything.

### 4h. Maps: four large maps, ready to play

Build **four original maps**, all playable in every mode and every view:

| Size rule | Requirement |
| --- | --- |
| Rooms | **14–20 rooms** plus connecting hallways |
| Crossing time | at least **45–60 s** to walk across at default speed, so meetings and travel feel meaningful |
| Layout | multiple **loops** (no long dead-end chases), varied sightlines, chokepoints, and **2+ separate vent networks** |
| Facilities | one meeting room with the emergency button, plus security, admin and vitals spots |
| Lighting | a day/bright variant and a night/Lights Out variant |

1. **Marion HQ After Hours:** the HQ wings, reimagined and enlarged: Command, Engine Room, Co-Pilot Bridge, Life Hub & Vault, Media Vault, Cutting Room, Mailroom, Foundry, Huddle Room, the new Arcade, a rooftop, a server room and a basement archive.
2. **Orbital Greenhouse:** a space-station farm ring with berry hydroponics, an observation dome, a reactor and docking bays.
3. **Midnight Express:** a snow-bound sleeper train (dining car, sleeper cars, engine, cargo, observation car) with a station platform. It has a murder-mystery feel.
4. **Hollowberry Manor:** a grand old orchard mansion (foyer, library, ballroom, kitchen, wine cellar, attic, greenhouse, hedge maze, orchard). It's built to shine in Lights Out.

The map format is JSON plus a validation test (connectivity, spawn points, task reachability, vent graph, loop count, crossing time, light-station placement), so adding a map later is just adding data. Each map gets its own ambient soundscape and eject sequence.

## 5. Characters, customization, animation and visual direction

### 5a. Marion style (applies to every mode, map and screen)

Marion style means:

- **Glow** as identity: characters, interactables and UI accents have soft neon glow.
- **The HQ's design tokens:** cobalt `#2f6fed` / `#6ea1ff`, teal for team/comms, flat 10 px radius cards.
- **Warm, toy-like materials.**
- **Berries everywhere:** in props, decals and task themes.
- **Playful humor** in animations and copy.
- **The HQ bots** as recurring cameos: posters, a hologram of Daniel at the meeting table, Quill's stamp on the emergency button, and so on.

Classic is bright and cozy. Lights Out is moody, with glowing accents in the dark. Hide & Seek has an arcade-y energy.

**References:** Among Us 3D is the *primary* reference: chunky, readable, toy-like, bright, with soft toon lighting and funny kill/eject moments. Phasmophobia is the *secondary* reference, for Lights Out only: flashlight feel, darkness, sound-driven tension. **Lean toward Among Us.** Both are reference for feel only (see the IP rule in §0b).

### 5b. Berry characters

Every player is an **animated berry character with human-like features**: expressive eyes with blinks and saccades, eyebrows, a mouth with visemes for emotes and chat pops, little arms with hands, and legs with feet. They walk, run, idle, wave and react.

- **Berry types** (each a distinct silhouette and surface; each has its own texture made in code):

  | Berry | Surface |
  | --- | --- |
  | Strawberry | seeds and leafy top |
  | Blueberry | dusty bloom and crown |
  | Raspberry | drupelets |
  | Blackberry | glossy drupelets |
  | Marionberry | Marion's signature |
  | Cranberry | |
  | Gooseberry | striped, translucent |
  | Cherry | stem |
  | Grape | |
  | Elderberry cluster | |
  | Boysenberry | |
  | Golden raspberry | |

- **Personalities and variety:** some funny (googly eyes, buck teeth, a goofy walk), some cool (shades, a smirk, a swagger walk), some cute, some mysterious.
- **Hair:** a variety of styles, including **long flowing hair**, ponytails, braids, curls, an afro, a mohawk, buns, a leafy "hair" top, and bald. Long hair gets simple secondary motion (spring bones in 3D, follow-through in 2D).
- **Full customization, like the genre standard, all in Marion style:**
  - berry type, body color (with a curated, colorblind-tested palette plus a free picker, and duplicate-color resolution in the lobby), a pattern/skin
  - face (eyes, brows, mouth), hair style and hair color
  - hat
  - face accessory (glasses, visor, mask, mustache)
  - outfit (hoodie, suit, lab coat, space suit, scarf)
  - backpack/back item
  - a pet that follows you
  - nameplate
  - an emote set and a victory pose
- **Where it lives:** customization is saved per player (local profile, plus sent to the server for display). Ship **at least 12 berry types, 20 hair styles, 30 hats, 15 face accessories, 15 outfits, 10 pets, 10 nameplates and 8 emotes** at launch.
- **Readability:** a character must read at gameplay distance in both 3D and 2D. Its name and a distinct color-plus-shape pairing are always visible.

### 5c. Waiting room (lobby)

A walkable **waiting room** where players gather while others join. It's a small themed space (a Marion HQ break-room / launch-bay), built in 3D *and* 2D.

- **Room info:** the room code shown large with a copy button, a QR code, and an invite link.
- **Players:** a player list with ready-check, ping and platform icons (Mac/Windows/iPhone/Agent), plus host controls (start, kick, add Marion bots, settings).
- **Customization:** a **wardrobe station / mirror** opens the full customization editor, with a live preview that updates for everyone instantly. A laptop opens the settings (read-only for non-hosts).
- **Fun while you wait:** emotes and quick chat, and a few toys to mess with: a bouncy berry ball, a turntable, a whiteboard.
- **Visibility:** game mode, map, role counts and a settings summary are shown on a big board.
- **Start:** a countdown when the host starts, plus a minimum-player check (4) and a role-count validation warning.

### 5d. Menus in both 2D and 3D

Build the **title screen, Create Room, Join Room (code entry with a large touch-friendly keypad and paste support), room browser for public/LAN rooms, waiting room, settings, customization, stats/profile and results** in **both** a 3D presentation and a 2D presentation:

- **3D:** the camera flies around a diorama of the map, with characters in the scene.
- **2D:** flat, illustrated, top-down / card-based layouts.

The player's chosen view preference (picked on the title screen and remembered) decides which one shows. Both share the same React state and logic; only the presentation layer differs. If the host forces a view for the match, the in-match view follows the host, but menus keep the player's preference.

### 5e. Animations (smooth, juicy, and on every key moment)

Every animation is hand-tuned with easing curves, anticipation and follow-through, and has a reduced-motion variant. Each also has a 2D version (sprite/vector tweening) alongside the 3D one.

- **Role reveal:** a dramatic, polished reveal card per role:
  - a team-colored light sweep
  - your character in a role pose (knife twirl for the Murderer, gun spin for the Sheriff, magnifier for the Detective)
  - your teammates shown to murderers
  - a role description and ability icons
- **Kills:** multiple stylized, **non-gory**, funny-dramatic kill animations per weapon, chosen at random:
  - a berry "squish" with a juice splash and confetti-like seeds
  - the knife slash with a cartoon freeze-frame
  - the poisoner's delayed wobble-and-flop
  - the sheriff's shot with a puff of smoke

  The victim leaves a **body** (a deflated/squished berry with a ghost rising out). The killer gets a short snap animation; nearby players see it if it's in their view/light.
- **Body report and emergency meeting:** a full-screen alarm splash with the reporter's character, then a smooth transition into the meeting table scene.
- **Meeting:** chat bubbles pop in, vote stamps (Quill's brass stamp) slam onto ballots, a drumroll tally, and the skip pile.
- **Eject:** a per-map eject sequence (launched out of the HQ pneumatic tube, off the train's caboose, into space from the Greenhouse airlock, through the manor's trapdoor) with "X was / was not the Murderer" text that types on.
- **Other moments:**
  - ghost transition
  - venting in and out
  - task-complete flourish
  - task bar fill
  - sabotage alarms
  - lights flickering off and on
  - flashlight power-up/die
  - gun pickup as Hero
  - medic shield bubble
  - victory and defeat screens with team poses and confetti/rain
- **Ambient life:** idle fidgets, blinking, looking at nearby players, hair sway, and pets following.

### 5f. Visual quality and the art-pass process

- **3D look:**
  - toon/cel shading with soft rim light
  - baked-feel ambient occlusion
  - a per-map color script, plus a distinct palette for sabotage states (red alarm wash for criticals, darkness for Lights)
  - instanced props, bloom on glows (with a low-quality fallback that skips post-processing)
  - volumetric-looking flashlight cones in Lights Out, done cheaply (cone mesh plus additive gradient)
- **2D look:** a flat top-down style matching the HQ's drafting-line aesthetic, with crisp berry sprites, glow, readable vision cones, a darkness mask, and flashlight wedges.
- **UI:** reuse HQ design tokens. Big, thumb-friendly buttons on phones; respect safe areas. Role-reveal, meeting and results screens should feel like *moments*.
- **Audio:** procedural Web Audio consistent with the HQ:
  - ambient beds per map and per mode
  - footsteps by floor type, task blips, the kill sting, the meeting alarm, the vote drumroll, the eject whoosh
  - Lights Out: positional creaks and flashlight clicks
  - everything muted until the first user gesture (iOS requires that)
- **The art-pass process (do this for real):** for each of 3D-FP, 3D-TP, 2D, Classic vs. Lights Out lighting, the characters and customization, the menus and waiting room (both 2D and 3D), the key animations, and Marion HQ, run **at least three passes**:
  1. readability/blockout
  2. lighting, materials and color
  3. polish (VFX, animation, juice, typography)

  After each pass:
  - capture Playwright screenshots (and short frame sequences for animations) from a fixed set of camera positions at a desktop size (1440×900) and an iPhone profile
  - save them to `docs/art-passes/<area>/pass-N/`
  - write a short critique against a checklist (silhouette readability, color harmony, contrast and accessibility, visual hierarchy, Marion-style consistency, animation timing, "does it feel alive"), then fix what you found

  Show the before/after in the final report.

## 6. Stats (visible to everyone, filtered by role)

Each player gets a **stats panel** (a HUD widget plus an expandable tab) that shows what their role is allowed to know. Every stat is computed on the server and filtered per role, and respects settings: if the task bar is set to "never", it's hidden for everyone.

- **Crewmates and crew roles:**
  - your task list with per-task progress and arrows/markers to task locations
  - your completion count
  - the **crew task evaluation bar** (overall progress), plus per-category bars (common/short/long) and per-area progress
  - time remaining
  - meetings left
  - role-specific stats (sheriff's shots and cooldown, medic's shield target, tracker timers, flashlight battery in Lights Out)
- **Murderers:**
  - **players left alive** (crew vs. murderers)
  - kills needed to win
  - kill and sabotage cooldowns
  - your kill count
  - an estimate of the crew task bar (as allowed by settings)
  - which sabotages are ready
  - time remaining
  - teammates' status
- **Neutral roles:** their own win-condition progress.
- **Ghosts:** a full spectator overview after death (configurable).
- **Hide & Seek:** the hiders-left count and the seeker danger meter.
- **Post-match results:**
  - every player's role, and a timeline of kills, meetings, votes and sabotages
  - a heatmap of movement
  - an MVP and fun awards ("Most Sus", "Speedrunner", "Lights Fixer", "Clutch Sheriff")
  - accuracy of each player's votes
- **Lifetime profile stats,** persisted locally and on the server when available:
  - games played and won per role and per mode
  - kills, tasks, correct votes, survival rate
- **Arcade leaderboard:** shown in Marion HQ.

## 7. Marion HQ: the Arcade and a graphics upgrade

- Add an **Arcade** wing to the HQ floorplan, with glowing cabinets as playable props. The Marion Mystery cabinet opens the game's title screen in whichever view the player prefers. It has:
  - Create Room
  - Join by Code
  - Quick Play vs Marion bots
  - a "coming soon" slot structure, so future arcade games can register through a small `ArcadeGame` interface
- HQ bots wander over to play, queue up and spectate, shown as berry versions of themselves on the cabinet screens. The arcade leaderboard and recent match results are persisted in the HQ store.
- **HQ visual iteration:** do the same three-pass process on the existing HQ renderer. Targets:
  - richer lighting and depth (soft shadows, ambient occlusion-like edge darkening)
  - better bot animation (bob, squash, blink, glow pulse)
  - more detailed props
  - a polished day→night cycle that ties into the "After Hours" map
  - smoother camera feel

  Don't regress the HQ's perf budgets or its 111 existing tests.

## 8. Platforms and performance

- **Mac and Windows:** Chrome, Safari, Edge and Firefox. Keyboard and mouse with pointer lock, a gamepad (Gamepad API), and rebindable keys.
- **iPhone (Safari, plus installed as a PWA):**
  - a virtual joystick and a context action button (Use / Kill / Report / Shoot / Vent / Flashlight), plus touch-look in FP/TP
  - safe-area insets, no accidental zoom or scroll, handling for orientation changes
  - recovery from WebGL context loss
  - handling iOS audio unlock and backgrounding (reconnect on return)
- **Quality tiers** chosen automatically from a quick GPU/frame probe and overridable in settings:
  - Low: no post-processing, DPR ≤ 1.5, reduced shadows, simplified hair physics, flashlight cones as decals
  - Medium
  - High
- **Budgets:**
  - 60 fps target on desktop and recent iPhones (30 fps floor on Low), with 20 customized characters on screen
  - fewer than 150 draw calls on Low (instance the cosmetics, atlas the textures)
  - JS frame time under 6 ms
  - initial HQ bundle unchanged (±10%); the mystery code loads as its own lazy chunk
- Make it an installable **PWA** (manifest, icons drawn procedurally to PNG at build time, offline shell). Optional: a Tauri or Electron wrapper for a desktop app, only after everything else is done.

## 9. Accessibility, onboarding and safety

- Roles and players are never identified by color alone: berry type, name and pattern too.
- Colorblind palettes, a reduced-motion option that removes camera shake, flashes and the kill flicker, a text-size setting, captions for audio cues, a Lights Out "high-visibility" assist option, and remappable controls.
- **Onboarding:**
  - a short interactive tutorial and a **Freeplay** mode (walk any map alone, try every task, practice as the Murderer on dummies)
  - role tips on reveal
  - an in-game "How to Play" for each mode
- **Safety:** a chat profanity filter (toggle), mute per player, kick/ban for the host. Names are sanitized server-side.

## 10. Testing (thorough, automated, and honest)

1. **Core unit tests (Vitest):**
   - the rules reducer and **each game mode's rules and win conditions**: Classic lights sabotage, Lights Out battery/recharge/Blackout/light-based visibility, Hide & Seek timers
   - every role ability and its edge cases (sheriff misfire variants, medic shield vs knife vs gun, poisoner timing across a meeting, jester ejection, gun pickup)
   - tie votes and skips, timer expiry variants, sabotage timers, task progress modes
2. **Stats tests:** per-role filtering (a crewmate never gets murderer-only stats and vice versa), aggregation correctness, results-screen data, and lifetime stats persistence.
3. **Customization tests:** every cosmetic combination is valid and renders without error (a combinatorial sample in 2D and 3D), color conflicts get resolved, and settings and cosmetics survive reconnect and reload.
4. **Property and fuzz tests:** role assignment for every player count 4–20 against random valid and invalid configs (counts always respected, never more than allowed, deterministic per seed). Run random action streams through the reducer in every mode and assert invariants (dead players can't act, cooldowns are respected, exactly one winner set).
5. **Map validation tests** for all four maps, in both lighting variants.
6. **Server integration tests:** spin up the real server in-process and connect headless clients to run **full matches at 4, 10 and 20 players in every mode on every map** with bots. Cover reconnect mid-match, host leaving, kicking, and invalid or malicious messages (they're rejected and the server stays up). **Hidden-info tests** assert that crewmate clients never receive murderer roles or out-of-vision positions, and that Lights Out clients never receive positions outside their flashlight and line of sight.
7. **Network chaos:** run matches through injected latency (150 ± 50 ms) and 5% packet loss/reorder. Assert there's no desync and no rubber-banding beyond a threshold.
8. **Soak test:** 20-bot matches across all modes, running back to back at accelerated tick for at least 20 simulated hours. No crashes, leaks or stuck states.
9. **Playwright end-to-end tests:** several browser contexts as separate humans (desktop and the iPhone device profile; WebKit too if it's available):
   - create a room via the 2D menus and via the 3D menus, join by code
   - customize in the waiting room and check the change shows for the other players
   - pick each view and each mode, play to a results screen
   - check for zero console errors

   Also cover the HQ → Arcade → room → match → back to HQ flow, and that the `arcade.*` events reach the HQ feed.
10. **Animation tests:** every key animation (role reveal, each kill type, report, meeting, vote, eject per map, victory/defeat) plays to completion without errors in both renderers and in reduced-motion mode. Capture frame sequences for the art-pass review.
11. **Agent protocol tests:** the example external agent and the Marion AI bots can finish a match in every mode on their own, and the LLM layer falls back cleanly when no key is set.
12. **Performance capture:** record frame times per view mode, game mode and quality tier with 20 customized characters on screen. Headless Chromium uses SwiftShader, so label those numbers as software-rendered and don't claim real-device fps you didn't measure.
13. `npm run typecheck`, `npm test`, `npm run build` and the e2e suite must all pass, and the existing 111 HQ tests stay green.

## 11. Milestones (commit and push after each)

| # | Milestone |
| --- | --- |
| M0 | Research doc and decision table (§0b) |
| M1 | Core: types, settings schema and validation, the `GameModeDef` plug-in system, seeded RNG, map format and 1 map, role assignment, rules reducer, stats aggregation, and tests |
| M2 | Server: rooms, join codes, ticks, snapshots, hidden-info filtering, reconnect, and integration tests |
| M3 | 2D client: 2D menus (create/join/waiting room) and the full playable Classic loop to a results screen |
| M4 | All roles, sabotages, security tools, 24+ tasks, ghosts, emergency meetings, the full settings UI with presets, and the stats panels |
| M5 | Berry character system and full customization (2D and 3D), and the waiting room wardrobe |
| M6 | 3D client: 3D menus and waiting room, third person, then first person, with touch and gamepad controls |
| M7 | Lights Out mode (flashlights, batteries, Blackout, atmosphere) and Hide & Seek mode, plus any research-driven modes |
| M8 | All four large maps in both lighting variants, per-map ejects and soundscapes |
| M9 | Animation suite (role reveal, kills, report/meeting, votes, eject, victory/defeat, ambient life) |
| M10 | AI bots (heuristic + LLM), the Agent Protocol, the SDK and the example agent |
| M11 | Audio, accessibility, tutorial and Freeplay, PWA, and quality tiers |
| M12 | Art passes 1–3 for every area, with screenshots, frame sequences and critiques |
| M13 | Arcade wing in Marion HQ, `arcade.*` events, leaderboard, HQ art passes, and the merge into the arcade branch |
| M14 | Full test sweep, soak and chaos tests, perf capture, docs (README section, `HOW_TO_PLAY.md`, `HOSTING.md`, `AGENT_PROTOCOL.md`, `RESEARCH.md`), and the final report |

## 12. Definition of done and final report

The job is done when someone can:

- run `npm install && npm run dev` plus `npm run server`
- open Marion HQ, walk into the Arcade and open Marion Mystery in 2D or 3D menus
- create a room and have an iPhone on the same network join by code or QR
- customize their berry in the waiting room while others join
- fill the remaining seats with Marion bots
- choose **Classic, Lights Out or Hide & Seek** on any of the **four maps**, choose 2D / FP / TP, and tune every setting
- see role-appropriate stats throughout, enjoy the polished animations, and play full matches to a results screen

…with all of it looking deliberate and polished, in Marion style.

End with a report containing:

- a verification table (command → result)
- per-platform status (verified in emulation vs. on real hardware)
- art-pass before/after links
- the research decision table and what was built from it
- known limitations
- a **"Not verified"** list (for example: a real iPhone, a real GPU fps, internet-hosted latency)
- a short real-device QA checklist for me to run on Mac, Windows and iPhone
