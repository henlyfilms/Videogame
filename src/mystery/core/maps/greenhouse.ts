/**
 * Orbital Greenhouse — a berry farm on a ring station. A rectangular ring
 * corridor wraps an inner farm deck (two hydroponics bays, galley, med bay,
 * security, water reclamation) around the Observation Dome, with docking,
 * reactor and comms modules on the north arc and the crew/solar/pod modules
 * on the south arc. Two dome spokes and many room-to-room links make loops.
 */
import { MapBuilder } from './builder';

const b = new MapBuilder();

// --- Rooms -----------------------------------------------------------------
// North arc
b.room('dock', 'Docking Bay', [6, 5, 22, 18], 'metal', '#38bdf8');
b.room('airlock', 'Airlock', [32, 8, 14, 15], 'metal', '#f97316', { cold: true });
b.room('reactor', 'Reactor', [50, 4, 26, 19], 'metal', '#ef4444');
b.room('comms', 'Comms Array', [80, 6, 18, 17], 'carpet', '#a78bfa');
b.room('seedlab', 'Seed Lab', [102, 5, 18, 18], 'tile', '#84cc16');
b.room('cargo', 'Cargo Hold', [124, 5, 20, 18], 'metal', '#94a3b8', { cold: true });
// Inner farm deck
b.room('berryA', 'Berry Bay Alpha', [13, 33, 24, 17], 'grass', '#22c55e');
b.room('medbay', 'Med Bay', [13, 55, 22, 17], 'tile', '#f0abfc');
b.room('galley', 'Galley', [42, 40, 14, 17], 'checker', '#fbbf24');
b.room('dome', 'Observation Dome', [62, 38, 26, 26], 'tile', '#2dd4bf');
b.room('security', 'Security', [94, 40, 14, 20], 'carpet', '#64748b');
b.room('berryB', 'Berry Bay Beta', [113, 33, 24, 17], 'grass', '#10b981');
b.room('water', 'Water Reclamation', [113, 55, 24, 17], 'tile', '#0ea5e9');
// South arc
b.room('o2', 'Oxygen Garden', [6, 83, 24, 17], 'grass', '#4ade80');
b.room('quarters', 'Crew Quarters', [34, 84, 20, 15], 'carpet', '#c084fc');
b.room('solar', 'Solar Deck', [58, 83, 30, 17], 'metal', '#facc15', { outdoor: true, cold: true });
b.room('storage', 'Storage Bay', [92, 84, 18, 15], 'stone', '#a8a29e');
b.room('pods', 'Escape Pods', [114, 83, 30, 17], 'metal', '#fb7185', { cold: true });

// --- Corridors: the ring -----------------------------------------------------
b.hall([6, 26, 138, 4], 'metal'); // north arc
b.hall([6, 76, 138, 4], 'metal'); // south arc
b.hall([6, 30, 4, 46], 'metal'); // west arc
b.hall([140, 30, 4, 46], 'metal'); // east arc

// North modules -> ring
b.door('dock', [15, 23, 3, 3]);
b.door('airlock', [37, 23, 3, 3], 'Airlock');
b.door('reactor', [56, 23, 3, 3], 'Reactor West').door('reactor', [68, 23, 3, 3]);
b.door('comms', [87, 23, 3, 3]);
b.door('seedlab', [109, 23, 3, 3]);
b.door('cargo', [132, 23, 3, 3]);
// Inner deck -> ring
b.door('berryA', [10, 38, 3, 3]).door('berryA', [24, 30, 3, 3]);
b.door('medbay', [10, 62, 3, 3], 'Med Bay').door('medbay', [22, 72, 3, 4]);
b.door('galley', [47, 30, 3, 10]);
b.door('dome', [73, 30, 4, 8], 'Dome North').door('dome', [73, 64, 4, 12], 'Dome South');
b.door('dome', [56, 46, 6, 3]).door('dome', [88, 45, 6, 3]);
b.door('security', [99, 60, 3, 16], 'Security');
b.door('berryB', [123, 30, 3, 3]).door('berryB', [137, 38, 3, 3]);
b.door('water', [137, 62, 3, 3]).door('water', [124, 72, 3, 4]);
// South modules -> ring
b.door('o2', [16, 80, 3, 3]);
b.door('quarters', [42, 80, 3, 4]);
b.door('solar', [64, 80, 3, 3]).door('solar', [80, 80, 3, 3]);
b.door('storage', [100, 80, 3, 4], 'Storage');
b.door('pods', [126, 80, 3, 3]).door('pods', [138, 80, 3, 3]);
// Module-to-module links (loops)
b.hall([28, 12, 4, 3], 'metal'); // dock <-> airlock
b.hall([46, 12, 4, 3], 'metal'); // airlock <-> reactor
b.hall([76, 12, 4, 3], 'metal'); // reactor <-> comms
b.hall([98, 12, 4, 3], 'metal'); // comms <-> seed lab
b.hall([120, 12, 4, 3], 'metal'); // seed lab <-> cargo
b.hall([18, 50, 3, 5], 'metal'); // berry alpha <-> med bay
b.hall([37, 44, 5, 3], 'metal'); // berry alpha <-> galley
b.hall([108, 44, 5, 3], 'metal'); // security <-> berry beta
b.hall([128, 50, 3, 5], 'metal'); // berry beta <-> water
b.hall([30, 90, 4, 3], 'metal'); // o2 <-> quarters
b.hall([54, 90, 4, 3], 'metal'); // quarters <-> solar
b.hall([88, 90, 4, 3], 'metal'); // solar <-> storage
b.hall([110, 90, 4, 3], 'metal'); // storage <-> pods

// --- Props -----------------------------------------------------------------
// Docking bay
b.prop('engine', 12, 10, { w: 6, h: 4, label: 'SHUTTLE KESTREL', color: '#e2e8f0' });
b.prop('window', 17, 5.2, { w: 14, h: 0.3, solid: false });
b.prop('tank', 8, 20, { w: 2, h: 2, label: 'FUEL', color: '#f59e0b' });
b.prop('crate', 22, 8, { w: 2, h: 2 });
b.prop('cart', 21, 18.5, { w: 2, h: 1 });
b.prop('barrel', 26, 20.5, { w: 2, h: 1 });
b.prop('console', 12, 14.5, { w: 4, h: 1, label: 'NAV' });
// Airlock
b.prop('locker', 34.5, 9.5, { w: 3, h: 1, label: 'EVA SUITS', color: '#f97316' });
b.prop('window', 40, 8.2, { w: 6, h: 0.3, solid: false });
b.prop('bench', 39, 18.5, { w: 4, h: 1 });
b.prop('poster', 42, 22.8, { w: 3, h: 0.2, solid: false, label: 'CYCLE BEFORE EXIT' });
// Reactor
b.prop('engine', 63, 11, { w: 6, h: 4, label: 'FUSION CORE', color: '#f87171' });
b.prop('pipe', 63, 5.5, { w: 20, h: 0.5, solid: false });
b.prop('tank', 54, 8, { w: 2, h: 2, color: '#fca5a5' }).prop('tank', 72, 8, { w: 2, h: 2, color: '#fca5a5' });
b.prop('generator', 55.5, 18, { w: 3, h: 2 });
b.prop('console', 63, 17.5, { w: 4, h: 1, label: 'CORE CONTROL' });
b.prop('pillar', 58.5, 14.5).prop('pillar', 67.5, 14.5);
// Comms array
b.prop('dish', 85, 9, { w: 2, h: 2 });
b.prop('server', 94, 7.5, { w: 4, h: 1 });
b.prop('console', 88.5, 15.5, { w: 5, h: 1, label: 'COMMS' });
b.prop('chair', 88.5, 17);
b.prop('screen', 88, 6.2, { w: 5, h: 0.4, solid: false, label: 'DEEP SPACE NET' });
b.prop('table', 84, 19, { w: 4, h: 2, label: 'STATION MAP', color: '#4c1d95' });
// Seed lab
b.prop('counter', 106, 8.5, { w: 6, h: 1, color: '#ecfccb' }).prop('counter', 114, 8.5, { w: 6, h: 1, color: '#ecfccb' });
b.prop('planter', 106, 18.5, { w: 4, h: 1 }).prop('planter', 114, 18.5, { w: 4, h: 1 });
b.prop('fridge', 118.5, 10.5, { label: 'SEED VAULT' });
b.prop('tube', 103.5, 20.5, { solid: true });
b.prop('plant', 103, 6);
// Cargo hold
b.prop('crate', 128, 8, { w: 2, h: 2 });
b.prop('crate', 140.5, 7.5, { w: 3, h: 1 });
b.prop('cart', 134, 10.5, { w: 2, h: 1 });
b.prop('desk', 130, 14.5, { w: 4, h: 1, label: 'MANIFESTS' });
b.prop('shelf', 128, 20.5, { w: 4, h: 1 });
b.prop('barrel', 142, 19.5, { w: 2, h: 1 });
b.prop('mailbox', 125, 15);
// Berry Bay Alpha
b.prop('planter', 20, 36.5, { w: 6, h: 1, color: '#16a34a' }).prop('planter', 31, 36.5, { w: 6, h: 1, color: '#16a34a' });
b.prop('planter', 20, 41.5, { w: 6, h: 1, color: '#16a34a' }).prop('planter', 31, 41.5, { w: 6, h: 1, color: '#16a34a' });
b.prop('planter', 31, 46.5, { w: 6, h: 1, color: '#16a34a' });
b.prop('tank', 15, 47, { w: 2, h: 2, label: 'NUTRIENT', color: '#5eead4' });
b.prop('lamp', 25.5, 39, { solid: false, color: '#f0abfc' });
b.prop('plant', 14, 34);
// Med bay
b.prop('bed', 31, 58.5, { w: 2, h: 3 }).prop('bed', 31, 63.5, { w: 2, h: 3 });
b.prop('screen', 24, 55.2, { w: 4, h: 0.4, solid: false, label: 'VITALS' });
b.prop('counter', 16, 69.5, { w: 4, h: 1, color: '#fdf4ff' });
b.prop('locker', 14.5, 56.5, { color: '#f0abfc' });
b.prop('plant', 33, 70);
// Galley
b.prop('stove', 44, 41.5, { w: 2, h: 1 });
b.prop('counter', 52, 41.5, { w: 3, h: 1 });
b.prop('fridge', 54.5, 41.5);
b.prop('table', 48, 51, { w: 4, h: 2, color: '#fde68a' });
b.prop('chair', 45.5, 51).prop('chair', 50.5, 51);
b.prop('barrel', 54.5, 55.5, { label: 'JUICE' });
// Observation dome (meeting)
b.prop('roundTable', 75, 51, { w: 2, h: 2, color: '#ccfbf1' });
b.prop('rug', 75, 51, { w: 10, h: 10, solid: false, color: '#99f6e4' });
b.prop('window', 75, 38.2, { w: 20, h: 0.3, solid: false });
b.prop('telescope', 66, 41, { w: 2, h: 2 });
b.prop('statue', 84.5, 41.5, { label: 'FIRST SPROUT', color: '#22c55e' });
b.prop('planter', 66.5, 60.5, { w: 3, h: 1 });
b.prop('plant', 63, 62).prop('plant', 86.5, 62);
// Security
b.prop('console', 100, 41.5, { w: 6, h: 1, label: 'CAMS' });
b.prop('screen', 100, 40.2, { w: 6, h: 0.4, solid: false });
b.prop('chair', 98.5, 43).prop('chair', 101.5, 43);
b.prop('server', 106.5, 53, { w: 1, h: 2 });
b.prop('desk', 104, 57.5, { w: 3, h: 1 });
b.prop('locker', 95.5, 57.5);
// Berry Bay Beta
b.prop('tree', 118, 37, { w: 2, h: 2, label: 'BLUEBERRY', color: '#1d4ed8' });
b.prop('tree', 132, 37, { w: 2, h: 2, label: 'RASPBERRY', color: '#be123c' });
b.prop('planter', 120, 42.5, { w: 6, h: 1, color: '#15803d' }).prop('planter', 130, 42.5, { w: 6, h: 1, color: '#15803d' });
b.prop('tank', 135, 47, { w: 2, h: 2, color: '#5eead4' });
b.prop('lamp', 125, 37, { solid: false, color: '#f0abfc' });
// Water reclamation
b.prop('tank', 117.5, 59.5, { w: 3, h: 3, label: 'GREY', color: '#94a3b8' });
b.prop('tank', 117.5, 66.5, { w: 3, h: 3, label: 'CLEAN', color: '#7dd3fc' });
b.prop('tank', 132.5, 67.5, { w: 3, h: 3, color: '#38bdf8' });
b.prop('fountain', 125, 64, { w: 2, h: 2 });
b.prop('pipe', 124, 56.5, { w: 8, h: 0.5, solid: false });
// Oxygen garden
b.prop('tree', 10, 87, { w: 2, h: 2 }).prop('tree', 10, 95, { w: 2, h: 2 });
b.prop('tank', 25, 86, { w: 2, h: 2, label: 'O2', color: '#bbf7d0' });
b.prop('planter', 16, 96.5, { w: 6, h: 1 });
b.prop('plant', 28.5, 98.5);
// Crew quarters
b.prop('bed', 36, 87.5, { w: 2, h: 3, color: '#c4b5fd' }).prop('bed', 36, 95.5, { w: 2, h: 3, color: '#c4b5fd' });
b.prop('bed', 51, 87.5, { w: 2, h: 3, color: '#c4b5fd' }).prop('bed', 51, 95.5, { w: 2, h: 3, color: '#c4b5fd' });
b.prop('turntable', 46.5, 87.5, { w: 1.5, h: 1.5 });
b.prop('sofa', 44, 96.5, { w: 4, h: 1 });
b.prop('arcade', 40.5, 97.5);
b.prop('poster', 44, 84.2, { w: 4, h: 0.2, solid: false, label: 'GROW TOGETHER' });
// Solar deck
b.prop('generator', 64.5, 94, { w: 3, h: 2 });
b.prop('dish', 73.5, 94.5, { w: 3, h: 3 });
b.prop('telescope', 84, 86, { w: 2, h: 2 });
b.prop('rock', 61.5, 97.5, { label: 'METEORITE' });
b.prop('snowpile', 85.5, 97.5, { color: '#e0f2fe' });
b.prop('window', 73, 99.8, { w: 26, h: 0.3, solid: false });
// Storage bay
b.prop('shelf', 95, 86.5, { w: 4, h: 1 }).prop('shelf', 95, 95.5, { w: 4, h: 1 });
b.prop('shelf', 106, 86.5, { w: 4, h: 1 }).prop('shelf', 106, 95.5, { w: 4, h: 1 });
b.prop('crate', 100, 97.5, { w: 2, h: 1 });
b.prop('barrel', 108.5, 97.5);
// Escape pods
b.prop('engine', 119.5, 96.5, { w: 3, h: 3, label: 'POD 1', color: '#fecdd3' });
b.prop('engine', 128.5, 96.5, { w: 3, h: 3, label: 'POD 2', color: '#fecdd3' });
b.prop('engine', 137.5, 96.5, { w: 3, h: 3, label: 'POD 3', color: '#fecdd3' });
b.prop('console', 131.5, 86.5, { w: 3, h: 1, label: 'LAUNCH' });
b.prop('bench', 120, 87, { w: 3, h: 1 });
b.prop('poster', 134, 83.2, { w: 4, h: 0.2, solid: false, label: 'ABANDON SHIP' });
// Ring corridor dressing
b.prop('plant', 7, 27).prop('plant', 142.5, 78.5);
b.prop('poster', 75, 29.8, { w: 4, h: 0.2, solid: false, label: 'DOME' });
b.lamp(8, 28, 4, '#a5f3fc').lamp(40, 28, 4, '#a5f3fc').lamp(75, 28, 4, '#a5f3fc').lamp(110, 28, 4, '#a5f3fc').lamp(142, 28, 4, '#a5f3fc');
b.lamp(8, 53, 4, '#a5f3fc').lamp(142, 53, 4, '#a5f3fc');
b.lamp(8, 78, 4, '#a5f3fc').lamp(40, 78, 4, '#a5f3fc').lamp(75, 78, 4, '#a5f3fc').lamp(110, 78, 4, '#a5f3fc').lamp(142, 78, 4, '#a5f3fc');

// --- Stations --------------------------------------------------------------
b.st('emergency', 75, 51, 'dome');
b.st('admin', 84, 17.4, 'comms');
b.st('cams', 100, 42.6, 'security');
b.st('vitals', 24, 56.6, 'medbay');
b.st('doorlog', 44.5, 20, 'airlock');
b.st('lightsPanel', 108.5, 88.5, 'storage');
b.st('commsPanel', 96.5, 15, 'comms');
b.st('meltdownA', 51, 9.5, 'reactor').st('meltdownB', 74.5, 9.5, 'reactor');
b.st('pressureA', 28.5, 86, 'o2').st('pressureB', 135.5, 58, 'water');
b.st('recharge', 26.5, 16, 'dock').st('recharge', 54.5, 52, 'galley').st('recharge', 135.5, 43.5, 'berryB').st('recharge', 60, 86, 'solar');
// Tasks
b.st('fuelCan', 8, 17.6, 'dock');
b.st('chartCourse', 12, 16, 'dock');
b.st('download', 24.5, 11, 'dock').st('download', 94, 9.4, 'comms').st('download', 118.5, 13, 'seedlab').st('download', 104, 59, 'security');
b.st('upload', 81, 9, 'comms');
b.st('alignDish', 85, 11.2, 'comms').st('alignDish', 73.5, 91.6, 'solar');
b.st('swipeBadge', 33, 16, 'airlock');
b.st('fixWiring', 45.4, 11, 'airlock').st('fixWiring', 51, 20.5, 'reactor').st('fixWiring', 114, 34, 'berryB').st('fixWiring', 14, 58.5, 'medbay').st('fixWiring', 93, 97.5, 'storage');
b.st('unlockManifold', 63, 19, 'reactor');
b.st('replaceFuse', 74.5, 20.5, 'reactor').st('replaceFuse', 97, 88, 'storage').st('replaceFuse', 52.5, 92, 'quarters');
b.st('sortBerries', 106, 10, 'seedlab').st('sortBerries', 20, 37.6, 'berryA').st('sortBerries', 124, 40, 'berryB');
b.st('distillReel', 114, 10, 'seedlab');
b.st('stampMail', 130, 16, 'cargo');
b.st('keypadCode', 142.5, 15, 'cargo').st('keypadCode', 93, 92.5, 'storage');
b.st('rerouteTube', 125, 20.5, 'cargo').st('rerouteTube', 35.5, 39, 'berryA').st('rerouteTube', 114, 70.5, 'water').st('rerouteTube', 7, 91, 'o2');
b.st('waterPlants', 31, 40.4, 'berryA').st('waterPlants', 16, 95.2, 'o2').st('waterPlants', 66.5, 59.2, 'dome');
b.st('medScan', 20, 65, 'medbay');
b.st('juicePress', 52, 43, 'galley');
b.st('emptyChute', 43, 55.5, 'galley');
b.st('slotCartridge', 95, 50, 'security');
b.st('cleanFilter', 121, 62.5, 'water');
b.st('calibrateTurntable', 46.5, 89.6, 'quarters');
b.st('sortClips', 40, 92, 'quarters');
b.st('rechargeGenerator', 64.5, 92.2, 'solar');
b.st('primeShields', 84, 92, 'solar');
b.st('simonSays', 131.5, 88.2, 'pods');
b.st('fuelEngine', 128.5, 94.2, 'pods');
b.st('lightLantern', 14, 48.5, 'berryA').st('lightLantern', 33, 68.5, 'medbay').st('lightLantern', 142.5, 21.5, 'cargo');
b.st('lightLantern', 142.5, 98.5, 'pods').st('lightLantern', 35.5, 91, 'quarters').st('lightLantern', 86.5, 39.5, 'dome');

// --- Vents (4 networks) ----------------------------------------------------
b.vent('v-dock', 20, 15, 'west', ['v-berryA', 'v-o2']);
b.vent('v-berryA', 25, 44, 'west', ['v-dock', 'v-o2']);
b.vent('v-o2', 21, 90, 'west', ['v-dock', 'v-berryA']);
b.vent('v-airlock', 42, 15, 'north', ['v-reactor']);
b.vent('v-reactor', 70, 18, 'north', ['v-airlock', 'v-comms']);
b.vent('v-comms', 95, 19, 'north', ['v-reactor']);
b.vent('v-seed', 110, 15, 'east', ['v-berryB', 'v-pods']);
b.vent('v-berryB', 118, 46, 'east', ['v-seed', 'v-pods']);
b.vent('v-pods', 122, 90, 'east', ['v-seed', 'v-berryB']);
b.vent('v-medbay', 28, 68, 'core', ['v-galley', 'v-water']);
b.vent('v-galley', 50, 55, 'core', ['v-medbay', 'v-storage']);
b.vent('v-storage', 104, 91, 'core', ['v-galley', 'v-water']);
b.vent('v-water', 128, 69, 'core', ['v-storage', 'v-medbay']);

// --- Cameras ---------------------------------------------------------------
b.cam(30, 27.5, 'North Arc West').cam(120, 27.5, 'North Arc East');
b.cam(7.5, 52, 'West Arc').cam(141.5, 52, 'East Arc');
b.cam(40, 77.5, 'South Arc West').cam(110, 77.5, 'South Arc East');
b.cam(74.5, 70, 'Dome Spoke');

export const GREENHOUSE_MAP = b.build({
  id: 'greenhouse',
  name: 'Orbital Greenhouse',
  tagline: 'Berries grow sweeter in zero-g. So do grudges.',
  w: 150,
  h: 104,
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
  spawn: { x: 75, y: 46 },
  meetingRoom: 'dome',
  eject: 'airlock',
  criticalNames: { meltdown: 'Reactor Meltdown', pressure: 'Oxygen Leak' },
});
