import { useEffect } from 'react';
import { CORE_BOTS } from '../data/bots';
import { hq } from '../game/hq';
import { GameCanvas } from './GameCanvas';

export function App() {
  useEffect(() => {
    for (const b of CORE_BOTS) hq.sim.addBot(b);
  }, []);
  return (
    <main className="relative h-full w-full">
      <GameCanvas
        onSelectBot={(id) => id && hq.focusBot(id)}
        onSelectRoom={(id) => (id ? hq.focusRoom(id) : hq.overview())}
        onHotspot={(room) => hq.focusRoom(room)}
      />
    </main>
  );
}
