/**
 * Midnight Express — a snow-bound sleeper train halted on a mountain curve.
 * The train bends in a horseshoe round the little station: caboose low in the
 * west, the passenger cars climbing to the dining car at the crest, then the
 * kitchen, an open flatbed, the coal tender and the locomotive running south
 * down the east side. Stepped snowy platforms hug the inside of the curve;
 * inside it sit the octagonal Ticket Hall, the L-shaped Waiting Room, a
 * dead-end Baggage Room, the Signal Box, the Engine Shed, the Snowy Yard and
 * the Water Tower on its service road.
 */
import { chamfer, MapBuilder } from './builder';

const b = new MapBuilder();
const WARM = '#fcd34d';
const SNOWLIGHT = '#bae6fd';

// --- Rooms -----------------------------------------------------------------
// The train, tail to nose
b.room('caboose', 'Caboose', chamfer(4, 42, 16, 9, [3, 0, 0, 3]), 'wood', '#dc2626');
b.room('observation', 'Observation Car', [24, 33, 22, 9], 'carpet', '#60a5fa');
b.room('sleeper', 'Sleeper Car', [50, 25, 26, 9], 'rug', '#7c3aed');
b.room('lounge', 'Piano Lounge', [80, 18, 24, 9], 'carpet', '#9f1239');
b.room('dining', 'Dining Car', [108, 13, 26, 9], 'checker', '#c2410c');
b.room('kitchen', 'Kitchen Car', [138, 15, 20, 9], 'tile', '#eab308');
b.room('flatbed', 'Open Flatbed', [148, 28, 10, 16], 'wood', '#a16207', { outdoor: true, cold: true });
b.room('coal', 'Coal Tender', [150, 48, 10, 14], 'metal', '#57534e', { outdoor: true, cold: true });
b.room('engine', 'Locomotive', chamfer(150, 66, 12, 24, [0, 0, 4, 4]), 'metal', '#b45309');
// Platforms stepping round the inside of the curve
b.room('platformW', 'West Platform', [26, 44, 24, 5], 'snow', '#cbd5e1', {
  outdoor: true,
  cold: true,
  extra: [
    [6, 53, 16, 5],
    [21, 49, 9, 4],
    [48, 41, 6, 3],
    [52, 36, 26, 5],
  ],
});
b.lamps.pop(); // lit by lamp posts instead of one giant light
b.room('platformE', 'East Platform', [108, 24, 30, 5], 'snow', '#94a3b8', {
  outdoor: true,
  cold: true,
  extra: [
    [78, 34, 6, 4],
    [82, 29, 24, 5],
    [104, 27, 6, 3],
    [136, 29, 8, 22],
    [131, 51, 13, 22],
  ],
});
b.lamps.pop();
// The station inside the curve
b.room('tickets', 'Ticket Hall', chamfer(70, 50, 30, 26, 7), 'stone', '#8b1e3f');
b.room('waiting', 'Waiting Room', [106, 46, 18, 14], 'carpet', '#0f766e', { extra: [[112, 60, 12, 8]] });
b.room('office', "Stationmaster's Office", [112, 34, 14, 9], 'rug', '#4338ca');
b.room('signal', 'Signal Box', [30, 56, 10, 12], 'wood', '#16a34a');
b.room('baggage', 'Baggage Room', [44, 52, 16, 14], 'wood', '#a16207', { cold: true });
b.room('yard', 'Snowy Yard', chamfer(6, 62, 22, 24, [4, 0, 6, 0]), 'snow', '#e0f2fe', { outdoor: true, cold: true, extra: [[2, 68, 4, 10]] });
b.room('shed', 'Engine Shed', chamfer(36, 76, 30, 18, [0, 0, 5, 5]), 'stone', '#64748b', { cold: true });
b.room('tower', 'Water Tower', chamfer(108, 76, 18, 18, 5), 'snow', '#0284c7', { outdoor: true, cold: true });

// --- Gangways between cars (each one a little dog-leg) -----------------------
b.path(3, [[20, 44], [21, 44], [21, 37]], 'wood'); // caboose <-> observation
b.path(3, [[46, 34], [47, 34], [47, 27]], 'wood'); // observation <-> sleeper
b.door('sleeper', [49, 27, 1, 7]);
b.path(3, [[76, 27], [77, 27], [77, 20]], 'wood'); // sleeper <-> lounge
b.path(3, [[104, 19], [105, 19], [105, 14]], 'wood'); // lounge <-> dining
b.door('dining', [107, 14, 1, 8], 'Dining Car');
b.hall([134, 16, 4, 3], 'wood'); // dining <-> kitchen
b.path(3, [[152, 24], [152, 25]], 'metal'); // kitchen <-> flatbed
b.door('coal', [152, 44, 3, 4]); // flatbed <-> coal
b.path(3, [[154, 62], [154, 63]], 'metal'); // coal <-> locomotive

// --- Train doors onto the platforms ------------------------------------------
b.door('caboose', [12, 51, 3, 2], 'Caboose');
b.door('observation', [34, 42, 3, 2]);
b.door('sleeper', [62, 34, 3, 2]);
b.door('lounge', [90, 27, 3, 2]);
b.door('dining', [114, 22, 3, 2]).door('dining', [126, 22, 3, 2]);
b.door('kitchen', [138, 24, 3, 2]);
b.hall([144, 36, 4, 3], 'wood');
b.hall([144, 52, 6, 3], 'metal');
b.door('engine', [144, 70, 6, 3], 'Engine Cab');

// --- Station passages ----------------------------------------------------------
// Footbridge stair: east platform -> Ticket Hall (north)
b.path(4, [[90, 34], [90, 40], [84, 40], [84, 46]], 'stone');
b.door('tickets', [84, 48, 4, 2], 'Ticket Hall');
// West stair: west platform -> Baggage / Ticket Hall
b.path(3, [[62, 41], [62, 60], [68, 60]], 'stone');
b.door('tickets', [68, 60, 2, 3]);
b.door('baggage', [60, 56, 2, 3]);
// Ticket Hall -> Waiting Room -> east platform; office between
b.hall([100, 58, 4, 3], 'stone');
b.door('waiting', [104, 58, 2, 3]);
b.path(3, [[124, 50], [133, 50]], 'wood');
b.path(3, [[118, 29], [118, 31]], 'snow');
b.door('office', [118, 32, 3, 2], 'Office');
b.hall([116, 43, 3, 3], 'wood');
// Signal Box: stair from the west platform, side door to the yard
b.path(2, [[34, 49], [34, 52]], 'wood');
b.door('signal', [34, 54, 2, 2], 'Signal Box');
b.hall([28, 63, 2, 3], 'snow');
// Platform -> Snowy Yard steps
b.path(3, [[12, 58], [12, 59]], 'snow');
// Yard -> Engine Shed, Ticket Hall -> Shed lane
b.path(3, [[28, 76], [33, 76]], 'snow');
b.hall([34, 76, 2, 3], 'snow');
b.path(4, [[82, 76], [82, 82], [68, 82]], 'stone');
b.door('shed', [66, 82, 2, 4], 'Engine Shed');
// Service road: Ticket Hall -> Water Tower; Waiting Room -> Tower path
b.path(3, [[90, 76], [90, 84], [105, 84]], 'snow');
b.path(3, [[116, 70], [116, 73]], 'snow');
b.door('waiting', [116, 68, 3, 2]);

// --- Props -----------------------------------------------------------------
// Caboose
b.prop('fireplace', 16.5, 42.5, { label: 'POT BELLY' });
b.prop('sofa', 10, 43.5, { w: 4, h: 1, color: '#7f1d1d' });
b.prop('desk', 17.5, 49.5, { w: 3, h: 1 });
b.prop('barrel', 6.5, 46.5).prop('lamp', 9.5, 49.5, { solid: false, color: WARM });
b.prop('window', 12, 42.2, { w: 6, h: 0.3, solid: false });
// Observation car
b.prop('window', 35, 33.2, { w: 20, h: 0.3, solid: false });
b.prop('seat', 27.5, 34.5).prop('seat', 29.5, 34.5).prop('seat', 31.5, 34.5).prop('seat', 36.5, 34.5).prop('seat', 38.5, 34.5);
b.prop('telescope', 42, 38, { w: 2, h: 2 });
b.prop('planter', 30, 40.5, { w: 4, h: 1 });
b.prop('sofa', 39, 40.5, { w: 3, h: 1, color: '#1e3a8a' });
// Sleeper car: compartments with partitions
b.prop('bed', 54.5, 26, { w: 3, h: 2, color: '#ddd6fe' }).prop('bed', 62.5, 26, { w: 3, h: 2, color: '#ddd6fe' }).prop('bed', 70.5, 26, { w: 3, h: 2, color: '#ddd6fe' });
b.prop('locker', 58.5, 25.5, { color: '#5b21b6' }).prop('locker', 58.5, 26.5, { color: '#5b21b6' }).prop('locker', 58.5, 27.5, { color: '#5b21b6' });
b.prop('locker', 66.5, 25.5, { color: '#5b21b6' }).prop('locker', 66.5, 26.5, { color: '#5b21b6' }).prop('locker', 66.5, 27.5, { color: '#5b21b6' });
b.prop('crate', 73.5, 32.5, { label: 'LUGGAGE' });
b.prop('rug', 63, 31, { w: 20, h: 2, solid: false, color: '#6d28d9' });
// Piano lounge
b.prop('piano', 83.5, 19, { w: 3, h: 2, color: '#1c1917' });
b.prop('sofa', 94, 18.5, { w: 4, h: 1, color: '#9f1239' });
b.prop('counter', 97, 25.5, { w: 6, h: 1, label: 'BAR', color: '#78350f' });
b.prop('roundTable', 89, 23, { w: 2, h: 2 });
b.prop('turntable', 101.5, 22.5, { w: 1.5, h: 1.5 });
b.prop('rug', 92, 22, { w: 8, h: 4, solid: false, color: '#be123c' });
// Dining car
for (const x of [112, 118, 124, 130]) b.prop('table', x, 15, { w: 2, h: 2, color: '#fef3c7' });
b.prop('table', 120, 19, { w: 2, h: 2, color: '#fef3c7' });
b.prop('chair', 110.5, 15.5).prop('chair', 116.5, 15.5).prop('chair', 122.5, 15.5).prop('chair', 128.5, 15.5);
b.prop('clock', 121, 13.5, { solid: false });
// Kitchen car
b.prop('stove', 142, 15.5, { w: 2, h: 1 });
b.prop('counter', 147.5, 15.5, { w: 3, h: 1 });
b.prop('fridge', 156.5, 15.5);
b.prop('table', 146, 20, { w: 4, h: 2, color: '#fef9c3' });
b.prop('barrel', 156.5, 22.5, { label: 'FLOUR' });
// Open flatbed
b.prop('crate', 150, 31, { w: 2, h: 2, label: 'MAIL SACKS' }).prop('crate', 156, 31, { w: 2, h: 2 });
b.prop('crate', 156.5, 40, { w: 1, h: 3, label: 'LOGS', color: '#78350f' });
b.prop('cart', 150, 41, { w: 2, h: 1 });
b.prop('snowpile', 156.5, 35.5).prop('snowpile', 148.5, 38.5);
// Coal tender
b.prop('rock', 156, 53.5, { w: 4, h: 3, label: 'COAL', color: '#1c1917' });
b.prop('snowpile', 151.5, 58.5).prop('barrel', 158.5, 49.5);
// Locomotive
b.prop('engine', 156, 78, { w: 6, h: 8, label: 'BOILER', color: '#292524' });
b.prop('fireplace', 156, 72.5, { w: 2, h: 1, label: 'FIREBOX' });
b.prop('console', 156, 86.5, { w: 4, h: 1, label: 'GAUGES' });
b.prop('pipe', 160.6, 78, { w: 0.5, h: 10, solid: false });
// West platform
b.prop('bench', 14, 56.5, { w: 3, h: 1 }).prop('bench', 40, 47.5, { w: 3, h: 1 }).prop('bench', 70, 39.5, { w: 3, h: 1 });
b.prop('pillar', 27.5, 47.5).prop('pillar', 47.5, 47.5).prop('pillar', 57.5, 39.5);
b.prop('snowpile', 6.5, 56.5).prop('snowpile', 75.5, 39.5);
b.prop('clock', 65, 36.5, { solid: false, label: 'MIDNIGHT' });
b.prop('cart', 30, 45, { w: 2, h: 1, label: 'LUGGAGE' });
b.prop('poster', 52, 41.2, { w: 3, h: 0.2, solid: false, label: 'TIMETABLE' });
// East platform
b.prop('bench', 98, 32.5, { w: 3, h: 1 }).prop('bench', 130, 27.5, { w: 3, h: 1 }).prop('bench', 142.5, 46, { w: 1, h: 3 });
b.prop('pillar', 84.5, 30.5).prop('pillar', 111.5, 27.5).prop('pillar', 136.5, 40.5).prop('pillar', 136.5, 62.5);
b.prop('mailbox', 104.5, 32.5);
b.prop('bench', 133, 60, { w: 1, h: 3 }).prop('crate', 132.5, 69.5, { label: 'PARCELS' }).prop('cart', 135, 56.5, { w: 2, h: 1 });
b.prop('snowpile', 142.5, 70.5).prop('snowpile', 136.5, 71.5).prop('snowpile', 137.5, 30.5);
b.prop('poster', 124, 24.2, { w: 4, h: 0.2, solid: false, label: 'MIDNIGHT EXPRESS' });
// Ticket Hall (meeting)
b.prop('roundTable', 85, 63, { w: 2, h: 2, color: '#fde68a' });
b.seats(85, 63, 2.8, 8, '#7f1d1d');
b.prop('rug', 85, 63, { w: 10, h: 8, solid: false, color: '#8b1e3f' });
b.prop('counter', 92, 55.5, { w: 5, h: 1, label: 'TICKETS', color: '#78350f' });
b.prop('clock', 77.5, 55.5, { label: 'STATION CLOCK' });
b.prop('bench', 78, 70.5, { w: 3, h: 1 }).prop('bench', 92, 70.5, { w: 3, h: 1 });
b.prop('pillar', 74.5, 66.5).prop('pillar', 95.5, 66.5);
b.prop('plant', 72.5, 57.5).prop('plant', 97.5, 62.5);
b.prop('poster', 85, 50.2, { w: 4, h: 0.2, solid: false, label: 'DEPARTURES' });
// Waiting Room
b.prop('fireplace', 109.5, 46.5, { w: 3, h: 1 });
b.prop('bench', 112, 51.5, { w: 4, h: 1, color: '#115e59' }).prop('bench', 112, 55.5, { w: 4, h: 1, color: '#115e59' });
b.prop('tree', 121, 47, { w: 2, h: 2, label: 'XMAS TREE', color: '#15803d' });
b.prop('arcade', 122.5, 57.5, { label: 'PENNY ARCADE' });
b.prop('sofa', 118, 63.5, { w: 4, h: 1, color: '#115e59' });
b.prop('bookshelf', 112.5, 65, { w: 1, h: 3 });
// Stationmaster's office
b.prop('desk', 114.5, 38, { w: 3, h: 2 });
b.prop('chair', 116.5, 38.5);
b.prop('bookshelf', 124.5, 35.5, { w: 1, h: 3 });
b.prop('locker', 124.5, 41.5, { label: 'SAFE', color: '#1e1b4b' });
b.prop('clock', 121, 34.5, { solid: false });
// Signal Box
b.prop('console', 38.5, 61, { w: 1, h: 4, label: 'LEVERS', color: '#166534' });
b.prop('chair', 37, 61.5);
b.prop('desk', 32.5, 66.5, { w: 3, h: 1 });
b.prop('window', 35, 56.2, { w: 6, h: 0.3, solid: false });
b.prop('shelf', 31, 57.5, { w: 2, h: 1 });
// Baggage Room (one way in)
b.prop('shelf', 47, 53.5, { w: 4, h: 1 }).prop('shelf', 53, 53.5, { w: 4, h: 1 });
b.prop('crate', 46, 58, { w: 2, h: 2, label: 'TRUNK' }).prop('crate', 50.5, 60.5).prop('crate', 54, 62, { w: 2, h: 2 });
b.prop('cart', 50, 64.5, { w: 2, h: 1 });
b.prop('shelf', 44.5, 61, { w: 1, h: 4 });
b.prop('mailbox', 58.5, 64.5);
// Snowy Yard
b.prop('tree', 10, 68, { w: 2, h: 2, color: '#14532d' }).prop('tree', 22, 74, { w: 2, h: 2, color: '#14532d' }).prop('tree', 8, 80, { w: 2, h: 2, color: '#14532d' });
b.prop('snowpile', 16, 66, { w: 3, h: 2 }).prop('snowpile', 4, 74.5).prop('snowpile', 18.5, 82.5);
b.prop('statue', 15.5, 74.5, { label: 'SNOWMAN', color: '#f8fafc' });
b.prop('crate', 25.5, 69.5, { label: 'FIREWOOD', color: '#78350f' });
b.prop('cart', 12, 77.5, { w: 2, h: 1, label: 'SLED' });
b.prop('rock', 24.5, 77.5);
// Engine Shed
b.prop('engine', 50, 84, { w: 10, h: 4, label: 'SHUNTER 7', color: '#7c2d12' });
b.prop('tank', 60, 79, { w: 4, h: 2, label: 'TANKER', color: '#334155' });
b.prop('desk', 41, 77, { w: 4, h: 2, label: 'WORKBENCH' });
b.prop('generator', 40.5, 88.5, { w: 3, h: 2 });
b.prop('barrel', 62.5, 87.5).prop('barrel', 61.5, 87.5);
b.prop('pipe', 51, 76.4, { w: 10, h: 0.4, solid: false });
// Water Tower
b.prop('tank', 117, 85, { w: 6, h: 6, label: 'WATER TOWER', color: '#0369a1' });
b.prop('dish', 123, 82, { w: 2, h: 2, label: 'TELEGRAPH' });
b.prop('tree', 112, 80, { w: 2, h: 2, color: '#14532d' }).prop('snowpile', 112.5, 90.5, { w: 2, h: 1 }).prop('rock', 121.5, 90.5);
// Lamp posts
for (const [x, y] of [[14, 55], [38, 46], [64, 38], [94, 31], [122, 26], [140, 45], [140, 64]] as const) b.lamp(x, y, 7, WARM);
b.lamp(97, 85, 5, SNOWLIGHT).lamp(75, 84, 5, SNOWLIGHT).lamp(63, 50, 4, WARM).lamp(88, 42, 4, WARM);

// --- Stations --------------------------------------------------------------
b.st('emergency', 85, 63, 'tickets');
b.st('admin', 92, 56.6, 'tickets');
b.st('upload', 99, 64, 'tickets');
b.st('cams', 37.4, 59, 'signal');
b.st('doorlog', 30.6, 60, 'signal');
b.st('vitals', 60, 32.4, 'sleeper');
b.st('lightsPanel', 36.6, 82, 'shed');
b.st('commsPanel', 125.4, 39, 'office');
b.st('meltdownA', 156, 88.4, 'engine').st('meltdownB', 159.4, 57, 'coal');
b.st('pressureA', 4.6, 46, 'caboose').st('pressureB', 112.6, 41.4, 'office');
b.st('recharge', 24.6, 34, 'observation').st('recharge', 133.4, 13.6, 'dining').st('recharge', 58.4, 53, 'baggage').st('recharge', 110, 88.4, 'tower');
// Tasks
b.st('fixWiring', 19.4, 48.6, 'caboose').st('fixWiring', 56, 32.4, 'sleeper').st('fixWiring', 157.4, 29, 'flatbed').st('fixWiring', 64.4, 88, 'shed').st('fixWiring', 44.6, 64.6, 'baggage');
b.st('replaceFuse', 8, 49.4, 'caboose').st('replaceFuse', 108.6, 20.6, 'dining').st('replaceFuse', 60, 76.6, 'shed');
b.st('rerouteTube', 13, 42.6, 'caboose').st('rerouteTube', 52, 52.6, 'baggage').st('rerouteTube', 157.4, 19, 'kitchen').st('rerouteTube', 124.6, 85, 'tower');
b.st('lightLantern', 18.6, 42.6, 'caboose').st('lightLantern', 2.6, 70, 'yard').st('lightLantern', 143.4, 60, 'platformE');
b.st('lightLantern', 120, 92.4, 'tower').st('lightLantern', 148.6, 34, 'flatbed');
b.st('download', 150, 15.6, 'kitchen').st('download', 35, 66.4, 'signal').st('download', 123.4, 47, 'waiting').st('download', 44.4, 40.4, 'observation');
b.st('chartCourse', 39, 33.6, 'observation');
b.st('waterPlants', 30, 39.4, 'observation').st('waterPlants', 121, 49.4, 'waiting');
b.st('keypadCode', 51, 25.6, 'sleeper').st('keypadCode', 122, 34.6, 'office');
b.st('distillReel', 74.4, 26, 'sleeper');
b.st('sortClips', 87, 25.4, 'lounge');
b.st('simonSays', 87.5, 18.6, 'lounge');
b.st('calibrateTurntable', 101.5, 24.4, 'lounge');
b.st('fixWiring', 103.4, 25.4, 'lounge');
b.st('sortBerries', 147, 17.6, 'kitchen').st('sortBerries', 16, 84.4, 'yard').st('sortBerries', 106.6, 54, 'waiting');
b.st('juicePress', 124, 16.6, 'dining');
b.st('emptyChute', 139, 22.4, 'kitchen');
b.st('primeShields', 160.4, 70, 'engine');
b.st('fuelEngine', 156, 82.6, 'engine');
b.st('fuelCan', 27, 72, 'yard');
b.st('swipeBadge', 56, 40.4, 'platformW');
b.st('stampMail', 56, 63, 'baggage').st('stampMail', 114.5, 39.6, 'office');
b.st('slotCartridge', 122.6, 62, 'waiting');
b.st('medScan', 113, 62, 'waiting');
b.st('unlockManifold', 44, 88, 'shed');
b.st('rechargeGenerator', 43, 88.6, 'shed');
b.st('cleanFilter', 112.6, 85, 'tower');
b.st('alignDish', 121, 80.6, 'tower');

// --- Vents (4 networks) ----------------------------------------------------
b.vent('v-caboose', 8, 47.5, 'rear', ['v-obs', 'v-yard']);
b.vent('v-obs', 26.5, 40.5, 'rear', ['v-caboose', 'v-signal']);
b.vent('v-signal', 31.5, 65.5, 'rear', ['v-obs', 'v-yard']);
b.vent('v-yard', 20, 70, 'rear', ['v-caboose', 'v-signal']);
b.vent('v-sleeper', 69, 32.5, 'middle', ['v-lounge', 'v-baggage']);
b.vent('v-lounge', 81.5, 25.5, 'middle', ['v-sleeper']);
b.vent('v-baggage', 47, 64.5, 'middle', ['v-sleeper']);
b.vent('v-dining', 131.5, 20.5, 'station', ['v-kitchen', 'v-office']);
b.vent('v-kitchen', 155, 21.5, 'station', ['v-dining']);
b.vent('v-office', 113, 35.5, 'station', ['v-dining', 'v-waiting']);
b.vent('v-waiting', 122.5, 66.5, 'station', ['v-office']);
b.vent('v-flatbed', 149, 42.5, 'front', ['v-coal', 'v-engine']);
b.vent('v-coal', 151.5, 49.5, 'front', ['v-flatbed', 'v-tower']);
b.vent('v-engine', 151.5, 76, 'front', ['v-flatbed', 'v-tower']);
b.vent('v-tower', 110.5, 83, 'front', ['v-coal', 'v-engine', 'v-shed']);
b.vent('v-shed', 62.5, 90, 'front', ['v-tower']);

// --- Cameras ---------------------------------------------------------------
b.cam(15, 55, 'West Platform').cam(65, 38, 'Platform Clock').cam(120, 26, 'East Platform');
b.cam(140, 60, 'Engine Platform').cam(98, 85, 'Service Road').cam(75, 83, 'Shed Lane').cam(88, 42, 'Footbridge Stair');

export const EXPRESS_MAP = b.build({
  id: 'express',
  name: 'Midnight Express',
  tagline: 'Snowed in at the last stop. Someone is not getting off.',
  w: 166,
  h: 97,
  theme: {
    sky: '#0b1020',
    void: '#0d0a12',
    wall: '#6b3a24',
    wallTop: '#a86a3c',
    trim: '#c9a227',
    hall: '#e8eef5',
    accent: '#8b1e3f',
    night: '#06070f',
    fog: '#1b2234',
    ambience: 'train',
  },
  spawn: { x: 85, y: 59 },
  meetingRoom: 'tickets',
  eject: 'caboose',
  criticalNames: { meltdown: 'Boiler Overpressure', pressure: 'Brake Line Failure' },
});
