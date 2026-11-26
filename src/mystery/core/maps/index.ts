import { compileMap, type CompiledMap, type MapDef } from '../map';
import type { MapId } from '../types';
import { HQ_MAP } from './hq';
import { LOBBY_MAP } from './lobby';

/** Registry of playable maps. Other maps register here when added. */
export const MAP_DEFS: Partial<Record<MapId, MapDef>> = { hq: HQ_MAP };

export const MAP_ORDER: MapId[] = ['hq', 'greenhouse', 'express', 'manor'];

const cache = new Map<string, CompiledMap>();

export function getMap(id: MapId | 'lobby'): CompiledMap {
  let m = cache.get(id);
  if (!m) {
    const def = id === 'lobby' ? LOBBY_MAP : MAP_DEFS[id] ?? HQ_MAP;
    m = compileMap(def);
    cache.set(id, m);
  }
  return m;
}

export function availableMaps(): MapDef[] {
  return MAP_ORDER.map((id) => MAP_DEFS[id]).filter((d): d is MapDef => !!d);
}

export { HQ_MAP, LOBBY_MAP };
