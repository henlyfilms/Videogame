import { useCallback, useEffect, useState } from 'react';
import { cleanError, getDesktop, type DesktopInfo, type MarionDesktop, type UpdateProgress, type UpdateStatus } from '../desktop';
import { Bar } from './common';
import { Icon } from './Icon';

/**
 * Top-bar "Update" button, shown only inside the Marion HQ Mac app.
 * Click → popover → "Update & Restart" pulls the latest build and relaunches.
 */
export function UpdateButton() {
  const desktop = getDesktop();
  if (!desktop) return null;
  return <UpdateButtonInner desktop={desktop} />;
}

function UpdateButtonInner({ desktop }: { desktop: MarionDesktop }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [progress, setProgress] = useState<UpdateProgress>({ phase: 'idle' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    desktop
      .getInfo()
      .then((i) => {
        if (!alive) return;
        setInfo(i);
        if (i.lastCheck) setStatus(i.lastCheck);
      })
      .catch(() => undefined);
    const offs = [
      desktop.onStatus((s) => setStatus(s)),
      desktop.onProgress((p) => {
        setProgress(p);
        if (p.phase === 'error' && p.message) setError(p.message);
      }),
      desktop.onOpenRequest(() => setOpen(true)),
    ];
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, [desktop]);

  const check = useCallback(async () => {
    setError(null);
    setProgress({ phase: 'checking' });
    try {
      setStatus(await desktop.checkForUpdates());
      setProgress({ phase: 'idle' });
    } catch (e) {
      setError(cleanError(e));
      setProgress({ phase: 'idle' });
    }
  }, [desktop]);

  const update = useCallback(
    async (force = false) => {
      setError(null);
      try {
        const s = await desktop.updateAndRestart({ force });
        setStatus(s);
      } catch (e) {
        setError(cleanError(e));
      }
    },
    [desktop],
  );

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && progress.phase === 'idle') void check();
  };

  const busy = progress.phase !== 'idle' && progress.phase !== 'error';
  const available = !!status?.available;
  const current = status?.current ?? info?.bundle ?? null;

  return (
    <>
      <button
        className={`hq-btn relative h-7 px-1.5 ${available ? 'border-accent text-accent' : ''}`}
        onClick={toggle}
        aria-label={available ? 'Update available' : 'Check for updates'}
        aria-expanded={open}
        title={available ? `Update to build ${status?.latest?.build}` : 'Check for updates'}
      >
        <Icon name="download" size={13} />
        <span className="hidden text-[11px] lg:inline">Update</span>
        {available && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />}
      </button>

      {open && (
        <div className="hq-card pointer-events-auto absolute right-3 top-14 z-30 w-[min(340px,calc(100vw-24px))] space-y-3 p-3" role="dialog" aria-label="Updates">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold">Marion HQ updates</h2>
            <button className="hq-btn h-6 w-6 p-0" onClick={() => setOpen(false)} aria-label="Close">
              <Icon name="close" size={12} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-card border border-line px-2.5 py-1.5">
              <div className="text-[10px] text-muted">Installed</div>
              <div className="font-semibold tabular-nums">{current ? (current.build ? `Build ${current.build}` : 'Local build') : '—'}</div>
            </div>
            <div className="rounded-card border border-line px-2.5 py-1.5">
              <div className="text-[10px] text-muted">Latest</div>
              <div className={`font-semibold tabular-nums ${available ? 'text-accent' : ''}`}>{status?.latest ? `Build ${status.latest.build}` : progress.phase === 'checking' ? '…' : '—'}</div>
            </div>
          </div>

          <StatusLine progress={progress} status={status} error={error} />

          {(progress.phase === 'downloading' || progress.phase === 'installing' || progress.phase === 'restarting') && <Bar value={progress.phase === 'downloading' ? progress.fraction ?? 0 : 1} />}

          <div className="flex flex-wrap gap-2">
            {available ? (
              <button className="hq-btn-primary flex-1 justify-center" disabled={busy} onClick={() => void update(false)}>
                <Icon name="download" size={12} /> Update &amp; Restart
              </button>
            ) : (
              <button className="hq-btn flex-1 justify-center" disabled={busy} onClick={() => void check()}>
                <Icon name="restart" size={12} /> Check again
              </button>
            )}
            <button className="hq-btn justify-center" disabled={busy} onClick={() => void update(true)} title="Pull the latest build (if any) and restart the app">
              Restart
            </button>
          </div>

          {status?.shellUpdate && (
            <p className="text-[11px] leading-snug text-muted">
              A new version of the Mac app itself is out.{' '}
              <button className="font-medium text-accent underline" onClick={() => void desktop.openReleases()}>
                Download it
              </button>{' '}
              and replace Marion HQ in Applications.
            </p>
          )}
          <p className="text-[10px] text-muted">
            App {info?.shellVersion ?? '—'}
            {current?.commit ? ` · ${current.commit.slice(0, 7)}` : ''}
            {current?.source === 'downloaded' ? ' · updated in-app' : ''}
          </p>
        </div>
      )}
    </>
  );
}

function StatusLine({ progress, status, error }: { progress: UpdateProgress; status: UpdateStatus | null; error: string | null }) {
  let text: string;
  let tone = 'text-muted';
  if (error) {
    text = error;
    tone = 'text-[#ef4444]';
  } else if (progress.phase === 'checking') text = 'Checking for updates…';
  else if (progress.phase === 'downloading') {
    const mb = (n?: number) => ((n ?? 0) / 1048576).toFixed(1);
    text = `Downloading… ${mb(progress.received)} / ${mb(progress.total)} MB`;
  } else if (progress.phase === 'installing') text = 'Installing…';
  else if (progress.phase === 'ready' || progress.phase === 'restarting') {
    text = 'Restarting with the new version…';
    tone = 'text-good';
  } else if (status?.available) {
    text = `Build ${status.latest?.build} is ready to install.`;
    tone = 'text-accent';
  } else if (status?.reason) text = status.reason;
  else if (status) {
    text = "You're up to date.";
    tone = 'text-good';
  } else text = 'Press “Check again” to look for updates.';
  return (
    <p className={`text-[11px] leading-snug ${tone}`} role="status" aria-live="polite">
      {text}
    </p>
  );
}
