// TEMPORARY STUB — replaced by the character-system branch on merge.
import type { Cosmetics } from '../core/types';
import { Rng } from '../core/rng';
const BERRIES = ['strawberry','blueberry','raspberry','blackberry','marionberry','cranberry','gooseberry','cherry','grape','elderberry','boysenberry','goldberry'] as const;
export function defaultCosmetics(): Cosmetics {
  return { berry: 'blueberry', color: 10, pattern: 'plain', eyes: 'round', brows: 'soft', mouth: 'smile', hair: 'none', hairColor: '#3b2416', hat: 'none', face: 'none', outfit: 'none', back: 'none', pet: 'none', nameplate: 'cobalt', emotes: ['wave'], victory: 'cheer' };
}
export function randomCosmetics(seed: number): Cosmetics {
  const r = new Rng(seed);
  return { ...defaultCosmetics(), berry: r.pick(BERRIES), color: r.int(20) };
}
export function sanitizeCosmetics(raw: unknown): Cosmetics {
  const d = defaultCosmetics();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Partial<Cosmetics>;
  return { ...d, berry: (BERRIES as readonly string[]).includes(o.berry as string) ? (o.berry as Cosmetics['berry']) : d.berry, color: typeof o.color === 'number' ? Math.max(0, Math.min(19, Math.round(o.color))) : d.color };
}
export const MARION_BOT_LOOKS: Record<string, Cosmetics> = {};
