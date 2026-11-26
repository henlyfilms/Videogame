/**
 * Hollowberry Manor — a grand old orchard mansion, built for Lights Out.
 * The house is two rows of rooms either side of the Gallery Corridor, with
 * the Grand Foyer at its heart and narrow servants' passages down both
 * flanks. Below the Lower Hall lie the cellar and crypt, the berry orchard,
 * a three-ring hedge maze, the carriage house and the rose garden.
 * Lighting is deliberately sparse and warm; bookshelves, statues, pillars,
 * trees and hedges break sightlines everywhere.
 */
import { MapBuilder } from './builder';

const b = new MapBuilder();
const CANDLE = '#fbbf24';
const MOON = '#a5b4fc';

// --- Rooms -----------------------------------------------------------------
// North range
b.room('attic', 'Dusty Attic', [6, 4, 24, 18], 'wood', '#a8a29e', { cold: true });
b.room('servants', "Servants' Quarters", [34, 6, 18, 16], 'wood', '#78716c');
b.room('kitchen', 'Kitchen', [56, 5, 22, 18], 'tile', '#d97706');
b.room('dining', 'Dining Hall', [82, 5, 28, 18], 'carpet', '#991b1b');
b.room('gallery', 'Portrait Gallery', [114, 6, 30, 16], 'wood', '#b08d57');
// Main floor
b.room('library', 'Library', [6, 33, 24, 24], 'carpet', '#7c2d12');
b.room('study', 'Study', [34, 36, 14, 14], 'rug', '#14532d');
b.room('foyer', 'Grand Foyer', [52, 33, 30, 26], 'checker', '#7f1d1d');
b.room('ballroom', 'Ballroom', [86, 33, 28, 26], 'wood', '#c084fc');
b.room('conservatory', 'Conservatory', [118, 33, 26, 22], 'tile', '#4d7c0f');
// Below stairs and the grounds
b.room('cellar', 'Wine Cellar', [6, 70, 22, 14], 'stone', '#581c87', { cold: true });
b.room('crypt', 'Family Crypt', [6, 88, 22, 12], 'stone', '#334155', { cold: true });
b.room('orchard', 'Berry Orchard', [32, 70, 32, 30], 'grass', '#65a30d', { outdoor: true, cold: true });
b.room('maze', 'Hedge Maze', [68, 70, 40, 30], 'grass', '#166534', { outdoor: true, cold: true });
b.room('stables', 'Carriage House', [112, 70, 32, 14], 'wood', '#92400e', { cold: true });
b.room('roses', 'Rose Garden', [112, 88, 32, 12], 'grass', '#e11d48', { outdoor: true, cold: true });
// Moody lighting: drop the automatic room lights, place a few warm ones.
b.lamps.length = 0;

// --- Corridors ---------------------------------------------------------------
b.hall([6, 26, 138, 4], 'carpet'); // Gallery Corridor (upper hall)
b.hall([6, 62, 138, 4], 'stone'); // Lower Hall
b.hall([31, 30, 2, 32], 'wood'); // west servants' passage
b.hall([115, 30, 2, 32], 'wood'); // east servants' passage

// North range doors + links
b.door('attic', [16, 22, 3, 4]);
b.door('servants', [41, 22, 3, 4]);
b.door('kitchen', [64, 23, 3, 3]);
b.door('dining', [94, 23, 3, 3], 'Dining Hall');
b.door('gallery', [126, 22, 3, 4]).door('gallery', [138, 22, 3, 4]);
b.hall([30, 12, 4, 3], 'wood'); // attic <-> servants
b.door('kitchen', [52, 12, 4, 3]); // servants <-> kitchen
b.hall([78, 12, 4, 3], 'tile'); // kitchen <-> dining (butler's pass)
b.hall([110, 12, 4, 3], 'carpet'); // dining <-> gallery
// Main floor doors + links
b.door('library', [16, 30, 3, 3]).door('library', [16, 57, 3, 5], 'Library');
b.door('study', [39, 30, 3, 6]).door('study', [39, 50, 3, 12]);
b.door('foyer', [65, 30, 4, 3], 'Foyer North').door('foyer', [65, 59, 4, 3], 'Grand Entrance');
b.door('ballroom', [98, 30, 4, 3]).door('ballroom', [98, 59, 4, 3]);
b.door('ballroom', [82, 44, 4, 4], 'Ballroom');
b.door('conservatory', [128, 30, 3, 3]).door('conservatory', [128, 55, 3, 7]);
b.hall([30, 42, 4, 3], 'wood'); // library <-> passage <-> study
b.hall([48, 42, 4, 3], 'checker'); // study <-> foyer
b.hall([114, 42, 4, 3], 'wood'); // ballroom <-> passage <-> conservatory
// Grounds doors + links
b.door('cellar', [15, 66, 3, 4], 'Cellar Stairs');
b.door('crypt', [15, 84, 3, 4]);
b.hall([28, 76, 4, 3], 'stone'); // cellar <-> orchard (coal chute)
b.door('crypt', [28, 92, 4, 3]); // crypt <-> orchard
b.door('orchard', [40, 66, 3, 4]).door('orchard', [56, 66, 3, 4]);
b.hall([64, 90, 4, 3], 'grass'); // orchard <-> maze
b.door('maze', [86, 66, 4, 4]);
b.hall([108, 76, 4, 3], 'grass'); // maze <-> carriage house
b.hall([108, 92, 4, 3], 'grass'); // maze <-> rose garden
b.door('stables', [126, 66, 3, 4]);
b.door('roses', [126, 84, 3, 4]);

// --- Props -----------------------------------------------------------------
// Attic
b.prop('shelf', 12, 5.5, { w: 4, h: 1, color: '#78716c' });
b.prop('statue', 26.5, 6.5, { label: 'DRESS FORM', color: '#e7e5e4' });
b.prop('bed', 25, 18.5, { w: 2, h: 3, color: '#a8a29e' });
b.prop('locker', 8.5, 19.5, { label: 'WARDROBE', color: '#57534e' });
b.prop('telescope', 22, 6, { w: 2, h: 2 });
// Servants' quarters
b.prop('bed', 36, 8.5, { w: 2, h: 3 }).prop('bed', 49, 8.5, { w: 2, h: 3 });
b.prop('locker', 39.5, 6.5, { color: '#44403c' }).prop('locker', 45.5, 6.5, { color: '#44403c' });
b.prop('table', 42, 17.5, { w: 4, h: 1 });
// Kitchen
b.prop('fireplace', 66, 5.5, { w: 4, h: 1, label: 'HEARTH' });
b.prop('stove', 59.5, 5.5, { w: 3, h: 1 });
b.prop('counter', 72, 5.5, { w: 6, h: 1 });
b.prop('table', 66, 10, { w: 6, h: 2, color: '#a16207' });
b.prop('fridge', 76.5, 19.5, { label: 'ICEBOX' });
b.prop('shelf', 71, 21.5, { w: 4, h: 1, label: 'PANTRY' });
// Dining hall
b.prop('table', 96, 10, { w: 14, h: 2, color: '#7f1d1d' });
b.prop('fireplace', 96, 5.5, { w: 4, h: 1 });
b.prop('statue', 83.5, 6.5, { label: 'ARMOUR' }).prop('statue', 108.5, 6.5, { label: 'ARMOUR' });
b.prop('counter', 86, 20.5, { w: 4, h: 1, label: 'SIDEBOARD' });
// Portrait gallery: busts zig-zag down the room
b.prop('statue', 120.5, 9.5, { label: 'BUST' }).prop('statue', 126.5, 17.5, { label: 'BUST' });
b.prop('statue', 132.5, 9.5, { label: 'BUST' }).prop('pillar', 138.5, 15.5);
b.prop('poster', 120, 6.2, { w: 3, h: 0.2, solid: false, label: 'LADY HOLLOWBERRY' });
b.prop('poster', 130, 6.2, { w: 3, h: 0.2, solid: false, label: 'THE COLONEL' });
b.prop('poster', 140, 6.2, { w: 3, h: 0.2, solid: false, label: 'THE BARONESS' });
// Library: bookshelf stacks
b.prop('bookshelf', 10, 37.5, { w: 6, h: 1 }).prop('bookshelf', 10, 42.5, { w: 6, h: 1 });
b.prop('bookshelf', 10, 47.5, { w: 6, h: 1 }).prop('bookshelf', 10, 52.5, { w: 6, h: 1 });
b.prop('bookshelf', 25, 37.5, { w: 6, h: 1 }).prop('bookshelf', 25, 48.5, { w: 6, h: 1 }).prop('bookshelf', 25, 52.5, { w: 6, h: 1 });
b.prop('fireplace', 28.5, 54, { w: 1, h: 2 });
b.prop('rug', 18, 45, { w: 6, h: 6, solid: false, color: '#7c2d12' });
// Study
b.prop('desk', 43.5, 39.5, { w: 3, h: 1 });
b.prop('chair', 43.5, 41);
b.prop('bookshelf', 35.5, 38.5, { w: 1, h: 3 }).prop('bookshelf', 46.5, 47, { w: 1, h: 2 });
b.prop('fireplace', 36, 48.5, { w: 2, h: 1 });
// Grand foyer (meeting)
b.prop('roundTable', 67, 46, { w: 2, h: 2, color: '#451a03' });
b.prop('rug', 67, 46, { w: 12, h: 10, solid: false, color: '#7f1d1d' });
b.prop('pillar', 56.5, 37.5).prop('pillar', 77.5, 37.5).prop('pillar', 56.5, 54.5).prop('pillar', 77.5, 54.5);
b.prop('statue', 55.5, 49.5, { label: 'FOUNDER' });
b.prop('poster', 67, 33.2, { w: 6, h: 0.2, solid: false, label: 'HOLLOWBERRY MANOR 1789' });
// Ballroom
b.prop('piano', 92.5, 37, { w: 3, h: 2, color: '#0c0a09' });
b.prop('pillar', 93.5, 41.5).prop('pillar', 106.5, 41.5).prop('pillar', 93.5, 51.5).prop('pillar', 106.5, 51.5);
b.prop('rug', 100, 46, { w: 10, h: 8, solid: false, color: '#6b21a8' });
b.prop('turntable', 110, 36, { w: 1.5, h: 1.5 });
b.prop('sofa', 110, 56.5, { w: 4, h: 1 });
b.prop('statue', 111.5, 49.5, { label: 'DANCER' });
// Conservatory
b.prop('tree', 122, 37, { w: 2, h: 2, label: 'LEMON' }).prop('tree', 140, 37, { w: 2, h: 2, label: 'FIG' });
b.prop('tree', 122, 51, { w: 2, h: 2 }).prop('tree', 140, 51, { w: 2, h: 2 });
b.prop('fountain', 135, 44, { w: 2, h: 2 });
b.prop('planter', 135, 38.5, { w: 4, h: 1, color: '#be123c' });
b.prop('window', 131, 33.2, { w: 20, h: 0.3, solid: false });
// Wine cellar: racks
b.prop('shelf', 10, 73.5, { w: 6, h: 1, label: 'WINE RACK', color: '#3b0764' }).prop('shelf', 23, 73.5, { w: 6, h: 1, color: '#3b0764' });
b.prop('shelf', 10, 79.5, { w: 6, h: 1, color: '#3b0764' }).prop('shelf', 23, 80.5, { w: 6, h: 1, color: '#3b0764' });
b.prop('barrel', 26.5, 71.5, { label: '1789' }).prop('barrel', 7.5, 82.5);
// Family crypt
b.prop('statue', 9.5, 90.5, { label: 'WEEPING ANGEL', color: '#cbd5e1' }).prop('statue', 24.5, 90.5, { color: '#cbd5e1' });
b.prop('table', 12, 96, { w: 4, h: 2, label: 'SARCOPHAGUS', color: '#57534e' }).prop('table', 22, 96, { w: 4, h: 2, color: '#57534e' });
b.prop('pillar', 12.5, 92.5).prop('pillar', 21.5, 92.5);
// Berry orchard
for (const [x, y] of [
  [36, 74],
  [48, 74],
  [60, 76],
  [40, 82],
  [52, 82],
  [36, 88],
  [46, 90],
  [58, 86],
  [40, 97],
  [54, 96],
] as const)
  b.prop('tree', x, y, { w: 2, h: 2, color: '#3f6212' });
b.prop('cart', 61, 97.5, { w: 2, h: 1, label: 'BERRY CART' });
// Hedge maze: three hedge rings with offset gaps (several routes to the centre)
const hedgeH = (y: number, x0: number, x1: number) => b.prop('hedge', (x0 + x1 + 1) / 2, y + 0.5, { w: x1 - x0 + 1, h: 1 });
const hedgeV = (x: number, y0: number, y1: number) => b.prop('hedge', x + 0.5, (y0 + y1 + 1) / 2, { w: 1, h: y1 - y0 + 1 });
// Ring 1 (gaps: top-left, right, bottom-right)
hedgeH(73, 71, 75);
hedgeH(73, 79, 104);
hedgeH(96, 71, 95);
hedgeH(96, 99, 104);
hedgeV(71, 74, 95);
hedgeV(104, 74, 83);
hedgeV(104, 87, 95);
// Ring 2 (gaps: top-right, left, bottom-left)
hedgeH(77, 75, 91);
hedgeH(77, 95, 100);
hedgeH(92, 75, 79);
hedgeH(92, 83, 100);
hedgeV(75, 78, 83);
hedgeV(75, 87, 91);
hedgeV(100, 78, 91);
// Ring 3 (gaps: top, bottom)
hedgeH(81, 79, 82);
hedgeH(81, 86, 96);
hedgeH(88, 79, 88);
hedgeH(88, 92, 96);
hedgeV(79, 82, 87);
hedgeV(96, 82, 87);
b.prop('fountain', 88, 85, { w: 2, h: 2, label: 'WISHING WELL' });
// Carriage house
b.prop('cart', 118, 74, { w: 4, h: 2, label: 'CARRIAGE', color: '#1c1917' });
b.prop('engine', 134.5, 78.5, { w: 5, h: 3, label: 'MOTOR CAR', color: '#14532d' });
b.prop('generator', 140.5, 72, { w: 3, h: 2 });
b.prop('locker', 113.5, 82.5, { label: 'TACK' });
b.prop('crate', 121.5, 82.5, { label: 'HAY' });
// Rose garden
b.prop('planter', 118, 91.5, { w: 4, h: 1, color: '#e11d48' }).prop('planter', 136, 91.5, { w: 4, h: 1, color: '#e11d48' });
b.prop('fountain', 128, 95, { w: 2, h: 2 });
b.prop('statue', 138.5, 96.5, { label: 'CUPID', color: '#f1f5f9' });
b.prop('tree', 142, 90, { w: 2, h: 2, color: '#14532d' });
// Halls
b.prop('rug', 75, 27.5, { w: 60, h: 2, solid: false, color: '#7f1d1d' });
b.prop('poster', 50, 26.2, { w: 3, h: 0.2, solid: false, label: 'GREAT-UNCLE BRAMBLE' });
b.prop('poster', 110, 26.2, { w: 3, h: 0.2, solid: false, label: 'COUSIN JUNIPER' });
b.prop('clock', 82, 65.6, { solid: false, label: 'GRANDFATHER' });

// Warm, sparse lighting (lamps drive Lights Out visibility)
b.lamp(67, 46, 12, CANDLE); // foyer chandelier
b.lamp(96, 40, 8, CANDLE).lamp(104, 52, 8, CANDLE); // ballroom chandeliers
b.lamp(27, 54, 6, '#f97316'); // library fire
b.lamp(66, 7, 7, '#f97316'); // kitchen hearth
b.lamp(96, 11, 7, CANDLE); // dining candelabra
b.lamp(43, 41, 4, CANDLE); // study desk lamp
b.lamp(118, 12, 4, CANDLE).lamp(142, 12, 4, CANDLE); // gallery sconces
b.lamp(42, 13, 4, CANDLE); // servants' candle
b.lamp(17, 6, 4, MOON); // attic skylight
b.lamp(131, 36, 7, MOON); // conservatory moonlight
b.lamp(48, 86, 9, MOON); // orchard moonlight
b.lamp(88, 85, 4, CANDLE); // maze centre lantern
b.lamp(127, 77, 5, CANDLE); // carriage house
b.lamp(128, 94, 6, MOON); // rose garden
b.lamp(17, 77, 3, CANDLE); // cellar candle
b.lamp(17, 95, 3, '#a3e635'); // crypt witch-light
b.lamp(32, 28, 3, CANDLE).lamp(116, 28, 3, CANDLE).lamp(67, 64, 3, CANDLE); // hall sconces

// --- Stations --------------------------------------------------------------
b.st('emergency', 67, 46, 'foyer');
b.st('admin', 41, 39, 'study');
b.st('upload', 45.5, 41, 'study');
b.st('cams', 42, 15.4, 'servants');
b.st('vitals', 130, 16, 'gallery');
b.st('doorlog', 142.5, 75, 'stables');
b.st('lightsPanel', 26.5, 77, 'cellar');
b.st('commsPanel', 21, 41, 'library');
b.st('meltdownA', 57, 12, 'kitchen').st('meltdownB', 50.5, 16, 'servants');
b.st('pressureA', 7, 34.5, 'library').st('pressureB', 142.5, 44, 'conservatory');
b.st('recharge', 28.5, 12, 'attic').st('recharge', 112.5, 38, 'ballroom').st('recharge', 33, 98.5, 'orchard').st('recharge', 142.5, 98.5, 'roses');
// Tasks
b.st('alignDish', 22, 8.4, 'attic');
b.st('replaceFuse', 7, 15, 'attic').st('replaceFuse', 18, 82.5, 'cellar').st('replaceFuse', 143, 20.5, 'gallery');
b.st('fixWiring', 27, 15, 'attic').st('fixWiring', 115, 20.5, 'gallery').st('fixWiring', 7, 56, 'library').st('fixWiring', 143, 80.5, 'stables').st('fixWiring', 27, 98.5, 'crypt');
b.st('download', 115, 7.5, 'gallery').st('download', 13.5, 45, 'library').st('download', 7, 5.5, 'attic').st('download', 120, 80.5, 'stables');
b.st('stampMail', 42, 19, 'servants').st('stampMail', 46.5, 43, 'study');
b.st('swipeBadge', 35, 20.5, 'servants');
b.st('emptyChute', 50.5, 7, 'servants');
b.st('juicePress', 72, 7, 'kitchen');
b.st('rerouteTube', 76.5, 15, 'kitchen').st('rerouteTube', 142.5, 52.5, 'conservatory').st('rerouteTube', 7, 71, 'cellar').st('rerouteTube', 113, 71, 'stables');
b.st('medScan', 96, 16, 'dining');
b.st('primeShields', 96, 6.8, 'dining');
b.st('sortClips', 136, 10, 'gallery');
b.st('keypadCode', 37, 43, 'study').st('keypadCode', 143, 9, 'gallery');
b.st('chartCourse', 18, 35, 'library');
b.st('simonSays', 92.5, 38.6, 'ballroom');
b.st('calibrateTurntable', 110, 37.6, 'ballroom');
b.st('slotCartridge', 87, 35, 'ballroom');
b.st('sortBerries', 38, 74, 'orchard').st('sortBerries', 56.6, 86, 'orchard').st('sortBerries', 122, 39, 'conservatory');
b.st('waterPlants', 135, 40, 'conservatory').st('waterPlants', 118, 93, 'roses').st('waterPlants', 69, 98.5, 'maze');
b.st('cleanFilter', 130, 95, 'roses');
b.st('distillReel', 13, 74.8, 'cellar');
b.st('fuelCan', 7.5, 78.5, 'cellar');
b.st('unlockManifold', 23, 82, 'cellar');
b.st('fuelEngine', 134.5, 76.4, 'stables');
b.st('rechargeGenerator', 140.5, 74.6, 'stables');
b.st('lightLantern', 91, 83, 'maze').st('lightLantern', 17, 98.5, 'crypt').st('lightLantern', 62.5, 71, 'orchard');
b.st('lightLantern', 28.5, 34, 'library').st('lightLantern', 143, 71, 'stables').st('lightLantern', 113, 98.5, 'roses');

// --- Vents: secret passages (4 networks) ------------------------------------
b.vent('v-attic', 12, 12, 'west', ['v-library', 'v-cellar']);
b.vent('v-library', 18, 50, 'west', ['v-attic', 'v-cellar']);
b.vent('v-cellar', 17, 77, 'west', ['v-attic', 'v-library']);
b.vent('v-servants', 46, 12, 'north', ['v-dining', 'v-gallery']);
b.vent('v-dining', 104, 16, 'north', ['v-servants', 'v-gallery']);
b.vent('v-gallery', 124, 13, 'north', ['v-servants', 'v-dining']);
b.vent('v-ballroom', 89, 50, 'east', ['v-conservatory', 'v-stables']);
b.vent('v-conservatory', 126, 46, 'east', ['v-ballroom', 'v-stables']);
b.vent('v-stables', 128, 74, 'east', ['v-ballroom', 'v-conservatory']);
b.vent('v-crypt', 17, 91, 'grounds', ['v-orchard']);
b.vent('v-orchard', 44, 86, 'grounds', ['v-crypt', 'v-maze']);
b.vent('v-maze', 82, 90, 'grounds', ['v-orchard', 'v-roses']);
b.vent('v-roses', 132, 97, 'grounds', ['v-maze']);

// --- Cameras ---------------------------------------------------------------
b.cam(24, 27.5, 'Gallery Corridor West').cam(110, 27.5, 'Gallery Corridor East');
b.cam(24, 63.5, 'Lower Hall West').cam(110, 63.5, 'Lower Hall East');
b.cam(31.5, 52, "West Servants' Passage").cam(115.5, 52, "East Servants' Passage");
b.cam(88, 71, 'Maze Gate');

export const MANOR_MAP = b.build({
  id: 'manor',
  name: 'Hollowberry Manor',
  tagline: 'The orchard is ripe, the candles are low, and the will is missing.',
  w: 150,
  h: 104,
  theme: {
    sky: '#0a0710',
    void: '#0b0810',
    wall: '#4a3527',
    wallTop: '#6e5440',
    trim: '#b08d57',
    hall: '#5a4233',
    accent: '#7f1d1d',
    night: '#050308',
    fog: '#120c18',
    ambience: 'manor',
  },
  spawn: { x: 67, y: 41 },
  meetingRoom: 'foyer',
  eject: 'trapdoor',
  criticalNames: { meltdown: 'Furnace Fire', pressure: 'Gas Main Leak' },
});
