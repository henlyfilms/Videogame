/**
 * Hollowberry Manor — a rambling orchard mansion, built for Lights Out.
 * The octagonal Grand Foyer is the heart of the house. North of it the
 * Dining Hall, Kitchen and Servants' Quarters line a cramped servants'
 * corridor; a narrow back stair winds from the servants' rooms down past the
 * Library to the Wine Cellar and the dead-end Family Crypt. East, the
 * Portrait Gallery leads to the Ballroom and up a crooked stair to the Dusty
 * Attic (one way in, one way out). The front doors open onto a ring hedge
 * maze; round it lie the Berry Orchard, the Rose Garden, a Frozen Pond and
 * the Carriage House. Bookshelves, pillars, hedges and trees break sightlines.
 */
import { chamfer, MapBuilder } from './builder';

const b = new MapBuilder();
const CANDLE = '#fbbf24';
const MOON = '#a5b4fc';

// --- Rooms -----------------------------------------------------------------
b.room('foyer', 'Grand Foyer', chamfer(60, 34, 30, 26, 7), 'checker', '#7f1d1d');
b.room('servants', "Servants' Quarters", [12, 6, 20, 12], 'wood', '#78716c', { extra: [[6, 9, 6, 6]] });
b.room('kitchen', 'Kitchen', chamfer(36, 6, 18, 16, [0, 0, 0, 4]), 'tile', '#d97706', { extra: [[40, 22, 5, 4]] });
const bay = chamfer(68, 2, 14, 6, [3, 3, 0, 0]); // dining hall bay window
b.room('dining', 'Dining Hall', chamfer(58, 8, 34, 14, [0, 0, 4, 4]), 'carpet', '#991b1b', { extra: [bay.rect, ...bay.extra] });
b.room('gallery', 'Portrait Gallery', [96, 22, 26, 6], 'wood', '#b08d57');
b.room('attic', 'Dusty Attic', chamfer(110, 4, 34, 12, [0, 6, 0, 0]), 'wood', '#a8a29e', { cold: true });
b.room('library', 'Library', [12, 30, 26, 20], 'carpet', '#7c2d12', { extra: [[12, 50, 12, 8]] });
b.room('study', 'Study', chamfer(42, 42, 14, 12, [3, 0, 0, 3]), 'rug', '#14532d');
b.room('ballroom', 'Ballroom', chamfer(96, 34, 28, 24, 6), 'wood', '#c084fc');
b.room('conservatory', 'Conservatory', chamfer(128, 42, 18, 24, 5), 'tile', '#4d7c0f');
b.room('cellar', 'Wine Cellar', chamfer(2, 62, 20, 13, [0, 0, 3, 0]), 'stone', '#581c87', { cold: true });
b.room('crypt', 'Family Crypt', [4, 80, 18, 14], 'stone', '#334155', { cold: true });
b.room('orchard', 'Berry Orchard', chamfer(26, 62, 26, 30, [6, 0, 0, 6]), 'grass', '#65a30d', { outdoor: true, cold: true });
b.room('maze', 'Hedge Maze', [56, 66, 40, 30], 'grass', '#166534', { outdoor: true, cold: true });
b.room('roses', 'Rose Garden', chamfer(100, 62, 26, 16, [4, 0, 0, 4]), 'grass', '#e11d48', { outdoor: true, cold: true });
b.room('pond', 'Frozen Pond', chamfer(100, 82, 30, 18, 7), 'snow', '#7dd3fc', { outdoor: true, cold: true });
b.room('stables', 'Carriage House', chamfer(130, 70, 18, 16, [0, 4, 0, 0]), 'wood', '#92400e', { cold: true });
// Moody lighting: drop the automatic room lights, place a few warm ones.
b.lamps.length = 0;

// --- Corridors and doors -------------------------------------------------------
// Dining Hall -> Foyer (bent double-width hall)
b.door('dining', [72, 22, 4, 2]);
b.path(4, [[72, 24], [72, 26], [77, 26], [77, 30]], 'carpet');
b.door('foyer', [77, 31, 4, 3], 'Foyer North');
// Servants' corridor (narrow) along the back of the house
b.path(2, [[24, 27], [71, 27]], 'wood');
b.door('library', [26, 29, 3, 1]);
b.path(2, [[46, 24], [46, 26]], 'wood');
b.door('kitchen', [46, 22, 2, 2]);
b.door('kitchen', [54, 12, 4, 3]);
b.hall([32, 10, 4, 3], 'wood');
b.door('servants', [32, 10, 2, 3]);
// Back stair: Servants -> past the Library -> Wine Cellar -> Crypt
b.path(2, [[14, 18], [14, 22], [6, 22], [6, 59]], 'wood');
b.hall([8, 40, 4, 3], 'wood');
b.door('library', [10, 40, 2, 3]);
b.door('cellar', [6, 60, 2, 2], 'Cellar Stair');
b.path(2, [[10, 75], [10, 77]], 'stone');
b.door('crypt', [10, 78, 2, 2]);
// Library <-> Study <-> Foyer
b.hall([38, 45, 4, 3], 'carpet');
b.door('study', [40, 45, 2, 3]);
b.hall([56, 44, 4, 3], 'carpet');
b.door('foyer', [58, 44, 2, 3], 'Foyer West');
// Gallery: from the dining hall, down to the ballroom, up to the attic
b.path(3, [[80, 24], [93, 24]], 'carpet');
b.door('gallery', [94, 24, 2, 3]);
b.path(3, [[108, 28], [108, 31]], 'wood');
b.door('ballroom', [108, 32, 3, 2]);
b.path(2, [[122, 25], [128, 25], [128, 18]], 'wood');
b.door('attic', [128, 16, 2, 2], 'Attic');
// Foyer <-> Ballroom <-> Conservatory
b.hall([90, 44, 6, 4], 'checker');
b.door('ballroom', [94, 44, 2, 4], 'Ballroom');
b.hall([124, 47, 4, 3], 'tile');
b.door('conservatory', [126, 47, 2, 3], 'Conservatory');
// Out into the grounds
b.door('foyer', [73, 60, 4, 2], 'Front Doors');
b.path(4, [[73, 62], [73, 62]], 'stone');
b.door('library', [32, 50, 3, 2]);
b.path(3, [[32, 52], [32, 61]], 'stone');
b.hall([22, 69, 2, 3], 'stone');
b.hall([24, 69, 2, 3], 'stone');
b.hall([52, 78, 4, 3], 'grass'); // orchard gate into the maze
b.door('ballroom', [106, 58, 3, 2]);
b.path(3, [[106, 60], [106, 61]], 'stone');
b.path(3, [[135, 66], [135, 67]], 'stone');
b.door('stables', [135, 68, 3, 2], 'Carriage House');
b.hall([126, 70, 2, 3], 'grass');
b.hall([128, 70, 2, 3], 'wood');
b.hall([96, 70, 4, 3], 'grass'); // maze east gate -> roses
b.path(3, [[112, 78], [112, 79]], 'snow'); // roses -> pond
b.hall([96, 89, 4, 3], 'snow'); // maze south-east gate -> pond

// --- Props -----------------------------------------------------------------
// Grand Foyer (meeting)
b.prop('roundTable', 75, 46, { w: 2, h: 2, color: '#78350f' });
b.prop('rug', 75, 46, { w: 12, h: 10, solid: false, color: '#7f1d1d' });
b.prop('pillar', 66.5, 40.5).prop('pillar', 83.5, 40.5).prop('pillar', 66.5, 52.5).prop('pillar', 83.5, 52.5);
b.prop('clock', 70.5, 35.5, { label: 'GRANDFATHER' });
b.prop('statue', 64.5, 38.5, { label: 'THE FOUNDER', color: '#d6d3d1' }).prop('statue', 85.5, 38.5, { color: '#d6d3d1' });
b.prop('plant', 62.5, 54.5).prop('plant', 87.5, 54.5);
b.prop('bench', 68, 56.5, { w: 3, h: 1 }).prop('bench', 82, 56.5, { w: 3, h: 1 });
b.prop('lamp', 75, 41, { solid: false, color: CANDLE });
// Servants' Quarters
b.prop('bed', 14, 8.5, { w: 2, h: 3, color: '#a8a29e' }).prop('bed', 18, 8.5, { w: 2, h: 3, color: '#a8a29e' }).prop('bed', 22, 8.5, { w: 2, h: 3, color: '#a8a29e' });
b.prop('table', 24.5, 13, { w: 3, h: 2 });
b.prop('chair', 22.5, 13.5).prop('chair', 26.5, 13.5);
b.prop('locker', 30.5, 6.5).prop('locker', 29.5, 6.5);
b.prop('shelf', 18, 17.5, { w: 4, h: 1, label: 'BELL BOARD' });
b.prop('tank', 7.5, 10.5, { label: 'WASHTUB', color: '#a8a29e' });
// Kitchen
b.prop('stove', 40, 6.5, { w: 2, h: 1 });
b.prop('fireplace', 44, 6.5, { w: 3, h: 1, label: 'HEARTH' });
b.prop('counter', 49, 6.5, { w: 4, h: 1 });
b.prop('fridge', 52.5, 6.5, { label: 'ICEBOX' });
b.prop('table', 44, 14, { w: 4, h: 2, color: '#d6d3d1' });
b.prop('barrel', 37.5, 16.5).prop('barrel', 38.5, 17.5, { label: 'FLOUR' });
b.prop('shelf', 51.5, 17.5, { w: 3, h: 1 });
b.prop('shelf', 40.5, 24, { w: 1, h: 3, label: 'PANTRY' }).prop('barrel', 43.5, 25.5);
// Dining Hall
b.prop('table', 75, 14, { w: 20, h: 2, color: '#7f1d1d', label: 'BANQUET' });
for (let x = 66.5; x < 85; x += 3) b.prop('chair', x, 12).prop('chair', x, 16);
b.prop('fireplace', 75, 2.5, { w: 4, h: 1 });
b.prop('window', 75, 2.2, { w: 8, h: 0.3, solid: false });
b.prop('counter', 90.5, 13, { w: 1, h: 4, label: 'SIDEBOARD', color: '#78350f' });
b.prop('clock', 60.5, 8.5);
b.prop('plant', 62.5, 19.5).prop('plant', 87.5, 19.5);
// Portrait Gallery
for (const x of [100, 106, 112, 118]) b.prop('poster', x, 22.2, { w: 3, h: 0.2, solid: false, label: 'PORTRAIT' });
b.prop('statue', 103.5, 22.5, { color: '#e7e5e4' }).prop('statue', 115.5, 22.5, { color: '#e7e5e4' });
b.prop('pillar', 103.5, 27.5).prop('pillar', 115.5, 27.5);
b.prop('bench', 99, 27.5, { w: 3, h: 1 });
// Dusty Attic (dead end)
b.prop('crate', 113, 6, { w: 2, h: 2, label: 'TRUNK' }).prop('crate', 112.5, 9.5).prop('crate', 116.5, 13.5);
b.prop('sofa', 120, 7, { w: 4, h: 1.2, color: '#d6d3d1', label: 'DUST SHEET' });
b.prop('piano', 134, 7, { w: 3, h: 2, color: '#57534e' });
b.prop('statue', 123.5, 12.5, { label: 'ROCKING HORSE', color: '#a16207' });
b.prop('telescope', 141, 11, { w: 2, h: 2 });
b.prop('bookshelf', 137.5, 14.5, { w: 3, h: 1 });
b.prop('window', 136, 4.2, { w: 4, h: 0.3, solid: false });
// Library: tall stacks break every sightline
for (const x of [17.5, 22.5]) b.prop('bookshelf', x, 36, { w: 1, h: 6 }).prop('bookshelf', x, 45, { w: 1, h: 6 });
b.prop('bookshelf', 27.5, 36.5, { w: 1, h: 5 }).prop('bookshelf', 27.5, 45, { w: 1, h: 6 });
b.prop('sofa', 33, 39.5, { w: 4, h: 1.2, color: '#7c2d12' });
b.prop('desk', 33, 46, { w: 3, h: 2 });
b.prop('fireplace', 18, 57.5, { w: 3, h: 1 });
b.prop('roundTable', 15, 53, { w: 2, h: 2, label: 'GLOBE' });
b.prop('sofa', 21, 52.5, { w: 1.2, h: 3, color: '#7c2d12' });
// Study
b.prop('desk', 48, 46, { w: 4, h: 2 });
b.prop('chair', 48.5, 48);
b.prop('bookshelf', 47.5, 42.5, { w: 3, h: 1 }).prop('bookshelf', 54.5, 49.5, { w: 1, h: 3 });
b.prop('locker', 54.5, 52.5, { label: 'SAFE', color: '#1c1917' });
b.prop('rug', 48, 50, { w: 6, h: 3, solid: false, color: '#14532d' });
// Ballroom
b.prop('rug', 110, 46, { w: 14, h: 10, solid: false, color: '#c084fc' });
b.prop('pillar', 101.5, 39.5).prop('pillar', 118.5, 39.5).prop('pillar', 101.5, 52.5).prop('pillar', 118.5, 52.5);
b.prop('piano', 113.5, 36, { w: 3, h: 2, color: '#111827' });
b.prop('turntable', 121.5, 41.5, { w: 1.5, h: 1.5, label: 'GRAMOPHONE' });
b.prop('sofa', 98.5, 50, { w: 1.2, h: 3, color: '#7e22ce' }).prop('sofa', 121.5, 50, { w: 1.2, h: 3, color: '#7e22ce' });
b.prop('lamp', 110, 41, { solid: false, color: CANDLE }).prop('lamp', 110, 51, { solid: false, color: CANDLE });
// Conservatory
b.prop('tree', 133, 46, { w: 2, h: 2, label: 'LEMON' }).prop('tree', 141, 46, { w: 2, h: 2 });
b.prop('fountain', 136.5, 53.5, { w: 3, h: 3 });
b.prop('planter', 132.5, 60.5, { w: 3, h: 1 }).prop('planter', 141.5, 60.5, { w: 3, h: 1 });
b.prop('plant', 129.5, 55.5).prop('plant', 144.5, 55.5).prop('plant', 137.5, 63.5);
b.prop('bench', 137, 58.5, { w: 3, h: 1 });
// Wine Cellar
b.prop('bookshelf', 13, 64.5, { w: 6, h: 1, label: 'WINE RACK', color: '#581c87' }).prop('bookshelf', 13, 67.5, { w: 6, h: 1, color: '#581c87' });
b.prop('bookshelf', 4.5, 68, { w: 1, h: 4, color: '#581c87' });
b.prop('barrel', 18.5, 72.5).prop('barrel', 17.5, 72.5).prop('barrel', 3.5, 72.5);
b.prop('generator', 15, 71, { w: 2, h: 1, label: 'FURNACE' });
// Family Crypt (dead end)
b.prop('statue', 6.5, 83.5, { label: 'ANGEL', color: '#cbd5e1' }).prop('statue', 19.5, 83.5, { color: '#cbd5e1' });
b.prop('bed', 8, 89, { w: 2, h: 4, color: '#64748b', label: 'TOMB' }).prop('bed', 14, 89, { w: 2, h: 4, color: '#64748b' });
b.prop('pillar', 18.5, 88.5).prop('pillar', 5.5, 92.5);
// Berry Orchard
for (const [x, y] of [[31, 67], [38, 66], [45, 67], [30, 75], [37, 74], [44, 76], [31, 84], [38, 82], [46, 85]]) b.prop('tree', x!, y!, { w: 2, h: 2 });
b.prop('planter', 41, 70.5, { w: 3, h: 1, label: 'BRAMBLES' }).prop('planter', 34, 79.5, { w: 3, h: 1 });
b.prop('cart', 48, 72, { w: 2, h: 1 }).prop('crate', 28.5, 79.5, { label: 'BERRIES' });
// Hedge Maze: two broken rings round a fountain court
const hedgeH = (y: number, x0: number, x1: number) => b.prop('hedge', (x0 + x1 + 1) / 2, y + 0.5, { w: x1 - x0 + 1, h: 1 });
const hedgeV = (x: number, y0: number, y1: number) => b.prop('hedge', x + 0.5, (y0 + y1 + 1) / 2, { w: 1, h: y1 - y0 + 1 });
hedgeH(69, 59, 61);
hedgeH(69, 65, 92);
hedgeH(92, 59, 83);
hedgeH(92, 87, 92);
hedgeV(59, 70, 84);
hedgeV(59, 88, 91);
hedgeV(92, 70, 74);
hedgeV(92, 78, 91);
hedgeH(73, 63, 79);
hedgeH(73, 83, 88);
hedgeH(88, 63, 65);
hedgeH(88, 69, 88);
hedgeV(63, 74, 75);
hedgeV(63, 79, 87);
hedgeV(88, 74, 81);
hedgeV(88, 85, 87);
hedgeV(70, 74, 78);
hedgeV(81, 83, 87);
hedgeH(80, 64, 67);
b.prop('fountain', 75.5, 80.5, { w: 3, h: 3 });
b.prop('statue', 84.5, 76.5, { label: 'STONE HARE', color: '#d6d3d1' });
b.prop('bench', 75.5, 85.5, { w: 3, h: 1 });
// Rose Garden
b.prop('planter', 110, 66.5, { w: 6, h: 1, color: '#be123c', label: 'ROSES' }).prop('planter', 120, 66.5, { w: 6, h: 1, color: '#be123c' });
b.prop('planter', 110, 74.5, { w: 6, h: 1, color: '#be123c' }).prop('planter', 120, 74.5, { w: 6, h: 1, color: '#be123c' });
b.prop('statue', 115.5, 70.5, { label: 'SUNDIAL', color: '#e7e5e4' });
b.prop('pillar', 104.5, 64.5).prop('pillar', 104.5, 75.5);
b.prop('bench', 122, 63, { w: 3, h: 1 });
// Frozen Pond
b.prop('rug', 114.5, 91, { w: 20, h: 10, solid: false, color: '#bae6fd', label: 'THIN ICE' });
b.prop('rock', 114, 91, { w: 2, h: 2 }).prop('rock', 116.5, 92.5);
b.prop('tree', 104, 94, { w: 2, h: 2, label: 'WILLOW' }).prop('tree', 125, 87, { w: 2, h: 2 });
b.prop('snowpile', 108.5, 85.5, { w: 2, h: 1 }).prop('snowpile', 121.5, 97.5, { w: 2, h: 1 }).prop('snowpile', 102.5, 89.5);
b.prop('plant', 110.5, 97.5).prop('plant', 127.5, 91.5);
b.prop('bench', 119, 84.5, { w: 3, h: 1 });
// Carriage House
b.prop('cart', 139, 78, { w: 6, h: 3, label: 'CARRIAGE', color: '#1c1917' });
b.prop('locker', 146.5, 74.5, { color: '#92400e' }).prop('locker', 146.5, 75.5, { color: '#92400e' });
b.prop('crate', 132, 83, { w: 2, h: 2, label: 'HAY' }).prop('crate', 142.5, 84.5);
b.prop('generator', 144, 81, { w: 2, h: 2 });
b.prop('barrel', 131.5, 84.5);
// Warm, sparse lighting (lamps drive Lights Out visibility)
b.lamp(75, 46, 12, CANDLE); // foyer chandelier
b.lamp(105, 42, 8, CANDLE).lamp(114, 51, 8, CANDLE); // ballroom chandeliers
b.lamp(18, 55, 6, '#f97316'); // library fire
b.lamp(44, 8, 7, '#f97316'); // kitchen hearth
b.lamp(75, 11, 7, CANDLE); // dining candelabra
b.lamp(48, 45, 4, CANDLE); // study desk lamp
b.lamp(102, 24, 4, CANDLE).lamp(117, 24, 4, CANDLE); // gallery sconces
b.lamp(25, 12, 4, CANDLE); // servants' candle
b.lamp(136, 6, 4, MOON); // attic skylight
b.lamp(137, 53, 6, MOON); // conservatory glass
b.lamp(76, 81, 7, MOON).lamp(114, 91, 8, MOON).lamp(40, 76, 6, MOON); // grounds
b.lamp(13, 66, 4, '#f97316'); // cellar furnace
b.lamp(139, 76, 4, CANDLE); // carriage lantern

// --- Stations --------------------------------------------------------------
b.st('emergency', 75, 46, 'foyer');
b.st('admin', 48, 47.6, 'study');
b.st('upload', 55.4, 43, 'study');
b.st('cams', 18, 16.4, 'servants');
b.st('vitals', 110, 22.6, 'gallery');
b.st('doorlog', 143.4, 72, 'stables');
b.st('lightsPanel', 21.4, 64, 'cellar');
b.st('commsPanel', 37.4, 32, 'library');
b.st('meltdownA', 53.4, 9, 'kitchen').st('meltdownB', 78.4, 3.6, 'dining');
b.st('pressureA', 29, 49.4, 'library').st('pressureB', 128.6, 51, 'conservatory');
b.st('recharge', 143.4, 13, 'attic').st('recharge', 97, 41.5, 'ballroom').st('recharge', 33, 90.4, 'orchard').st('recharge', 124, 76.4, 'roses');
// Tasks
b.st('alignDish', 141, 12.6, 'attic');
b.st('replaceFuse', 110.6, 5, 'attic').st('replaceFuse', 2.6, 64, 'cellar').st('replaceFuse', 96.6, 22.6, 'gallery');
b.st('fixWiring', 110.6, 14.4, 'attic').st('fixWiring', 121.4, 23, 'gallery').st('fixWiring', 12.6, 55, 'library').st('fixWiring', 147.4, 84, 'stables').st('fixWiring', 21.4, 92.4, 'crypt');
b.st('download', 124, 4.6, 'attic').st('download', 23.4, 52, 'library').st('download', 98, 27.4, 'gallery').st('download', 131, 84.4, 'stables');
b.st('stampMail', 24, 15.4, 'servants').st('stampMail', 44.6, 52.4, 'study');
b.st('swipeBadge', 31.4, 8.5, 'servants');
b.st('emptyChute', 27, 6.6, 'servants');
b.st('juicePress', 49, 7.6, 'kitchen');
b.st('rerouteTube', 36.6, 17, 'kitchen').st('rerouteTube', 128.6, 58, 'conservatory').st('rerouteTube', 2.6, 70, 'cellar').st('rerouteTube', 131, 74.5, 'stables');
b.st('medScan', 63, 9.6, 'dining');
b.st('primeShields', 90.4, 18, 'dining');
b.st('sortClips', 117, 22.6, 'gallery');
b.st('keypadCode', 52, 42.6, 'study').st('keypadCode', 101, 27.4, 'gallery');
b.st('chartCourse', 20, 50.6, 'library');
b.st('simonSays', 104, 35.6, 'ballroom');
b.st('calibrateTurntable', 121.5, 43, 'ballroom');
b.st('slotCartridge', 99, 53, 'ballroom');
b.st('sortBerries', 38, 68.2, 'orchard').st('sortBerries', 49.6, 86, 'orchard').st('sortBerries', 133, 58.6, 'conservatory');
b.st('waterPlants', 141, 59.4, 'conservatory').st('waterPlants', 110, 67.6, 'roses').st('waterPlants', 69, 94, 'maze');
b.st('cleanFilter', 114, 88.6, 'pond');
b.st('distillReel', 16, 66, 'cellar');
b.st('fuelCan', 8, 72, 'cellar');
b.st('unlockManifold', 19, 73.4, 'cellar');
b.st('fuelEngine', 139, 80.6, 'stables');
b.st('rechargeGenerator', 145, 82.6, 'stables');
b.st('lightLantern', 78, 83, 'maze').st('lightLantern', 12, 92.6, 'crypt').st('lightLantern', 51.4, 64, 'orchard');
b.st('lightLantern', 37.4, 48.4, 'library').st('lightLantern', 147.4, 78, 'stables').st('lightLantern', 125.6, 95, 'pond');

// --- Vents (4 networks) ----------------------------------------------------
b.vent('v-servants', 28, 16.5, 'west', ['v-library', 'v-cellar']);
b.vent('v-library', 35.5, 31.5, 'west', ['v-servants', 'v-study']);
b.vent('v-study', 45.5, 52.5, 'west', ['v-library']);
b.vent('v-cellar', 5.5, 63.5, 'west', ['v-servants', 'v-orchard']);
b.vent('v-orchard', 27.5, 72.5, 'west', ['v-cellar']);
b.vent('v-kitchen', 40.5, 19.5, 'north', ['v-dining']);
b.vent('v-dining', 87.5, 19.5, 'north', ['v-kitchen', 'v-attic']);
b.vent('v-attic', 142.5, 14.5, 'north', ['v-dining']);
b.vent('v-ballroom', 118.5, 55.5, 'east', ['v-conserv', 'v-roses']);
b.vent('v-conserv', 132.5, 63.5, 'east', ['v-ballroom', 'v-stables']);
b.vent('v-stables', 146.5, 84.5, 'east', ['v-conserv']);
b.vent('v-roses', 124.5, 71.5, 'east', ['v-ballroom']);
b.vent('v-crypt', 20.5, 81.5, 'garden', ['v-maze']);
b.vent('v-maze', 57.5, 94.5, 'garden', ['v-crypt', 'v-pond']);
b.vent('v-pond', 106, 94.5, 'garden', ['v-maze']);

// --- Cameras ---------------------------------------------------------------
b.cam(7, 40, "Servants' Stair").cam(60, 27.5, "Servants' Corridor").cam(88, 25, 'Gallery Walk');
b.cam(75, 63, 'Front Steps').cam(92, 45.5, 'Ballroom Doors').cam(129, 21, 'Attic Stair').cam(33, 57, 'Orchard Gate');

export const MANOR_MAP = b.build({
  id: 'manor',
  name: 'Hollowberry Manor',
  tagline: 'The orchard is ripe, the candles are low, and the will is missing.',
  w: 150,
  h: 102,
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
  spawn: { x: 75, y: 42 },
  meetingRoom: 'foyer',
  eject: 'trapdoor',
  criticalNames: { meltdown: 'Furnace Fire', pressure: 'Gas Main Leak' },
});
