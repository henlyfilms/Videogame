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
export const PALETTE: { id: string; name: string; hex: string; dark: string }[] = ['#ef4444', '#b91c1c', '#f97316', '#c2410c', '#facc15', '#ca8a04', '#22c55e', '#15803d', '#14b8a6', '#0f766e', '#3b82f6', '#1d4ed8', '#a855f7', '#7e22ce', '#ec4899', '#be185d', '#334155', '#0f172a', '#f1f5f9', '#cbd5e1'].map((hex, i) => ({ id: `c${i}`, name: `Colour ${i}`, hex, dark: hex }));
