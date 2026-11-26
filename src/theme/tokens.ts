/**
 * Marion HQ design tokens. Three themes (Light / Soft / Dark) share one shape so
 * the canvas renderer and the HUD (via CSS variables) read from the same source.
 */
export type ThemeName = 'light' | 'soft' | 'dark';

export const THEME_ORDER: readonly ThemeName[] = ['light', 'soft', 'dark'] as const;

export interface ThemeTokens {
  name: ThemeName;
  label: string;
  /** HUD colors (hex). */
  bg: string;
  surface: string;
  line: string;
  ink: string;
  muted: string;
  accent: string;
  teal: string;
  warn: string;
  good: string;
  /** World colors (canvas). */
  world: {
    void: string;
    corridor: string;
    corridorLine: string;
    floor: string;
    floorAlt: string;
    wall: string;
    wallTop: string;
    door: string;
    label: string;
    prop: string;
    propDark: string;
    propLine: string;
    screen: string;
    screenGlow: string;
    shadow: string;
    /** 0 = no ambient darkness, 1 = full darkness overlay. */
    ambientDark: number;
    /** How strongly bot glows bloom (theme-aware lighting). */
    glowStrength: number;
    bubbleBg: string;
    bubbleInk: string;
    bubbleLine: string;
  };
}

export const ACCENT = '#2f6fed';
export const ACCENT_DARK = '#6ea1ff';
export const TEAL = '#14b8a6';
export const TEAL_DARK = '#2dd4bf';

export const THEMES: Record<ThemeName, ThemeTokens> = {
  light: {
    name: 'light',
    label: 'Light',
    bg: '#f6f7f9',
    surface: '#ffffff',
    line: '#e3e6ec',
    ink: '#111827',
    muted: '#6b7280',
    accent: ACCENT,
    teal: TEAL,
    warn: '#d97706',
    good: '#16a34a',
    world: {
      void: '#eef0f4',
      corridor: '#f3f4f7',
      corridorLine: '#e4e7ee',
      floor: '#ffffff',
      floorAlt: '#f8f9fb',
      wall: '#d4d9e3',
      wallTop: '#c3c9d6',
      door: '#ffffff',
      label: '#4b5563',
      prop: '#eef1f6',
      propDark: '#cfd6e2',
      propLine: '#b8c1d1',
      screen: '#1e293b',
      screenGlow: '#93c5fd',
      shadow: 'rgba(15, 23, 42, 0.08)',
      ambientDark: 0,
      glowStrength: 0.55,
      bubbleBg: '#ffffff',
      bubbleInk: '#111827',
      bubbleLine: '#e3e6ec',
    },
  },
  soft: {
    name: 'soft',
    label: 'Soft',
    bg: '#eceae4',
    surface: '#f7f5f0',
    line: '#dcd8ce',
    ink: '#24211c',
    muted: '#7a7468',
    accent: ACCENT,
    teal: '#0f9f90',
    warn: '#c2690a',
    good: '#3f8f4f',
    world: {
      void: '#e2dfd7',
      corridor: '#e9e6df',
      corridorLine: '#dad6cc',
      floor: '#f5f2ea',
      floorAlt: '#efebe2',
      wall: '#cdc7ba',
      wallTop: '#bdb6a7',
      door: '#f5f2ea',
      label: '#5e584d',
      prop: '#e8e3d8',
      propDark: '#cfc8b9',
      propLine: '#b5ad9c',
      screen: '#2a2722',
      screenGlow: '#a5c4ff',
      shadow: 'rgba(40, 30, 10, 0.10)',
      ambientDark: 0.12,
      glowStrength: 0.75,
      bubbleBg: '#fbfaf6',
      bubbleInk: '#24211c',
      bubbleLine: '#dcd8ce',
    },
  },
  dark: {
    name: 'dark',
    label: 'Dark',
    bg: '#0b0e14',
    surface: '#121722',
    line: '#232a38',
    ink: '#e6e9f0',
    muted: '#8b93a5',
    accent: ACCENT_DARK,
    teal: TEAL_DARK,
    warn: '#f59e0b',
    good: '#4ade80',
    world: {
      void: '#07090d',
      corridor: '#0d1118',
      corridorLine: '#161c27',
      floor: '#131925',
      floorAlt: '#111622',
      wall: '#222b3b',
      wallTop: '#2d3850',
      door: '#131925',
      label: '#8b93a5',
      prop: '#1b2232',
      propDark: '#0f141e',
      propLine: '#2d3850',
      screen: '#05070b',
      screenGlow: '#6ea1ff',
      shadow: 'rgba(0, 0, 0, 0.35)',
      ambientDark: 0.25,
      glowStrength: 1,
      bubbleBg: '#1a2130',
      bubbleInk: '#e6e9f0',
      bubbleLine: '#2d3850',
    },
  },
};

export function nextTheme(t: ThemeName): ThemeName {
  const i = THEME_ORDER.indexOf(t);
  return THEME_ORDER[(i + 1) % THEME_ORDER.length] ?? 'light';
}

/** "#2f6fed" -> "47 111 237" (space-separated for Tailwind's rgb(var() / a) pattern). */
export function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function withAlpha(hex: string, alpha: number): string {
  return `rgb(${hexToRgbTriplet(hex).split(' ').join(', ')}, ${alpha})`.replace('rgb(', 'rgba(');
}

/** Push the HUD tokens into CSS custom properties on <html>. */
export function applyThemeToDocument(theme: ThemeName, root: HTMLElement = document.documentElement): void {
  const t = THEMES[theme];
  const vars: Record<string, string> = {
    '--hq-bg': t.bg,
    '--hq-surface': t.surface,
    '--hq-line': t.line,
    '--hq-ink': t.ink,
    '--hq-muted': t.muted,
    '--hq-accent': t.accent,
    '--hq-teal': t.teal,
    '--hq-warn': t.warn,
    '--hq-good': t.good,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, hexToRgbTriplet(v));
  root.dataset.theme = theme;
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
}
