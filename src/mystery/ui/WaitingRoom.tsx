/**
 * The waiting room: a walkable Launch Bay (2D or 3D) with the room code, QR
 * and invite link, player list with ready/ping/platform, host controls, chat,
 * the wardrobe mirror and the host laptop (match settings).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { availableMaps } from '../core/maps';
import { MODES } from '../core/modes';
import { CONFIGURABLE_ROLES, ROLES } from '../core/roles';
import { BOT_LOOKS } from '../server/looks';
import { bindUi, currentContext, doUse } from '../client/controls';
import { filterProfanity } from '../client/prefs';
import { useMystery } from '../client/store';
import { BerryAvatar, colorHex, MIcon, Modal, PLATFORM_ICON, teamColors } from './common';
import { CustomizeEditor } from './CustomizeEditor';
import { GameView } from './GameView';
import { MatchSettingsPanel } from './MatchSettingsPanel';
import { Joystick, useCoarsePointer } from './TouchControls';

function inviteLink(code: string): string {
  if (typeof location === 'undefined') return code;
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('mystery', '1');
  u.searchParams.set('room', code);
  return u.toString();
}

function QrCode({ text, size = 180 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#0b1022', light: '#ffffff' } })
      .then((d) => live && setSrc(d))
      .catch(() => setSrc(''));
    return () => {
      live = false;
    };
  }, [text, size]);
  return src ? <img src={src} width={size} height={size} alt={`QR code for ${text}`} style={{ borderRadius: 12, background: '#fff' }} /> : <div style={{ width: size, height: size }} />;
}

export function WaitingRoom() {
  const room = useMystery((s) => s.room)!;
  const pid = useMystery((s) => s.pid);
  const prefs = useMystery((s) => s.prefs);
  const setPrefs = useMystery((s) => s.setPrefs);
  const send = useMystery((s) => s.send);
  const leave = useMystery((s) => s.leave);
  const toast = useMystery((s) => s.toast);
  const transport = useMystery((s) => s.transport);
  const coarse = useCoarsePointer();
  const isHost = room.hostId === pid;
  const me = room.players.find((p) => p.id === pid);
  const [panel, setPanel] = useState<null | 'wardrobe' | 'settings' | 'invite'>(null);
  const [showPlayers, setShowPlayers] = useState(() => typeof innerWidth === 'number' && innerWidth > 700);
  const [chat, setChat] = useState('');
  const [nearLabel, setNearLabel] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const tc = teamColors(prefs.colorblind !== 'none');
  const link = inviteLink(room.code);
  const mapName = useMemo(() => availableMaps().find((m) => m.id === room.settings.map)?.name ?? room.settings.map, [room.settings.map]);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bindUi({
      openWardrobe: () => setPanel('wardrobe'),
      openSettings: () => setPanel('settings'),
      openMenu: () => setPanel(null),
    });
    const t = setInterval(() => {
      setNearLabel(currentContext.use?.label ?? null);
      setNow(performance.now());
    }, 150);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [room.chat.length]);

  const roomAt = useMystery((s) => s.roomAt);
  const countdown = room.stage === 'countdown' && room.countdownEnds !== null ? Math.max(0, Math.ceil(room.countdownEnds - room.now - (now - roomAt) / 1000)) : null;
  const roleSummary = CONFIGURABLE_ROLES.filter((r) => room.settings.roles[r].count > 0).map((r) => `${room.settings.roles[r].count}× ${ROLES[r].name}`);
  const v = room.validation;
  const copy = (text: string, what: string) =>
    navigator.clipboard?.writeText(text).then(
      () => toast(`${what} copied`, 'good'),
      () => toast('Copy failed', 'bad'),
    );

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <GameView view={prefs.view} />
      {coarse && <Joystick />}
      {/* Top bar: room code + mode/map board */}
      <div className="mm-safe" style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', gap: 10, alignItems: 'flex-start', pointerEvents: 'none', flexWrap: 'wrap' }}>
        <div className="mm-panel mm-anim-rise" style={{ padding: '10px 14px', pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="mm-btn" style={{ padding: 8, minHeight: 40 }} onClick={leave} aria-label="Leave room">
            <MIcon name="back" />
          </button>
          <div>
            <div className="mm-muted" style={{ fontSize: '0.7em', fontWeight: 800, letterSpacing: '0.12em' }}>
              {transport === 'local' ? 'SOLO ROOM' : 'ROOM CODE'}
            </div>
            <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 900, fontSize: '1.6em', letterSpacing: '0.12em' }}>{room.code}</div>
          </div>
          {transport !== 'local' && (
            <>
              <button className="mm-btn" style={{ padding: 8, minHeight: 40 }} onClick={() => copy(room.code, 'Code')} aria-label="Copy code">
                <MIcon name="copy" />
              </button>
              <button className="mm-btn" style={{ padding: 8, minHeight: 40 }} onClick={() => setPanel('invite')} aria-label="Invite (QR)">
                <MIcon name="qr" />
              </button>
            </>
          )}
        </div>
        <div className="mm-panel mm-anim-rise" style={{ padding: '10px 14px', pointerEvents: 'auto', maxWidth: 420, background: `linear-gradient(150deg, ${MODES[room.settings.mode].colors[0]}88, transparent 70%), var(--mm-panel)` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '1.1em' }}>{MODES[room.settings.mode].name}</b>
            <span className="mm-muted">· {mapName}</span>
            <span className="mm-chip">{room.settings.view === 'choice' ? 'View: your choice' : `View: ${room.settings.view}`}</span>
          </div>
          <div className="mm-muted" style={{ fontSize: '0.8em', marginTop: 4 }}>
            {room.settings.mode === 'hideseek' ? `${room.settings.hnsSeekers} seeker(s) · ${room.settings.durationMin || 5} min` : roleSummary.join(' · ')}
          </div>
          <button className="mm-btn" style={{ marginTop: 8, minHeight: 36, padding: '4px 12px' }} onClick={() => setPanel('settings')}>
            <MIcon name="gear" size={16} /> {isHost ? 'Match settings' : 'View settings'}
          </button>
        </div>
      </div>

      {/* Players panel */}
      <div className="mm-safe" style={{ position: 'absolute', top: coarse ? 150 : 96, right: 0, width: showPlayers ? 'min(340px, 92vw)' : undefined, pointerEvents: 'none', bottom: 120 }}>
        <div className="mm-panel" style={{ pointerEvents: 'auto', padding: 12, display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
          <button className="mm-btn" style={{ minHeight: 36, padding: '4px 10px', justifyContent: 'space-between' }} onClick={() => setShowPlayers((x) => !x)} aria-expanded={showPlayers}>
            <MIcon name="users" size={16} />
            <b>
              {room.players.length}/{room.settings.maxPlayers}
            </b>
            {showPlayers ? 'Hide' : 'Players'}
          </button>
          {showPlayers && (
            <>
              <div className="mm-scroll" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, flex: 1 }}>
                {room.players.map((p) => (
                  <div key={p.id} className="mm-anim-rise" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 12, background: p.id === pid ? 'rgba(47,111,237,0.18)' : 'rgba(255,255,255,0.03)' }}>
                    <BerryAvatar cosmetics={p.cosmetics} size={40} animate={false} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.host && <span title="Host">👑 </span>}
                        {p.name}
                        {p.id === pid && <span className="mm-muted"> (you)</span>}
                      </div>
                      <div className="mm-muted" style={{ fontSize: '0.72em', display: 'flex', gap: 6 }}>
                        <span title={p.platform}>{PLATFORM_ICON[p.platform] ?? '•'} {p.kind === 'bot' ? 'Marion agent' : p.kind === 'agent' ? 'Agent' : p.platform}</span>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: colorHex(p.cosmetics.color), display: 'inline-block', marginTop: 2 }} />
                        {!p.connected && <span style={{ color: 'var(--mm-gold)' }}>reconnecting…</span>}
                      </div>
                    </div>
                    <span className="mm-chip" style={{ color: p.ready ? tc.good : undefined }}>
                      {p.ready ? '✓ Ready' : '…'}
                    </span>
                    {isHost && p.id !== pid && (
                      <button className="mm-btn" style={{ minHeight: 32, padding: 6 }} onClick={() => send(p.kind === 'bot' ? { t: 'host.removeBot', pid: p.id } : { t: 'host.kick', pid: p.id })} aria-label={`Remove ${p.name}`}>
                        <MIcon name="close" size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {isHost && (
                <div style={{ marginTop: 8 }}>
                  <div className="mm-muted" style={{ fontSize: '0.72em', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 4 }}>
                    ADD A MARION AGENT
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {Object.entries(BOT_LOOKS).map(([id, l]) => (
                      <button key={id} className="mm-btn" title={l.persona} style={{ minHeight: 34, padding: '2px 8px', fontSize: '0.8em' }} onClick={() => send({ t: 'host.addBot', look: id })} disabled={room.players.length >= room.settings.maxPlayers}>
                        + {l.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Lobby chat */}
              {room.settings.chat && (
                <div style={{ marginTop: 8 }}>
                  <div className="mm-scroll" style={{ maxHeight: 110, fontSize: '0.82em', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {room.chat.map((c) => {
                      const who = room.players.find((p) => p.id === c.from);
                      return (
                        <div key={c.id} style={{ color: c.from === 'system' ? 'var(--mm-muted)' : undefined }}>
                          {who && <b style={{ color: colorHex(who.cosmetics.color) }}>{who.name}: </b>}
                          {prefs.profanityFilter ? filterProfanity(c.text) : c.text}
                        </div>
                      );
                    })}
                    <div ref={chatEnd} />
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (chat.trim()) send({ t: 'lobby.chat', text: chat.trim() });
                      setChat('');
                    }}
                    style={{ display: 'flex', gap: 6, marginTop: 6 }}
                  >
                    <input className="mm-input" style={{ minHeight: 38 }} value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Say hi…" maxLength={160} aria-label="Lobby chat" />
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom: context + ready/start */}
      <div className="mm-safe" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 10, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
          {!v.ok && isHost && (
            <div className="mm-chip" style={{ color: 'var(--mm-gold)', background: 'rgba(0,0,0,0.5)' }} role="status">
              {v.errors[0]}
            </div>
          )}
          {v.ok && v.warnings[0] && isHost && <div className="mm-chip" style={{ background: 'rgba(0,0,0,0.5)' }}>{v.warnings[0]}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {nearLabel && (
              <button className="mm-btn mm-btn-gold mm-anim-pop" onClick={doUse}>
                <MIcon name="use" /> {nearLabel}
              </button>
            )}
            <button className="mm-btn" onClick={() => setPanel('wardrobe')}>
              <MIcon name="shirt" /> Wardrobe
            </button>
            {(prefs.cosmetics.emotes.length ? prefs.cosmetics.emotes : ['wave']).slice(0, 4).map((e) => (
              <button key={e} className="mm-btn" style={{ padding: '6px 10px', textTransform: 'capitalize' }} onClick={() => send({ t: 'lobby.emote', id: e })}>
                {e}
              </button>
            ))}
            {!isHost && (
              <button className={`mm-btn ${me?.ready ? '' : 'mm-btn-primary'}`} onClick={() => send({ t: 'lobby.ready', ready: !me?.ready })}>
                <MIcon name="ready" /> {me?.ready ? 'Not ready' : 'Ready!'}
              </button>
            )}
            {isHost &&
              (room.stage === 'countdown' ? (
                <button className="mm-btn" onClick={() => send({ t: 'host.cancel' })}>
                  Cancel start
                </button>
              ) : (
                <button className="mm-btn mm-btn-primary" style={{ minWidth: 160 }} onClick={() => send({ t: 'host.start' })} disabled={room.players.length + Math.max(0, room.settings.bots - room.players.filter((p) => p.kind === 'bot').length) < 4}>
                  <MIcon name="play" /> Start match
                </button>
              ))}
          </div>
          {isHost && room.players.length < 4 && (
            <div className="mm-muted" style={{ fontSize: '0.78em', background: 'rgba(0,0,0,0.45)', padding: '4px 10px', borderRadius: 999 }}>
              Need 4+ players — add Marion agents or set “Fill with Marion bots” in settings.
            </div>
          )}
        </div>
      </div>

      {countdown !== null && (
        <div className="mm-anim-fade" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'radial-gradient(circle, rgba(47,111,237,0.25), transparent 60%)' }}>
          <div key={countdown} className="mm-title mm-anim-pop" style={{ fontSize: 'clamp(90px, 22vw, 200px)' }}>
            {countdown || 'GO'}
          </div>
        </div>
      )}

      {panel === 'wardrobe' && (
        <Modal title="Wardrobe" onClose={() => setPanel(null)} wide>
          <CustomizeEditor
            value={prefs.cosmetics}
            onChange={(c) => setPrefs({ cosmetics: c })}
            name={prefs.name}
            onNameChange={(n) => setPrefs({ name: n.slice(0, 16) })}
            preview={prefs.view === '2d' ? '2d' : '3d'}
            takenColors={room.players.filter((p) => p.id !== pid).map((p) => p.cosmetics.color)}
          />
        </Modal>
      )}
      {panel === 'settings' && (
        <Modal title={isHost ? 'Match settings' : 'Match settings (host only)'} onClose={() => setPanel(null)} wide>
          <MatchSettingsPanel room={room} isHost={isHost} />
        </Modal>
      )}
      {panel === 'invite' && (
        <Modal title="Invite players" onClose={() => setPanel(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <QrCode text={link} size={200} />
            <div className="mm-muted">Scan with an iPhone camera on the same Wi-Fi, or share the code:</div>
            <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 900, fontSize: '2.2em', letterSpacing: '0.18em' }}>{room.code}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="mm-btn" onClick={() => copy(room.code, 'Code')}>
                <MIcon name="copy" /> Copy code
              </button>
              <button className="mm-btn" onClick={() => copy(link, 'Invite link')}>
                <MIcon name="copy" /> Copy link
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button className="mm-btn mm-btn-primary" onClick={() => void navigator.share?.({ title: 'Marion Mystery', text: `Join my Marion Mystery room: ${room.code}`, url: link }).catch(() => {})}>
                  Share…
                </button>
              )}
            </div>
            {room.lan && <div className="mm-muted" style={{ fontSize: '0.8em' }}>LAN tip: phones must open this host’s address (shown in the server console), not localhost.</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
