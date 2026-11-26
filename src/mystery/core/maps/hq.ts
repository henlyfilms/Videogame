/**
 * Marion HQ After Hours — the HQ wings reimagined at night. An octagonal
 * Central Command sits in the middle; the Co-Pilot Bridge juts out north like
 * a nose, the Media Vault and Mailroom form a crooked east wing that spills
 * down onto the Rooftop Garden, and the west wing (Engine Room, Cutting Room,
 * Arcade, Foundry) wraps round a night courtyard. Corridors dog-leg, narrow
 * and dead-end; Barry's Vault and the Janitor's Closet hide down one-way stubs.
 */
import { chamfer, MapBuilder } from './builder';

const b = new MapBuilder();
const NIGHT = '#fde68a';

// --- Rooms -----------------------------------------------------------------
b.room('command', 'Central Command', chamfer(46, 30, 32, 26, 6), 'tile', '#2f6fed');
b.room('bridge', 'Co-Pilot Bridge', chamfer(52, 2, 24, 14, [6, 6, 2, 2]), 'carpet', '#8b5cf6');
b.room('engine', "Kanye's Engine Room", chamfer(4, 4, 24, 14, [4, 0, 0, 0]), 'metal', '#ff4d5e', { extra: [[4, 18, 12, 12]] });
b.room('vault', "Barry's Vault", chamfer(34, 18, 12, 10, [0, 0, 3, 0]), 'checker', '#64748b');
b.room('life', 'Life Hub & Planner', chamfer(84, 4, 20, 15, [0, 3, 0, 0]), 'wood', '#2f6fed', { extra: [[84, 19, 11, 7]] });
b.room('media', "Sift's Media Vault", chamfer(110, 3, 22, 14, [0, 4, 4, 0]), 'carpet', '#06b6d4');
b.room('huddle', 'Huddle Room', chamfer(92, 33, 12, 11, 3), 'rug', '#14b8a6');
b.room('mail', "Quill's Mailroom", chamfer(108, 32, 22, 16, [0, 0, 4, 0]), 'wood', '#3b82f6', { extra: [[114, 26, 16, 6]] });
b.room('rooftop', 'Rooftop Garden', chamfer(100, 62, 32, 24, [0, 0, 6, 0]), 'grass', '#22c55e', {
  outdoor: true,
  cold: true,
  extra: [
    [108, 56, 22, 6],
    [94, 70, 6, 10],
  ],
});
b.room('archive', 'Basement Archive', chamfer(72, 74, 20, 10, [0, 0, 3, 3]), 'stone', '#a16207', { cold: true, extra: [[78, 68, 8, 6]] });
b.room('server', 'Server Room', chamfer(62, 64, 12, 9, 2), 'metal', '#22d3ee', { cold: true });
b.room('courtyard', 'Night Courtyard', chamfer(36, 64, 22, 16, [0, 5, 0, 5]), 'stone', '#94a3b8', { outdoor: true, cold: true, extra: [[46, 62, 8, 2]] });
b.room('arcade', 'The Arcade', chamfer(14, 62, 18, 14, 3), 'checker', '#ec4899');
b.room('foundry', "Bot Builder's Foundry", chamfer(4, 80, 24, 14, [0, 0, 0, 5]), 'metal', '#f97316');
b.room('cutting', "Greek's Cutting Room", chamfer(4, 34, 20, 18, [0, 4, 0, 0]), 'wood', '#d946ef');
b.room('security', 'Security', [30, 30, 11, 7], 'metal', '#475569');
b.room('closet', "Janitor's Closet", [28, 50, 7, 5], 'tile', '#84cc16');

// --- Corridors -------------------------------------------------------------
// Engine -> Bridge (dog-leg)
b.door('engine', [28, 8, 2, 3]);
b.path(3, [[30, 8], [38, 8], [38, 11], [47, 11]]);
b.door('bridge', [50, 11, 2, 3], 'Bridge West');
// Bridge -> Command (North Hall) with the dead-end stub to the Vault
b.door('bridge', [63, 16, 3, 2]);
b.path(3, [[63, 18], [63, 22], [57, 22], [57, 27]]);
b.door('command', [57, 28, 3, 2], 'Command North');
b.path(2, [[48, 23], [56, 23]]);
b.door('vault', [46, 23, 2, 2]);
// Bridge -> Life -> Media gangways
b.hall([76, 9, 6, 3]);
b.door('life', [82, 9, 2, 3]);
b.hall([104, 10, 4, 3]);
b.door('media', [108, 10, 2, 3], 'Media Vault');
// East hall: Command -> Huddle, branch up to the Life Hub
b.path(3, [[78, 38], [89, 38]]);
b.door('command', [78, 38, 2, 3], 'Command East');
b.path(3, [[86, 28], [86, 37]]);
b.door('life', [86, 26, 3, 2]);
b.door('huddle', [90, 38, 2, 3]);
// Huddle -> Mailroom, Media -> Mailroom (narrow back stair)
b.hall([104, 37, 2, 3]);
b.door('mail', [106, 37, 2, 3], 'Mailroom');
b.hall([118, 17, 2, 2]);
b.path(2, [[118, 19], [118, 21], [124, 21], [124, 23]]);
b.hall([124, 24, 2, 2]);
// Mailroom -> Rooftop stairs
b.door('mail', [112, 48, 3, 2]);
b.path(3, [[112, 50], [112, 53], [116, 53], [116, 55]]);
// West hall: Command -> Security / Closet / Cutting
b.path(3, [[34, 40], [45, 40]]);
b.door('command', [44, 40, 2, 3], 'Command West');
b.path(3, [[34, 40], [34, 45], [27, 45]]);
b.door('cutting', [24, 45, 3, 3]);
b.door('security', [35, 37, 3, 3], 'Security');
b.door('closet', [30, 48, 2, 2]);
// Engine leg -> Cutting
b.door('cutting', [8, 30, 3, 4]);
// Cutting -> Arcade (winding service run)
b.hall([10, 52, 3, 2]);
b.path(3, [[10, 54], [10, 56], [20, 56], [20, 59]]);
// Arcade -> Foundry, Arcade -> Courtyard
b.door('foundry', [20, 76, 3, 4], 'Foundry');
b.hall([32, 67, 2, 3]);
b.door('arcade', [32, 67, 2, 3], 'Arcade');
b.hall([34, 67, 2, 3], 'stone');
// South hall: Command -> Server / Courtyard / Archive
b.door('command', [58, 56, 4, 2], 'Command South');
b.path(4, [[48, 58], [76, 58]]);
b.door('server', [66, 62, 3, 2], 'Server Room');
b.path(3, [[78, 58], [78, 65]]);
b.door('archive', [78, 66, 3, 2]);
// Archive -> Rooftop (basement stair)
b.hall([92, 76, 2, 3], 'stone');
// Server Room <-> Archive back passage
b.hall([74, 68, 4, 3], 'metal');
// Smokers' alley: Foundry -> Courtyard, outside along the back wall
b.hall([28, 88, 2, 2], 'stone');
b.path(2, [[30, 88], [34, 88], [34, 84], [44, 84], [44, 80]], 'stone');

// --- Props -----------------------------------------------------------------
// Central Command: meeting table, Daniel, HQ status wall
b.prop('roundTable', 62, 46, { w: 2, h: 2, color: '#cbd5e1' });
b.prop('rug', 62, 46, { w: 9, h: 7, solid: false, color: '#2f6fed' });
b.prop('screen', 62, 30.3, { w: 10, h: 0.4, solid: false, label: 'HQ STATUS' });
b.prop('statue', 50.5, 51.5, { label: 'Daniel' });
b.prop('plant', 53.5, 32.5).prop('plant', 70.5, 32.5).prop('plant', 73.5, 51.5);
b.prop('console', 47, 46, { w: 1, h: 4, label: 'OPS' });
b.prop('console', 76.5, 46, { w: 1, h: 4 });
b.prop('bench', 56, 50.5, { w: 3, h: 1 }).prop('bench', 68, 50.5, { w: 3, h: 1 });
b.prop('desk', 70, 35, { w: 3, h: 1.5 }).prop('chair', 70.5, 36.5);
b.prop('mailbox', 74.5, 36.5, { label: 'INBOX' });
// Co-Pilot Bridge: cockpit console under the nose window
b.prop('window', 64, 2.2, { w: 12, h: 0.3, solid: false });
b.prop('console', 64, 5, { w: 8, h: 1.2, label: 'CO-PILOT' });
b.prop('chair', 61.5, 6.5).prop('chair', 64.5, 6.5).prop('chair', 66.5, 6.5);
b.prop('console', 55, 9, { w: 1, h: 3 }).prop('console', 73, 9, { w: 1, h: 3 });
b.prop('screen', 58, 15.6, { w: 4, h: 0.4, solid: false, label: 'ROUTES' });
b.prop('table', 69, 12, { w: 3, h: 2, label: 'STAR CHART', color: '#4c1d95' });
// Engine Room
b.prop('engine', 15, 11, { w: 6, h: 4, label: 'ENGINE CORE' });
b.prop('pipe', 15, 4.4, { w: 18, h: 0.5, solid: false });
b.prop('desk', 22, 15, { w: 3, h: 1.5 }).prop('desk', 6, 15, { w: 2, h: 1.5 });
b.prop('server', 26.5, 5.5).prop('server', 26.5, 6.5);
b.prop('tank', 7, 21, { w: 2, h: 2, label: 'COOLANT' });
b.prop('generator', 12.5, 25, { w: 3, h: 2 });
b.prop('barrel', 5.5, 28.5).prop('barrel', 6.5, 28.5);
// Barry's Vault
b.prop('locker', 34.5, 18.5).prop('locker', 35.5, 18.5).prop('locker', 36.5, 18.5).prop('locker', 43.5, 18.5).prop('locker', 44.5, 18.5);
b.prop('tank', 39, 22, { w: 2, h: 2, label: 'MCP' });
b.prop('crate', 35, 26, { w: 2, h: 1 });
// Life Hub & Planner
b.prop('table', 89, 9, { w: 4, h: 2 }).prop('table', 97, 9, { w: 4, h: 2 });
b.prop('chair', 87.5, 11).prop('chair', 90.5, 11).prop('chair', 95.5, 11).prop('chair', 98.5, 11);
b.prop('poster', 93, 4.3, { w: 6, h: 0.2, solid: false, label: 'PLANNER' });
b.prop('turntable', 101.5, 15.5, { w: 1.5, h: 1.5 });
b.prop('sofa', 92, 16, { w: 4, h: 1.2 });
b.prop('fridge', 84.5, 19.5).prop('counter', 84.5, 22.5, { w: 1, h: 3 });
b.prop('plant', 94.5, 24.5);
// Sift's Media Vault
b.prop('shelf', 113, 3.5, { w: 4, h: 1 }).prop('shelf', 119, 3.5, { w: 4, h: 1 });
b.prop('screen', 126, 3.3, { w: 4, h: 0.4, solid: false, label: 'FTS5' });
b.prop('tube', 111.5, 14.5, { solid: true });
b.prop('sofa', 120, 9, { w: 4, h: 1.2 });
b.prop('server', 129.5, 9.5).prop('server', 129.5, 10.5);
b.prop('rug', 120, 11, { w: 8, h: 4, solid: false, color: '#06b6d4' });
// Huddle Room
b.prop('roundTable', 98.5, 38.5, { w: 3, h: 3 });
b.prop('chair', 95.5, 38.5).prop('chair', 100.5, 38.5).prop('chair', 98.5, 35.5).prop('chair', 98.5, 41.5);
b.prop('plant', 93.5, 35.5).prop('plant', 102.5, 35.5);
// Quill's Mailroom
b.prop('counter', 120, 35, { w: 8, h: 1.2 });
b.prop('mailbox', 115.5, 26.5).prop('mailbox', 116.5, 26.5).prop('mailbox', 117.5, 26.5);
b.prop('tube', 128.5, 27.5, { solid: true });
b.prop('shelf', 110, 46.5, { w: 3, h: 1 });
b.prop('cart', 120, 41, { w: 2, h: 1 });
b.prop('crate', 126.5, 42.5).prop('crate', 127.5, 43.5);
// Rooftop Garden
b.prop('planter', 112, 59, { w: 4, h: 1.5 }).prop('planter', 120, 59, { w: 4, h: 1.5 });
b.prop('planter', 106, 68, { w: 3, h: 1.5 }).prop('planter', 114, 72, { w: 3, h: 1.5 });
b.prop('tree', 104, 80, { w: 2, h: 2 }).prop('tree', 125, 66, { w: 2, h: 2 }).prop('tree', 96, 72, { w: 2, h: 2 });
b.prop('dish', 128, 58, { w: 2, h: 2 });
b.prop('bench', 118, 80.5, { w: 3, h: 1 });
b.prop('rock', 109.5, 77.5).prop('rock', 122.5, 75.5, { w: 2, h: 2 });
b.prop('fountain', 116, 66, { w: 2, h: 2 });
b.prop('generator', 128.5, 72, { w: 2, h: 2 });
b.prop('telescope', 101, 64, { w: 2, h: 2 });
b.prop('snowpile', 130.5, 63.5).prop('snowpile', 112.5, 84.5);
// Basement Archive
b.prop('bookshelf', 74.5, 76, { w: 1, h: 3 }).prop('bookshelf', 77.5, 79, { w: 1, h: 3 });
b.prop('bookshelf', 81.5, 76, { w: 1, h: 3 }).prop('bookshelf', 85.5, 79, { w: 1, h: 3 }).prop('bookshelf', 89.5, 76, { w: 1, h: 3 });
b.prop('crate', 88.5, 81.5).prop('crate', 76.5, 81.5);
// Server Room
b.prop('server', 65.5, 66.5).prop('server', 66.5, 66.5).prop('server', 69.5, 66.5).prop('server', 70.5, 66.5);
b.prop('server', 65.5, 69.5).prop('server', 66.5, 69.5).prop('server', 69.5, 69.5).prop('server', 70.5, 69.5);
// Night Courtyard
b.prop('tree', 40, 68, { w: 2, h: 2 }).prop('tree', 52, 75, { w: 2, h: 2 });
b.prop('bench', 46, 71.5, { w: 3, h: 1 });
b.prop('rock', 38.5, 76.5).prop('planter', 52, 66, { w: 2, h: 1 });
b.prop('lamp', 48.5, 66.5, { solid: false });
b.prop('snowpile', 36.5, 66.5).prop('snowpile', 56.5, 70.5);
b.prop('barrel', 41.5, 77.5, { label: 'ASHTRAY' });
// The Arcade
b.prop('arcade', 18.5, 63.5).prop('arcade', 20.5, 63.5).prop('arcade', 22.5, 63.5).prop('arcade', 27.5, 63.5);
b.prop('arcade', 15.5, 68.5).prop('arcade', 15.5, 70.5);
b.prop('rug', 24, 70, { w: 6, h: 4, solid: false, color: '#ec4899' });
b.prop('sofa', 25, 73.5, { w: 4, h: 1.2 });
// Bot Builder's Foundry
b.prop('generator', 8, 83, { w: 3, h: 2 });
b.prop('tank', 25, 83, { w: 2, h: 2 });
b.prop('desk', 15, 90, { w: 4, h: 1.5, label: 'SPAWN BAY' });
b.prop('engine', 15, 85, { w: 3, h: 2, label: 'PRINTER' });
b.prop('barrel', 26.5, 92.5).prop('barrel', 25.5, 92.5);
// Greek's Cutting Room
b.prop('desk', 9, 38, { w: 3, h: 1.5 }).prop('desk', 16, 38, { w: 3, h: 1.5 });
b.prop('screen', 12, 34.3, { w: 6, h: 0.4, solid: false, label: 'RENDER' });
b.prop('crate', 5.5, 49.5).prop('crate', 6.5, 49.5).prop('crate', 21.5, 50.5);
b.prop('sofa', 14, 47, { w: 4, h: 1.2 });
// Security
b.prop('console', 35.5, 30.6, { w: 7, h: 1, label: 'CAMS' });
b.prop('chair', 33.5, 32.5).prop('chair', 37.5, 32.5);
b.prop('locker', 30.5, 35.5);
// Janitor's Closet
b.prop('shelf', 31.5, 53.5, { w: 3, h: 1 }).prop('barrel', 29.5, 50.5);
// Halls
b.prop('poster', 70, 58.2, { solid: false, w: 4, h: 0.2, label: 'MARION' });
b.lamp(40, 41, 4, NIGHT).lamp(64, 59, 4, NIGHT).lamp(87, 33, 4, NIGHT).lamp(60, 24, 4, NIGHT).lamp(36, 12, 4, NIGHT).lamp(115, 51, 4, NIGHT);

// --- Stations --------------------------------------------------------------
b.st('emergency', 62, 46, 'command');
b.st('admin', 101, 6, 'life');
b.st('cams', 35.5, 31.6, 'security');
b.st('doorlog', 40.4, 33, 'security');
b.st('vitals', 102.5, 40, 'huddle');
b.st('lightsPanel', 72.6, 68, 'server');
b.st('commsPanel', 74, 12, 'bridge');
b.st('meltdownA', 27.4, 13, 'engine').st('meltdownB', 15, 29.3, 'engine');
b.st('pressureA', 23.4, 43.4, 'cutting').st('pressureB', 129.4, 40, 'mail');
b.st('recharge', 50, 37, 'command').st('recharge', 4.6, 42, 'cutting').st('recharge', 91.4, 79, 'archive').st('recharge', 131, 8, 'media');
// Tasks
b.st('stampMail', 118, 36.6, 'mail').st('stampMail', 122, 36.6, 'mail');
b.st('sortClips', 9, 39.6, 'cutting').st('sortClips', 16, 39.6, 'cutting');
b.st('distillReel', 112.5, 14.5, 'media');
b.st('slotCartridge', 17, 91.6, 'foundry');
b.st('calibrateTurntable', 101.5, 13.8, 'life');
b.st('sortBerries', 116, 60.5, 'rooftop').st('sortBerries', 92, 6, 'life');
b.st('juicePress', 93.5, 39, 'huddle');
b.st('alignDish', 128, 60, 'rooftop');
b.st('fuelCan', 8, 85, 'foundry');
b.st('fuelEngine', 15, 13.6, 'engine');
b.st('fixWiring', 27.4, 9, 'engine').st('fixWiring', 4.6, 36, 'cutting').st('fixWiring', 129.4, 44, 'mail').st('fixWiring', 91.4, 74.6, 'archive').st('fixWiring', 31, 72, 'arcade');
b.st('swipeBadge', 40.4, 35.5, 'security');
b.st('waterPlants', 108, 70, 'rooftop').st('waterPlants', 41.5, 66.5, 'courtyard');
b.st('cleanFilter', 63, 67.5, 'server');
b.st('download', 116, 4.6, 'media').st('download', 23.4, 40, 'cutting').st('download', 27.4, 86, 'foundry').st('download', 53, 9, 'bridge');
b.st('upload', 86, 4.6, 'life');
b.st('unlockManifold', 4.6, 22, 'engine');
b.st('simonSays', 25, 63.6, 'arcade');
b.st('keypadCode', 44.4, 20, 'vault').st('keypadCode', 59, 13, 'bridge');
b.st('emptyChute', 129.4, 30, 'mail');
b.st('medScan', 95, 42, 'huddle');
b.st('primeShields', 58, 4.6, 'bridge');
b.st('chartCourse', 69, 10.4, 'bridge');
b.st('rerouteTube', 127.4, 27.6, 'mail').st('rerouteTube', 84.6, 15, 'life').st('rerouteTube', 111.5, 13, 'media').st('rerouteTube', 72.6, 79, 'archive');
b.st('replaceFuse', 72.6, 66.5, 'server').st('replaceFuse', 34.4, 51, 'closet').st('replaceFuse', 27.4, 15, 'engine');
b.st('rechargeGenerator', 8, 85.2, 'foundry');
b.st('lightLantern', 131, 79, 'rooftop').st('lightLantern', 14.6, 74, 'arcade').st('lightLantern', 41.6, 26.5, 'vault').st('lightLantern', 4.6, 50, 'cutting').st('lightLantern', 57, 78, 'courtyard');

// --- Vents (4 networks) ----------------------------------------------------
b.vent('v-engine', 22, 8, 'west', ['v-cutting', 'v-closet']);
b.vent('v-cutting', 19, 44, 'west', ['v-engine', 'v-closet']);
b.vent('v-closet', 33, 52.5, 'west', ['v-engine', 'v-cutting', 'v-security']);
b.vent('v-security', 39.5, 35.5, 'west', ['v-closet']);
b.vent('v-bridge', 57, 13, 'north', ['v-vault', 'v-life']);
b.vent('v-vault', 37.5, 25.5, 'north', ['v-bridge']);
b.vent('v-life', 91, 23.5, 'north', ['v-bridge', 'v-huddle']);
b.vent('v-huddle', 96.5, 42, 'north', ['v-life']);
b.vent('v-media', 125, 13, 'east', ['v-mail', 'v-roof']);
b.vent('v-mail', 112, 44, 'east', ['v-media', 'v-roof']);
b.vent('v-roof', 104, 74, 'east', ['v-media', 'v-mail', 'v-archive']);
b.vent('v-archive', 83.5, 71, 'east', ['v-roof']);
b.vent('v-foundry', 22, 88, 'south', ['v-arcade', 'v-server']);
b.vent('v-arcade', 17.5, 73.5, 'south', ['v-foundry', 'v-court']);
b.vent('v-court', 44.5, 77.5, 'south', ['v-arcade', 'v-server']);
b.vent('v-server', 68, 71.5, 'south', ['v-foundry', 'v-court']);

// --- Cameras ---------------------------------------------------------------
b.cam(60, 21, 'North Hall').cam(40, 41, 'West Hall').cam(87, 33, 'East Hall');
b.cam(64, 59, 'South Hall').cam(15, 57, 'Service Run').cam(116, 54, 'Roof Stairs');

export const HQ_MAP = b.build({
  id: 'hq',
  name: 'Marion HQ After Hours',
  tagline: 'The office never really sleeps.',
  w: 136,
  h: 98,
  theme: {
    sky: '#0b1020',
    void: '#0d1324',
    wall: '#c7d2e5',
    wallTop: '#e8eef8',
    trim: '#2f6fed',
    hall: '#dfe5ef',
    accent: '#2f6fed',
    night: '#0a0f1f',
    fog: '#0b1226',
    ambience: 'office',
  },
  spawn: { x: 62, y: 39 },
  meetingRoom: 'command',
  eject: 'tube',
  criticalNames: { meltdown: 'Engine Core Overheat', pressure: 'Pneumatic Pressure Burst' },
});
