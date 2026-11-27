import { mulberry32 } from '../../core/rng';

/** Small seeded RNG toolkit (mulberry32) so every layout is deterministic per seed. */
export interface GameRng {
  next(): number;
  /** Integer in [0, max). */
  int(max: number): number;
  /** Float in [a, b). */
  range(a: number, b: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: T[]): T[];
  chance(p: number): boolean;
}

export function makeRng(seed: number, salt = 0): GameRng {
  const r = mulberry32((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
  const int = (max: number) => Math.floor(r() * max);
  return {
    next: r,
    int,
    range: (a, b) => a + r() * (b - a),
    pick: <T,>(arr: readonly T[]): T => {
      if (arr.length === 0) throw new Error('pick from empty array');
      return arr[int(arr.length)] as T;
    },
    shuffle: <T,>(arr: T[]): T[] => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const t = arr[i] as T;
        arr[i] = arr[j] as T;
        arr[j] = t;
      }
      return arr;
    },
    chance: (p) => r() < p,
  };
}
