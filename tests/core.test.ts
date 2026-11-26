import { describe, expect, it } from 'vitest';
import { CORE_BOTS, makeCustomBot } from '../src/data/bots';
import { CORE_EVENT_TYPES, makeEvent, parseMarionEvent } from '../src/adapters/events';
import { THEMES, THEME_ORDER, applyThemeToDocument, hexToRgbTriplet, nextTheme } from '../src/theme/tokens';

describe('bot roster', () => {
  it('has the 8 core bots with exact names, roles and hotkeys', () => {
    expect(CORE_BOTS.map((b) => b.name)).toEqual([
      'Daniel',
      'Moose',
      'Kanye',
      'Barry',
      'Greek',
      'Quill',
      'Sift',
      'Bot Builder',
    ]);
    expect(CORE_BOTS.map((b) => b.role)).toEqual([
      'Chief Executor',
      'Co-Pilot',
      'Marion Agent',
      'Marion Life',
      'Marion Engine',
      'Email',
      'Sift Dev',
      'Foundry',
    ]);
    expect(CORE_BOTS.map((b) => b.hotkey)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('every bot glows and roles are at most 2 words', () => {
    for (const b of CORE_BOTS) {
      expect(b.glow).toBe(true);
      expect(b.role.split(' ').length).toBeLessThanOrEqual(2);
    }
  });

  it('stars Daniel and Bot Builder only, Daniel is white', () => {
    expect(CORE_BOTS.filter((b) => b.starred).map((b) => b.id)).toEqual(['daniel', 'builder']);
    expect(CORE_BOTS[0]?.color).toBe('#ffffff');
  });

  it('custom bots get a 1-word name and ≤2-word role', () => {
    const b = makeCustomBot({ id: 'c1', name: 'Pixel Pusher', job: 'Ships release notes weekly', shape: 'gem', color: '#000', glowColor: '#fff' });
    expect(b.name).toBe('Pixel');
    expect(b.role).toBe('Ships release');
    expect(b.glow).toBe(true);
    expect(b.custom).toBe(true);
  });
});

describe('themes', () => {
  it('cycles light → soft → dark', () => {
    expect(THEME_ORDER).toEqual(['light', 'soft', 'dark']);
    expect(nextTheme('light')).toBe('soft');
    expect(nextTheme('dark')).toBe('light');
  });
  it('uses cobalt accents', () => {
    expect(THEMES.light.accent).toBe('#2f6fed');
    expect(THEMES.dark.accent).toBe('#6ea1ff');
  });
  it('writes CSS variables', () => {
    applyThemeToDocument('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--hq-accent')).toBe(hexToRgbTriplet('#6ea1ff'));
  });
});

describe('MarionEvent schema', () => {
  it('declares the 13 core event types', () => {
    expect(CORE_EVENT_TYPES).toHaveLength(13);
  });
  it('round-trips a valid event', () => {
    const ev = makeEvent('bot.status', { botId: 'kanye', status: 'working' });
    expect(parseMarionEvent(JSON.stringify(ev))).toEqual(ev);
  });
  it('rejects bad types, bad enums and missing fields', () => {
    expect(parseMarionEvent({ type: 'nope', payload: {} })).toBeNull();
    expect(parseMarionEvent({ type: 'bot.status', payload: { botId: 'x', status: 'dancing' } })).toBeNull();
    expect(parseMarionEvent({ type: 'bot.message', payload: { botId: 'x' } })).toBeNull();
    expect(parseMarionEvent('{not json')).toBeNull();
    expect(parseMarionEvent(null)).toBeNull();
  });
  it('fills id/ts and strips unknown payload keys', () => {
    const ev = parseMarionEvent({ type: 'group.huddle_end', payload: { huddleId: 'h1', evil: true } });
    expect(ev?.id).toBeTruthy();
    expect(ev?.payload).toEqual({ huddleId: 'h1' });
  });
});
