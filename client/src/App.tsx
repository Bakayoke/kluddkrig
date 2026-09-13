import { useEffect, useRef, useState } from 'react'
import {
  backToLobby,
  clearSession,
  createGame,
  ensureSessionBound,
  fetchRoomPreview,
  joinGame,
  loadSession,
  rematch,
  saveSession,
  sendInput,
  setHostPlaying,
  setLanguage,
  setPublicLobby,
  setRoomHandler,
  startGame,
  submitDoodle,
  subscribeConnection,
  type ConnState,
} from './api'
import { ArenaView } from './ArenaView'
import { DoodleCanvas } from './DoodleCanvas'
import { fmt, t } from './i18n'
import { JoinQr } from './qr'
import type { Lang, PublicRoom, RoomPreview } from './types'

const KLOTTERKAOS_URL = 'https://klotterkaos.com'
const FACTOPIA_URL = 'https://factopia.net'
const PARTYPATHS_URL = 'https://partypaths.com'
const SABOTEXT_URL = 'https://sabotext.com'
const YOURTASKIS_URL = 'https://yourtaskis.com'
const SCOURGEBORN_URL = 'https://scourgeborn.com'

function SisterGames({ compact }: { compact?: boolean }) {
  return (
    <div className={`sister-games${compact ? ' compact' : ''}`}>
      <a className="sister-game" href={KLOTTERKAOS_URL} target="_blank" rel="noreferrer">
        <strong>Klotterkaos</strong>
      </a>
      <a className="sister-game" href={FACTOPIA_URL} target="_blank" rel="noreferrer">
        <strong>Factopia</strong>
      </a>
      <a className="sister-game" href={PARTYPATHS_URL} target="_blank" rel="noreferrer">
        <strong>Party Paths</strong>
      </a>
      <a className="sister-game" href={SABOTEXT_URL} target="_blank" rel="noreferrer">
        <strong>Sabotext</strong>
      </a>
      <a className="sister-game" href={YOURTASKIS_URL} target="_blank" rel="noreferrer">
        <strong>Your Task Is</strong>
      </a>
      <a className="sister-game" href={SCOURGEBORN_URL} target="_blank" rel="noreferrer">
        <strong>Scourgeborn</strong>
      </a>
    </div>
  )
}

function useCountdown(endsAt: number) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [endsAt])
  return left
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}

function Home({
  lang,
  setLang,
  onCreated,
  onOpenJoin,
}: {
  lang: Lang
  setLang: (l: Lang) => void
  onCreated: (room: PublicRoom, playerId: string, name: string, hostPlays: boolean) => void
  onOpenJoin: (code?: string) => void
}) {
  const ui = t(lang)
  const [name, setName] = useState('')
  const [hostPlays, setHostPlaysLocal] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await createGame(name || (lang === 'en' ? 'Host' : 'Värd'), lang, false, hostPlays)
      if (!res.ok) {
        setError(res.error ?? 'Error')
        return
      }
      onCreated(res.room, res.playerId, name, hostPlays)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="home">
      <header className="hero">
        <p className="brand">Kluddkrig</p>
        <p className="tagline">{ui.tagline}</p>
      </header>

      <div className="lang-row">
        <span>{ui.language}</span>
        <button type="button" className={lang === 'sv' ? 'chip active' : 'chip'} onClick={() => setLang('sv')}>
          SV
        </button>
        <button type="button" className={lang === 'en' ? 'chip active' : 'chip'} onClick={() => setLang('en')}>
          EN
        </button>
      </div>

      <section className="panel">
        <label>
          {ui.name}
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </label>
        <label className="check">
          <input type="checkbox" checked={hostPlays} onChange={(e) => setHostPlaysLocal(e.target.checked)} />
          {hostPlays ? ui.hostPlays : ui.hostTvOnly}
        </label>
        <button type="button" className="btn primary wide" disabled={busy} onClick={() => void create()}>
          {ui.create}
        </button>
      </section>

      <section className="panel">
        <button type="button" className="btn wide" disabled={busy} onClick={() => onOpenJoin()}>
          {ui.join}
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="how">
        <h2>{ui.howTo}</h2>
        <ol>
          <li>{ui.how1}</li>
          <li>{ui.how2}</li>
          <li>{ui.how3}</li>
          <li>{ui.how4}</li>
        </ol>
      </section>

      <p className="sister-label">{ui.sister}</p>
      <SisterGames />
    </div>
  )
}

function JoinScreen({
  lang,
  initialCode,
  onJoined,
  onBack,
}: {
  lang: Lang
  initialCode: string
  onJoined: (room: PublicRoom, playerId: string, name: string) => void
  onBack: () => void
}) {
  const ui = t(lang)
  const [step, setStep] = useState<'code' | 'name'>(initialCode.length === 4 ? 'name' : 'code')
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState('')
  const [preview, setPreview] = useState<RoomPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (code.length !== 4) {
      setPreview(null)
      return
    }
    void fetchRoomPreview(code)
      .then(setPreview)
      .catch(() => setPreview(null))
  }, [code])

  async function goName(e: React.FormEvent) {
    e.preventDefault()
    if (code.length < 4) return
    setStep('name')
  }

  async function doJoin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await joinGame(code, name || (lang === 'en' ? 'Player' : 'Spelare'))
      if (!res.ok) {
        setError(res.error ?? 'Error')
        return
      }
      onJoined(res.room, res.playerId, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="home join-screen">
      <header className="hero compact">
        <p className="brand">Kluddkrig</p>
        <p className="tagline">{ui.joinTitle}</p>
      </header>

      {step === 'code' && (
        <form className="panel" onSubmit={(e) => void goName(e)}>
          <label>
            {ui.code}
            <input
              value={code}
              maxLength={4}
              autoFocus
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
              placeholder="ABCD"
            />
          </label>
          <button type="submit" className="btn primary wide" disabled={code.length < 4}>
            {ui.join}
          </button>
          <button type="button" className="btn ghost wide" onClick={onBack}>
            {ui.back}
          </button>
        </form>
      )}

      {step === 'name' && (
        <form className="panel" onSubmit={(e) => void doJoin(e)}>
          <h2>
            {ui.joinCodeHint} <span className="code-inline">{code}</span>
          </h2>
          {preview && (
            <p className="muted">
              {preview.hostName} · {preview.playerCount} {ui.previewPlayers}
            </p>
          )}
          <label>
            {ui.name}
            <input
              value={name}
              maxLength={20}
              autoFocus
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button type="submit" className="btn primary wide" disabled={busy}>
            {ui.join}
          </button>
          <button
            type="button"
            className="btn ghost wide"
            onClick={() => {
              setStep('code')
              setError(null)
            }}
          >
            {ui.back}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}

function FightPad({
  hasAbility,
  abilityLabel,
  noAbilityLabel,
}: {
  hasAbility: boolean
  abilityLabel: string
  noAbilityLabel: string
}) {
  const moveRef = useRef<-1 | 0 | 1>(0)
  const lastSentRef = useRef<-1 | 0 | 1 | null>(null)
  const stickRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const activePtr = useRef<number | null>(null)

  function emitMove(axis: -1 | 0 | 1, force = false) {
    if (!force && lastSentRef.current === axis) return
    lastSentRef.current = axis
    sendInput({ move: axis })
  }

  useEffect(() => {
    // Heartbeat while held so a dropped packet does not leave you walking forever
    const id = setInterval(() => {
      const axis = moveRef.current
      if (axis !== 0) emitMove(axis, true)
    }, 180)
    return () => clearInterval(id)
  }, [])

  function setAxis(axis: -1 | 0 | 1, knobX = 0) {
    const changed = moveRef.current !== axis
    moveRef.current = axis
    const knob = knobRef.current
    if (knob) {
      knob.style.transform = `translate(calc(-50% + ${knobX}px), -50%)`
    }
    if (changed) emitMove(axis)
  }

  function axisFromClientX(clientX: number): { axis: -1 | 0 | 1; knobX: number } {
    const el = stickRef.current
    if (!el) return { axis: 0, knobX: 0 }
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const dx = Math.max(-48, Math.min(48, clientX - cx))
    const dead = 14
    if (dx < -dead) return { axis: -1, knobX: dx }
    if (dx > dead) return { axis: 1, knobX: dx }
    return { axis: 0, knobX: dx }
  }

  function onStickDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    activePtr.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    const { axis, knobX } = axisFromClientX(e.clientX)
    setAxis(axis, knobX)
  }

  function onStickMove(e: React.PointerEvent<HTMLDivElement>) {
    if (activePtr.current !== e.pointerId) return
    const { axis, knobX } = axisFromClientX(e.clientX)
    setAxis(axis, knobX)
  }

  function onStickUp(e: React.PointerEvent<HTMLDivElement>) {
    if (activePtr.current !== null && activePtr.current !== e.pointerId) return
    activePtr.current = null
    setAxis(0, 0)
  }

  return (
    <div className="pad gamepad">
      <div
        ref={stickRef}
        className="stick"
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      >
        <div ref={knobRef} className="stick-knob" />
      </div>
      <div className="pad-actions">
        <button
          type="button"
          className="pad-btn action"
          onPointerDown={(e) => {
            e.preventDefault()
            sendInput({ jump: true })
          }}
        >
          ⤒
        </button>
        <button
          type="button"
          className="pad-btn action punch"
          onPointerDown={(e) => {
            e.preventDefault()
            sendInput({ punch: true })
          }}
        >
          ✊
        </button>
        <button
          type="button"
          className="pad-btn action loot"
          disabled={!hasAbility}
          onPointerDown={(e) => {
            e.preventDefault()
            if (hasAbility) sendInput({ ability: true })
          }}
        >
          {hasAbility ? abilityLabel : noAbilityLabel}
        </button>
      </div>
    </div>
  )
}

function isFullscreenActive() {
  const doc = document as Document & { webkitFullscreenElement?: Element | null }
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement)
}

async function enterFullscreen() {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  try {
    if (el.requestFullscreen) await el.requestFullscreen()
    else el.webkitRequestFullscreen?.()
  } catch {
    /* CSS tv-mode still applies */
  }
}

async function exitFullscreen() {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void
    webkitFullscreenElement?: Element | null
  }
  try {
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen()
      else doc.webkitExitFullscreen?.()
    }
  } catch {
    /* ignore */
  }
}

function RoomView({
  room,
  playerId,
  lang,
  initialTv,
  onLeave,
}: {
  room: PublicRoom
  playerId: string
  lang: Lang
  initialTv?: boolean
  onLeave: () => void
}) {
  const ui = t(lang)
  const [tvMode, setTvMode] = useState(Boolean(initialTv))
  const [fsActive, setFsActive] = useState(() => isFullscreenActive())
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const lastEventSeq = useRef(0)
  const countdown = useCountdown(room.phaseEndsAt)
  const joinUrl = `${window.location.origin}?join=${room.code}`

  useEffect(() => {
    document.body.classList.toggle('tv-mode', tvMode)
    return () => document.body.classList.remove('tv-mode')
  }, [tvMode])

  const padMode = room.status === 'fight' && room.youPlaying && !tvMode
  useEffect(() => {
    document.body.classList.toggle('pad-mode', padMode)
    return () => document.body.classList.remove('pad-mode')
  }, [padMode])

  useEffect(() => {
    const onFs = () => {
      setFsActive(isFullscreenActive())
    }
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs as EventListener)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('webkitfullscreenchange', onFs as EventListener)
    }
  }, [])

  // Track "had fullscreen" so Escape exits TV mode properly
  const hadFs = useRef(false)
  useEffect(() => {
    if (fsActive) hadFs.current = true
    if (!fsActive && hadFs.current && tvMode) {
      hadFs.current = false
      setTvMode(false)
    }
  }, [fsActive, tvMode])

  useEffect(() => {
    const ev = room.lastEvent
    if (!ev || ev.seq <= lastEventSeq.current) return
    lastEventSeq.current = ev.seq
    const involvesYou = ev.actorId === playerId || ev.targetId === playerId
    const abilityName = ev.ability ? ui.abilityLabels[ev.ability] : ''

    if (ev.kind === 'hit') {
      const text = fmt(ui.hitMsg, { actor: ev.actorName, target: ev.targetName ?? '?' })
      setToast({ text, kind: 'hit' })
      setShake(true)
      if (involvesYou) {
        vibrate(ev.targetId === playerId ? [50, 40, 80] : [25, 30, 40])
        setFlash(ev.targetId === playerId ? 'hurt' : 'hit')
      }
      const t1 = setTimeout(() => setShake(false), 320)
      const t2 = setTimeout(() => setToast(null), 1600)
      const t3 = setTimeout(() => setFlash(null), 280)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
      }
    }
    if (ev.kind === 'loot') {
      const text = fmt(ui.lootMsg, { actor: ev.actorName, ability: abilityName })
      setToast({ text, kind: 'loot' })
      if (ev.actorId === playerId) {
        vibrate([30, 40, 30, 40, 60])
        setFlash('loot')
      }
      const t2 = setTimeout(() => setToast(null), 1800)
      const t3 = setTimeout(() => setFlash(null), 400)
      return () => {
        clearTimeout(t2)
        clearTimeout(t3)
      }
    }
    if (ev.kind === 'ability') {
      const text = fmt(ui.abilityMsg, { actor: ev.actorName, ability: abilityName })
      setToast({ text, kind: 'ability' })
      setShake(true)
      if (involvesYou) {
        vibrate([60, 30, 60])
        setFlash('ability')
      }
      const t1 = setTimeout(() => setShake(false), 280)
      const t2 = setTimeout(() => setToast(null), 1800)
      const t3 = setTimeout(() => setFlash(null), 350)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
      }
    }
    if (ev.kind === 'ko') {
      const text = fmt(ui.koMsg, { actor: ev.actorName, target: ev.targetName ?? '?' })
      setToast({ text, kind: 'ko' })
      setShake(true)
      if (involvesYou) {
        vibrate(ev.targetId === playerId ? [80, 40, 80, 40, 120] : [40, 30, 50])
        setFlash(ev.targetId === playerId ? 'hurt' : 'hit')
      }
      const t1 = setTimeout(() => setShake(false), 400)
      const t2 = setTimeout(() => setToast(null), 1800)
      const t3 = setTimeout(() => setFlash(null), 320)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
      }
    }
    if (ev.kind === 'chaos' && ev.chaosKind) {
      const label = ui.chaosLabels[ev.chaosKind] ?? ev.chaosKind
      const text = fmt(ui.chaosMsg, { event: label })
      setToast({ text, kind: 'chaos' })
      if (ev.chaosKind === 'quake' || ev.chaosKind === 'meteor') setShake(true)
      const t1 = setTimeout(() => setShake(false), 500)
      const t2 = setTimeout(() => setToast(null), 2000)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [room.lastEvent, playerId, ui])

  async function toggleTvMode() {
    if (tvMode) {
      setTvMode(false)
      hadFs.current = false
      await exitFullscreen()
      setFsActive(false)
      return
    }
    // Must run in the click handler — browsers require a user gesture
    await enterFullscreen()
    setFsActive(isFullscreenActive())
    setTvMode(true)
  }

  async function ensureFullscreen() {
    await enterFullscreen()
    setFsActive(isFullscreenActive())
  }

  const youPlaying = room.youPlaying
  const canStart = room.youAreHost && room.playingCount >= room.minPlayers

  return (
    <div className={`room${shake ? ' room-shake' : ''}`}>
      <header className="room-bar">
        <div>
          <p className="brand-sm">Kluddkrig</p>
          <p className="code-big">{room.code}</p>
        </div>
        <div className="room-actions">
          <button type="button" className="chip" onClick={() => void toggleTvMode()}>
            {tvMode ? ui.tvExit : ui.tvMode}
          </button>
          <button
            type="button"
            className="chip hide-on-tv"
            onClick={() => {
              clearSession()
              onLeave()
            }}
          >
            {ui.leave}
          </button>
        </div>
      </header>

      {toast && <div className={`combat-toast kind-${toast.kind}`}>{toast.text}</div>}
      {flash && <div className={`screen-flash flash-${flash}`} aria-hidden />}

      {room.status === 'lobby' && (
        <>
          <div className="tv-lobby-stage">
            {tvMode && !fsActive && (
              <button type="button" className="btn primary tv-fs-cta" onClick={() => void ensureFullscreen()}>
                {ui.tvFullscreen}
              </button>
            )}
            <div className="tv-lobby-qr">
              <JoinQr url={joinUrl} size={300} alt={room.code} />
              <p className="code-huge">{room.code}</p>
              <p className="muted">{ui.scanOnPhone}</p>
            </div>
            <div className="tv-roster">
              <h3>
                {ui.players} ({room.players.length})
              </h3>
              <ul className="tv-roster-list">
                {room.players.map((p) => (
                  <li
                    key={p.id}
                    className={`${p.playing ? 'is-playing' : 'is-hosting'}${p.connected ? '' : ' offline'}`}
                  >
                    <span className="tv-roster-name">{p.name}</span>
                    <span className="tv-roster-meta">
                      {p.id === room.hostId ? ui.host : p.playing ? '✓' : ui.spectator}
                      {!p.connected ? ` · ${ui.offline}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {room.youAreHost && (
                <div className="tv-start">
                  {!canStart && (
                    <p className="muted">{fmt(ui.needPlayers, { n: room.minPlayers })}</p>
                  )}
                  <button
                    type="button"
                    className="btn primary wide"
                    disabled={!canStart}
                    onClick={() => void startGame()}
                  >
                    {ui.start}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="lobby-grid hide-on-tv">
            <div className="panel">
              <JoinQr url={joinUrl} size={200} alt={room.code} />
              <p className="muted">{joinUrl}</p>
            </div>
            <div className="panel">
              <h3>{ui.waiting}</h3>
              <ul className="player-list">
                {room.players.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    {!p.connected && <em>…</em>}
                    {p.id === room.hostId && <strong> ★</strong>}
                  </li>
                ))}
              </ul>
              {room.youAreHost && (
                <div className="host-opts">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={room.players.find((p) => p.id === room.hostId)?.playing ?? true}
                      onChange={(e) => void setHostPlaying(e.target.checked)}
                    />
                    {ui.hostPlays}
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={room.isPublic}
                      onChange={(e) => void setPublicLobby(e.target.checked)}
                    />
                    {ui.publicLobby}
                  </label>
                  <button
                    type="button"
                    className="btn primary wide"
                    disabled={!canStart}
                    onClick={() => void startGame()}
                  >
                    {!canStart ? fmt(ui.needPlayers, { n: room.minPlayers }) : ui.start}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {room.status === 'doodle' && (
        <section className="phase">
          <h2>{ui.doodleTitle}</h2>
          <p className="muted">
            {fmt(ui.round, { n: room.roundIndex, max: room.maxRounds })} — {ui.doodleHint}
          </p>
          <p className="muted">
            {fmt(ui.doodleReady, { done: room.doodleDoneCount, need: room.doodleNeeded })}
          </p>
          {tvMode ? (
            <div className="avatar-grid">
              {room.players
                .filter((p) => p.playing)
                .map((p) => (
                  <div key={p.id} className="avatar-card">
                    {p.avatarDataUrl ? (
                      <img src={p.avatarDataUrl} alt={p.name} />
                    ) : (
                      <div className="avatar-empty">{p.doodleDone ? '✓' : '…'}</div>
                    )}
                    <span>{p.name}</span>
                  </div>
                ))}
            </div>
          ) : youPlaying ? (
            room.players.find((p) => p.id === playerId)?.doodleDone ? (
              <p>{ui.doodleWaiting}</p>
            ) : (
              <DoodleCanvas onSubmit={(url) => void submitDoodle(url)} submitLabel={ui.doodleDone} />
            )
          ) : (
            <p className="muted">{ui.fightTvHint}</p>
          )}
        </section>
      )}

      {room.status === 'fight' && room.fight && (
        <section className="phase fight-phase">
          {!padMode && (
            <h2>
              {ui.fightTitle} · {countdown}s · {ui.arena}: {room.arenaId}
            </h2>
          )}
          {(tvMode || !youPlaying) && (
            <ArenaView fight={room.fight} players={room.players} wide={tvMode} shake={shake} />
          )}
          {youPlaying && !tvMode && (
            <>
              <div className="fight-hud">
                {(() => {
                  const me = room.fight.fighters.find((f) => f.playerId === playerId)
                  const hp = me?.hp ?? 0
                  return (
                    <div className="hp-bar">
                      <span>
                        {ui.yourHp} {hp}
                        {padMode ? ` · ${countdown}s` : ''}
                      </span>
                      <div className="hp-track">
                        <div className="hp-fill" style={{ width: `${hp}%` }} />
                      </div>
                    </div>
                  )
                })()}
                <div className={`loot-chip${room.yourAbility ? ' ready' : ''}`}>
                  {room.yourAbility
                    ? `${ui.ability}: ${ui.abilityLabels[room.yourAbility]}`
                    : ui.noAbility}
                </div>
              </div>
              {padMode && <p className="pad-rotate-hint">{ui.padLandscape}</p>}
              {!padMode && <p className="muted">{ui.fightTvHint}</p>}
              <FightPad
                hasAbility={Boolean(room.yourAbility)}
                abilityLabel={
                  room.yourAbility ? ui.abilityLabels[room.yourAbility] : ui.ability
                }
                noAbilityLabel={ui.noAbility}
              />
            </>
          )}
        </section>
      )}

      {room.status === 'results' && (
        <section className="phase">
          <h2>
            {ui.resultsTitle} · {countdown}s
          </h2>
          <h3>{ui.scores}</h3>
          <ol className="scores">
            {room.scores.map((s) => (
              <li key={s.playerId}>
                <span>{s.name}</span>
                <strong>{s.score}</strong>
              </li>
            ))}
          </ol>
          {room.youAreHost && room.roundIndex >= room.maxRounds && (
            <button type="button" className="btn primary" onClick={() => void rematch()}>
              {ui.rematch}
            </button>
          )}
          {room.roundIndex < room.maxRounds && <p className="muted">{ui.nextRound}</p>}
          {room.youAreHost && room.roundIndex < room.maxRounds && (
            <button type="button" className="btn ghost" onClick={() => void backToLobby()}>
              {ui.rematch}
            </button>
          )}
        </section>
      )}

      {!tvMode && room.status === 'lobby' && (
        <>
          <p className="sister-label">{ui.sister}</p>
          <SisterGames compact />
        </>
      )}
    </div>
  )
}

type Screen = 'home' | 'join'

export default function App() {
  const [lang, setLang] = useState<Lang>(() =>
    navigator.language.toLowerCase().startsWith('sv') ? 'sv' : 'en',
  )
  const [screen, setScreen] = useState<Screen>('home')
  const [joinCode, setJoinCode] = useState('')
  const [room, setRoom] = useState<PublicRoom | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [startInTv, setStartInTv] = useState(false)
  const [conn, setConn] = useState<ConnState>('connecting')

  useEffect(() => subscribeConnection(setConn), [])

  useEffect(() => {
    setRoomHandler((r) => {
      setRoom(r)
      setLang(r.language)
    })
    return () => setRoomHandler(null)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const joinParam = params.get('join')
    const joinCodeFromUrl =
      joinParam && /^[A-Z]{4}$/i.test(joinParam) ? joinParam.toUpperCase() : null

    if (joinCodeFromUrl) {
      clearSession()
      setJoinCode(joinCodeFromUrl)
      setScreen('join')
      window.history.replaceState({}, '', '/')
      return
    }

    const session = loadSession()
    if (!session) return
    void (async () => {
      const res = await ensureSessionBound()
      if (res?.ok && res.room && res.playerId) {
        setRoom(res.room)
        setPlayerId(res.playerId)
        setLang(res.room.language)
      }
    })()
  }, [])

  function enter(r: PublicRoom, pid: string, name: string, opts?: { tv?: boolean }) {
    saveSession({ code: r.code, playerId: pid, name })
    setRoom(r)
    setPlayerId(pid)
    setLang(r.language)
    setStartInTv(Boolean(opts?.tv))
    if (r.youAreHost) void setLanguage(lang)
  }

  const ui = t(lang)

  return (
    <div className="app">
      <div className={`conn hide-on-tv ${conn}`}>
        {conn === 'connected' ? ui.connected : conn === 'connecting' ? ui.connecting : ui.disconnected}
      </div>
      {!room || !playerId ? (
        screen === 'join' ? (
          <JoinScreen
            lang={lang}
            initialCode={joinCode}
            onJoined={(r, pid, name) => enter(r, pid, name)}
            onBack={() => {
              setScreen('home')
              setJoinCode('')
            }}
          />
        ) : (
          <Home
            lang={lang}
            setLang={setLang}
            onCreated={(r, pid, name, hostPlays) => enter(r, pid, name, { tv: !hostPlays })}
            onOpenJoin={(code) => {
              setJoinCode(code ?? '')
              setScreen('join')
            }}
          />
        )
      ) : (
        <RoomView
          room={room}
          playerId={playerId}
          lang={lang}
          initialTv={startInTv}
          onLeave={() => {
            setRoom(null)
            setPlayerId(null)
            setStartInTv(false)
            setScreen('home')
          }}
        />
      )}
    </div>
  )
}
