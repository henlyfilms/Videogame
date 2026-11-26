/**
 * 3D menu backdrop: a slow cinematic flythrough over a Marion Mystery map at
 * dusk, with a little crowd of berries milling about. Falls back to the 2D
 * backdrop if WebGL is unavailable.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createBerry, type BerryRig } from '../characters/rig3d';
import { randomCosmetics } from '../characters/catalog';
import { availableMaps, getMap } from '../core/maps';
import type { MapId } from '../core/types';
import { MenuBackdrop2D } from '../ui/MenuBackdrop';
import { buildMapScene } from './scene';

export function MenuBackdrop3D() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const maps = availableMaps();
    const map = getMap((maps[Math.floor(Math.random() * maps.length)]?.id ?? 'hq') as MapId);
    const ms = buildMapScene(map, 'medium', false);
    scene.add(ms.group);
    scene.background = new THREE.Color('#0b1022');
    scene.fog = new THREE.Fog('#0b1022', 18, 55);
    scene.add(new THREE.HemisphereLight('#c7d7ff', '#40305a', 1.4));
    const sun = new THREE.DirectionalLight('#ffd9a8', 1.6);
    sun.position.set(30, 40, 10);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    const rooms = map.def.rooms.map((r) => new THREE.Vector3(r.rect[0] + r.rect[2] / 2, 0, r.rect[1] + r.rect[3] / 2));
    const crowd: { rig: BerryRig; phase: number; r: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const rig = createBerry(randomCosmetics(i * 104729 + 7), { quality: 'medium' });
      scene.add(rig.group);
      crowd.push({ rig, phase: Math.random() * Math.PI * 2, r: 2 + Math.random() * 4 });
    }
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const seg = (t / 10) % rooms.length;
      const a = rooms[Math.floor(seg)]!;
      const b = rooms[(Math.floor(seg) + 1) % rooms.length]!;
      const k = seg % 1;
      const e = k * k * (3 - 2 * k);
      const focus = a.clone().lerp(b, e);
      const orbit = t * 0.12;
      camera.position.set(focus.x + Math.cos(orbit) * 14, 11 + Math.sin(t * 0.2) * 2, focus.z + Math.sin(orbit) * 14);
      camera.lookAt(focus.x, 0.5, focus.z);
      crowd.forEach((c, i) => {
        const ang = t * 0.35 + c.phase;
        const x = focus.x + Math.cos(ang) * c.r;
        const z = focus.z + Math.sin(ang * (i % 2 ? 1 : -1)) * c.r * 0.7;
        const g = c.rig.group;
        const dx = x - g.position.x;
        const dz = z - g.position.z;
        if (Math.hypot(dx, dz) > 0.001) g.rotation.y = Math.atan2(dx, dz);
        g.position.set(x, 0, z);
        c.rig.update(dt, { moving: true, speed: 0.8 });
      });
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      for (const c of crowd) c.rig.dispose();
      ms.dispose();
      renderer.dispose();
    };
  }, []);
  if (failed) return <MenuBackdrop2D />;
  return (
    <div style={{ position: 'absolute', inset: 0 }} aria-hidden>
      <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(7,11,24,0.15), rgba(7,11,24,0.85))' }} />
    </div>
  );
}
