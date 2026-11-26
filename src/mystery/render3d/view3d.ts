/**
 * 3D view (Three.js): third-person follow camera with wall collision or
 * first-person mouselook; toon-shaded berries; per-mode lighting (bright
 * Classic, lights-sabotage dimming, Lights Out flashlight spot + lamp pools);
 * quality tiers; particle FX; WebGL context-loss recovery.
 */
import * as THREE from 'three';
import { createBerry, createBody, createPet, type BerryRig } from '../characters/rig3d';
import { castRay, type CompiledMap } from '../core/map';
import type { Cosmetics, MatchEvent, Vec2 } from '../core/types';
import type { Prefs } from '../client/prefs';
import { input } from '../client/controls';
import type { FrameData } from '../render2d/renderer';
import type { ViewRenderer } from '../ui/GameView';
import { buildMapScene, radialTexture, type MapScene, type Quality } from './scene';

interface Actor {
  rig: BerryRig;
  cosKey: string;
  pet: { group: THREE.Group; update(dt: number, moving: boolean): void } | null;
  petPos: THREE.Vector3;
  label: THREE.Sprite;
  labelKey: string;
  seen: number;
  heading: number;
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

function labelSprite(text: string, color = '#ffffff'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '700 30px Inter, ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = Math.min(250, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(8,12,28,0.6)';
  g.beginPath();
  g.roundRect(128 - w / 2, 12, w, 40, 20);
  g.fill();
  g.fillStyle = color;
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.scale.set(1.4, 0.35, 1);
  spr.renderOrder = 10;
  return spr;
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
  frameMs = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private mode: 'fp' | 'tp',
    private prefs: Prefs,
  ) {
    this.quality = pickQuality(prefs.quality);
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
      if (this.mode === 'tp') this.camDist = Math.max(2.5, Math.min(9, this.camDist + e.deltaY * 0.004));
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
    this.mapKey = key;
    const theme = map.def.theme;
    this.scene.background = new THREE.Color(night ? '#04060d' : theme.sky);
  }

  private actor(id: string, cos: Cosmetics, name: string, nameColor?: string): Actor {
    const key = JSON.stringify(cos);
    let a = this.actors.get(id);
    if (a && a.cosKey !== key) {
      a.rig.setCosmetics(cos);
      a.cosKey = key;
      if (a.pet) {
        this.scene.remove(a.pet.group);
        a.pet = null;
      }
    }
    if (!a) {
      const rig = createBerry(cos, { quality: this.quality });
      rig.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = this.quality === 'high';
      });
      this.scene.add(rig.group);
      const label = labelSprite(name, nameColor);
      this.scene.add(label);
      a = { rig, cosKey: key, pet: null, petPos: new THREE.Vector3(), label, labelKey: name + (nameColor ?? ''), seen: 0, heading: 0 };
      this.actors.set(id, a);
    }
    if (a.labelKey !== name + (nameColor ?? '')) {
      this.scene.remove(a.label);
      (a.label.material as THREE.SpriteMaterial).map?.dispose();
      a.label.material.dispose();
      a.label = labelSprite(name, nameColor);
      a.labelKey = name + (nameColor ?? '');
      this.scene.add(a.label);
    }
    if (!a.pet && cos.pet && cos.pet !== 'none') {
      a.pet = createPet(cos.pet);
      this.scene.add(a.pet.group);
    }
    return a;
  }

  render(f: FrameData, dt: number): void {
    if (this.lost) return;
    const t0 = performance.now();
    this.ensureMap(f.map, f.night);
    const ms = this.mapScene!;
    // Camera look input (touch / right stick).
    const look = input.consumeLook();
    if (look.x || look.y) this.turn(look.x * 0.004 * this.prefs.sensitivity, look.y * 0.004 * this.prefs.sensitivity);
    // Actors.
    const now = performance.now();
    const localPlayer = f.players.find((p) => p.local);
    for (const p of f.players) {
      const a = this.actor(p.id, p.cosmetics, p.local ? '' : p.name, p.nameColor);
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
      a.label.visible = !p.local && (!p.ghost || !!localPlayer?.ghost);
      a.label.position.set(p.pos.x, (a.rig.height ?? 1.05) + 0.45 + g.position.y, p.pos.y);
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
    // Doors / lanterns / highlight.
    for (const [id, m] of ms.doorMeshes) m.visible = f.closedDoors.has(id);
    for (const [id, m] of ms.lanterns) (m.material as THREE.MeshBasicMaterial).color.set(f.litLanterns.has(id) ? '#fde047' : '#57534e');
    const hlId = f.near;
    const hl = hlId ? f.map.stationById.get(hlId) : null;
    ms.highlight.visible = !!hl;
    if (hl) {
      ms.highlight.position.set(hl.x, 0.04, hl.y);
      ms.highlight.scale.setScalar(1 + Math.sin(now / 200) * 0.06);
    }
    for (const [id, obj] of ms.stationMeshes) {
      const pulse = f.highlight.has(id);
      obj.scale.setScalar(pulse ? 1 + Math.sin(now / 250) * 0.04 : 1);
    }
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
    this.renderer.render(this.scene, this.camera);
    this.frameMs = performance.now() - t0;
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
    this.renderer.dispose();
  }
}
