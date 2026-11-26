/**
 * Human-readable one-liners for the Activity Feed.
 */
import type { MarionEvent } from '../adapters/events';
import { STATE_LABEL } from '../engine/fsm';
import { MODEL_LABELS, SKILL_LABELS } from '../render/view';

export type NameOf = (botId: string) => string;

export function describeEvent(ev: MarionEvent, name: NameOf): string {
  switch (ev.type) {
    case 'bot.status':
      return `${name(ev.payload.botId)} is ${STATE_LABEL[ev.payload.status].toLowerCase()}`;
    case 'bot.message':
      return ev.payload.to ? `${name(ev.payload.botId)} → ${name(ev.payload.to)}: ${ev.payload.text}` : `${name(ev.payload.botId)}: ${ev.payload.text}`;
    case 'bot.delegate':
      return `${name(ev.payload.from)} delegated “${ev.payload.task}” to ${name(ev.payload.to)}`;
    case 'bot.tool_call':
      return `${name(ev.payload.botId)} called ${ev.payload.tool}${ev.payload.model ? ` · ${MODEL_LABELS[ev.payload.model]}` : ''}`;
    case 'group.huddle_start':
      return `Huddle started: ${ev.payload.topic} (${ev.payload.botIds.map(name).join(', ')})`;
    case 'group.huddle_end':
      return 'Huddle wrapped';
    case 'task.created':
      return `${name(ev.payload.botId)} picked up “${ev.payload.title}”`;
    case 'task.completed':
      return `${name(ev.payload.botId)} finished “${ev.payload.title}”${ev.payload.deliverTo === 'life' ? ' → Vault' : ' → Command'}`;
    case 'mail.pending_approval':
      return `Quill drafted “${ev.payload.subject}” — awaiting your stamp`;
    case 'reel.distilled':
      return `Sift distilled an insight: ${ev.payload.insight}`;
    case 'clip.sorted':
      return `${name(ev.payload.by)} binned a clip as ${ev.payload.bin}`;
    case 'skill.slotted':
      return `${SKILL_LABELS[ev.payload.skillId]} ${ev.payload.slotted ? 'slotted' : 'removed'}`;
    case 'dictation.wave':
      return ev.payload.active ? `Dictation wave started (${ev.payload.source})` : ev.payload.transcript ? `Dictation: “${ev.payload.transcript}”` : 'Dictation ended';
    case 'mail.received':
      return `Mail from ${ev.payload.from}: ${ev.payload.subject}`;
    case 'mail.sorted':
      return `Mail sorted into ${ev.payload.slot === 'fyi' ? 'FYI' : ev.payload.slot === 'action' ? 'Needs Action' : 'Noise'}`;
    case 'mail.sent':
      return 'Approved & sent ✉︎';
    case 'mail.cleared':
      return 'Noise slot cleared';
    case 'reel.received':
      return `New ${ev.payload.platform === 'youtube' ? 'YouTube video' : 'reel'}: ${ev.payload.title}`;
    case 'clip.received':
      return `Raw clip in: ${ev.payload.name}`;
    case 'planner.toggled':
      return ev.payload.done ? 'Planner card checked ✓' : 'Planner card reopened';
    case 'planner.added':
      return `New ${ev.payload.lane === 'ai' ? 'AI' : 'Work'} card: ${ev.payload.title}`;
    case 'vault.archived':
      return `Archived to Vault: ${ev.payload.label}`;
    case 'vault.restored':
      return 'Restored from the Deleted Archive';
    case 'relay.queued':
      return ev.payload.kind === 'polaroid' ? 'Screenshot pinned for Kanye' : `Command queued: ${ev.payload.text}`;
    case 'relay.dispatched':
      return `${name(ev.payload.botId)} relayed to ${MODEL_LABELS[ev.payload.model]}`;
    case 'release.shipped':
      return `Release v${ev.payload.version} stamped & shipped 📦`;
    case 'bot.spawned':
      return `${ev.payload.name} spawned in the Foundry`;
    case 'settings.llm':
      return `Sift switched to ${ev.payload.mode === 'local' ? 'Local' : 'Cloud'} LLM`;
  }
}

/** Events we keep out of the feed because they're too chatty. */
export function isQuietEvent(ev: MarionEvent): boolean {
  return ev.type === 'bot.status' && (ev.payload.status === 'idle' || ev.payload.status === 'walking');
}
