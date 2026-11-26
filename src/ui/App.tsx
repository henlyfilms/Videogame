import { useCallback, useEffect, useState } from 'react';
import type { RoomId } from '../data/bots';
import type { HotspotAction } from '../engine/world';
import { actions } from '../game/actions';
import { hq } from '../game/hq';
import { populateSim, wire } from '../game/wire';
import { startPersistence, useGame } from '../store/gameStore';
import { GameCanvas } from './GameCanvas';
import { RoomPopover } from './RoomPopover';

export function App() {
  const selectedRoom = useGame((s) => s.selectedRoom);
  const selectRoom = useGame((s) => s.selectRoom);
  const selectBot = useGame((s) => s.selectBot);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    populateSim(hq);
    const unwire = wire(hq);
    const unpersist = startPersistence();
    return () => {
      unwire();
      unpersist();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const onRoom = useCallback(
    (id: RoomId | null) => {
      selectBot(null);
      selectRoom(id);
      if (id) hq.focusRoom(id);
    },
    [selectBot, selectRoom],
  );

  const onHotspot = useCallback(
    (room: RoomId, action: HotspotAction) => {
      const msg = actions.hotspot(room, action);
      if (msg) setToast(msg);
      onRoom(room);
    },
    [onRoom],
  );

  return (
    <main className="relative h-full w-full overflow-hidden">
      <GameCanvas
        onSelectBot={(id) => {
          selectRoom(null);
          selectBot(id);
          if (id) hq.focusBot(id);
        }}
        onSelectRoom={onRoom}
        onHotspot={onHotspot}
      />
      {selectedRoom && (
        <div className="pointer-events-none absolute bottom-3 right-3 top-16 flex items-start">
          <RoomPopover room={selectedRoom} onClose={() => onRoom(null)} />
        </div>
      )}
      {toast && (
        <div className="hq-card pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 text-xs" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
