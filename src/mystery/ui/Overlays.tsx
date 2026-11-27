/**
 * Cinematic overlays: role reveal, meeting banner + voting board, ejection
 * sequences (per-map style) and the end-of-round board. All have reduced-motion
 * fallbacks; 3D players get the same moments framed for their view.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { StageActor, StagePose } from './Stage3D';

const Stage3D = lazy(() => import('./Stage3D'));

/** 3D players get a three.js stage; 2D players (and fallback) get portraits. */
export function useStage(): boolean {
  const v = useMystery((s) => s.matchView ?? s.prefs.view);
  return v !== '2d';
}
import { matchEarnings } from '../characters/shop';
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
import { BerryAvatar, Bar, colorHex, fmtTime, MIcon, readable, teamColors } from './common';
import { Hazard, Presence, SchematicMap, starfield, STREAKS, Tick, useViewport } from './kit';
import { SeedsEarned } from './Shop';

const STARS = starfield(11, 90);

const ROLE_POSE: Partial<Record<RoleId, string>> = {
  murderer: 'knife-twirl',
  sheriff: 'gun-spin',
  detective: 'magnify',
  seeker: 'knife-twirl',
  jester: 'laugh',
  mayor: 'wave',
  medic: 'cheer',
};

const STAGE_POSE: Partial<Record<RoleId, StagePose>> = {
  murderer: 'knife-twirl',
  poisoner: 'knife-twirl',
  seeker: 'knife-twirl',
  sheriff: 'gun-spin',
  detective: 'magnify',
  jester: 'shrug',
  medic: 'celebrate',
  mayor: 'wave',
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
  const use3d = useStage();
  const vp = useViewport();
  const revealActors = useMemo<StageActor[]>(
    () => [
      ...mates.map((m, i) => ({ cosmetics: m.cosmetics, pose: 'knife-twirl' as StagePose, x: (i % 2 ? 1 : -1) * (1.1 + Math.floor(i / 2) * 0.9), scale: 0.85, fromX: (i % 2 ? 1 : -1) * 6, enter: 1.2 })),
      { cosmetics: me.cosmetics, pose: STAGE_POSE[you.role] ?? 'wave', x: 0, scale: 1.15 },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [you.role, me.cosmetics, mates.length],
  );
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
    <div className="mmv" data-team={role.team} style={{ ['--team' as string]: teamCol, ['--role' as string]: role.color, backgroundImage: STARS }}>
      {stage === 0 && <div className="mmv-shh mm-in-fade">SHHH…</div>}
      {stage >= 1 && (
        <>
          <div className="mmv-band" aria-hidden />
          <div className="mmv-card">
            <div className="mmv-youare mm-in-down">YOU ARE {role.team === 'murderers' ? 'ON THE MURDERER TEAM' : role.team === 'neutral' ? 'NEUTRAL' : 'CREW'}</div>
            <div className="mmv-role mm-in-pop">{role.name}</div>
            {use3d ? (
              <div className="mm-in-pop">
                <Suspense fallback={<BerryAvatar cosmetics={me.cosmetics} size={170} />}>
                  <Stage3D actors={revealActors} width={Math.min(560, vp.w - 24)} height={Math.min(240, Math.round(vp.h * 0.38))} light={role.color} reducedMotion={prefs.reducedMotion} />
                </Suspense>
                <div className="mmv-name mm-nocase">
                  {me.name}
                  {mates.length > 0 && <span style={{ color: tc.murderers }}> · with {mates.map((m) => m.name).join(', ')}</span>}
                </div>
              </div>
            ) : (
              <div className="mmv-cast">
                {mates.map((m, i) => (
                  <div key={m.id} className="mm-in-up" style={{ animationDelay: `${300 + i * 120}ms` }}>
                    <BerryAvatar cosmetics={m.cosmetics} size={90} dir={1} emote="knife-twirl" />
                    <div className="mmv-name mm-nocase" style={{ color: tc.murderers }}>
                      {m.name}
                    </div>
                  </div>
                ))}
                <div className="mm-in-pop">
                  <BerryAvatar cosmetics={me.cosmetics} size={170} emote={ROLE_POSE[you.role] ?? 'wave'} />
                  <div className="mmv-name mm-nocase">{me.name}</div>
                </div>
              </div>
            )}
            {stage >= 2 && (
              <div className="mm-in-up">
                <div className="mmv-blurb">{role.blurb}</div>
                <div className="mmv-abil">
                  {role.abilities.map((a, i) => (
                    <span key={a} className="mm-chip" style={{ ['--i' as string]: i }}>
                      {a}
                    </span>
                  ))}
                </div>
                {seekers.length > 0 && <div style={{ marginTop: 10, color: tc.murderers }}>Seeker: {seekers.map((s) => s.name).join(', ')} — hide!</div>}
                <div className="mmv-mode">
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

function MeetingBanner({ snap, onDone }: { snap: Snapshot; onDone(): void }) {
  const m = snap.meeting!;
  const reduced = useMystery((s) => s.prefs.reducedMotion);
  const caller = snap.players.find((p) => p.id === m.callerId);
  const victim = m.victimId ? snap.players.find((p) => p.id === m.victimId) : null;
  const [out, setOut] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setOut(true), reduced ? 500 : 2350);
    const b = setTimeout(onDone, reduced ? 600 : 2650);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [reduced, onDone]);
  return (
    <div className="mmm-splash" data-kind={m.victimId ? 'report' : 'emergency'} data-state={out ? 'out' : 'in'} role="alert" style={{ backgroundImage: STARS }}>
      <div className="mmm-streaks" aria-hidden>
        <i style={{ backgroundImage: STREAKS }} />
      </div>
      <div className="mmm-strip">
        <span>{m.victimId ? 'Body Reported' : 'Emergency Meeting'}</span>
      </div>
      <Hazard className="mmm-haz" />
      <div className="mmm-figure">
        {victim ? (
          <div className="mmm-corpse">
            <BodyPortrait cosmetics={victim.cosmetics} size={230} />
          </div>
        ) : (
          caller && <BerryAvatar cosmetics={caller.cosmetics} size={190} emote="point" />
        )}
      </div>
      <div className="mmm-caption mm-nocase">
        {victim ? (
          <>
            <b style={{ color: colorHex(victim.cosmetics.color) }}>{victim.name}</b> was found · reported by <b>{caller?.name}</b>
          </>
        ) : (
          <>
            Called by <b style={{ color: caller ? colorHex(caller.cosmetics.color) : undefined }}>{caller?.name}</b>
          </>
        )}
      </div>
    </div>
  );
}

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
  const endSplash = useMemo(() => () => setSplash(false), []);
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [chat.length]);
  const victim = m.victimId ? snap.players.find((p) => p.id === m.victimId) : null;
  const you = snap.you;
  const left = Math.max(0, m.stageEnds - snap.t);
  const stageLen = m.stage === 'discuss' ? settings.discussionTime : m.stage === 'vote' ? settings.votingTime : 5;
  const canVote = you.alive && m.stage === 'vote' && !m.myVote;
  if (splash) return <MeetingBanner snap={snap} onDone={endSplash} />;
  const selName = selected === 'skip' ? 'Skip' : snap.players.find((p) => p.id === selected)?.name;
  return (
    <div className="mmm-board-wrap mm-safe" style={{ backgroundImage: STARS }}>
      <header className="mmm-head">
        <div className="mmm-title">
          <span className="mm-label">{m.victimId ? 'Body reported' : 'Emergency meeting'}</span>
          <h2 className="mm-nocase">{m.victimId ? `Who got ${victim?.name ?? 'them'}?` : 'Who’s the culprit?'}</h2>
        </div>
        <div className="mmm-timer" data-stage={m.stage} data-low={left < 10}>
          <span className="mmm-timer-label">{m.stage === 'discuss' ? 'Discussion' : m.stage === 'vote' ? 'Voting' : 'Results'}</span>
          <span className="mmm-timer-num" aria-label={fmtTime(left)}>
            <span key={Math.ceil(left)} className="mm-bump">
              {Math.ceil(left)}
            </span>
          </span>
          <span className="mmm-timer-bar" aria-hidden>
            <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, left / Math.max(1, stageLen)))})` }} />
          </span>
        </div>
      </header>
      <div className="mmm-body">
        {/* Ballot */}
        <div className="mmm-ballot-col">
          <div className="mm-scroll mmm-ballot">
            {snap.players.map((p, i) => {
              const voters = m.votes ? Object.entries(m.votes).filter(([, t]) => t === p.id).map(([v]) => v) : [];
              const tally = m.tally?.[p.id] ?? 0;
              const isSel = selected === p.id;
              return (
                <button
                  key={p.id}
                  className="mmm-row"
                  data-sel={isSel}
                  data-mine={m.myVote === p.id}
                  data-dead={!p.alive}
                  data-you={p.id === you.id}
                  disabled={!canVote || !p.alive}
                  onClick={() => setSelected(isSel ? null : p.id)}
                  style={{ ['--i' as string]: i, ['--pc' as string]: colorHex(p.cosmetics.color) }}
                  aria-label={`Vote ${p.name}`}
                  aria-pressed={isSel}
                >
                  <span className="mmm-av">
                    <BerryAvatar cosmetics={p.cosmetics} size={46} animate={false} ghost={!p.alive} />
                    {!p.alive && <span className="mmm-x" aria-hidden />}
                  </span>
                  <span className="mmm-who">
                    <b className="mm-nocase">{p.name}</b>
                    <small>
                      {!p.alive ? 'Eliminated' : p.role ? <span style={{ color: ROLES[p.role].color }}>{ROLES[p.role].name}</span> : p.revealedMayor ? 'Mayor' : p.id === you.id ? 'You' : ''}
                      {p.id === m.callerId && (
                        <span className="mmm-caller" title="Called the meeting">
                          <MIcon name="megaphone" size={13} />
                        </span>
                      )}
                    </small>
                  </span>
                  {p.voted && m.stage !== 'reveal' && <span className="mmm-voted">Voted</span>}
                  {m.stage === 'reveal' && (
                    <span className="mmm-pips">
                      {(voters.length ? voters : Array.from({ length: tally }, (_, j) => `?${j}`)).map((v, j) => {
                        const vp = snap.players.find((x) => x.id === v);
                        return <span key={v} className="mmm-pip" title={vp?.name} style={{ background: vp ? colorHex(vp.cosmetics.color) : '#cbd5e1', animationDelay: `${j * 160}ms` }} />;
                      })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mmm-foot">
            {settings.allowSkip && (
              <button className="mmm-skip" data-sel={selected === 'skip'} disabled={!canVote} onClick={() => setSelected(selected === 'skip' ? null : 'skip')}>
                <MIcon name="skip" size={18} /> Skip vote
                {m.stage === 'reveal' && m.tally?.skip ? (
                  <span className="mmm-pips inline">
                    {Array.from({ length: m.tally.skip }, (_, j) => (
                      <span key={j} className="mmm-pip" style={{ background: '#cbd5e1', animationDelay: `${j * 160}ms` }} />
                    ))}
                  </span>
                ) : null}
              </button>
            )}
            <span className="mmm-status">{you.alive ? (m.myVote ? '✓ You voted' : m.stage === 'vote' ? 'Pick someone, then stamp your vote' : m.stage === 'discuss' ? `Voting opens in ${fmtTime(left)} — talk it out!` : '') : 'Ghosts can’t vote'}</span>
          </div>
          <Presence show={canVote && !!selected} anim="rise" className="mmm-confirm">
            <button
              className="mm-btn mm-btn-gold mm-pill"
              onClick={() => {
                if (!selected) return;
                act({ a: 'vote', target: selected });
                setSelected(null);
              }}
            >
              <MIcon name="ballot" /> Stamp vote: <span className="mm-nocase">{selName}</span>
            </button>
            <button className="mm-round" onClick={() => setSelected(null)} aria-label="Cancel vote">
              <MIcon name="close" />
            </button>
          </Presence>
          {you.role === 'mayor' && settings.mayorReveal && !you.mayorRevealed && you.alive && (
            <button className="mm-btn" onClick={() => act({ a: 'mayor.reveal' })}>
              <MIcon name="crown" /> Reveal yourself as Mayor (+1 vote)
            </button>
          )}
        </div>
        {/* Chat */}
        <div className="mmm-chat">
          <div className="mmm-chat-head">
            <MIcon name="chat" size={18} /> Discussion
          </div>
          <div className="mm-scroll mmm-chatlog" aria-live="polite">
            {chat.map((c) => {
              const who = snap.players.find((p) => p.id === c.from);
              const sys = c.from === 'system';
              return (
                <div key={c.id} className="mmm-msg" data-sys={sys} style={{ opacity: c.ghost ? 0.7 : 1 }}>
                  {who && <BerryAvatar cosmetics={who.cosmetics} size={28} animate={false} ghost={c.ghost} />}
                  <div className="mmm-bubble mm-nocase">
                    {who && (
                      <b style={{ color: readable(colorHex(who.cosmetics.color)) }}>
                        {who.name}
                        {c.ghost ? ' (ghost)' : ''}{' '}
                      </b>
                    )}
                    {prefs.profanityFilter ? filterProfanity(c.text) : c.text}
                  </div>
                </div>
              );
            })}
            <div ref={chatEnd} />
          </div>
          {settings.quickChat && (you.alive || settings.ghostChat) && (
            <div className="mmm-quick">
              <select className="mm-input" value={quickTarget ?? ''} onChange={(e) => setQuickTarget(e.target.value || null)} aria-label="Quick chat target">
                <option value="">About…</option>
                {snap.players
                  .filter((p) => p.id !== you.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <div className="mmm-quick-row">
                {QUICK_CHAT.filter((q) => (q.target ? !!quickTarget : true)).slice(0, 12).map((q) => (
                  <button key={q.id} className="mm-btn sm mm-nocase" onClick={() => act({ a: 'quick', id: q.id, target: quickTarget ?? undefined })}>
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
              className="mmm-form"
            >
              <input className="mm-input" value={text} maxLength={160} onChange={(e) => setText(e.target.value)} placeholder={you.alive ? 'Make your case…' : 'Ghost chat…'} aria-label="Meeting chat" />
              <button className="mm-btn mm-btn-primary" type="submit" aria-label="Send">
                <MIcon name="arrow" size={18} />
              </button>
            </form>
          )}
          <div className="mmm-hint" style={{ color: you.alive && m.myVote ? tc.good : undefined }}>
            {you.alive ? (m.myVote ? '✓ Vote locked in' : '') : 'You are a ghost — only ghosts can read you'}
          </div>
        </div>
      </div>
    </div>
  );
}

function BodyPortrait({ cosmetics, size }: { cosmetics: Cosmetics; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.round(size * 1.7);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = size * dpr;
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBody(g, cosmetics, w / 2, size * 0.62, size / 46, 0);
  }, [cosmetics, size, w]);
  return <canvas ref={ref} style={{ width: w, height: size }} aria-label="Body" />;
}

// ---------------------------------------------------------------------------
// Ejection

const EJECT_SCENE: Record<EjectStyle, { sky: [string, string]; label: string }> = {
  tube: { sky: ['#03040a', '#0b1238'], label: 'shot out of the pneumatic tube' },
  airlock: { sky: ['#010205', '#0a0f1c'], label: 'sent out the airlock' },
  caboose: { sky: ['#1e293b', '#94a3b8'], label: 'tossed off the caboose' },
  trapdoor: { sky: ['#0c060e', '#2a1328'], label: 'dropped through the trapdoor' },
  chute: { sky: ['#03040a', '#1e2638'], label: 'sent down the chute' },
};

export function EjectOverlay({ snap, settings }: { snap: Snapshot; settings: Settings }) {
  const e = snap.eject!;
  const prefs = useMystery((s) => s.prefs);
  const vp = useViewport();
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
  const use3d = useStage();
  const ejectActors = useMemo<StageActor[]>(
    () =>
      ejected
        ? [{ cosmetics: ejected.cosmetics, pose: 'scared' as StagePose, x: style === 'trapdoor' ? 0 : style === 'caboose' ? -2.8 : 2.8, fromX: style === 'trapdoor' ? 0 : style === 'caboose' ? 2.8 : -2.8, enter: 5, flight: style === 'trapdoor' ? ('fall' as const) : style === 'caboose' ? ('arc' as const) : ('across' as const) }]
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ejected?.id, style],
  );
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i++;
      setTyped(msg.slice(0, i));
      if (i >= msg.length) clearInterval(t);
    }, prefs.reducedMotion ? 1 : 45);
    return () => clearInterval(t);
  }, [msg, prefs.reducedMotion]);
  const skipBerry = use3d;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    let raf = 0;
    const t0 = performance.now();
    const stars = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 2 + 0.5, v: Math.random() * 0.3 + 0.1 }));
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
        const speed = prefs.reducedMotion ? 0 : style === 'caboose' ? 0.6 : style === 'trapdoor' ? 0 : 0.08;
        const x = (((s.x - t * s.v * speed) % 1) + 1) % 1;
        const y = style === 'trapdoor' && !prefs.reducedMotion ? (((s.y - t * s.v * 0.6) % 1) + 1) % 1 : s.y;
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
      if (ejected && !skipBerry) {
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
  }, [ejected, scene, style, skipBerry, prefs.reducedMotion]);
  return (
    <div className="mme">
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden />
      {use3d && ejected && (
        <div className="mme-stage">
          <Suspense fallback={null}>
            <Stage3D actors={ejectActors} width={Math.min(900, vp.w)} height={Math.min(420, vp.h * 0.5)} light="#cfe0ff" reducedMotion={prefs.reducedMotion} />
          </Suspense>
        </div>
      )}
      <div className="mme-text">
        {/* The untyped rest is laid out invisibly so the centred line doesn't drift while it types. */}
        <div className="mme-line mm-nocase" role="status" aria-label={msg}>
          <span aria-hidden>{typed}</span>
          <span className="mme-caret" aria-hidden style={{ opacity: typed.length < msg.length ? 1 : 0 }}>
            ▌
          </span>
          <span className="mme-rest" aria-hidden>
            {msg.slice(typed.length)}
          </span>
        </div>
        {ejected && <div className="mme-sub mm-nocase">{ejected.name} was {scene.label}.</div>}
        {remaining !== null && typed.length >= msg.length && (
          <div className="mme-left mm-in-up">
            {remaining} murderer{remaining === 1 ? '' : 's'} remain{remaining === 1 ? 's' : ''}.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results: end-of-round board

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

const EV_ICON: Partial<Record<string, string>> = {
  kill: 'knife',
  report: 'megaphone',
  emergency: 'siren',
  eject: 'door2',
  sabotage: 'bolt',
  fixed: 'wrench',
  misfire: 'crosshair',
  'gun.pickup': 'gun',
  poison: 'vial',
  'shield.hit': 'shield',
  blackout: 'flashlight',
  final: 'timer',
};

/** Rubber-stamp tally (original art: jagged badge + icon + count). */
function Stamp({ icon, label, n, tone, i }: { icon: string; label: string; n: number; tone: string; i: number }) {
  return (
    <div className="mmr-stamp" style={{ ['--tone' as string]: tone, ['--i' as string]: i }} data-zero={n === 0}>
      <svg viewBox="0 0 100 100" className="mmr-stamp-bg" aria-hidden>
        <polygon points="50,2 61,14 77,8 80,25 96,30 88,45 98,58 83,66 86,83 69,84 60,98 48,88 34,97 28,82 11,80 15,64 2,52 14,40 6,24 23,21 28,5 41,13" />
      </svg>
      <MIcon name={icon} size={34} stroke={2.4} />
      <span className="mmr-stamp-label">{label}</span>
      <span className="mmr-stamp-n">
        ×<Tick value={n} ms={900} />
      </span>
    </div>
  );
}

export function ResultsScreen({ snap }: { snap: Snapshot }) {
  const res = snap.result!;
  const prefs = useMystery((s) => s.prefs);
  const room = useMystery((s) => s.room)!;
  const pid = useMystery((s) => s.pid);
  const send = useMystery((s) => s.send);
  const leave = useMystery((s) => s.leave);
  const tc = teamColors(prefs.colorblind !== 'none');
  const vp = useViewport();
  const won = res.winners.includes(pid);
  const [tab, setTab] = useState<'summary' | 'timeline' | 'heatmap'>('summary');
  const [heatFor, setHeatFor] = useState<string>(pid);
  const isHost = room.hostId === pid;
  const winners = snap.players.filter((p) => res.winners.includes(p.id));
  const use3d = useStage();
  const winActors = useMemo<StageActor[]>(() => {
    const list = winners.slice(0, 7);
    return list.map((p, i) => ({ cosmetics: p.cosmetics, pose: 'celebrate' as StagePose, x: (i - (list.length - 1) / 2) * 1.05, scale: res.mvp === p.id ? 1.15 : 0.95 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.endedAt]);
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
  const nameOf = (id?: string) => snap.players.find((p) => p.id === id)?.name ?? '—';
  const heat = res.heat?.[heatFor] ?? [];
  const heatMarkers = useMemo(() => heat.map((c) => ({ pos: { x: (c % 1000) * 2 + 1, y: Math.floor(c / 1000) * 2 + 1 }, color: 'rgba(255,150,60,0.4)', kind: 'heat' as const })), [heat]);
  // Board numbers.
  let done = 0;
  let total = 0;
  for (const [id, s] of Object.entries(res.stats)) {
    if (ROLES[res.roles[id] ?? 'crewmate'].team !== 'crew') continue;
    done += s.tasksDone;
    total += s.tasksTotal;
  }
  const count = (t: string) => res.timeline.filter((e) => e.type === t).length;
  const sabotages = count('sabotage') + count('blackout');
  const kills = count('kill');
  const meetings = count('report') + count('emergency');
  const voteAcc = (() => {
    let c = 0;
    let t = 0;
    for (const [id, s] of Object.entries(res.stats)) {
      if (ROLES[res.roles[id] ?? 'crewmate'].team !== 'crew') continue;
      c += s.correctVotes;
      t += s.votesCast;
    }
    return t ? c / t : 0;
  })();
  const mine = res.stats[pid];
  const practice = !!room.practice;
  const earnings = useMemo(() => matchEarnings({ stats: res.stats[pid], won: res.winners.includes(pid), mvp: res.mvp === pid, practice }), [res, pid, practice]);
  return (
    <div className="mmr mm-safe" style={{ backgroundImage: STARS, ['--win' as string]: col }}>
      <div className="mmr-top">
        <div className="mmr-head">
          <span className="mmr-verdict" data-won={won} style={{ color: won ? tc.good : tc.bad }}>
            {won ? 'Victory' : 'Defeat'}
          </span>
          <h1 className="mmr-title">{title}</h1>
          <div className="mmr-reason">{REASON[res.reason] ?? res.reason}</div>
        </div>
        <div className="mmr-btns">
          {isHost ? (
            <button className="mm-btn mm-btn-primary mm-pill" onClick={() => send({ t: 'host.lobby' })}>
              <MIcon name="play" /> Back to the waiting room
            </button>
          ) : (
            <span className="mm-chip">Waiting for the host… (auto-return in a minute)</span>
          )}
          <button className="mm-btn mm-pill mmr-leave" onClick={leave}>
            Leave
          </button>
        </div>
      </div>
      <div
        className="mms-tabs mmr-tabs"
        role="tablist"
        aria-label="Results sections"
        onKeyDown={(e) => {
          const order = ['summary', 'timeline', 'heatmap'] as const;
          const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          const n = (order.indexOf(tab) + d + order.length) % order.length;
          setTab(order[n]!);
          (e.currentTarget.children[n] as HTMLElement | undefined)?.focus();
        }}
      >
        {(['summary', 'timeline', 'heatmap'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} tabIndex={tab === t ? 0 : -1} className="mms-tab" onClick={() => setTab(t)}>
            <MIcon name={t === 'summary' ? 'stats' : t === 'timeline' ? 'timer' : 'map'} size={18} />
            {t === 'summary' ? 'Board' : t === 'timeline' ? 'Timeline' : 'Heatmap'}
          </button>
        ))}
      </div>
      {tab === 'summary' && (
        <div className="mmr-grid">
          <SeedsEarned earnings={earnings} balance={prefs.seeds} />
          <div className="mmr-left">
            {total > 0 && (
              <div className="mmr-total">
                <span className="mm-label">Total tasks completed</span>
                <Bar value={done / total} height={26} label="Total tasks completed" />
                <span className="mmr-total-n">
                  <Tick value={done} ms={1200} />/{total}
                </span>
              </div>
            )}
            <div className="mmr-mid">
              <div className="mmr-box">
                <span className="mm-label">Highlights</span>
                {res.awards.length === 0 && <div className="mm-muted">No awards this round.</div>}
                {res.awards.map((a, i) => (
                  <div key={a.id} className="mmr-award" style={{ ['--i' as string]: i }}>
                    <MIcon name="trophy" size={18} />
                    <b>{a.title}</b>
                    <span className="mm-nocase">{nameOf(a.playerId)}</span>
                  </div>
                ))}
                {mine && (
                  <div className="mmr-mine">
                    <span className="mm-label">Your match</span>
                    <div className="mmr-mine-grid">
                      <span>Tasks: {mine.tasksDone}</span>
                      <span>Kills: {mine.kills}</span>
                      <span>Reports: {mine.bodiesReported}</span>
                      <span>Meetings called: {mine.meetingsCalled}</span>
                      <span>
                        Correct votes: {mine.correctVotes}/{mine.votesCast}
                      </span>
                      <span>Fixes: {mine.fixes}</span>
                      <span>Walked: {Math.round(mine.distance)} m</span>
                      <span>Survived: {fmtTime(mine.survivedTo)}</span>
                    </div>
                  </div>
                )}
                <div className="mmr-acc">
                  <span className="mm-label">Vote accuracy (crew)</span>
                  <Bar value={voteAcc} height={10} />
                </div>
              </div>
              <div className="mmr-stamps">
                <Stamp icon="bolt" label="Sabotage" n={sabotages} tone="#ff3b3b" i={0} />
                <Stamp icon="knife" label="Elimination" n={kills} tone="#e8e8e8" i={1} />
                <Stamp icon="megaphone" label="Meeting" n={meetings} tone="#ffd426" i={2} />
              </div>
            </div>
            <span className="mm-label">Crew progression</span>
            <div className="mmr-crew">
              {snap.players.map((p, i) => {
                const r = ROLES[res.roles[p.id] ?? 'crewmate'];
                const s = res.stats[p.id];
                const prog = s && s.tasksTotal ? s.tasksDone / s.tasksTotal : 0;
                return (
                  <div key={p.id} className="mmr-card" data-dead={!s?.alive} data-win={res.winners.includes(p.id)} style={{ ['--i' as string]: i }}>
                    <span className="mmr-card-av" style={{ background: colorHex(p.cosmetics.color) + '55' }}>
                      <BerryAvatar cosmetics={p.cosmetics} size={40} animate={false} ghost={!s?.alive} />
                    </span>
                    <span className="mmr-card-txt">
                      <b className="mm-nocase">
                        {p.name}
                        {res.mvp === p.id ? ' ★' : ''}
                      </b>
                      <small style={{ color: r.color }}>{r.name}</small>
                      {r.team === 'crew' ? <Bar value={prog} height={9} /> : <small className="mm-muted">{s?.kills ?? 0} kills</small>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mmr-right">
            <div className="mmr-frame">
              {use3d && winners.length > 0 ? (
                <Suspense fallback={null}>
                  <Stage3D actors={winActors} width={Math.min(560, vp.w - 40)} height={230} light={col} reducedMotion={prefs.reducedMotion} />
                </Suspense>
              ) : (
                <div className="mmr-podium">
                  {winners.slice(0, 5).map((p, i) => (
                    <div key={p.id} className="mm-in-up" style={{ animationDelay: `${i * 90}ms` }}>
                      <BerryAvatar cosmetics={p.cosmetics} size={i === 0 ? 110 : 84} emote={p.cosmetics.victory || 'cheer'} />
                    </div>
                  ))}
                </div>
              )}
              <div className="mmr-tiles">
                {snap.players.map((p, i) => {
                  const r = ROLES[res.roles[p.id] ?? 'crewmate'];
                  return (
                    <div key={p.id} className="mmr-tile" data-win={res.winners.includes(p.id)} style={{ ['--pc' as string]: colorHex(p.cosmetics.color), ['--i' as string]: i }} title={`${p.name} — ${r.name}`}>
                      <BerryAvatar cosmetics={p.cosmetics} size={52} animate={false} />
                      <span className="mmr-tile-name mm-nocase">{p.name}</span>
                      <span className="mmr-tile-role" style={{ color: r.color }}>
                        {r.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {tab === 'timeline' && (
        <div className="mm-panel mmr-panel">
          <div className="mm-scroll" style={{ maxHeight: '58vh' }}>
            {res.timeline.length === 0 && <div className="mm-muted">A quiet game.</div>}
            {res.timeline.map((e, i) => (
              <div key={i} className="mmr-ev" style={{ ['--i' as string]: Math.min(i, 30) }}>
                <span className="mmr-ev-t">{fmtTime(e.t)}</span>
                <span className="mmr-ev-ic" data-type={e.type}>
                  <MIcon name={EV_ICON[e.type] ?? 'flag'} size={16} stroke={2.4} />
                </span>
                <span className="mm-nocase">
                  {e.type === 'kill' && (
                    <>
                      <b>{nameOf(e.actor)}</b> {e.detail === 'gun' ? 'shot' : e.detail === 'poison' ? 'poisoned' : 'eliminated'} <b>{nameOf(e.target)}</b>
                    </>
                  )}
                  {e.type === 'report' && (
                    <>
                      <b>{nameOf(e.actor)}</b> reported {nameOf(e.target)}’s body
                    </>
                  )}
                  {e.type === 'emergency' && (
                    <>
                      <b>{nameOf(e.actor)}</b> called an emergency meeting
                    </>
                  )}
                  {e.type === 'eject' && <>{e.target ? `${nameOf(e.target)} was ejected` : `No one was ejected (${e.detail || 'skip'})`}</>}
                  {e.type === 'sabotage' && (
                    <>
                      <b>{nameOf(e.actor)}</b> sabotaged {e.detail}
                    </>
                  )}
                  {e.type === 'fixed' && (
                    <>
                      <b>{nameOf(e.actor)}</b> fixed {e.detail}
                    </>
                  )}
                  {e.type === 'misfire' && (
                    <>
                      <b>{nameOf(e.actor)}</b> misfired at {nameOf(e.target)}
                    </>
                  )}
                  {e.type === 'gun.pickup' && (
                    <>
                      <b>{nameOf(e.actor)}</b> picked up the gun
                    </>
                  )}
                  {e.type === 'poison' && (
                    <>
                      <b>{nameOf(e.actor)}</b> poisoned {nameOf(e.target)}
                    </>
                  )}
                  {e.type === 'shield.hit' && (
                    <>
                      {nameOf(e.target)}’s shield blocked {nameOf(e.actor)}
                    </>
                  )}
                  {e.type === 'blackout' && (
                    <>
                      <b>{nameOf(e.actor)}</b> caused a blackout
                    </>
                  )}
                  {e.type === 'final' && <>Final countdown began</>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'heatmap' && (
        <div className="mm-panel mmr-panel">
          <select className="mm-input" value={heatFor} onChange={(e) => setHeatFor(e.target.value)} style={{ marginBottom: 8, maxWidth: 260 }} aria-label="Heatmap player">
            {snap.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <SchematicMap map={map} width={Math.min(860, vp.w * 0.86)} height={Math.min(380, vp.h * 0.5)} markers={heatMarkers} labels reducedMotion={prefs.reducedMotion} />
          </div>
          <div className="mm-muted" style={{ fontSize: '0.8em', marginTop: 6 }}>
            Where <span className="mm-nocase">{nameOf(heatFor)}</span> spent the match (one dot per second).
          </div>
        </div>
      )}
    </div>
  );
}
