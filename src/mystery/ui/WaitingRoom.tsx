/**
 * The waiting room: a walkable Launch Bay (2D or 3D) with the lobby board
 * (room code + copy, room settings, capacity, preset, privacy toggle,
 * edit/view settings), a settings summary, the crew list with ready / ping /
 * platform, host controls, chat, the wardrobe mirror, invite (QR) and the
 * "waiting for players" bar + host prompt.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { availableMaps } from '../core/maps';
import { MODES } from '../core/modes';
import { CONFIGURABLE_ROLES, ROLES } from '../core/roles';
import { PRESETS, type Settings } from '../core/settings';
import { BOT_LOOKS } from '../server/looks';
import { bindUi, currentContext, doUse } from '../client/controls';
import { filterProfanity } from '../client/prefs';
import { useMystery } from '../client/store';
import { BerryAvatar, colorHex, MIcon, Modal, PLATFORM_ICON, readable, teamColors } from './common';
import { CustomizeEditor } from './CustomizeEditor';
import { QuickBuy, SeedCounter } from './Shop';
import { GameView } from './GameView';
import { Hazard, Kbd, Presence, useViewport } from './kit';
import { MatchSettingsPanel } from './MatchSettingsPanel';
import { SettingsMenu } from './Menus';
import { Joystick, useCoarsePointer } from './TouchControls';
import { useLiveStatus } from '../../agents/liveStatus';
import { statusLine } from '../server/agentHub';
import type { LobbyPlayer } from '../net/protocol';

/** Live "what I'm working on" row under a Marion agent's name (spinner while working). */
function AgentStatusRow({ player }: { player: LobbyPlayer }) {
  const live = useLiveStatus((s) => (player.look ? s.agents[player.look] : undefined));
  const st = player.status ?? live ?? null;
  const text = statusLine(st);
  if (!st || !text) return null;
  const busy = st.state === 'working';
  return (
    <div className="mml-status" data-busy={busy} title={st.detail || text}>
      <span className={busy ? 'mml-status-spin' : 'mml-status-dot'} role="img" aria-label={busy ? 'Working' : 'Idle'} />
      <span className="mml-status-txt">{text}</span>
    </div>
  );
}

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
  return src ? <img src={src} width={size} height={size} alt={`QR code for ${text}`} className="mml-qr" /> : <div style={{ width: size, height: size }} />;
}

function presetName(s: Settings): string {
  for (const p of PRESETS) {
    const a = p.apply(s) as unknown as Record<string, unknown>;
    const b = s as unknown as Record<string, unknown>;
    if (Object.keys(b).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))) return p.name;
  }
  return 'Custom';
}

/** One line per headline setting (left column, like a ship's notice board). */
function summaryLines(s: Settings, roleSummary: string[]): [string, string][] {
  const out: [string, string][] = [];
  if (s.mode === 'hideseek') out.push(['Seekers', String(s.hnsSeekers)], ['Hide time', `${s.hnsHideTime}s`]);
  else out.push(['Roles', roleSummary.join(', ') || 'Crew only']);
  out.push(['Player speed', `${s.playerSpeed}×`]);
  if (s.mode !== 'hideseek') {
    out.push(['Kill cooldown', `${s.killCooldown}s`]);
    out.push(['Meetings', `${s.emergencyMeetings} each · ${s.emergencyCooldown}s cooldown`]);
    out.push(['Discuss / vote', `${s.discussionTime}s / ${s.votingTime}s`]);
  }
  out.push(['Tasks', `${s.tasksCommon} common · ${s.tasksShort} short · ${s.tasksLong} long`]);
  out.push(['Match timer', s.durationMin ? `${s.durationMin} min` : 'Off']);
  if (s.mode !== 'hideseek') out.push(['Confirm ejects', s.confirmEjects ? 'On' : 'Off']);
  return out;
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
  const vp = useViewport();
  // Matches the CSS breakpoint: narrow windows and short landscape phones share the compact lobby.
  const narrow = vp.w < 760 || (vp.h <= 500 && vp.w > vp.h);
  const isHost = room.hostId === pid;
  const me = room.players.find((p) => p.id === pid);
  const host = room.players.find((p) => p.id === room.hostId);
  const [panel, setPanel] = useState<null | 'wardrobe' | 'settings' | 'invite' | 'menu'>(null);
  // Compact screens start with the crew list and board tucked away (the top buttons open them).
  const [showPlayers, setShowPlayers] = useState(() => !narrow);
  const [showBoard, setShowBoard] = useState(() => !narrow);
  const [chat, setChat] = useState('');
  const [nearLabel, setNearLabel] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showBots, setShowBots] = useState(false);
  /** Locked wardrobe item offered for purchase. */
  const [buyKey, setBuyKey] = useState<string | null>(null);
  const tc = teamColors(prefs.colorblind !== 'none');
  const link = inviteLink(room.code);
  const mapName = useMemo(() => availableMaps().find((m) => m.id === room.settings.map)?.name ?? room.settings.map, [room.settings.map]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const s = room.settings;

  useEffect(() => {
    bindUi({
      openWardrobe: () => setPanel('wardrobe'),
      openSettings: () => setPanel('settings'),
      openMenu: () => setPanel((p) => (p ? null : 'menu')),
    });
    const t = setInterval(() => {
      setNearLabel(currentContext.use?.label ?? null);
      setNow(performance.now());
    }, 150);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [room.chat.length]);

  const roomAt = useMystery((st) => st.roomAt);
  const countdown = room.stage === 'countdown' && room.countdownEnds !== null ? Math.max(0, Math.ceil(room.countdownEnds - room.now - (now - roomAt) / 1000)) : null;
  const roleSummary = CONFIGURABLE_ROLES.filter((r) => s.roles[r].count > 0).map((r) => `${s.roles[r].count}× ${ROLES[r].name}`);
  const v = room.validation;
  const preset = useMemo(() => presetName(s), [s]);
  const botFill = Math.max(0, s.bots - room.players.filter((p) => p.kind === 'bot').length);
  const total = room.players.length + botFill;
  const need = Math.max(0, 4 - total);
  const humansReady = room.players.filter((p) => p.kind !== 'bot' && p.id !== room.hostId).every((p) => p.ready);
  const copy = (text: string, what: string) =>
    navigator.clipboard?.writeText(text).then(
      () => {
        toast(`${what} copied`, 'good');
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => toast('Copy failed', 'bad'),
    );
  const privacyNext = s.privacy === 'code' ? 'public' : 'code';
  const lines = summaryLines(s, roleSummary);

  return (
    <div className="mml">
      <GameView view={prefs.view} />
      {coarse && <Joystick />}

      {/* Top-left: leave + mode */}
      <div className="mml-tl mm-safe">
        <button className="mm-round" onClick={leave} aria-label="Leave room">
          <MIcon name="back" />
        </button>
        <span className="mml-mode mm-in-down">
          <b>{MODES[s.mode].name}</b>
          {narrow && !showBoard ? <span className="mml-mode-code">Code {room.code}</span> : <span>{mapName}</span>}
        </span>
      </div>

      {/* Left: notice-board summary + crew list */}
      <div className="mml-left mm-safe">
        {!narrow && (
          <ul className="mml-summary" aria-label="Match settings summary">
            {lines.map(([k, val], i) => (
              <li key={k} style={{ ['--i' as string]: i }}>
                <MIcon name="gear" size={18} />
                <span>
                  <b>{k}</b> — {val}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Presence show={showPlayers} anim="left" className="mml-crew">
          <div className="mml-crew-head">
            <MIcon name="users" size={18} />
            <span>Crew aboard</span>
            <b>
              {room.players.length}/{s.maxPlayers}
            </b>
            {isHost && (
              <button className="mm-round sm" onClick={() => setShowBots((x) => !x)} aria-expanded={showBots} aria-label={showBots ? 'Hide agent list' : 'Add a Marion agent'} data-active={showBots}>
                <MIcon name={showBots ? 'close' : 'plus'} size={14} />
              </button>
            )}
          </div>
          <div className="mm-scroll mml-crew-list">
            {room.players.map((p, i) => (
              <div key={p.id} className="mml-player" data-you={p.id === pid} style={{ ['--i' as string]: i }}>
                <BerryAvatar cosmetics={p.cosmetics} size={38} animate={false} />
                <div className="mml-player-txt">
                  <div className="mml-player-name">
                    {p.host && (
                      <span className="mml-hosttag" title="Host">
                        <MIcon name="crown" size={13} />
                      </span>
                    )}
                    <span className="mm-nocase">{p.name}</span>
                    {p.id === pid && <span className="mm-muted"> (you)</span>}
                  </div>
                  <div className="mml-player-sub">
                    <span title={p.platform}>
                      {PLATFORM_ICON[p.platform] ?? '•'} {p.kind === 'bot' ? 'Marion agent' : p.kind === 'agent' ? 'Agent' : p.platform}
                    </span>
                    <span className="mml-swatch" style={{ background: colorHex(p.cosmetics.color) }} />
                    {!p.connected && <span style={{ color: 'var(--mm-yellow)' }}>reconnecting…</span>}
                  </div>
                  <AgentStatusRow player={p} />
                </div>
                <span className="mml-ready" data-on={p.ready} style={{ color: p.ready ? tc.good : undefined }}>
                  {p.ready ? '✓ Ready' : '…'}
                </span>
                {isHost && p.id !== pid && (
                  <button className="mm-round sm" onClick={() => send(p.kind === 'bot' ? { t: 'host.removeBot', pid: p.id } : { t: 'host.kick', pid: p.id })} aria-label={`Remove ${p.name}`}>
                    <MIcon name="close" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isHost && showBots && (
            <div className="mml-bots mm-in-down">
              <div className="mm-label">Add a Marion agent</div>
              <div className="mml-bots-row">
                {Object.entries(BOT_LOOKS).map(([id, l]) => (
                  <button key={id} className="mm-btn sm" title={l.persona} onClick={() => send({ t: 'host.addBot', look: id })} disabled={room.players.length >= s.maxPlayers}>
                    + <span className="mm-nocase">{l.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {s.chat && (
            <div className="mml-chat">
              <div className="mm-scroll mml-chatlog">
                {room.chat.map((c) => {
                  const who = room.players.find((p) => p.id === c.from);
                  return (
                    <div key={c.id} className="mm-nocase" style={{ color: c.from === 'system' ? 'var(--mm-muted)' : undefined }}>
                      {who && <b style={{ color: readable(colorHex(who.cosmetics.color)) }}>{who.name}: </b>}
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
              >
                <input className="mm-input" value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Say hi…" maxLength={160} aria-label="Lobby chat" />
              </form>
            </div>
          )}
        </Presence>
      </div>

      {/* Right: top buttons + lobby board */}
      <div className="mml-right mm-safe">
        <div className="mml-topbtns mm-in-right">
          <button className="mmh-sq" onClick={() => setShowPlayers((x) => !x)} aria-label={showPlayers ? 'Hide crew list and chat' : 'Show crew list and chat'} data-active={showPlayers}>
            <MIcon name="chat" size={24} />
          </button>
          <button className="mmh-sq" onClick={() => setPanel('menu')} aria-label="Settings menu">
            <MIcon name="gear" size={24} />
            <Kbd code="Escape" className="mmh-sq-key" />
          </button>
          {transport !== 'local' && (
            <button className="mmh-sq" onClick={() => setPanel('invite')} aria-label="Invite (QR)">
              <MIcon name="qr" size={24} />
            </button>
          )}
          {narrow && (
            <button className="mmh-sq" onClick={() => setShowBoard((x) => !x)} aria-label={showBoard ? 'Hide room board' : 'Show room board'} aria-expanded={showBoard} data-active={showBoard}>
              <MIcon name="tablet" size={24} />
            </button>
          )}
        </div>
        <Presence show={showBoard || !narrow} anim="right" className="mml-board">
          <div className="mml-codehead">
            <div>
              <div className="mm-label">{transport === 'local' ? 'Solo room' : 'Room code'}</div>
              <div className="mml-code">{room.code}</div>
            </div>
            {transport !== 'local' && (
              <button className="mml-copy" data-done={copied} onClick={() => copy(room.code, 'Code')} aria-label="Copy code">
                <MIcon name={copied ? 'check' : 'copy'} size={22} />
              </button>
            )}
          </div>
          <div className="mml-sep" />
          <div className="mm-label">Room settings</div>
          <div className="mml-modename">{MODES[s.mode].name}</div>
          <div className="mml-mapname">{mapName}</div>
          <div className="mml-rows">
            <span className="mml-k">Capacity</span>
            <span className="mml-v">
              <MIcon name="users" size={18} /> {room.players.length}/{s.maxPlayers}
            </span>
            <span className="mml-k">Preset</span>
            <span className="mml-v">{preset}</span>
            <span className="mml-k">Privacy</span>
            <button
              className="mml-v mml-privacy"
              data-mode={s.privacy}
              disabled={!isHost || transport === 'local'}
              onClick={() => send({ t: 'host.settings', settings: { privacy: privacyNext } })}
              aria-label={`Privacy: ${s.privacy === 'code' ? 'private' : s.privacy}. ${isHost ? 'Switch' : 'Host only'}`}
            >
              <MIcon name={s.privacy === 'code' ? 'lock' : 'unlock'} size={16} />
              {s.privacy === 'code' ? 'Private' : s.privacy === 'lan' ? 'LAN' : 'Public'}
            </button>
          </div>
          <div className="mm-label">Game settings</div>
          <div className="mml-edit">
            <button className="mm-btn mm-btn-primary" disabled={!isHost} onClick={() => setPanel('settings')} aria-label="Edit match settings">
              Edit
            </button>
            <button className="mm-btn mm-btn-primary" onClick={() => setPanel('settings')} aria-label="View match settings">
              View
            </button>
          </div>
        </Presence>
      </div>

      {/* Bottom: host line, waiting bar, host prompt, actions */}
      <div className="mml-bottom mm-safe">
        {!v.ok && isHost && (
          <div className="mm-chip warn" role="status">
            {v.errors[0]}
          </div>
        )}
        {v.ok && v.warnings[0] && isHost && <div className="mm-chip">{v.warnings[0]}</div>}
        <div className="mml-hostline">
          <span className="mm-label">Host:</span>
          {host && <BerryAvatar cosmetics={host.cosmetics} size={30} animate={false} />}
          <b className="mm-nocase">{host?.name}</b>
          {isHost && <span className="mm-muted">(You)</span>}
        </div>
        <div className="mml-wait" data-ok={need === 0} role="status">
          <i aria-hidden />
          <span>{need > 0 ? 'Waiting for players' : isHost ? (humansReady ? 'Crew assembled' : 'Waiting for ready-ups') : 'Waiting for the host'}</span>
          {need > 0 && <small>{need} more needed</small>}
        </div>
        {isHost && room.stage !== 'countdown' && (
          <div className="mml-pill" key={need > 0 ? 'wait' : 'go'}>
            {need > 0 ? 'You’re the host — add agents or invite friends' : 'You’re the host — launch when ready'}
          </div>
        )}
        <div className="mml-actions">
          <Presence show={!!nearLabel} anim="pop" className="mml-use-wrap">
            <button className="mm-btn mm-btn-gold" onClick={doUse}>
              <MIcon name="use" /> {nearLabel}
              <Kbd k="use" />
            </button>
          </Presence>
          <button className="mm-btn" onClick={() => setPanel('wardrobe')}>
            <MIcon name="hanger" /> Wardrobe
          </button>
          {transport !== 'local' && (
            <button className="mm-btn" onClick={() => setPanel('invite')} aria-label="Invite">
              <MIcon name="invite" /> Invite
            </button>
          )}
          {!coarse &&
            (prefs.cosmetics.emotes.length ? prefs.cosmetics.emotes : ['wave']).slice(0, 4).map((e, i) => (
              <button key={e} className="mm-btn sm mml-emote" onClick={() => send({ t: 'lobby.emote', id: e })}>
                <kbd className="mm-kbd inline">{i + 1}</kbd> {e}
              </button>
            ))}
          {!isHost && (
            <button className={`mm-btn mm-pill ${me?.ready ? '' : 'mm-btn-primary'}`} onClick={() => send({ t: 'lobby.ready', ready: !me?.ready })}>
              <MIcon name="ready" /> {me?.ready ? 'Not ready' : 'Ready!'}
            </button>
          )}
          {isHost &&
            (room.stage === 'countdown' ? (
              <button className="mm-btn mm-pill mm-btn-danger" onClick={() => send({ t: 'host.cancel' })}>
                Cancel start
              </button>
            ) : (
              <button className="mm-btn mm-btn-primary mm-pill mml-start" onClick={() => send({ t: 'host.start' })} disabled={total < 4}>
                <MIcon name="play" /> Start match
              </button>
            ))}
        </div>
      </div>

      {countdown !== null && (
        <div className="mml-count" aria-live="assertive">
          <Hazard className="mml-count-haz top" />
          <div key={countdown} className="mml-count-num">
            {countdown || 'GO'}
          </div>
          <div className="mml-count-sub">Launching</div>
          <Hazard className="mml-count-haz bottom" />
        </div>
      )}

      {panel === 'wardrobe' && (
        <Modal title="Wardrobe" onClose={() => setPanel(null)} wide>
          <SeedCounter value={prefs.seeds} className="mml-wallet" />
          <CustomizeEditor
            value={prefs.cosmetics}
            onChange={(c) => setPrefs({ cosmetics: c })}
            name={prefs.name}
            onNameChange={(n) => setPrefs({ name: n.slice(0, 16) })}
            preview={prefs.view === '2d' ? '2d' : '3d'}
            takenColors={room.players.filter((p) => p.id !== pid).map((p) => p.cosmetics.color)}
            onDone={() => setPanel(null)}
            owned={prefs.owned}
            onLocked={setBuyKey}
          />
          {buyKey && <QuickBuy itemKey={buyKey} onClose={() => setBuyKey(null)} />}
        </Modal>
      )}
      {panel === 'settings' && (
        <Modal title={isHost ? 'Match settings' : 'Match settings (host only)'} onClose={() => setPanel(null)} wide>
          <MatchSettingsPanel room={room} isHost={isHost} />
        </Modal>
      )}
      {panel === 'menu' && (
        <Modal title="Settings" onClose={() => setPanel(null)} wide>
          <SettingsMenu startTab="match" inMatch={{ code: room.code, mode: MODES[s.mode].name, map: mapName, onResume: () => setPanel(null), onLeave: leave }} />
        </Modal>
      )}
      {panel === 'invite' && (
        <Modal title="Invite players" onClose={() => setPanel(null)}>
          <div className="mml-invite">
            <QrCode text={link} size={200} />
            <div className="mm-muted">Scan with an iPhone camera on the same Wi-Fi, or share the code:</div>
            <div className="mml-code big">{room.code}</div>
            <div className="mml-invite-btns">
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
