/**
 * Full-screen host for Arcade games inside the HQ app. Marion Mystery is
 * lazy-loaded on first launch; the bridge that turns its matches into
 * `arcade.*` MarionEvents is only wired while the overlay is open.
 *
 * The HQ simulation keeps running underneath (bots walk to the Arcade while
 * you play), but the HQ canvas stops drawing until you come back.
 */
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { hq } from '../game/hq';
import { useArcade } from './state';

const loadMystery = () => lazy(() => import('../mystery/ui/MysteryApp'));
let MysteryApp = loadMystery();

function Loading() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white/80" style={{ background: 'radial-gradient(circle at 50% 40%, #2a0f3d, #070b18 70%)' }}>
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-400" aria-hidden />
      <span>Booting the cabinet…</span>
    </div>
  );
}

/**
 * Keeps a failed cabinet load (offline, or a stale chunk after a deploy) from
 * blanking the whole HQ: shows a retry / back card instead.
 */
class CabinetBoundary extends Component<{ onExit: () => void; onRetry: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(err: unknown): void {
    console.warn('[arcade] the game failed to load', err);
  }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="hq-anim-fade absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/85" style={{ background: 'radial-gradient(circle at 50% 40%, #2a0f3d, #070b18 70%)' }} role="alert">
        <span className="text-3xl" aria-hidden>
          🕹️
        </span>
        <b className="text-base text-white">The cabinet didn’t boot</b>
        <span className="max-w-[320px] text-white/70">Marion Mystery couldn’t load. Check your connection and try again.</span>
        <div className="mt-1 flex gap-2">
          <button className="hq-btn-primary px-4" onClick={this.props.onRetry}>
            Try again
          </button>
          <button className="hq-btn px-4" onClick={this.props.onExit} aria-label="Back to Marion HQ">
            Back to HQ
          </button>
        </div>
      </div>
    );
  }
}

export function ArcadeOverlay() {
  const open = useArcade((s) => s.open);
  const seq = useArcade((s) => s.seq);
  const close = useArcade((s) => s.close);
  const [attempt, setAttempt] = useState(0);

  // Bridge + launch intent, bound to this open session.
  useEffect(() => {
    if (!open) return;
    const stops: (() => void)[] = [];
    let cancelled = false;
    import('./bridge')
      .then((m) => {
        if (cancelled) return;
        stops.push(m.startArcadeBridge((ev) => hq.publish(ev)));
        stops.push(m.runIntent(useArcade.getState().intent));
      })
      .catch((err) => console.warn('[arcade] bridge unavailable', err));
    return () => {
      cancelled = true;
      stops.forEach((s) => s());
    };
  }, [open, seq]);

  // The HQ keeps simulating underneath but stops painting (and its keys stay off).
  useEffect(() => {
    if (!open) return;
    hq.renderSuspended = true;
    hq.keys.clear();
    return () => {
      hq.renderSuspended = false;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Marion Mystery" data-arcade-overlay="">
      <CabinetBoundary
        key={attempt}
        onExit={close}
        onRetry={() => {
          MysteryApp = loadMystery();
          setAttempt((n) => n + 1);
        }}
      >
        <Suspense fallback={<Loading />}>
          <MysteryApp onExit={close} />
        </Suspense>
      </CabinetBoundary>
    </div>
  );
}
