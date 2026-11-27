/**
 * Bridge to the Marion HQ Mac app (desktop/preload.cjs). In a normal browser
 * `window.marionDesktop` is undefined and every desktop feature hides itself.
 */

export interface BundleInfo {
  build: number;
  tag?: string | null;
  commit?: string | null;
  builtAt?: string | null;
  source?: 'builtin' | 'downloaded';
}

export interface LatestRelease {
  build: number;
  tag: string;
  commit: string | null;
  builtAt: string | null;
  notes: string;
  url: string;
  shellVersion: string | null;
  size: number;
}

export interface UpdateStatus {
  available: boolean;
  current: BundleInfo | null;
  latest: LatestRelease | null;
  shellVersion: string;
  shellUpdate?: boolean;
  skippedBroken?: boolean;
  reason?: string | null;
  installed?: boolean;
}

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'installing' | 'ready' | 'restarting' | 'error';

export interface UpdateProgress {
  phase: UpdatePhase;
  fraction?: number;
  received?: number;
  total?: number;
  message?: string;
}

export interface DesktopInfo {
  shellVersion: string;
  bundle: BundleInfo | null;
  repo: string;
  releasesUrl: string;
  busy: boolean;
  lastCheck: UpdateStatus | null;
}

export interface MarionDesktop {
  platform: string;
  getInfo(): Promise<DesktopInfo>;
  checkForUpdates(): Promise<UpdateStatus>;
  /** Installs the latest build if there is one, then relaunches. `force` relaunches even when up to date. */
  updateAndRestart(opts?: { force?: boolean }): Promise<UpdateStatus>;
  restart(): Promise<void>;
  openReleases(): Promise<void>;
  onProgress(cb: (p: UpdateProgress) => void): () => void;
  onStatus(cb: (s: UpdateStatus) => void): () => void;
  onOpenRequest(cb: () => void): () => void;
}

declare global {
  interface Window {
    marionDesktop?: MarionDesktop;
  }
}

export function getDesktop(): MarionDesktop | null {
  return typeof window !== 'undefined' && window.marionDesktop ? window.marionDesktop : null;
}

/** Electron prefixes IPC errors with "Error invoking remote method '…': Error: " — strip that. */
export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}
