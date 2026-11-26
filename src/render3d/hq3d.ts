/**
 * Marion HQ — 3D diorama view (Marion Mystery style).
 *
 * Same data and camera as the 2D floorplan: the HQ `Camera` (world px centre
 * and zoom) drives a tilted perspective camera over a low-walled, toon-shaded
 * building. Rooms use the Mystery floor painters, bots are full animated berry
 * rigs, and the grounds follow the selected season (lawn / meadow / leaves /
 * snow, trees, falling petals / fireflies / leaves / snow) and time of day
 * (sun → moon, lamp pools and lit windows at night).
 *
 * 1 tile (32 world px) = 1 three.js unit. World (x, y) → three (x, 0, y).
 * Names, speech bubbles and status badges are drawn on a 2D overlay canvas.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Camera } from '../engine/camera';
import { bubbleAlpha } from '../engine/bubbles';
import type { Simulation, SimBot } from '../engine/sim';
import { offsetPoly, pointInPoly, type Pt } from '../engine/geometry';
import { MAP_H, MAP_W, ROOMS, TILE, Tile, buildGrid, doorSegment, isTerrace, pointAlong, roomLabelAnchor, type PropKind, type RoomDef } from '../engine/world';
import { createBerry, type BerryRig } from '../mystery/characters/rig3d';
import { toon } from '../mystery/render3d/scene';
import { LAMPS, WINDOWS, nightFactor } from '../render/daylight';
import { terraceBeds } from '../render/ground';
import { ROOM_ACCENT } from '../render/props';
import type { RenderOptions } from '../render/renderer';
import { TREES, groundCanvas, lookFor, roomFloorTexture } from '../render/seasonal';
import type { RenderView } from '../render/view';
import { SEASON_STYLE, scatter, type Season } from '../theme/environment';

const U = 1 / TILE;
const WALL_H = 1.25;
/** Wall thickness (tiles); walls run along each room's outline, just inside it. */
const WALL_T = 0.36;
const FOV = 38;
const PITCH = (56 * Math.PI) / 180;

export type Quality3D = 'low' | 'high';

interface PropStyle {
  h: number;
  color: string;
  top?: string;
  glow?: string;
  thin?: boolean;
}

const PROP: Partial<Record<PropKind, PropStyle>> = {
  'command-desk': {
    h: 0.75,
    color: '#e6ebf5',
    top: '#2f6fed',
    glow: '#6ea1ff',
  },
  brain: { h: 0.9, color: '#c7d6ff', glow: '#6ea1ff' },
  'release-chute': { h: 1.1, color: '#cbd5e1', top: '#22c55e' },
  'huddle-table': { h: 0.7, color: '#f1f5f9', top: '#14b8a6' },
  whiteboard: { h: 1.6, color: '#ffffff', thin: true },
  terminal: { h: 1.0, color: '#334155', glow: '#22d3ee' },
  'polaroid-board': { h: 1.6, color: '#fef3c7', thin: true },
  'relay-rack': { h: 1.7, color: '#1e293b', glow: '#ef4444' },
  'violet-desk': { h: 0.75, color: '#ede9fe', top: '#8b5cf6', glow: '#a78bfa' },
  'wave-indicator': { h: 1.2, color: '#ede9fe', glow: '#a78bfa', thin: true },
  'screens-board': { h: 1.6, color: '#1e293b', glow: '#60a5fa', thin: true },
  conduit: { h: 0.06, color: '#94a3b8' },
  'planner-board': { h: 1.6, color: '#ffffff', thin: true },
  turntable: { h: 0.8, color: '#3f3f46', top: '#18181b' },
  mic: { h: 1.3, color: '#52525b', thin: true },
  'vault-cabinet': { h: 1.4, color: '#e2e8f0', top: '#f59e0b' },
  'mcp-door': { h: 1.9, color: '#cbd5e1', glow: '#2f6fed', thin: true },
  'life-desk': { h: 0.75, color: '#f8fafc', top: '#2f6fed' },
  'monitor-wall': { h: 1.7, color: '#1e293b', glow: '#f59e0b', thin: true },
  'llm-console': { h: 0.95, color: '#334155', glow: '#fbbf24' },
  dimmer: { h: 1.1, color: '#e2e8f0', thin: true },
  'fts-cabinet': { h: 1.4, color: '#cbd5e1', glow: '#22d3ee' },
  'intake-chute': { h: 1.1, color: '#cbd5e1', top: '#f59e0b' },
  couch: { h: 0.55, color: '#d6a86a', top: '#e8c08a' },
  'timeline-monitors': {
    h: 1.2,
    color: '#111827',
    glow: '#d946ef',
    thin: true,
  },
  'jog-desk': { h: 0.75, color: '#27272a', glow: '#e879f9' },
  'clip-bins': { h: 0.8, color: '#3f3f46', top: '#d946ef' },
  clapperboard: { h: 0.5, color: '#18181b' },
  'render-lamp': { h: 1.2, color: '#52525b', glow: '#f0abfc' },
  'timeline-table': { h: 0.72, color: '#27272a', glow: '#d946ef' },
  'sorting-wall': { h: 1.6, color: '#e2e8f0', thin: true },
  'redpen-desk': { h: 0.75, color: '#f8fafc', top: '#ef4444' },
  'stamp-press': { h: 1.0, color: '#64748b', top: '#ef4444' },
  outbox: { h: 0.7, color: '#cbd5e1', top: '#2f6fed' },
  'tube-port': { h: 0.4, color: '#bfdbfe', glow: '#6ea1ff' },
  'aura-bench': { h: 0.8, color: '#fed7aa', glow: '#f97316' },
  'skill-wall': { h: 1.6, color: '#ffedd5', glow: '#fb923c', thin: true },
  'spawn-pod': { h: 1.5, color: '#e0f2fe', glow: '#f97316' },
  'retired-shelf': { h: 1.4, color: '#d6d3d1', thin: true },
  'arcade-cabinet': { h: 1.7, color: '#312e81', glow: '#f472b6' },
  leaderboard: { h: 1.8, color: '#1e1b4b', glow: '#22d3ee', thin: true },
  'neon-sign': { h: 1.9, color: '#1e1b4b', glow: '#ec4899', thin: true },
};

interface BotEntry {
  rig: BerryRig;
  yaw: number;
  lastX: number;
  lastY: number;
  cheered: number;
}

const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();

function hex(c: string): THREE.Color {
  return new THREE.Color(c);
}

export class HQ3DRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
  private overlay: HTMLCanvasElement | null = null;
  private octx: CanvasRenderingContext2D | null = null;
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private readonly quality: Quality3D;
  private hemi = new THREE.HemisphereLight('#e6f0ff', '#6b7a5a', 1.5);
  private sun = new THREE.DirectionalLight('#fff4e0', 1.7);
  private bots = new Map<string, BotEntry>();
  private season: Season | null = null;
  private seasonal = new THREE.Group();
  private groundMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  private particles: THREE.Points | null = null;
  private particleVel: Float32Array = new Float32Array(0);
  private lampPools: THREE.Mesh[] = [];
  private lampBulbs: THREE.Mesh[] = [];
  private windowGlow: THREE.MeshBasicMaterial[] = [];
  private glowMats: THREE.MeshToonMaterial[] = [];
  private packets: THREE.Mesh[] = [];
  private packetMat = new Map<string, THREE.MeshBasicMaterial>();
  private selRing: THREE.Mesh;
  private roomHighlight: THREE.LineLoop;
  private highlighted: string | null = null;
  private lastT = -1;
  private disposed = false;
  readonly raycaster = new THREE.Raycaster();
  readonly stats = { frames: 0, bots: 0 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    quality?: Quality3D,
  ) {
    const phone = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent);
    this.quality = quality ?? (phone ? 'low' : 'high');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.add(this.hemi);
    this.sun.position.set(MAP_W / 2 - 30, 60, MAP_H / 2 + 40);
    this.sun.target.position.set(MAP_W / 2, 0, MAP_H / 2);
    this.sun.castShadow = this.quality === 'high';
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    const half = Math.max(MAP_W, MAP_H) / 2 + 10;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog('#bfe3ff', 70, 170);

    this.buildBuilding();
    this.scene.add(this.seasonal);

    // Selection ring + room highlight.
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 40),
      new THREE.MeshBasicMaterial({
        color: '#6ea1ff',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.scene.add(this.selRing);
    this.roomHighlight = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#6ea1ff' }));
    this.roomHighlight.visible = false;
    this.scene.add(this.roomHighlight);

    // 2D overlay for names / bubbles.
    const parent = canvas.parentElement;
    if (parent && typeof document !== 'undefined') {
      const o = document.createElement('canvas');
      o.className = 'hq3d-overlay';
      Object.assign(o.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      });
      parent.appendChild(o);
      this.overlay = o;
      this.octx = o.getContext('2d');
    }
  }

  // ------------------------------------------------------------------ build

  private buildBuilding(): void {
    const root = new THREE.Group();
    const grid = buildGrid().tiles;

    // Corridor slab: merged quads for corridor + door tiles.
    const corr: number[] = [];
    const corrUv: number[] = [];
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const t = grid[y * MAP_W + x];
        if (t !== Tile.Corridor) continue;
        const y0 = 0.02;
        corr.push(x, y0, y, x, y0, y + 1, x + 1, y0, y + 1, x, y0, y, x + 1, y0, y + 1, x + 1, y0, y);
        corrUv.push(x / 4, y / 4, x / 4, (y + 1) / 4, (x + 1) / 4, (y + 1) / 4, x / 4, y / 4, (x + 1) / 4, (y + 1) / 4, (x + 1) / 4, y / 4);
      }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(corr, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(corrUv, 2));
    cg.computeVertexNormals();
    const corrMesh = new THREE.Mesh(
      cg,
      new THREE.MeshLambertMaterial({
        map: corridorTexture(),
        side: THREE.DoubleSide,
      }),
    );
    corrMesh.receiveShadow = true;
    root.add(corrMesh);

    // Room floors (Mystery floor painters) + accent strip.
    for (const room of ROOMS) {
      const accent = ROOM_ACCENT[room.id];
      const base = room.id === 'cutting' ? '#2a2f3d' : room.id === 'arcade' ? '#2a1f4a' : '#eef2f8';
      const tex = new THREE.CanvasTexture(roomFloorTexture(room, accent, base));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const floor = new THREE.Mesh(floorGeometry(room), new THREE.MeshLambertMaterial({ map: tex }));
      floor.position.set(room.x, 0.03, room.y);
      floor.receiveShadow = true;
      root.add(floor);
    }

    // Walls: one merged run per outline edge (angled walls included), with door gaps; navy body + lit cap.
    const segs = ROOMS.flatMap(wallSegments);
    const walls = new THREE.Mesh(segmentsGeometry(segs, 0, WALL_H, WALL_T), toon('#3a4874'));
    const caps = new THREE.Mesh(segmentsGeometry(segs, WALL_H, 0.08, WALL_T + 0.04), toon('#7083bd'));
    walls.castShadow = walls.receiveShadow = true;
    root.add(walls, caps);

    // Exterior curb: a low wall on void tiles bordering the corridor slab.
    const curbTiles: [number, number][] = [];
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (grid[y * MAP_W + x] !== Tile.Void) continue;
        if (ROOMS.some((r) => pointInPoly({ x: x + 0.5 - r.x, y: y + 0.5 - r.y }, r.outline, true))) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H && grid[ny * MAP_W + nx] === Tile.Corridor) near = true;
          }
        if (near) curbTiles.push([x, y]);
      }
    const curbSet = new Set(curbTiles.map(([x, y]) => y * MAP_W + x));
    const curb = new THREE.Mesh(boxesGeometry(mergeRuns((x, y) => curbSet.has(y * MAP_W + x)), 0, 0.55, 0), toon('#c9d3e8'));
    curb.castShadow = curb.receiveShadow = true;
    root.add(curb);

    // Props.
    const rounded = new Map<string, THREE.BufferGeometry>();
    const geoFor = (w: number, h: number, d: number) => {
      const k = `${w.toFixed(2)}:${h.toFixed(2)}:${d.toFixed(2)}`;
      let g = rounded.get(k);
      if (!g) {
        g = new RoundedBoxGeometry(w, h, d, 2, Math.min(0.08, w / 3, h / 3, d / 3));
        rounded.set(k, g);
      }
      return g;
    };
    const mats = new Map<string, THREE.MeshToonMaterial>();
    const mat = (c: string, glow = false) => {
      const k = `${c}:${glow}`;
      let mm = mats.get(k);
      if (!mm) {
        mm = toon(c, glow ? { emissive: c, emissiveIntensity: 0.9 } : {});
        if (glow) this.glowMats.push(mm);
        mats.set(k, mm);
      }
      return mm;
    };
    for (const room of ROOMS) {
      for (const p of room.props) {
        const st = PROP[p.kind] ?? { h: 0.8, color: '#e2e8f0' };
        const cx = room.x + p.x + p.w / 2;
        const cz = room.y + p.y + p.h / 2;
        if (p.kind === 'plant') {
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.34, 12), mat('#c2703d'));
          pot.position.set(cx, 0.17, cz);
          const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), mat('#22a35a'));
          leaves.position.set(cx, 0.62, cz);
          pot.castShadow = leaves.castShadow = true;
          root.add(pot, leaves);
          continue;
        }
        if (p.kind === 'brain') {
          const ped = new THREE.Mesh(geoFor(0.9, 0.5, 0.9), mat('#cbd5e1'));
          ped.position.set(cx, 0.25, cz);
          const orb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 16), mat('#6ea1ff', true));
          orb.position.set(cx, 0.9, cz);
          ped.castShadow = orb.castShadow = true;
          root.add(ped, orb);
          continue;
        }
        if (p.kind === 'huddle-table') {
          const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 40), mat('#f1f5f9'));
          top.scale.set(Math.max(1, p.w / 2 - 0.2), 1, Math.max(0.6, p.h / 2 - 0.2));
          top.position.set(cx, 0.7, cz);
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.64, 12), mat('#94a3b8'));
          leg.position.set(cx, 0.32, cz);
          top.castShadow = leg.castShadow = true;
          root.add(top, leg);
          continue;
        }
        const w = Math.max(0.3, p.w - 0.12);
        const d = st.thin ? Math.min(0.28, Math.max(0.2, p.h - 0.12)) : Math.max(0.3, p.h - 0.12);
        // Thin props sit against the wall nearest to them.
        let zc = cz;
        if (st.thin && p.h <= 2) zc = p.y < room.h / 2 ? room.y + p.y + 0.2 + d / 2 : room.y + p.y + p.h - 0.2 - d / 2;
        const body = new THREE.Mesh(geoFor(w, st.h, d), mat(st.color));
        body.position.set(cx, st.h / 2, zc);
        body.castShadow = true;
        body.receiveShadow = true;
        root.add(body);
        if (st.top) {
          const top = new THREE.Mesh(geoFor(w + 0.04, 0.06, d + 0.04), mat(st.top));
          top.position.set(cx, st.h + 0.03, zc);
          root.add(top);
        }
        if (st.glow) {
          // Glowing face (screen / indicator) on the side facing the camera (+z).
          const sw = Math.max(0.2, w * 0.78);
          const sh = st.thin ? st.h * 0.55 : Math.min(0.3, st.h * 0.4);
          const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat(st.glow, true));
          screen.position.set(cx, st.h - sh / 2 - 0.12, zc + d / 2 + 0.01);
          root.add(screen);
        }
      }
    }

    // Lamp pools (lit at night) + bulbs on corridor lamps.
    const radial = radialTex();
    for (const l of LAMPS) {
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: radial,
          color: l.color,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      pool.rotation.x = -Math.PI / 2;
      const s = (l.r * 2.4) / TILE;
      pool.scale.set(s, s, 1);
      pool.position.set(l.x * U, 0.06, l.y * U);
      pool.userData.strength = l.strength;
      this.lampPools.push(pool);
      root.add(pool);
      if (l.kind === 'corridor' || l.kind === 'garden') {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(l.kind === 'garden' ? 0.09 : 0.12, 10, 8), new THREE.MeshBasicMaterial({ color: '#7d8597' }));
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, l.kind === 'garden' ? 0.6 : 0.05, 6), toon('#64748b'));
        const h = l.kind === 'garden' ? 0.66 : 0.1;
        bulb.position.set(l.x * U, h, l.y * U);
        post.position.set(l.x * U, h / 2, l.y * U);
        this.lampBulbs.push(bulb);
        root.add(post, bulb);
      }
    }

    // Lit windows on the outside of the curb (glow at night).
    const winMat = new THREE.MeshBasicMaterial({
      color: '#ffd08a',
      transparent: true,
      opacity: 0,
    });
    this.windowGlow.push(winMat);
    for (const w of WINDOWS) {
      const len = Math.max(w.w, w.h) * U * 0.8;
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(len, w.wall ? 0.34 : 0.26), winMat);
      // Room walls: on the wall's outer face. Corridor facades: on the curb's outer face.
      const out = w.wall ? 0.015 : 1.005;
      wm.position.set((w.x + w.w / 2) * U + w.nx * out, w.wall ? 0.78 : 0.3, (w.y + w.h / 2) * U + w.ny * out);
      wm.rotation.y = Math.atan2(w.nx, w.ny);
      root.add(wm);
    }
    this.scene.add(root);

    // Packet pool.
    const pg = new THREE.SphereGeometry(0.14, 12, 8);
    for (let i = 0; i < 48; i++) {
      const pm = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      pm.visible = false;
      this.packets.push(pm);
      this.scene.add(pm);
    }
  }

  private buildSeason(season: Season): void {
    for (const c of [...this.seasonal.children]) {
      this.seasonal.remove(c);
      c.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
      });
    }
    const st = SEASON_STYLE[season];

    // Ground.
    const gc = groundCanvas(season);
    if (gc) {
      const tex = new THREE.CanvasTexture(gc);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(300 / 8, 300 / 8);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      this.groundMat.map?.dispose();
      this.groundMat.map = tex;
      this.groundMat.color.set('#ffffff');
    } else this.groundMat.color.set(st.ground);
    this.groundMat.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(MAP_W / 2, -0.01, MAP_H / 2);
    ground.receiveShadow = true;
    this.seasonal.add(ground);

    // Paved apron hugging the building's real outline (open ground within a tile of it).
    const apronCol = season === 'winter' ? '#dfe8f3' : '#e7dcc4';
    const apron = new THREE.Mesh(boxesGeometry(mergeRuns(nearBuilding(1)), -0.004, 0.012, 0), new THREE.MeshLambertMaterial({ color: apronCol }));
    apron.receiveShadow = true;
    this.seasonal.add(apron);

    // Terrace gardens: lawn beds + hedges + shrubs.
    for (const b of terraceBeds()) {
      const bed = new THREE.Mesh(
        new THREE.PlaneGeometry(b.w * U, b.h * U),
        new THREE.MeshLambertMaterial({
          map: this.groundMat.map,
          color: '#ffffff',
        }),
      );
      bed.rotation.x = -Math.PI / 2;
      bed.position.set((b.x + b.w / 2) * U, 0.035, (b.y + b.h / 2) * U);
      bed.receiveShadow = true;
      const hedge = new THREE.Mesh(new RoundedBoxGeometry(b.w * U - 0.6, 0.6, 0.5, 2, 0.15), toon(st.foliage[0]!));
      hedge.position.set((b.x + b.w / 2) * U, 0.3, b.y * U + 0.5);
      hedge.castShadow = true;
      this.seasonal.add(bed, hedge);
      for (let i = 0; i < 7; i++) {
        const sx = (b.x + 30 + scatter(i, b.x) * (b.w - 60)) * U;
        const sz = (b.y + 70 + scatter(i, b.x + 3) * (b.h - 100)) * U;
        const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 + scatter(i, 4) * 0.2, 1), toon(st.foliage[i % st.foliage.length]!));
        shrub.position.set(sx, 0.3, sz);
        shrub.castShadow = true;
        this.seasonal.add(shrub);
      }
    }

    // Trees (instanced trunks + canopies; pines in winter keep a snow cap).
    const n = TREES.length;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 8).translate(0, 0.6, 0), toon('#8b5a3c'), n);
    const pine = season === 'winter';
    const canopyGeo = pine ? new THREE.ConeGeometry(1.1, 2.4, 10).translate(0, 2.1, 0) : new THREE.IcosahedronGeometry(1.15, 1).translate(0, 2.05, 0);
    const canopy = new THREE.InstancedMesh(canopyGeo, toon('#ffffff'), n);
    const snowCap = pine ? new THREE.InstancedMesh(new THREE.ConeGeometry(0.62, 1.0, 10).translate(0, 2.95, 0), toon('#f8fbff'), n) : null;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    TREES.forEach((t, i) => {
      const s = t.s * 1.15;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), scatter(i, 31) * Math.PI * 2);
      m.compose(new THREE.Vector3(t.x * U, 0, t.y * U), q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m);
      canopy.setMatrixAt(i, m);
      snowCap?.setMatrixAt(i, m);
      canopy.setColorAt(i, tmpC.set(st.foliage[t.v % st.foliage.length]!));
    });
    trunks.castShadow = canopy.castShadow = true;
    this.seasonal.add(trunks, canopy);
    if (snowCap) this.seasonal.add(snowCap);

    // Blooms / fallen leaves / snow mounds scattered on the lawn near the building.
    const deco = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), toon('#ffffff'), 220);
    const near2 = nearBuilding(2);
    let k = 0;
    for (let i = 0; i < 600 && k < 220; i++) {
      const x = -12 + scatter(i, 41) * (MAP_W + 24);
      const z = -12 + scatter(i, 43) * (MAP_H + 24);
      // Open ground only: outside the bounds, or inside them well clear of the building and gardens.
      const inside = x > -1.5 && x < MAP_W + 1.5 && z > -1.5 && z < MAP_H + 1.5;
      if (inside && (near2(Math.floor(x), Math.floor(z)) || isTerrace(Math.floor(x), Math.floor(z)))) continue;
      const big = season === 'winter' ? 2.4 : 1;
      m.compose(new THREE.Vector3(x, 0.04, z), q.identity(), new THREE.Vector3(big, season === 'winter' ? 0.5 : 0.7, big));
      deco.setMatrixAt(k, m);
      deco.setColorAt(k, tmpC.set(st.blooms[i % st.blooms.length]!));
      k++;
    }
    deco.count = k;
    this.seasonal.add(deco);

    // Falling particles.
    const N = this.quality === 'high' ? 700 : 320;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    this.particleVel = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = scatter(i, 51) * 80 - 40;
      pos[i * 3 + 1] = scatter(i, 53) * 14;
      pos[i * 3 + 2] = scatter(i, 57) * 80 - 40;
      tmpC.set(st.particle.colors[i % st.particle.colors.length]!);
      col[i * 3] = tmpC.r;
      col[i * 3 + 1] = tmpC.g;
      col[i * 3 + 2] = tmpC.b;
      this.particleVel[i * 2] = scatter(i, 59) * Math.PI * 2;
      this.particleVel[i * 2 + 1] = 0.6 + scatter(i, 61) * 0.8;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const firefly = st.particle.kind === 'firefly';
    const pm = new THREE.PointsMaterial({
      size: st.particle.size * (firefly ? 3 : 3.4),
      map: radialTex(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: firefly ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity: 0.95,
    });
    this.particles = new THREE.Points(pg, pm);
    this.particles.frustumCulled = false;
    this.seasonal.add(this.particles);
  }

  // ------------------------------------------------------------------ frame

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = Math.min(dpr, this.quality === 'high' ? 2 : 1.5);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.camera.aspect = this.cssW / this.cssH;
    this.camera.updateProjectionMatrix();
    if (this.overlay) {
      this.overlay.width = Math.round(this.cssW * this.dpr);
      this.overlay.height = Math.round(this.cssH * this.dpr);
    }
  }

  invalidate(): void {
    /* static meshes don't depend on the UI theme */
  }

  /** Place the perspective camera from the shared HQ camera (centre + zoom). */
  private placeCamera(cam: Camera): void {
    const visibleTiles = cam.vh / cam.zoom / TILE;
    const dist = Math.max(5, (visibleTiles / 2 / Math.tan(((FOV / 2) * Math.PI) / 180)) * 1.04);
    const tx = cam.x * U;
    const tz = cam.y * U;
    this.camera.position.set(tx, Math.sin(PITCH) * dist, tz + Math.cos(PITCH) * dist);
    this.camera.lookAt(tx, 0, tz);
    this.camera.updateMatrixWorld();
    this.camera.far = dist * 3 + 120;
    this.camera.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist * 1.15;
    fog.far = dist * 3.2 + 40;
  }

  render(sim: Simulation, cam: Camera, _view: RenderView, alpha: number, opts: RenderOptions): void {
    if (this.disposed) return;
    cam.setViewport(this.cssW, this.cssH);
    const t = sim.time;
    const dt = this.lastT < 0 ? 0.016 : Math.min(0.1, Math.max(0, t - this.lastT) || 0.016);
    this.lastT = t;
    this.stats.frames++;
    const season = opts.season ?? 'spring';
    if (season !== this.season) {
      this.season = season;
      this.buildSeason(season);
    }
    const st = SEASON_STYLE[season];
    const night = nightFactor(opts.hour ?? 12);
    this.placeCamera(cam);

    // Sky, fog and light: lerp day → night.
    const sky = tmpC.set(st.skyDay).lerp(hex(st.skyNight), night * 0.92);
    this.scene.background = sky.clone();
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.hemi.color.set(st.ambient).lerp(hex('#8796c8'), night);
    this.hemi.groundColor.set(st.ground).multiplyScalar(0.55).lerp(hex('#1b2140'), night);
    this.hemi.intensity = 1.45 - night * 0.6;
    this.sun.color.set(st.sun).lerp(hex('#9fb4ff'), night);
    this.sun.intensity = 1.75 - night * 1.2;
    this.renderer.toneMappingExposure = 1.05 - night * 0.05;
    for (const p of this.lampPools) (p.material as THREE.MeshBasicMaterial).opacity = night * 0.55 * (p.userData.strength as number);
    for (const b of this.lampBulbs) (b.material as THREE.MeshBasicMaterial).color.set('#7d8597').lerp(hex('#fff1c4'), night);
    for (const w of this.windowGlow) w.opacity = night * 0.9;
    for (const g of this.glowMats) g.emissiveIntensity = 0.7 + night * 0.6;

    this.updateParticles(dt, cam, season, night);
    this.updateBots(sim, alpha, dt, opts);
    this.updatePackets(sim);

    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(sim, alpha, opts, night);
  }

  private updateParticles(dt: number, cam: Camera, season: Season, night: number): void {
    const p = this.particles;
    if (!p) return;
    const st = SEASON_STYLE[season].particle;
    const firefly = st.kind === 'firefly';
    const mat = p.material as THREE.PointsMaterial;
    mat.opacity = firefly ? 0.25 + night * 0.75 : 0.95;
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    p.position.set(cam.x * U, 0, cam.y * U);
    if (reduced) return;
    const pos = p.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const t = this.lastT;
    for (let i = 0; i < pos.count; i++) {
      const ph = this.particleVel[i * 2]!;
      const sp = this.particleVel[i * 2 + 1]!;
      if (firefly) {
        arr[i * 3] = arr[i * 3]! + Math.sin(t * 0.7 + ph) * dt * 0.6;
        arr[i * 3 + 1] = 0.6 + ((Math.sin(t * 0.5 + ph * 3) + 1) / 2) * 2.2;
        arr[i * 3 + 2] = arr[i * 3 + 2]! + Math.cos(t * 0.6 + ph) * dt * 0.6;
        continue;
      }
      arr[i * 3] = arr[i * 3]! + Math.sin(t * st.sway + ph) * dt * 0.8 + dt * 0.35;
      arr[i * 3 + 1] = arr[i * 3 + 1]! - dt * st.fall * 2.2 * sp;
      arr[i * 3 + 2] = arr[i * 3 + 2]! + Math.cos(t * st.sway * 0.7 + ph) * dt * 0.4;
      if (arr[i * 3 + 1]! < 0) {
        arr[i * 3 + 1] = 12 + scatter(i, t) * 3;
        arr[i * 3] = scatter(i + 7, t) * 80 - 40;
        arr[i * 3 + 2] = scatter(i + 13, t) * 80 - 40;
      }
      if (arr[i * 3]! > 40) arr[i * 3] = -40;
    }
    pos.needsUpdate = true;
  }

  private updateBots(sim: Simulation, alpha: number, dt: number, opts: RenderOptions): void {
    const seen = new Set<string>();
    for (const b of sim.bots.values()) {
      seen.add(b.def.id);
      let e = this.bots.get(b.def.id);
      if (!e) {
        const rig = createBerry(lookFor(b.def.id, b.def.color), {
          quality: this.quality === 'high' ? 'medium' : 'low',
        });
        rig.group.scale.setScalar(1.35);
        rig.group.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
        this.scene.add(rig.group);
        e = { rig, yaw: 0, lastX: b.x, lastY: b.y, cheered: 0 };
        this.bots.set(b.def.id, e);
      }
      const x = (b.prevX + (b.x - b.prevX) * alpha) * U;
      const z = (b.prevY + (b.y - b.prevY) * alpha) * U;
      const dx = b.x - e.lastX;
      const dy = b.y - e.lastY;
      const moving = b.state === 'walking' && Math.hypot(dx, dy) > 0.05;
      if (moving) {
        const target = Math.atan2(dx, dy);
        let d = target - e.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        e.yaw += d * Math.min(1, dt * 10);
      } else if (b.state === 'working' || b.state === 'idle') {
        // Settle facing the camera-ish side so faces read in the diorama.
        let d = 0 - e.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        e.yaw += d * Math.min(1, dt * 2);
      }
      e.lastX = b.x;
      e.lastY = b.y;
      const bob = b.state === 'asleep' ? -0.05 : 0;
      e.rig.group.position.set(x, 0.04 + bob, z);
      e.rig.group.rotation.y = e.yaw;
      const mood = b.mood && b.mood.until > sim.time ? b.mood.kind : null;
      const emote = mood === 'cheer' ? 'cheer' : mood === 'play' ? 'dance' : b.state === 'huddling' ? 'wave' : null;
      if (mood === 'cheer' && sim.time - e.cheered > 3) {
        e.rig.play('celebrate');
        e.cheered = sim.time;
      } else if (mood === 'sulk' && sim.time - e.cheered > 3) {
        e.rig.play('sulk');
        e.cheered = sim.time;
      }
      e.rig.update(dt, { moving, speed: moving ? 1 : 0, emote });
      if (opts.selectedBot === b.def.id) {
        this.selRing.visible = true;
        this.selRing.position.set(x, 0.07, z);
      }
    }
    if (!opts.selectedBot || !sim.bots.has(opts.selectedBot)) this.selRing.visible = false;
    for (const [id, e] of this.bots) {
      if (seen.has(id)) continue;
      this.scene.remove(e.rig.group);
      e.rig.dispose();
      this.bots.delete(id);
    }
    this.stats.bots = this.bots.size;

    const room = opts.selectedRoom ? ROOMS.find((r) => r.id === opts.selectedRoom) : null;
    this.roomHighlight.visible = !!room;
    if (room && this.highlighted !== room.id) {
      this.highlighted = room.id;
      const ring = offsetPoly(room.outline, -0.08).map((q) => new THREE.Vector3(room.x + q.x, WALL_H + 0.1, room.y + q.y));
      this.roomHighlight.geometry.dispose();
      this.roomHighlight.geometry = new THREE.BufferGeometry().setFromPoints(ring);
      (this.roomHighlight.material as THREE.LineBasicMaterial).color.set(ROOM_ACCENT[room.id]);
    }
    if (!room) this.highlighted = null;
  }

  private updatePackets(sim: Simulation): void {
    let i = 0;
    for (const pk of sim.packets) {
      const mesh = this.packets[i++];
      if (!mesh) break;
      const p = pointAlong(pk.points, pk.t);
      mesh.visible = true;
      mesh.position.set(p.x * U, 1.55, p.y * U);
      let mm = this.packetMat.get(pk.color);
      if (!mm) {
        mm = new THREE.MeshBasicMaterial({ color: pk.color });
        this.packetMat.set(pk.color, mm);
      }
      mesh.material = mm;
    }
    for (; i < this.packets.length; i++) this.packets[i]!.visible = false;
  }

  /** Screen position (CSS px) of a world point at height h (tiles). */
  private project(wx: number, wy: number, h: number): { x: number; y: number; ok: boolean } {
    tmpV.set(wx * U, h, wy * U).project(this.camera);
    return {
      x: ((tmpV.x + 1) / 2) * this.cssW,
      y: ((1 - tmpV.y) / 2) * this.cssH,
      ok: tmpV.z < 1,
    };
  }

  private drawOverlay(sim: Simulation, alpha: number, opts: RenderOptions, night: number): void {
    const g = this.octx;
    const o = this.overlay;
    if (!g || !o) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.cssW, this.cssH);
    const scale = this.labelScale();

    // Room labels (chips above each room's top wall).
    if (scale > 0.22) {
      g.font = `700 ${Math.round(Math.max(10, 11 * Math.min(1.2, scale * 1.6)))}px ui-sans-serif, system-ui, sans-serif`;
      g.textBaseline = 'middle';
      for (const room of ROOMS) {
        const r = roomLabelAnchor(room);
        const p = this.project(r.x + 8, r.y - 2, WALL_H + 0.2);
        if (!p.ok) continue;
        const text = room.name;
        const w = g.measureText(text).width + 22;
        g.fillStyle = night > 0.5 ? 'rgba(18,24,48,0.88)' : 'rgba(255,255,255,0.94)';
        roundRect(g, p.x, p.y - 10, w, 20, 10);
        g.fill();
        g.strokeStyle = ROOM_ACCENT[room.id];
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = ROOM_ACCENT[room.id];
        g.beginPath();
        g.arc(p.x + 9, p.y, 3.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = night > 0.5 ? '#e6ebff' : '#1e2340';
        g.textAlign = 'left';
        g.fillText(text, p.x + 16, p.y + 0.5);
      }
    }

    // Names + badges + bubbles.
    const head = 1.8;
    for (const b of sim.bots.values()) {
      const x = b.prevX + (b.x - b.prevX) * alpha;
      const y = b.prevY + (b.y - b.prevY) * alpha;
      const p = this.project(x, y, head);
      if (!p.ok) continue;
      if (opts.showNames && scale > 0.3) {
        g.font = `700 ${Math.round(Math.max(10, 11 * Math.min(1.3, scale)))}px ui-sans-serif, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const w = g.measureText(b.def.name).width + 12;
        g.fillStyle = 'rgba(17,22,44,0.78)';
        roundRect(g, p.x - w / 2, p.y - 9, w, 18, 9);
        g.fill();
        g.fillStyle = '#ffffff';
        g.fillText(b.def.name, p.x, p.y + 0.5);
      }
      badge(g, b, p.x + 18, p.y - 14, sim.time);
    }
    for (const bub of sim.bubbles.items) {
      const b = sim.bots.get(bub.botId);
      if (!b) continue;
      const x = b.prevX + (b.x - b.prevX) * alpha;
      const y = b.prevY + (b.y - b.prevY) * alpha;
      const p = this.project(x, y, head + 0.45);
      if (!p.ok) continue;
      g.globalAlpha = bubbleAlpha(bub);
      g.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const w = Math.min(260, g.measureText(bub.text).width + 20);
      const bx = p.x - w / 2;
      const by = p.y - 34;
      g.fillStyle = bub.crossBot ? '#e6fffb' : '#ffffff';
      roundRect(g, bx, by, w, 24, 12);
      g.fill();
      g.beginPath();
      g.moveTo(p.x - 6, by + 23);
      g.lineTo(p.x, by + 31);
      g.lineTo(p.x + 6, by + 23);
      g.fill();
      g.strokeStyle = bub.crossBot ? '#14b8a6' : 'rgba(30,35,64,0.25)';
      g.lineWidth = 1.2;
      roundRect(g, bx, by, w, 24, 12);
      g.stroke();
      g.fillStyle = bub.crossBot ? '#0f766e' : '#1e2340';
      g.fillText(bub.text, p.x, by + 12.5, w - 14);
      g.globalAlpha = 1;
    }
  }

  /** Rough on-screen px per tile at the camera target, normalised to the 2D view at zoom 1. */
  private labelScale(): number {
    const a = this.project(MAP_W * TILE * 0.5, MAP_H * TILE * 0.5, 0);
    const b = this.project(MAP_W * TILE * 0.5 + TILE, MAP_H * TILE * 0.5, 0);
    return Math.hypot(b.x - a.x, b.y - a.y) / TILE;
  }

  /** World point (px) on the ground under a screen point (CSS px). */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const ndc = new THREE.Vector2((sx / this.cssW) * 2 - 1, -(sy / this.cssH) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return { x: -1e6, y: -1e6 };
    return { x: hit.x * TILE, y: hit.z * TILE };
  }

  /** The bot whose body is under a screen point (CSS px), if any. */
  pickBotScreen(sim: Simulation, sx: number, sy: number): SimBot | null {
    let best: SimBot | null = null;
    let bestD = Infinity;
    for (const b of sim.bots.values()) {
      const top = this.project(b.x, b.y, 1.0);
      const foot = this.project(b.x, b.y, 0);
      const r = Math.max(14, Math.abs(foot.y - top.y) * 0.6);
      const cy = (top.y + foot.y) / 2;
      const d = Math.hypot(sx - top.x, sy - cy);
      if (d < r && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  dispose(): void {
    this.disposed = true;
    for (const e of this.bots.values()) e.rig.dispose();
    this.bots.clear();
    this.overlay?.remove();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    this.renderer.dispose();
  }
}

// ------------------------------------------------------------------ helpers

export type Run = { x: number; y: number; w: number; h: number };

/** Open-ground tiles within `r` tiles (Chebyshev) of the building footprint. */
function nearBuilding(r: number): (x: number, y: number) => boolean {
  const g = buildGrid().tiles;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && g[y * MAP_W + x] !== Tile.Void;
  return (x, y) => {
    if (solid(x, y)) return false;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (solid(x + dx, y + dy)) return true;
    return false;
  };
}

/** Greedy merge of grid cells into horizontal runs, then vertical runs of the leftovers. */
export function mergeRuns(on: (x: number, y: number) => boolean): Run[] {
  const used = new Uint8Array(MAP_W * MAP_H);
  const out: Run[] = [];
  for (let y = 0; y < MAP_H; y++) {
    let x = 0;
    while (x < MAP_W) {
      if (!on(x, y)) {
        x++;
        continue;
      }
      let e = x;
      while (e + 1 < MAP_W && on(e + 1, y)) e++;
      if (e > x) {
        out.push({ x, y, w: e - x + 1, h: 1 });
        for (let k = x; k <= e; k++) used[y * MAP_W + k] = 1;
      }
      x = e + 1;
    }
  }
  for (let x = 0; x < MAP_W; x++) {
    let y = 0;
    while (y < MAP_H) {
      if (!on(x, y) || used[y * MAP_W + x]) {
        y++;
        continue;
      }
      let e = y;
      while (e + 1 < MAP_H && on(x, e + 1) && !used[(e + 1) * MAP_W + x]) e++;
      out.push({ x, y, w: 1, h: e - y + 1 });
      y = e + 1;
    }
  }
  return out;
}

/** A room's floor: its outline polygon (local tiles), UV-mapped over its bounding box. */
export function floorGeometry(room: RoomDef): THREE.BufferGeometry {
  const shape = new THREE.Shape(room.outline.map((q) => new THREE.Vector2(q.x, -q.y)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / room.w;
    uv[i * 2 + 1] = 1 - pos.getZ(i) / room.h;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export type WallSeg = { a: Pt; b: Pt };

/**
 * Wall centre-line segments (global tile units) for a room: each outline edge
 * inset by half the wall thickness, minus its door openings, extended at the
 * corners so neighbouring runs meet without gaps.
 */
export function wallSegments(room: RoomDef): WallSeg[] {
  const poly = room.outline;
  const inner = offsetPoly(poly, WALL_T / 2);
  const n = poly.length;
  const dir = (i: number) => {
    const a = poly[(i + n) % n]!;
    const b = poly[(i + 1 + n) % n]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const ext = (i: number) => {
    const u0 = dir(i - 1);
    const u1 = dir(i);
    const turn = Math.acos(Math.max(-1, Math.min(1, u0.x * u1.x + u0.y * u1.y)));
    return (WALL_T / 2) * Math.tan(turn / 2);
  };
  const doors = room.doors.map((d) => {
    const s = doorSegment(room, d);
    return { a: { x: s.a.x / TILE - room.x, y: s.a.y / TILE - room.y }, b: { x: s.b.x / TILE - room.x, y: s.b.y / TILE - room.y } };
  });
  const out: WallSeg[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const a2 = inner[i]!;
    const b2 = inner[(i + 1) % n]!;
    const u = dir(i);
    const len = Math.hypot(b2.x - a2.x, b2.y - a2.y);
    const cuts: [number, number][] = [];
    for (const d of doors) {
      const on = (q: Pt) => Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) < 1e-6;
      if (!on(d.a) || !on(d.b)) continue;
      const t0 = (d.a.x - a2.x) * u.x + (d.a.y - a2.y) * u.y;
      const t1 = (d.b.x - a2.x) * u.x + (d.b.y - a2.y) * u.y;
      cuts.push([Math.min(t0, t1), Math.max(t0, t1)]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    let t = -ext(i);
    const end = len + ext(i + 1);
    const push = (s0: number, s1: number) => {
      if (s1 - s0 < 0.05) return;
      out.push({
        a: { x: room.x + a2.x + u.x * s0, y: room.y + a2.y + u.y * s0 },
        b: { x: room.x + a2.x + u.x * s1, y: room.y + a2.y + u.y * s1 },
      });
    };
    for (const [c0, c1] of cuts) {
      push(t, c0);
      t = Math.max(t, c1);
    }
    push(t, end);
  }
  return out;
}

/** One merged geometry of wall boxes along segments (y0 = base, h = height, t = thickness). */
function segmentsGeometry(segs: readonly WallSeg[], y0: number, h: number, t: number): THREE.BufferGeometry {
  const parts = segs.map((sg) => {
    const dx = sg.b.x - sg.a.x;
    const dz = sg.b.y - sg.a.y;
    const g = new THREE.BoxGeometry(Math.hypot(dx, dz), h, t);
    g.rotateY(Math.atan2(-dz, dx));
    g.translate((sg.a.x + sg.b.x) / 2, y0 + h / 2, (sg.a.y + sg.b.y) / 2);
    return g;
  });
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const q of parts) q.dispose();
  return merged;
}

/** One merged geometry of boxes over runs (y0 = base height, h = box height, grow = xz overhang). */
function boxesGeometry(runs: readonly Run[], y0: number, h: number, grow: number): THREE.BufferGeometry {
  const parts = runs.map((r) => {
    const g = new THREE.BoxGeometry(r.w + grow * 2, h, r.h + grow * 2);
    g.translate(r.x + r.w / 2, y0 + h / 2, r.y + r.h / 2);
    return g;
  });
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  return merged;
}

let radial: THREE.CanvasTexture | null = null;
function radialTex(): THREE.CanvasTexture {
  if (radial) return radial;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  radial = new THREE.CanvasTexture(c);
  radial.colorSpace = THREE.SRGBColorSpace;
  return radial;
}

function corridorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#dfe6f2';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#e7edf7' : '#d8e0ee';
      g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function badge(g: CanvasRenderingContext2D, b: SimBot, x: number, y: number, t: number): void {
  if (b.state === 'needs_input') {
    g.fillStyle = '#f59e0b';
    g.beginPath();
    g.arc(x, y + Math.sin(t * 5) * 1.5, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '800 11px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', x, y + 0.5 + Math.sin(t * 5) * 1.5);
  } else if (b.state === 'asleep') {
    g.fillStyle = '#94a3b8';
    g.font = '700 11px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('z', x, y - ((t * 8) % 8));
    g.fillText('Z', x + 6, y - 6 - ((t * 8 + 4) % 8));
  } else if (b.state === 'working') {
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(34,197,94,${0.4 + 0.6 * ((Math.sin(t * 6 - i) + 1) / 2)})`;
      g.beginPath();
      g.arc(x - 6 + i * 6, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
}
