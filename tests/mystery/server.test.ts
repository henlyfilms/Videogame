// @vitest-environment node
/**
 * End-to-end WebSocket tests against the real Node server: create/join by
 * code, start with bots, receive snapshots, hidden-info filtering, malformed
 * frames, reconnect with the same seat.
 */
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../../server/index';

const PORT = 18000 + Math.floor(Math.random() * 1000);
let srv: ReturnType<typeof startServer>;

interface Client {
  ws: WebSocket;
  msgs: any[];
  send(m: unknown): void;
  wait(pred: (m: any) => boolean, ms?: number): Promise<any>;
}

function client(name: string): Promise<Client> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/mystery`);
    const msgs: any[] = [];
    const waiters: { pred: (m: any) => boolean; res: (m: any) => void }[] = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      msgs.push(m);
      for (const w of [...waiters]) if (w.pred(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.res(m);
      }
    });
    ws.on('error', rej);
    ws.on('open', () => {
      const c: Client = {
        ws,
        msgs,
        send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
        wait: (pred, ms = 8000) =>
          new Promise((r, j) => {
            const hit = msgs.find(pred);
            if (hit) return r(hit);
            const t = setTimeout(() => j(new Error('timeout waiting for message')), ms);
            waiters.push({ pred, res: (m) => (clearTimeout(t), r(m)) });
          }),
      };
      c.send({ t: 'hello', v: 1, name, platform: 'mac', kind: 'human' });
      res(c);
    });
  });
}

beforeAll(() => {
  srv = startServer(PORT, '127.0.0.1');
});
afterAll(async () => {
  await srv.close();
});

describe('Marion Mystery server', () => {
  it('serves health + LAN info', async () => {
    const h = await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).json();
    expect(h.ok).toBe(true);
    const info = await (await fetch(`http://127.0.0.1:${PORT}/api/info`)).json();
    expect(info.ws).toBe('/mystery');
  });

  it('creates a room, joins by code (case-insensitive), starts with bots and streams filtered snapshots', async () => {
    const a = await client('Alice');
    const b = await client('Bob');
    a.send({ t: 'create', settings: { bots: 6 } });
    const room = (await a.wait((m) => m.t === 'room')).room;
    expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
    b.send({ t: 'join', code: room.code.toLowerCase() });
    await b.wait((m) => m.t === 'room' && m.room.players.length === 2);
    a.send({ t: 'host.start' });
    const snap = (await b.wait((m) => m.t === 'snap' && m.s.phase === 'play', 15000)).s;
    expect(snap.players.length).toBe(8);
    // Hidden info: a crewmate never learns other players' roles.
    if (snap.you.team === 'crew') {
      for (const p of snap.players) if (p.id !== snap.you.id) expect(p.role === undefined || p.role === 'seeker' || p.role === 'mayor').toBe(true);
    }
    // Hidden info: positions are only sent for visible players.
    const withPos = snap.players.filter((p: any) => p.pos).length;
    expect(withPos).toBeGreaterThanOrEqual(1);
    a.ws.close();
    b.ws.close();
  }, 30000);

  it('rejects malformed frames and unknown codes without crashing', async () => {
    const c = await client('Mallory');
    c.send('not json');
    c.send({ t: 'act', action: { a: 'kill', target: 'nobody' } });
    c.send({ t: 'join', code: 'ZZZZZZ' });
    await c.wait((m) => m.t === 'error' && m.code === 'nojoin');
    expect(c.msgs.some((m) => m.t === 'error' && m.code === 'bad')).toBe(true);
    const h = await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).json();
    expect(h.ok).toBe(true);
    c.ws.close();
  });

  it('lets a disconnected player resume the same seat', async () => {
    const a = await client('Ana');
    a.send({ t: 'create' });
    const w = await a.wait((m) => m.t === 'welcome' && m.pid);
    const room = (await a.wait((m) => m.t === 'room')).room;
    const b = await client('Ben');
    b.send({ t: 'join', code: room.code });
    await a.wait((m) => m.t === 'room' && m.room.players.length === 2);
    a.ws.close();
    await new Promise((r) => setTimeout(r, 200));
    const a2 = await new Promise<Client>((res) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/mystery`);
      const msgs: any[] = [];
      ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'hello', v: 1, name: 'Ana', platform: 'mac', kind: 'human', resume: { code: room.code, pid: w.pid, secret: w.secret } }));
        res({ ws, msgs, send: (m) => ws.send(JSON.stringify(m)), wait: async () => null });
      });
    });
    await new Promise((r) => setTimeout(r, 400));
    const welcome = a2.msgs.find((m) => m.t === 'welcome');
    expect(welcome.pid).toBe(w.pid);
    const latest = a2.msgs.filter((m) => m.t === 'room').pop();
    expect(latest.room.players.length).toBe(2);
    a2.ws.close();
    b.ws.close();
  });
});
