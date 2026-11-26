/**
 * Marion HQ After Hours — the HQ wings reimagined at night (and enlarged):
 * 16 rooms on three rows joined by two long corridors, two side spines and
 * several room-to-room loops.
 */
import { MapBuilder } from './builder';

const b = new MapBuilder();

// --- Rooms -----------------------------------------------------------------
// Top row
b.room('engine', "Kanye's Engine Room", [6, 6, 20, 14], 'metal', '#ff4d5e');
b.room('bridge', 'Co-Pilot Bridge', [30, 5, 18, 15], 'carpet', '#8b5cf6');
b.room('life', 'Life Hub & Planner', [52, 6, 20, 15], 'wood', '#2f6fed');
b.room('vault', "Barry's Vault", [76, 7, 14, 13], 'checker', '#64748b');
b.room('media', "Sift's Media Vault", [94, 6, 22, 16], 'carpet', '#06b6d4');
// Middle row
b.room('cutting', "Greek's Cutting Room", [6, 34, 18, 16], 'wood', '#d946ef');
b.room('security', 'Security', [34, 36, 12, 10], 'metal', '#475569');
b.room('command', 'Central Command', [50, 34, 24, 18], 'tile', '#2f6fed');
b.room('huddle', 'Huddle Room', [78, 37, 12, 11], 'rug', '#14b8a6');
b.room('mail', "Quill's Mailroom", [98, 34, 20, 18], 'wood', '#3b82f6');
// Bottom row
b.room('foundry', "Bot Builder's Foundry", [6, 64, 20, 16], 'metal', '#f97316');
b.room('arcade', 'The Arcade', [30, 65, 18, 14], 'checker', '#ec4899');
b.room('server', 'Server Room', [54, 66, 16, 12], 'metal', '#22d3ee', { cold: true });
b.room('archive', 'Basement Archive', [76, 64, 14, 16], 'stone', '#a16207', { cold: true });
b.room('rooftop', 'Rooftop Garden', [98, 63, 20, 23], 'grass', '#22c55e', { outdoor: true, cold: true });

// --- Corridors -------------------------------------------------------------
b.hall([6, 23, 116, 4]); // north corridor
b.hall([6, 57, 116, 4]); // south corridor
b.hall([29, 27, 3, 30]); // west spine
b.hall([92, 27, 3, 30]); // east spine
b.hall([2, 27, 4, 30]); // far-west service passage
b.hall([2, 23, 4, 4]);
b.hall([2, 57, 4, 4]);

// Door stubs (sabotage-able, some carry door-log sensors)
b.door('engine', [12, 20, 3, 3]).door('engine', [21, 20, 3, 3]);
b.door('bridge', [38, 20, 3, 3]);
b.door('life', [60, 21, 3, 2], 'Life Hub');
b.door('vault', [82, 20, 3, 3]);
b.door('media', [104, 22, 3, 1]);
b.door('cutting', [14, 27, 3, 7]).door('cutting', [14, 50, 3, 7]);
b.door('security', [39, 27, 3, 9], 'Security');
b.door('security', [32, 40, 2, 3]);
b.door('command', [60, 27, 3, 7], 'Command North').door('command', [60, 52, 3, 5], 'Command South');
b.door('command', [46, 41, 4, 3], 'Command West').door('command', [74, 41, 4, 3], 'Command East');
b.door('huddle', [90, 41, 2, 3]);
b.door('mail', [106, 27, 3, 7], 'Mailroom').door('mail', [106, 52, 3, 5]).door('mail', [95, 42, 3, 3]);
b.door('foundry', [14, 61, 3, 3]);
b.door('arcade', [38, 61, 3, 4], 'Arcade');
b.door('server', [60, 61, 3, 5], 'Server Room');
b.door('archive', [82, 61, 3, 3]);
b.door('rooftop', [104, 61, 3, 2]).door('rooftop', [113, 61, 3, 2]);
// Room-to-room loops
b.hall([48, 10, 4, 3]); // bridge <-> life
b.hall([72, 12, 4, 3]); // life <-> vault
b.hall([90, 12, 4, 3]); // vault <-> media
b.hall([26, 70, 4, 3]); // foundry <-> arcade
b.hall([48, 72, 6, 3]); // arcade <-> server
b.hall([70, 70, 6, 3]); // server <-> archive
b.hall([90, 74, 8, 3]); // archive <-> rooftop

// --- Props -----------------------------------------------------------------
// Command: meeting table + Daniel hologram + screens
b.prop('roundTable', 62, 43, { w: 2, h: 2, color: '#cbd5e1' });
b.prop('screen', 54, 35, { w: 4, h: 0.4, solid: false, label: 'HQ STATUS' });
b.prop('screen', 70, 35, { w: 4, h: 0.4, solid: false });
b.prop('plant', 51, 35).prop('plant', 73, 35).prop('plant', 51, 51).prop('plant', 73, 51);
b.prop('statue', 56, 48, { label: 'Daniel' });
b.prop('bench', 66, 49, { w: 3, h: 1 });
// Engine
b.prop('desk', 10, 10, { w: 3, h: 1.5 }).prop('desk', 15, 10, { w: 3, h: 1.5 }).prop('desk', 20, 10, { w: 3, h: 1.5 });
b.prop('engine', 16, 16, { w: 4, h: 2, label: 'ENGINE CORE' });
b.prop('server', 24, 8).prop('server', 24, 10);
// Bridge
b.prop('console', 39, 7, { w: 6, h: 1.2, label: 'CO-PILOT' });
b.prop('chair', 36, 9).prop('chair', 39, 9).prop('chair', 42, 9);
b.prop('window', 39, 5.2, { w: 14, h: 0.3, solid: false });
b.prop('screen', 34, 15, { w: 3, h: 0.4, solid: false });
// Life hub
b.prop('table', 58, 12, { w: 4, h: 2 }).prop('table', 66, 12, { w: 4, h: 2 });
b.prop('turntable', 69, 18, { w: 1.5, h: 1.5 });
b.prop('sofa', 56, 18, { w: 3, h: 1.2 });
b.prop('poster', 62, 6.4, { w: 4, h: 0.2, solid: false, label: 'PLANNER' });
// Vault
b.prop('locker', 77, 8).prop('locker', 78, 8).prop('locker', 79, 8).prop('locker', 88, 8).prop('locker', 89, 8);
b.prop('tank', 83, 14, { w: 2, h: 2, label: 'MCP' });
// Media vault
b.prop('shelf', 97, 8, { w: 4, h: 1 }).prop('shelf', 103, 8, { w: 4, h: 1 }).prop('shelf', 109, 8, { w: 4, h: 1 });
b.prop('screen', 112, 16, { w: 4, h: 0.4, solid: false, label: 'FTS5' });
b.prop('tube', 99, 18, { w: 1, h: 1, solid: true });
b.prop('sofa', 105, 18, { w: 3, h: 1.2 });
// Cutting room
b.prop('desk', 10, 38, { w: 3, h: 1.5 }).prop('desk', 18, 38, { w: 3, h: 1.5 });
b.prop('crate', 8, 46).prop('crate', 9, 47).prop('crate', 21, 46);
b.prop('screen', 15, 35, { w: 5, h: 0.4, solid: false, label: 'RENDER' });
// Security
b.prop('console', 40, 37, { w: 5, h: 1, label: 'CAMS' });
b.prop('chair', 38, 39).prop('chair', 42, 39);
// Huddle
b.prop('roundTable', 84, 42, { w: 3, h: 3 });
b.prop('plant', 79, 38).prop('plant', 89, 47);
// Mailroom
b.prop('counter', 108, 37, { w: 8, h: 1.2 });
b.prop('mailbox', 100, 36).prop('mailbox', 101, 36).prop('mailbox', 102, 36);
b.prop('tube', 116, 36, { w: 1, h: 1, solid: true });
b.prop('crate', 115, 49).prop('crate', 116, 50);
// Foundry
b.prop('generator', 10, 68, { w: 3, h: 2 });
b.prop('tank', 22, 68, { w: 2, h: 2 });
b.prop('desk', 15, 76, { w: 4, h: 1.5, label: 'SPAWN BAY' });
b.prop('barrel', 8, 78).prop('barrel', 9, 78);
// Arcade
b.prop('arcade', 32, 67).prop('arcade', 34, 67).prop('arcade', 36, 67).prop('arcade', 44, 67).prop('arcade', 46, 67);
b.prop('rug', 39, 73, { w: 6, h: 4, solid: false, color: '#ec4899' });
b.prop('sofa', 39, 77, { w: 4, h: 1.2 });
// Server room
b.prop('server', 57, 68).prop('server', 59, 68).prop('server', 61, 68).prop('server', 63, 68);
b.prop('server', 57, 75).prop('server', 59, 75).prop('server', 65, 75).prop('server', 67, 75);
// Archive
b.prop('bookshelf', 78, 66, { w: 3, h: 1 }).prop('bookshelf', 82, 66, { w: 3, h: 1 }).prop('bookshelf', 86, 66, { w: 3, h: 1 });
b.prop('bookshelf', 78, 72, { w: 3, h: 1 }).prop('bookshelf', 86, 72, { w: 3, h: 1 });
b.prop('crate', 88, 78);
// Rooftop
b.prop('planter', 102, 68, { w: 3, h: 1.5 }).prop('planter', 110, 68, { w: 3, h: 1.5 }).prop('planter', 102, 76, { w: 3, h: 1.5 });
b.prop('tree', 115, 80, { w: 2, h: 2 }).prop('tree', 100, 84, { w: 2, h: 2 });
b.prop('dish', 114, 66, { w: 2, h: 2 });
b.prop('bench', 108, 82, { w: 3, h: 1 });
// Halls
b.prop('plant', 28, 24).prop('plant', 92, 24).prop('poster', 75, 23.2, { solid: false, w: 3, h: 0.2, label: 'MARION' });
b.lamp(30, 25, 4, '#fde68a').lamp(62, 25, 4, '#fde68a').lamp(93, 25, 4, '#fde68a').lamp(30, 59, 4, '#fde68a').lamp(62, 59, 4, '#fde68a').lamp(93, 59, 4, '#fde68a');

// --- Stations --------------------------------------------------------------
b.st('emergency', 62, 43, 'command');
b.st('admin', 64, 9, 'life');
b.st('cams', 40, 38.6, 'security');
b.st('doorlog', 36, 44, 'security');
b.st('vitals', 86, 46, 'huddle');
b.st('lightsPanel', 68, 72, 'server');
b.st('commsPanel', 45, 16, 'bridge');
b.st('meltdownA', 8, 14, 'engine').st('meltdownB', 24, 17, 'engine');
b.st('pressureA', 8, 42, 'cutting').st('pressureB', 116, 44, 'mail');
b.st('recharge', 52, 37, 'command').st('recharge', 22, 48, 'cutting').st('recharge', 88, 78, 'archive').st('recharge', 114, 20, 'media');
// Tasks
b.st('stampMail', 108, 39, 'mail').st('stampMail', 112, 39, 'mail');
b.st('sortClips', 10, 40, 'cutting').st('sortClips', 18, 40, 'cutting');
b.st('distillReel', 99, 16, 'media');
b.st('slotCartridge', 17, 74, 'foundry');
b.st('calibrateTurntable', 69, 16.5, 'life');
b.st('sortBerries', 104, 69.8, 'rooftop').st('sortBerries', 56, 14, 'life');
b.st('juicePress', 84, 39.5, 'huddle');
b.st('alignDish', 114, 68.5, 'rooftop');
b.st('fuelCan', 12, 70, 'foundry');
b.st('fuelEngine', 16, 18.2, 'engine');
b.st('fixWiring', 7, 8, 'engine').st('fixWiring', 7, 36, 'cutting').st('fixWiring', 117, 50, 'mail').st('fixWiring', 89, 66, 'archive').st('fixWiring', 47, 78, 'arcade');
b.st('swipeBadge', 44, 44, 'security');
b.st('waterPlants', 110, 70, 'rooftop').st('waterPlants', 51, 38, 'command');
b.st('cleanFilter', 66, 70, 'server');
b.st('download', 110, 10, 'media').st('download', 20, 36, 'cutting').st('download', 24, 76, 'foundry').st('download', 46, 7, 'bridge');
b.st('upload', 60, 9, 'life');
b.st('unlockManifold', 8, 18, 'engine');
b.st('simonSays', 40, 66.5, 'arcade');
b.st('keypadCode', 86, 12, 'vault').st('keypadCode', 33, 18, 'bridge');
b.st('emptyChute', 117, 38, 'mail');
b.st('medScan', 80, 44, 'huddle');
b.st('primeShields', 33, 7, 'bridge');
b.st('chartCourse', 42, 13, 'bridge');
b.st('rerouteTube', 115, 37.5, 'mail').st('rerouteTube', 70, 7, 'life').st('rerouteTube', 99.5, 20, 'media').st('rerouteTube', 78, 78, 'archive');
b.st('replaceFuse', 55, 76, 'server').st('replaceFuse', 77, 76, 'archive').st('replaceFuse', 7, 12, 'engine');
b.st('rechargeGenerator', 10, 70.5, 'foundry');
b.st('lightLantern', 117, 84, 'rooftop').st('lightLantern', 31, 78, 'arcade').st('lightLantern', 77, 18, 'vault').st('lightLantern', 7, 49, 'cutting').st('lightLantern', 73, 37, 'command');

// --- Vents (4 networks) ----------------------------------------------------
b.vent('v-engine', 22, 14, 'west', ['v-cutting', 'v-security']);
b.vent('v-cutting', 20, 44, 'west', ['v-engine', 'v-security']);
b.vent('v-security', 44, 40, 'west', ['v-engine', 'v-cutting']);
b.vent('v-bridge', 35, 12, 'north', ['v-life']);
b.vent('v-life', 70, 10, 'north', ['v-bridge', 'v-vault']);
b.vent('v-vault', 80, 17, 'north', ['v-life']);
b.vent('v-media', 113, 13, 'east', ['v-mail', 'v-roof']);
b.vent('v-mail', 101, 48, 'east', ['v-media', 'v-roof']);
b.vent('v-roof', 106, 78, 'east', ['v-media', 'v-mail']);
b.vent('v-foundry', 22, 78, 'south', ['v-arcade', 'v-server']);
b.vent('v-arcade', 32, 75, 'south', ['v-foundry', 'v-server']);
b.vent('v-server', 62, 72, 'south', ['v-foundry', 'v-arcade', 'v-archive']);
b.vent('v-archive', 84, 76, 'south', ['v-server']);

// --- Cameras ---------------------------------------------------------------
b.cam(30, 25, 'North-West Hall').cam(62, 25, 'North Hall').cam(93, 25, 'North-East Hall');
b.cam(30, 59, 'South-West Hall').cam(62, 59, 'South Hall').cam(93, 59, 'South-East Hall');

export const HQ_MAP = b.build({
  id: 'hq',
  name: 'Marion HQ After Hours',
  tagline: 'The office never really sleeps.',
  w: 124,
  h: 90,
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
