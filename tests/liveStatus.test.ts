import { afterEach, describe, expect, it } from 'vitest';
import { liveStatusBase, liveStatusFor, parseAgentsPayload, useLiveStatus } from '../src/agents/liveStatus';
import { defaultCosmetics } from '../src/mystery/characters/catalog';
import { buildFrame, playerStatus } from '../src/mystery/client/frame';
import { defaultPrefs } from '../src/mystery/client/prefs';
import { getMap } from '../src/mystery/core/maps';
import { defaultSettings } from '../src/mystery/core/settings';
import type { LobbyPlayer, RoomInfo } from '../src/mystery/net/protocol';
import { statusText } from '../src/mystery/render2d/prompts';

const loc = (href: string) => {
  const u = new URL(href);
  return { protocol: u.protocol, hostname: u.hostname, port: u.port, search: u.search, origin: u.origin };
};

describe('liveStatusBase', () => {
  it('follows the Mystery server URL rules', () => {
    expect(liveStatusBase(loc('http://localhost:5173/?mystery'))).toBe('http://localhost:8787');
    expect(liveStatusBase(loc('http://192.168.1.4:4173/'))).toBe('http://192.168.1.4:8787');
    expect(liveStatusBase(loc('https://marion.example.com/'))).toBe('https://marion.example.com');
    expect(liveStatusBase(loc('http://box.lan:8787/?mystery'))).toBe('http://box.lan:8787');
    expect(liveStatusBase({ protocol: 'app:', hostname: 'hq', port: '', search: '', origin: 'null' })).toBe('http://localhost:8787');
  });
  it('turns ?server= ws(s) URLs into http(s) origins', () => {
    expect(liveStatusBase(loc('http://localhost:5173/?server=ws://10.0.0.2:8787/mystery'))).toBe('http://10.0.0.2:8787');
    expect(liveStatusBase(loc('http://localhost:5173/?server=wss://play.example.com/mystery'))).toBe('https://play.example.com');
    expect(liveStatusBase(loc('http://localhost:5173/?server=not a url'))).toBeNull();
  });
});

describe('parseAgentsPayload', () => {
  it('keeps valid entries and drops malformed ones', () => {
    const out = parseAgentsPayload({
      agents: {
        kanye: { state: 'working', title: 'Refactoring billing export', detail: 'step 2', at: 5 },
        moose: { state: 'idle', title: '', at: 6 },
        bad1: { state: 'sleeping', title: 'x', at: 1 },
        bad2: { state: 'working', title: 42, at: 1 },
        bad3: { state: 'working', title: 'x'.repeat(201), at: 1 },
        bad4: null,
      },
    });
    expect(out).toEqual({ kanye: { state: 'working', title: 'Refactoring billing export', detail: 'step 2', at: 5 }, moose: { state: 'idle', title: '', at: 6 } });
  });
  it('rejects payloads that are not an agents map', () => {
    expect(parseAgentsPayload(null)).toBeNull();
    expect(parseAgentsPayload('hi')).toBeNull();
    expect(parseAgentsPayload({ agents: [] })).toBeNull();
    expect(parseAgentsPayload({})).toBeNull();
  });
});

describe('status in frames', () => {
  afterEach(() => useLiveStatus.setState({ agents: {}, online: false }));

  const seat = (over: Partial<LobbyPlayer>): LobbyPlayer => ({
    id: 'p1',
    name: 'Kanye',
    kind: 'bot',
    platform: 'bot',
    cosmetics: defaultCosmetics(),
    ready: true,
    connected: true,
    host: false,
    ping: 0,
    view: null,
    ...over,
  });

  it('playerStatus prefers the room status and falls back to the live board', () => {
    expect(playerStatus(undefined)).toBeNull();
    expect(playerStatus(seat({ look: 'kanye' }))).toBeNull();
    useLiveStatus.setState({ agents: { kanye: { state: 'working', title: 'Refactoring billing export', at: 1 } } });
    expect(liveStatusFor('kanye')?.title).toBe('Refactoring billing export');
    expect(playerStatus(seat({ look: 'kanye' }))).toEqual({ text: 'Refactoring billing export', busy: true });
    expect(playerStatus(seat({ look: 'kanye', status: { state: 'idle', title: '', at: 2 } }))).toEqual({ text: 'Idle', busy: false });
  });

  it('buildFrame puts the status on a lobby player', () => {
    const room: RoomInfo = {
      code: 'ABCD',
      hostId: 'p1',
      stage: 'lobby',
      countdownEnds: null,
      settings: defaultSettings(),
      players: [seat({ look: 'kanye', status: { state: 'working', title: 'Shipping the shop', at: 1 } })],
      validation: { ok: true, errors: [], warnings: [] } as unknown as RoomInfo['validation'],
      chat: [],
      now: 0,
      lan: false,
      practice: null,
    };
    const ctx = { use: null, kill: null, shoot: null, report: null, vent: null, inspect: null, near: null, highlight: new Set<string>() };
    const f = buildFrame({ map: getMap('lobby'), room, snap: null, pid: 'p1', prefs: defaultPrefs(), ctx, t: 0, zoom: 1 });
    expect(f.players[0]?.status).toEqual({ text: 'Shipping the shop', busy: true });
  });

  it('clips long lines with an ellipsis', () => {
    const t = statusText('a'.repeat(80));
    expect(t.length).toBe(34);
    expect(t.endsWith('…')).toBe(true);
  });
});
