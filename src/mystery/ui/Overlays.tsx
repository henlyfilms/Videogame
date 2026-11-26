/**
 * Cinematic overlays: role reveal, meeting splash + voting table, ejection
 * sequences (per-map style) and the results screen. All have reduced-motion
 * fallbacks; 3D players get the same moments framed for their view.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { drawBerry, drawBody } from '../characters/draw2d';
import { getMap } from '../core/maps';
import { MODES } from '../core/modes';
import type { EjectStyle } from '../core/map';
import type { Snapshot } from '../core/project';
import { QUICK_CHAT } from '../core/quickchat';
import { ROLES } from '../core/roles';
import type { Settings } from '../core/settings';
import type { Cosmetics, RoleId } from '../core/types';
import { filterProfanity } from '../client/prefs';
import { useMystery } from '../client/store';
import { BerryAvatar, Bar, colorHex, fmtTime, MIcon, teamColors } from './common';
import { MapThumb } from './MapThumb';

const ROLE_POSE: Partial<Record<RoleId, string>> = {
  murderer: 'knife-twirl',
  sheriff: 'gun-spin',
  detective: 'magnify',
  seeker: 'knife-twirl',
  jester: 'laugh',
  mayor: 'wave',
  medic: 'cheer',
};

export function RoleReveal({ snap }: { snap: Snapshot }) {
  const prefs = useMystery((s) => s.prefs);
  const tc = teamColors(prefs.colorblind !== 'none');
  const you = snap.you;
  const role = ROLES[you.role];
  const me = snap.players.find((p) => p.id === you.id)!;
  const mates = snap.players.filter((p) => p.id !== you.id && p.role && ROLES[p.role].team === 'murderers' && you.team === 'murderers');
  const seekers = snap.players.filter((p) => p.role === 'seeker' && p.id !== you.id);
  const teamCol = tc[role.team];
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), prefs.reducedMotion ? 0 : 900);
    const t2 = setTimeout(() => setStage(2), prefs.reducedMotion ? 0 : 1700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [prefs.reducedMotion]);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 50% 55%, ${teamCol}${stage ? '44' : '00'}, #03050e 70%)`, transition: 'background 0.8s', overflow: 'hidden' }}>
      {stage === 0 && (
        <div className="mm-anim-fade" style={{ fontSize: 'clamp(28px, 6vw, 54px)', fontWeight: 900, letterSpacing: '0.3em', color: '#c7d2fe' }}>
          SHHH…
        </div>
      )}
      {stage >= 1 && (
        <>
          {!prefs.reducedMotion && (
            <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: '30%', background: `linear-gradient(90deg, transparent, ${teamCol}55, transparent)`, animation: 'mm-sweep 1.2s ease-out both' }} />
          )}
          <div style={{ textAlign: 'center', zIndex: 1, padding: 16 }}>
            <div className="mm-anim-rise" style={{ fontWeight: 800, letterSpacing: '0.25em', color: teamCol, fontSize: '0.9em' }}>
              YOU ARE {role.team === 'murderers' ? 'ON THE MURDERER TEAM' : role.team === 'neutral' ? 'NEUTRAL' : 'CREW'}
            </div>
            <div className="mm-title mm-anim-pop" style={{ fontSize: 'clamp(48px, 12vw, 110px)', lineHeight: 1, margin: '6px 0', background: `linear-gradient(180deg, #fff 10%, ${role.color})`, WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
              {role.name}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12, margin: '10px 0' }}>
              {mates.map((m) => (
                <div key={m.id} className="mm-anim-rise" style={{ textAlign: 'center', animationDelay: '300ms' }}>
                  <BerryAvatar cosmetics={m.cosmetics} size={90} dir={1} emote="knife-twirl" />
                  <div style={{ color: tc.murderers, fontWeight: 700 }}>{m.name}</div>
                </div>
              ))}
              <div className="mm-anim-pop" style={{ textAlign: 'center' }}>
                <BerryAvatar cosmetics={me.cosmetics} size={170} emote={ROLE_POSE[you.role] ?? 'wave'} />
                <div style={{ fontWeight: 800 }}>{me.name}</div>
              </div>
            </div>
            {stage >= 2 && (
              <div className="mm-anim-rise">
                <div style={{ fontSize: '1.15em', fontWeight: 700, maxWidth: 520, margin: '0 auto 10px' }}>{role.blurb}</div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {role.abilities.map((a) => (
                    <span key={a} className="mm-chip" style={{ borderColor: role.color + '88', color: '#fff' }}>
                      {a}
                    </span>
                  ))}
                </div>
                {seekers.length > 0 && <div style={{ marginTop: 10, color: tc.murderers }}>Seeker: {seekers.map((s) => s.name).join(', ')} — hide!</div>}
                <div className="mm-muted" style={{ marginTop: 14 }}>
                  {MODES[snap.mode].name} · {MODES[snap.mode].tagline}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meeting

export function MeetingOverlay({ snap, settings }: { snap: Snapshot; settings: Settings }) {
  const m = snap.meeting!;
  const prefs = useMystery((s) => s.prefs);
  const chat = useMystery((s) => s.chat);
  const act = useMystery((s) => s.act);
  const tc = teamColors(prefs.colorblind !== 'none');
  const [splash, setSplash] = useState(true);
  const [text, setText] = useState('');
  const [quickTarget, setQuickTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [, tick] = useState(0);
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), prefs.reducedMotion ? 600 : 2600);
    const i = setInterval(() => tick((x) => x + 1), 250);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [prefs.reducedMotion]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [chat.length]);
  const caller = snap.players.find((p) => p.id === m.callerId);
  const victim = m.victimId ? snap.players.find((p) => p.id === m.victimId) : null;
  const you = snap.you;
  const left = Math.max(0, m.stageEnds - snap.t);
  const canVote = you.alive && m.stage === 'vote' && !m.myVote;
  if (splash)
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', background: m.victimId ? 'radial-gradient(circle, #7f1d1d, #120306 70%)' : 'radial-gradient(circle, #1e3a8a, #030615 70%)', overflow: 'hidden', animation: prefs.reducedMotion ? undefined : 'mm-shake 0.45s 2' }}>
        {!prefs.reducedMotion &&
          [0, 1, 2].map((i) => (
            <div key={i} aria-hidden style={{ position: 'absolute', width: '160vmax', height: 40, background: m.victimId ? 'rgba(255,77,94,0.18)' : 'rgba(110,161,255,0.18)', transform: `rotate(${-12 + i * 12}deg)`, animation: `mm-sweep ${0.9 + i * 0.2}s linear infinite` }} />
          ))}
        <div className="mm-anim-pop" style={{ textAlign: 'center', zIndex: 1 }}>
          <div className="mm-title" style={{ fontSize: 'clamp(40px, 10vw, 96px)', background: m.victimId ? 'linear-gradient(180deg,#fff,#ff4d5e)' : 'linear-gradient(180deg,#fff,#6ea1ff)', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
            {m.victimId ? 'BODY REPORTED' : 'EMERGENCY MEETING'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 24, marginTop: 12 }}>
            {caller && (
              <div>
                <BerryAvatar cosmetics={caller.cosmetics} size={150} emote="point" />
                <div style={{ fontWeight: 800 }}>{caller.name}</div>
              </div>
            )}
            {victim && <BodyPortrait cosmetics={victim.cosmetics} size={150} />}
          </div>
        </div>
      </div>
    );
  return (
    <div className="mm-safe mm-anim-fade" style={{ position: 'absolute', inset: 0, zIndex: 45, background: 'radial-gradient(circle at 50% 0%, #1b2a5c, #050813 75%)', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontWeight: 900, flex: 1 }}>{m.victimId ? `Who did this to ${victim?.name ?? 'them'}?` : 'Emergency meeting'}</h2>
        <span className="mm-chip" style={{ fontSize: '1em', color: '#fff' }}>
          {m.stage === 'discuss' ? 'Discuss' : m.stage === 'vote' ? 'Vote!' : 'Results'} · {fmtTime(left)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0, flexWrap: 'wrap' }}>
        {/* Ballot */}
        <div className="mm-scroll" style={{ flex: '2 1 420px', minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, alignContent: 'start' }}>
          {snap.players.map((p) => {
            const voters = m.votes ? Object.entries(m.votes).filter(([, t]) => t === p.id).map(([v]) => v) : [];
            const tally = m.tally?.[p.id] ?? 0;
            const isSel = selected === p.id;
            return (
              <button
                key={p.id}
                className="mm-btn mm-anim-rise"
                disabled={!canVote || !p.alive}
                onClick={() => setSelected(isSel ? null : p.id)}
                style={{
                  justifyContent: 'flex-start',
                  padding: 8,
                  minHeight: 64,
                  position: 'relative',
                  opacity: p.alive ? 1 : 0.45,
                  borderColor: isSel ? '#fde047' : m.myVote === p.id ? 'var(--mm-accent2)' : undefined,
                  background: p.id === you.id ? 'rgba(47,111,237,0.2)' : undefined,
                }}
                aria-label={`Vote ${p.name}`}
              >
                <BerryAvatar cosmetics={p.cosmetics} size={48} animate={false} ghost={!p.alive} />
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                  <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{p.name}</span>
                  <span className="mm-muted" style={{ fontSize: '0.75em', fontWeight: 600 }}>
                    {!p.alive ? '✝ dead' : p.role ? <span style={{ color: ROLES[p.role].color }}>{ROLES[p.role].name}</span> : p.revealedMayor ? 'Mayor' : ''}
                    {p.id === m.callerId ? ' 📣' : ''}
                  </span>
                </span>
                {p.voted && m.stage !== 'reveal' && (
                  <span className="mm-anim-pop" style={{ position: 'absolute', top: 4, right: 6, fontSize: 10, fontWeight: 900, color: '#fde047', transform: 'rotate(8deg)', border: '2px solid #fde047', borderRadius: 6, padding: '0 4px' }}>
                    VOTED
                  </span>
                )}
                {m.stage === 'reveal' && (
                  <span style={{ position: 'absolute', bottom: 4, right: 6, display: 'flex', gap: 2, flexWrap: 'wrap', maxWidth: 80, justifyContent: 'flex-end' }}>
                    {(voters.length ? voters : Array.from({ length: tally }, (_, i) => `?${i}`)).map((v, i) => {
                      const vp = snap.players.find((x) => x.id === v);
                      return (
                        <span key={v} className="mm-anim-pop" title={vp?.name} style={{ width: 14, height: 14, borderRadius: '50%', background: vp ? colorHex(vp.cosmetics.color) : '#cbd5e1', border: '2px solid #fff', animationDelay: `${i * 160}ms` }} />
                      );
                    })}
                  </span>
                )}
              </button>
            );
          })}
          {/* Skip */}
          {settings.allowSkip && (
            <button className="mm-btn" disabled={!canVote} onClick={() => setSelected(selected === 'skip' ? null : 'skip')} style={{ minHeight: 64, borderColor: selected === 'skip' ? '#fde047' : undefined }}>
              <MIcon name="skip" /> Skip vote
              {m.stage === 'reveal' && m.tally?.skip ? <b> · {m.tally.skip}</b> : null}
            </button>
          )}
          {canVote && selected && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button
                className="mm-btn mm-btn-gold mm-anim-pop"
                style={{ flex: 1, minHeight: 54, fontSize: '1.05em' }}
                onClick={() => {
                  act({ a: 'vote', target: selected });
                  setSelected(null);
                }}
              >
                🔨 Stamp vote: {selected === 'skip' ? 'Skip' : snap.players.find((p) => p.id === selected)?.name}
              </button>
            </div>
          )}
          {you.role === 'mayor' && settings.mayorReveal && !you.mayorRevealed && you.alive && (
            <button className="mm-btn" style={{ gridColumn: '1 / -1' }} onClick={() => act({ a: 'mayor.reveal' })}>
              <MIcon name="crown" /> Reveal yourself as Mayor (+1 vote)
            </button>
          )}
          {m.stage === 'discuss' && <div className="mm-muted" style={{ gridColumn: '1 / -1' }}>Voting opens in {fmtTime(left)} — talk it out!</div>}
        </div>
        {/* Chat */}
        <div className="mm-panel" style={{ flex: '1 1 280px', minHeight: 220, display: 'flex', flexDirection: 'column', padding: 10 }}>
          <div className="mm-scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }} aria-live="polite">
            {chat.map((c) => {
              const who = snap.players.find((p) => p.id === c.from);
              const sys = c.from === 'system';
              return (
                <div key={c.id} className="mm-anim-rise" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', opacity: c.ghost ? 0.7 : 1 }}>
                  {who && <BerryAvatar cosmetics={who.cosmetics} size={28} animate={false} ghost={c.ghost} />}
                  <div style={{ background: sys ? 'transparent' : 'rgba(255,255,255,0.07)', padding: sys ? 0 : '5px 9px', borderRadius: 10, fontSize: '0.9em', color: sys ? 'var(--mm-muted)' : undefined }}>
                    {who && <b style={{ color: colorHex(who.cosmetics.color) }}>{who.name}{c.ghost ? ' 👻' : ''} </b>}
                    {prefs.profanityFilter ? filterProfanity(c.text) : c.text}
                  </div>
                </div>
              );
            })}
            <div ref={chatEnd} />
          </div>
          {settings.quickChat && (you.alive || settings.ghostChat) && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                <select className="mm-input" style={{ minHeight: 34, padding: '4px 8px', flex: '1 1 120px' }} value={quickTarget ?? ''} onChange={(e) => setQuickTarget(e.target.value || null)} aria-label="Quick chat target">
                  <option value="">About…</option>
                  {snap.players
                    .filter((p) => p.id !== you.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {QUICK_CHAT.filter((q) => (q.target ? !!quickTarget : true)).slice(0, 12).map((q) => (
                  <button key={q.id} className="mm-btn" style={{ minHeight: 32, padding: '2px 8px', fontSize: '0.75em' }} onClick={() => act({ a: 'quick', id: q.id, target: quickTarget ?? undefined })}>
                    {q.text.replace('{p}', snap.players.find((p) => p.id === quickTarget)?.name ?? '…')}
                  </button>
                ))}
              </div>
            </div>
          )}
          {settings.chat && (you.alive || settings.ghostChat) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) act({ a: 'chat', text: text.trim() });
                setText('');
              }}
              style={{ display: 'flex', gap: 6, marginTop: 6 }}
            >
              <input className="mm-input" style={{ minHeight: 40 }} value={text} maxLength={160} onChange={(e) => setText(e.target.value)} placeholder={you.alive ? 'Make your case…' : 'Ghost chat…'} aria-label="Meeting chat" />
              <button className="mm-btn mm-btn-primary" style={{ minHeight: 40 }} type="submit" aria-label="Send">
                <MIcon name="chat" size={18} />
              </button>
            </form>
          )}
          <div style={{ fontSize: '0.7em', color: tc.good, marginTop: 4 }} className="mm-muted">
            {you.alive ? (m.myVote ? '✓ You voted' : m.stage === 'vote' ? 'Pick someone, then stamp your vote' : '') : 'Ghosts can’t vote'}
          </div>
        </div>
      </div>
    </div>
  );
}

function BodyPortrait({ cosmetics, size }: { cosmetics: Cosmetics; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBody(g, cosmetics, size / 2, size * 0.75, size / 50, 0);
  }, [cosmetics, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-label="Body" />;
}

// ---------------------------------------------------------------------------
// Ejection

const EJECT_SCENE: Record<EjectStyle, { sky: [string, string]; label: string }> = {
  tube: { sky: ['#0b1238', '#1e3a8a'], label: 'shot out of the pneumatic tube' },
  airlock: { sky: ['#020617', '#0f172a'], label: 'sent out the airlock' },
  caboose: { sky: ['#1e293b', '#94a3b8'], label: 'tossed off the caboose' },
  trapdoor: { sky: ['#1c0f1f', '#3b1d36'], label: 'dropped through the trapdoor' },
  chute: { sky: ['#0b1238', '#334155'], label: 'sent down the chute' },
};

export function EjectOverlay({ snap, settings }: { snap: Snapshot; settings: Settings }) {
  const e = snap.eject!;
  const prefs = useMystery((s) => s.prefs);
  const map = getMap(snap.map);
  const style = map.def.eject;
  const scene = EJECT_SCENE[style];
  const ejected = e.ejectedId ? snap.players.find((p) => p.id === e.ejectedId) : null;
  const ref = useRef<HTMLCanvasElement>(null);
  const [typed, setTyped] = useState('');
  const msg = useMemo(() => {
    if (!ejected) return e.tie ? 'No one was ejected. (Tie)' : 'No one was ejected. (Skipped)';
    if (!settings.confirmEjects || !e.role) return `${ejected.name} was ejected.`;
    const r = ROLES[e.role as RoleId];
    if (e.role === 'jester') return `${ejected.name} was the Jester… and that’s exactly what they wanted.`;
    return r.team === 'murderers' ? `${ejected.name} was ${r.name === 'Murderer' ? 'a Murderer' : `the ${r.name}`}.` : `${ejected.name} was not a Murderer.`;
  }, [ejected, e, settings.confirmEjects]);
  const remaining = settings.confirmEjects ? snap.stats.murderers?.murderersAlive ?? null : null;
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i++;
      setTyped(msg.slice(0, i));
      if (i >= msg.length) clearInterval(t);
    }, prefs.reducedMotion ? 1 : 45);
    return () => clearInterval(t);
  }, [msg, prefs.reducedMotion]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    let raf = 0;
    const t0 = performance.now();
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 2 + 0.5, v: Math.random() * 0.3 + 0.1 }));
    const draw = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = (performance.now() - t0) / 1000;
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, scene.sky[0]);
      sky.addColorStop(1, scene.sky[1]);
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // Moving backdrop per style.
      for (const s of stars) {
        const speed = style === 'caboose' ? 0.6 : style === 'trapdoor' ? 0 : 0.08;
        const x = (((s.x - t * s.v * speed) % 1) + 1) % 1;
        const y = style === 'trapdoor' ? (((s.y - t * s.v * 0.6) % 1) + 1) % 1 : s.y;
        g.fillStyle = style === 'caboose' ? 'rgba(255,255,255,0.85)' : `rgba(255,255,255,${0.3 + s.s * 0.2})`;
        g.beginPath();
        g.arc(x * w, y * h, style === 'caboose' ? s.s * 1.5 : s.s, 0, Math.PI * 2);
        g.fill();
      }
      if (style === 'caboose') {
        g.fillStyle = '#e2e8f0';
        g.fillRect(0, h * 0.82, w, h * 0.18);
        g.fillStyle = '#475569';
        for (let i = 0; i < 20; i++) g.fillRect(((i * 80 - t * 400) % (w + 80)) + w, h * 0.86, 40, 6);
      }
      if (ejected) {
        const k = Math.min(1, t / 4.5);
        let x = w * 0.5;
        let y = h * 0.45;
        let rot = 0;
        if (style === 'tube' || style === 'chute') {
          x = -60 + k * (w + 120);
          y = h * 0.45 + Math.sin(t * 3) * 20;
          rot = t * 4;
        } else if (style === 'airlock') {
          x = -60 + k * (w + 120);
          y = h * 0.4 + Math.sin(t) * 30;
          rot = t * 1.2;
        } else if (style === 'caboose') {
          x = w * 0.75 - k * w * 0.9;
          y = h * 0.78 - Math.sin(k * Math.PI) * h * 0.35;
          rot = -t * 5;
        } else {
          x = w * 0.5;
          y = -40 + k * (h + 80);
          rot = Math.sin(t * 6) * 0.4;
        }
        g.save();
        g.translate(x, y);
        g.rotate(rot);
        try {
          drawBerry(g, ejected.cosmetics, 0, 30, Math.min(w, h) / 360, { time: t, moving: true, dir: 1, scared: true });
        } catch {
          /* ignore */
        }
        g.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [ejected, scene, style]);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 46 }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '18%', textAlign: 'center', padding: 16 }}>
        <div style={{ fontSize: 'clamp(22px, 4.5vw, 40px)', fontWeight: 850, textShadow: '0 4px 20px rgba(0,0,0,0.6)' }} aria-live="polite">
          {typed}
          <span style={{ opacity: typed.length < msg.length ? 1 : 0 }}>▌</span>
        </div>
        {ejected && <div className="mm-muted" style={{ marginTop: 4 }}>{ejected.name} was {scene.label}.</div>}
        {remaining !== null && typed.length >= msg.length && (
          <div className="mm-anim-rise" style={{ marginTop: 8, fontWeight: 700 }}>
            {remaining} murderer{remaining === 1 ? '' : 's'} remain{remaining === 1 ? 's' : ''}.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results

const REASON: Record<string, string> = {
  tasks: 'The crew finished every task!',
  'murderers-eliminated': 'Every murderer was caught.',
  parity: 'The murderers outnumbered the crew.',
  critical: 'The critical sabotage wasn’t fixed in time.',
  timer: 'Time ran out.',
  jester: 'The Jester got themselves voted out!',
  'hiders-survived': 'The hiders outlasted the clock!',
  'all-found': 'Every hider was found.',
  abandoned: 'The other side left the match.',
};

export function ResultsScreen({ snap }: { snap: Snapshot }) {
  const res = snap.result!;
  const prefs = useMystery((s) => s.prefs);
  const room = useMystery((s) => s.room)!;
  const pid = useMystery((s) => s.pid);
  const send = useMystery((s) => s.send);
  const leave = useMystery((s) => s.leave);
  const tc = teamColors(prefs.colorblind !== 'none');
  const won = res.winners.includes(pid);
  const [tab, setTab] = useState<'summary' | 'timeline' | 'heatmap'>('summary');
  const [heatFor, setHeatFor] = useState<string>(pid);
  const isHost = room.hostId === pid;
  const winners = snap.players.filter((p) => res.winners.includes(p.id));
  const map = getMap(snap.map);
  const title =
    res.winningTeam === 'draw'
      ? 'Draw!'
      : res.winningTeam === 'crew'
        ? snap.mode === 'hideseek'
          ? 'Hiders win!'
          : 'Crew wins!'
        : res.winningTeam === 'murderers'
          ? snap.mode === 'hideseek'
            ? 'Seekers win!'
            : 'Murderers win!'
          : 'Jester wins!';
  const col = res.winningTeam === 'murderers' ? tc.murderers : res.winningTeam === 'crew' ? tc.crew : tc.neutral;
  const confetti = useMemo(() => Array.from({ length: prefs.reducedMotion ? 0 : 60 }, (_, i) => ({ i, x: Math.random() * 100, d: Math.random() * 2, c: ['#fbbf24', '#2f6fed', '#2dd4bf', '#ec4899', '#a78bfa'][i % 5] })), [prefs.reducedMotion]);
  const nameOf = (id?: string) => snap.players.find((p) => p.id === id)?.name ?? '—';
  const heat = res.heat?.[heatFor] ?? [];
  const heatMarkers = useMemo(() => heat.map((c) => ({ pos: { x: (c % 1000) * 2 + 1, y: Math.floor(c / 1000) * 2 + 1 }, color: 'rgba(255,120,60,0.35)', kind: 'dot' as const })), [heat]);
  return (
    <div className="mm-safe mm-anim-fade" style={{ position: 'absolute', inset: 0, zIndex: 48, overflowY: 'auto', background: `radial-gradient(circle at 50% 20%, ${col}55, #040714 70%)` }}>
      {confetti.map((c) => (
        <span key={c.i} aria-hidden style={{ position: 'fixed', top: -20, left: `${c.x}%`, width: 8, height: 14, background: c.c, borderRadius: 2, animation: `mm-confetti 3.2s ${c.d}s linear infinite`, opacity: won ? 1 : 0.35 }} />
      ))}
      <style>{'@keyframes mm-confetti { to { transform: translateY(110vh) rotate(720deg); } }'}</style>
      <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
        <div className="mm-chip mm-anim-rise" style={{ color: won ? tc.good : tc.bad, fontWeight: 800 }}>
          {won ? 'VICTORY' : 'DEFEAT'}
        </div>
        <h1 className="mm-title mm-anim-pop" style={{ fontSize: 'clamp(44px, 10vw, 96px)', margin: '6px 0', background: `linear-gradient(180deg,#fff,${col})`, WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
          {title}
        </h1>
        <div className="mm-muted">{REASON[res.reason] ?? res.reason}</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 6, flexWrap: 'wrap', margin: '14px 0' }}>
          {winners.map((p, i) => (
            <div key={p.id} className="mm-anim-rise" style={{ animationDelay: `${i * 90}ms` }}>
              <BerryAvatar cosmetics={p.cosmetics} size={i === 0 ? 120 : 96} emote={p.cosmetics.victory || 'cheer'} />
              <div style={{ fontWeight: 800, color: res.mvp === p.id ? '#fbbf24' : undefined }}>
                {res.mvp === p.id ? '★ ' : ''}
                {p.name}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
          {(['summary', 'timeline', 'heatmap'] as const).map((t) => (
            <button key={t} className={`mm-btn ${tab === t ? 'mm-btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'summary' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, textAlign: 'left' }}>
            <div className="mm-panel" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>Roles</h3>
              {snap.players.map((p) => {
                const r = ROLES[res.roles[p.id] ?? 'crewmate'];
                const s = res.stats[p.id];
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', opacity: s?.alive ? 1 : 0.6 }}>
                    <BerryAvatar cosmetics={p.cosmetics} size={30} animate={false} />
                    <span style={{ flex: 1, fontWeight: 700 }}>
                      {p.name} {res.winners.includes(p.id) ? '🏆' : ''}
                    </span>
                    <span style={{ color: r.color, fontWeight: 700 }}>{r.name}</span>
                    <span className="mm-muted" style={{ fontSize: '0.8em', width: 90, textAlign: 'right' }}>
                      {r.team === 'crew' ? `${s?.tasksDone ?? 0}/${s?.tasksTotal ?? 0} tasks` : `${s?.kills ?? 0} kills`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mm-panel" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>Awards</h3>
              {res.awards.map((a) => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <b style={{ color: '#fbbf24' }}>{a.title}</b>
                  <span>{nameOf(a.playerId)}</span>
                </div>
              ))}
              <h3>Your match</h3>
              {(() => {
                const s = res.stats[pid];
                if (!s) return null;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.9em' }}>
                    <span>Tasks: {s.tasksDone}</span>
                    <span>Kills: {s.kills}</span>
                    <span>Reports: {s.bodiesReported}</span>
                    <span>Meetings called: {s.meetingsCalled}</span>
                    <span>
                      Correct votes: {s.correctVotes}/{s.votesCast}
                    </span>
                    <span>Fixes: {s.fixes}</span>
                    <span>Walked: {Math.round(s.distance)} m</span>
                    <span>Survived: {fmtTime(s.survivedTo)}</span>
                  </div>
                );
              })()}
              <div style={{ marginTop: 10 }}>
                <div className="mm-muted" style={{ fontSize: '0.75em', fontWeight: 800 }}>
                  VOTE ACCURACY (CREW)
                </div>
                <Bar
                  value={(() => {
                    let c = 0;
                    let t = 0;
                    for (const [id, s] of Object.entries(res.stats)) {
                      if (ROLES[res.roles[id] ?? 'crewmate'].team !== 'crew') continue;
                      c += s.correctVotes;
                      t += s.votesCast;
                    }
                    return t ? c / t : 0;
                  })()}
                />
              </div>
            </div>
          </div>
        )}
        {tab === 'timeline' && (
          <div className="mm-panel" style={{ padding: 14, textAlign: 'left', maxHeight: 360 }}>
            <div className="mm-scroll" style={{ maxHeight: 330 }}>
              {res.timeline.length === 0 && <div className="mm-muted">A quiet game.</div>}
              {res.timeline.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '3px 0', fontSize: '0.92em' }}>
                  <span className="mm-muted" style={{ width: 48, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    {fmtTime(e.t)}
                  </span>
                  <span>
                    {e.type === 'kill' && (
                      <>
                        🔪 <b>{nameOf(e.actor)}</b> {e.detail === 'gun' ? 'shot' : e.detail === 'poison' ? 'poisoned' : 'eliminated'} <b>{nameOf(e.target)}</b>
                      </>
                    )}
                    {e.type === 'report' && (
                      <>
                        📣 <b>{nameOf(e.actor)}</b> reported {nameOf(e.target)}’s body
                      </>
                    )}
                    {e.type === 'emergency' && (
                      <>
                        🚨 <b>{nameOf(e.actor)}</b> called an emergency meeting
                      </>
                    )}
                    {e.type === 'eject' && <>🚀 {e.target ? `${nameOf(e.target)} was ejected` : `No one was ejected (${e.detail || 'skip'})`}</>}
                    {e.type === 'sabotage' && (
                      <>
                        ⚡ <b>{nameOf(e.actor)}</b> sabotaged {e.detail}
                      </>
                    )}
                    {e.type === 'fixed' && (
                      <>
                        🔧 <b>{nameOf(e.actor)}</b> fixed {e.detail}
                      </>
                    )}
                    {e.type === 'misfire' && (
                      <>
                        💥 <b>{nameOf(e.actor)}</b> misfired at {nameOf(e.target)}
                      </>
                    )}
                    {e.type === 'gun.pickup' && (
                      <>
                        🦸 <b>{nameOf(e.actor)}</b> picked up the gun
                      </>
                    )}
                    {e.type === 'poison' && (
                      <>
                        🧪 <b>{nameOf(e.actor)}</b> poisoned {nameOf(e.target)}
                      </>
                    )}
                    {e.type === 'shield.hit' && (
                      <>
                        🛡 {nameOf(e.target)}’s shield blocked {nameOf(e.actor)}
                      </>
                    )}
                    {e.type === 'blackout' && (
                      <>
                        🌑 <b>{nameOf(e.actor)}</b> caused a blackout
                      </>
                    )}
                    {e.type === 'final' && <>⏱ Final countdown began</>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'heatmap' && (
          <div className="mm-panel" style={{ padding: 14 }}>
            <select className="mm-input" value={heatFor} onChange={(e) => setHeatFor(e.target.value)} style={{ marginBottom: 8, maxWidth: 260 }} aria-label="Heatmap player">
              {snap.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <MapThumb map={map} height={Math.min(380, innerHeight * 0.5)} width={Math.min(860, innerWidth * 0.86)} markers={heatMarkers} labels />
            </div>
            <div className="mm-muted" style={{ fontSize: '0.8em', marginTop: 6 }}>
              Where {nameOf(heatFor)} spent the match (one dot per second).
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '18px 0' }}>
          {isHost ? (
            <button className="mm-btn mm-btn-primary" style={{ minWidth: 200, minHeight: 52 }} onClick={() => send({ t: 'host.lobby' })}>
              <MIcon name="play" /> Back to the waiting room
            </button>
          ) : (
            <span className="mm-chip">Waiting for the host… (auto-return in a minute)</span>
          )}
          <button className="mm-btn" onClick={leave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
