// TEMPORARY STUB — replaced by the task mini-games branch on merge.
import { useEffect } from 'react';
export function TaskModal(p: { kind: string; seed: number; title?: string; step?: string; onComplete(): void; onClose(): void; reducedMotion?: boolean; fake?: boolean }) {
  useEffect(() => {
    const t = setTimeout(p.onComplete, 3000);
    return () => clearTimeout(t);
  }, [p.onComplete]);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 60 }}>
      <div className="mm-panel" style={{ padding: 24 }}>
        {p.title} {p.step} …<button className="mm-btn" onClick={p.onClose}>Close</button>
      </div>
    </div>
  );
}
