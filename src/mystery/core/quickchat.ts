/** Quick-chat phrases (usable without typing, on phones and controllers). */
export interface QuickChat {
  id: string;
  text: string;
  /** Needs a player target ({p}). */
  target?: boolean;
  group: 'accuse' | 'defend' | 'info' | 'social';
}

export const QUICK_CHAT: QuickChat[] = [
  { id: 'sus', text: '{p} is sus.', target: true, group: 'accuse' },
  { id: 'saw-vent', text: 'I saw {p} vent!', target: true, group: 'accuse' },
  { id: 'saw-kill', text: 'I saw {p} kill!', target: true, group: 'accuse' },
  { id: 'near-body', text: '{p} was near the body.', target: true, group: 'accuse' },
  { id: 'fake-task', text: '{p} faked a task.', target: true, group: 'accuse' },
  { id: 'not-me', text: 'It wasn’t me!', group: 'defend' },
  { id: 'with', text: 'I was with {p}.', target: true, group: 'defend' },
  { id: 'clear', text: '{p} is clear — I saw a visual task.', target: true, group: 'defend' },
  { id: 'tasks', text: 'I was doing my tasks.', group: 'defend' },
  { id: 'where', text: 'Where was the body?', group: 'info' },
  { id: 'who', text: 'Who called it?', group: 'info' },
  { id: 'skip', text: 'Let’s skip, not enough info.', group: 'info' },
  { id: 'vote', text: 'Vote {p}.', target: true, group: 'info' },
  { id: 'lights', text: 'Someone fix the lights!', group: 'info' },
  { id: 'berry', text: 'Berry suspicious…', group: 'social' },
  { id: 'gg', text: 'GG!', group: 'social' },
  { id: 'hi', text: 'Hi everyone!', group: 'social' },
  { id: 'lol', text: 'LOL', group: 'social' },
];
