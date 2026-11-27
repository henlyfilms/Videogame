/**
 * Ink outlines for berry characters: one inverted-hull child per solid part
 * (body, drupelets, arms and mittens, legs and shoes, hair, hats, face gear,
 * outfit, back items, held props, pets, squished bodies). Each hull is a
 * child of the mesh it outlines, so it follows every pivot / group the rig
 * animates. Hull geometry shares the source position buffer and carries a
 * smoothed normal (hard-edged boxes and extrusions stay closed), and is
 * cached per source geometry; materials are passed in and shared.
 */
import * as THREE from 'three';

/** Mesh kinds (rig `userData.matKind`) that get a hull. Glass, gloss, the face decal, shadows and the ghost tail are skipped. */
const HULL_KINDS: ReadonlySet<string> = new Set(['body', 'vc', 'vcd', 'detailInst']);

export type HullWeight = 'main' | 'thin';
export interface HullMats {
  main: THREE.Material;
  thin: THREE.Material;
}

const smoothed = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** Same triangles as `src`, normals averaged over coincident positions. */
export function hullGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = smoothed.get(src);
  if (hit) return hit;
  const pos = src.getAttribute('position') as THREE.BufferAttribute | undefined;
  const nrm = src.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!pos || !nrm) return src;
  const n = pos.count;
  // Numeric keys (quantised to 0.5 mm / ~0.1°): parts stay within ±4 m.
  const slot = new Map<number, number>();
  const seen = new Set<number>();
  const q = (v: number, k: number): number => Math.max(0, Math.min(16383, Math.round(v * k) + 8192));
  const idx = new Int32Array(n);
  const acc = new Float64Array(n * 3);
  let slots = 0;
  for (let i = 0; i < n; i++) {
    const key = (q(pos.getX(i), 2000) * 16384 + q(pos.getY(i), 2000)) * 16384 + q(pos.getZ(i), 2000);
    let s = slot.get(key);
    if (s === undefined) {
      s = slots++;
      slot.set(key, s);
    }
    idx[i] = s;
    // Each distinct face direction counts once (triangle fans would bias it).
    const nk = s * 1073741824 + (q(nrm.getX(i), 500) - 7692) * 1048576 + (q(nrm.getY(i), 500) - 7692) * 1024 + (q(nrm.getZ(i), 500) - 7692);
    if (seen.has(nk)) continue;
    seen.add(nk);
    acc[s * 3] = acc[s * 3]! + nrm.getX(i);
    acc[s * 3 + 1] = acc[s * 3 + 1]! + nrm.getY(i);
    acc[s * 3 + 2] = acc[s * 3 + 2]! + nrm.getZ(i);
  }
  // Unit averaged normals, then the smallest cosine to any face that shares
  // the corner: the hull shader scales the push by the normal's length, so a
  // 1/cos factor keeps hard edges as thick as flat faces (no corner spikes).
  const minDot = new Float64Array(slots).fill(1);
  for (let s = 0; s < slots; s++) {
    const len = Math.hypot(acc[s * 3]!, acc[s * 3 + 1]!, acc[s * 3 + 2]!);
    if (len < 1e-3) continue;
    acc[s * 3] = acc[s * 3]! / len;
    acc[s * 3 + 1] = acc[s * 3 + 1]! / len;
    acc[s * 3 + 2] = acc[s * 3 + 2]! / len;
  }
  for (let i = 0; i < n; i++) {
    const s = idx[i]!;
    const d = acc[s * 3]! * nrm.getX(i) + acc[s * 3 + 1]! * nrm.getY(i) + acc[s * 3 + 2]! * nrm.getZ(i);
    if (d < minDot[s]!) minDot[s] = d;
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = idx[i]!;
    let x = acc[s * 3]!;
    let y = acc[s * 3 + 1]!;
    let z = acc[s * 3 + 2]!;
    let k = 1 / Math.max(0.55, minDot[s]!);
    // Opposed faces (double-sided sheets) cancel out: keep the face normal.
    if (Math.hypot(x, y, z) < 0.5) {
      const len = Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i)) || 1;
      x = nrm.getX(i) / len;
      y = nrm.getY(i) / len;
      z = nrm.getZ(i) / len;
      k = 1;
    }
    out[i * 3] = x * k;
    out[i * 3 + 1] = y * k;
    out[i * 3 + 2] = z * k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos);
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  if (src.index) g.setIndex(src.index);
  g.setDrawRange(src.drawRange.start, src.drawRange.count);
  if (!src.boundingSphere) src.computeBoundingSphere();
  g.boundingSphere = src.boundingSphere!.clone();
  g.boundingSphere.radius += 0.08;
  smoothed.set(src, g);
  src.addEventListener('dispose', () => {
    smoothed.delete(src);
    g.dispose();
  });
  return g;
}

function weightFor(m: THREE.Mesh): HullWeight {
  if (m.userData.matKind === 'detailInst') return 'thin';
  // Glasses, masks, held props: small parts read better with a lighter line.
  return /^(face|prop)-/.test(m.name) ? 'thin' : 'main';
}

const pending: THREE.Mesh[] = [];

/**
 * Gives every outlined part under `root` an ink hull (once) and refills `out`
 * with all of them. Call again after the rig rebuilds or swaps a prop.
 * `weight` forces one line weight (e.g. 'thin' for small pets).
 */
export function attachInkHulls(root: THREE.Object3D, mats: HullMats, out: THREE.Mesh[], weight?: HullWeight): THREE.Mesh[] {
  out.length = 0;
  pending.length = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.hull || !HULL_KINDS.has(m.userData.matKind as string)) return;
    const h = m.userData.hullMesh as THREE.Mesh | undefined;
    if (h) out.push(h);
    else pending.push(m);
  });
  for (const m of pending) {
    const w = weight ?? weightFor(m);
    const geo = hullGeometry(m.geometry);
    let h: THREE.Mesh;
    if ((m as THREE.InstancedMesh).isInstancedMesh) {
      const src = m as THREE.InstancedMesh;
      const inst = new THREE.InstancedMesh(geo, mats[w], src.count);
      inst.instanceMatrix = src.instanceMatrix;
      inst.frustumCulled = false;
      h = inst;
    } else h = new THREE.Mesh(geo, mats[w]);
    h.name = 'ink-hull';
    h.userData.hull = true;
    h.userData.weight = w;
    h.castShadow = false;
    h.receiveShadow = false;
    h.raycast = () => {};
    m.userData.hullMesh = h;
    m.add(h);
    out.push(h);
  }
  pending.length = 0;
  return out;
}

/** Points every hull at `mats` (ink ↔ kill-target red); no allocation. */
export function setHullMats(hulls: readonly THREE.Mesh[], mats: HullMats): void {
  for (const h of hulls) {
    const want = mats[h.userData.weight as HullWeight] ?? mats.main;
    if (h.material !== want) h.material = want;
  }
}
