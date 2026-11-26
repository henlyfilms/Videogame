/**
 * Shared berry body geometry for the 2D and 3D renderers: a lathe-style
 * profile (radius as a function of height) plus colour helpers.
 */
import type { BerryType } from '../core/types';
import { BERRY_BY_ID } from './catalog';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Body radius (0..1 of the berry's half-width) at normalised height t
 * (0 = bottom, 1 = top). The side silhouette of the berry is exactly this
 * profile mirrored, and the 3D body is this profile lathed.
 */
export function berryProfile(berry: BerryType, t: number): number {
  t = clamp01(t);
  const circ = (u: number, p = 2): number => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), p)), 1 / p);
  switch (berry) {
    case 'strawberry': {
      // Broad shoulders, soft rounded point at the bottom.
      const shoulder = 0.66;
      if (t < shoulder) {
        const u = t / shoulder;
        return 0.16 + 0.84 * Math.pow(Math.sin((u * Math.PI) / 2), 0.85);
      }
      const u = (t - shoulder) / (1 - shoulder);
      return Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.4)));
    }
    case 'blueberry':
      return circ(t, 2.35);
    case 'raspberry': {
      // Thimble: wider low, domed top.
      const base = circ(t, 2.1);
      return base * (1 + 0.06 * Math.sin((1 - t) * Math.PI * 0.9));
    }
    case 'blackberry':
    case 'grape':
    case 'cranberry':
      return circ(t, 2.05);
    case 'marionberry': {
      // Elongated with a slightly fuller bottom.
      const base = circ(t, 2);
      return base * (1 + 0.05 * Math.cos(t * Math.PI));
    }
    case 'cherry':
      return circ(t, 2.15) * (t > 0.9 ? 1 - (t - 0.9) * 0.8 : 1);
    case 'gooseberry':
    case 'goldberry':
    case 'elderberry':
      return circ(t, 2.1);
    case 'boysenberry':
      return circ(t, 2.3);
  }
}

/** Height t where the face sits (eye line). */
export function faceLine(berry: BerryType): number {
  return berry === 'strawberry' ? 0.6 : berry === 'marionberry' ? 0.6 : 0.57;
}

export function berryDims(berry: BerryType): { aspect: number; width: number } {
  const b = BERRY_BY_ID[berry];
  return { aspect: b.aspect, width: b.width };
}

// ---------------------------------------------------------------------------
// Colour helpers

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Perceived luminance 0..1. */
export function luma(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** FNV-1a for cache keys / per-character phases. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
