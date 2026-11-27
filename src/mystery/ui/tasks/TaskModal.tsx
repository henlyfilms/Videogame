import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { CONTROLS, MINI_GAMES, TOUCH } from './registry';
import { ensureMiniGameStyles } from './styles';
import type { MiniGameKind } from './types';

export interface TaskModalProps {
  kind: MiniGameKind;
  seed: number;
  title?: string;
  step?: string;
  onComplete(): void;
  onClose(): void;
  reducedMotion?: boolean;
  fake?: boolean;
}

type Phase = 'play' | 'flourish' | 'complete';

const FLOURISH_MS = 600;

/**
 * Centred, responsive task panel: header (title, step, close), the mini-game
 * on a 4:3 stage that fits phones in portrait and landscape (safe-area aware),
 * then a check-mark burst before `onComplete` fires exactly once.
 */
export function TaskModal(props: TaskModalProps) {
  // A new kind/seed (e.g. the next step of a long task) gets a fresh panel state.
  return <TaskModalPanel key={`${props.kind}:${props.seed}`} {...props} />;
}

const EXIT_MS = 190;
const noop = () => {};

/**
 * TaskModal with an exit animation: while `open` turns false the last panel
 * stays on screen for a short fade/scale-out (inert: no input, no callbacks).
 */
export function TaskModalPresence({ open, ...props }: TaskModalProps & { open: boolean }) {
  const last = useRef<TaskModalProps | null>(null);
  if (open) last.current = props;
  const [leaving, setLeaving] = useState(false);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && !props.reducedMotion) {
      setLeaving(true);
      const t = setTimeout(() => setLeaving(false), EXIT_MS);
      wasOpen.current = open;
      return () => clearTimeout(t);
    }
    wasOpen.current = open;
    setLeaving(false);
    return undefined;
  }, [open, props.reducedMotion]);
  const shown = open ? props : leaving ? last.current : null;
  if (!shown) return null;
  // Same tree either way, so the panel (and its finished game) is not remounted for the exit.
  return (
    <div className={open ? 'mmg-host' : 'mmg-host mmg-leaving'} aria-hidden={open ? undefined : true}>
      <TaskModal {...shown} onComplete={open ? shown.onComplete : noop} onClose={open ? shown.onClose : noop} />
    </div>
  );
}

function TaskModalPanel({ kind, seed, title, step, onComplete, onClose, reducedMotion, fake }: TaskModalProps) {
  ensureMiniGameStyles();
  const entry = MINI_GAMES[kind];
  const controls = CONTROLS[kind];
  const [phase, setPhase] = useState<Phase>('play');
  const phaseRef = useRef<Phase>('play');
  const cbs = useRef({ onComplete, onClose });
  cbs.current = { onComplete, onClose };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downOnBackdrop = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const complete = useCallback(() => {
    phaseRef.current = 'complete';
    setPhase('complete');
    // A faked task gets no credit (so no server chime): play it here so it sounds real.
    if (fake) sfx.play('taskDone');
    cbs.current.onComplete();
  }, [fake]);

  const onGameComplete = useCallback(() => {
    if (phaseRef.current !== 'play') return;
    phaseRef.current = 'flourish';
    setPhase('flourish');
    sfx.task('solve');
    if (reducedMotion) complete();
    else timer.current = setTimeout(complete, FLOURISH_MS);
  }, [reducedMotion, complete]);

  const close = useCallback(() => {
    if (phaseRef.current === 'flourish') return; // let the success land
    cbs.current.onClose();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const Game = entry.Component;
  const heading = title ?? entry.title;

  return (
    <div
      className="mmg-overlay"
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) close();
        downOnBackdrop.current = false;
      }}
      // Every tap and key press in a task ticks; the games add their own step sounds on top.
      onPointerDownCapture={(e) => {
        if (e.target !== e.currentTarget && !(e.target as Element).closest?.('.mmg-close')) sfx.play('task.tick');
      }}
      onKeyDownCapture={(e) => {
        if (!e.repeat && e.key !== 'Escape' && e.key !== 'Tab' && phaseRef.current === 'play') sfx.play('task.tick');
      }}
    >
      <div className={`mmg-panel${fake ? ' mmg-fakepanel' : ''}${reducedMotion ? ' mmg-rm' : ''}`} role="dialog" aria-modal="true" aria-label={heading} data-task-modal={kind} data-task-seed={seed}>
        <header className="mmg-head">
          <span className="mmg-badge" aria-hidden="true">
            <svg width="16" height="16" viewBox="-10 -10 20 20">
              <circle r="7" fill="#fff" opacity="0.95" />
              <circle cx="-2.5" cy="-1" r="2.2" fill="#2f6fed" />
              <circle cx="2.5" cy="-1" r="2.2" fill="#2f6fed" />
              <circle cx="0" cy="2.8" r="2.2" fill="#14b8a6" />
              <path d="M0 -7 q2 -3 4 -2" stroke="#16a34a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            </svg>
          </span>
          <div className="mmg-title">
            <b>{heading}</b>
            <span>{entry.hint}</span>
          </div>
          {fake && (
            <span className="mmg-chip-fake" title="Faking: this task won't count, but it looks real">
              FAKING
            </span>
          )}
          {step && (
            <span className="mmg-step" aria-label={`Step ${step}`}>
              {step}
            </span>
          )}
          <button type="button" className="mmg-close" aria-label="Close task" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="mmg-stage">
          <Game key={`${kind}:${seed}`} kind={kind} seed={seed} onComplete={onGameComplete} reducedMotion={reducedMotion} fake={fake} />
          {phase !== 'play' && <Flourish fake={!!fake} reducedMotion={!!reducedMotion} />}
        </div>
        <footer className="mmg-foot" aria-hidden="true">
          <span className="mmg-keys">
            {controls.map((c, i) => (
              <span key={i}>
                {c.keys.map((k, j) => (
                  <kbd key={`${k}${j}`}>{k}</kbd>
                ))}{' '}
                {c.label}
              </span>
            ))}
          </span>
          <span className="mmg-touch">{TOUCH[kind]}</span>
        </footer>
      </div>
    </div>
  );
}

function Flourish({ fake, reducedMotion }: { fake: boolean; reducedMotion: boolean }) {
  const rays = 14;
  return (
    <div className={`mmg-done${reducedMotion ? ' mmg-rm' : ''}`} role="status" aria-live="assertive">
      <svg viewBox="-100 -100 200 200" aria-hidden="true">
        <defs>
          <radialGradient id="mmg-done-g" cx="35%" cy="30%" r="80%">
            <stop offset="0" stopColor="#5eead4" />
            <stop offset="0.6" stopColor="#14b8a6" />
            <stop offset="1" stopColor="#0f766e" />
          </radialGradient>
        </defs>
        {!reducedMotion &&
          Array.from({ length: rays }, (_, i) => {
            const a = (i / rays) * Math.PI * 2;
            const style = { ['--dx' as string]: `${Math.cos(a) * 78}px`, ['--dy' as string]: `${Math.sin(a) * 78}px` } as React.CSSProperties;
            return <circle key={i} className="mmg-ray" cx={Math.cos(a) * 30} cy={Math.sin(a) * 30} r={i % 2 ? 4 : 6} fill={i % 3 === 0 ? '#6ea1ff' : i % 3 === 1 ? '#5eead4' : '#ff7aa8'} style={style} />;
          })}
        <g className="mmg-check-ring">
          <circle r="44" fill="url(#mmg-done-g)" stroke="#ccfbf1" strokeWidth="3" />
          <circle r="54" fill="none" stroke="#5eead4" strokeOpacity="0.35" strokeWidth="6" />
          <path className="mmg-check-path" d="M-20 2 L-6 16 L22 -14" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <text className="mmg-done-text" y="80" textAnchor="middle">
          {fake ? 'Looks legit' : 'Task complete'}
        </text>
      </svg>
    </div>
  );
}
