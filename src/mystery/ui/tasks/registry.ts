import type { ComponentType } from 'react';
import AlignDish from './AlignDish';
import CalibrateTurntable from './CalibrateTurntable';
import ChartCourse from './ChartCourse';
import CleanFilter from './CleanFilter';
import CommsPanel from './CommsPanel';
import DistillReel from './DistillReel';
import Download from './Download';
import EmptyChute from './EmptyChute';
import FixWiring from './FixWiring';
import FuelCan from './FuelCan';
import FuelEngine from './FuelEngine';
import JuicePress from './JuicePress';
import KeypadCode from './KeypadCode';
import LightLantern from './LightLantern';
import LightsPanel from './LightsPanel';
import MedScan from './MedScan';
import PrimeShields from './PrimeShields';
import RechargeGenerator from './RechargeGenerator';
import ReplaceFuse from './ReplaceFuse';
import RerouteTube from './RerouteTube';
import SimonSays from './SimonSays';
import SlotCartridge from './SlotCartridge';
import SortBerries from './SortBerries';
import SortClips from './SortClips';
import StampMail from './StampMail';
import SwipeBadge from './SwipeBadge';
import Upload from './Upload';
import UnlockManifold from './UnlockManifold';
import WaterPlants from './WaterPlants';
import type { MiniGameKind, MiniGameProps } from './types';

export interface MiniGameEntry {
  title: string;
  Component: ComponentType<MiniGameProps>;
  hint: string;
}

export const MINI_GAMES: Record<MiniGameKind, MiniGameEntry> = {
  stampMail: { title: 'Approve-Stamp Mail', Component: StampMail, hint: 'Brass stamp on the real mail, noise in the bin.' },
  sortClips: { title: 'Sort Clips', Component: SortClips, hint: 'Keepers left, outtakes right.' },
  distillReel: { title: 'Distill a Reel', Component: DistillReel, hint: 'Drop the queued reel in the chute, then pull the lever.' },
  slotCartridge: { title: 'Slot Skill Cartridge', Component: SlotCartridge, hint: 'Seat each cartridge in the slot with its key shape.' },
  rerouteTube: { title: 'Re-route Pneumatic Tube', Component: RerouteTube, hint: 'Rotate pipes until the capsule can reach its port.' },
  calibrateTurntable: { title: 'Calibrate Turntable', Component: CalibrateTurntable, hint: 'Slide the pitch back to 72 bpm and hold it there.' },
  sortBerries: { title: 'Sort Berries by Ripeness', Component: SortBerries, hint: 'Ripe, almost, not yet: drop each berry in its bin.' },
  juicePress: { title: 'Juice Press', Component: JuicePress, hint: 'Crank the press until the jar is full.' },
  alignDish: { title: 'Align Satellite Dish', Component: AlignDish, hint: 'Rotate the dish until the signal locks.' },
  fuelCan: { title: 'Fill the Fuel Can', Component: FuelCan, hint: 'Hold to fill the can with BerryFuel.' },
  fuelEngine: { title: 'Fuel the Engine', Component: FuelEngine, hint: 'Hold to pour until the gauge reads full.' },
  fixWiring: { title: 'Fix Wiring', Component: FixWiring, hint: 'Connect each wire to the socket with the same colour and shape.' },
  swipeBadge: { title: 'Swipe Badge', Component: SwipeBadge, hint: 'Swipe at just the right speed.' },
  waterPlants: { title: 'Water Plants', Component: WaterPlants, hint: 'Fill each pot to the dashed line, no further.' },
  cleanFilter: { title: 'Clean Filter', Component: CleanFilter, hint: 'Clear every leaf and seed off the grate.' },
  download: { title: 'Download Data', Component: Download, hint: 'Start the download and wait for the bytes.' },
  upload: { title: 'Upload Data', Component: Upload, hint: 'Start the upload and wait for the bytes.' },
  unlockManifold: { title: 'Unlock Manifold', Component: UnlockManifold, hint: 'Press 1 to 10 in order.' },
  simonSays: { title: 'Repeat the Pattern', Component: SimonSays, hint: 'Watch the lights, then repeat them.' },
  keypadCode: { title: 'Enter Keypad Code', Component: KeypadCode, hint: 'Punch in the code from the sticky note.' },
  emptyChute: { title: 'Empty the Chute', Component: EmptyChute, hint: 'Hold the lever until the chute is clear.' },
  medScan: { title: 'Submit Scan', Component: MedScan, hint: 'Start the scan and stand still.' },
  primeShields: { title: 'Prime Shields', Component: PrimeShields, hint: 'Tap every red hex.' },
  chartCourse: { title: 'Chart Course', Component: ChartCourse, hint: 'Guide the ship through each waypoint in order.' },
  replaceFuse: { title: 'Replace Fuse', Component: ReplaceFuse, hint: 'Find the blown fuse in the dark and swap it.' },
  rechargeGenerator: { title: 'Recharge Generator', Component: RechargeGenerator, hint: 'Crank until the needle is green.' },
  lightLantern: { title: 'Light a Lantern', Component: LightLantern, hint: 'Strike a match, then hold it to the wick.' },
  lightsPanel: { title: 'Fix Lights', Component: LightsPanel, hint: 'Flip every breaker back on.' },
  commsPanel: { title: 'Fix Comms', Component: CommsPanel, hint: 'Tune the dial to the HQ frequency.' },
};

export interface ControlHint {
  keys: string[];
  label: string;
}

const MOVE_ACT = (act: string): ControlHint[] => [
  { keys: ['←', '→', '↑', '↓'], label: 'move' },
  { keys: ['Enter'], label: act },
];
const HOLD = (what: string): ControlHint[] => [{ keys: ['Space'], label: `hold to ${what}` }];

/** Keyboard / gamepad control hints shown under each game. */
export const CONTROLS: Record<MiniGameKind, ControlHint[]> = {
  stampMail: [
    { keys: ['←', '→'], label: 'bin / stamp' },
    { keys: ['Enter'], label: 'confirm' },
  ],
  sortClips: [
    { keys: ['←'], label: 'keeper' },
    { keys: ['→'], label: 'outtake' },
  ],
  distillReel: [
    { keys: ['←', '→'], label: 'pick reel' },
    { keys: ['Enter'], label: 'drop' },
    { keys: ['Space'], label: 'hold to pull' },
  ],
  slotCartridge: [
    { keys: ['←', '→'], label: 'choose slot' },
    { keys: ['Enter'], label: 'insert' },
  ],
  rerouteTube: MOVE_ACT('rotate pipe'),
  calibrateTurntable: [
    { keys: ['↑', '↓'], label: 'pitch' },
    { keys: ['⇧'], label: 'fine' },
  ],
  sortBerries: [
    { keys: ['←', '→'], label: 'move claw' },
    { keys: ['Enter'], label: 'drop' },
  ],
  juicePress: [
    { keys: ['Space'], label: 'pump (or hold)' },
    { keys: ['←', '→'], label: 'crank' },
  ],
  alignDish: [{ keys: ['←', '→'], label: 'rotate dish' }],
  fuelCan: HOLD('fill'),
  fuelEngine: HOLD('pour'),
  fixWiring: [
    { keys: ['↑', '↓'], label: 'choose' },
    { keys: ['Enter'], label: 'grab / plug in' },
    { keys: ['←'], label: 'drop' },
  ],
  swipeBadge: [{ keys: ['Space'], label: 'hold, release in the green' }],
  waterPlants: [
    { keys: ['←', '→'], label: 'choose pot' },
    { keys: ['Space'], label: 'hold to pour' },
  ],
  cleanFilter: MOVE_ACT('flick out'),
  download: [{ keys: ['Enter'], label: 'start download' }],
  upload: [{ keys: ['Enter'], label: 'start upload' }],
  unlockManifold: [...MOVE_ACT('press'), { keys: ['1–0'], label: 'direct' }],
  simonSays: [...MOVE_ACT('press'), { keys: ['1–9'], label: 'direct' }],
  keypadCode: [
    { keys: ['0–9'], label: 'type' },
    { keys: ['←', '→', '↑', '↓'], label: 'move' },
    { keys: ['Enter'], label: 'press' },
  ],
  emptyChute: HOLD('pull the lever'),
  medScan: [
    { keys: ['Enter'], label: 'start scan' },
    { keys: ['←', '→'], label: "don't fidget!" },
  ],
  primeShields: MOVE_ACT('prime'),
  chartCourse: [{ keys: ['Enter'], label: 'fly to next waypoint' }],
  replaceFuse: MOVE_ACT('pull / insert'),
  rechargeGenerator: HOLD('crank'),
  lightLantern: [
    { keys: ['Space'], label: 'strike' },
    { keys: ['Space'], label: 'hold to light the wick' },
  ],
  lightsPanel: [
    { keys: ['←', '→'], label: 'choose' },
    { keys: ['Enter'], label: 'flip' },
  ],
  commsPanel: [
    { keys: ['←', '→'], label: 'tune' },
    { keys: ['⇧'], label: 'coarse' },
  ],
};

/** Footer hint for touch screens (coarse pointers), where key hints make no sense. */
export const TOUCH: Record<MiniGameKind, string> = {
  stampMail: 'Tap the stamp or the bin',
  sortClips: 'Swipe the clip left or right',
  distillReel: 'Tap or drag the reel, then pull the lever down',
  slotCartridge: 'Tap the matching slot',
  rerouteTube: 'Tap a pipe to rotate it',
  calibrateTurntable: 'Drag the pitch fader',
  sortBerries: 'Tap a bin (or drag the berry)',
  juicePress: 'Spin the crank in circles',
  alignDish: 'Drag to aim the dish',
  fuelCan: 'Press and hold',
  fuelEngine: 'Press and hold',
  fixWiring: 'Drag each wire to its match',
  swipeBadge: 'Drag the badge through the reader',
  waterPlants: 'Press and hold on a pot',
  cleanFilter: 'Drag debris off the grate',
  download: 'Tap Download',
  upload: 'Tap Upload',
  unlockManifold: 'Tap 1 to 10 in order',
  simonSays: 'Watch, then tap the same pads',
  keypadCode: 'Tap the code, then OK',
  emptyChute: 'Press and hold the lever',
  medScan: 'Tap Start, then hold still',
  primeShields: 'Tap the red hexes',
  chartCourse: 'Drag the ship through each waypoint',
  replaceFuse: 'Drag the torch, tap the dead fuse',
  rechargeGenerator: 'Hold or spin the crank',
  lightLantern: 'Swipe the match, then hold it to the wick',
  lightsPanel: 'Tap each switch that is off',
  commsPanel: 'Turn the dial or tap the arrows',
};
