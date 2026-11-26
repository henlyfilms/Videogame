/**
 * Marion Mystery — shared core types. This module (and everything under
 * core/) is DOM-free so it runs identically in the browser, in Node (the
 * authoritative server) and in tests.
 *
 * Units: 1 tile = 1 metre. Positions are in tile space (floats).
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type ModeId = 'classic' | 'lightsout' | 'hideseek';
export type ViewMode = '3d-fp' | '3d-tp' | '2d';
/** Host policy: force one view for everyone, or let each player pick. */
export type ViewPolicy = 'choice' | ViewMode;
export type MapId = 'hq' | 'greenhouse' | 'express' | 'manor';
export type Team = 'crew' | 'murderers' | 'neutral';
export type PlayerKind = 'human' | 'bot' | 'agent';
export type Platform = 'mac' | 'windows' | 'iphone' | 'android' | 'linux' | 'agent' | 'bot' | 'other';

export type RoleId =
  | 'crewmate'
  | 'sheriff'
  | 'detective'
  | 'medic'
  | 'engineer'
  | 'lookout'
  | 'tracker'
  | 'mayor'
  | 'murderer'
  | 'accomplice'
  | 'poisoner'
  | 'jester'
  | 'survivor'
  | 'seeker'
  | 'hider';

export type Phase = 'lobby' | 'intro' | 'play' | 'meeting' | 'eject' | 'ended';

export type SabotageId = 'lights' | 'comms' | 'doors' | 'meltdown' | 'pressure';
export type CriticalId = 'meltdown' | 'pressure';

export type BerryType =
  | 'strawberry'
  | 'blueberry'
  | 'raspberry'
  | 'blackberry'
  | 'marionberry'
  | 'cranberry'
  | 'gooseberry'
  | 'cherry'
  | 'grape'
  | 'elderberry'
  | 'boysenberry'
  | 'goldberry';

/** Everything a player can customise. Item ids refer to the cosmetics catalog. */
export interface Cosmetics {
  berry: BerryType;
  color: number; // palette index (resolved for duplicates in lobby)
  pattern: string;
  eyes: string;
  brows: string;
  mouth: string;
  hair: string;
  hairColor: string; // hex
  hat: string;
  face: string; // glasses / visor / mask / mustache
  outfit: string;
  back: string;
  pet: string;
  nameplate: string;
  emotes: string[];
  victory: string;
}

export type StationKind =
  // tasks (mini-game ids)
  | 'stampMail'
  | 'sortClips'
  | 'distillReel'
  | 'slotCartridge'
  | 'rerouteTube'
  | 'calibrateTurntable'
  | 'sortBerries'
  | 'juicePress'
  | 'alignDish'
  | 'fuelCan'
  | 'fuelEngine'
  | 'fixWiring'
  | 'swipeBadge'
  | 'waterPlants'
  | 'cleanFilter'
  | 'download'
  | 'upload'
  | 'unlockManifold'
  | 'simonSays'
  | 'keypadCode'
  | 'emptyChute'
  | 'medScan'
  | 'primeShields'
  | 'chartCourse'
  | 'replaceFuse'
  | 'rechargeGenerator'
  | 'lightLantern'
  // facilities
  | 'emergency'
  | 'admin'
  | 'cams'
  | 'vitals'
  | 'doorlog'
  | 'lightsPanel'
  | 'commsPanel'
  | 'meltdownA'
  | 'meltdownB'
  | 'pressureA'
  | 'pressureB'
  | 'recharge'
  | 'wardrobe'
  | 'laptop';

export type FacilityKind =
  | 'emergency'
  | 'admin'
  | 'cams'
  | 'vitals'
  | 'doorlog'
  | 'lightsPanel'
  | 'commsPanel'
  | 'meltdownA'
  | 'meltdownB'
  | 'pressureA'
  | 'pressureB'
  | 'recharge'
  | 'wardrobe'
  | 'laptop';

export type TaskLength = 'common' | 'short' | 'long';

export interface TaskStep {
  station: StationKind;
}

/** A task assigned to a player (multi-step for long tasks). */
export interface AssignedTask {
  taskId: string;
  /** Station ids, one per step, chosen for this map. */
  stations: string[];
  step: number; // number of completed steps
  done: boolean;
}

export type DeathCause = 'knife' | 'thrown' | 'poison' | 'gun' | 'misfire' | 'ejected' | 'critical' | 'seeker' | 'disconnect';

export interface Body {
  id: string;
  playerId: string;
  pos: Vec2;
  diedAt: number; // match time (s)
  cause: DeathCause;
  /** Hidden from clients; used by the detective clue. */
  killerId: string | null;
  room: string | null;
}

export interface Projectile {
  id: string;
  ownerId: string;
  pos: Vec2;
  dir: Vec2;
  travelled: number;
}

export interface ChatMsg {
  id: number;
  from: string; // player id or 'system'
  text: string;
  t: number;
  ghost: boolean;
  quick?: string;
  /** Proximity chat: only those in range at send time. */
  to?: string[];
}

export interface MeetingState {
  callerId: string;
  bodyId: string | null;
  /** Player whose body was reported (for the splash). */
  victimId: string | null;
  stage: 'discuss' | 'vote' | 'reveal';
  stageEnds: number;
  votes: Record<string, string>; // voter -> target id | 'skip'
  startedAt: number;
}

export interface EjectResult {
  ejectedId: string | null;
  tie: boolean;
  skipped: boolean;
  /** Only filled when confirmEjects is on. */
  role: RoleId | null;
  team: Team | null;
  tally: Record<string, number>;
  /** voter -> target, or null if anonymous. */
  votes: Record<string, string> | null;
}

export interface PlayerStats {
  kills: number;
  tasksDone: number;
  meetingsCalled: number;
  bodiesReported: number;
  votesCast: number;
  correctVotes: number;
  sabotages: number;
  fixes: number;
  distance: number;
  shots: number;
  shotsHit: number;
  ventUses: number;
  survivedTo: number;
}

export interface PlayerState {
  id: string;
  name: string;
  kind: PlayerKind;
  platform: Platform;
  cosmetics: Cosmetics;
  pos: Vec2;
  facing: number; // radians, 0 = +x
  moving: boolean;
  input: Vec2; // last movement intent (normalised)
  inputSeq: number;
  alive: boolean;
  connected: boolean;
  role: RoleId;
  team: Team;
  tasks: AssignedTask[];
  /** Station id of the task currently open + when it was opened (anti-cheat). */
  activeTask: { stationId: string; openedAt: number } | null;
  killCd: number;
  gunCd: number;
  abilityCd: number;
  hasGun: boolean;
  isHero: boolean;
  shots: number;
  inVent: string | null;
  ventCd: number;
  emergencyLeft: number;
  flashlightOn: boolean;
  battery: number; // 0..1
  blackoutUntil: number;
  /** Medic: id of shielded player this round. */
  shieldTarget: string | null;
  shieldedBy: string | null;
  poisonedAt: number | null;
  poisonedBy: string | null;
  trackTarget: string | null;
  trackUntil: number;
  mayorRevealed: boolean;
  remoteFixUsed: boolean;
  portableCam: Vec2 | null;
  inspected: string[]; // body ids inspected (detective)
  clues: Clue[];
  vitalsUntil: number;
  /** Which security console the player is reading (requires standing at it). */
  using: FacilityKind | null;
  fixing: string | null; // station id being held for a sabotage fix
  fixingAt: number;
  emote: { id: string; at: number } | null;
  lastRoom: string | null;
  diedAt: number | null;
  ejected: boolean;
  /** Server-side movement allowance (m) — anti speed-hack. */
  moveBudget: number;
  /** Set when the server rejected/adjusted a client move (seq to resync). */
  corrected: number;
  /** Medic vitals / once-per-round abilities. */
  roundAbilityUsed: boolean;
  /** Hide & Seek hider vent uses left. */
  ventUses: number;
  stats: PlayerStats;
}

export interface Clue {
  bodyId: string;
  victimId: string;
  secondsSinceDeath: number;
  killerHint: string; // berry type or colour family
  hintKind: 'berry' | 'color';
}

export interface SabotageState {
  active: SabotageId | null;
  startedAt: number;
  /** Critical countdown remaining (s). */
  timer: number;
  /** Fix progress for lights/comms (0..1). */
  progress: number;
  cooldown: number;
  closedDoors: Record<string, number>; // doorId -> reopen time
  doorCd: number;
}

export interface DoorLogEntry {
  t: number;
  playerId: string;
  sensor: string;
}

export interface MatchEvent {
  t: number;
  type:
    | 'kill'
    | 'report'
    | 'emergency'
    | 'eject'
    | 'sabotage'
    | 'fixed'
    | 'task'
    | 'shot'
    | 'misfire'
    | 'gun.drop'
    | 'gun.pickup'
    | 'shield.hit'
    | 'poison'
    | 'blackout'
    | 'vent'
    | 'timer'
    | 'end'
    | 'chat'
    | 'join'
    | 'leave'
    | 'final'
    | 'flicker'
    | 'meeting'
    | 'track'
    | 'inspect'
    | 'visual';
  actor?: string;
  target?: string;
  data?: Record<string, string | number | boolean | null>;
  pos?: Vec2;
}

export type WinReason =
  | 'tasks'
  | 'murderers-eliminated'
  | 'parity'
  | 'critical'
  | 'timer'
  | 'jester'
  | 'hiders-survived'
  | 'all-found'
  | 'abandoned';

export interface MatchResult {
  winningTeam: Team | 'draw';
  reason: WinReason;
  winners: string[];
  mvp: string | null;
  awards: { id: string; title: string; playerId: string }[];
  endedAt: number;
}

export interface BatteryPickup {
  id: string;
  pos: Vec2;
}

export interface MatchState {
  seed: number;
  rngState: number;
  mapId: MapId;
  modeId: ModeId;
  phase: Phase;
  /** Seconds since match start. */
  t: number;
  phaseEnds: number;
  players: Record<string, PlayerState>;
  order: string[];
  bodies: Body[];
  projectiles: Projectile[];
  gunDrop: Vec2 | null;
  meeting: MeetingState | null;
  lastEject: EjectResult | null;
  sabotage: SabotageState;
  chat: ChatMsg[];
  chatSeq: number;
  events: MatchEvent[];
  /** Events produced during the current tick (drained by the host). */
  pending: MatchEvent[];
  doorLog: DoorLogEntry[];
  result: MatchResult | null;
  timeLimit: number; // seconds, 0 = none
  emergencyReadyAt: number;
  batteries: BatteryPickup[];
  /** Hide & Seek */
  hns: { hideUntil: number; finalAt: number; timer: number } | null;
  idSeq: number;
  /** Per-player movement samples for the results heatmap (coarse). */
  heat: Record<string, number[]>;
  meetingsHeld: number;
  lastMeetingAt: number;
  /** Task bar value frozen at the last meeting (taskBar = 'meetings'). */
  taskBarAtMeeting: number;
  /** Lanterns lit (Lights Out) — light up the area around them. */
  litLanterns: string[];
  /** Critical fix: time both stations have been held together. */
  fixHold: number;
  jesterWin: string | null;
}
