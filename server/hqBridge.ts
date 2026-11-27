/**
 * HQ bridge: turns live agent statuses into the MarionEvent stream the Marion
 * HQ "Socket" source listens to (ws://localhost:8787/marion, the HQ's default
 * URL). A Marion agent that starts working walks to its room in the HQ and
 * shows the task; going idle completes it.
 */
import { makeEvent, type MarionEvent } from '../src/adapters/events';
import type { AgentStatus } from '../src/mystery/net/protocol';

export class HqBridge {
  /** Current live task per agent (task id + title). */
  private tasks = new Map<string, { id: string; title: string }>();
  private seq = 0;

  /** Events for one status change. */
  events(id: string, s: AgentStatus | null, prev: AgentStatus | null): MarionEvent[] {
    const out: MarionEvent[] = [];
    const cur = this.tasks.get(id);
    const title = s ? s.title || s.detail || '' : '';
    if (s?.state === 'working') {
      const label = title || 'Working';
      if (!cur || cur.title !== label) {
        if (cur) out.push(makeEvent('task.completed', { taskId: cur.id, botId: id, title: cur.title }));
        const task = { id: `live_${id}_${++this.seq}`, title: label };
        this.tasks.set(id, task);
        out.push(makeEvent('task.created', { taskId: task.id, botId: id, title: label }));
      }
      if (prev?.state !== 'working') out.push(makeEvent('bot.status', { botId: id, status: 'working' }));
      if (s.detail && s.detail !== prev?.detail) out.push(makeEvent('bot.message', { botId: id, text: s.detail }));
      return out;
    }
    if (cur) {
      out.push(makeEvent('task.completed', { taskId: cur.id, botId: id, title: cur.title }));
      this.tasks.delete(id);
    }
    if (prev?.state !== 'idle' || !s) out.push(makeEvent('bot.status', { botId: id, status: 'idle' }));
    if (s?.title && s.title !== prev?.title) out.push(makeEvent('bot.message', { botId: id, text: s.title }));
    return out;
  }

  /** What a newly connected HQ needs to catch up: every agent currently working. */
  snapshot(all: Record<string, AgentStatus>): MarionEvent[] {
    const out: MarionEvent[] = [];
    for (const [id, s] of Object.entries(all)) {
      if (s.state !== 'working') continue;
      let task = this.tasks.get(id);
      if (!task) {
        task = { id: `live_${id}_${++this.seq}`, title: s.title || s.detail || 'Working' };
        this.tasks.set(id, task);
      }
      out.push(makeEvent('task.created', { taskId: task.id, botId: id, title: task.title }));
      out.push(makeEvent('bot.status', { botId: id, status: 'working' }));
    }
    return out;
  }
}
