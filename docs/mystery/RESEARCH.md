# Marion Mystery — research & decisions

**Sources.** This session had no live web browsing, so this analysis is written from existing knowledge of the genre (Among Us / Among Us 3D, Phasmophobia, Murder Mystery 2, the "Town of Us"-style role mods, and general multiplayer-game practice) rather than fresh citations. Nothing below copies any game's characters, maps, art, UI layouts, sounds or names; we take mechanics and feel, then give everything the Marion twist.

## What makes the references work

| Reference | What we learned | Where it shows up |
| --- | --- | --- |
| **Among Us / Among Us 3D** (primary) | Readable toy-like silhouettes; bright, cozy-but-eerie interiors; a short loop of tasks → body/emergency → discuss → vote → eject; sabotage as pressure that pulls crew together; security tools (admin, cams, vitals, door logs) that create *partial* information; ghosts keep playing; quick chat for phones; cosmetics + lobby time are half the fun; 3D adds embodiment but must keep readability. | Classic mode, the full meeting flow, all five sabotage types, the four security consoles, ghost tasks/chat, quick chat, the waiting room with wardrobe, the berry cosmetics system, both 3D cameras. |
| **Phasmophobia** (secondary, Lights Out only) | Tension comes from *limited light* and *sound*, not gore: flashlight cones, battery pressure, distant creaks, a pulse when danger is near, rooms that are pitch black between pools of light. | Lights Out: flashlight cone + battery + recharge stations + pickups, sparse lamp pools, creak/heartbeat audio, the "dread" flicker + vignette when a killer lurks close, Blackout ability, cold rooms. Kept spooky-fun, never horror. |
| **Murder Mystery 2** | The Sheriff's single gun is a great tension device; when the Sheriff dies, the gun drops and anyone innocent can become the Hero. | Sheriff role with three misfire rules, gun drop + Hero pickup, knife throw for the Murderer. |
| **Role mods (Town of Us-style)** | Extra roles keep long-time players engaged *if* they create information or decisions, and each needs a clear reveal card and rule text. | Detective (body clues + footprints), Medic (per-round shield + portable vitals), Engineer (vents + remote fix), Lookout (comms-proof cams + portable cam), Tracker (tag + arrow), Mayor (double/triple vote), Poisoner (delayed kill), Accomplice, Jester, Survivor. |
| **Hide & Seek (genre staple)** | Everyone knows who the seeker is; tension comes from the clock, a danger meter and a final countdown. | Hide & Seek mode: frozen seeker during hide time, tasks shorten the clock, final countdown speed boost and position pings, danger meter. |

## Map craft

Good social-deduction maps have: loops (no long dead-end chases), chokepoints, varied sightlines, tasks spread so players must cross the map, meeting walk-times that matter, vents that connect regions but not everything, and security spots that see corridors but never the whole map. `validateMap()` enforces the measurable parts: 14–20 rooms, ≥ 45 s crossing time, ≥ 3 loops, ≥ 2 vent networks, ≥ 3 cameras, every facility present, every station reachable.

## Pacing for 4 vs 20 players

Murderer-team cap is `ceil(n/2) − 1`; critical-sabotage timers scale with map size (`criticalFloor`); discussion/voting times and task counts are host-tunable with presets (Quick Match for short games). Bot balance was tuned with all-bot simulations (see PROGRESS.md): Classic ≈ 42 % crew wins, Lights Out ≈ 38 %, Hide & Seek ≈ 33 % hider wins with bots (humans hide better than bots).

## Onboarding

Role reveal cards with a one-line goal + ability chips, How to Play (modes, roles, controls), mode cards in the lobby board, contextual Use button labels ("Fix lights", "Hold to fix", "Grab battery"), and Solo Quick Play against Marion agents so new players can learn without an audience.

## Decision table

| Idea | Decision | Notes |
| --- | --- | --- |
| Emergency button + meetings, body reports | **Implement** | Physical button prop in each map's meeting room; reports cancel sabotage. |
| Common / short / long tasks, visual tasks | **Implement** | 26 task definitions, 29 mini-games; visual tasks (scan, chute, shields, generator, lanterns, juice press) prove innocence. |
| Task bar live / at meetings / hidden | **Implement** | Setting `taskBar`. |
| Sabotage: lights, comms, doors, two criticals | **Implement** | Critical names are themed per map; two-person fixes. |
| Vents with networks | **Implement** | 4 networks per map; Engineer and (limited) hiders can vent. |
| Admin map, cameras, vitals, door logs | **Implement** | Server only sends data while you stand at the console. |
| Ghosts (tasks, ghost chat, see roles) | **Implement** | All toggleable. |
| Hide & Seek | **Implement** | Third mode. |
| Lights-out "dark" mode with flashlights | **Implement / Adapt** | Lights Out mode, Marion-style (glowing panels, berries, no gore). |
| Kill/flicker warning ("dread") | **Adapt** | Flashlight flicker + vignette + heartbeat when a killer is within 5 m — Phasmophobia-style tension, and it balanced the mode (8/8 murderer wins → 5/8). |
| Seeker position pings in the final countdown | **Adapt** | Every 12 s for 1 s; balanced Hide & Seek. |
| Quick chat | **Implement** | 18 phrases, target-aware; essential for phones/controllers. |
| Lobby customization, cosmetics, pets, nameplates | **Implement** | 12 berries, 23 hair, 35 hats, 19 face items, 21 outfits, 13 back items, 12 pets, 12 nameplates, 12 emotes, 6 victory poses. |
| Eject cinematic, results with timeline & awards | **Implement** | Per-map eject styles; timeline, heatmap, MVP + 7 awards. |
| Sheriff gun + Hero | **Implement** | From Murder Mystery 2. |
| Throwable knife | **Implement** | Toggleable. |
| Proximity voice chat | **Skip** | Needs a media server and moderation; text proximity chat is offered instead. |
| Ranked matchmaking / accounts | **Skip** | Out of scope for a self-hosted arcade; lifetime stats are per device. |
| Disguise/shapeshift role | **Skip (for now)** | Rendering + hidden-info complexity across 2D/3D; listed as a future role. |
| Guardian-angel ghost role | **Skip (for now)** | Medic covers protection; future candidate. |
| Map editor | **Skip** | Maps are data (MapBuilder + validateMap) so new maps are easy to add in code. |
| Extra modes (Sheriff Showdown, Detective Night) | **Adapt as presets** | Detective Night exists as a preset; Sheriff Showdown left as a future `GameModeDef`. |
