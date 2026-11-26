/**
 * Optional LLM layer for bot meeting chat. Server-only: the API key is read
 * from the server environment and never sent to clients. Short timeouts, a
 * per-room budget, and a silent fallback to the heuristic quick-chat.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ChatContext, ChatProvider } from '../src/mystery/ai/bot';

export interface LlmOptions {
  model?: string;
  timeoutMs?: number;
  /** Max LLM lines per process per minute (cost guard). */
  perMinute?: number;
}

export function createLlmChat(opts: LlmOptions = {}): ChatProvider | null {
  // The SDK resolves credentials from the environment; skip entirely if none.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const client = new Anthropic({ timeout: opts.timeoutMs ?? 4000, maxRetries: 0 });
  const model = opts.model ?? process.env.MYSTERY_LLM_MODEL ?? 'claude-haiku-5-5';
  const perMinute = opts.perMinute ?? 30;
  let windowStart = Date.now();
  let used = 0;

  return async (ctx: ChatContext) => {
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      used = 0;
    }
    if (used >= perMinute) return null;
    used++;
    const system =
      'You voice a character in a light-hearted social-deduction party game played by berry characters. ' +
      'Reply with ONE short chat line (max 120 characters), in character, no quotes, no emojis spam, no role reveals unless it helps your team. ' +
      'Never mention being an AI. Keep it family-friendly.';
    const brief = {
      you: { name: ctx.botName, persona: ctx.persona, secretRole: ctx.role, team: ctx.team },
      meeting: { reportedVictim: ctx.victim, calledBy: ctx.caller },
      alivePlayers: ctx.alive.map((a) => a.name),
      yourSuspicions: ctx.suspicions,
      recentChat: ctx.recentChat,
      goal:
        ctx.team === 'murderers'
          ? 'Stay hidden: deflect suspicion, sound helpful, never accuse a teammate.'
          : ctx.role === 'jester'
            ? 'Act a little suspicious so people vote you out, but subtly.'
            : 'Help the crew find the murderer using only what you actually saw.',
    };
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 1024,
        output_config: { effort: 'low' },
        system,
        messages: [{ role: 'user', content: `Game state (JSON):\n${JSON.stringify(brief)}\n\nYour one chat line:` }],
      });
      if (res.stop_reason === 'refusal') return null;
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/^["']|["']$/g, '')
        .trim();
      return text ? text.slice(0, 140) : null;
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) used = perMinute;
      else if (error instanceof Anthropic.APIError) console.warn(`[mystery] LLM chat error ${error.status}`);
      return null;
    }
  };
}
