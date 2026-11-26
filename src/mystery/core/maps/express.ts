/**
 * Midnight Express — a snow-bound sleeper train stopped at a mountain
 * station. Two parallel "tracks" of spaces run the length of the map: the
 * train itself (caboose to locomotive, joined by gangways) on the north, the
 * station buildings on the south, with the snowy platform between them and a
 * service road behind the station. Every car opens onto the platform, so the
 * whole map is a ladder of loops rather than one long dead-end corridor.
 */
import { MapBuilder } from './builder';

const b = new MapBuilder();
const WARM = '#fcd34d';

// --- Rooms -----------------------------------------------------------------
// The train (west = caboose, east = locomotive)
b.room('caboose', 'Caboose', [6, 6, 18, 11], 'wood', '#dc2626');
b.room('observation', 'Observation Car', [28, 6, 22, 11], 'carpet', '#60a5fa');
b.room('sleeper', 'Sleeper Car', [54, 6, 24, 11], 'rug', '#7c3aed');
b.room('lounge', 'Piano Lounge', [82, 6, 24, 11], 'carpet', '#9f1239');
b.room('dining', 'Dining Car', [110, 6, 26, 11], 'checker', '#c2410c');
b.room('kitchen', 'Kitchen Car', [140, 6, 20, 11], 'tile', '#eab308');
b.room('coal', 'Coal Tender', [164, 6, 16, 11], 'metal', '#57534e', { outdoor: true, cold: true });
b.room('engine', 'Locomotive', [184, 5, 24, 13], 'metal', '#b45309');
// The platform (two halves joined under the footbridge)
b.room('platformW', 'West Platform', [6, 22, 94, 8], 'snow', '#cbd5e1', { outdoor: true, cold: true });
b.lamps.pop(); // lit by lamp posts instead of one giant light
b.room('platformE', 'East Platform', [104, 22, 104, 8], 'snow', '#94a3b8', { outdoor: true, cold: true });
b.lamps.pop();
// The station
b.room('yard', 'Snowy Yard', [6, 36, 30, 26], 'snow', '#e0f2fe', { outdoor: true, cold: true });
b.room('signal', 'Signal Box', [40, 40, 14, 12], 'wood', '#16a34a');
b.room('baggage', 'Baggage Room', [58, 38, 20, 16], 'wood', '#a16207', { cold: true });
b.room('tickets', 'Ticket Hall', [82, 36, 30, 22], 'stone', '#8b1e3f');
b.room('waiting', 'Waiting Room', [116, 38, 20, 16], 'carpet', '#0f766e');
b.room('office', "Stationmaster's Office", [140, 40, 16, 12], 'rug', '#4338ca');
b.room('shed', 'Engine Shed', [160, 36, 24, 24], 'stone', '#64748b', { cold: true });
b.room('tower', 'Water Tower', [188, 38, 20, 20], 'snow', '#0284c7', { outdoor: true, cold: true });

// --- Gangways between cars --------------------------------------------------
b.hall([24, 10, 4, 3], 'wood'); // caboose <-> observation
b.door('sleeper', [50, 10, 4, 3]); // observation <-> sleeper
b.hall([78, 10, 4, 3], 'wood'); // sleeper <-> lounge
b.door('dining', [106, 10, 4, 3], 'Dining Car'); // lounge <-> dining
b.hall([136, 10, 4, 3], 'wood'); // dining <-> kitchen
b.door('coal', [160, 10, 4, 3]); // kitchen <-> coal
b.hall([180, 10, 4, 3], 'metal'); // coal <-> locomotive

// --- Train doors onto the platform -------------------------------------------
b.door('caboose', [14, 17, 3, 5], 'Caboose');
b.door('observation', [38, 17, 3, 5]);
b.door('sleeper', [64, 17, 3, 5]);
b.door('lounge', [92, 17, 3, 5]);
b.door('dining', [116, 17, 3, 5]).door('dining', [128, 17, 3, 5]);
b.door('kitchen', [148, 17, 3, 5]);
b.door('engine', [190, 18, 3, 4], 'Engine Cab');
// Footbridge between the platform halves
b.hall([100, 24, 4, 4], 'stone');

// --- Station doors onto the platform ------------------------------------------
b.door('yard', [18, 30, 4, 6]);
b.door('signal', [45, 30, 3, 10], 'Signal Box');
b.door('baggage', [66, 30, 3, 8]);
b.door('tickets', [88, 30, 3, 6], 'Ticket Hall West').door('tickets', [104, 30, 3, 6], 'Ticket Hall East');
b.door('waiting', [124, 30, 3, 8]);
b.door('office', [146, 30, 3, 10]);
b.door('shed', [170, 30, 3, 6]);
b.door('tower', [196, 30, 3, 8]);
// Station room-to-room passages
b.hall([36, 44, 4, 3], 'snow'); // yard <-> signal
b.hall([54, 44, 4, 3], 'wood'); // signal <-> baggage
b.hall([78, 44, 4, 3], 'stone'); // baggage <-> tickets
b.hall([112, 44, 4, 3], 'stone'); // tickets <-> waiting
b.hall([136, 44, 4, 3], 'wood'); // waiting <-> office
b.hall([156, 44, 4, 3], 'stone'); // office <-> shed
b.hall([184, 46, 4, 3], 'snow'); // shed <-> tower
// Service road behind the station
b.hall([6, 64, 202, 3], 'snow');
b.door('yard', [20, 62, 3, 2]);
b.door('tickets', [95, 58, 3, 6]);
b.door('shed', [170, 60, 3, 4]);
b.door('tower', [196, 58, 3, 6]);

// --- Props -----------------------------------------------------------------
// Caboose
b.prop('stove', 8.5, 7.5, { label: 'POT BELLY' });
b.prop('bed', 20.5, 7, { w: 3, h: 2, color: '#7f1d1d' });
b.prop('desk', 8, 15.5, { w: 2, h: 1 });
b.prop('chair', 10.5, 15);
b.prop('window', 15, 6.2, { w: 6, h: 0.3, solid: false });
b.prop('barrel', 22.5, 15.5);
// Observation car
b.prop('window', 39, 6.2, { w: 20, h: 0.3, solid: false });
b.prop('sofa', 32, 7.5, { w: 4, h: 1, color: '#1e3a8a' }).prop('sofa', 46, 7.5, { w: 4, h: 1, color: '#1e3a8a' });
b.prop('telescope', 39, 8, { w: 2, h: 2 });
b.prop('plant', 29, 15.5);
b.prop('bench', 33, 15.5, { w: 4, h: 1 });
// Sleeper car: compartment partitions break sightlines down the car
b.prop('shelf', 58.5, 7.5, { w: 1, h: 3, color: '#5b21b6' }).prop('shelf', 63.5, 7.5, { w: 1, h: 3, color: '#5b21b6' });
b.prop('shelf', 68.5, 7.5, { w: 1, h: 3, color: '#5b21b6' }).prop('shelf', 73.5, 7.5, { w: 1, h: 3, color: '#5b21b6' });
b.prop('bed', 56, 7, { w: 2, h: 2, color: '#ddd6fe' }).prop('bed', 66, 7, { w: 2, h: 2, color: '#ddd6fe' }).prop('bed', 76, 7, { w: 2, h: 2, color: '#ddd6fe' });
b.prop('locker', 58.5, 15.5).prop('crate', 72.5, 15.5, { label: 'LUGGAGE' });
// Piano lounge
b.prop('piano', 86.5, 8, { w: 3, h: 2, color: '#1c1917' });
b.prop('sofa', 100, 7.5, { w: 4, h: 1, color: '#9f1239' });
b.prop('counter', 99, 15.5, { w: 6, h: 1, label: 'BAR', color: '#78350f' });
b.prop('rug', 93, 11, { w: 8, h: 4, solid: false, color: '#be123c' });
b.prop('turntable', 88, 15.5, { w: 1.5, h: 1.5 });
b.prop('lamp', 83, 7, { solid: false, color: WARM });
// Dining car
b.prop('table', 114, 7.5, { w: 2, h: 1, color: '#fef3c7' }).prop('table', 120, 7.5, { w: 2, h: 1, color: '#fef3c7' });
b.prop('table', 126, 7.5, { w: 2, h: 1, color: '#fef3c7' }).prop('table', 132, 7.5, { w: 2, h: 1, color: '#fef3c7' });
b.prop('table', 112, 15.5, { w: 2, h: 1, color: '#fef3c7' }).prop('table', 123, 15.5, { w: 2, h: 1, color: '#fef3c7' });
b.prop('clock', 123, 6.2, { solid: false });
// Kitchen car
b.prop('stove', 143, 7.5, { w: 2, h: 1 });
b.prop('counter', 148, 7.5, { w: 4, h: 1 });
b.prop('fridge', 158, 7.5, { w: 2, h: 1 });
b.prop('counter', 143, 15.5, { w: 4, h: 1 });
b.prop('barrel', 156.5, 15.5, { label: 'FLOUR' });
// Coal tender
b.prop('rock', 168.5, 8, { w: 5, h: 2, label: 'COAL', color: '#1c1917' });
b.prop('rock', 176.5, 15, { w: 5, h: 2, color: '#1c1917' });
b.prop('snowpile', 165.5, 15.5);
b.prop('cart', 177, 7.5, { w: 2, h: 1 });
// Locomotive
b.prop('engine', 201, 11, { w: 8, h: 4, label: 'BOILER', color: '#292524' });
b.prop('fireplace', 193, 6.5, { w: 2, h: 1, label: 'FIREBOX' });
b.prop('console', 188, 6.5, { w: 4, h: 1, label: 'GAUGES' });
b.prop('pipe', 201, 6, { w: 10, h: 0.5, solid: false });
b.prop('clock', 205, 5.2, { solid: false, label: 'PRESSURE' });
// West platform
b.prop('pillar', 10.5, 25.5).prop('pillar', 28.5, 25.5).prop('pillar', 52.5, 25.5).prop('pillar', 76.5, 25.5).prop('pillar', 96.5, 25.5);
b.prop('bench', 34, 23, { w: 3, h: 1 }).prop('bench', 58, 28.5, { w: 3, h: 1 });
b.prop('snowpile', 7.5, 28.5, { w: 2, h: 1 });
b.prop('cart', 60, 23.5, { w: 2, h: 1, label: 'LUGGAGE' });
b.prop('clock', 50, 22.2, { solid: false, label: 'MIDNIGHT' });
b.prop('mailbox', 82.5, 28.5);
b.prop('poster', 70, 29.8, { w: 4, h: 0.2, solid: false, label: 'TIMETABLE' });
// East platform
b.prop('pillar', 112.5, 25.5).prop('pillar', 136.5, 25.5).prop('pillar', 160.5, 25.5).prop('pillar', 184.5, 25.5).prop('pillar', 204.5, 25.5);
b.prop('bench', 140, 23, { w: 3, h: 1 }).prop('bench', 176, 28.5, { w: 3, h: 1 });
b.prop('snowpile', 206.5, 28.5);
b.prop('cart', 156, 23.5, { w: 2, h: 1 });
b.prop('poster', 150, 29.8, { w: 4, h: 0.2, solid: false, label: 'MIDNIGHT EXPRESS' });
// Snowy yard
b.prop('tree', 10, 40, { w: 2, h: 2, color: '#14532d' }).prop('tree', 30, 40, { w: 2, h: 2, color: '#14532d' });
b.prop('tree', 12, 56, { w: 2, h: 2, color: '#14532d' });
b.prop('snowpile', 16.5, 48, { w: 3, h: 2 }).prop('snowpile', 8.5, 50.5);
b.prop('statue', 26.5, 46.5, { label: 'SNOWMAN', color: '#f8fafc' });
b.prop('crate', 33.5, 59.5, { label: 'FIREWOOD', color: '#78350f' });
// Signal box
b.prop('console', 47, 49.5, { w: 6, h: 1, label: 'LEVERS', color: '#166534' });
b.prop('window', 47, 40.2, { w: 8, h: 0.3, solid: false });
b.prop('desk', 51, 41.5, { w: 2, h: 1 });
b.prop('chair', 47, 48);
b.prop('shelf', 41.5, 50.5);
// Baggage room
b.prop('shelf', 62, 41.5, { w: 4, h: 1 }).prop('shelf', 73, 41.5, { w: 4, h: 1 });
b.prop('shelf', 62, 50.5, { w: 4, h: 1 }).prop('shelf', 73, 50.5, { w: 4, h: 1 });
b.prop('crate', 76.5, 52.5, { label: 'TRUNK' });
b.prop('cart', 68, 49.5, { w: 2, h: 1 });
b.prop('mailbox', 59, 39);
// Ticket hall (meeting)
b.prop('roundTable', 97, 47, { w: 2, h: 2, color: '#fde68a' });
b.prop('rug', 97, 47, { w: 10, h: 8, solid: false, color: '#8b1e3f' });
b.prop('counter', 88, 55.5, { w: 8, h: 1, label: 'TICKETS', color: '#78350f' });
b.prop('counter', 106, 55.5, { w: 6, h: 1, color: '#78350f' });
b.prop('clock', 97, 36.2, { w: 2, h: 0.4, solid: false, label: 'STATION CLOCK' });
b.prop('pillar', 86.5, 40.5).prop('pillar', 107.5, 40.5).prop('pillar', 86.5, 51.5).prop('pillar', 107.5, 51.5);
b.prop('plant', 83, 37);
// Waiting room
b.prop('fireplace', 126, 52.5, { w: 3, h: 1 });
b.prop('sofa', 121, 49.5, { w: 4, h: 1, color: '#115e59' }).prop('sofa', 131, 49.5, { w: 4, h: 1, color: '#115e59' });
b.prop('bookshelf', 118.5, 39.5, { w: 3, h: 1 });
b.prop('arcade', 134.5, 39.5, { label: 'PENNY ARCADE' });
b.prop('tree', 133, 52, { w: 2, h: 2, label: 'XMAS TREE', color: '#15803d' });
// Stationmaster's office
b.prop('desk', 148, 49.5, { w: 4, h: 1 });
b.prop('bookshelf', 142.5, 40.5, { w: 3, h: 1 });
b.prop('locker', 154.5, 40.5, { label: 'SAFE', color: '#1e1b4b' });
b.prop('chair', 148, 48.2);
// Engine shed (parked freight cars)
b.prop('crate', 171, 42, { w: 10, h: 3, label: 'FREIGHT 42', color: '#7c2d12' });
b.prop('tank', 171, 52, { w: 8, h: 3, label: 'TANKER', color: '#334155' });
b.prop('generator', 180.5, 38, { w: 3, h: 2 });
b.prop('barrel', 163, 57.5, { w: 2, h: 1 });
b.prop('pipe', 172, 36.5, { w: 8, h: 0.5, solid: false });
// Water tower
b.prop('tank', 198, 47, { w: 4, h: 4, label: 'WATER', color: '#0369a1' });
b.prop('tree', 191, 40, { w: 2, h: 2, color: '#14532d' }).prop('tree', 205, 55, { w: 2, h: 2, color: '#14532d' });
b.prop('snowpile', 191.5, 55.5, { w: 3, h: 1 });
b.prop('dish', 204, 47, { w: 2, h: 2, label: 'TELEGRAPH' });
// Service road

// Lamp posts along the platform and road
for (const x of [18, 40, 64, 88, 116, 142, 168, 194]) b.lamp(x, 26, 9, WARM);
for (const x of [30, 70, 110, 150, 190]) b.lamp(x, 65, 6, '#bae6fd');
b.lamp(102, 26, 4, WARM);

// --- Stations --------------------------------------------------------------
b.st('emergency', 97, 47, 'tickets');
b.st('admin', 88, 54.2, 'tickets');
b.st('upload', 106, 54.2, 'tickets');
b.st('cams', 47, 48.6, 'signal');
b.st('doorlog', 52.5, 50.5, 'signal');
b.st('vitals', 70.5, 15.5, 'sleeper');
b.st('lightsPanel', 161, 37.5, 'shed');
b.st('commsPanel', 150.5, 48.2, 'office');
b.st('meltdownA', 195, 15.5, 'engine').st('meltdownB', 171.5, 12, 'coal');
b.st('pressureA', 7, 11, 'caboose').st('pressureB', 154.5, 50.5, 'office');
b.st('recharge', 30, 13, 'observation').st('recharge', 134.5, 15.5, 'dining').st('recharge', 76.5, 46, 'baggage').st('recharge', 206.5, 51, 'tower');
// Tasks
b.st('fixWiring', 22.5, 9, 'caboose').st('fixWiring', 55, 15.5, 'sleeper').st('fixWiring', 179, 13, 'coal').st('fixWiring', 182.5, 58.5, 'shed').st('fixWiring', 63, 39, 'baggage');
b.st('replaceFuse', 12, 15.5, 'caboose').st('replaceFuse', 118, 15.5, 'dining').st('replaceFuse', 176, 45, 'shed');
b.st('rerouteTube', 20, 15.5, 'caboose').st('rerouteTube', 70, 46, 'baggage').st('rerouteTube', 152, 15.5, 'kitchen').st('rerouteTube', 206.5, 44, 'tower');
b.st('lightLantern', 7, 8.5, 'caboose').st('lightLantern', 7, 60.5, 'yard').st('lightLantern', 148, 28.5, 'platformE');
b.st('lightLantern', 189, 56.5, 'tower').st('lightLantern', 178.5, 8.5, 'coal');
b.st('download', 147, 9, 'kitchen').st('download', 42, 42, 'signal').st('download', 130, 40, 'waiting').st('download', 45, 12.5, 'observation');
b.st('chartCourse', 39, 9.6, 'observation');
b.st('waterPlants', 48.5, 14, 'observation').st('waterPlants', 117.5, 51, 'waiting');
b.st('keypadCode', 61, 9, 'sleeper').st('keypadCode', 154.5, 42.5, 'office');
b.st('distillReel', 71, 9, 'sleeper');
b.st('sortClips', 103, 9, 'lounge');
b.st('simonSays', 86.5, 9.6, 'lounge');
b.st('calibrateTurntable', 89.6, 15.5, 'lounge');
b.st('fixWiring', 104.5, 15.5, 'lounge');
b.st('sortBerries', 144.5, 9, 'kitchen').st('sortBerries', 31.5, 43, 'yard').st('sortBerries', 135, 46, 'waiting');
b.st('juicePress', 129, 9.6, 'dining');
b.st('emptyChute', 158.5, 15.5, 'kitchen');
b.st('primeShields', 186, 15, 'engine');
b.st('fuelEngine', 196.5, 11, 'engine');
b.st('fuelCan', 8, 60, 'yard');
b.st('swipeBadge', 84, 23, 'platformW');
b.st('stampMail', 66, 44, 'baggage').st('stampMail', 145.5, 49.8, 'office');
b.st('slotCartridge', 122, 40.5, 'waiting');
b.st('medScan', 126, 45, 'waiting');
b.st('unlockManifold', 166, 47, 'shed');
b.st('rechargeGenerator', 180.5, 40.2, 'shed');
b.st('cleanFilter', 200.6, 47, 'tower');
b.st('alignDish', 204, 49.4, 'tower');

// --- Vents (4 networks) ----------------------------------------------------
b.vent('v-caboose', 18, 13, 'rear', ['v-yard', 'v-signal']);
b.vent('v-yard', 20, 42, 'rear', ['v-caboose', 'v-signal']);
b.vent('v-signal', 50, 45, 'rear', ['v-caboose', 'v-yard']);
b.vent('v-sleeper', 61, 12.5, 'middle', ['v-baggage', 'v-lounge']);
b.vent('v-baggage', 74, 46, 'middle', ['v-sleeper', 'v-lounge']);
b.vent('v-lounge', 95, 14, 'middle', ['v-sleeper', 'v-baggage']);
b.vent('v-dining', 124, 11, 'station', ['v-waiting']);
b.vent('v-waiting', 128, 42, 'station', ['v-dining', 'v-kitchen']);
b.vent('v-kitchen', 155, 12, 'station', ['v-waiting']);
b.vent('v-coal', 172, 14.5, 'front', ['v-shed', 'v-tower', 'v-engine']);
b.vent('v-shed', 164, 48, 'front', ['v-coal', 'v-tower']);
b.vent('v-tower', 193, 50, 'front', ['v-coal', 'v-shed']);
b.vent('v-engine', 206, 16, 'front', ['v-coal']);

// --- Cameras ---------------------------------------------------------------
b.cam(30, 26, 'West Platform').cam(80, 26, 'Platform Clock').cam(126, 26, 'East Platform');
b.cam(178, 26, 'Engine Platform').cam(50, 65, 'Service Road West').cam(150, 65, 'Service Road East');
b.cam(102, 26, 'Footbridge');

export const EXPRESS_MAP = b.build({
  id: 'express',
  name: 'Midnight Express',
  tagline: 'Snowed in at the last stop. Someone is not getting off.',
  w: 214,
  h: 70,
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
  spawn: { x: 97, y: 42 },
  meetingRoom: 'tickets',
  eject: 'caboose',
  criticalNames: { meltdown: 'Boiler Overpressure', pressure: 'Brake Line Failure' },
});
