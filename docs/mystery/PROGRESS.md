# Marion Mystery — progress log

Branch mapping: the build prompt names `feature/marion-mystery` and `feature/marion-arcade`. This environment assigns one push branch, **`claude/optimistic-carson-j24o57`**, so both logical branches live there as merge commits: the parallel worktree branches `worktree-agent-*` (maps, task mini-games, berry characters, HQ arcade) were merged into it.

| Milestone | Status | Where |
| --- | --- | --- |
| M0 Research + decision table | ✅ | `docs/mystery/RESEARCH.md` |
| M1 Core (types, settings + presets + share codes + migrations, `GameModeDef`, seeded RNG, map format, roles, reducer, stats) | ✅ | `src/mystery/core/` |
| M2 Server (rooms, codes, 30 Hz tick, 20 Hz per-player snapshots, hidden-info filtering, reconnect, host migration, rate limits, LAN, Docker) | ✅ | `src/mystery/server/room.ts`, `server/index.ts` |
| M3 2D client + menus + full loop | ✅ | `src/mystery/render2d/`, `src/mystery/ui/` |
| M4 Roles, sabotage, security, 26 tasks / 29 mini-games, ghosts, meetings, settings UI, stats | ✅ | core + `ui/Hud.tsx`, `ui/tasks/` |
| M5 Berry characters + customisation (2D + 3D) + wardrobe | ✅ | `src/mystery/characters/`, `ui/CustomizeEditor.tsx` |
| M6 3D client (third + first person, touch look, gamepad), 3D menus/lobby | ✅ | `src/mystery/render3d/` |
| M7 Lights Out + Hide & Seek | ✅ | `core/modes.ts`, `core/vision.ts` |
| M8 Four large maps, two lighting variants, ejects | ✅ | `core/maps/` |
| M9 Animation suite | ✅ (see notes) | `ui/Overlays.tsx`, `ui/Stage3D.tsx`, renderers |
| M10 AI bots (heuristic + optional LLM), Agent Protocol, SDK, example agent | ✅ | `src/mystery/ai/`, `server/llm.ts`, `server/agent-sdk/` |
| M11 Audio, accessibility, PWA, quality tiers | ✅ | `audio/sfx.ts`, settings, `public/` |
| M12 Art passes | ✅ | `docs/art-passes/` |
| M13 Arcade wing in HQ + `arcade.*` events + HQ art passes | see final report | HQ files |
| M14 Tests, soak, chaos, perf, docs | ✅ | `tests/`, `scripts/soak.ts`, docs |

## Bot balance (all-bot simulations)

`npx tsx scripts/balance.ts --n 20` runs seeded all-bot matches per mode × map × lobby size (8/10/12, each mode's default preset) and prints win rates, match length, how matches ended, ejection accuracy and stuck bots. 240 matches per mode:

| Mode | 8 players | 10 players | 12 players | All | Before this pass |
| --- | --- | --- | --- | --- | --- |
| Classic (crew wins) | 25 % | 51 % | 71 % | **49 %** | 22 % |
| Lights Out (crew wins) | 15 % | 48 % | 64 % | **42 %** | 5 % |
| Hide & Seek (hider wins) | 14 % | 43 % | 71 % | **42 %** | 29 % |

What was wrong and what fixed it (`ai/bot.ts` unless noted):

- Bots never heard meeting chat (`server/room.ts` projected bot snapshots from the newest chat id), so accusations never spread. They now hear it; each speaker counts once per target per meeting, hearsay is kept apart from first-hand evidence, and bots only accuse on what they saw themselves.
- "Was near the body" was added every tick (12 points a second), so finders and reporters were ejected. It now counts once per body; reporters get a little trust; "last seen with the victim" ignores the crowd at the table after a meeting and splits blame; a trail of recent sightings gives "was around where the body was".
- Crew voted on any score ≥ 3: now they need a clear leader, vote on thinner evidence only when skipping would hand murderers parity, and always vote out a killer they saw.
- Sabotage drained the crew: every crewmate ran to lights/comms, fixers stuck on a fixed sabotage's stations, and two-person fixes shuffled holders across the map. Now nearby crew plus volunteers answer lights/comms (others keep working, remembering their tasks through comms), critical fixers take the nearer station and only newcomers move on, and the critical floor also covers the walk between a pair's stations (`core/match.ts`, `criticalFloor(map, kind)`).
- Lights Out: crew sweep their beams, treat a lightless figure as suspicious (especially one where the dread meter points), flee towards company or away from that figure, check out kill flickers, and discount position evidence (only beams are visible in the dark).
- Murderers: a teammate is not a witness, they roam to find prey when the knife is ready, accept far-off bystanders in big lobbies, stop looping on faked tasks, and cover for a teammate in meetings.
- Hide & Seek: hiders flee to spots they reach before the seeker (by walking distance), keep to that route, use their vent uses, and react to the danger meter; the seeker checks the last place it saw a hider.

The spread by lobby size comes from the fixed default role counts (2 murderers, 1 seeker); hosts can add a murderer for 12+ or a seeker for big Hide & Seek lobbies.

## Soak test (20 simulated hours)

`npx tsx scripts/soak.ts 20`: **126** back-to-back **20-player** bot matches across every mode × map × bot difficulty (15-minute clocks), 20.04 sim-hours in 899 s real time. No exceptions, no stuck matches, heap flat (41 MB early → 38 MB late). Outcome spread showed 20-player Classic with the default 2 murderers is crew-heavy (34/42 crew wins), so the lobby now warns big lobbies to use 3 murderers.

## Open items / ideas

- 3D players get true 3D stages for the role reveal, death, ejection (per-map flight) and victory; 2D players get the 2D versions.
- Proximity *voice* chat, accounts/ranked play, a disguise role and a Guardian ghost role are deliberately out of scope (see RESEARCH.md).
