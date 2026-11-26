import { CORE_BOTS } from '../data/bots';

export function App() {
  return (
    <main className="flex h-full items-center justify-center">
      <div className="hq-card p-4 text-sm">Marion HQ — {CORE_BOTS.length} bots online</div>
    </main>
  );
}
