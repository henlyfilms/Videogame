/**
 * Flavor content for the live sim and player actions. Everything is local —
 * no external data — and picked through an injectable RNG for determinism.
 */
import type { MailSlot, PlannerLane, RelayModel, SkillId } from '../adapters/events';

export type Rng = () => number;

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]!;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PLANNER_SEED: readonly { lane: PlannerLane; title: string }[] = [
  { lane: 'work', title: 'Life Dashboard' },
  { lane: 'work', title: 'Marion Agent [Human/Bots]' },
  { lane: 'work', title: 'EDITING ENGINE' },
  { lane: 'work', title: 'Hub' },
  { lane: 'work', title: 'Apps' },
  { lane: 'work', title: 'Design' },
  { lane: 'ai', title: 'Sift' },
  { lane: 'ai', title: 'AI Club' },
  { lane: 'ai', title: 'email sender reviewer' },
];

export const VAULT_SEED: readonly { label: string; kind: 'capsule' | 'chat' | 'task' }[] = [
  { label: 'Gauge metrics run', kind: 'capsule' },
  { label: 'Old onboarding chat', kind: 'chat' },
  { label: 'v0 Planner draft', kind: 'task' },
];

export const MAIL_POOL: readonly { from: string; subject: string; hint: MailSlot }[] = [
  { from: 'Investor Update', subject: 'Q3 numbers — need your sign-off', hint: 'action' },
  { from: 'Design Crit', subject: 'Feedback on Life Dashboard v2', hint: 'action' },
  { from: 'AI Club', subject: 'Can you host next Thursday?', hint: 'action' },
  { from: 'Client · Studio', subject: 'Edit notes for the sizzle reel', hint: 'action' },
  { from: 'App Store', subject: 'Your build is ready for review', hint: 'fyi' },
  { from: 'GitHub', subject: 'CI passed on marion-agent', hint: 'fyi' },
  { from: 'Calendar', subject: 'Tomorrow: 3 meetings', hint: 'fyi' },
  { from: 'Stripe', subject: 'Payout sent', hint: 'fyi' },
  { from: 'Newsletter', subject: '10 AI tools you must try', hint: 'noise' },
  { from: 'Promo', subject: '48h flash sale!!!', hint: 'noise' },
  { from: 'Webinar Bot', subject: 'Last chance to register', hint: 'noise' },
  { from: 'Social', subject: 'You have 14 new notifications', hint: 'noise' },
];

export const REEL_POOL: readonly { title: string; platform: 'reel' | 'youtube' }[] = [
  { title: 'Agentic coding in 60s', platform: 'reel' },
  { title: 'Color grading for skin tones', platform: 'youtube' },
  { title: 'Tiny habits for focus', platform: 'reel' },
  { title: 'SQLite FTS5 deep dive', platform: 'youtube' },
  { title: 'Prompt patterns that ship', platform: 'reel' },
  { title: 'Editing rhythm: J and L cuts', platform: 'youtube' },
  { title: 'Calm UI design principles', platform: 'reel' },
  { title: 'Token budgets explained', platform: 'youtube' },
];

export const INSIGHTS: readonly string[] = [
  'Cut on motion, not on dialogue',
  'Batch similar tasks before noon',
  'Index captions, not just titles',
  'Shorter prompts, sharper specs',
  'Ship the smallest useful slice',
  'Default to calm, crisp UI',
  'Log the why, not just the what',
  'Spend tokens where it matters',
];

export const CLIP_NAMES: readonly string[] = [
  'A001_C003 wide',
  'A001_C007 close-up',
  'B002_C001 b-roll',
  'A003_C012 interview',
  'B004_C002 drone',
  'A002_C009 reaction',
  'C001_C004 product',
  'B003_C006 walk & talk',
];

export const TASKS_BY_BOT: Readonly<Record<string, readonly string[]>> = {
  kanye: ['Fix relay reconnect', 'Add ⇧⌘S capture', 'Refactor task queue', 'Ship agent CLI patch'],
  barry: ['Polish Planner lanes', 'Wire MCP vault sync', 'Streak badge animation', 'Restore flow QA'],
  greek: ['Render teaser cut', 'Conform timeline', 'Color pass on reel', 'Export proxies'],
  quill: ['Draft investor reply', 'Triage inbox', 'Summarize threads', 'Tighten follow-ups'],
  sift: ['Distill reel backlog', 'Tune FTS5 ranking', 'Local LLM eval', 'Caption index rebuild'],
  moose: ['Sync Agent ↔ Life', 'Route screenshots', 'Dictation cleanup'],
  builder: ['Tune aura presets', 'Package skill cartridge', 'Spec new specialist'],
  daniel: ['Weekly review', 'Approve roadmap', 'Prioritize backlog'],
};

export const CHATTER: readonly { from: string; to: string; text: string }[] = [
  { from: 'kanye', to: 'moose', text: 'Build is green, routing to Barry' },
  { from: 'moose', to: 'barry', text: 'New task card incoming' },
  { from: 'barry', to: 'daniel', text: 'Planner streak is alive' },
  { from: 'sift', to: 'greek', text: 'Found a great J-cut example' },
  { from: 'greek', to: 'daniel', text: 'Render queue looks healthy' },
  { from: 'quill', to: 'daniel', text: '2 drafts waiting for your stamp' },
  { from: 'builder', to: 'kanye', text: 'Prompt Craft cartridge ready' },
  { from: 'daniel', to: 'kanye', text: 'Ship it when tests pass' },
];

export const SOLO_LINES: Readonly<Record<string, readonly string[]>> = {
  daniel: ['Reviewing priorities', 'Clear the runway', 'Good momentum today'],
  moose: ['Bridge synced', 'Watching the conduit', 'Two drops routed'],
  kanye: ['Spinning up a relay', 'Tests running…', 'Pushing a patch'],
  barry: ['Planner tidy', 'Vault capsule stored', 'Streak +1'],
  greek: ['Scrubbing the timeline', 'Render at 60%', 'Nice cut'],
  quill: ['Inbox zero-ish', 'Red-penning a draft', 'Noise cleared'],
  sift: ['Indexing captions', 'Distilling a reel', 'Local LLM warm'],
  builder: ['Tuning an aura', 'Cartridge pressed', 'Foundry humming'],
};

export const HUDDLE_TOPICS: readonly string[] = ['Sprint planning', 'Release go/no-go', 'Morning triage', 'Design review', 'Inbox strategy'];

export const TRANSCRIPTS: readonly string[] = [
  'Add a streak badge to Life Dashboard',
  'Make the relay retry faster',
  'Draft a reply to the AI Club',
  'Cut a 30-second teaser',
  'Index the new reels tonight',
];

export const MODELS: readonly RelayModel[] = ['claude-opus-auto', 'codex', 'gemini'];
export const SKILLS: readonly SkillId[] = ['token-optimizer', 'claude-auto-mode', 'prompt-craft', 'zero-fluff-comms'];

export const SKILL_BLURBS: Record<SkillId, string> = {
  'token-optimizer': 'Leaner context, faster runs',
  'claude-auto-mode': 'Opus relays run hands-free',
  'prompt-craft': 'Sharper specs, fewer retries',
  'zero-fluff-comms': 'Shorter drafts, faster triage',
};

export function insightFor(title: string): string {
  return INSIGHTS[hashString(title) % INSIGHTS.length]!;
}

/** Whether a clip is a keeper is hidden in its name hash (players learn by the "quality" tag). */
export function clipQuality(name: string): 'good' | 'bad' {
  return hashString(name) % 3 === 0 ? 'bad' : 'good';
}
