import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';

const MysteryApp = lazy(() => import('./mystery/ui/MysteryApp'));

/** `/mystery`, `?mystery` or `#mystery` opens Marion Mystery directly (invite links / QR codes). */
function wantsMystery(): boolean {
  const { pathname, search, hash } = window.location;
  return pathname.startsWith('/mystery') || new URLSearchParams(search).has('mystery') || hash.startsWith('#mystery');
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    {wantsMystery() ? (
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#070b18' }} />}>
        <MysteryApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
