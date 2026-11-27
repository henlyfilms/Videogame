// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GameServer } from '../../src/mystery/server/room';
import type { ServerMsg } from '../../src/mystery/net/protocol';

describe('freeplay practice rooms', () => {
  it('forces the practised role, keeps dummies still and never ends the match', () => {
    const srv = new GameServer({ seed: 3 });
    const msgs: ServerMsg[] = [];
    srv.connect({ id: 'me', send: (m) => msgs.push(m) });
    srv.receive('me', { t: 'hello', v: 1, name: 'Me', platform: 'mac', kind: 'human' });
    srv.receive('me', { t: 'create', settings: { map: 'manor' }, practice: { role: 'murderer' } });
    for (const look of ['daniel', 'moose', 'kanye']) srv.receive('me', { t: 'host.addBot', look });
    srv.receive('me', { t: 'host.start' });
    for (let i = 0; i < 30 * 12; i++) srv.update(1 / 30);
    const room = [...srv.rooms.values()][0]!;
    const st = room.match!;
    const me = Object.values(st.players).find((p) => p.kind === 'human')!;
    expect(st.practice).toBe(true);
    expect(me.role).toBe('murderer');
    const dummies = Object.values(st.players).filter((p) => p.kind === 'bot');
    const before = dummies.map((d) => ({ ...d.pos }));
    for (let i = 0; i < 30 * 5; i++) srv.update(1 / 30);
    dummies.forEach((d, i) => expect(d.pos).toEqual(before[i]));
    for (const d of dummies) d.alive = false; // even with every dummy gone…
    for (let i = 0; i < 30 * 3; i++) srv.update(1 / 30);
    expect(st.phase).toBe('play'); // …practice never ends on its own
    expect(msgs.some((m) => m.t === 'room' && m.room.practice === 'murderer')).toBe(true);
  });
});
