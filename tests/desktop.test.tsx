import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanError, type MarionDesktop, type UpdateStatus } from '../src/desktop';
import { UpdateButton } from '../src/ui/UpdateButton';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STATUS: UpdateStatus = {
  available: true,
  current: { build: 4, source: 'builtin', commit: 'abcdef1234' },
  latest: { build: 7, tag: 'build-7', commit: 'fff', builtAt: null, notes: '', url: 'https://example.invalid', shellVersion: '1.0.0', size: 10 },
  shellVersion: '1.0.0',
  shellUpdate: false,
};

function mockBridge(status: UpdateStatus): MarionDesktop {
  return {
    platform: 'darwin',
    getInfo: vi.fn(async () => ({ shellVersion: '1.0.0', bundle: status.current, repo: 'x/y', releasesUrl: '', busy: false, lastCheck: status })),
    checkForUpdates: vi.fn(async () => status),
    updateAndRestart: vi.fn(async () => ({ ...status, installed: true })),
    restart: vi.fn(async () => undefined),
    openReleases: vi.fn(async () => undefined),
    onProgress: () => () => undefined,
    onStatus: () => () => undefined,
    onOpenRequest: () => () => undefined,
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<UpdateButton />));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  delete window.marionDesktop;
});

describe('desktop Update button', () => {
  it('is hidden in a normal browser', async () => {
    await mount();
    expect(host.innerHTML).toBe('');
  });

  it('shows an available update and installs + restarts on click', async () => {
    const bridge = mockBridge(STATUS);
    window.marionDesktop = bridge;
    await mount();
    const btn = host.querySelector<HTMLButtonElement>('[aria-label="Update available"]');
    expect(btn).not.toBeNull();
    await act(async () => btn!.click());
    expect(host.textContent).toContain('Build 4');
    expect(host.textContent).toContain('Build 7');
    const go = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Update & Restart'));
    expect(go).toBeDefined();
    await act(async () => go!.click());
    expect(bridge.updateAndRestart).toHaveBeenCalledWith({ force: false });
  });

  it('says up to date and still offers a restart', async () => {
    const bridge = mockBridge({ ...STATUS, available: false, latest: { ...STATUS.latest!, build: 4 } });
    window.marionDesktop = bridge;
    await mount();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Check for updates"]')!.click());
    expect(host.textContent).toContain("You're up to date");
    const restart = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Restart');
    await act(async () => restart!.click());
    expect(bridge.updateAndRestart).toHaveBeenCalledWith({ force: true });
  });

  it('strips Electron IPC error prefixes', () => {
    expect(cleanError(new Error("Error invoking remote method 'updater:update': Error: Download failed (500)"))).toBe('Download failed (500)');
  });
});
