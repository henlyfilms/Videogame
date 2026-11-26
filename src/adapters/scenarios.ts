/**
 * Built-in deterministic replay scenarios. Times are seconds from start.
 */
import type { EventPayloads, MarionEventType } from './events';

export interface ScenarioStep {
  at: number; // ms
  type: MarionEventType;
  payload: EventPayloads[MarionEventType];
}

export interface Scenario {
  id: string;
  title: string;
  blurb: string;
  steps: ScenarioStep[];
  duration: number; // ms
}

function build(id: string, title: string, blurb: string, fn: (at: <K extends MarionEventType>(s: number, type: K, payload: EventPayloads[K]) => void) => void, tail = 4): Scenario {
  const steps: ScenarioStep[] = [];
  fn((s, type, payload) => steps.push({ at: Math.round(s * 1000), type, payload }));
  steps.sort((a, b) => a.at - b.at);
  const duration = (steps.at(-1)?.at ?? 0) + tail * 1000;
  return { id, title, blurb, steps, duration };
}

export const SCENARIOS: readonly Scenario[] = [
  build('feature-sprint', 'Marion Agent Feature Sprint', 'Dictation → relay → tests → render green → release.', (at) => {
    at(0.5, 'bot.message', { botId: 'daniel', text: 'Sprint: ship ⇧⌘S capture today', to: 'kanye' });
    at(1.5, 'dictation.wave', { active: true, source: 'bridge' });
    at(5.5, 'dictation.wave', { active: false, source: 'bridge', transcript: 'Add screenshot capture to the agent' });
    at(6, 'relay.queued', { commandId: 'fs_cmd1', kind: 'wave', text: 'Add screenshot capture to the agent' });
    at(7, 'relay.queued', { commandId: 'fs_cmd2', kind: 'polaroid', text: 'Screenshot #1' });
    at(9, 'relay.dispatched', { commandId: 'fs_cmd1', model: 'claude-opus-auto', botId: 'kanye' });
    at(9.1, 'task.created', { taskId: 'fs_cmd1', botId: 'kanye', title: 'Add screenshot capture to the agent' });
    at(11, 'bot.tool_call', { botId: 'kanye', tool: 'fs.write', model: 'claude-opus-auto' });
    at(13, 'bot.message', { botId: 'kanye', text: 'Patch ready, running tests', to: 'moose' });
    at(14, 'group.huddle_start', { huddleId: 'fs_h1', botIds: ['daniel', 'kanye', 'moose', 'barry'], topic: 'Release go/no-go' });
    at(15, 'clip.received', { clipId: 'fs_c1', name: 'A001_C003 wide #12', quality: 'good' });
    at(15.5, 'clip.received', { clipId: 'fs_c2', name: 'B004_C002 drone #31', quality: 'bad' });
    at(16, 'clip.received', { clipId: 'fs_c3', name: 'A003_C012 interview #44', quality: 'good' });
    at(16.5, 'clip.received', { clipId: 'fs_c4', name: 'C001_C004 product #18', quality: 'good' });
    at(17, 'clip.received', { clipId: 'fs_c5', name: 'A002_C009 reaction #52', quality: 'good' });
    at(19, 'clip.sorted', { clipId: 'fs_c1', bin: 'keeper', by: 'greek' });
    at(21, 'clip.sorted', { clipId: 'fs_c2', bin: 'outtake', by: 'greek' });
    at(23, 'bot.tool_call', { botId: 'kanye', tool: 'npm test', model: 'codex' });
    at(24, 'clip.sorted', { clipId: 'fs_c3', bin: 'keeper', by: 'greek' });
    at(26, 'clip.sorted', { clipId: 'fs_c4', bin: 'keeper', by: 'greek' });
    at(27, 'group.huddle_end', { huddleId: 'fs_h1' });
    at(28, 'bot.message', { botId: 'greek', text: 'Tests passed — render green', to: 'daniel' });
    at(30, 'task.completed', { taskId: 'fs_cmd1', botId: 'kanye', title: 'Add screenshot capture to the agent', deliverTo: 'daniel' });
    at(33, 'release.shipped', { version: '1.1.0' });
    at(34, 'bot.message', { botId: 'daniel', text: 'Marion v1.1.0 shipped' });
    at(36, 'relay.dispatched', { commandId: 'fs_cmd2', model: 'gemini', botId: 'kanye' });
    at(36.1, 'task.created', { taskId: 'fs_cmd2', botId: 'kanye', title: 'Screenshot #1' });
    at(42, 'task.completed', { taskId: 'fs_cmd2', botId: 'kanye', title: 'Screenshot #1', deliverTo: 'life' });
    at(44, 'planner.toggled', { cardId: 'seed_1', done: true });
    at(45, 'bot.message', { botId: 'barry', text: 'Planner streak +1', to: 'moose' });
  }),
  build('orchestration', 'Multi-Bot Orchestration', 'Daniel fans work out to every wing and pulls it back to Command.', (at) => {
    at(0.5, 'group.huddle_start', { huddleId: 'or_h1', botIds: ['daniel', 'moose', 'kanye', 'barry', 'greek', 'quill', 'sift', 'builder'], topic: 'Sprint planning' });
    at(9, 'group.huddle_end', { huddleId: 'or_h1' });
    const fan: [string, string][] = [
      ['kanye', 'Refactor task queue'],
      ['barry', 'Polish Planner lanes'],
      ['greek', 'Render teaser cut'],
      ['quill', 'Summarize threads'],
      ['sift', 'Tune FTS5 ranking'],
      ['builder', 'Package skill cartridge'],
    ];
    fan.forEach(([bot, title], i) => {
      at(10 + i * 1.2, 'bot.delegate', { from: 'daniel', to: bot, task: title, taskId: `or_t${i}` });
      at(10.1 + i * 1.2, 'task.created', { taskId: `or_t${i}`, botId: bot, title });
    });
    at(18, 'skill.slotted', { skillId: 'claude-auto-mode', slotted: true });
    at(19, 'bot.message', { botId: 'builder', text: 'Claude Auto Mode slotted', to: 'kanye' });
    at(20, 'bot.tool_call', { botId: 'kanye', tool: 'relay.run', model: 'claude-opus-auto' });
    at(22, 'bot.message', { botId: 'sift', text: 'Ranking +18% on captions', to: 'barry' });
    at(23, 'bot.tool_call', { botId: 'sift', tool: 'fts5.rebuild', model: 'gemini' });
    at(24, 'bot.spawned', { botId: 'or_scout', name: 'Scout', job: 'Watches competitor launches', shape: 'star', color: '#10b981', glowColor: '#34d399' });
    fan.forEach(([bot, title], i) => {
      at(27 + i * 2.2, 'task.completed', { taskId: `or_t${i}`, botId: bot, title, deliverTo: i % 2 ? 'life' : 'daniel' });
    });
    at(41, 'bot.message', { botId: 'daniel', text: 'All six back. Great work.' });
    at(42, 'skill.slotted', { skillId: 'claude-auto-mode', slotted: false });
  }),
  build('morning-triage', 'Morning Triage & Media Distill', 'Inbox sorting, stamped approvals, reels distilled, voice to Planner.', (at) => {
    for (const id of ['quill', 'sift', 'barry']) at(0.2, 'bot.status', { botId: id, status: 'asleep' });
    at(2, 'bot.status', { botId: 'quill', status: 'working' });
    const mails: [string, string, 'action' | 'fyi' | 'noise'][] = [
      ['Investor Update', 'Q3 numbers — need your sign-off', 'action'],
      ['GitHub', 'CI passed on marion-agent', 'fyi'],
      ['Promo', '48h flash sale!!!', 'noise'],
      ['AI Club', 'Can you host next Thursday?', 'action'],
      ['Newsletter', '10 AI tools you must try', 'noise'],
      ['Calendar', 'Tomorrow: 3 meetings', 'fyi'],
    ];
    mails.forEach(([from, subject, hint], i) => at(3 + i * 0.8, 'mail.received', { mailId: `mt_m${i}`, from, subject, hint }));
    mails.forEach(([, , hint], i) => at(9 + i * 1.1, 'mail.sorted', { mailId: `mt_m${i}`, slot: hint }));
    at(16, 'mail.pending_approval', { mailId: 'mt_m0', draftId: 'mt_d0', subject: 'Re: Q3 numbers — need your sign-off', words: 190 });
    at(17, 'mail.pending_approval', { mailId: 'mt_m3', draftId: 'mt_d1', subject: 'Re: Can you host next Thursday?', words: 140 });
    at(18, 'mail.cleared', {});
    at(19, 'bot.status', { botId: 'sift', status: 'working' });
    at(20, 'reel.received', { reelId: 'mt_r0', title: 'Agentic coding in 60s', platform: 'reel' });
    at(21, 'reel.received', { reelId: 'mt_r1', title: 'SQLite FTS5 deep dive', platform: 'youtube' });
    at(22, 'settings.llm', { mode: 'local' });
    at(24, 'reel.distilled', { reelId: 'mt_r0', insight: 'Shorter prompts, sharper specs', buff: 'speed' });
    at(26, 'mail.sent', { draftId: 'mt_d0' });
    at(27, 'reel.distilled', { reelId: 'mt_r1', insight: 'Index captions, not just titles', buff: 'accuracy' });
    at(28, 'bot.message', { botId: 'sift', text: 'Two insight cards ready', to: 'kanye' });
    at(29, 'bot.status', { botId: 'barry', status: 'working' });
    at(30, 'dictation.wave', { active: true, source: 'life' });
    at(34, 'dictation.wave', { active: false, source: 'life', transcript: 'Add a streak badge to Life Dashboard' });
    at(36, 'planner.toggled', { cardId: 'seed_0', done: true });
    at(37, 'planner.toggled', { cardId: 'seed_7', done: true });
    at(38, 'mail.sent', { draftId: 'mt_d1' });
    at(39, 'bot.message', { botId: 'quill', text: 'Inbox zero. Both replies stamped.', to: 'daniel' });
  }),
];

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]!;
}
