/**
 * A tiny 3D stage that poses several berries in one WebGL canvas — used for
 * the 3D versions of the role reveal, death cinematic and victory lineup.
 * Lazy-loaded with three.js; callers fall back to 2D portraits.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { attachInkHulls, type HullMats } from '../characters/outline3d';
import { createBerry, type BerryRig } from '../characters/rig3d';
import { WORLD } from '../render2d/paint';
import { hullMaterial } from '../render3d/worldkit';
import type { Cosmetics } from '../core/types';

export type StagePose = 'wave' | 'celebrate' | 'sulk' | 'scared' | 'knife-twirl' | 'gun-spin' | 'magnify' | 'shrug' | 'kill-lunge' | 'squish';

export interface StageActor {
  cosmetics: Cosmetics;
  pose?: StagePose;
  /** Horizontal slot in metres (0 = centre). */
  x: number;
  scale?: number;
  /** Slide in from this x over `enter` seconds. */
  fromX?: number;
  enter?: number;
  ghost?: boolean;
  /** Ejection flight: tumble across/down the stage over `enter` seconds. */
  flight?: 'across' | 'fall' | 'arc';
}

export function Stage3D({ actors, height = 260, width = 520, light = '#ffffff', reducedMotion = false }: { actors: StageActor[]; height?: number; width?: number; light?: string; reducedMotion?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#e6eeff', '#3b2f5a', 1.8));
    const key = new THREE.DirectionalLight(light, 2.2);
    key.position.set(2, 4, 5);
    const rim = new THREE.DirectionalLight('#8fb4ff', 1.6);
    rim.position.set(-3, 2, -4);
    scene.add(key, rim);
    // Frame the group tightly: fit the actors' width (and ~1.5 m of height).
    const half = Math.max(...actors.map((a) => Math.abs(a.x) + 0.55 * (a.scale ?? 1)), 0.6);
    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 50);
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const flying = actors.some((a) => a.flight);
    const dist = Math.max(half / Math.tan(hfov / 2), (flying ? 1.4 : 0.8) / Math.tan(vfov / 2)) * 1.08;
    camera.position.set(0, 0.75, dist);
    camera.lookAt(0, 0.58, 0);
    // Same ink outline as the in-match 3D view (whole character, every part).
    const ink: HullMats = { main: hullMaterial(WORLD.ink, 0.032, false), thin: hullMaterial(WORLD.ink, 0.022, false) };
    const rigs: { rig: BerryRig; a: StageActor; next: number; hulls: THREE.Mesh[]; rev: number }[] = actors.map((a) => {
      const rig = createBerry(a.cosmetics, { quality: 'high' });
      rig.group.scale.setScalar(a.scale ?? 1);
      rig.group.position.x = a.fromX ?? a.x;
      scene.add(rig.group);
      return { rig, a, next: 0, hulls: [], rev: -1 };
    });
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      for (const r of rigs) {
        const enter = reducedMotion ? 0 : r.a.enter ?? 0;
        const k = enter ? Math.min(1, t / enter) : 1;
        const e = 1 - Math.pow(1 - k, 3);
        const fl = r.a.flight;
        if (fl) {
          const lin = enter ? Math.min(1, t / enter) : 1;
          r.rig.group.position.x = (r.a.fromX ?? -4) + (r.a.x - (r.a.fromX ?? -4)) * lin;
          r.rig.group.position.y = fl === 'fall' ? 1.5 - lin * 2.6 : fl === 'arc' ? -0.2 + Math.sin(lin * Math.PI) * 1.1 : 0.2 + Math.sin(t * 3) * 0.2;
          r.rig.group.rotation.z = t * (fl === 'fall' ? 1.5 : 4);
          r.rig.group.rotation.y = t * 1.3;
        } else {
          r.rig.group.position.x = (r.a.fromX ?? r.a.x) + (r.a.x - (r.a.fromX ?? r.a.x)) * e;
          r.rig.group.rotation.y = Math.sin(t * 0.7 + r.a.x) * 0.25;
        }
        if (r.a.pose && t >= r.next && (k >= 1 || r.a.flight)) {
          r.rig.play(r.a.pose);
          r.next = t + (r.a.pose === 'squish' ? 99 : 2.6);
        }
        r.rig.update(dt, { moving: k < 1, speed: 1.4, ghost: r.a.ghost, scared: r.a.pose === 'scared' });
        const rev = (r.rig.group.userData.rev as number | undefined) ?? 0;
        if (rev !== r.rev && !r.a.ghost) {
          r.rev = rev;
          attachInkHulls(r.rig.group, ink, r.hulls);
        }
      }
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      for (const r of rigs) r.rig.dispose();
      ink.main.dispose();
      ink.thin.dispose();
      renderer.dispose();
    };
  }, [actors, height, width, light, reducedMotion]);
  return <canvas ref={ref} style={{ width, height, maxWidth: '100%', display: 'block', margin: '0 auto' }} aria-hidden />;
}

export default Stage3D;
