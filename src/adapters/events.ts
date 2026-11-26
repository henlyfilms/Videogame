/**
 * The MarionEvent contract. Every adapter (live sim, replay, websocket) and every
 * player interaction speaks this one strongly typed language.
 */
import type { RoomId } from '../data/bots';

export type BotState = 'idle' | 'walking' | 'working' | 'huddling' | 'delegating' | 'needs_input' | 'asleep';
export const BOT_STATES: readonly BotState[] = [
  'idle',
  'walking',
  'working',
  'huddling',
  'delegating',
  'needs_input',
  'asleep',
] as const;

export type MailSlot = 'action' | 'fyi' | 'noise';
export type ClipBin = 'keeper' | 'outtake';
export type RelayModel = 'claude-opus-auto' | 'codex' | 'gemini';
export type SkillId = 'token-optimizer' | 'claude-auto-mode' | 'prompt-craft' | 'zero-fluff-comms';
export type DictationSource = 'bridge' | 'life' | 'engine';
export type PlannerLane = 'work' | 'ai';

export interface EventPayloads {
  // ---- core contract ----
  'bot.status': { botId: string; status: BotState };
  'bot.message': { botId: string; text: string; to?: string };
  'bot.delegate': { from: string; to: string; task: string; taskId?: string };
  'bot.tool_call': { botId: string; tool: string; model?: RelayModel };
  'group.huddle_start': { huddleId: string; botIds: string[]; topic: string };
  'group.huddle_end': { huddleId: string };
  'task.created': { taskId: string; botId: string; title: string };
  'task.completed': { taskId: string; botId: string; title: string; deliverTo?: 'daniel' | 'life' };
  'mail.pending_approval': { mailId: string; draftId: string; subject: string; words: number };
  'reel.distilled': { reelId: string; insight: string; buff: 'speed' | 'accuracy' };
  'clip.sorted': { clipId: string; bin: ClipBin; by: string };
  'skill.slotted': { skillId: SkillId; slotted: boolean };
  'dictation.wave': { active: boolean; source: DictationSource; transcript?: string };
  // ---- room-level extensions ----
  'mail.received': { mailId: string; from: string; subject: string; hint: MailSlot };
  'mail.sorted': { mailId: string; slot: MailSlot };
  'mail.sent': { draftId: string };
  'mail.cleared': Record<string, never>;
  'reel.received': { reelId: string; title: string; platform: 'reel' | 'youtube' };
  'clip.received': { clipId: string; name: string; quality: 'good' | 'bad' };
  'planner.toggled': { cardId: string; done: boolean };
  'planner.added': { cardId: string; lane: PlannerLane; title: string };
  'vault.archived': { itemId: string; label: string; kind: 'capsule' | 'chat' | 'task' };
  'vault.restored': { itemId: string };
  'relay.queued': { commandId: string; kind: 'wave' | 'polaroid'; text: string };
  'relay.dispatched': { commandId: string; model: RelayModel; botId: string };
  'release.shipped': { version: string };
  'bot.spawned': { botId: string; name: string; job: string; shape: string; color: string; glowColor: string };
  'settings.llm': { mode: 'local' | 'cloud' };
}

export type MarionEventType = keyof EventPayloads;

export type MarionEvent = {
  [K in MarionEventType]: { id: string; ts: number; type: K; payload: EventPayloads[K] };
}[MarionEventType];

export type EventOf<K extends MarionEventType> = Extract<MarionEvent, { type: K }>;

/** The 13 event types that form the public, documented core contract. */
export const CORE_EVENT_TYPES: readonly MarionEventType[] = [
  'bot.status',
  'bot.message',
  'bot.delegate',
  'bot.tool_call',
  'group.huddle_start',
  'group.huddle_end',
  'task.created',
  'task.completed',
  'mail.pending_approval',
  'reel.distilled',
  'clip.sorted',
  'skill.slotted',
  'dictation.wave',
];

let seq = 0;
export function nextId(prefix = 'e'): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

export function makeEvent<K extends MarionEventType>(type: K, payload: EventPayloads[K], ts = Date.now()): EventOf<K> {
  return { id: nextId('ev'), ts, type, payload } as EventOf<K>;
}

// ---------------------------------------------------------------------------
// Runtime schema validation (for untrusted sources such as the WebSocket).
// ---------------------------------------------------------------------------

type FieldKind = 'string' | 'number' | 'boolean' | 'string[]';
type FieldSpec = { kind: FieldKind; optional?: boolean; oneOf?: readonly string[] };
type Schema = { [K in MarionEventType]: Record<string, FieldSpec> };

const s = (oneOf?: readonly string[]): FieldSpec => ({ kind: 'string', oneOf });
const so = (oneOf?: readonly string[]): FieldSpec => ({ kind: 'string', optional: true, oneOf });
const n: FieldSpec = { kind: 'number' };
const b: FieldSpec = { kind: 'boolean' };

const MODELS = ['claude-opus-auto', 'codex', 'gemini'] as const;
const SLOTS = ['action', 'fyi', 'noise'] as const;

export const EVENT_SCHEMA: Schema = {
  'bot.status': { botId: s(), status: s(BOT_STATES) },
  'bot.message': { botId: s(), text: s(), to: so() },
  'bot.delegate': { from: s(), to: s(), task: s(), taskId: so() },
  'bot.tool_call': { botId: s(), tool: s(), model: so(MODELS) },
  'group.huddle_start': { huddleId: s(), botIds: { kind: 'string[]' }, topic: s() },
  'group.huddle_end': { huddleId: s() },
  'task.created': { taskId: s(), botId: s(), title: s() },
  'task.completed': { taskId: s(), botId: s(), title: s(), deliverTo: so(['daniel', 'life']) },
  'mail.pending_approval': { mailId: s(), draftId: s(), subject: s(), words: n },
  'reel.distilled': { reelId: s(), insight: s(), buff: s(['speed', 'accuracy']) },
  'clip.sorted': { clipId: s(), bin: s(['keeper', 'outtake']), by: s() },
  'skill.slotted': {
    skillId: s(['token-optimizer', 'claude-auto-mode', 'prompt-craft', 'zero-fluff-comms']),
    slotted: b,
  },
  'dictation.wave': { active: b, source: s(['bridge', 'life', 'engine']), transcript: so() },
  'mail.received': { mailId: s(), from: s(), subject: s(), hint: s(SLOTS) },
  'mail.sorted': { mailId: s(), slot: s(SLOTS) },
  'mail.sent': { draftId: s() },
  'mail.cleared': {},
  'reel.received': { reelId: s(), title: s(), platform: s(['reel', 'youtube']) },
  'clip.received': { clipId: s(), name: s(), quality: s(['good', 'bad']) },
  'planner.toggled': { cardId: s(), done: b },
  'planner.added': { cardId: s(), lane: s(['work', 'ai']), title: s() },
  'vault.archived': { itemId: s(), label: s(), kind: s(['capsule', 'chat', 'task']) },
  'vault.restored': { itemId: s() },
  'relay.queued': { commandId: s(), kind: s(['wave', 'polaroid']), text: s() },
  'relay.dispatched': { commandId: s(), model: s(MODELS), botId: s() },
  'release.shipped': { version: s() },
  'bot.spawned': { botId: s(), name: s(), job: s(), shape: s(), color: s(), glowColor: s() },
  'settings.llm': { mode: s(['local', 'cloud']) },
};

export function isEventType(t: unknown): t is MarionEventType {
  return typeof t === 'string' && Object.prototype.hasOwnProperty.call(EVENT_SCHEMA, t);
}

function checkField(value: unknown, spec: FieldSpec): boolean {
  if (value === undefined) return !!spec.optional;
  switch (spec.kind) {
    case 'string':
      if (typeof value !== 'string' || value.length > 2000) return false;
      return !spec.oneOf || spec.oneOf.includes(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string[]':
      return Array.isArray(value) && value.length <= 64 && value.every((v) => typeof v === 'string');
  }
}

/**
 * Validate an untrusted value against the MarionEvent schema. Missing `id`/`ts`
 * are filled in; unknown payload keys are dropped. Returns null when invalid.
 */
export function parseMarionEvent(raw: unknown): MarionEvent | null {
  if (typeof raw === 'string') {
    try {
      return parseMarionEvent(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!isEventType(obj.type)) return null;
  const payloadIn = (obj.payload ?? {}) as Record<string, unknown>;
  if (typeof payloadIn !== 'object' || Array.isArray(payloadIn)) return null;
  const spec = EVENT_SCHEMA[obj.type];
  const payload: Record<string, unknown> = {};
  for (const [key, fs] of Object.entries(spec)) {
    const v = payloadIn[key];
    if (!checkField(v, fs)) return null;
    if (v !== undefined) payload[key] = v;
  }
  const id = typeof obj.id === 'string' ? obj.id : nextId('ws');
  const ts = typeof obj.ts === 'number' && Number.isFinite(obj.ts) ? obj.ts : Date.now();
  return { id, ts, type: obj.type, payload } as MarionEvent;
}

/** Room each event type is "about", used by the activity feed (click to pan). */
export function eventRoom(ev: MarionEvent): RoomId | null {
  switch (ev.type) {
    case 'mail.pending_approval':
    case 'mail.received':
    case 'mail.sorted':
    case 'mail.sent':
    case 'mail.cleared':
      return 'mail';
    case 'reel.distilled':
    case 'reel.received':
    case 'settings.llm':
      return 'media';
    case 'clip.sorted':
    case 'clip.received':
      return 'cutting';
    case 'skill.slotted':
    case 'bot.spawned':
      return 'foundry';
    case 'dictation.wave':
      return ev.payload.source === 'life' ? 'life' : ev.payload.source === 'engine' ? 'engine' : 'bridge';
    case 'planner.toggled':
    case 'planner.added':
    case 'vault.archived':
    case 'vault.restored':
      return 'life';
    case 'relay.queued':
    case 'relay.dispatched':
      return 'engine';
    case 'group.huddle_start':
    case 'group.huddle_end':
      return 'huddle';
    case 'release.shipped':
      return 'command';
    default:
      return null;
  }
}

/** The bot an event is "about" (for click-to-follow in the feed). */
export function eventBot(ev: MarionEvent): string | null {
  const p = ev.payload as Record<string, unknown>;
  if (typeof p.botId === 'string') return p.botId;
  if (typeof p.from === 'string') return p.from;
  if (typeof p.by === 'string') return p.by;
  return null;
}
