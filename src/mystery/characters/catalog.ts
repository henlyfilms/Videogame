/**
 * Marion Mystery — the berry character cosmetics catalog.
 *
 * Every player is an animated berry with human-like features. This module is
 * DOM-free (it is imported by the authoritative server to sanitise lobby
 * payloads) and holds:
 *  - the item catalogs (ids, display names, per-item render params),
 *  - `defaultCosmetics`, `randomCosmetics`, `sanitizeCosmetics`,
 *  - lobby colour de-duplication (`resolveColors`),
 *  - the Marion bot looks.
 */
import type { BerryType, Cosmetics } from '../core/types';
import { mulberry32 } from '../core/rng';

export interface CatalogItem {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Berries

export type BerrySurface = 'seeds' | 'bloom' | 'drupelets' | 'glossy-drupelets' | 'smooth' | 'stripes' | 'cluster' | 'shimmer';
export type BerryTop = 'leafy' | 'crown' | 'calyx' | 'stem' | 'curl' | 'twig' | 'husk' | 'tuft' | 'nub';

export interface BerryDef extends CatalogItem {
  id: BerryType;
  /** Body height / width. */
  aspect: number;
  /** Width multiplier (1 = standard). */
  width: number;
  surface: BerrySurface;
  top: BerryTop;
  /** 0..1 how glossy the skin reads. */
  gloss: number;
  /** Drupelet / lump count around the silhouette (0 = smooth outline). */
  bumps: number;
  /** Relative size of drupelets / lumps. */
  bumpSize: number;
  /** Palette index this berry looks most "natural" in (used by randomCosmetics). */
  natural: number;
  blurb: string;
}

export const BERRIES: readonly BerryDef[] = [
  { id: 'strawberry', name: 'Strawberry', aspect: 1.08, width: 1.04, surface: 'seeds', top: 'leafy', gloss: 0.75, bumps: 0, bumpSize: 0, natural: 0, blurb: 'Seeds, swagger and a leafy top.' },
  { id: 'blueberry', name: 'Blueberry', aspect: 0.93, width: 1.02, surface: 'bloom', top: 'crown', gloss: 0.25, bumps: 0, bumpSize: 0, natural: 10, blurb: 'Dusty bloom, tiny crown, big heart.' },
  { id: 'raspberry', name: 'Raspberry', aspect: 1.1, width: 0.98, surface: 'drupelets', top: 'calyx', gloss: 0.45, bumps: 14, bumpSize: 0.16, natural: 14, blurb: 'Soft drupelets, softer soul.' },
  { id: 'blackberry', name: 'Blackberry', aspect: 1.14, width: 0.96, surface: 'glossy-drupelets', top: 'calyx', gloss: 0.95, bumps: 13, bumpSize: 0.17, natural: 13, blurb: 'Glossy, mysterious, suspicious.' },
  { id: 'marionberry', name: 'Marionberry', aspect: 1.24, width: 0.94, surface: 'glossy-drupelets', top: 'curl', gloss: 0.85, bumps: 15, bumpSize: 0.15, natural: 12, blurb: 'The signature berry. Long, proud, purple.' },
  { id: 'cranberry', name: 'Cranberry', aspect: 1.06, width: 0.94, surface: 'smooth', top: 'nub', gloss: 0.9, bumps: 0, bumpSize: 0, natural: 1, blurb: 'Tart, bouncy, freckled.' },
  { id: 'gooseberry', name: 'Gooseberry', aspect: 1.0, width: 1.0, surface: 'stripes', top: 'tuft', gloss: 0.7, bumps: 0, bumpSize: 0, natural: 6, blurb: 'Striped, translucent, slightly sour.' },
  { id: 'cherry', name: 'Cherry', aspect: 0.96, width: 1.03, surface: 'smooth', top: 'stem', gloss: 1, bumps: 0, bumpSize: 0, natural: 0, blurb: 'Shiny with a stem to twirl.' },
  { id: 'grape', name: 'Grape', aspect: 1.15, width: 0.92, surface: 'bloom', top: 'nub', gloss: 0.4, bumps: 0, bumpSize: 0, natural: 12, blurb: 'Smooth operator. Mild bloom.' },
  { id: 'elderberry', name: 'Elderberry', aspect: 1.0, width: 1.04, surface: 'cluster', top: 'twig', gloss: 0.8, bumps: 9, bumpSize: 0.3, natural: 16, blurb: 'A whole cluster of opinions.' },
  { id: 'boysenberry', name: 'Boysenberry', aspect: 1.06, width: 1.02, surface: 'drupelets', top: 'calyx', gloss: 0.55, bumps: 11, bumpSize: 0.2, natural: 13, blurb: 'Plump drupelets, plumper hugs.' },
  { id: 'goldberry', name: 'Goldberry', aspect: 1.0, width: 1.0, surface: 'shimmer', top: 'husk', gloss: 1, bumps: 0, bumpSize: 0, natural: 5, blurb: 'Rare, radiant, wrapped in a lantern husk.' },
];

export const BERRY_BY_ID: Record<BerryType, BerryDef> = Object.fromEntries(BERRIES.map((b) => [b.id, b])) as Record<BerryType, BerryDef>;

// ---------------------------------------------------------------------------
// Palette — 20 colours in family pairs (see core/match.ts colorFamily):
// red, orange, yellow, green, teal, blue, purple, pink, dark, light.
// Pair members differ strongly in lightness so they stay distinct under
// common colour-vision deficiencies; names are always shown in the UI.

export interface PaletteColor {
  name: string;
  hex: string;
  /** Darker shade (shadows, feet, outlines). */
  dark: string;
  /** Lighter tint (highlights). */
  light: string;
  family: string;
}

export const PALETTE: readonly PaletteColor[] = [
  { name: 'Scarlet', hex: '#ef4444', dark: '#a81f2a', light: '#ff8a80', family: 'red' },
  { name: 'Ruby', hex: '#9f1239', dark: '#5e0a22', light: '#d6476f', family: 'red' },
  { name: 'Tangerine', hex: '#f97316', dark: '#b4470a', light: '#ffab6b', family: 'orange' },
  { name: 'Apricot', hex: '#ffb46b', dark: '#c97a35', light: '#ffd9ae', family: 'orange' },
  { name: 'Lemon', hex: '#fde047', dark: '#c4a313', light: '#fff3a3', family: 'yellow' },
  { name: 'Honey', hex: '#e0a100', dark: '#9c6b00', light: '#ffd257', family: 'yellow' },
  { name: 'Lime', hex: '#8fd14f', dark: '#58902a', light: '#c4f08f', family: 'green' },
  { name: 'Forest', hex: '#1f8a4c', dark: '#0f552d', light: '#56c484', family: 'green' },
  { name: 'Cyan', hex: '#22c3dc', dark: '#0e7f93', light: '#8ae8f5', family: 'teal' },
  { name: 'Lagoon', hex: '#0f8a7e', dark: '#07534c', light: '#4cc2b5', family: 'teal' },
  { name: 'Cobalt', hex: '#2f6fed', dark: '#1a43a6', light: '#7ea6ff', family: 'blue' },
  { name: 'Sky', hex: '#8cc8ff', dark: '#4d8fd1', light: '#cce6ff', family: 'blue' },
  { name: 'Violet', hex: '#8b5cf6', dark: '#5a31bf', light: '#b9a0ff', family: 'purple' },
  { name: 'Plum', hex: '#5b2a86', dark: '#351550', light: '#8f5cbf', family: 'purple' },
  { name: 'Bubblegum', hex: '#ff86bf', dark: '#d4508f', light: '#ffc2de', family: 'pink' },
  { name: 'Magenta', hex: '#d946ef', dark: '#9a1fae', light: '#ef94fa', family: 'pink' },
  { name: 'Midnight', hex: '#262a3d', dark: '#10121c', light: '#4f5878', family: 'dark' },
  { name: 'Cocoa', hex: '#7b4a2e', dark: '#4c2b18', light: '#b07a55', family: 'dark' },
  { name: 'Snow', hex: '#f4f1ea', dark: '#bdb6a6', light: '#ffffff', family: 'light' },
  { name: 'Silver', hex: '#a7b0c0', dark: '#6c7487', light: '#d6dce6', family: 'light' },
];

export const PALETTE_SIZE = PALETTE.length;

export function paletteColor(index: number): PaletteColor {
  const i = Number.isFinite(index) ? Math.min(PALETTE_SIZE - 1, Math.max(0, Math.floor(index))) : 0;
  return PALETTE[i]!;
}

// ---------------------------------------------------------------------------
// Patterns

export interface PatternDef extends CatalogItem {
  /** Tint mixed in for pattern marks: 'light' | 'dark' | hex. */
  ink: 'light' | 'dark' | string;
}

export const PATTERNS: readonly PatternDef[] = [
  { id: 'plain', name: 'Plain', ink: 'light' },
  { id: 'speckle', name: 'Speckle', ink: 'light' },
  { id: 'stripes', name: 'Stripes', ink: 'light' },
  { id: 'stars', name: 'Stars', ink: '#fff6c2' },
  { id: 'freckles', name: 'Freckles', ink: 'dark' },
  { id: 'gradient', name: 'Sunset Gradient', ink: 'light' },
  { id: 'spots', name: 'Big Spots', ink: 'dark' },
  { id: 'hearts', name: 'Hearts', ink: '#ffd1e6' },
  { id: 'zigzag', name: 'Zigzag', ink: 'light' },
  { id: 'groovy', name: 'Groovy Swirl', ink: 'light' },
];

// ---------------------------------------------------------------------------
// Face

export const EYES: readonly CatalogItem[] = [
  { id: 'round', name: 'Bright Eyes' },
  { id: 'googly', name: 'Googly' },
  { id: 'sleepy', name: 'Sleepy' },
  { id: 'sparkle', name: 'Sparkle' },
  { id: 'cool', name: 'Cool Squint' },
  { id: 'happy', name: 'Happy Arcs' },
  { id: 'wink', name: 'Wink' },
  { id: 'dot', name: 'Dot Eyes' },
  { id: 'starry', name: 'Starstruck' },
  { id: 'lashes', name: 'Lashes' },
  { id: 'cyclops', name: 'Cyclops' },
  { id: 'determined', name: 'Determined' },
];

export const BROWS: readonly CatalogItem[] = [
  { id: 'none', name: 'No Brows' },
  { id: 'soft', name: 'Soft' },
  { id: 'bushy', name: 'Bushy' },
  { id: 'angry', name: 'Grumpy' },
  { id: 'worried', name: 'Worried' },
  { id: 'raised', name: 'Raised' },
  { id: 'unibrow', name: 'Unibrow' },
];

export const MOUTHS: readonly CatalogItem[] = [
  { id: 'smile', name: 'Smile' },
  { id: 'grin', name: 'Big Grin' },
  { id: 'buck', name: 'Buck Teeth' },
  { id: 'smirk', name: 'Smirk' },
  { id: 'o', name: 'O-Mouth' },
  { id: 'tongue', name: 'Blep' },
  { id: 'cat', name: 'Cat Mouth' },
  { id: 'flat', name: 'Unimpressed' },
  { id: 'fangs', name: 'Tiny Fangs' },
  { id: 'gap', name: 'Gap Tooth' },
];

// ---------------------------------------------------------------------------
// Hair

export interface HairDef extends CatalogItem {
  /** Hangs below the head and swings (spring motion). */
  long: boolean;
  /** Has volume above the head (hidden under covering hats). */
  volume: boolean;
}

export const HAIR: readonly HairDef[] = [
  { id: 'none', name: 'Bald & Bold', long: false, volume: false },
  { id: 'tuft', name: 'Tuft', long: false, volume: true },
  { id: 'long', name: 'Long & Flowing', long: true, volume: false },
  { id: 'wavy', name: 'Long Waves', long: true, volume: false },
  { id: 'ponytail', name: 'Ponytail', long: true, volume: false },
  { id: 'braids', name: 'Braids', long: true, volume: false },
  { id: 'curls', name: 'Curls', long: false, volume: true },
  { id: 'afro', name: 'Afro', long: false, volume: true },
  { id: 'mohawk', name: 'Mohawk', long: false, volume: true },
  { id: 'buns', name: 'Space Buns', long: false, volume: true },
  { id: 'bob', name: 'Bob', long: false, volume: false },
  { id: 'pigtails', name: 'Pigtails', long: true, volume: false },
  { id: 'leafy', name: 'Leafy Top', long: false, volume: true },
  { id: 'spiky', name: 'Spiky', long: false, volume: true },
  { id: 'sideswept', name: 'Side-Swept', long: false, volume: false },
  { id: 'mullet', name: 'Mullet', long: true, volume: false },
  { id: 'pompadour', name: 'Pompadour', long: false, volume: true },
  { id: 'bowl', name: 'Bowl Cut', long: false, volume: false },
  { id: 'topknot', name: 'Top Knot', long: false, volume: true },
  { id: 'fringe', name: 'Fringe', long: false, volume: false },
  { id: 'locs', name: 'Locs', long: true, volume: false },
  { id: 'emo', name: 'Emo Swoop', long: false, volume: false },
  { id: 'pixie', name: 'Pixie', long: false, volume: false },
];

export interface HairColorDef {
  name: string;
  hex: string;
}

export const HAIR_COLORS: readonly HairColorDef[] = [
  { name: 'Espresso', hex: '#3b2418' },
  { name: 'Chestnut', hex: '#7a4524' },
  { name: 'Auburn', hex: '#b5502a' },
  { name: 'Ginger', hex: '#f08a3c' },
  { name: 'Honey Blonde', hex: '#e9c26a' },
  { name: 'Platinum', hex: '#f3ead2' },
  { name: 'Jet', hex: '#1b1b24' },
  { name: 'Silver Fox', hex: '#c9ced8' },
  { name: 'Bubblegum', hex: '#ff8fc7' },
  { name: 'Ultraviolet', hex: '#8f6bff' },
  { name: 'Electric Blue', hex: '#3aa3ff' },
  { name: 'Mint', hex: '#58e0a8' },
  { name: 'Leaf Green', hex: '#3fae4b' },
  { name: 'Sunset', hex: '#ff6b5a' },
];

// ---------------------------------------------------------------------------
// Hats

export interface HatDef extends CatalogItem {
  /** Covers the top of the head: hair volume is hidden underneath. */
  covers: boolean;
  /** Animated in 2D (not cached). */
  animated?: boolean;
}

export const HATS: readonly HatDef[] = [
  { id: 'none', name: 'No Hat', covers: false },
  { id: 'beanie', name: 'Pom Beanie', covers: true },
  { id: 'cap', name: 'Ball Cap', covers: true },
  { id: 'backcap', name: 'Backwards Cap', covers: true },
  { id: 'tophat', name: 'Top Hat', covers: true },
  { id: 'crown', name: 'Crown', covers: false },
  { id: 'cowboy', name: 'Cowboy Hat', covers: true },
  { id: 'chef', name: 'Chef Toque', covers: true },
  { id: 'party', name: 'Party Hat', covers: false },
  { id: 'headphones', name: 'Headphones', covers: false },
  { id: 'halo', name: 'Halo', covers: false, animated: true },
  { id: 'flowercrown', name: 'Flower Crown', covers: false },
  { id: 'cloud', name: 'Cloud Hat', covers: true, animated: true },
  { id: 'gemcrown', name: 'Gem Crown', covers: false },
  { id: 'propeller', name: 'Propeller Cap', covers: true, animated: true },
  { id: 'deerstalker', name: 'Detective Deerstalker', covers: true },
  { id: 'wizard', name: 'Wizard Hat', covers: true },
  { id: 'bucket', name: 'Bucket Hat', covers: true },
  { id: 'beret', name: 'Beret', covers: true },
  { id: 'viking', name: 'Viking Helmet', covers: true },
  { id: 'spacehelmet', name: 'Space Helmet', covers: false },
  { id: 'sprout', name: 'Sprout', covers: false, animated: true },
  { id: 'bunny', name: 'Bunny Ears', covers: false, animated: true },
  { id: 'catears', name: 'Cat Ears', covers: false },
  { id: 'pirate', name: 'Pirate Tricorn', covers: true },
  { id: 'fez', name: 'Fez', covers: false, animated: true },
  { id: 'grad', name: 'Graduation Cap', covers: true },
  { id: 'hardhat', name: 'Hard Hat', covers: true },
  { id: 'bow', name: 'Big Bow', covers: false },
  { id: 'boppers', name: 'Alien Boppers', covers: false, animated: true },
  { id: 'mushroom', name: 'Mushroom Cap', covers: true },
  { id: 'tiara', name: 'Tiara', covers: false },
  { id: 'aviator', name: 'Aviator Cap', covers: true },
  { id: 'froghat', name: 'Frog Hat', covers: true },
  { id: 'starclip', name: 'Star Clip', covers: false, animated: true },
];

// ---------------------------------------------------------------------------
// Face accessories

export interface FaceDef extends CatalogItem {
  /** Hides the eyes completely (shades, visor…). */
  hidesEyes: boolean;
  /** Covers the mouth. */
  hidesMouth?: boolean;
}

export const FACE: readonly FaceDef[] = [
  { id: 'none', name: 'Nothing', hidesEyes: false },
  { id: 'roundglasses', name: 'Round Glasses', hidesEyes: false },
  { id: 'shades', name: 'Cool Shades', hidesEyes: true },
  { id: 'starglasses', name: 'Star Glasses', hidesEyes: true },
  { id: 'heartglasses', name: 'Heart Glasses', hidesEyes: true },
  { id: 'monocle', name: 'Monocle', hidesEyes: false },
  { id: 'visor', name: 'Cyber Visor', hidesEyes: true },
  { id: 'mask', name: 'Hero Mask', hidesEyes: false },
  { id: 'mustache', name: 'Fancy Mustache', hidesEyes: false },
  { id: 'eyepatch', name: 'Eyepatch', hidesEyes: false },
  { id: 'goggles', name: 'Lab Goggles', hidesEyes: false },
  { id: 'bandana', name: 'Bandana', hidesEyes: false, hidesMouth: true },
  { id: 'nerdglasses', name: 'Thick Frames', hidesEyes: false },
  { id: 'blush', name: 'Rosy Cheeks', hidesEyes: false },
  { id: 'bandaid', name: 'Bandage', hidesEyes: false },
  { id: '3dglasses', name: '3D Glasses', hidesEyes: true },
  { id: 'beard', name: 'Fluffy Beard', hidesEyes: false, hidesMouth: true },
  { id: 'clownnose', name: 'Honk Nose', hidesEyes: false },
  { id: 'vr', name: 'VR Headset', hidesEyes: true },
];

// ---------------------------------------------------------------------------
// Outfits

export interface OutfitDef extends CatalogItem {
  main: string;
  accent: string;
}

export const OUTFITS: readonly OutfitDef[] = [
  { id: 'none', name: 'Au Naturel', main: '#000000', accent: '#000000' },
  { id: 'tee', name: 'Comfy Tee', main: '#f2f4f8', accent: '#2f6fed' },
  { id: 'hoodie', name: 'Hoodie', main: '#3a4256', accent: '#14b8a6' },
  { id: 'suit', name: 'Suit & Tie', main: '#2b3245', accent: '#e23d4b' },
  { id: 'labcoat', name: 'Lab Coat', main: '#f7f8fb', accent: '#7ea6ff' },
  { id: 'spacesuit', name: 'Space Suit', main: '#eef1f6', accent: '#ff8a3d' },
  { id: 'scarf', name: 'Cosy Scarf', main: '#e8484f', accent: '#fff2d6' },
  { id: 'overalls', name: 'Overalls', main: '#4a78c9', accent: '#ffd257' },
  { id: 'sweater', name: 'Knit Sweater', main: '#f0a640', accent: '#fff4dc' },
  { id: 'cape', name: 'Hero Mantle', main: '#c7263a', accent: '#ffd257' },
  { id: 'apron', name: 'Apron', main: '#f6efe3', accent: '#e8484f' },
  { id: 'raincoat', name: 'Raincoat', main: '#ffd23f', accent: '#2b3245' },
  { id: 'tux', name: 'Tuxedo', main: '#1b1d27', accent: '#ffffff' },
  { id: 'varsity', name: 'Varsity Jacket', main: '#2f6fed', accent: '#f7f1e3' },
  { id: 'heartpin', name: 'Heart Pin Tee', main: '#20232e', accent: '#ff4d6d' },
  { id: 'hawaiian', name: 'Hawaiian Shirt', main: '#1fb5a6', accent: '#ffd257' },
  { id: 'vest', name: 'Sweater Vest', main: '#7a5c3e', accent: '#f2e2c4' },
  { id: 'trench', name: 'Detective Trench', main: '#b58a5a', accent: '#5a3d22' },
  { id: 'puffer', name: 'Puffer Jacket', main: '#8b5cf6', accent: '#e4dcff' },
  { id: 'jersey', name: 'Team Jersey', main: '#14b8a6', accent: '#ffffff' },
  { id: 'bowtie', name: 'Just a Bow Tie', main: '#e23d4b', accent: '#a51f2e' },
];

// ---------------------------------------------------------------------------
// Back items, pets, nameplates, emotes, victory poses

export const BACK: readonly CatalogItem[] = [
  { id: 'none', name: 'Nothing' },
  { id: 'backpack', name: 'Backpack' },
  { id: 'jetpack', name: 'Jetpack' },
  { id: 'wings', name: 'Angel Wings' },
  { id: 'fairywings', name: 'Fairy Wings' },
  { id: 'guitar', name: 'Guitar' },
  { id: 'cape', name: 'Flowing Cape' },
  { id: 'quiver', name: 'Scroll Quiver' },
  { id: 'scuba', name: 'Scuba Tank' },
  { id: 'balloon', name: 'Balloon' },
  { id: 'shell', name: 'Snail Shell' },
  { id: 'teddy', name: 'Teddy Pal' },
  { id: 'surfboard', name: 'Surfboard' },
];

export const PETS: readonly CatalogItem[] = [
  { id: 'none', name: 'No Pet' },
  { id: 'miniberry', name: 'Mini Berry' },
  { id: 'drone', name: 'Bot Drone' },
  { id: 'cat', name: 'Cat' },
  { id: 'duckling', name: 'Duckling' },
  { id: 'snail', name: 'Snail' },
  { id: 'cloud', name: 'Little Cloud' },
  { id: 'ghosty', name: 'Ghosty' },
  { id: 'robodog', name: 'Robo-Dog' },
  { id: 'frog', name: 'Frog' },
  { id: 'bee', name: 'Bee' },
  { id: 'axolotl', name: 'Axolotl' },
];

export interface NameplateDef extends CatalogItem {
  stops: string[];
  pattern: 'none' | 'stars' | 'stripes' | 'dots' | 'checker' | 'leaves' | 'waves' | 'sparkle';
  ink: string;
}

export const NAMEPLATES: readonly NameplateDef[] = [
  { id: 'classic', name: 'Classic', stops: ['#1c2233', '#262e44'], pattern: 'none', ink: '#ffffff' },
  { id: 'cobalt', name: 'Marion Cobalt', stops: ['#2f6fed', '#14b8a6'], pattern: 'none', ink: '#ffffff' },
  { id: 'sunset', name: 'Sunset', stops: ['#ff7a59', '#ff3d8b', '#8b5cf6'], pattern: 'none', ink: '#ffffff' },
  { id: 'aurora', name: 'Aurora', stops: ['#14b8a6', '#6ea1ff', '#c084fc'], pattern: 'waves', ink: '#ffffff' },
  { id: 'berryjam', name: 'Berry Jam', stops: ['#7a1446', '#d6336c'], pattern: 'dots', ink: '#fff0f6' },
  { id: 'mint', name: 'Mint Chip', stops: ['#b8f5dc', '#5ed6a8'], pattern: 'dots', ink: '#0b3b2c' },
  { id: 'galaxy', name: 'Galaxy', stops: ['#0b1030', '#3b1d6e', '#0b1030'], pattern: 'stars', ink: '#ffffff' },
  { id: 'candy', name: 'Candy Stripe', stops: ['#ff8fc7', '#ffd1e6'], pattern: 'stripes', ink: '#5a0b31' },
  { id: 'gold', name: 'Golden', stops: ['#8a5a00', '#ffd257', '#b98500'], pattern: 'sparkle', ink: '#2b1a00' },
  { id: 'neon', name: 'Neon Night', stops: ['#090b14', '#090b14'], pattern: 'none', ink: '#5cf2ff' },
  { id: 'checker', name: 'Race Day', stops: ['#20232e', '#3a3f52'], pattern: 'checker', ink: '#ffffff' },
  { id: 'leaf', name: 'Greenhouse', stops: ['#1f8a4c', '#8fd14f'], pattern: 'leaves', ink: '#ffffff' },
];

export interface EmoteDef extends CatalogItem {
  /** Short glyph shown in the emote bubble. */
  glyph: string;
  /** Loops while held (vs. a one-shot gesture). */
  loop: boolean;
}

export const EMOTES: readonly EmoteDef[] = [
  { id: 'wave', name: 'Wave', glyph: 'hi!', loop: true },
  { id: 'dance', name: 'Dance', glyph: '♪', loop: true },
  { id: 'laugh', name: 'Laugh', glyph: 'HA!', loop: true },
  { id: 'shrug', name: 'Shrug', glyph: '?', loop: false },
  { id: 'point', name: 'Point', glyph: '!', loop: false },
  { id: 'facepalm', name: 'Facepalm', glyph: '…', loop: false },
  { id: 'cheer', name: 'Cheer', glyph: '★', loop: true },
  { id: 'sit', name: 'Sit', glyph: 'zz', loop: true },
  { id: 'heart', name: 'Heart', glyph: '♥', loop: true },
  { id: 'thumbsup', name: 'Thumbs Up', glyph: '+1', loop: false },
  { id: 'cry', name: 'Cry', glyph: 'T_T', loop: true },
  { id: 'think', name: 'Hmm', glyph: '?!', loop: true },
];

export const VICTORY: readonly CatalogItem[] = [
  { id: 'flex', name: 'Flex' },
  { id: 'spin', name: 'Victory Spin' },
  { id: 'jump', name: 'Jump for Joy' },
  { id: 'bow', name: 'Gracious Bow' },
  { id: 'confetti', name: 'Confetti Pop' },
  { id: 'moonwalk', name: 'Moonwalk' },
];

export const MAX_EMOTES = 8;

// ---------------------------------------------------------------------------
// Lookup sets

const ids = (list: readonly CatalogItem[]): Set<string> => new Set(list.map((i) => i.id));
export const ITEM_IDS = {
  berry: ids(BERRIES),
  pattern: ids(PATTERNS),
  eyes: ids(EYES),
  brows: ids(BROWS),
  mouth: ids(MOUTHS),
  hair: ids(HAIR),
  hat: ids(HATS),
  face: ids(FACE),
  outfit: ids(OUTFITS),
  back: ids(BACK),
  pet: ids(PETS),
  nameplate: ids(NAMEPLATES),
  emotes: ids(EMOTES),
  victory: ids(VICTORY),
} as const;

const byId = <T extends CatalogItem>(list: readonly T[]): Map<string, T> => new Map(list.map((i) => [i.id, i]));
export const HAIR_BY_ID = byId(HAIR);
export const HAT_BY_ID = byId(HATS);
export const FACE_BY_ID = byId(FACE);
export const OUTFIT_BY_ID = byId(OUTFITS);
export const NAMEPLATE_BY_ID = byId(NAMEPLATES);
export const EMOTE_BY_ID = byId(EMOTES);
export const PATTERN_BY_ID = byId(PATTERNS);

// ---------------------------------------------------------------------------
// Defaults / random / sanitize

export const DEFAULT_EMOTES: readonly string[] = ['wave', 'dance', 'laugh', 'shrug', 'point', 'facepalm', 'cheer', 'heart'];

export function defaultCosmetics(): Cosmetics {
  return {
    berry: 'strawberry',
    color: 0,
    pattern: 'plain',
    eyes: 'round',
    brows: 'soft',
    mouth: 'smile',
    hair: 'tuft',
    hairColor: '#3b2418',
    hat: 'none',
    face: 'none',
    outfit: 'none',
    back: 'none',
    pet: 'none',
    nameplate: 'classic',
    emotes: [...DEFAULT_EMOTES],
    victory: 'flex',
  };
}

const HEX_RE = /^#[0-9a-f]{6}$/;

function pickId(set: Set<string>, v: unknown, fallback: string): string {
  return typeof v === 'string' && set.has(v) ? v : fallback;
}

/**
 * Server-safe normaliser: accepts anything (including null, arrays, hostile
 * payloads) and returns a valid `Cosmetics`. Idempotent.
 */
export function sanitizeCosmetics(raw: unknown): Cosmetics {
  const d = defaultCosmetics();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const r = raw as Record<string, unknown>;
  let color = d.color;
  if (typeof r.color === 'number' && Number.isFinite(r.color)) color = Math.min(PALETTE_SIZE - 1, Math.max(0, Math.round(r.color)));
  let hairColor = d.hairColor;
  if (typeof r.hairColor === 'string' && r.hairColor.length <= 7) {
    const h = r.hairColor.toLowerCase();
    if (HEX_RE.test(h)) hairColor = h;
  }
  let emotes = d.emotes;
  if (Array.isArray(r.emotes)) {
    const out: string[] = [];
    const lim = Math.min(r.emotes.length, 64);
    for (let i = 0; i < lim && out.length < MAX_EMOTES; i++) {
      const e: unknown = r.emotes[i];
      if (typeof e === 'string' && ITEM_IDS.emotes.has(e) && !out.includes(e)) out.push(e);
    }
    if (out.length > 0) emotes = out;
  }
  return {
    berry: pickId(ITEM_IDS.berry, r.berry, d.berry) as Cosmetics['berry'],
    color,
    pattern: pickId(ITEM_IDS.pattern, r.pattern, d.pattern),
    eyes: pickId(ITEM_IDS.eyes, r.eyes, d.eyes),
    brows: pickId(ITEM_IDS.brows, r.brows, d.brows),
    mouth: pickId(ITEM_IDS.mouth, r.mouth, d.mouth),
    hair: pickId(ITEM_IDS.hair, r.hair, d.hair),
    hairColor,
    hat: pickId(ITEM_IDS.hat, r.hat, d.hat),
    face: pickId(ITEM_IDS.face, r.face, d.face),
    outfit: pickId(ITEM_IDS.outfit, r.outfit, d.outfit),
    back: pickId(ITEM_IDS.back, r.back, d.back),
    pet: pickId(ITEM_IDS.pet, r.pet, d.pet),
    nameplate: pickId(ITEM_IDS.nameplate, r.nameplate, d.nameplate),
    emotes,
    victory: pickId(ITEM_IDS.victory, r.victory, d.victory),
  };
}

/** Stable string key for caches (everything that affects rendering). */
export function cosmeticsKey(c: Cosmetics): string {
  return [c.berry, c.color, c.pattern, c.eyes, c.brows, c.mouth, c.hair, c.hairColor, c.hat, c.face, c.outfit, c.back].join('|');
}

/** Styles that clash (eyes hidden by an accessory that also wants big eyes, etc.). */
const FACE_FRIENDLY_EYES: Record<string, string[]> = {
  monocle: ['round', 'cool', 'determined', 'sparkle'],
  eyepatch: ['round', 'determined', 'cool', 'sparkle', 'lashes'],
  roundglasses: ['round', 'sparkle', 'sleepy', 'dot', 'lashes', 'googly', 'happy'],
  nerdglasses: ['round', 'googly', 'sparkle', 'dot', 'starry'],
  goggles: ['round', 'googly', 'determined', 'sparkle'],
  mask: ['round', 'determined', 'cool', 'sparkle'],
};

/** Moods: eyes, brows and mouths that read well together. */
const MOODS: { eyes: string[]; brows: string[]; mouth: string[] }[] = [
  { eyes: ['googly'], brows: ['raised', 'bushy', 'none', 'worried'], mouth: ['buck', 'tongue', 'grin', 'o', 'gap'] },
  { eyes: ['cool', 'determined'], brows: ['angry', 'soft', 'none', 'bushy'], mouth: ['smirk', 'flat', 'grin', 'fangs'] },
  { eyes: ['round', 'lashes', 'sparkle'], brows: ['soft', 'raised', 'none'], mouth: ['smile', 'grin', 'cat', 'o', 'tongue'] },
  { eyes: ['happy', 'wink'], brows: ['soft', 'raised'], mouth: ['grin', 'smile', 'tongue', 'cat'] },
  { eyes: ['sleepy'], brows: ['soft', 'none', 'worried'], mouth: ['flat', 'o', 'smile', 'smirk'] },
  { eyes: ['starry', 'sparkle'], brows: ['raised', 'soft'], mouth: ['grin', 'o', 'smile'] },
  { eyes: ['dot'], brows: ['none', 'soft', 'unibrow'], mouth: ['smile', 'cat', 'o', 'buck'] },
  { eyes: ['cyclops'], brows: ['unibrow', 'raised', 'none'], mouth: ['grin', 'fangs', 'o', 'buck'] },
];

/** Hair colours that look good with each palette family. */
const HAIR_FOR_FAMILY: Record<string, string[]> = {
  red: ['#3b2418', '#1b1b24', '#e9c26a', '#f3ead2', '#58e0a8', '#3fae4b'],
  orange: ['#3b2418', '#1b1b24', '#7a4524', '#3aa3ff', '#f3ead2', '#8f6bff'],
  yellow: ['#3b2418', '#b5502a', '#1b1b24', '#ff8fc7', '#8f6bff', '#3aa3ff'],
  green: ['#3b2418', '#e9c26a', '#1b1b24', '#ff6b5a', '#ff8fc7', '#7a4524'],
  teal: ['#1b1b24', '#f3ead2', '#ff8fc7', '#3b2418', '#f08a3c', '#e9c26a'],
  blue: ['#e9c26a', '#1b1b24', '#f3ead2', '#f08a3c', '#ff8fc7', '#3b2418'],
  purple: ['#f3ead2', '#e9c26a', '#1b1b24', '#58e0a8', '#ff8fc7', '#f08a3c'],
  pink: ['#3b2418', '#1b1b24', '#f3ead2', '#8f6bff', '#3aa3ff', '#e9c26a'],
  dark: ['#f3ead2', '#c9ced8', '#ff8fc7', '#58e0a8', '#e9c26a', '#3aa3ff'],
  light: ['#3b2418', '#1b1b24', '#7a4524', '#ff8fc7', '#8f6bff', '#b5502a'],
};

/** Deterministic, always-attractive random look for `seed`. */
export function randomCosmetics(seed: number): Cosmetics {
  const r = mulberry32((seed * 2654435761) ^ 0x5bd1e995);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
  const chance = (p: number): boolean => r() < p;

  const berry = pick(BERRIES);
  const color = chance(0.35) ? berry.natural : Math.floor(r() * PALETTE_SIZE);
  const family = PALETTE[color]!.family;
  const mood = pick(MOODS);
  let eyes = pick(mood.eyes);
  const brows = pick(mood.brows);
  const mouth = pick(mood.mouth);

  // Accessory budget keeps silhouettes readable (max ~3 big items).
  let budget = 3;
  let hat = 'none';
  if (chance(0.62)) {
    hat = pick(HATS.slice(1)).id;
    budget--;
  }
  const hatDef = HAT_BY_ID.get(hat)!;
  let hair = 'none';
  if (chance(0.85)) {
    const pool = HAIR.slice(1).filter((h) => !(hatDef.covers && h.volume));
    hair = pick(pool).id;
  }
  if (berry.top === 'leafy' && hair === 'leafy') hair = 'tuft';
  const hairColor = pick(HAIR_FOR_FAMILY[family] ?? HAIR_FOR_FAMILY.red!);

  let face = 'none';
  if (budget > 0 && chance(0.4)) {
    face = pick(FACE.slice(1)).id;
    if (hat === 'spacehelmet' && (face === 'vr' || face === 'goggles')) face = 'none';
    if (face !== 'none') budget--;
  }
  const friendly = FACE_FRIENDLY_EYES[face];
  if (friendly && !friendly.includes(eyes)) eyes = pick(friendly);
  const faceDef = FACE_BY_ID.get(face)!;
  let mouthOut = mouth;
  if (faceDef.hidesEyes && (mouth === 'flat' || mouth === 'o')) mouthOut = 'smirk';

  let outfit = 'none';
  if (chance(0.68)) outfit = pick(OUTFITS.slice(1)).id;
  let back = 'none';
  if (budget > 0 && chance(0.35)) {
    back = pick(BACK.slice(1)).id;
    if (outfit === 'cape' && back === 'cape') back = 'backpack';
    budget--;
  }
  const pet = chance(0.45) ? pick(PETS.slice(1)).id : 'none';
  const pattern = chance(0.55) ? 'plain' : pick(PATTERNS.slice(1)).id;

  const emotePool = EMOTES.map((e) => e.id);
  for (let i = emotePool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = emotePool[i]!;
    emotePool[i] = emotePool[j]!;
    emotePool[j] = t;
  }

  return sanitizeCosmetics({
    berry: berry.id,
    color,
    pattern,
    eyes,
    brows,
    mouth: mouthOut,
    hair,
    hairColor,
    hat,
    face,
    outfit,
    back,
    pet,
    nameplate: pick(NAMEPLATES).id,
    emotes: emotePool.slice(0, MAX_EMOTES),
    victory: pick(VICTORY).id,
  });
}

// ---------------------------------------------------------------------------
// Lobby colours

/**
 * First player (in array order) keeps their colour; later duplicates move to
 * the nearest free palette index (same-family partner first, then by index
 * distance). With more than 20 players colours necessarily repeat.
 */
export function resolveColors(players: { id: string; color: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const p of players) {
    const want = Number.isFinite(p.color) ? Math.min(PALETTE_SIZE - 1, Math.max(0, Math.round(p.color))) : 0;
    let got = want;
    if (used.has(want)) {
      got = -1;
      const partner = want ^ 1;
      if (!used.has(partner)) got = partner;
      for (let d = 1; got < 0 && d < PALETTE_SIZE; d++) {
        for (const c of [want + d, want - d]) {
          if (c >= 0 && c < PALETTE_SIZE && !used.has(c)) {
            got = c;
            break;
          }
        }
      }
      if (got < 0) got = want; // palette exhausted
    }
    used.add(got);
    out[p.id] = got;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Marion bots as berries

export type MarionBotId = 'daniel' | 'moose' | 'kanye' | 'barry' | 'greek' | 'quill' | 'sift' | 'builder';

const look = (c: Partial<Cosmetics>): Cosmetics => sanitizeCosmetics({ ...defaultCosmetics(), ...c });

export const MARION_BOT_LOOKS: Record<MarionBotId, Cosmetics> = {
  // Chief Executor — white, funky, groovy afro and shades.
  daniel: look({ berry: 'gooseberry', color: 18, pattern: 'groovy', eyes: 'cool', brows: 'soft', mouth: 'grin', hair: 'afro', hairColor: '#1b1b24', hat: 'none', face: 'shades', outfit: 'suit', back: 'none', pet: 'drone', nameplate: 'gold', victory: 'moonwalk' }),
  // Co-Pilot — the signature marionberry in violet, aviator cap & scarf.
  moose: look({ berry: 'marionberry', color: 12, pattern: 'plain', eyes: 'determined', brows: 'bushy', mouth: 'smile', hair: 'sideswept', hairColor: '#7a4524', hat: 'aviator', face: 'none', outfit: 'scarf', back: 'jetpack', pet: 'duckling', nameplate: 'cobalt', victory: 'jump' }),
  // Marion Agent — red strawberry with a heart pin and heart glasses.
  kanye: look({ berry: 'strawberry', color: 0, pattern: 'hearts', eyes: 'cool', brows: 'angry', mouth: 'smirk', hair: 'locs', hairColor: '#1b1b24', hat: 'none', face: 'heartglasses', outfit: 'heartpin', back: 'none', pet: 'cat', nameplate: 'berryjam', victory: 'flex' }),
  // Marion Life — midnight blackberry wearing a gem crown, calm and sparkly.
  barry: look({ berry: 'blackberry', color: 16, pattern: 'stars', eyes: 'sparkle', brows: 'soft', mouth: 'smile', hair: 'none', hairColor: '#c9ced8', hat: 'gemcrown', face: 'none', outfit: 'tux', back: 'none', pet: 'ghosty', nameplate: 'galaxy', victory: 'bow' }),
  // Marion Engine — magenta raspberry with star glasses and a star clip.
  greek: look({ berry: 'raspberry', color: 15, pattern: 'stars', eyes: 'starry', brows: 'raised', mouth: 'grin', hair: 'spiky', hairColor: '#e9c26a', hat: 'starclip', face: 'starglasses', outfit: 'jersey', back: 'none', pet: 'bee', nameplate: 'sunset', victory: 'spin' }),
  // Email — cobalt blueberry with round glasses, a beret and a scroll quiver.
  quill: look({ berry: 'blueberry', color: 10, pattern: 'plain', eyes: 'round', brows: 'raised', mouth: 'cat', hair: 'bob', hairColor: '#3b2418', hat: 'beret', face: 'roundglasses', outfit: 'sweater', back: 'quiver', pet: 'snail', nameplate: 'classic', victory: 'bow' }),
  // Sift Dev — cyan blueberry dev with headphones, hoodie and a visor.
  sift: look({ berry: 'blueberry', color: 8, pattern: 'speckle', eyes: 'googly', brows: 'worried', mouth: 'buck', hair: 'curls', hairColor: '#f3ead2', hat: 'headphones', face: 'none', outfit: 'hoodie', back: 'backpack', pet: 'robodog', nameplate: 'neon', victory: 'confetti' }),
  // Foundry — orange builder berry under a cloud hat, overalls and toolkit.
  builder: look({ berry: 'boysenberry', color: 2, pattern: 'freckles', eyes: 'happy', brows: 'bushy', mouth: 'gap', hair: 'mullet', hairColor: '#b5502a', hat: 'cloud', face: 'goggles', outfit: 'overalls', back: 'backpack', pet: 'miniberry', nameplate: 'checker', victory: 'confetti' }),
};
