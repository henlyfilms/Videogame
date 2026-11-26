/**
 * Orbital Greenhouse — a berry farm bolted onto a captured asteroid. The
 * octagonal Observation Dome is the hub; spokes of different widths bend out
 * to a sprawl of modules: the long Berry Bay Alpha and the Fusion Core to the
 * north, the Shuttle Dock wing to the west (with an EVA walk round the outer
 * hull), crew modules to the south-west, and to the east the station sits on
 * open Crater Rim rock, with Berry Bay Beta, the Solar Deck and the Escape
 * Pods strung out beyond it. The Signal Mast pokes up off the north-east.
 */
import { chamfer, MapBuilder } from './builder';

const b = new MapBuilder();
const SPOKE = '#a5f3fc';

// --- Rooms -----------------------------------------------------------------
b.room('dome', 'Observation Dome', chamfer(54, 38, 30, 30, 8), 'tile', '#2dd4bf');
b.room('berryA', 'Berry Bay Alpha', chamfer(48, 6, 30, 16, [5, 5, 0, 0]), 'grass', '#22c55e');
b.room('seedlab', 'Seed Lab', chamfer(26, 14, 18, 13, [0, 0, 0, 4]), 'tile', '#84cc16');
b.room('hull', 'Hull Walk', [10, 6, 24, 3], 'metal', '#94a3b8', {
  outdoor: true,
  cold: true,
  extra: [
    [10, 9, 3, 15],
    [31, 9, 3, 3],
    [14, 2, 8, 4],
  ],
});
b.room('airlock', 'EVA Airlock', [8, 26, 12, 10], 'metal', '#f97316', { cold: true });
b.room('dock', 'Shuttle Dock', chamfer(4, 40, 26, 22, [6, 0, 0, 6]), 'metal', '#38bdf8');
b.room('infirmary', 'Infirmary Pod', chamfer(14, 70, 18, 14, 4), 'tile', '#f0abfc');
b.room('bunks', 'Bunk Ring', chamfer(36, 84, 22, 14, [0, 0, 4, 4]), 'carpet', '#c084fc');
b.room('galley', 'Galley', chamfer(60, 76, 18, 12, [3, 3, 0, 0]), 'checker', '#fbbf24');
b.room('fern', 'Fern Lung', [80, 84, 22, 13], 'grass', '#4ade80', { extra: [[90, 76, 12, 8]] });
b.room('water', 'Water Reclamation', chamfer(108, 84, 20, 14, 3), 'tile', '#0ea5e9');
b.room('pods', 'Escape Pods', chamfer(130, 88, 18, 12, [0, 0, 4, 4]), 'metal', '#fb7185', { cold: true });
b.room('solar', 'Solar Deck', [136, 60, 12, 24], 'metal', '#facc15', { outdoor: true, cold: true });
b.room('berryB', 'Berry Bay Beta', chamfer(112, 60, 22, 16, [0, 0, 4, 0]), 'grass', '#10b981');
b.room('crater', 'Crater Rim', [86, 58, 22, 16], 'stone', '#a78bfa', { outdoor: true, cold: true, extra: [[100, 52, 10, 6]] });
b.room('cargo', 'Cargo Hold', chamfer(122, 38, 24, 18, [4, 0, 0, 4]), 'metal', '#94a3b8', { cold: true });
b.room('mast', 'Signal Mast', chamfer(120, 4, 16, 14, [0, 4, 0, 0]), 'carpet', '#818cf8', { extra: [[124, 18, 6, 10]] });
b.room('core', 'Fusion Core', chamfer(90, 10, 24, 20, 5), 'metal', '#ef4444');
b.room('watch', 'Watch Room', [92, 42, 11, 9], 'carpet', '#64748b');

// --- Spokes and passages ------------------------------------------------------
// North spoke: Dome -> Berry Bay Alpha (dog-leg)
b.door('dome', [62, 35, 3, 3], 'Dome North');
b.path(3, [[67, 22], [67, 29], [62, 29], [62, 34]], 'metal');
b.door('berryA', [67, 22, 3, 2]);
// North-west spoke: Dome -> Seed Lab
b.path(3, [[36, 29], [36, 42], [56, 42]], 'metal');
b.door('seedlab', [36, 27, 3, 2], 'Seed Lab');
// Seed Lab <-> Berry Bay Alpha, Seed Lab <-> Hull Walk hatch
b.hall([44, 16, 4, 3], 'metal');
b.door('seedlab', [31, 12, 3, 2]);
// Hull Walk -> Airlock -> Dock
b.door('airlock', [10, 24, 3, 2], 'Airlock');
b.hall([12, 36, 3, 4], 'metal');
// West spoke: Dock -> Dome (wide, bent)
b.door('dock', [30, 52, 2, 4]);
b.path(4, [[32, 52], [40, 52], [40, 48], [50, 48], [50, 50]], 'metal');
// Dock -> Infirmary -> Bunk Ring
b.path(3, [[20, 62], [20, 66]], 'metal');
b.door('infirmary', [20, 68, 3, 2], 'Infirmary');
b.path(3, [[32, 76], [40, 76], [40, 80]], 'metal');
b.door('bunks', [40, 82, 3, 2]);
// South spoke: Dome -> Galley; galley side doors to Bunks and Fern Lung
b.path(4, [[66, 68], [66, 72]], 'metal');
b.door('galley', [66, 74, 4, 2], 'Galley');
b.door('galley', [58, 85, 2, 3]);
b.door('fern', [78, 85, 2, 3]);
// Fern Lung <-> Water <-> Pods
b.hall([102, 89, 4, 3], 'metal');
b.door('water', [106, 89, 2, 3]);
b.hall([128, 92, 2, 3], 'metal');
// East spine: Dome -> Watch Room / Fusion Core / Crater Rim
b.path(3, [[84, 51], [88, 51]], 'metal');
b.door('dome', [84, 51, 2, 3], 'Dome East');
b.path(3, [[88, 58], [88, 36], [98, 36], [98, 32]], 'metal');
b.door('core', [98, 30, 3, 2], 'Core South');
b.door('watch', [91, 45, 1, 3]);
// Core <-> Berry Bay Alpha, Core -> Mast stem
b.path(3, [[78, 16], [86, 16]], 'metal');
b.door('core', [88, 16, 2, 3]);
b.path(2, [[114, 22], [120, 22]], 'metal');
b.door('mast', [122, 22, 2, 2]);
// Mast stem -> Cargo -> Berry Bay Beta -> Solar -> Pods
b.path(3, [[125, 28], [125, 34]], 'metal');
b.door('cargo', [125, 36, 3, 2], 'Cargo');
b.hall([128, 56, 3, 4], 'metal');
b.door('berryB', [134, 64, 2, 3]);
b.path(3, [[140, 84], [140, 85]], 'metal');
b.door('pods', [140, 86, 3, 2]);
// Crater Rim exits: Berry Bay Beta airlock, Fern Lung hatch
b.hall([108, 64, 2, 3], 'stone');
b.door('berryB', [110, 64, 2, 3]);
b.door('fern', [94, 74, 4, 2], 'Fern Lung');

// --- Props -----------------------------------------------------------------
// Observation Dome (meeting)
b.prop('roundTable', 69, 53, { w: 2, h: 2, color: '#ccfbf1' });
b.prop('rug', 69, 53, { w: 10, h: 10, solid: false, color: '#99f6e4' });
b.prop('window', 69, 38.2, { w: 14, h: 0.3, solid: false });
b.prop('window', 69, 67.8, { w: 14, h: 0.3, solid: false });
b.prop('telescope', 61, 43, { w: 2, h: 2 });
b.prop('statue', 77.5, 43.5, { label: 'FIRST SPROUT', color: '#22c55e' });
b.prop('planter', 60.5, 62.5, { w: 3, h: 1 }).prop('planter', 77.5, 62.5, { w: 3, h: 1 });
b.prop('plant', 56.5, 57.5).prop('plant', 81.5, 57.5).prop('plant', 56.5, 47.5).prop('plant', 81.5, 47.5);
b.prop('bench', 64, 58.5, { w: 3, h: 1 }).prop('bench', 74, 58.5, { w: 3, h: 1 });
// Berry Bay Alpha
for (const x of [54, 63, 72]) b.prop('planter', x, 11.5, { w: 6, h: 1, color: '#16a34a' });
b.prop('planter', 54, 15.5, { w: 6, h: 1, color: '#16a34a' }).prop('planter', 63, 15.5, { w: 6, h: 1, color: '#16a34a' });
b.prop('planter', 54, 19.5, { w: 6, h: 1, color: '#16a34a' }).prop('planter', 74, 19.5, { w: 4, h: 1, color: '#16a34a' });
b.prop('tank', 63, 19, { w: 2, h: 2, label: 'NUTRIENT', color: '#5eead4' });
b.prop('lamp', 58.5, 13.5, { solid: false, color: '#f0abfc' }).prop('lamp', 67.5, 17.5, { solid: false, color: '#f0abfc' });
b.prop('window', 62, 6.2, { w: 18, h: 0.3, solid: false });
// Seed Lab
b.prop('counter', 28.5, 14.5, { w: 3, h: 1, color: '#ecfccb' }).prop('counter', 38, 14.5, { w: 6, h: 1, color: '#ecfccb' });
b.prop('fridge', 42.5, 21.5, { label: 'SEED VAULT' });
b.prop('planter', 31, 20.5, { w: 4, h: 1 });
b.prop('tube', 26.5, 22.5, { solid: true });
b.prop('table', 39, 19, { w: 3, h: 2, label: 'SPROUT TRAYS', color: '#bef264' });
// Hull Walk
b.prop('dish', 18, 3, { w: 2, h: 2 });
b.prop('pipe', 22, 8.6, { w: 18, h: 0.4, solid: false });
b.prop('pipe', 10.4, 16, { w: 0.4, h: 12, solid: false });
b.prop('lamp', 28.5, 7.5, { solid: false });
// EVA Airlock
b.prop('locker', 8.5, 29.5, { color: '#f97316' }).prop('locker', 8.5, 30.5, { color: '#f97316' }).prop('locker', 8.5, 31.5, { color: '#f97316', label: 'EVA SUITS' });
b.prop('bench', 16, 33.5, { w: 3, h: 1 });
b.prop('window', 16, 26.2, { w: 5, h: 0.3, solid: false });
b.prop('poster', 19.8, 31, { w: 0.2, h: 3, solid: false, label: 'CYCLE FIRST' });
// Shuttle Dock
b.prop('engine', 12, 50, { w: 6, h: 6, label: 'SHUTTLE KESTREL', color: '#e2e8f0' });
b.prop('tank', 8, 58, { w: 2, h: 2, label: 'FUEL', color: '#f59e0b' });
b.prop('crate', 24, 43, { w: 2, h: 2 }).prop('crate', 26.5, 45.5).prop('crate', 21.5, 42.5);
b.prop('cart', 25, 57.5, { w: 2, h: 1 });
b.prop('console', 12, 55.5, { w: 4, h: 1, label: 'NAV' });
b.prop('barrel', 27.5, 59.5);
// Infirmary Pod
b.prop('bed', 28, 75.5, { w: 2, h: 3 }).prop('bed', 28, 79.5, { w: 2, h: 3 });
b.prop('screen', 22, 70.3, { w: 4, h: 0.4, solid: false, label: 'VITALS' });
b.prop('counter', 17.5, 80, { w: 3, h: 1, color: '#fdf4ff' });
b.prop('locker', 15.5, 75.5, { color: '#f0abfc' });
b.prop('plant', 26.5, 82.5);
// Bunk Ring
b.prop('bed', 38, 88, { w: 2, h: 3, color: '#c4b5fd' }).prop('bed', 38, 92.5, { w: 2, h: 3, color: '#c4b5fd' });
b.prop('bed', 53, 92.5, { w: 2, h: 3, color: '#c4b5fd' }).prop('bed', 49, 92.5, { w: 2, h: 3, color: '#c4b5fd' });
b.prop('turntable', 47, 86.5, { w: 1.5, h: 1.5 });
b.prop('sofa', 46, 96, { w: 4, h: 1 });
b.prop('arcade', 41.5, 95.5);
b.prop('poster', 47, 84.2, { w: 4, h: 0.2, solid: false, label: 'GROW TOGETHER' });
// Galley
b.prop('stove', 62, 80.5, { w: 2, h: 1 });
b.prop('counter', 73.5, 79.5, { w: 3, h: 1 });
b.prop('fridge', 76.5, 80.5);
b.prop('table', 68, 83, { w: 4, h: 2, color: '#fde68a' });
b.prop('chair', 65.5, 83.5).prop('chair', 70.5, 83.5);
b.prop('barrel', 76.5, 82.5, { label: 'JUICE' });
// Fern Lung
b.prop('tree', 84, 88, { w: 2, h: 2 }).prop('tree', 87, 94, { w: 2, h: 2 });
b.prop('planter', 95, 89.5, { w: 4, h: 1 }).prop('planter', 95, 93.5, { w: 4, h: 1 });
b.prop('tank', 99, 80, { w: 2, h: 2, label: 'AIR', color: '#bbf7d0' });
b.prop('plant', 91.5, 77.5).prop('plant', 100.5, 95.5);
// Water Reclamation
b.prop('tank', 112.5, 88.5, { w: 3, h: 3, label: 'GREY', color: '#94a3b8' });
b.prop('tank', 112.5, 93.5, { w: 3, h: 3, label: 'CLEAN', color: '#7dd3fc' });
b.prop('tank', 123.5, 93.5, { w: 3, h: 3, color: '#38bdf8' });
b.prop('fountain', 118, 90, { w: 2, h: 2 });
b.prop('pipe', 118, 84.4, { w: 12, h: 0.4, solid: false });
// Escape Pods
b.prop('engine', 136.5, 96.5, { w: 3, h: 3, label: 'POD 1', color: '#fecdd3' });
b.prop('engine', 141.5, 96.5, { w: 3, h: 3, label: 'POD 2', color: '#fecdd3' });
b.prop('console', 145.5, 91.5, { w: 1, h: 3, label: 'LAUNCH' });
b.prop('bench', 134, 89.5, { w: 3, h: 1 });
b.prop('poster', 138, 88.2, { w: 4, h: 0.2, solid: false, label: 'ABANDON SHIP' });
// Solar Deck (outside)
for (const y of [62, 70, 76]) b.prop('table', 142, y, { w: 6, h: 2, label: 'PANEL', color: '#1e3a8a' });
b.prop('dish', 145, 66, { w: 2, h: 2 });
b.prop('generator', 138.5, 80, { w: 1, h: 2 });
b.prop('rock', 146.5, 82.5);
// Berry Bay Beta
b.prop('tree', 116, 64, { w: 2, h: 2, label: 'BLUEBERRY', color: '#1d4ed8' });
b.prop('tree', 124, 64, { w: 2, h: 2, label: 'RASPBERRY', color: '#be123c' });
b.prop('planter', 118, 69.5, { w: 6, h: 1, color: '#15803d' }).prop('planter', 127, 69.5, { w: 6, h: 1, color: '#15803d' });
b.prop('tank', 131, 73, { w: 2, h: 2, color: '#5eead4' });
b.prop('lamp', 120, 61.5, { solid: false, color: '#f0abfc' });
// Crater Rim (asteroid surface)
b.prop('rock', 93.5, 62, { w: 3, h: 2 }).prop('rock', 101, 62, { w: 2, h: 2 }).prop('rock', 89, 68, { w: 2, h: 2 });
b.prop('rock', 100.5, 70, { w: 3, h: 2 }).prop('rock', 106, 71, { w: 2, h: 2 }).prop('rock', 104, 55, { w: 2, h: 2 });
b.prop('rock', 96.5, 66.5).prop('rock', 86.5, 64.5).prop('rock', 107.5, 52.5);
b.prop('telescope', 92, 71, { w: 2, h: 2 });
b.prop('lamp', 97.5, 59.5, { solid: false });
// Cargo Hold
b.prop('crate', 131, 42, { w: 2, h: 2 }).prop('crate', 142, 41, { w: 2, h: 2 }).prop('crate', 143.5, 43.5);
b.prop('shelf', 138, 54.5, { w: 4, h: 1 }).prop('shelf', 133, 54.5, { w: 4, h: 1 });
b.prop('cart', 135, 47.5, { w: 2, h: 1 });
b.prop('desk', 128, 48.5, { w: 4, h: 1, label: 'MANIFESTS' });
b.prop('barrel', 144.5, 50.5).prop('barrel', 143.5, 50.5);
b.prop('mailbox', 122.5, 43.5);
// Signal Mast
b.prop('dish', 128, 7, { w: 2, h: 2 });
b.prop('server', 134.5, 10.5).prop('server', 134.5, 11.5);
b.prop('table', 124.5, 13, { w: 3, h: 2, label: 'STATION MAP', color: '#4c1d95' });
b.prop('screen', 126, 4.2, { w: 8, h: 0.4, solid: false, label: 'DEEP SPACE NET' });
b.prop('pipe', 129.6, 22, { w: 0.4, h: 8, solid: false, label: 'LADDER' });
// Fusion Core
b.prop('engine', 102, 20, { w: 6, h: 4, label: 'FUSION CORE', color: '#f87171' });
b.prop('pipe', 102, 10.4, { w: 12, h: 0.4, solid: false });
b.prop('tank', 95, 15, { w: 2, h: 2, color: '#fca5a5' }).prop('tank', 109, 15, { w: 2, h: 2, color: '#fca5a5' });
b.prop('generator', 95.5, 26, { w: 3, h: 2 });
b.prop('console', 104, 25.5, { w: 4, h: 1, label: 'CORE CONTROL' });
b.prop('pillar', 98.5, 16.5).prop('pillar', 105.5, 16.5);
// Watch Room
b.prop('console', 97, 42.6, { w: 6, h: 1, label: 'CAMS' });
b.prop('chair', 95.5, 44.5).prop('chair', 98.5, 44.5);
b.prop('server', 101.5, 48.5, { w: 1, h: 2 });
b.prop('desk', 96.5, 49.5, { w: 3, h: 1 });
b.prop('locker', 92.5, 49.5);
// Spoke dressing
b.prop('plant', 38.5, 30.5).prop('poster', 69, 29.2, { w: 4, h: 0.2, solid: false, label: 'DOME' });
b.lamp(37, 40, 4, SPOKE).lamp(45, 50, 4, SPOKE).lamp(65, 28, 4, SPOKE).lamp(89, 45, 4, SPOKE).lamp(68, 71, 4, SPOKE).lamp(36, 77, 4, SPOKE).lamp(126, 32, 4, SPOKE).lamp(20, 64, 4, SPOKE);

// --- Stations --------------------------------------------------------------
b.st('emergency', 69, 53, 'dome');
b.st('admin', 121, 15.4, 'mast');
b.st('cams', 97, 43.6, 'watch');
b.st('vitals', 22, 71.4, 'infirmary');
b.st('doorlog', 102.4, 44, 'watch');
b.st('lightsPanel', 80.6, 94, 'fern');
b.st('commsPanel', 134.4, 15, 'mast');
b.st('meltdownA', 92.6, 13, 'core').st('meltdownB', 111.4, 26, 'core');
b.st('pressureA', 19.4, 34.4, 'airlock').st('pressureB', 108.6, 87.5, 'water');
b.st('recharge', 28.6, 44, 'dock').st('recharge', 76.4, 84, 'galley').st('recharge', 126, 74.4, 'berryB').st('recharge', 136.6, 61, 'solar');
// Tasks
b.st('fuelCan', 6, 56.6, 'dock');
b.st('chartCourse', 12, 54.4, 'dock');
b.st('download', 28.6, 48, 'dock').st('download', 120.6, 6, 'mast').st('download', 43.4, 20, 'seedlab').st('download', 92.6, 43, 'watch');
b.st('upload', 131, 4.6, 'mast');
b.st('alignDish', 18, 4.8, 'hull').st('alignDish', 145, 67.6, 'solar');
b.st('swipeBadge', 19.4, 32, 'airlock');
b.st('fixWiring', 8.6, 34, 'airlock').st('fixWiring', 108, 11.4, 'core').st('fixWiring', 112.6, 61, 'berryB').st('fixWiring', 14.6, 77, 'infirmary').st('fixWiring', 86.6, 72.4, 'crater');
b.st('fixWiring', 10.6, 20, 'hull');
b.st('unlockManifold', 102, 22.6, 'core');
b.st('replaceFuse', 112.6, 17, 'core').st('replaceFuse', 100.6, 78, 'fern').st('replaceFuse', 57.4, 90, 'bunks');
b.st('sortBerries', 38, 15.6, 'seedlab').st('sortBerries', 54, 12.6, 'berryA').st('sortBerries', 118, 70.6, 'berryB');
b.st('distillReel', 28.5, 15.6, 'seedlab');
b.st('stampMail', 128, 49.6, 'cargo');
b.st('keypadCode', 145.4, 46, 'cargo').st('keypadCode', 130.6, 94, 'pods');
b.st('rerouteTube', 122.6, 47, 'cargo').st('rerouteTube', 48.6, 20.5, 'berryA').st('rerouteTube', 110, 96.4, 'water').st('rerouteTube', 101.4, 85, 'fern');
b.st('waterPlants', 63, 12.6, 'berryA').st('waterPlants', 95, 90.6, 'fern').st('waterPlants', 60.5, 61.4, 'dome');
b.st('medScan', 21, 78, 'infirmary');
b.st('juicePress', 73, 80.6, 'galley');
b.st('emptyChute', 60.6, 82, 'galley');
b.st('slotCartridge', 99, 49.6, 'watch');
b.st('cleanFilter', 118, 88.6, 'water');
b.st('calibrateTurntable', 47, 88, 'bunks');
b.st('sortClips', 36.6, 90, 'bunks');
b.st('rechargeGenerator', 138.5, 82.4, 'solar');
b.st('primeShields', 103, 57.4, 'crater');
b.st('simonSays', 146.4, 89.5, 'pods');
b.st('fuelEngine', 139, 94.6, 'pods');
b.st('lightLantern', 76.4, 12, 'berryA').st('lightLantern', 30.6, 74.5, 'infirmary').st('lightLantern', 145.4, 53, 'cargo');
b.st('lightLantern', 131, 89, 'pods').st('lightLantern', 44, 96.4, 'bunks').st('lightLantern', 82.6, 48.5, 'dome');

// --- Vents (4 networks) ----------------------------------------------------
b.vent('v-seed', 41, 24.5, 'west', ['v-dock', 'v-airlock']);
b.vent('v-dock', 26, 55, 'west', ['v-seed', 'v-infirm']);
b.vent('v-airlock', 17.5, 29.5, 'west', ['v-seed']);
b.vent('v-infirm', 26.5, 81.5, 'west', ['v-dock']);
b.vent('v-berryA', 75.5, 16, 'north', ['v-core', 'v-dome']);
b.vent('v-core', 93, 23, 'north', ['v-berryA', 'v-mast']);
b.vent('v-mast', 121.5, 9.5, 'north', ['v-core']);
b.vent('v-dome', 79.5, 61.5, 'north', ['v-berryA']);
b.vent('v-galley', 62.5, 86.5, 'south', ['v-bunks', 'v-fern']);
b.vent('v-bunks', 53.5, 95.5, 'south', ['v-galley']);
b.vent('v-fern', 98.5, 94.5, 'south', ['v-galley', 'v-water']);
b.vent('v-water', 124.5, 96, 'south', ['v-fern', 'v-pods']);
b.vent('v-pods', 146.5, 94.5, 'south', ['v-water']);
b.vent('v-cargo', 124, 53, 'east', ['v-berryB', 'v-solar', 'v-watch']);
b.vent('v-berryB', 113.5, 73.5, 'east', ['v-cargo', 'v-crater']);
b.vent('v-solar', 137.5, 74, 'east', ['v-cargo']);
b.vent('v-crater', 104.5, 63.5, 'east', ['v-berryB']);
b.vent('v-watch', 101.5, 45.5, 'east', ['v-cargo']);

// --- Cameras ---------------------------------------------------------------
b.cam(37, 36, 'North-West Spoke').cam(44, 50, 'West Spoke').cam(64, 30, 'North Spoke');
b.cam(89, 44, 'East Spine').cam(68, 71, 'Galley Spoke').cam(36, 77, 'Infirmary Run').cam(126, 32, 'Mast Ladder');

export const GREENHOUSE_MAP = b.build({
  id: 'greenhouse',
  name: 'Orbital Greenhouse',
  tagline: 'Berries grow sweeter in zero-g. So do grudges.',
  w: 152,
  h: 102,
  theme: {
    sky: '#020b14',
    void: '#04121b',
    wall: '#d6ecee',
    wallTop: '#f3fbfb',
    trim: '#14b8a6',
    hall: '#e2f0f0',
    accent: '#2dd4bf',
    night: '#020c16',
    fog: '#05202a',
    ambience: 'station',
  },
  spawn: { x: 69, y: 49 },
  meetingRoom: 'dome',
  eject: 'airlock',
  criticalNames: { meltdown: 'Fusion Core Meltdown', pressure: 'Hull Seal Breach' },
});
