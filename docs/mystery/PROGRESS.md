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

## Bot balance (all-bot simulations, 12 players)

| Mode | Crew/hider wins | Murderer/seeker wins |
| --- | --- | --- |
| Classic (12 games, 4 maps) | 5 | 7 |
| Lights Out (8 games) | 3 | 5 |
| Hide & Seek (12 games) | 4 | 8 |

Fixes that got there: critical-sabotage fixer coordination, ghosts dropping fix goals, evidence from "last seen with the victim" and meeting chat, Lights Out "dread" flicker, Hide & Seek final-countdown pings.

## Open items / ideas

- 3D ejection is the shared 2D canvas cinematic (both views); role reveal, death and victory have true 3D stages.
- Proximity *voice* chat, accounts/ranked play, a disguise role and a Guardian ghost role are deliberately out of scope (see RESEARCH.md).
