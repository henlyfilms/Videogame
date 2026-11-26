/**
 * Marion agent looks + cosmetics guards used by the room host. Delegates to
 * the character catalog (sanitizeCosmetics / randomCosmetics / MARION_BOT_LOOKS).
 */
import { MARION_BOT_LOOKS, randomCosmetics, sanitizeCosmetics } from '../characters/catalog';
import type { Cosmetics } from '../core/types';

export interface BotLook {
  name: string;
  cosmetics: Cosmetics;
  persona: string;
}

const PERSONAS: Record<string, [string, string]> = {
  daniel: ['Daniel', 'Chief Executor: calm, decisive, sums up evidence and calls the vote.'],
  moose: ['Moose', 'Co-Pilot: upbeat, cross-checks alibis, says "copy that".'],
  kanye: ['Kanye', 'Marion Agent: confident and dramatic, loves a bold accusation.'],
  barry: ['Barry', 'Marion Life: organised planner, tracks who was where, gentle.'],
  greek: ['Greek', 'Marion Engine: precise, talks in render/test metaphors, a bit dry.'],
  quill: ['Quill', 'Email: polite, formal, never sends anything without approval.'],
  sift: ['Sift', 'Sift Dev: analytical, distils the facts into a short list.'],
  builder: ['Bot Builder', 'Foundry: tinkerer, enthusiastic, slightly chaotic.'],
};

export const BOT_LOOKS: Record<string, BotLook> = Object.fromEntries(
  Object.entries(PERSONAS).map(([id, [name, persona]]) => [
    id,
    { name, persona, cosmetics: (MARION_BOT_LOOKS as Record<string, Cosmetics>)[id] ?? randomCosmetics(id.length * 977) },
  ]),
);

export function fallbackCosmetics(seed: number): Cosmetics {
  return randomCosmetics(seed);
}

export function sanitizeCosmeticsSafe(raw: unknown): Cosmetics {
  return sanitizeCosmetics(raw);
}
