/**
 * In-world interaction prompts and name tags, drawn with Canvas 2D in the
 * inked cel style. The 2D renderer draws them straight into the world; the
 * 3D view bakes them into sprite textures. All iconography is original:
 * a loud-hailer burst for reporting, a berry-skull badge for kill targets,
 * key-hint coins, bobbing task arrows over dotted floor rings, vent arrows.
 */
import { rgba, WORLD } from './paint';

export const easeOutBack = (k: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = Math.max(0, Math.min(1, k));
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const easeOutCubic = (k: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);

/**
 * Per-key eased visibility (0…1) for prompts: approaches 1 while `on`,
 * fades out after, so prompts scale/fade in and out instead of popping.
 */
export class PromptFader {
  private v = new Map<string, number>();
  update(active: ReadonlySet<string>, dt: number, reduced: boolean): void {
    const up = reduced ? 12 : 7;
    const down = reduced ? 12 : 6;
    for (const k of active) if (!this.v.has(k)) this.v.set(k, 0);
    for (const [k, val] of this.v) {
      const nv = active.has(k) ? Math.min(1, val + dt * up) : Math.max(0, val - dt * down);
      if (nv <= 0 && !active.has(k)) this.v.delete(k);
      else this.v.set(k, nv);
    }
  }
  get(k: string): number {
    return this.v.get(k) ?? 0;
  }
  entries(): IterableIterator<[string, number]> {
    return this.v.entries();
  }
}

/** Human label for a KeyboardEvent.code (KeyQ → Q). */
export function keyLabel(code: string | undefined | null): string {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code;
  if (code === 'Space') return '␣';
  if (code === 'Enter') return '↵';
  if (code === 'Tab') return 'Tab';
  return code.replace(/^(Numpad|Shift|Control|Alt)/, '').slice(0, 3);
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, n: number, rot = 0): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r0 : r1 * (0.92 + ((i * 37) % 7) * 0.02);
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.closePath();
}

/** Key hint coin: white disc, ink ring, bold letter. */
export function drawKeyHint(g: CanvasRenderingContext2D, x: number, y: number, r: number, label: string): void {
  if (!label) return;
  g.save();
  g.lineJoin = 'round';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = '#f7f8fb';
  g.fill();
  g.lineWidth = r * 0.28;
  g.strokeStyle = WORLD.ink;
  g.stroke();
  g.beginPath();
  g.arc(x, y, r * 0.72, Math.PI * 0.9, Math.PI * 1.6);
  g.lineWidth = r * 0.1;
  g.strokeStyle = 'rgba(20,25,38,0.25)';
  g.stroke();
  g.fillStyle = WORLD.ink;
  g.font = `900 ${r * (label.length > 1 ? 0.85 : 1.15)}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, x, y + r * 0.06);
  g.restore();
}

/** Report: red/white burst with a loud-hailer, key hint bottom-left. Size ≈ radius. */
export function drawReportBadge(g: CanvasRenderingContext2D, x: number, y: number, size: number, t: number, key: string, reduced = false): void {
  const wob = reduced ? 0 : Math.sin(t * 6) * 0.04;
  g.save();
  g.lineJoin = 'round';
  star(g, x, y, size * 0.72, size * 1.02, 11, t * (reduced ? 0 : 0.4));
  g.fillStyle = '#e8283c';
  g.fill();
  g.lineWidth = size * 0.1;
  g.strokeStyle = WORLD.ink;
  g.stroke();
  star(g, x, y, size * 0.5, size * 0.72, 11, -t * (reduced ? 0 : 0.3) + 0.2);
  g.fillStyle = '#ffffff';
  g.fill();
  // Loud-hailer: flared cone + body + handle, with sound arcs.
  g.translate(x, y);
  g.rotate(-0.35 + wob);
  const k = size * 0.5;
  g.beginPath();
  g.moveTo(-0.55 * k, -0.18 * k);
  g.lineTo(0.35 * k, -0.62 * k);
  g.quadraticCurveTo(0.5 * k, 0, 0.35 * k, 0.62 * k);
  g.lineTo(-0.55 * k, 0.18 * k);
  g.closePath();
  g.fillStyle = '#d4dbe6';
  g.fill();
  g.lineWidth = size * 0.08;
  g.strokeStyle = WORLD.ink;
  g.stroke();
  g.beginPath();
  g.ellipse(0.38 * k, 0, 0.14 * k, 0.6 * k, 0, 0, Math.PI * 2);
  g.fillStyle = '#e8283c';
  g.fill();
  g.stroke();
  g.beginPath();
  g.roundRect(-0.85 * k, -0.22 * k, 0.36 * k, 0.44 * k, 0.08 * k);
  g.fillStyle = '#2b3344';
  g.fill();
  g.stroke();
  g.beginPath();
  g.roundRect(-0.42 * k, 0.12 * k, 0.16 * k, 0.42 * k, 0.06 * k);
  g.fill();
  g.stroke();
  g.lineWidth = size * 0.07;
  g.lineCap = 'round';
  for (const r of [0.75, 1.0]) {
    g.beginPath();
    g.arc(0.3 * k, 0, r * k, -0.45, 0.45);
    g.stroke();
  }
  g.restore();
  drawKeyHint(g, x - size * 0.72, y + size * 0.68, size * 0.3, key);
}

/** Kill target: crimson disc with an original berry-skull, key hint bottom-left. */
export function drawKillBadge(g: CanvasRenderingContext2D, x: number, y: number, size: number, key: string): void {
  g.save();
  g.lineJoin = 'round';
  g.lineWidth = size * 0.1;
  g.strokeStyle = WORLD.ink;
  g.beginPath();
  g.arc(x, y, size * 0.95, 0, Math.PI * 2);
  g.fillStyle = '#b3122a';
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(x, y, size * 0.78, 0, Math.PI * 2);
  g.strokeStyle = '#ff5466';
  g.lineWidth = size * 0.06;
  g.stroke();
  // Skull: rounded cranium with a little leaf sprout, jaw with notches.
  const k = size * 0.62;
  g.strokeStyle = WORLD.ink;
  g.lineWidth = size * 0.08;
  g.beginPath();
  g.moveTo(x, y - k * 0.98);
  g.quadraticCurveTo(x + k * 0.32, y - k * 1.32, x + k * 0.5, y - k * 1.08);
  g.quadraticCurveTo(x + k * 0.25, y - k * 0.98, x, y - k * 0.98);
  g.fillStyle = '#7fd36a';
  g.fill();
  g.stroke();
  g.beginPath();
  g.ellipse(x, y - k * 0.12, k * 0.82, k * 0.78, 0, 0, Math.PI * 2);
  g.fillStyle = '#f4efe2';
  g.fill();
  g.stroke();
  g.beginPath();
  g.roundRect(x - k * 0.46, y + k * 0.38, k * 0.92, k * 0.44, k * 0.14);
  g.fill();
  g.stroke();
  g.fillStyle = WORLD.ink;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + sx * k * 0.33, y - k * 0.12, k * 0.22, k * 0.27, sx * -0.35, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ff3b4f';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(x + sx * k * 0.33, y - k * 0.1, k * 0.07, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = WORLD.ink;
  g.beginPath();
  g.moveTo(x, y + k * 0.14);
  g.lineTo(x - k * 0.09, y + k * 0.3);
  g.lineTo(x + k * 0.09, y + k * 0.3);
  g.closePath();
  g.fill();
  g.lineWidth = size * 0.05;
  for (const sx of [-0.16, 0, 0.16]) {
    g.beginPath();
    g.moveTo(x + sx * k * 1.4, y + k * 0.44);
    g.lineTo(x + sx * k * 1.4, y + k * 0.74);
    g.stroke();
  }
  g.restore();
  drawKeyHint(g, x - size * 0.78, y + size * 0.62, size * 0.32, key);
}

/** Bobbing task arrow (points down at the task). `size` ≈ half width. */
export function drawTaskArrow(g: CanvasRenderingContext2D, x: number, y: number, size: number, color: string = WORLD.task): void {
  g.save();
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x, y + size * 1.05);
  g.lineTo(x - size, y);
  g.lineTo(x - size * 0.42, y);
  g.lineTo(x - size * 0.42, y - size * 0.9);
  g.lineTo(x + size * 0.42, y - size * 0.9);
  g.lineTo(x + size * 0.42, y);
  g.lineTo(x + size, y);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = size * 0.22;
  g.strokeStyle = WORLD.ink;
  g.stroke();
  g.beginPath();
  g.moveTo(x - size * 0.22, y - size * 0.72);
  g.lineTo(x - size * 0.22, y + size * 0.05);
  g.lineWidth = size * 0.14;
  g.strokeStyle = 'rgba(255,255,255,0.65)';
  g.lineCap = 'round';
  g.stroke();
  g.restore();
}

/** Dotted ring on the floor around a task (ellipse in screen space). */
export function drawDottedRing(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, dot: number, t: number, color: string = WORLD.task, alpha = 1): void {
  const n = Math.max(10, Math.round((Math.PI * (rx + ry)) / (dot * 3.2)));
  g.save();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 0.6;
    const px = x + Math.cos(a) * rx;
    const py = y + Math.sin(a) * ry;
    g.beginPath();
    g.ellipse(px, py, dot, dot * (ry / rx), 0, 0, Math.PI * 2);
    g.fillStyle = rgba(WORLD.ink, 0.55 * alpha);
    g.fill();
    g.beginPath();
    g.ellipse(px, py - dot * 0.1, dot * 0.72, dot * 0.72 * (ry / rx), 0, 0, Math.PI * 2);
    g.fillStyle = rgba(color, alpha);
    g.fill();
  }
  g.restore();
}

/** Arrow button shown while hiding in a vent, pointing to a linked vent. */
export function drawVentArrow(g: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, label: string): void {
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round';
  g.save();
  g.rotate(angle);
  // Notched arrowhead: longer than wide so the direction reads at any rotation.
  g.beginPath();
  g.moveTo(size * 1.25, 0);
  g.lineTo(-size * 0.35, -size * 0.72);
  g.lineTo(size * 0.02, 0);
  g.lineTo(-size * 0.35, size * 0.72);
  g.closePath();
  g.fillStyle = '#f2f4f8';
  g.fill();
  g.lineWidth = size * 0.2;
  g.strokeStyle = WORLD.ink;
  g.stroke();
  g.beginPath();
  g.moveTo(size * 0.88, 0);
  g.lineTo(-size * 0.02, -size * 0.36);
  g.lineTo(size * 0.2, 0);
  g.lineTo(-size * 0.02, size * 0.36);
  g.closePath();
  g.fillStyle = WORLD.vent;
  g.fill();
  g.restore();
  if (label) {
    g.font = `800 ${size * 0.62}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tw = g.measureText(label).width + size * 0.8;
    // The label sits past the arrow tip (outward), so neighbouring arrows' labels separate.
    const reach = size * 1.6 + Math.abs(Math.cos(angle)) * (tw / 2 - size * 0.4);
    const lx = Math.cos(angle) * reach;
    const ly = Math.sin(angle) * size * 1.7 + size * 0.25;
    g.beginPath();
    g.roundRect(lx - tw / 2, ly - size * 0.46, tw, size * 0.92, size * 0.46);
    g.fillStyle = 'rgba(17,21,32,0.88)';
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillText(label, lx, ly + size * 0.03);
  }
  g.restore();
}

/**
 * Spread directions so no two are closer than `min` radians (vent-travel arrows
 * to vents that lie in a similar direction would otherwise sit on top of each other).
 */
export function spreadAngles(angles: number[], min = 0.9): number[] {
  const n = angles.length;
  if (n < 2) return angles.slice();
  const out = angles.slice();
  for (let it = 0; it < 12; it++) {
    let moved = false;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let d = out[j]! - out[i]!;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) >= min) continue;
        const push = (min - Math.abs(d)) / 2 + 1e-3;
        const s = d >= 0 ? 1 : -1;
        out[i] = out[i]! - push * s;
        out[j] = out[j]! + push * s;
        moved = true;
      }
    if (!moved) break;
  }
  return out;
}

export interface TagStyle {
  name: string;
  /** Name colour (role colours: teammates, mayor, host). */
  color?: string;
  /** Avatar dot colour (player colour). */
  avatar: string;
  avatarDark: string;
  /** Nameplate cosmetic gradient, shown as the avatar ring. */
  ring: readonly string[];
  local?: boolean;
  ghost?: boolean;
}

/** Measure a name tag (same units as `drawNameTag`'s `h`). */
export function measureTag(g: CanvasRenderingContext2D, name: string, h: number): number {
  g.save();
  g.font = `700 ${h * 0.56}px Inter, ui-sans-serif, system-ui, sans-serif`;
  const w = g.measureText(name).width;
  g.restore();
  return w + h * 1.55;
}

/**
 * Name tag pill centred at (x, y): dark rounded pill, coloured avatar dot
 * ringed with the player's nameplate colours, then the name. The local
 * player gets a bright green outline. `h` is the pill height in pixels.
 */
export function drawNameTag(g: CanvasRenderingContext2D, x: number, y: number, h: number, st: TagStyle): void {
  const name = st.name.slice(0, 20);
  const w = measureTag(g, name, h);
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  g.save();
  if (st.ghost) g.globalAlpha *= 0.6;
  g.beginPath();
  g.roundRect(x0, y0 + h * 0.08, w, h, h / 2);
  g.fillStyle = 'rgba(5,7,14,0.35)';
  g.fill();
  g.beginPath();
  g.roundRect(x0, y0, w, h, h / 2);
  g.fillStyle = 'rgba(17,21,32,0.9)';
  g.fill();
  g.lineWidth = st.local ? h * 0.14 : h * 0.07;
  g.strokeStyle = st.local ? WORLD.local : 'rgba(255,255,255,0.14)';
  g.stroke();
  // Avatar: ring in nameplate colours, player colour dot, tiny highlight.
  const ax = x0 + h / 2;
  const ar = h * 0.36;
  const ring = g.createLinearGradient(ax - ar, y - ar, ax + ar, y + ar);
  const stops = st.ring.length ? st.ring : ['#ffffff'];
  stops.forEach((c, i) => ring.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  g.beginPath();
  g.arc(ax, y, ar, 0, Math.PI * 2);
  g.fillStyle = ring;
  g.fill();
  g.beginPath();
  g.arc(ax, y, ar * 0.72, 0, Math.PI * 2);
  g.fillStyle = st.avatar;
  g.fill();
  g.lineWidth = h * 0.05;
  g.strokeStyle = st.avatarDark;
  g.stroke();
  g.beginPath();
  g.arc(ax - ar * 0.22, y - ar * 0.24, ar * 0.2, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fill();
  g.font = `700 ${h * 0.56}px Inter, ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = st.color ?? '#ffffff';
  g.fillText(name, x0 + h * 1.02, y + h * 0.03);
  g.restore();
}

/**
 * "Look here" ping badge: an inked map-pin with a bold "!" over the spot,
 * popping in, bobbing, and shrinking away at the end. `size` is the pin
 * height in px, (x, y) its tip. Shared by the 2D view and the 3D sprite.
 */
export function drawPingPin(g: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, pop: number): void {
  if (pop <= 0.01) return;
  const k = size * pop;
  const r = k * 0.34;
  const cy = y - k + r;
  g.save();
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.bezierCurveTo(x - r * 0.35, y - k * 0.28, x - r, cy + r * 0.75, x - r, cy);
  g.arc(x, cy, r, Math.PI, 0);
  g.bezierCurveTo(x + r, cy + r * 0.75, x + r * 0.35, y - k * 0.28, x, y);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = Math.max(1.5, k * 0.075);
  g.strokeStyle = WORLD.ink;
  g.stroke();
  // Light rim on the upper left for the cel look.
  g.beginPath();
  g.arc(x, cy, r * 0.78, Math.PI * 1.05, Math.PI * 1.55);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(1, k * 0.05);
  g.lineCap = 'round';
  g.stroke();
  // "!" in white with an ink edge.
  g.fillStyle = '#ffffff';
  g.strokeStyle = WORLD.ink;
  g.lineWidth = Math.max(1, k * 0.045);
  g.beginPath();
  g.roundRect(x - r * 0.17, cy - r * 0.62, r * 0.34, r * 0.82, r * 0.12);
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(x, cy + r * 0.45, r * 0.17, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();
}

/** Pop-in / hold / shrink-out curve for a ping of `age` seconds (ttl total). */
export function pingPop(age: number, ttl: number, reduced: boolean): number {
  if (age < 0 || age > ttl) return 0;
  const inK = reduced ? 1 : easeOutBack(age / 0.28);
  const outK = Math.min(1, (ttl - age) / 0.35);
  return Math.max(0, Math.min(inK, outK < 1 ? easeOutCubic(outK) : 1));
}

/**
 * The whole 2D ping: expanding floor rings at the spot, a dashed pointer
 * line from the pinger's hand, and the "!" pin. Pixel coordinates; `s` is
 * px per metre.
 */
export function drawPing(g: CanvasRenderingContext2D, from: { x: number; y: number } | null, to: { x: number; y: number }, s: number, age: number, ttl: number, color: string, reduced: boolean): void {
  const pop = pingPop(age, ttl, reduced);
  if (pop <= 0) return;
  const fade = Math.min(1, (ttl - age) / 0.35);
  g.save();
  // Floor rings: a solid one and two ripples (one static ring when reduced).
  g.lineWidth = s * 0.07;
  g.strokeStyle = WORLD.ink;
  g.beginPath();
  g.ellipse(to.x, to.y, s * 0.42 * pop, s * 0.26 * pop, 0, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = s * 0.04;
  g.stroke();
  if (!reduced)
    for (let i = 0; i < 2; i++) {
      const w = ((age * 1.3 + i * 0.5) % 1) as number;
      g.globalAlpha = (1 - w) * fade * 0.8;
      g.beginPath();
      g.ellipse(to.x, to.y, s * (0.45 + w * 0.9), s * (0.28 + w * 0.56), 0, 0, Math.PI * 2);
      g.stroke();
    }
  g.globalAlpha = fade;
  // Pointer line from the hand (about half a metre up) to the spot.
  if (from) {
    const hx = from.x;
    const hy = from.y - s * 0.55;
    const grow = reduced ? 1 : easeOutCubic(age / 0.22);
    const ex = hx + (to.x - hx) * grow;
    const ey = hy + (to.y - hy) * grow;
    g.lineCap = 'round';
    g.strokeStyle = rgba(WORLD.ink, 0.7);
    g.lineWidth = s * 0.09;
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(ex, ey);
    g.stroke();
    g.strokeStyle = color;
    g.lineWidth = s * 0.045;
    g.setLineDash([s * 0.22, s * 0.14]);
    g.lineDashOffset = reduced ? 0 : -age * s * 1.6;
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = color;
    g.beginPath();
    g.arc(hx, hy, s * 0.07, 0, Math.PI * 2);
    g.fill();
  }
  const bob = reduced ? 0 : Math.sin(age * 5) * s * 0.06;
  drawPingPin(g, to.x, to.y - s * 0.25 + bob, s * 0.95, color, pop);
  g.restore();
}

/** Live agent status pill (under a name tag): spinner slot on the left, one line of text. */
export const STATUS_TEXT_MAX = 34;
export const STATUS_SPIN = '#5eead4';

export function statusText(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > STATUS_TEXT_MAX ? `${t.slice(0, STATUS_TEXT_MAX - 1).trimEnd()}…` : t;
}

const STATUS_FONT = (h: number) => `600 ${h * 0.56}px Inter, ui-sans-serif, system-ui, sans-serif`;

/** Width of a status pill of height `h` for `text` (already clipped with `statusText`). */
export function measureStatus(g: CanvasRenderingContext2D, text: string, h: number): number {
  g.save();
  g.font = STATUS_FONT(h);
  const w = g.measureText(text).width;
  g.restore();
  return w + h * 1.45;
}

/** X offset (from the pill centre) of the spinner / idle dot centre. */
export function statusIconX(w: number, h: number): number {
  return -w / 2 + h * 0.52;
}

/**
 * The pill body (cacheable): dark rounded pill, faint outline, text. The
 * spinner is drawn on top each frame with `drawStatusSpinner`; idle pills get
 * a static hollow dot here instead.
 */
export function drawStatusPill(g: CanvasRenderingContext2D, x: number, y: number, h: number, text: string, busy: boolean, w = measureStatus(g, text, h)): void {
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  g.save();
  g.beginPath();
  g.roundRect(x0, y0 + h * 0.08, w, h, h / 2);
  g.fillStyle = 'rgba(5,7,14,0.3)';
  g.fill();
  g.beginPath();
  g.roundRect(x0, y0, w, h, h / 2);
  g.fillStyle = 'rgba(17,21,32,0.9)';
  g.fill();
  g.lineWidth = h * 0.07;
  g.strokeStyle = busy ? 'rgba(94,234,212,0.38)' : 'rgba(255,255,255,0.14)';
  g.stroke();
  if (!busy) {
    g.beginPath();
    g.arc(x + statusIconX(w, h), y, h * 0.2, 0, Math.PI * 2);
    g.lineWidth = h * 0.09;
    g.strokeStyle = 'rgba(203,213,225,0.6)';
    g.stroke();
  }
  g.font = STATUS_FONT(h);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = busy ? 'rgba(241,245,249,0.96)' : 'rgba(203,213,225,0.7)';
  g.fillText(text, x0 + h * 0.95, y + h * 0.03);
  g.restore();
}

/** Loading ring: faint white track + a bright arc at angle `a` (radians). */
export function drawStatusSpinner(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, color = STATUS_SPIN, track = 'rgba(255,255,255,0.18)'): void {
  g.save();
  g.lineWidth = Math.max(1.2, r * 0.42);
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.strokeStyle = track;
  g.stroke();
  g.beginPath();
  g.arc(x, y, r, a, a + Math.PI * 1.25);
  g.strokeStyle = color;
  g.stroke();
  g.restore();
}

/** Spinner angle at time `t` seconds (~1 rev/s); a fixed angle with reduced motion. */
export function spinnerAngle(t: number, reduced: boolean): number {
  return reduced ? -Math.PI / 2 : (t % 1) * Math.PI * 2;
}
