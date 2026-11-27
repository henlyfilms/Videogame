/**
 * Small helpers that keep map data files readable. The output is a plain
 * MapDef (JSON-compatible) — no behaviour lives here.
 */
import type { CameraDef, DoorDef, FloorStyle, HallDef, LampDef, MapDef, PropDef, PropKind, Rect, RoomDef, SensorDef, StationDef, VentDef } from '../map';
import type { StationKind } from '../types';

/**
 * A rectangle with stepped (45°) chamfered corners — octagons and cut-corner
 * rooms on the tile grid. `c` is the cut per corner: one number for all four
 * or [topLeft, topRight, bottomRight, bottomLeft]. Returns the full-width
 * middle band as `rect` (labels, lamps) and the stepped rows as `extra`.
 */
export function chamfer(x: number, y: number, w: number, h: number, c: number | [number, number, number, number]): { rect: Rect; extra: Rect[] } {
  const [tl, tr, br, bl] = typeof c === 'number' ? [c, c, c, c] : c;
  const top = Math.max(tl, tr);
  const bot = Math.max(bl, br);
  const extra: Rect[] = [];
  for (let i = 0; i < top; i++) {
    const l = Math.max(0, tl - i);
    const r = Math.max(0, tr - i);
    extra.push([x + l, y + i, w - l - r, 1]);
  }
  for (let j = 0; j < bot; j++) {
    const l = Math.max(0, bl - j);
    const r = Math.max(0, br - j);
    extra.push([x + l, y + h - 1 - j, w - l - r, 1]);
  }
  return { rect: [x, y + top, w, h - top - bot], extra };
}

export class MapBuilder {
  rooms: RoomDef[] = [];
  halls: HallDef[] = [];
  props: PropDef[] = [];
  stations: StationDef[] = [];
  vents: VentDef[] = [];
  doors: DoorDef[] = [];
  cameras: CameraDef[] = [];
  sensors: SensorDef[] = [];
  lamps: LampDef[] = [];
  private n = 0;

  room(id: string, name: string, shape: Rect | { rect: Rect; extra: Rect[] }, floor: FloorStyle, color: string, opts: Partial<RoomDef> = {}): this {
    const rect = Array.isArray(shape) ? shape : shape.rect;
    const extra = [...(Array.isArray(shape) ? [] : shape.extra), ...(opts.extra ?? [])];
    this.rooms.push({ id, name, rect, floor, color, ...opts, ...(extra.length ? { extra } : {}) });
    const [x, y, w, h] = rect;
    this.lamps.push({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) * 0.7, color });
    return this;
  }

  hall(rect: Rect, floor?: FloorStyle): this {
    this.halls.push({ rect, floor });
    return this;
  }

  /**
   * A winding corridor `w` tiles wide through axis-aligned legs. Each point is
   * the top-left of a w×w square; consecutive points share an x or a y.
   */
  path(w: number, pts: [number, number][], floor?: FloorStyle): this {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      if (x0 !== x1 && y0 !== y1) throw new Error(`path leg ${x0},${y0} -> ${x1},${y1} is not axis-aligned`);
      this.halls.push({ rect: [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + w, Math.abs(y1 - y0) + w], floor });
    }
    return this;
  }

  /** A connecting stub that is also a sabotage-able door for `room`. */
  door(room: string, rect: Rect, sensorName?: string): this {
    this.halls.push({ rect });
    this.doors.push({ id: `d${this.doors.length}`, room, rect });
    if (sensorName) this.sensors.push({ id: `s${this.sensors.length}`, name: sensorName, rect });
    return this;
  }

  prop(kind: PropKind, x: number, y: number, extra: Partial<PropDef> = {}): this {
    this.props.push({ kind, x, y, ...extra });
    return this;
  }

  /** A ring of meeting seats around a table (walkable, decorative). */
  seats(cx: number, cy: number, r: number, n: number, color?: string): this {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      this.props.push({ kind: 'seat', x: +(cx + Math.cos(a) * r).toFixed(2), y: +(cy + Math.sin(a) * r).toFixed(2), rot: a + Math.PI / 2, solid: false, ...(color ? { color } : {}) });
    }
    return this;
  }

  st(kind: StationKind, x: number, y: number, room: string): this {
    this.stations.push({ id: `${kind}-${++this.n}`, kind, x, y, room });
    return this;
  }

  vent(id: string, x: number, y: number, net: string, links: string[]): this {
    this.vents.push({ id, x, y, net, links });
    return this;
  }

  cam(x: number, y: number, name: string): this {
    this.cameras.push({ id: `c${this.cameras.length}`, x, y, name });
    return this;
  }

  lamp(x: number, y: number, r: number, color: string): this {
    this.lamps.push({ x, y, r, color });
    return this;
  }

  build(base: Omit<MapDef, 'rooms' | 'halls' | 'props' | 'stations' | 'vents' | 'doors' | 'cameras' | 'sensors' | 'lamps'>): MapDef {
    return {
      ...base,
      rooms: this.rooms,
      halls: this.halls,
      props: this.props,
      stations: this.stations,
      vents: this.vents,
      doors: this.doors,
      cameras: this.cameras,
      sensors: this.sensors,
      lamps: this.lamps,
    };
  }
}
