import { describe, expect, it } from 'vitest';
import { compileMap, type MapDef, type PropDef, type PropKind } from '../../src/mystery/core/map';
import { getMap, MAP_ORDER } from '../../src/mystery/core/maps/index';
import { defaultCosmetics } from '../../src/mystery/characters/catalog';
import { paintMapOverview } from '../../src/mystery/render2d/overview';
import { paintProp, paintStation, paintVent } from '../../src/mystery/render2d/paint';
import { easeOutBack, keyLabel, PromptFader } from '../../src/mystery/render2d/prompts';
import { Renderer2D, tagStyleFor, type FrameData } from '../../src/mystery/render2d/renderer';
import { Diag, roomLabel, worldInfo } from '../../src/mystery/render2d/world';
import { cornerPoints, wallBoundary } from '../../src/mystery/render3d/worldkit';
import { makeMockContext } from '../canvasMock';

function testMap(extra: [number, number, number, number][] = []): MapDef {
  return {
    id: 'hq',
    name: 'Test',
    tagline: '',
    w: 20,
    h: 16,
    theme: { sky: '#000', void: '#000', wall: '#888', wallTop: '#999', trim: '#f00', hall: '#ccc', accent: '#00f', night: '#000', fog: '#000', ambience: 'station' },
    rooms: [{ id: 'a', name: "Somebody's Room", rect: [5, 2, 8, 10], floor: 'tile', color: '#2f6fed', extra }],
    halls: [],
    props: [],
    stations: [],
    vents: [],
    doors: [],
    cameras: [],
    sensors: [],
    lamps: [],
    spawn: { x: 8, y: 6 },
    meetingRoom: 'a',
    eject: 'tube',
    criticalNames: { meltdown: 'm', pressure: 'p' },
  };
}

describe('world analysis (2D/3D shared)', () => {
  it('turns stepped corners into 45° diagonals but leaves square corners alone', () => {
    // Staircase down the west side: (4,3..), (3,4..), (2,5..).
    const m = compileMap(testMap([[4, 3, 1, 9], [3, 4, 1, 8], [2, 5, 1, 7]]));
    const info = worldInfo(m);
    const at = (x: number, y: number) => info.diag[y * m.w + x];
    expect(at(4, 2)).toBe(Diag.SE);
    expect(at(3, 3)).toBe(Diag.SE);
    expect(at(2, 4)).toBe(Diag.SE);
    // A plain rectangle has no diagonals at all.
    const plain = worldInfo(compileMap(testMap()));
    expect([...plain.diag].some((d) => d !== 0)).toBe(false);
  });

  it('finds wall boundary corners only where the boundary turns', () => {
    const m = compileMap(testMap());
    const { floorSide } = wallBoundary(m, worldInfo(m));
    // A rectangle room: boundary is its perimeter, with exactly 4 corners.
    expect(floorSide.length).toBe(2 * (8 + 10));
    expect(cornerPoints(floorSide).length).toBe(4);
  });

  it('marks outdoor rooms as exterior and builds a distance field into the void', () => {
    const def = testMap();
    def.rooms[0]!.outdoor = true;
    const m = compileMap(def);
    const info = worldInfo(m);
    expect(info.extFloor[6 * m.w + 8]).toBe(1);
    expect(info.extDist[6 * m.w + 3]).toBe(2);
    expect(info.wallExt[m.walls[0]!]).toBe(1);
  });

  it('lays room names out to fit inside the room', () => {
    const L = roomLabel(testMap().rooms[0]!);
    expect(L.text).toBe("SOMEBODY'S ROOM");
    expect(L.width).toBeLessThanOrEqual(8 * 0.9);
  });
});

describe('prompts', () => {
  it('eases prompts in and out instead of popping', () => {
    const f = new PromptFader();
    f.update(new Set(['kill:x']), 0.05, false);
    const a = f.get('kill:x');
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    for (let i = 0; i < 20; i++) f.update(new Set(['kill:x']), 0.05, false);
    expect(f.get('kill:x')).toBe(1);
    f.update(new Set(), 0.05, false);
    expect(f.get('kill:x')).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) f.update(new Set(), 0.05, false);
    expect(f.get('kill:x')).toBe(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(easeOutBack(0)).toBeCloseTo(0);
  });

  it('labels keys for hints', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('')).toBe('');
  });

  it('builds name tag styles with role colours and the local outline flag', () => {
    const st = tagStyleFor({ name: 'Berry', cosmetics: defaultCosmetics(), nameColor: '#ff4d5e', local: true, ghost: false });
    expect(st.color).toBe('#ff4d5e');
    expect(st.local).toBe(true);
    expect(st.ring.length).toBeGreaterThan(0);
  });
});

describe('painters run on every map and prop kind', () => {
  const kinds: (PropKind | 'mystery-new-kind')[] = ['table', 'roundTable', 'desk', 'chair', 'sofa', 'bed', 'shelf', 'crate', 'barrel', 'plant', 'tree', 'hedge', 'console', 'screen', 'server', 'locker', 'counter', 'stove', 'fridge', 'piano', 'arcade', 'lamp', 'pillar', 'tank', 'pipe', 'engine', 'window', 'rug', 'statue', 'fountain', 'clock', 'fireplace', 'snowpile', 'rock', 'tube', 'turntable', 'mailbox', 'poster', 'bench', 'seat', 'cart', 'planter', 'telescope', 'dish', 'generator', 'mystery-new-kind'];
  it('paints props (incl. unknown future kinds), stations and vents', () => {
    const g = makeMockContext();
    for (const k of kinds) expect(() => paintProp(g, { kind: k as PropKind, x: 3, y: 3, w: 2, h: 1, rot: 0.3, label: 'X' } as PropDef, 40, false)).not.toThrow();
    expect(() => paintStation(g, { id: 's', kind: 'emergency', x: 2, y: 2, room: 'a' }, 40, true)).not.toThrow();
    expect(() => paintVent(g, { id: 'v', x: 2, y: 2, net: 'n', links: [] }, 40, false)).not.toThrow();
  });

  it.each(MAP_ORDER)('renders a 2D match frame with every prompt on %s', (id) => {
    const map = getMap(id);
    const canvas = document.createElement('canvas');
    const r = new Renderer2D(canvas);
    r.resize(800, 600, 1);
    const st = map.def.stations[0]!;
    const v = map.def.vents[0]!;
    const cos = defaultCosmetics();
    const f: FrameData = {
      mode: 'match',
      map,
      t: 1,
      focus: { x: st.x, y: st.y },
      players: [
        { id: 'me', name: 'Me', cosmetics: cos, pos: { x: st.x, y: st.y }, facing: 0, moving: false, ghost: false, local: true },
        { id: 'b', name: 'Bot', cosmetics: cos, pos: { x: st.x + 1, y: st.y }, facing: 0, moving: true, ghost: false, nameColor: '#ff4d5e' },
      ],
      bodies: [{ id: 'body', cosmetics: cos, pos: { x: st.x - 1, y: st.y } }],
      projectiles: [],
      gunDrop: null,
      batteries: [],
      closedDoors: new Set(map.def.doors.slice(0, 1).map((d) => d.id)),
      litLanterns: new Set(),
      highlight: new Set([st.id]),
      near: st.id,
      vision: { radius: 5, cone: null, all: false },
      night: id === 'manor',
      lightsSabotaged: false,
      critical: false,
      reducedMotion: false,
      highVisibility: false,
      footprints: false,
      trackPos: null,
      zoom: 1,
      prompts: { kill: 'b', report: 'body', vent: v.id, inVent: v.id, keys: { use: 'E', kill: 'Q', report: 'R', vent: 'V' } },
    };
    expect(() => {
      for (let i = 0; i < 5; i++) r.render(f, 1 / 60);
    }).not.toThrow();
    r.dispose();
  });

  it('paints the legend-style overview', () => {
    const g = makeMockContext();
    expect(() => paintMapOverview(g, getMap('hq'), 6, false)).not.toThrow();
  });
});
