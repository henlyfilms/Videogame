// TEMPORARY STUB — replaced by the character-system branch on merge.
import * as THREE from 'three';
import type { Cosmetics } from '../core/types';
export interface BerryRig { group: THREE.Group; height: number; update(dt: number, s: { moving: boolean; speed?: number; emote?: string | null; ghost?: boolean; hold?: 'gun' | 'knife' | 'flashlight' | null; scared?: boolean; lookYaw?: number }): void; play(oneShot: string): void; setCosmetics(c: Cosmetics): void; dispose(): void }
export function createBerry(c: Cosmetics, _opts?: { quality?: 'low' | 'medium' | 'high' }): BerryRig {
  const group = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color: new THREE.Color().setHSL((c.color % 20) / 20, 0.7, 0.55) });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), mat); body.position.y = 0.5; group.add(body);
  return { group, height: 1.05, update: () => {}, play: () => {}, setCosmetics: (n) => mat.color.setHSL((n.color % 20) / 20, 0.7, 0.55), dispose: () => { body.geometry.dispose(); mat.dispose(); } };
}
export function createBody(c: Cosmetics): THREE.Group { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshToonMaterial({ color: new THREE.Color().setHSL((c.color % 20) / 20, 0.7, 0.5) })); m.scale.y = 0.35; m.position.y = 0.12; g.add(m); return g; }
export function createPet(_petId: string): { group: THREE.Group; update(dt: number, moving: boolean): void } { return { group: new THREE.Group(), update: () => {} }; }
