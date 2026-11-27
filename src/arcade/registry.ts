/**
 * The Arcade's game registry. Live games launch full-screen over the HQ; the
 * 'soon' entries fill the "coming soon" cabinets in the Arcade panel.
 */
import { launchMystery, MYSTERY_ID } from './state';

export interface ArcadeGame {
  id: string;
  name: string;
  tagline: string;
  /** Cabinet / accent color. */
  color: string;
  status: 'live' | 'soon';
  launch?(): void;
}

export const ARCADE_GAMES: readonly ArcadeGame[] = [
  {
    id: MYSTERY_ID,
    name: 'Marion Mystery',
    tagline: 'Tasks, sabotage and one very suspicious berry. 4–20 players.',
    color: '#e879f9',
    status: 'live',
    launch: () => launchMystery({ kind: 'menu' }),
  },
  {
    id: 'berry-blaster',
    name: 'Berry Blaster',
    tagline: 'Twin-stick smoothie defense. Blend the bugs before standup.',
    color: '#22d3ee',
    status: 'soon',
  },
  {
    id: 'neon-drift',
    name: 'Neon Drift',
    tagline: 'Race pneumatic capsules through the HQ tube network.',
    color: '#fbbf24',
    status: 'soon',
  },
  {
    id: 'quill-quest',
    name: 'Quill Quest',
    tagline: 'An Inbox Zero roguelike. The stamp is mightier than the sword.',
    color: '#6ea1ff',
    status: 'soon',
  },
];

export function arcadeGame(id: string): ArcadeGame | undefined {
  return ARCADE_GAMES.find((g) => g.id === id);
}
