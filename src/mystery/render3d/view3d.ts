/**
 * 3D view (Three.js): third-person follow camera with wall collision or
 * first-person mouselook; toon-shaded berries; per-mode lighting (bright
 * Classic, lights-sabotage dimming, Lights Out flashlight spot + lamp pools);
 * quality tiers; particle FX; WebGL context-loss recovery.
 */
import * as THREE from 'three';
import { runtime } from '../client/runtime';
import { attachInkHulls, setHullMats, type HullMats } from '../characters/outline3d';
import { createBerry, createBody, createPet, type BerryRig } from '../characters/rig3d';
import { castRay, type CompiledMap } from '../core/map';
import type { MatchEvent, Vec2 } from '../core/types';
import type { Prefs } from '../client/prefs';
import { input } from '../client/controls';
import { roomAt } from '../core/map';
import { WORLD } from '../render2d/paint';
import { drawKeyHint, drawKillBadge, drawNameTag, drawReportBadge, drawVentArrow, easeOutBack, measureTag, PromptFader } from '../render2d/prompts';
import { tagStyleFor, type DrawPlayer, type FrameData } from '../render2d/renderer';
import type { ViewRenderer } from '../ui/GameView';
import { buildMapScene, radialTexture, toon, type MapScene, type Quality } from './scene';
import { addHull, dottedRingTexture, hullMaterial } from './worldkit';

interface Actor {
  rig: BerryRig;
  cosKey: string;
  pet: { group: THREE.Group; update(dt: number, moving: boolean): void } | null;
  petPos: THREE.Vector3;
  label: THREE.Sprite;
  labelKey: string;
  seen: number;
  heading: number;
  /** Ink outline hulls on every solid part (re-attached when the rig's mesh set changes). */
  hulls: THREE.Mesh[];
  hullRev: number;
  /** Kill-target outline currently applied (red silhouette). */
  killOn: boolean;
}

/** Canvas → sprite with a fixed world height. */
function canvasSprite(w: number, h: number, worldH: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
  spr.scale.set((worldH * w) / h, worldH, 1);
  spr.userData.baseScale = spr.scale.clone();
  spr.renderOrder = 20;
  return spr;
}

function disposeSprite(s: THREE.Object3D): void {
  s.traverse((o) => {
    const sp = o as THREE.Sprite;
    if (sp.isSprite) {
      sp.material.map?.dispose();
      sp.material.dispose();
    }
  });
}

function tagSprite(p: Pick<DrawPlayer, 'name' | 'cosmetics' | 'nameColor' | 'local' | 'ghost'>): THREE.Sprite {
  const H = 56;
  const probe = document.createElement('canvas').getContext('2d')!;
  const w = Math.ceil(measureTag(probe, p.name.slice(0, 20), H) + 16);
  return canvasSprite(w, H + 16, 0.3, (g) => drawNameTag(g, w / 2, (H + 16) / 2 - 3, H, tagStyleFor(p)));
}

interface Fx {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  max: number;
  spin: number;
  grow: number;
}

function pickQuality(pref: Prefs['quality']): Quality {
  if (pref !== 'auto') return pref;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse || mem <= 4) return 'medium';
  return 'high';
}

export class ThreeDView implements ViewRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private flash: THREE.SpotLight;
  private flashTarget = new THREE.Object3D();
  private lampLights: THREE.PointLight[] = [];
  private mapScene: MapScene | null = null;
  private mapKey = '';
  private actors = new Map<string, Actor>();
  private bodies = new Map<string, THREE.Group>();
  private extras = new THREE.Group();
  private particles: Fx[] = [];
  private glowTex = radialTexture();
  private quality: Quality;
  private yaw = -Math.PI / 2;
  private pitch = 0.42;
  private camDist = 5.2;
  private camPos = new THREE.Vector3();
  private camInit = false;
  private shake = 0;
  private flicker = 0;
  private lost = false;
  private gunMesh: THREE.Mesh | null = null;
  private knives = new Map<string, THREE.Mesh>();
  private batteryMeshes = new Map<string, THREE.Mesh>();
  private trackRing: THREE.Mesh;
  private fader = new PromptFader();
  private inkHull = hullMaterial(WORLD.ink, 0.032, false);
  private killHull = hullMaterial(WORLD.kill, 0.06, false);
  private inkMats: HullMats = { main: this.inkHull, thin: hullMaterial(WORLD.ink, 0.022, false) };
  private killMats: HullMats = { main: this.killHull, thin: hullMaterial(WORLD.kill, 0.045, false) };
  private promptObjs = new Map<string, THREE.Object3D>();
  private promptTex = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();
  private ringTex = dottedRingTexture();
  private ringGeo = new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2);
  private arrowGeo: THREE.BufferGeometry | null = null;
  private arrowMat = toon(WORLD.task, { emissive: new THREE.Color(WORLD.task), emissiveIntensity: 0.75, fog: false });
  private arrowInk = hullMaterial(WORLD.ink, 0.02, false);
  private camDistGoal = 5.2;
  private tmpV = new THREE.Vector3();
  frameMs = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private mode: 'fp' | 'tp',
    private prefs: Prefs,
  ) {
    this.quality = pickQuality(prefs.quality);
    // Kill hulls skip the depth write and draw before the target's own parts,
    // so the red only survives around the silhouette (no lines across the face).
    for (const m of [this.killMats.main, this.killMats.thin]) m.depthWrite = false;
    if (mode === 'fp') this.pitch = -0.06;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(mode === 'fp' ? 72 : 55, 1, 0.05, 140);
    this.hemi = new THREE.HemisphereLight('#dbe7ff', '#3b3350', 1.6);
    this.sun = new THREE.DirectionalLight('#fff4e0', 1.6);
    this.sun.castShadow = this.quality === 'high';
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 18;
    this.sun.shadow.camera.bottom = -18;
    this.sun.shadow.bias = -0.0008;
    this.flash = new THREE.SpotLight('#fff1c4', 0, 12, Math.PI / 7, 0.45, 1.2);
    this.flash.target = this.flashTarget;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.flash, this.flashTarget, this.extras);
    for (let i = 0; i < (this.quality === 'low' ? 2 : 4); i++) {
      const l = new THREE.PointLight('#ffd89a', 0, 7, 1.6);
      this.lampLights.push(l);
      this.scene.add(l);
    }
    this.trackRing = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: '#38bdf8' }));
    this.trackRing.rotation.x = -Math.PI / 2;
    this.trackRing.visible = false;
    this.scene.add(this.trackRing);
    canvas.addEventListener('webglcontextlost', this.onLost, false);
    canvas.addEventListener('webglcontextrestored', this.onRestored, false);
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };
  private onRestored = () => {
    this.lost = false;
    this.mapKey = '';
  };

  resize(w: number, h: number, dpr: number): void {
    const cap = this.quality === 'low' ? 1.25 : this.quality === 'medium' ? 1.75 : 2;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** View-space axes → world direction using the camera yaw. */
  axesToWorld(ax: { x: number; y: number }): Vec2 {
    const fwd = -ax.y;
    const right = ax.x;
    const fx = Math.cos(this.yaw);
    const fy = Math.sin(this.yaw);
    // right = forward rotated +90° in world (x→y)
    return { x: fx * fwd - fy * right, y: fy * fwd + fx * right };
  }

  aimFacing(): number | null {
    return this.mode === 'fp' ? this.yaw : null;
  }

  attachPointer(el: HTMLElement): () => void {
    let dragging: { x: number; y: number } | null = null;
    const sens = () => 0.0032 * this.prefs.sensitivity;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (this.mode === 'fp' || e.button === 0) {
        if (document.pointerLockElement !== el) void el.requestPointerLock?.()?.catch?.(() => {});
      }
      dragging = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const locked = document.pointerLockElement === el;
      if (locked) {
        this.turn(e.movementX * sens(), e.movementY * sens());
      } else if (dragging && e.buttons) {
        this.turn((e.clientX - dragging.x) * sens(), (e.clientY - dragging.y) * sens());
        dragging = { x: e.clientX, y: e.clientY };
      }
    };
    const onUp = () => (dragging = null);
    const onWheel = (e: WheelEvent) => {
      if (this.mode === 'tp') this.camDistGoal = Math.max(2.5, Math.min(9, this.camDistGoal + e.deltaY * 0.004));
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      if (document.pointerLockElement === el) document.exitPointerLock?.();
    };
  }

  private turn(dx: number, dy: number): void {
    this.yaw += dx;
    const inv = this.prefs.invertY ? -1 : 1;
    if (this.mode === 'fp') this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - dy * inv));
    else this.pitch = Math.max(0.12, Math.min(1.15, this.pitch + dy * inv));
  }

  fx(ev: MatchEvent, reducedMotion: boolean): void {
    const p = ev.pos;
    if (!p) return;
    const at = new THREE.Vector3(p.x, 0.6, p.y);
    const burst = (n: number, color: string, speed: number, size: number, life: number, up = 3, grow = 0) => {
      for (let i = 0; i < n; i++) {
        const mat = new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const s = new THREE.Sprite(mat);
        s.position.copy(at);
        s.scale.setScalar(size * (0.6 + Math.random() * 0.8));
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        this.extras.add(s);
        this.particles.push({ obj: s, vel: new THREE.Vector3(Math.cos(a) * v, up * (0.5 + Math.random()), Math.sin(a) * v), life, max: life, spin: 0, grow });
      }
    };
    switch (ev.type) {
      case 'kill': {
        const juice = ['#e11d48', '#be123c', '#f43f5e', '#7c3aed'][Math.floor(Math.random() * 4)]!;
        burst(22, juice, 3.5, 0.28, 1.1, 4);
        burst(12, '#fde68a', 2.5, 0.12, 1.2, 3);
        burst(1, '#ffffff', 0, 2.4, 0.35, 0, 6);
        if (!reducedMotion) this.shake = 0.4;
        break;
      }
      case 'shot':
        burst(10, '#fde047', 5, 0.18, 0.3, 1);
        burst(5, '#e5e7eb', 1, 0.6, 0.8, 1, 1.5);
        break;
      case 'misfire':
        burst(10, '#94a3b8', 1.2, 0.7, 1, 1, 1.5);
        break;
      case 'vent':
        burst(12, '#cbd5e1', 1.6, 0.6, 0.7, 2, 1);
        break;
      case 'visual':
      case 'task':
        burst(16, '#fbbf24', 2.5, 0.2, 1, 3);
        break;
      case 'gun.pickup':
        burst(18, '#fbbf24', 3, 0.25, 0.9, 4);
        break;
      case 'shield.hit':
        burst(1, '#4ade80', 0, 2.5, 0.6, 0, 4);
        break;
      case 'flicker':
        this.flicker = reducedMotion ? 0.3 : 1.2;
        break;
      case 'blackout':
        this.flicker = 0.8;
        break;
    }
  }

  private ensureMap(map: CompiledMap, night: boolean): void {
    const key = `${map.def.id}:${night}:${this.quality}`;
    if (this.mapKey === key) return;
    this.mapScene?.dispose();
    if (this.mapScene) this.scene.remove(this.mapScene.group);
    this.mapScene = buildMapScene(map, this.quality, night);
    this.scene.add(this.mapScene.group);
    this.mapScene.ceiling.visible = this.mode === 'fp';
    this.mapKey = key;
    const theme = map.def.theme;
    this.scene.background = new THREE.Color(night ? '#04060d' : theme.sky);
  }

  private actor(p: DrawPlayer): Actor {
    const cos = p.cosmetics;
    const key = JSON.stringify(cos);
    let a = this.actors.get(p.id);
    if (a && a.cosKey !== key) {
      a.rig.setCosmetics(cos);
      a.cosKey = key;
      if (a.pet) {
        this.scene.remove(a.pet.group);
        a.pet = null;
      }
    }
    const labelKey = `${p.name}|${p.nameColor ?? ''}|${p.local ? 1 : 0}|${p.ghost ? 1 : 0}|${cos.color}|${cos.nameplate}`;
    if (!a) {
      const rig = createBerry(cos, { quality: this.quality });
      rig.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = this.quality === 'high';
      });
      this.scene.add(rig.group);
      const label = tagSprite(p);
      this.scene.add(label);
      a = { rig, cosKey: key, pet: null, petPos: new THREE.Vector3(), label, labelKey, seen: 0, heading: 0, hulls: [], hullRev: -1, killOn: false };
      this.actors.set(p.id, a);
    }
    if (a.labelKey !== labelKey) {
      this.scene.remove(a.label);
      disposeSprite(a.label);
      a.label = tagSprite(p);
      a.labelKey = labelKey;
      this.scene.add(a.label);
    }
    if (!a.pet && cos.pet && cos.pet !== 'none') {
      a.pet = createPet(cos.pet);
      if (this.quality !== 'low') attachInkHulls(a.pet.group, this.inkMats, [], 'thin');
      this.scene.add(a.pet.group);
    }
    return a;
  }

  /** Ink outline (inverted hulls) on every part of a rig; skipped on low quality. */
  private syncHulls(a: Actor): void {
    if (this.quality === 'low') return;
    const rev = (a.rig.group.userData.rev as number | undefined) ?? 0;
    if (rev === a.hullRev) return;
    a.hullRev = rev;
    attachInkHulls(a.rig.group, this.inkMats, a.hulls);
    if (a.killOn) this.setKillOrder(a, true);
  }

  /** Draw order for the kill outline: world → red hulls → the target's parts. */
  private setKillOrder(a: Actor, on: boolean): void {
    a.killOn = on;
    for (const h of a.hulls) {
      h.renderOrder = on ? 1 : 0;
      if (h.parent) h.parent.renderOrder = on ? 2 : 0;
    }
  }

  render(f: FrameData, dt: number): void {
    if (this.lost) return;
    const t0 = performance.now();
    this.ensureMap(f.map, f.night);
    const ms = this.mapScene!;
    // Camera look input (touch / right stick).
    const look = input.consumeLook();
    if (look.x || look.y) this.turn(look.x * 0.004 * this.prefs.sensitivity, look.y * 0.004 * this.prefs.sensitivity);
    // Prompt visibility (eased in/out so nothing pops).
    {
      const pr = f.prompts;
      const active = new Set<string>();
      for (const id of f.highlight) active.add(`task:${id}`);
      if (f.near) active.add(`near:${f.near}`);
      if (pr?.kill) active.add(`kill:${pr.kill}`);
      if (pr?.report) active.add(`report:${pr.report}`);
      if (pr?.vent && !pr.inVent) active.add(`vent:${pr.vent}`);
      if (pr?.inVent) active.add(`invent:${pr.inVent}`);
      for (const d of f.map.def.doors) if (f.closedDoors.has(d.id)) active.add(`door:${d.id}`);
      this.fader.update(active, dt, f.reducedMotion);
    }
    // Actors.
    const now = performance.now();
    const localPlayer = f.players.find((p) => p.local);
    for (const p of f.players) {
      const a = this.actor(p);
      a.seen = now;
      const g = a.rig.group;
      g.visible = !(p.local && this.mode === 'fp');
      g.position.set(p.pos.x, p.ghost ? 0.25 + Math.sin(now / 400) * 0.08 : 0, p.pos.y);
      // Smooth heading (three: +z forward; world angle θ → rotation.y = π/2 − θ).
      const target = Math.PI / 2 - p.facing;
      let d = target - a.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      a.heading += d * Math.min(1, dt * 12);
      g.rotation.y = a.heading;
      a.rig.update(dt, {
        moving: p.moving,
        speed: 1,
        emote: p.emote ?? null,
        ghost: p.ghost,
        hold: p.hasGun ? 'gun' : f.night && p.flashlight !== undefined ? 'flashlight' : null,
        scared: p.scared,
      });
      a.label.visible = !(p.local && this.mode === 'fp') && (!p.ghost || !!localPlayer?.ghost);
      a.label.position.set(p.pos.x, (a.rig.height ?? 1.05) + 0.42 + g.position.y, p.pos.y);
      const lb = a.label.userData.baseScale as THREE.Vector3 | undefined;
      if (lb) a.label.scale.copy(lb).multiplyScalar(this.distScale(a.label.position));
      // Ink outline on the whole character; the kill target gets a pulsing red one.
      this.syncHulls(a);
      const killK = this.fader.get(`kill:${p.id}`);
      for (const h of a.hulls) h.visible = !p.ghost;
      const kill = killK > 0.05;
      if (kill !== a.killOn) this.setKillOrder(a, kill);
      setHullMats(a.hulls, kill ? this.killMats : this.inkMats);
      if (a.pet) {
        const want = new THREE.Vector3(p.pos.x - Math.cos(p.facing) * 0.9, 0, p.pos.y - Math.sin(p.facing) * 0.9);
        a.petPos.lerp(want, Math.min(1, dt * 3));
        a.pet.group.position.copy(a.petPos);
        a.pet.group.visible = !p.ghost && g.visible;
        a.pet.update(dt, p.moving);
      }
    }
    for (const [id, a] of this.actors) {
      if (a.seen === now) continue;
      a.rig.group.visible = false;
      a.label.visible = false;
      if (a.pet) a.pet.group.visible = false;
      if (now - a.seen > 30000) {
        this.scene.remove(a.rig.group, a.label);
        disposeSprite(a.label);
        if (a.pet) this.scene.remove(a.pet.group);
        a.rig.dispose();
        this.actors.delete(id);
      }
    }
    // Bodies.
    const liveBodies = new Set(f.bodies.map((b) => b.id));
    for (const b of f.bodies) {
      let g = this.bodies.get(b.id);
      if (!g) {
        g = createBody(b.cosmetics);
        if (this.quality !== 'low') attachInkHulls(g, this.inkMats, []);
        this.scene.add(g);
        this.bodies.set(b.id, g);
      }
      g.position.set(b.pos.x, 0, b.pos.y);
    }
    for (const [id, g] of this.bodies)
      if (!liveBodies.has(id)) {
        this.scene.remove(g);
        this.bodies.delete(id);
      }
    // Gun drop, knives, batteries.
    if (f.gunDrop) {
      if (!this.gunMesh) {
        this.gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.16), new THREE.MeshBasicMaterial({ color: '#fbbf24' }));
        this.scene.add(this.gunMesh);
      }
      this.gunMesh.visible = true;
      this.gunMesh.position.set(f.gunDrop.x, 0.45 + Math.sin(now / 300) * 0.08, f.gunDrop.y);
      this.gunMesh.rotation.y = now / 600;
    } else if (this.gunMesh) this.gunMesh.visible = false;
    const liveKnives = new Set(f.projectiles.map((p) => p.id));
    for (const pr of f.projectiles) {
      let k = this.knives.get(pr.id);
      if (!k) {
        k = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.1), new THREE.MeshBasicMaterial({ color: '#e5e7eb' }));
        this.scene.add(k);
        this.knives.set(pr.id, k);
      }
      k.position.set(pr.pos.x, 0.8, pr.pos.y);
      k.rotation.y = now / 50;
    }
    for (const [id, k] of this.knives)
      if (!liveKnives.has(id)) {
        this.scene.remove(k);
        this.knives.delete(id);
      }
    const liveBat = new Set(f.batteries.map((b) => b.id));
    for (const b of f.batteries) {
      let m = this.batteryMeshes.get(b.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 12), new THREE.MeshBasicMaterial({ color: '#facc15' }));
        this.scene.add(m);
        this.batteryMeshes.set(b.id, m);
      }
      m.position.set(b.pos.x, 0.45 + Math.sin(now / 350 + b.pos.x) * 0.08, b.pos.y);
      m.rotation.y = now / 700;
    }
    for (const [id, m] of this.batteryMeshes)
      if (!liveBat.has(id)) {
        this.scene.remove(m);
        this.batteryMeshes.delete(id);
      }
    // Doors slide down (eased), lanterns, in-world prompts.
    const rm = f.reducedMotion;
    const pop = (k: number) => (rm ? Math.min(1, k) : easeOutBack(k));
    for (const [id, m] of ms.doorMeshes) {
      const k = this.fader.get(`door:${id}`);
      m.visible = k > 0.01;
      const e = Math.min(1, pop(k));
      m.scale.y = Math.max(0.01, e);
      m.position.y = ms.wallHeight - (ms.wallHeight * e) / 2;
    }
    for (const [id, m] of ms.lanterns) (m.material as THREE.MeshBasicMaterial).color.set(f.litLanterns.has(id) ? '#fde047' : '#57534e');
    // Station in reach: solid ring decal (eased).
    let nearK = 0;
    let nearSt = null as ReturnType<typeof f.map.stationById.get> | null;
    for (const st of f.map.def.stations) {
      const k = this.fader.get(`near:${st.id}`);
      if (k > nearK) {
        nearK = k;
        nearSt = st;
      }
    }
    ms.highlight.visible = !!nearSt && nearK > 0.01;
    if (nearSt) {
      ms.highlight.position.set(nearSt.x, 0.035, nearSt.y);
      ms.highlight.scale.setScalar(pop(nearK) * (1 + (rm ? 0 : Math.sin(now / 200) * 0.05)));
      (ms.highlight.material as THREE.MeshBasicMaterial).opacity = Math.min(1, nearK * 1.4);
    }
    for (const [id, obj] of ms.stationMeshes) {
      const pulse = f.highlight.has(id) && !rm;
      obj.scale.setScalar(pulse ? 1 + Math.sin(now / 250) * 0.03 : 1);
    }
    // Vent outlines: orange pulsing hull when in reach / while inside.
    for (const [id, v] of ms.vents) {
      const k = Math.max(this.fader.get(`vent:${id}`), this.fader.get(`invent:${id}`));
      v.glow.visible = k > 0.01;
      if (k > 0.01) {
        (v.glow.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k * 1.4) * (rm ? 1 : 0.75 + 0.25 * Math.sin(now / 160));
        v.glow.scale.setScalar(0.85 + 0.15 * pop(k));
      }
    }
    this.killHull.uniforms.uThick!.value = 0.055 + (rm ? 0 : 0.015 * Math.sin(now / 120));
    (this.killMats.thin as THREE.ShaderMaterial).uniforms.uThick!.value = 0.042 + (rm ? 0 : 0.011 * Math.sin(now / 120));
    this.updatePrompts(f, now, pop);
    this.trackRing.visible = !!f.trackPos;
    if (f.trackPos) this.trackRing.position.set(f.trackPos.x, 0.05, f.trackPos.y);
    // Particles.
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.extras.remove(p.obj);
        ((p.obj as THREE.Sprite).material as THREE.Material).dispose();
        return false;
      }
      p.vel.y -= 9 * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.obj.position.y < 0.05) {
        p.obj.position.y = 0.05;
        p.vel.multiplyScalar(0.3);
      }
      const k = p.life / p.max;
      ((p.obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = k;
      if (p.grow) p.obj.scale.multiplyScalar(1 + p.grow * dt);
      return true;
    });
    // Lighting per mode.
    this.shake = Math.max(0, this.shake - dt);
    this.flicker = Math.max(0, this.flicker - dt);
    const flick = this.flicker > 0 ? 0.35 + 0.65 * Math.abs(Math.sin(this.flicker * 37)) : 1;
    const focus = new THREE.Vector3(f.focus.x, 0, f.focus.y);
    const ghostView = !!localPlayer?.ghost;
    if (f.night && f.mode === 'match' && !ghostView) {
      const hv = f.highVisibility ? 1.8 : 1;
      this.hemi.intensity = (this.mode === 'fp' ? 0.34 : 0.24) * hv * flick;
      this.hemi.color.set('#6b7bb8');
      this.sun.intensity = 0.05 * hv;
      const cone = f.vision?.cone;
      this.flash.intensity = cone ? 55 * flick : 0;
      if (cone) {
        this.flash.angle = Math.min(Math.PI / 2.2, cone.halfAngle * 1.1);
        this.flash.distance = cone.range * 1.25;
        this.flash.position.set(f.focus.x, this.mode === 'fp' ? 0.85 : 1.0, f.focus.y);
        const dir = this.mode === 'fp' ? this.yaw : cone.dir;
        this.flashTarget.position.set(f.focus.x + Math.cos(dir) * 4, this.mode === 'fp' ? 0.85 + Math.sin(this.pitch) * 4 : 0.3, f.focus.y + Math.sin(dir) * 4);
      }
      this.scene.fog = new THREE.Fog('#04060d', 1, (f.vision?.cone?.range ?? 3) + 6);
      // Nearest lamps become real lights.
      const sorted = [...ms.lamps].sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus));
      this.lampLights.forEach((l, i) => {
        const lamp = sorted[i];
        l.intensity = lamp ? 11 * flick : 0;
        if (lamp) {
          l.position.copy(lamp.pos);
          l.color.copy(lamp.color).lerp(new THREE.Color('#ffd89a'), 0.6);
          l.distance = Math.max(4, lamp.r * 0.8);
        }
      });
    } else {
      const sab = f.lightsSabotaged && !ghostView;
      const vis = f.vision && !f.vision.all ? f.vision.radius : 40;
      this.hemi.color.set('#dbe7ff');
      this.hemi.intensity = (sab ? 0.35 : 1.5) * flick;
      this.sun.intensity = sab ? 0.15 : 1.5;
      this.flash.intensity = 0;
      for (const l of this.lampLights) l.intensity = 0;
      const fogCol = sab ? '#05070f' : f.mode === 'lobby' ? '#0b1020' : '#141a33';
      this.scene.fog = f.mode === 'lobby' ? new THREE.Fog(fogCol, 25, 60) : new THREE.Fog(fogCol, Math.max(1, vis * 0.6), vis * 1.35 + 2);
    }
    // Critical sabotage: red alert lighting (pulsing unless reduced motion).
    if (f.critical && f.mode === 'match') {
      const pulse = f.reducedMotion ? 0.6 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(f.t * 6));
      this.hemi.color.lerp(new THREE.Color('#ff3b3b'), 0.55 * pulse);
      this.sun.color.set('#ffd0c8').lerp(new THREE.Color('#ff5a4a'), 0.5 * pulse);
      if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.lerp(new THREE.Color('#3a0508'), 0.6 * pulse);
    } else this.sun.color.set('#fff4e0');
    this.sun.position.set(f.focus.x + 8, 16, f.focus.y + 6);
    this.sun.target.position.set(f.focus.x, 0, f.focus.y);
    // Camera.
    const sh = this.shake * 0.25;
    if (this.mode === 'fp') {
      const head = new THREE.Vector3(f.focus.x, ghostView ? 1.25 : 0.95, f.focus.y);
      this.camera.position.copy(head).add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
      const dir = new THREE.Vector3(Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.sin(this.yaw) * Math.cos(this.pitch));
      this.camera.lookAt(head.clone().add(dir));
    } else {
      this.camDist += (this.camDistGoal - this.camDist) * Math.min(1, dt * 8);
      const target = new THREE.Vector3(f.focus.x, 1.0, f.focus.y);
      // Collide the camera boom with walls (grid ray in the map plane).
      const back = this.yaw + Math.PI;
      const flatDist = this.camDist * Math.cos(this.pitch);
      const hit = castRay(f.map, f.focus, back, flatDist, f.closedDoors);
      const d = Math.max(0.6, Math.min(flatDist, hit - 0.35));
      const height = 1.0 + this.camDist * Math.sin(this.pitch) * (d / Math.max(0.01, flatDist));
      const desired = new THREE.Vector3(f.focus.x + Math.cos(back) * d, height + (d < flatDist ? (flatDist - d) * 0.6 : 0), f.focus.y + Math.sin(back) * d);
      if (!this.camInit) {
        this.camPos.copy(desired);
        this.camInit = true;
      }
      this.camPos.lerp(desired, Math.min(1, dt * 10));
      this.camera.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
      this.camera.lookAt(target);
    }
    runtime.cameraYaw = this.yaw;
    this.renderer.render(this.scene, this.camera);
    this.frameMs = performance.now() - t0;
  }

  /** Screen-friendly sprite scale: smaller up close (first person), capped far away. */
  private distScale(p: THREE.Vector3): number {
    return Math.max(0.35, Math.min(1.4, this.camera.position.distanceTo(p) / 5));
  }

  /** Cached canvas textures for prompt sprites (badges, key hints, labels). */
  private promptTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): { tex: THREE.CanvasTexture; aspect: number } {
    let t = this.promptTex.get(key);
    if (!t) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      draw(c.getContext('2d')!);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      t = { tex, aspect: w / h };
      this.promptTex.set(key, t);
    }
    return t;
  }

  private promptSprite(key: string, w: number, h: number, worldH: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Sprite {
    const t = this.promptTexture(key, w, h, draw);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
    spr.userData.base = new THREE.Vector2(worldH * t.aspect, worldH);
    spr.scale.set(worldH * t.aspect, worldH, 1);
    spr.renderOrder = 22;
    return spr;
  }

  private keySprite(label: string, worldH = 0.3): THREE.Sprite {
    return this.promptSprite(`key:${label}`, 96, 96, worldH, (g) => drawKeyHint(g, 48, 48, 36, label));
  }

  private taskArrowGeo(): THREE.BufferGeometry {
    if (this.arrowGeo) return this.arrowGeo;
    const k = 0.2;
    const sh = new THREE.Shape();
    sh.moveTo(0, -1.05 * k);
    sh.lineTo(-1 * k, 0);
    sh.lineTo(-0.42 * k, 0);
    sh.lineTo(-0.42 * k, 0.9 * k);
    sh.lineTo(0.42 * k, 0.9 * k);
    sh.lineTo(0.42 * k, 0);
    sh.lineTo(1 * k, 0);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    g.translate(0, 0, -0.05);
    this.arrowGeo = g;
    return g;
  }

  private makePrompt(type: string, id: string, f: FrameData): THREE.Object3D | null {
    const keys = f.prompts?.keys;
    switch (type) {
      case 'task': {
        const st = f.map.stationById.get(id);
        if (!st) return null;
        const g = new THREE.Group();
        g.position.set(st.x, 0, st.y);
        const arrow = new THREE.Mesh(this.taskArrowGeo(), this.arrowMat);
        arrow.name = 'arrow';
        if (this.quality !== 'low') arrow.add(addHull(new THREE.Mesh(arrow.geometry), this.arrowInk));
        g.add(arrow);
        const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ map: this.ringTex, transparent: true, depthWrite: false, fog: false }));
        ring.name = 'ring';
        ring.position.y = 0.03;
        ring.renderOrder = 2;
        g.add(ring);
        return g;
      }
      case 'near':
        return keys?.use ? this.keySprite(keys.use) : null;
      case 'vent':
        return keys?.vent ? this.keySprite(keys.vent) : null;
      case 'kill':
        return this.promptSprite(`kill:${keys?.kill ?? ''}`, 160, 160, 0.5, (g) => drawKillBadge(g, 88, 72, 56, keys?.kill ?? ''));
      case 'report':
        return this.promptSprite(`report:${keys?.report ?? ''}`, 192, 192, 0.75, (g) => drawReportBadge(g, 100, 92, 72, 0, keys?.report ?? ''));
      case 'invent': {
        const v = f.map.ventById.get(id);
        if (!v) return null;
        const g = new THREE.Group();
        for (const lid of v.links) {
          const lv = f.map.ventById.get(lid);
          if (!lv) continue;
          const arrow = this.promptSprite('ventarrow', 128, 128, 0.62, (c) => drawVentArrow(c, 64, 64, 0, 36, ''));
          arrow.userData.link = lid;
          arrow.userData.kind = 'arrow';
          const roomId = roomAt(f.map, lv);
          const name = ((roomId ? f.map.roomById.get(roomId)?.name : '') ?? '').replace(/^.*?'s /, '');
          g.add(arrow);
          if (name) {
            const probe = document.createElement('canvas').getContext('2d')!;
            probe.font = '800 30px ui-sans-serif, system-ui, sans-serif';
            const w = Math.ceil(probe.measureText(name).width + 40);
            const lab = this.promptSprite(`ventlabel:${name}`, w, 48, 0.2, (c) => {
              c.beginPath();
              c.roundRect(2, 2, w - 4, 44, 22);
              c.fillStyle = 'rgba(17,21,32,0.88)';
              c.fill();
              c.font = '800 30px ui-sans-serif, system-ui, sans-serif';
              c.textAlign = 'center';
              c.textBaseline = 'middle';
              c.fillStyle = '#ffffff';
              c.fillText(name, w / 2, 25);
            });
            lab.userData.link = lid;
            lab.userData.kind = 'label';
            g.add(lab);
          }
        }
        return g;
      }
      default:
        return null;
    }
  }

  /** Position / ease every live prompt; create and dispose as the fader says. */
  private updatePrompts(f: FrameData, now: number, pop: (k: number) => number): void {
    const rm = f.reducedMotion;
    const t = now / 1000;
    const seen = new Set<string>();
    const setSprite = (o: THREE.Object3D, e: number, alpha: number) => {
      const sp = o as THREE.Sprite;
      const b = sp.userData.base as THREE.Vector2 | undefined;
      const k = e * this.distScale(sp.getWorldPosition(this.tmpV));
      if (b) sp.scale.set(b.x * k, b.y * k, 1);
      sp.material.opacity = alpha;
    };
    for (const [k, v] of this.fader.entries()) {
      const c = k.indexOf(':');
      const type = k.slice(0, c);
      const id = k.slice(c + 1);
      if (type === 'door') continue;
      let obj = this.promptObjs.get(k);
      if (!obj) {
        const made = this.makePrompt(type, id, f);
        if (!made) continue;
        obj = made;
        this.scene.add(obj);
        this.promptObjs.set(k, obj);
      }
      seen.add(k);
      const e = Math.max(0.001, pop(v));
      const alpha = Math.min(1, v * 1.4);
      if (type === 'task') {
        const arrow = obj.getObjectByName('arrow')!;
        const ring = obj.getObjectByName('ring') as THREE.Mesh;
        arrow.position.y = 1.55 + (rm ? 0 : Math.sin(t * 3.2 + obj.position.x) * 0.1);
        // Face the camera (with a gentle sway) so the arrow never goes edge-on.
        arrow.rotation.y = Math.atan2(this.camera.position.x - obj.position.x, this.camera.position.z - obj.position.z) + (rm ? 0 : Math.sin(t * 1.6) * 0.35);
        arrow.scale.setScalar(e);
        ring.scale.setScalar(e);
        ring.rotation.y = rm ? 0 : t * 0.5;
        (ring.material as THREE.MeshBasicMaterial).opacity = alpha;
      } else if (type === 'near' || type === 'vent') {
        const p = type === 'near' ? f.map.stationById.get(id) : f.map.ventById.get(id);
        if (p) obj.position.set(p.x + (type === 'vent' ? -0.6 : 0), type === 'near' ? 1.25 : 0.35, p.y);
        setSprite(obj, e, alpha);
      } else if (type === 'kill') {
        const pl = f.players.find((q) => q.id === id);
        const a = this.actors.get(id);
        if (pl) obj.position.set(pl.pos.x, (a?.rig.height ?? 1.05) * 0.7, pl.pos.y);
        setSprite(obj, e, alpha);
      } else if (type === 'report') {
        const b = f.bodies.find((q) => q.id === id);
        if (b) obj.position.set(b.pos.x, 0.95 + (rm ? 0 : Math.sin(t * 4) * 0.04), b.pos.y);
        setSprite(obj, e, alpha);
      } else if (type === 'invent') {
        const v0 = f.map.ventById.get(id);
        if (!v0) continue;
        const o = new THREE.Vector3(v0.x, 0.45, v0.y).project(this.camera);
        for (const ch of obj.children) {
          const lv = f.map.ventById.get(ch.userData.link as string);
          if (!lv) continue;
          const dx = lv.x - v0.x;
          const dz = lv.y - v0.y;
          const l = Math.hypot(dx, dz) || 1;
          const r = (1.25 + (rm ? 0 : Math.sin(t * 4) * 0.08)) * e;
          if (ch.userData.kind === 'arrow') {
            ch.position.set(v0.x + (dx / l) * r, 0.45, v0.y + (dz / l) * r);
            const sp = new THREE.Vector3(ch.position.x, 0.45, ch.position.z).project(this.camera);
            (ch as THREE.Sprite).material.rotation = Math.atan2(sp.y - o.y, (sp.x - o.x) * this.camera.aspect);
          } else ch.position.set(v0.x + (dx / l) * r, 0.12, v0.y + (dz / l) * r);
          setSprite(ch, e, alpha);
        }
      }
    }
    for (const [k, obj] of this.promptObjs) {
      if (seen.has(k)) continue;
      this.scene.remove(obj);
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if ((m as unknown as THREE.Sprite).isSprite || (m.isMesh && m.name === 'ring')) (m.material as THREE.Material).dispose();
      });
      this.promptObjs.delete(k);
    }
  }

  toScreen(p: Vec2): Vec2 | null {
    const v = new THREE.Vector3(p.x, 1.2, p.y).project(this.camera);
    if (v.z > 1) return null;
    const el = this.canvas;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    for (const a of this.actors.values()) a.rig.dispose();
    this.actors.clear();
    this.mapScene?.dispose();
    this.glowTex.dispose();
    for (const o of this.promptObjs.values()) this.scene.remove(o);
    this.promptObjs.clear();
    for (const t of this.promptTex.values()) t.tex.dispose();
    this.promptTex.clear();
    this.ringTex.dispose();
    this.ringGeo.dispose();
    this.arrowGeo?.dispose();
    this.arrowMat.dispose();
    for (const m of [this.inkHull, this.killHull, this.inkMats.thin, this.killMats.thin, this.arrowInk]) m.dispose();
    this.renderer.dispose();
  }
}
