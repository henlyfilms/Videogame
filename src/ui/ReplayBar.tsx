import { REPLAY_RATES } from '../adapters/replay';
import { SCENARIOS } from '../adapters/scenarios';
import { manager } from '../game/runtime';
import { useGame } from '../store/gameStore';
import { Icon } from './Icon';

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function ReplayBar() {
  const replay = useGame((s) => s.replay);
  const setReplay = useGame((s) => s.setReplay);
  const r = manager.replay;
  if (!r) return null;
  const scenario = SCENARIOS.find((s) => s.id === replay.scenario) ?? SCENARIOS[0]!;
  return (
    <div className="hq-card pointer-events-auto flex w-full max-w-[640px] flex-wrap items-center gap-2 px-3 py-2" role="group" aria-label="Replay controls" onPointerDown={(e) => e.stopPropagation()}>
      <select
        className="hq-input w-auto max-w-[220px] py-1"
        value={replay.scenario}
        onChange={(e) => {
          setReplay({ scenario: e.target.value });
          r.setScenario(e.target.value);
        }}
        aria-label="Scenario"
        title={scenario.blurb}
      >
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      <button className="hq-btn h-7 w-7 p-0" onClick={() => r.setPlaying(!replay.playing)} aria-label={replay.playing ? 'Pause replay' : 'Play replay'}>
        <Icon name={replay.playing ? 'pause' : 'play'} size={12} />
      </button>
      <button className="hq-btn h-7 w-7 p-0" onClick={() => r.seek(0)} aria-label="Restart replay">
        <Icon name="restart" size={12} />
      </button>
      <input
        type="range"
        className="min-w-[120px] flex-1 accent-[rgb(var(--hq-accent))]"
        min={0}
        max={replay.duration || 1}
        step={100}
        value={replay.t}
        onChange={(e) => r.seek(Number(e.target.value))}
        aria-label="Scrub replay"
      />
      <span className="w-[76px] text-right font-mono text-[11px] tabular-nums text-muted">
        {fmt(replay.t)} / {fmt(replay.duration)}
      </span>
      <div className="flex items-center rounded-card border border-line p-0.5" role="radiogroup" aria-label="Replay rate">
        {REPLAY_RATES.map((rate) => (
          <button key={rate} role="radio" aria-checked={replay.rate === rate} className={`rounded-[8px] px-1.5 py-0.5 text-[11px] tabular-nums ${replay.rate === rate ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`} onClick={() => r.setRate(rate)}>
            {rate}×
          </button>
        ))}
      </div>
    </div>
  );
}
