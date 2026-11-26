import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cosmetics } from '../../src/mystery/core/types';
import { colorFamily } from '../../src/mystery/core/match';
import {
  BACK,
  BERRIES,
  BROWS,
  defaultCosmetics,
  EMOTES,
  EYES,
  FACE,
  HAIR,
  HAIR_COLORS,
  HATS,
  MARION_BOT_LOOKS,
  MOUTHS,
  NAMEPLATES,
  OUTFITS,
  PALETTE,
  PATTERNS,
  PETS,
  randomCosmetics,
  resolveColors,
  sanitizeCosmetics,
  VICTORY,
} from '../../src/mystery/characters/catalog';
import { drawBerry, drawBody, drawEmoteBubble, drawNameplate, drawPet, type BerryPose } from '../../src/mystery/characters/draw2d';
import { attachInkHulls, hullGeometry, setHullMats, type HullMats } from '../../src/mystery/characters/outline3d';
import { createBerry, createBody, createPet, type OneShot } from '../../src/mystery/characters/rig3d';
import { CustomizeEditor } from '../../src/mystery/ui/CustomizeEditor';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ids = (l: readonly { id: string }[]): string[] => l.map((i) => i.id);

describe('catalog', () => {
  it('meets the minimum item counts', () => {
    expect(BERRIES).toHaveLength(12);
    expect(PALETTE).toHaveLength(20);
    expect(PATTERNS.length).toBeGreaterThanOrEqual(6);
    expect(EYES.length).toBeGreaterThanOrEqual(8);
    expect(BROWS.length).toBeGreaterThanOrEqual(5);
    expect(MOUTHS.length).toBeGreaterThanOrEqual(8);
    expect(HAIR.length).toBeGreaterThanOrEqual(20);
    expect(HAIR_COLORS.length).toBeGreaterThanOrEqual(8);
    expect(HATS.length).toBeGreaterThanOrEqual(30);
    expect(FACE.length).toBeGreaterThanOrEqual(15);
    expect(OUTFITS.length).toBeGreaterThanOrEqual(15);
    expect(BACK.length).toBeGreaterThanOrEqual(8);
    expect(PETS.length).toBeGreaterThanOrEqual(10);
    expect(NAMEPLATES.length).toBeGreaterThanOrEqual(10);
    expect(EMOTES.length).toBeGreaterThanOrEqual(8);
    expect(VICTORY.length).toBeGreaterThanOrEqual(4);
  });

  it('has unique ids and the required items', () => {
    for (const list of [BERRIES, PATTERNS, EYES, BROWS, MOUTHS, HAIR, HATS, FACE, OUTFITS, BACK, PETS, NAMEPLATES, EMOTES, VICTORY]) {
      expect(new Set(ids(list)).size).toBe(list.length);
    }
    for (const id of ['googly', 'sleepy', 'sparkle', 'cool']) expect(ids(EYES)).toContain(id);
    for (const id of ['buck', 'smirk', 'grin', 'o']) expect(ids(MOUTHS)).toContain(id);
    for (const id of ['none', 'long', 'ponytail', 'braids', 'curls', 'afro', 'mohawk', 'buns', 'bob', 'pigtails', 'leafy', 'spiky', 'sideswept', 'mullet']) expect(ids(HAIR)).toContain(id);
    for (const id of ['none', 'beanie', 'cap', 'tophat', 'crown', 'cowboy', 'chef', 'party', 'headphones', 'halo', 'flowercrown', 'cloud', 'gemcrown', 'propeller', 'deerstalker', 'wizard', 'bucket', 'beret', 'viking', 'spacehelmet', 'sprout']) expect(ids(HATS)).toContain(id);
    for (const id of ['none', 'roundglasses', 'shades', 'starglasses', 'monocle', 'visor', 'mask', 'mustache', 'eyepatch', 'goggles', 'bandana']) expect(ids(FACE)).toContain(id);
    for (const id of ['none', 'hoodie', 'suit', 'labcoat', 'spacesuit', 'scarf', 'overalls', 'sweater', 'cape', 'apron', 'raincoat', 'tux', 'varsity']) expect(ids(OUTFITS)).toContain(id);
    for (const id of ['backpack', 'jetpack', 'wings', 'guitar', 'cape', 'quiver']) expect(ids(BACK)).toContain(id);
    for (const id of ['none', 'miniberry', 'drone', 'cat', 'duckling', 'snail', 'cloud', 'ghosty', 'robodog', 'frog', 'bee']) expect(ids(PETS)).toContain(id);
    for (const id of ['wave', 'dance', 'laugh', 'shrug', 'point', 'facepalm', 'cheer', 'sit', 'heart']) expect(ids(EMOTES)).toContain(id);
  });

  it('palette follows the colorFamily pair order with valid hexes', () => {
    PALETTE.forEach((p, i) => {
      expect(p.family).toBe(colorFamily(i));
      for (const h of [p.hex, p.dark, p.light]) expect(h).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.name.length).toBeGreaterThan(0);
    });
  });
});

describe('sanitizeCosmetics', () => {
  const garbage: unknown[] = [
    null,
    undefined,
    42,
    'strawberry',
    [],
    [1, 2, 3],
    true,
    () => 1,
    { berry: 5, color: 'red', emotes: 'wave' },
    { berry: 'durian', hat: 'nope', color: 999, hairColor: 'blue', emotes: [1, null, {}, 'wave', 'wave', 'bogus'] },
    { color: -5, hairColor: '#GGGGGG' },
    { color: Number.NaN, hairColor: '#ABCDEF' },
    { color: Number.POSITIVE_INFINITY, emotes: new Array(100000).fill('dance') },
    { emotes: Array.from({ length: 50000 }, (_, i) => EMOTES[i % EMOTES.length]!.id) },
    { __proto__: { berry: 'cherry' }, pattern: { toString: () => 'stars' } },
    { hairColor: '#123456789', nameplate: ['gold'], victory: 7 },
  ];

  it('always returns valid cosmetics for garbage input', () => {
    const d = defaultCosmetics();
    for (const g of garbage) {
      const c = sanitizeCosmetics(g);
      expect(ids(BERRIES)).toContain(c.berry);
      expect(Number.isInteger(c.color)).toBe(true);
      expect(c.color).toBeGreaterThanOrEqual(0);
      expect(c.color).toBeLessThan(20);
      expect(c.hairColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.emotes.length).toBeGreaterThan(0);
      expect(c.emotes.length).toBeLessThanOrEqual(8);
      expect(new Set(c.emotes).size).toBe(c.emotes.length);
      for (const e of c.emotes) expect(ids(EMOTES)).toContain(e);
      expect(Object.keys(c).sort()).toEqual(Object.keys(d).sort());
    }
  });

  it('clamps colours, validates hex and keeps valid values', () => {
    expect(sanitizeCosmetics({ color: 999 }).color).toBe(19);
    expect(sanitizeCosmetics({ color: -3 }).color).toBe(0);
    expect(sanitizeCosmetics({ color: 7.4 }).color).toBe(7);
    expect(sanitizeCosmetics({ hairColor: '#ABCDEF' }).hairColor).toBe('#abcdef');
    expect(sanitizeCosmetics({ hairColor: 'blue' }).hairColor).toBe(defaultCosmetics().hairColor);
    expect(sanitizeCosmetics({ hat: 'tophat', berry: 'cherry' })).toMatchObject({ hat: 'tophat', berry: 'cherry' });
    expect(sanitizeCosmetics({ hat: 'nope' }).hat).toBe('none');
    const big = sanitizeCosmetics({ emotes: EMOTES.map((e) => e.id).concat(EMOTES.map((e) => e.id)) });
    expect(big.emotes).toEqual(EMOTES.slice(0, 8).map((e) => e.id));
  });

  it('is idempotent', () => {
    for (const g of garbage) {
      const once = sanitizeCosmetics(g);
      expect(sanitizeCosmetics(once)).toEqual(once);
      expect(sanitizeCosmetics(JSON.parse(JSON.stringify(once)))).toEqual(once);
    }
  });
});

describe('randomCosmetics', () => {
  it('is deterministic per seed, sanitize-stable and varied', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 300; s++) {
      const a = randomCosmetics(s);
      expect(randomCosmetics(s)).toEqual(a);
      expect(sanitizeCosmetics(a)).toEqual(a);
      expect(a.emotes).toHaveLength(8);
      // Attractive: covering hats never sit on top of volume hair.
      const hat = HATS.find((h) => h.id === a.hat)!;
      const hair = HAIR.find((h) => h.id === a.hair)!;
      expect(hat.covers && hair.volume).toBe(false);
      seen.add(JSON.stringify(a));
    }
    expect(seen.size).toBe(300);
    const berries = new Set(Array.from({ length: 300 }, (_, s) => randomCosmetics(s).berry));
    expect(berries.size).toBe(12);
  });
});

describe('resolveColors', () => {
  it('first come keeps the colour, duplicates move to the nearest free one', () => {
    const r = resolveColors([
      { id: 'a', color: 4 },
      { id: 'b', color: 4 },
      { id: 'c', color: 4 },
    ]);
    expect(r.a).toBe(4);
    expect(r.b).toBe(5); // same-family partner first
    expect(r.c).toBe(3);
  });

  it('resolves 20 colliding players to 20 distinct colours', () => {
    const players = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, color: i % 3 }));
    const r = resolveColors(players);
    const vals = Object.values(r);
    expect(new Set(vals).size).toBe(20);
    for (const v of vals) expect(v >= 0 && v < 20).toBe(true);
    expect(r.p0).toBe(0);
    expect(r.p1).toBe(1);
    expect(r.p2).toBe(2);
    const garbage = resolveColors([{ id: 'x', color: Number.NaN }, { id: 'y', color: 500 }]);
    expect(garbage.x).toBe(0);
    expect(garbage.y).toBe(19);
  });
});

describe('Marion bot looks', () => {
  it('gives every bot a valid, distinct look with a nod to its HQ shape', () => {
    const keys = ['daniel', 'moose', 'kanye', 'barry', 'greek', 'quill', 'sift', 'builder'] as const;
    for (const k of keys) expect(sanitizeCosmetics(MARION_BOT_LOOKS[k])).toEqual(MARION_BOT_LOOKS[k]);
    expect(new Set(keys.map((k) => MARION_BOT_LOOKS[k].color)).size).toBe(8);
    expect(MARION_BOT_LOOKS.barry.hat).toBe('gemcrown');
    expect(MARION_BOT_LOOKS.builder.hat).toBe('cloud');
    expect(MARION_BOT_LOOKS.moose.berry).toBe('marionberry');
    expect(MARION_BOT_LOOKS.quill.berry).toBe('blueberry');
    expect(MARION_BOT_LOOKS.sift.berry).toBe('blueberry');
    expect([MARION_BOT_LOOKS.kanye.outfit, MARION_BOT_LOOKS.kanye.face]).toContain('heartpin');
    expect(MARION_BOT_LOOKS.greek.face).toBe('starglasses');
    expect(MARION_BOT_LOOKS.daniel.pattern).toBe('groovy');
  });
});

// ---------------------------------------------------------------------------

function sampleLooks(): Cosmetics[] {
  const out: Cosmetics[] = [];
  const cats: [keyof Cosmetics, readonly { id: string }[]][] = [
    ['hat', HATS],
    ['hair', HAIR],
    ['face', FACE],
    ['outfit', OUTFITS],
    ['back', BACK],
    ['eyes', EYES],
    ['brows', BROWS],
    ['mouth', MOUTHS],
    ['pattern', PATTERNS],
    ['pet', PETS],
  ];
  let n = 0;
  for (const [field, list] of cats) {
    list.forEach((it) => {
      const b = BERRIES[n % BERRIES.length]!;
      out.push(sanitizeCosmetics({ ...defaultCosmetics(), berry: b.id, color: n % 20, [field]: it.id }));
      n++;
    });
  }
  return out;
}

describe('draw2d', () => {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const poses: BerryPose[] = [
    { time: 0.3, moving: false, dir: 1 },
    { time: 1.7, moving: true, dir: -1 },
    { time: 2.2, moving: false, dir: 1, ghost: true, alpha: 0.7 },
    { time: 0.9, moving: true, dir: 1, hold: 'gun' },
    { time: 3.1, moving: false, dir: -1, hold: 'flashlight', flashlightOn: true, scared: true },
    { time: 4.4, moving: false, dir: 1, hold: 'knife', blink: true },
  ];

  it('draws every berry with every sampled item in several poses', () => {
    for (const b of BERRIES) for (const p of poses) drawBerry(ctx, { ...defaultCosmetics(), berry: b.id }, 10, 10, 1.3, p);
    for (const c of sampleLooks()) for (const p of poses.slice(0, 3)) drawBerry(ctx, c, 50, 50, 2, p);
    for (const c of Object.values(MARION_BOT_LOOKS)) drawBerry(ctx, c, 0, 0, 1, poses[0]!);
    for (let s = 0; s < 40; s++) drawBerry(ctx, randomCosmetics(s), 0, 0, 0.6, poses[s % poses.length]!);
  });

  it('draws every emote and victory pose', () => {
    for (const e of [...EMOTES, ...VICTORY]) drawBerry(ctx, randomCosmetics(3), 0, 0, 1, { time: 1.1, moving: false, dir: 1, emote: e.id });
    for (const e of EMOTES) drawEmoteBubble(ctx, e.id, 0, -50, 1, 0.5);
    drawEmoteBubble(ctx, 'unknown', 0, 0, 1, 0);
  });

  it('draws bodies, pets and nameplates', () => {
    for (const b of BERRIES) drawBody(ctx, { ...randomCosmetics(9), berry: b.id }, 0, 0, 1.2, 0.4);
    for (const p of PETS) drawPet(ctx, p.id, 0, 0, 1, 2.5, -1);
    for (const n of NAMEPLATES) drawNameplate(ctx, n.id, 'Berry Bandit', 100, 20, 1.5);
    drawNameplate(ctx, 'bogus', '', 0, 0, 1);
  });
});

describe('rig3d (no WebGL)', () => {
  const countMeshes = (g: THREE.Object3D): number => {
    let n = 0;
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) {
        let vis = true;
        for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) vis = false;
        if (vis) n++;
      }
    });
    return n;
  };
  const shots: OneShot[] = ['wave', 'celebrate', 'sulk', 'scared', 'knife-twirl', 'gun-spin', 'magnify', 'shrug', 'kill-lunge', 'squish'];

  it('builds every berry type, animates and disposes', () => {
    for (const b of BERRIES) {
      const rig = createBerry({ ...defaultCosmetics(), berry: b.id, color: b.natural }, { quality: 'medium' });
      expect(rig.group).toBeInstanceOf(THREE.Group);
      expect(rig.height).toBeGreaterThan(0.75);
      expect(rig.height).toBeLessThan(1.25);
      rig.group.updateMatrixWorld(true);
      const box = new THREE.Box3();
      rig.group.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.name === 'shadow') return;
        const inst = m as THREE.InstancedMesh;
        if (inst.isInstancedMesh) {
          inst.computeBoundingBox();
          box.union(inst.boundingBox!.clone().applyMatrix4(m.matrixWorld));
          return;
        }
        m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
      });
      expect(box.min.y).toBeGreaterThan(-0.05);
      expect(box.max.x - box.min.x).toBeLessThan(1.1);
      rig.update(0.016, { moving: true, speed: 2.4 });
      rig.update(0.016, { moving: false, emote: 'dance' });
      rig.dispose();
      expect(rig.group.parent).toBeNull();
    }
  });

  it('builds sampled item combos in all qualities, runs update() and play()', () => {
    const looks = sampleLooks();
    looks.forEach((c, i) => {
      const q = (['low', 'medium', 'high'] as const)[i % 3]!;
      const rig = createBerry(c, { quality: q });
      const s = i % 4;
      rig.update(0.02, { moving: s === 1, ghost: s === 2, hold: s === 3 ? 'gun' : null, scared: s === 2, lookYaw: 0.3 });
      rig.play(shots[i % shots.length]!);
      for (let k = 0; k < 6; k++) rig.update(0.05, { moving: k % 2 === 0, emote: EMOTES[k % EMOTES.length]!.id, hold: k === 3 ? 'knife' : k === 4 ? 'flashlight' : null });
      rig.setCosmetics(randomCosmetics(i));
      rig.update(0.03, { moving: false });
      rig.dispose();
    });
  });

  it('keeps low-quality draw calls small', () => {
    const rig = createBerry({ ...defaultCosmetics(), hat: 'tophat', hair: 'bob', outfit: 'hoodie', face: 'none' }, { quality: 'low' });
    expect(countMeshes(rig.group)).toBeLessThanOrEqual(8);
    rig.dispose();
  });

  it('ghost mode hides legs and makes materials translucent', () => {
    const rig = createBerry(MARION_BOT_LOOKS.kanye);
    rig.update(0.02, { moving: false, ghost: true });
    const legs = rig.group.getObjectByName('legL')!;
    expect(legs.parent!.visible).toBe(false);
    const body = rig.group.getObjectByName('body') as THREE.Mesh;
    expect((body.material as THREE.Material).transparent).toBe(true);
    rig.update(0.02, { moving: false, ghost: false });
    expect((body.material as THREE.Material).transparent).toBe(false);
    rig.dispose();
  });

  it('builds bodies and pets', () => {
    for (const b of BERRIES) {
      const g = createBody({ ...defaultCosmetics(), berry: b.id });
      expect(g.children.length).toBeGreaterThan(2);
      (g.userData.update as ((dt: number) => void) | undefined)?.(0.1);
    }
    for (const p of PETS) {
      const pet = createPet(p.id);
      pet.update(0.05, true);
      pet.update(0.05, false);
      expect(pet.group).toBeInstanceOf(THREE.Group);
    }
  });
});

describe('ink outlines (outline3d)', () => {
  const mats = (): HullMats => ({ main: new THREE.MeshBasicMaterial(), thin: new THREE.MeshBasicMaterial() });
  const owner = (h: THREE.Mesh): THREE.Mesh => h.parent as THREE.Mesh;

  it('outlines every solid part of the whole character, once, as children of the part', () => {
    const ink = mats();
    const rig = createBerry({ ...defaultCosmetics(), berry: 'raspberry', hat: 'wizard', hair: 'ponytail', face: 'roundglasses', outfit: 'scarf', back: 'backpack' }, { quality: 'high' });
    const hulls: THREE.Mesh[] = [];
    attachInkHulls(rig.group, ink, hulls);
    const names = new Set(hulls.map((h) => owner(h).name));
    for (const n of ['body', 'drupelets', 'armL', 'armR', 'legL', 'legR', 'headwear', 'accessories', 'face-solid', 'back-solid', 'hair-tail']) expect(names, n).toContain(n);
    for (const h of hulls) {
      expect(h.userData.hull).toBe(true);
      expect(String(owner(h).userData.matKind)).toMatch(/^(body|vc|vcd|detailInst)$/);
      // Shares the part's vertex buffer, carries its own smoothed normals.
      expect(h.geometry.getAttribute('position')).toBe(owner(h).geometry.getAttribute('position'));
    }
    expect(hulls.find((h) => owner(h).name === 'face-solid')!.material).toBe(ink.thin);
    expect(hulls.find((h) => owner(h).name === 'body')!.material).toBe(ink.main);
    // Idempotent: a second pass finds the same hulls and adds none.
    expect(attachInkHulls(rig.group, ink, []).length).toBe(hulls.length);
    // Held props bump the rig revision and get outlined on the next pass.
    const rev = rig.group.userData.rev as number;
    rig.update(0.02, { moving: false, hold: 'knife' });
    expect(rig.group.userData.rev).toBeGreaterThan(rev);
    expect(attachInkHulls(rig.group, ink, hulls).some((h) => owner(h).parent?.name.startsWith('prop-') || owner(h).name.startsWith('prop-'))).toBe(true);
    // Kill-target swap keeps line weights.
    const kill = mats();
    setHullMats(hulls, kill);
    expect(hulls.every((h) => h.material === kill[h.userData.weight as 'main' | 'thin'])).toBe(true);
    rig.dispose();
  });

  it('outlines pets and squished bodies', () => {
    const ink = mats();
    const pet = createPet('robodog');
    expect(attachInkHulls(pet.group, ink, [], 'thin').every((h) => h.material === ink.thin)).toBe(true);
    expect(attachInkHulls(pet.group, ink, []).length).toBeGreaterThan(0);
    expect(attachInkHulls(createBody(defaultCosmetics()), ink, []).length).toBeGreaterThan(0);
  });

  it('mitres hard corners: smoothed normals push every face out by the full width', () => {
    const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const h = hullGeometry(box);
    expect(hullGeometry(box)).toBe(h);
    const n = h.getAttribute('normal');
    const f = box.getAttribute('normal');
    for (let i = 0; i < n.count; i++) {
      const v = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
      const face = new THREE.Vector3(f.getX(i), f.getY(i), f.getZ(i));
      expect(v.dot(face)).toBeCloseTo(1, 3);
      expect(v.length()).toBeCloseTo(Math.sqrt(3), 3);
    }
    box.dispose();
  });
});

describe('CustomizeEditor (jsdom)', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it('renders, switches tabs and emits sanitized changes', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const onChange = vi.fn();
    const onName = vi.fn();
    root = createRoot(host);
    await act(async () => {
      root!.render(<CustomizeEditor value={defaultCosmetics()} onChange={onChange} name="Pip" onNameChange={onName} preview="2d" takenColors={[1, 2]} />);
    });
    expect(host.querySelector('canvas')).not.toBeNull();
    const tabs = Array.from(host.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual(['Berry', 'Colour', 'Face', 'Hair', 'Hat', 'Face Acc.', 'Outfit', 'Back', 'Pet', 'Nameplate', 'Emotes', 'Victory']);
    const hatTab = tabs.find((t) => t.textContent === 'Hat') as HTMLButtonElement;
    await act(async () => hatTab.click());
    expect(hatTab.getAttribute('aria-selected')).toBe('true');
    const top = host.querySelector('[data-item="tophat"]') as HTMLButtonElement;
    expect(top).not.toBeNull();
    await act(async () => top.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as Cosmetics;
    expect(next.hat).toBe('tophat');
    expect(sanitizeCosmetics(next)).toEqual(next);

    // Colour tab marks taken colours.
    const colourTab = tabs.find((t) => t.textContent === 'Colour') as HTMLButtonElement;
    await act(async () => colourTab.click());
    expect(host.querySelectorAll('.mmce-item.taken')).toHaveLength(2);
    await act(async () => (host!.querySelector('[data-item="7"]') as HTMLButtonElement).click());
    expect((onChange.mock.calls[1]![0] as Cosmetics).color).toBe(7);

    // Arrow keys move focus inside a grid; Enter on a button selects.
    const grid = host.querySelector('[role="radiogroup"]') as HTMLElement;
    const first = grid.children[0] as HTMLButtonElement;
    first.focus();
    await act(async () => {
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(grid.children[1]);

    // Emotes toggle and stay within 8.
    const emTab = tabs.find((t) => t.textContent === 'Emotes') as HTMLButtonElement;
    await act(async () => emTab.click());
    await act(async () => (host!.querySelector('[data-item="cry"]') as HTMLButtonElement).click());
    const em = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as Cosmetics;
    expect(em.emotes).toContain('cry');
    expect(em.emotes.length).toBeLessThanOrEqual(8);

    // Name + randomise + reset.
    const input = host.querySelector('input[aria-label="Name"]') as HTMLInputElement;
    expect(input.value).toBe('Pip');
    const buttons = Array.from(host.querySelectorAll('button'));
    await act(async () => buttons.find((b) => b.textContent?.includes('Randomise'))!.click());
    await act(async () => buttons.find((b) => b.textContent === 'Reset')!.click());
    expect(onChange.mock.calls[onChange.mock.calls.length - 1]![0]).toEqual(defaultCosmetics());
    for (const call of onChange.mock.calls) expect(sanitizeCosmetics(call[0])).toEqual(call[0]);
  });
});
