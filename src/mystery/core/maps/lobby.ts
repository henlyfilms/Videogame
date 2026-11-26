/**
 * The waiting room: a Marion HQ launch bay where players gather while the
 * lobby fills. Has a wardrobe mirror (customisation), the host laptop
 * (settings) and a few toys.
 */
import { MapBuilder } from './builder';

const b = new MapBuilder();
b.room('bay', 'Launch Bay', [4, 4, 28, 18], 'checker', '#2f6fed');
b.room('lounge', 'Break Lounge', [32, 7, 10, 12], 'rug', '#ec4899');
b.prop('rug', 18, 13, { w: 10, h: 6, solid: false, color: '#2f6fed' });
b.prop('sofa', 37, 17, { w: 4, h: 1.2 });
b.prop('turntable', 40, 9, { w: 1.5, h: 1.5 });
b.prop('plant', 5, 5).prop('plant', 31, 5).prop('plant', 5, 21).prop('plant', 31, 21);
b.prop('poster', 18, 4.2, { w: 8, h: 0.2, solid: false, label: 'MARION MYSTERY' });
b.prop('arcade', 34, 8).prop('arcade', 36, 8);
b.prop('window', 18, 21.8, { w: 16, h: 0.3, solid: false });
b.st('wardrobe', 7, 8, 'bay');
b.st('laptop', 29, 8, 'bay');
b.lamp(10, 18, 5, '#fde68a').lamp(26, 18, 5, '#fde68a');

export const LOBBY_MAP = b.build({
  id: 'lobby',
  name: 'Launch Bay',
  tagline: 'Waiting for berries…',
  w: 46,
  h: 26,
  theme: {
    sky: '#0b1020',
    void: '#0d1324',
    wall: '#c7d2e5',
    wallTop: '#eef2fa',
    trim: '#2f6fed',
    hall: '#dfe5ef',
    accent: '#2f6fed',
    night: '#0a0f1f',
    fog: '#0b1226',
    ambience: 'lobby',
  },
  spawn: { x: 18, y: 13 },
  meetingRoom: 'bay',
  eject: 'tube',
  criticalNames: { meltdown: '-', pressure: '-' },
});
