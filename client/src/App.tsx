import { useEffect, useMemo, useRef, useState } from 'react'
import {
  backToLobby,
  clearSession,
  createGame,
  ensureSessionBound,
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
import type { Lang, PublicRoom } from './types'

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

function Home({
  lang,
  setLang,
  onCreated,
  onJoined,
}: {
  lang: Lang
  setLang: (l: Lang) => void
  onCreated: (room: PublicRoom, playerId: string, name: string) => void
  onJoined: (room: PublicRoom, playerId: string, name: string) => void
}) {
  const ui = t(lang)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [hostPlays, setHostPlaysLocal] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  useEffect(() => {
    const join = params.get('join')
    if (join) setCode(join.toUpperCase())
  }, [params])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await createGame(name || (lang === 'en' ? 'Host' : 'Värd'), lang, false, hostPlays)
      if (!res.ok) {
        setError(res.error ?? 'Error')
        return
      }
      onCreated(res.room, res.playerId, name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function join() {
    setBusy(true)
    setError(null)
    try {
      const res = await joinGame(code, name || (lang === 'en' ? 'Player' : 'Spelare'))
      if (!res.ok) {
        setError(res.error ?? 'Error')
        return
      }
      onJoined(res.room, res.playerId, name)
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
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
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
        <label>
          {ui.code}
          <input
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD"
          />
        </label>
        <button type="button" className="btn wide" disabled={busy || code.length < 4} onClick={() => void join()}>
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

function FightPad({ hasAbility, abilityLabel, noAbilityLabel }: { hasAbility: boolean; abilityLabel: string; noAbilityLabel: string }) {
  const moveRef = useRef<-1 | 0 | 1>(0)

  useEffect(() => {
    const id = setInterval(() => {
      if (moveRef.current !== 0) void sendInput({ move: moveRef.current })
    }, 50)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="pad">
      <div className="pad-move">
        <button
          type="button"
          className="pad-btn"
          onPointerDown={() => {
            moveRef.current = -1
            void sendInput({ move: -1 })
          }}
          onPointerUp={() => {
            moveRef.current = 0
            void sendInput({ move: 0 })
          }}
          onPointerLeave={() => {
            moveRef.current = 0
            void sendInput({ move: 0 })
          }}
        >
          ←
        </button>
        <button
          type="button"
          className="pad-btn"
          onPointerDown={() => {
            moveRef.current = 1
            void sendInput({ move: 1 })
          }}
          onPointerUp={() => {
            moveRef.current = 0
            void sendInput({ move: 0 })
          }}
          onPointerLeave={() => {
            moveRef.current = 0
            void sendInput({ move: 0 })
          }}
        >
          →
        </button>
      </div>
      <div className="pad-actions">
        <button type="button" className="pad-btn action" onPointerDown={() => void sendInput({ jump: true })}>
          ⤒
        </button>
        <button type="button" className="pad-btn action punch" onPointerDown={() => void sendInput({ punch: true })}>
          ✊
        </button>
        <button
          type="button"
          className="pad-btn action loot"
          disabled={!hasAbility}
          onPointerDown={() => hasAbility && void sendInput({ ability: true })}
        >
          {hasAbility ? abilityLabel : noAbilityLabel}
        </button>
      </div>
    </div>
  )
}

function RoomView({
  room,
  playerId,
  lang,
  onLeave,
}: {
  room: PublicRoom
  playerId: string
  lang: Lang
  onLeave: () => void
}) {
  const ui = t(lang)
  const [tvMode, setTvMode] = useState(false)
  const countdown = useCountdown(room.phaseEndsAt)
  const joinUrl = `${window.location.origin}?join=${room.code}`

  useEffect(() => {
    document.body.classList.toggle('tv-mode', tvMode)
    return () => document.body.classList.remove('tv-mode')
  }, [tvMode])

  const youPlaying = room.youPlaying

  return (
    <div className="room">
      <header className="room-bar">
        <div>
          <p className="brand-sm">Kluddkrig</p>
          <p className="code-big">{room.code}</p>
        </div>
        <div className="room-actions">
          <button type="button" className="chip" onClick={() => setTvMode((v) => !v)}>
            {tvMode ? ui.tvExit : ui.tvMode}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => {
              clearSession()
              onLeave()
            }}
          >
            {ui.leave}
          </button>
        </div>
      </header>

      {room.status === 'lobby' && (
        <>
          {tvMode ? (
            <div className="tv-lobby">
              <JoinQr url={joinUrl} size={320} alt={room.code} />
              <p className="code-huge">{room.code}</p>
            </div>
          ) : (
            <div className="lobby-grid">
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
                      disabled={room.playingCount < room.minPlayers}
                      onClick={() => void startGame()}
                    >
                      {room.playingCount < room.minPlayers
                        ? fmt(ui.needPlayers, { n: room.minPlayers })
                        : ui.start}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {room.status === 'doodle' && (
        <section className="phase">
          <h2>
            {ui.doodleTitle} · {countdown}s
          </h2>
          <p className="muted">
            {fmt(ui.round, { n: room.roundIndex, max: room.maxRounds })} — {ui.doodleHint}
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
              <DoodleCanvas
                onSubmit={(url) => void submitDoodle(url)}
                submitLabel={ui.doodleDone}
              />
            )
          ) : (
            <p className="muted">{ui.fightTvHint}</p>
          )}
        </section>
      )}

      {room.status === 'fight' && room.fight && (
        <section className="phase fight-phase">
          <h2>
            {ui.fightTitle} · {countdown}s · {ui.arena}: {room.arenaId}
          </h2>
          {(tvMode || !youPlaying) && (
            <ArenaView fight={room.fight} players={room.players} wide={tvMode} />
          )}
          {youPlaying && !tvMode && (
            <>
              <p className="muted">{ui.fightTvHint}</p>
              <FightPad
                hasAbility={Boolean(room.yourAbility)}
                abilityLabel={`${ui.ability}: ${room.yourAbility ?? ''}`}
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

export default function App() {
  const [lang, setLang] = useState<Lang>(() =>
    navigator.language.toLowerCase().startsWith('sv') ? 'sv' : 'en',
  )
  const [room, setRoom] = useState<PublicRoom | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
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

  function enter(r: PublicRoom, pid: string, name: string) {
    saveSession({ code: r.code, playerId: pid, name })
    setRoom(r)
    setPlayerId(pid)
    setLang(r.language)
    if (r.youAreHost) void setLanguage(lang)
  }

  const ui = t(lang)

  return (
    <div className="app">
      <div className={`conn ${conn}`}>
        {conn === 'connected' ? ui.connected : conn === 'connecting' ? ui.connecting : ui.disconnected}
      </div>
      {!room || !playerId ? (
        <Home lang={lang} setLang={setLang} onCreated={enter} onJoined={enter} />
      ) : (
        <RoomView
          room={room}
          playerId={playerId}
          lang={lang}
          onLeave={() => {
            setRoom(null)
            setPlayerId(null)
          }}
        />
      )}
    </div>
  )
}
