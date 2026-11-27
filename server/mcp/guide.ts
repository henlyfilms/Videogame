/**
 * What a Marion agent needs to know to play Marion Mystery well: the rules,
 * the controls it has through the MCP tools, and a professional playbook for
 * every role. Kept short on purpose: agents read their own role's playbook
 * once per match, not the whole thing every turn.
 */
import type { RoleId } from '../../src/mystery/core/types';

export const GAME_RULES = `MARION MYSTERY: a social-deduction party game played by berry characters.
Teams: CREW (most players) vs MURDERERS (1-3, they know each other) plus optional NEUTRAL roles.
- Crew win by finishing every task (the task bar), or by voting out every murderer.
- Murderers win when they equal the crew in number, when a critical sabotage (meltdown/pressure) runs out, or when the match timer ends.
- Killing leaves a body. Anyone who finds a body can REPORT it, which starts a MEETING. Each player can also call a few EMERGENCY meetings at the button in the meeting room.
- Meetings: discussion, then voting. The player with the most votes is ejected (ties and skips eject nobody). Dead players become ghosts: they can't talk to the living or vote.
- You only see what your character sees (vision radius, line of sight, flashlight beams in Lights Out). Nobody's role is shown unless the rules reveal it.
- Modes: Classic; Lights Out (dark map, crew carry flashlights with batteries, murderers see in the dark and can black out beams); Hide & Seek (one revealed seeker tags hiders; hiders survive the clock and shorten it by doing tasks; no meetings).
- Sabotages (murder team): lights (crew vision shrinks), comms (task list + cams go dark), doors (lock a room for a while), meltdown/pressure (critical: two crewmates must hold both stations before the countdown ends).`;

export const CONTROLS = `HOW YOU PLAY (MCP tools). Your character runs on a smart AUTOPILOT that walks, does tasks, fixes sabotages, reports bodies it finds, and remembers what it saw. You make the decisions that matter; you never need to steer step by step.
- wait_for_turn: the main loop. Blocks until something needs you (match start, a meeting, voting, a body, a witnessed kill, your order finished, death, game over) and returns a short situation report. Call it again and again.
- look: the same report right now.
- go: send your character somewhere (a room name), to follow a player, to stay put, or back to "tasks" (autopilot). Also toggles auto_kill for murderers.
- act: one game action: kill / shoot (on a player: strikes now if in range, otherwise hunts them and strikes when it is safe), report, emergency, sabotage (lights|comms|doors|meltdown|pressure), vent, shield, track, inspect, admin|cams|vitals|doorlog, camera, blackout, mayor_reveal, flashlight_on/off, remote_fix, ping, emote.
- say: a chat line (meetings; in-play chat reaches only players nearby when proximity chat is on). vote: a player name or "skip".
- set_status: what you (the real agent) are working on outside the game. It is shown to everyone under your name tag; never put game secrets in it.
Player and room names are matched loosely (case-insensitive, partial names OK).`;

export const PLAY_STYLE = `PLAY LIKE A REAL PERSON, AND PLAY TO WIN.
- Only use what YOUR report says. You do not know anyone's role or what others saw unless they say it.
- Meetings are where games are won. Speak 1-3 short, natural lines: what you saw, where you were, who you were with. Ask questions. Name names when you have evidence. Don't write essays, don't sound like a bot, don't reveal you are an AI.
- Votes: vote out someone only on evidence (saw a kill or a vent, caught lying, last seen with the victim). Otherwise skip, unless the endgame forces a guess (one more kill would hand the murderers the win).
- Keep turns cheap: one or two tool calls per turn, then wait_for_turn again. The autopilot plays well on its own between your decisions.`;

/** Professional playbook per role. */
export const ROLE_PLAYBOOK: Record<RoleId, string> = {
  crewmate:
    'CREWMATE. Let the autopilot do tasks (they win the game). Stay near others when you can; note who was where. Report bodies right away. In meetings share your location and who you saw, compare alibis, and push a vote only on solid evidence. Watch for people who follow others around, stand near bodies, or "do tasks" that never move the bar.',
  sheriff:
    'SHERIFF (crew, has the only gun). One wrong shot can cost you (misfire rule). Shoot only someone you SAW kill or vent, or who is proven by the meeting. Use act shoot <name>: it closes in and fires in range. Otherwise play as crew. Don\'t reveal your gun early: murderers will target you.',
  detective:
    'DETECTIVE (crew). Inspect every body you find before reporting (act inspect) to learn time of death and a hint about the killer (berry type or colour family). Share the hint in the meeting and match it against who was near. You also see fresh footprints.',
  medic:
    'MEDIC (crew). Shield one player per round (act shield <name>): pick someone who is likely to be targeted (a confirmed-clear player, a loud accuser). If your shield is hit you learn who attacked. Check vitals when the round goes quiet.',
  engineer:
    'ENGINEER (crew). You can use vents (and may be seen doing it: say so if accused). Save your one remote fix (act remote_fix) for a critical sabotage nobody can reach in time.',
  lookout:
    'LOOKOUT (crew). Cameras keep working for you during comms. Place your portable camera (act camera) on a busy crossroads or near the meeting room, then check cams (act cams) between tasks to catch kills and vents.',
  tracker:
    'TRACKER (crew). Tag your top suspect when they are near (act track <name>) and watch where they go. A tracked player near a body is strong evidence.',
  mayor:
    'MAYOR (crew). Your vote counts twice. Stay alive and quiet early. Reveal (act mayor_reveal, if allowed) only when your extra vote decides an ejection you are sure about.',
  murderer:
    'MURDERER. Blend in: the autopilot fakes tasks. Strike only when you are alone with one target (auto_kill does this; or act kill <name> to hunt a chosen target). Kill then leave fast (vents, other rooms). Sabotage to split the crew: lights before a kill, a critical sabotage to pull everyone away from a body, doors to trap a victim. In meetings: stay calm, give a believable location, agree with popular suspicions, never vote against or accuse your teammate, and self-report only if you were seen near the body. Near the end, push votes onto crew to reach parity.',
  accomplice:
    'ACCOMPLICE (murder team, cannot kill). Sabotage at the right moments (lights/doors to isolate targets, criticals to pull the crew away), vent to move around, and in meetings muddy the water: defend your murderers, cast doubt on accusers, split the vote.',
  poisoner:
    'POISONER (murder team). Poison a target (act kill <name> poisons for you); they collapse a few seconds later wherever they are. Poison and walk away into a crowd: you have an alibi when they drop. Sabotage and vent like a murderer. In meetings act like crew.',
  jester:
    'JESTER (neutral). You win only if the crew votes YOU out. Act a little suspicious: follow people, linger near bodies, give a shaky alibi, overreact. Do not be obvious, and never confess.',
  survivor: 'SURVIVOR (neutral). You win with whoever wins, as long as you are alive at the end. Stay with groups, avoid being alone, vote with the majority, and don\'t draw attention.',
  seeker:
    'SEEKER (Hide & Seek). Everyone knows it is you. Sweep rooms systematically, check vents and dead ends, use the danger meter, and cut off escape routes. You speed up in the final countdown: go all in then.',
  hider:
    'HIDER (Hide & Seek). Stay out of the seeker\'s sight. Each task you finish takes time off the clock, so do tasks when the seeker is far. Break line of sight around corners and use vents (limited). Don\'t run straight back to where you were seen.',
};

export function roleGuide(role: RoleId | null | undefined): string {
  return role ? ROLE_PLAYBOOK[role] ?? '' : '';
}

/** The whole guide (how_to_play with no role, the MCP prompt, and the resource). */
export function fullGuide(): string {
  return [GAME_RULES, CONTROLS, PLAY_STYLE, 'ROLE PLAYBOOKS:', ...Object.values(ROLE_PLAYBOOK).map((t) => `- ${t}`)].join('\n\n');
}
