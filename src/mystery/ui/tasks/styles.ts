/**
 * Shared CSS for the task mini-games and TaskModal. Injected once into
 * <head> (no external fonts or assets). Everything is prefixed `mmg-`.
 */
export const MINIGAME_CSS = `
.mmg-root{position:relative;width:100%;height:100%;outline:none;border-radius:12px;overflow:hidden;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e6ecff;
  -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:none;}
.mmg-root:focus-visible{box-shadow:inset 0 0 0 2px rgba(110,161,255,.55);}
.mmg-svg{display:block;width:100%;height:100%;touch-action:none;}
.mmg-svg text{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
.mmg-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace !important;}
.mmg-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
.mmg-hit{cursor:pointer;}
.mmg-grab{cursor:grab;}
.mmg-grab:active{cursor:grabbing;}

.mmg-spring{transition:transform 420ms cubic-bezier(.34,1.56,.64,1);}
.mmg-ease{transition:transform 320ms cubic-bezier(.22,1,.36,1),opacity 320ms ease;}
.mmg-fast{transition:transform 140ms ease-out;}
.mmg-fade{transition:opacity 260ms ease;}
.mmg-fill-t{transition:fill 220ms ease,stroke 220ms ease,opacity 220ms ease;}

.mmg-center{transform-box:fill-box;transform-origin:center;}
.mmg-pop{animation:mmg-pop 420ms cubic-bezier(.34,1.56,.64,1) both;transform-box:fill-box;transform-origin:center;}
.mmg-shake{animation:mmg-shake 380ms ease both;}
.mmg-pulse{animation:mmg-pulse 1.6s ease-in-out infinite;}
.mmg-pulse-fast{animation:mmg-pulse .7s ease-in-out infinite;}
.mmg-blink{animation:mmg-blink 1s steps(2,start) infinite;}
.mmg-float{animation:mmg-float 3.2s ease-in-out infinite;}
.mmg-spin{animation:mmg-spin 1.2s linear infinite;transform-box:fill-box;transform-origin:center;}
.mmg-spin-slow{animation:mmg-spin 9s linear infinite;transform-box:fill-box;transform-origin:center;}
.mmg-ripple{animation:mmg-ripple 620ms ease-out both;transform-box:fill-box;transform-origin:center;pointer-events:none;}
.mmg-burst{animation:mmg-burst 700ms cubic-bezier(.2,.8,.3,1) both;pointer-events:none;}
.mmg-dash{animation:mmg-dash 1.1s linear infinite;}
.mmg-twinkle{animation:mmg-twinkle 2.4s ease-in-out infinite;}
.mmg-toast{animation:mmg-toast 1.4s ease both;pointer-events:none;}
.mmg-slam{animation:mmg-slam 360ms cubic-bezier(.5,0,.75,0) both;}
.mmg-wobble{animation:mmg-wobble 520ms ease both;transform-box:fill-box;transform-origin:center bottom;}
.mmg-flicker{animation:mmg-flicker 1.8s linear infinite;}
.mmg-drip{animation:mmg-drip .5s linear infinite;}

@keyframes mmg-pop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
@keyframes mmg-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(2px)}}
@keyframes mmg-pulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes mmg-blink{0%{opacity:1}100%{opacity:.25}}
@keyframes mmg-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes mmg-spin{to{transform:rotate(360deg)}}
@keyframes mmg-ripple{0%{transform:scale(.3);opacity:.9}100%{transform:scale(1.9);opacity:0}}
@keyframes mmg-burst{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.15);opacity:0}}
@keyframes mmg-dash{to{stroke-dashoffset:-24}}
@keyframes mmg-twinkle{0%,100%{opacity:.25}50%{opacity:1}}
@keyframes mmg-toast{0%{opacity:0;transform:translateY(8px)}12%{opacity:1;transform:translateY(0)}80%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}
@keyframes mmg-slam{0%{transform:translateY(-34px)}100%{transform:translateY(0)}}
@keyframes mmg-wobble{0%,100%{transform:rotate(0)}25%{transform:rotate(-6deg)}55%{transform:rotate(5deg)}80%{transform:rotate(-2deg)}}
@keyframes mmg-flicker{0%,100%{opacity:1}42%{opacity:.86}44%{opacity:1}70%{opacity:.92}72%{opacity:.78}74%{opacity:1}}
@keyframes mmg-drip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(26px);opacity:0}}

.mmg-rm *,.mmg-rm *::before,.mmg-rm *::after{animation:none !important;transition:none !important;}
.mmg-rm .mmg-burst,.mmg-rm .mmg-ripple{display:none;}

/* ---------- TaskModal ---------- */
.mmg-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;
  padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));
  background:radial-gradient(120% 90% at 50% 40%,rgba(15,23,42,.45),rgba(2,6,23,.78));
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:mmg-fadein 200ms ease both;}
.mmg-panel{--chrome:96px;--pad:8px;position:relative;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;padding:var(--pad);
  width:min(100%,780px,calc((100vh - 20px - var(--chrome)) * 4 / 3 + 2 * var(--pad)));
  width:min(100%,780px,calc((100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom) - var(--chrome)) * 4 / 3 + 2 * var(--pad)));
  border-radius:16px;color:#e6ecff;
  background:linear-gradient(180deg,#111a2e 0%,#0b1222 100%);
  border:1px solid rgba(110,161,255,.22);
  box-shadow:0 0 0 1px rgba(2,6,23,.6),0 24px 64px -12px rgba(2,6,23,.8),0 0 48px -8px rgba(47,111,237,.35),inset 0 1px 0 rgba(255,255,255,.06);
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:mmg-panel-in 320ms cubic-bezier(.34,1.56,.64,1) both;}
.mmg-panel.mmg-fakepanel{border-color:rgba(244,63,94,.28);}
.mmg-head{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 2px 0 6px;}
.mmg-badge{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:8px;
  background:linear-gradient(135deg,#2f6fed,#14b8a6);box-shadow:0 0 14px rgba(47,111,237,.55);}
.mmg-title{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.15;}
.mmg-title b{font-size:15px;font-weight:700;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mmg-title span{font-size:11px;color:#8b9bbd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mmg-step{flex:none;font-size:11px;font-weight:700;color:#bcd2ff;padding:3px 8px;border-radius:999px;
  background:rgba(47,111,237,.18);border:1px solid rgba(110,161,255,.35);font-variant-numeric:tabular-nums;}
.mmg-chip-fake{flex:none;font-size:10px;font-weight:700;color:#fecdd3;padding:3px 7px;border-radius:999px;background:rgba(244,63,94,.16);border:1px solid rgba(244,63,94,.35);}
.mmg-close{flex:none;width:44px;height:44px;display:grid;place-items:center;border-radius:12px;border:1px solid rgba(148,163,184,.18);
  background:rgba(15,23,42,.6);color:#cbd5e1;font-size:18px;cursor:pointer;transition:background 150ms,border-color 150ms,color 150ms,transform 150ms;}
.mmg-close:hover{background:rgba(244,63,94,.16);border-color:rgba(244,63,94,.45);color:#fff;}
.mmg-close:active{transform:scale(.94);}
.mmg-close:focus-visible{outline:2px solid #6ea1ff;outline-offset:2px;}
.mmg-stage{position:relative;width:100%;aspect-ratio:4/3;border-radius:12px;overflow:hidden;background:#070b16;
  box-shadow:inset 0 0 0 1px rgba(110,161,255,.14);}
.mmg-foot{display:flex;align-items:center;justify-content:center;gap:10px;min-height:22px;font-size:11.5px;color:#8b9bbd;text-align:center;}
.mmg-keys{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px 12px;}
.mmg-touch{display:none;font-weight:600;color:#a9b8d8;}
@media (pointer:coarse){.mmg-keys{display:none;}.mmg-touch{display:inline;}}
.mmg-foot kbd{font-family:ui-monospace,Menlo,monospace;font-size:10px;padding:1px 5px;border-radius:5px;border:1px solid rgba(148,163,184,.3);background:rgba(15,23,42,.7);color:#cbd5e1;}
.mmg-done{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;
  background:radial-gradient(circle at 50% 50%,rgba(20,184,166,.28),rgba(7,11,22,.55) 70%);animation:mmg-fadein 160ms ease both;}
.mmg-done svg{width:44%;height:auto;overflow:visible;}
.mmg-check-ring{animation:mmg-pop 420ms cubic-bezier(.34,1.56,.64,1) both;transform-box:fill-box;transform-origin:center;}
.mmg-check-path{stroke-dasharray:120;stroke-dashoffset:120;animation:mmg-draw 360ms 120ms ease-out forwards;}
.mmg-ray{animation:mmg-burst 620ms cubic-bezier(.2,.8,.3,1) both;}
.mmg-done-text{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;fill:#ccfbf1;}
.mmg-rm.mmg-done .mmg-check-path{stroke-dashoffset:0;animation:none;}
@keyframes mmg-draw{to{stroke-dashoffset:0}}
@keyframes mmg-fadein{from{opacity:0}to{opacity:1}}
@keyframes mmg-panel-in{0%{opacity:0;transform:translateY(14px) scale(.96)}100%{opacity:1;transform:none}}
.mmg-host{display:contents;}
.mmg-leaving .mmg-overlay{pointer-events:none;}
.mmg-leaving .mmg-overlay{animation:mmg-fadeout 190ms ease-in both;}
.mmg-leaving .mmg-panel{animation:mmg-panel-out 190ms cubic-bezier(.4,0,1,1) both;}
@keyframes mmg-fadeout{from{opacity:1}to{opacity:0}}
@keyframes mmg-panel-out{0%{opacity:1;transform:none}100%{opacity:0;transform:translateY(10px) scale(.95)}}
@media (max-height:460px){.mmg-panel{--chrome:68px;}.mmg-foot{display:none;}.mmg-title span{display:none;}}
@media (max-width:420px){.mmg-panel{--pad:6px;border-radius:14px;}}
@media (min-width:900px) and (min-height:700px){.mmg-panel{--pad:12px;--chrome:112px;gap:10px;}.mmg-title b{font-size:17px;}.mmg-foot{font-size:12.5px;}}
@media (prefers-reduced-motion:reduce){.mmg-overlay,.mmg-panel,.mmg-leaving .mmg-overlay,.mmg-leaving .mmg-panel{animation:none;}}
`;

let injected = false;

/** Inject the mini-game stylesheet once per document (no-op on the server). */
export function ensureMiniGameStyles(): void {
  if (injected || typeof document === 'undefined') return;
  if (document.getElementById('mmg-styles')) {
    injected = true;
    return;
  }
  const el = document.createElement('style');
  el.id = 'mmg-styles';
  el.textContent = MINIGAME_CSS;
  document.head.appendChild(el);
  injected = true;
}
