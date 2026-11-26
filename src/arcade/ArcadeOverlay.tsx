/**
 * Full-screen host for Arcade games inside the HQ app. Marion Mystery is
 * lazy-loaded on first launch; the bridge that turns its matches into
 * `arcade.*` MarionEvents is only wired while the overlay is open.
 *
 * The HQ simulation keeps running underneath (bots walk to the Arcade while
 * you play), but the HQ canvas stops drawing until you come back.
 */
import { lazy, Suspense, useEffect } from 'react';
import { hq } from '../game/hq';
import { useArcade } from './state';

const MysteryApp = lazy(() => import('../mystery/ui/MysteryApp'));

function Loading() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white/80" style={{ background: 'radial-gradient(circle at 50% 40%, #2a0f3d, #070b18 70%)' }}>
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-400" aria-hidden />
      <span>Booting the cabinet…</span>
    </div>
  );
}

export function ArcadeOverlay() {
  const open = useArcade((s) => s.open);
  const seq = useArcade((s) => s.seq);
  const close = useArcade((s) => s.close);

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
      <Suspense fallback={<Loading />}>
        <MysteryApp onExit={close} />
      </Suspense>
    </div>
  );
}
