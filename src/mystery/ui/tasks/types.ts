/**
 * Marion Mystery — task mini-game contracts. Every task station kind (plus the
 * two sabotage fix panels) has exactly one mini-game component.
 */
export type MiniGameKind =
  // every task StationKind
  | 'stampMail'
  | 'sortClips'
  | 'distillReel'
  | 'slotCartridge'
  | 'rerouteTube'
  | 'calibrateTurntable'
  | 'sortBerries'
  | 'juicePress'
  | 'alignDish'
  | 'fuelCan'
  | 'fuelEngine'
  | 'fixWiring'
  | 'swipeBadge'
  | 'waterPlants'
  | 'cleanFilter'
  | 'download'
  | 'upload'
  | 'unlockManifold'
  | 'simonSays'
  | 'keypadCode'
  | 'emptyChute'
  | 'medScan'
  | 'primeShields'
  | 'chartCourse'
  | 'replaceFuse'
  | 'rechargeGenerator'
  | 'lightLantern'
  // sabotage fixes
  | 'lightsPanel'
  | 'commsPanel';

export interface MiniGameProps {
  kind: MiniGameKind;
  seed: number;
  onComplete: () => void;
  reducedMotion?: boolean;
  /** true when a murderer is faking: game plays normally */
  fake?: boolean;
}

export const MINI_GAME_KINDS: readonly MiniGameKind[] = [
  'stampMail',
  'sortClips',
  'distillReel',
  'slotCartridge',
  'rerouteTube',
  'calibrateTurntable',
  'sortBerries',
  'juicePress',
  'alignDish',
  'fuelCan',
  'fuelEngine',
  'fixWiring',
  'swipeBadge',
  'waterPlants',
  'cleanFilter',
  'download',
  'upload',
  'unlockManifold',
  'simonSays',
  'keypadCode',
  'emptyChute',
  'medScan',
  'primeShields',
  'chartCourse',
  'replaceFuse',
  'rechargeGenerator',
  'lightLantern',
  'lightsPanel',
  'commsPanel',
] as const;
