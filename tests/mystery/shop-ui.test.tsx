import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultCosmetics } from '../../src/mystery/characters/catalog';
import { BUNDLES, priceOf } from '../../src/mystery/characters/shop';
import { useMystery } from '../../src/mystery/client/store';
import { CustomizeEditor } from '../../src/mystery/ui/CustomizeEditor';
import { ShopPanel } from '../../src/mystery/ui/Shop';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});
async function mount(el: JSX.Element): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(el));
  return host;
}
const tab = (h: HTMLElement, name: string) => Array.from(h.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => t.textContent === name)!;

describe('wardrobe locks (jsdom)', () => {
  it('locked items show a price and hand over to the shop instead of equipping', async () => {
    const onChange = vi.fn();
    const onLocked = vi.fn();
    const h = await mount(<CustomizeEditor value={defaultCosmetics()} onChange={onChange} preview="2d" owned={[]} onLocked={onLocked} />);
    await act(async () => tab(h, 'Hat').click());
    const halo = h.querySelector('[data-item="halo"]') as HTMLButtonElement;
    expect(halo.classList.contains('locked')).toBe(true);
    expect(halo.getAttribute('aria-label')).toContain(`${priceOf('hat:halo')} Seeds`);
    await act(async () => halo.click());
    expect(onLocked).toHaveBeenCalledWith('hat:halo');
    expect(onChange).not.toHaveBeenCalled();
    // Free items still equip.
    await act(async () => (h.querySelector('[data-item="beanie"]') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('shop panel (jsdom)', () => {
  it('buys a bundle through the confirm step, spending Seeds and equipping it', async () => {
    const b = BUNDLES[0]!;
    useMystery.getState().setPrefs({ seeds: b.price + 7, owned: [], cosmetics: defaultCosmetics() });
    const h = await mount(<ShopPanel preview="2d" />);
    expect(h.querySelector(`[data-bundle="${b.id}"]`)?.getAttribute('aria-checked')).toBe('true');
    const buy = h.querySelector('.mmsh-purchase') as HTMLButtonElement;
    expect(buy.disabled).toBe(false);
    await act(async () => buy.click());
    const confirm = document.querySelector('.mmsh-confirm-buy') as HTMLButtonElement;
    expect(confirm).not.toBeNull();
    vi.useFakeTimers();
    await act(async () => {
      confirm.click();
      vi.advanceTimersByTime(400);
    });
    vi.useRealTimers();
    const p = useMystery.getState().prefs;
    expect(p.seeds).toBe(7);
    for (const k of b.items) expect(p.owned).toContain(k);
    expect(p.cosmetics.hat).toBe(b.items.find((k) => k.startsWith('hat:'))!.slice(4));
  });

  it('disables Purchase with a reason when short of Seeds', async () => {
    useMystery.getState().setPrefs({ seeds: 3, owned: [], cosmetics: defaultCosmetics() });
    const h = await mount(<ShopPanel preview="2d" />);
    await act(async () => tab(h, 'Hats').click());
    const buy = h.querySelector('.mmsh-purchase') as HTMLButtonElement;
    expect(buy.disabled).toBe(true);
    expect(h.querySelector('#mmsh-why')?.textContent).toMatch(/Need \d+ more Seeds/);
  });
});
