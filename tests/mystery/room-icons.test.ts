import { describe, expect, it } from 'vitest';
import { getMap } from '../../src/mystery/core/maps';
import { ROOM_ICON_LABEL, roomAnchors, roomIconFor } from '../../src/mystery/render2d/roomIcons';

const MAPS = ['hq', 'greenhouse', 'express', 'manor', 'lobby'] as const;

describe('room icons', () => {
  it('gives every room a known icon and an anchor inside its own footprint', () => {
    for (const id of MAPS) {
      const map = getMap(id);
      const anchors = roomAnchors(map);
      expect(anchors.length).toBe(map.def.rooms.length);
      anchors.forEach((a, ri) => {
        expect(a.room).toBe(map.def.rooms[ri]);
        expect(ROOM_ICON_LABEL[a.icon], `${id}/${a.room.id}`).toBeTruthy();
        expect(map.roomIdx[Math.floor(a.y) * map.w + Math.floor(a.x)], `${id}/${a.room.id} anchor`).toBe(ri);
        expect(a.spanX).toBeGreaterThanOrEqual(1);
        expect(a.spanY).toBeGreaterThanOrEqual(1);
      });
      expect(roomAnchors(map)).toBe(anchors);
    }
  });

  it('derives icons from facilities first, then names, then props', () => {
    const icon = (m: (typeof MAPS)[number], room: string) => roomIconFor(getMap(m), getMap(m).roomById.get(room)!);
    // The meeting room (emergency button) on every playable map.
    for (const id of MAPS.slice(0, 4)) expect(icon(id, getMap(id).def.meetingRoom)).toBe('meeting');
    expect(icon('hq', 'security')).toBe('security');
    expect(icon('hq', 'life')).toBe('admin');
    expect(icon('greenhouse', 'infirmary')).toBe('medical');
    expect(icon('greenhouse', 'galley')).toBe('food');
    expect(icon('greenhouse', 'bunks')).toBe('beds');
    expect(icon('greenhouse', 'core')).toBe('reactor');
    expect(icon('manor', 'library')).toBe('books');
    expect(icon('manor', 'kitchen')).toBe('food');
    expect(icon('express', 'engine')).toBe('engine');
    expect(icon('lobby', 'bay')).toBe('wardrobe');
    // Outdoor rooms with no other cue fall back to the outdoor glyph.
    expect(icon('greenhouse', 'hull')).toBe('outdoor');
  });

  it('uses a varied set of icons per map', () => {
    for (const id of MAPS.slice(0, 4)) {
      const set = new Set(roomAnchors(getMap(id)).map((a) => a.icon));
      expect(set.size, id).toBeGreaterThanOrEqual(10);
    }
  });
});
