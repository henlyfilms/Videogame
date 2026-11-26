/**
 * Map overview in the legend style (minimap, admin table, full map): slate
 * floors with an accent tint, inked walls, exterior rock / snow, vents linked
 * by dashed lines, camera zones and the meeting button. Static, so callers
 * bake it once per map and draw their live markers on top.
 */
import { Cell, type CompiledMap } from '../core/map';
import { mix, rgba, WORLD } from './paint';
import { worldInfo } from './world';

export function paintMapOverview(g: CanvasRenderingContext2D, map: CompiledMap, px: number, night: boolean): void {
  const info = worldInfo(map);
  const dim = (c: string, k = 0.5) => (night ? mix(c, '#0b1022', k) : c);
  const { w, h } = map;
  // Floors.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (map.cells[i] === Cell.Void) {
        const d = info.extDist[i]!;
        if (d <= 4 && !info.wall[i]) {
          g.fillStyle = dim(d <= 1 ? WORLD.rock : WORLD.rockDark, 0.6);
          g.fillRect(x * px, y * px, px, px);
        }
        continue;
      }
      const ri = map.roomIdx[i]!;
      let col: string;
      if (ri >= 0) {
        const r = map.def.rooms[ri]!;
        col = r.outdoor ? (r.floor === 'snow' ? WORLD.snowShade : mix(WORLD.rock, r.color, 0.25)) : mix('#5f7d9c', r.color, 0.22);
        if ((x + y) % 2 === 0 && !r.outdoor) col = mix(col, '#ffffff', 0.05);
      } else col = info.extFloor[i] ? WORLD.snowShade : '#8d99a9';
      g.fillStyle = dim(col);
      g.fillRect(x * px, y * px, px + 0.5, px + 0.5);
    }
  // Walls: dark mass with an ink outline toward the floor.
  g.fillStyle = dim('#2a3846', 0.4);
  for (const i of map.walls) g.fillRect((i % w) * px, Math.floor(i / w) * px, px + 0.5, px + 0.5);
  g.strokeStyle = night ? '#9fb0d8' : WORLD.ink;
  g.lineWidth = Math.max(1, px * 0.28);
  g.lineCap = 'square';
  g.beginPath();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (map.cells[y * w + x] === Cell.Void) continue;
      const solid = (xx: number, yy: number) => xx < 0 || yy < 0 || xx >= w || yy >= h || map.cells[yy * w + xx] === Cell.Void;
      if (solid(x, y - 1)) (g.moveTo(x * px, y * px), g.lineTo((x + 1) * px, y * px));
      if (solid(x, y + 1)) (g.moveTo(x * px, (y + 1) * px), g.lineTo((x + 1) * px, (y + 1) * px));
      if (solid(x - 1, y)) (g.moveTo(x * px, y * px), g.lineTo(x * px, (y + 1) * px));
      if (solid(x + 1, y)) (g.moveTo((x + 1) * px, y * px), g.lineTo((x + 1) * px, (y + 1) * px));
    }
  g.stroke();
  // Camera zones: translucent discs with dashed rims + a little lens icon.
  for (const cam of map.def.cameras) {
    const r = 4.5 * px;
    g.fillStyle = rgba('#7fd3ff', night ? 0.08 : 0.14);
    g.beginPath();
    g.arc(cam.x * px, cam.y * px, r, 0, Math.PI * 2);
    g.fill();
    g.setLineDash([px * 0.8, px * 0.6]);
    g.strokeStyle = rgba('#7fd3ff', 0.7);
    g.lineWidth = Math.max(1, px * 0.18);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = WORLD.ink;
    g.beginPath();
    g.roundRect(cam.x * px - px * 0.9, cam.y * px - px * 0.55, px * 1.5, px * 1.1, px * 0.25);
    g.fill();
    g.fillStyle = '#7fd3ff';
    g.beginPath();
    g.arc(cam.x * px - px * 0.15, cam.y * px, px * 0.32, 0, Math.PI * 2);
    g.fill();
  }
  // Vent connections: dashed lines between linked vents (each pair once).
  g.save();
  g.setLineDash([px * 0.9, px * 0.7]);
  g.lineWidth = Math.max(1, px * 0.3);
  g.strokeStyle = rgba('#ff5466', night ? 0.6 : 0.85);
  const done = new Set<string>();
  for (const v of map.def.vents)
    for (const lid of v.links) {
      const k = v.id < lid ? `${v.id}|${lid}` : `${lid}|${v.id}`;
      const o = map.ventById.get(lid);
      if (done.has(k) || !o) continue;
      done.add(k);
      g.beginPath();
      g.moveTo(v.x * px, v.y * px);
      g.lineTo(o.x * px, o.y * px);
      g.stroke();
    }
  g.restore();
  for (const v of map.def.vents) {
    g.fillStyle = WORLD.ink;
    g.beginPath();
    g.roundRect(v.x * px - px * 0.9, v.y * px - px * 0.7, px * 1.8, px * 1.4, px * 0.3);
    g.fill();
    g.fillStyle = '#a8aa9c';
    g.beginPath();
    g.roundRect(v.x * px - px * 0.7, v.y * px - px * 0.5, px * 1.4, px * 1.0, px * 0.2);
    g.fill();
    g.fillStyle = WORLD.ink;
    for (let k = 0; k < 3; k++) g.fillRect(v.x * px - px * 0.5, v.y * px - px * 0.35 + k * px * 0.3, px, px * 0.14);
  }
  // Meeting button.
  const em = map.emergency;
  if (em) {
    g.fillStyle = WORLD.ink;
    g.beginPath();
    g.arc(em.x * px, em.y * px, px * 1.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8364a';
    g.beginPath();
    g.arc(em.x * px, em.y * px, px * 0.75, 0, Math.PI * 2);
    g.fill();
  }
}
