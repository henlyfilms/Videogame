/**
 * Small helpers that keep map data files readable. The output is a plain
 * MapDef (JSON-compatible) — no behaviour lives here.
 */
import type { CameraDef, DoorDef, FloorStyle, HallDef, LampDef, MapDef, PropDef, PropKind, Rect, RoomDef, SensorDef, StationDef, VentDef } from '../map';
import type { StationKind } from '../types';

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

  room(id: string, name: string, rect: Rect, floor: FloorStyle, color: string, opts: Partial<RoomDef> = {}): this {
    this.rooms.push({ id, name, rect, floor, color, ...opts });
    const [x, y, w, h] = rect;
    this.lamps.push({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) * 0.7, color });
    return this;
  }

  hall(rect: Rect, floor?: FloorStyle): this {
    this.halls.push({ rect, floor });
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
