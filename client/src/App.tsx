import { useEffect, useRef, useState } from 'react'
import {
  clearSession,
  createGame,
  ensureSessionBound,
  fetchRoomPreview,
  joinGame,
  loadSession,
  rematch,
  saveSession,
  setGameOptions,
  setHostPlaying,
  setLanguage,
  setPublicLobby,
  setRoomHandler,
  startGame,
  submitDrawing,
  submitGuess,
  submitSabotage,
  submitVote,
  subscribeConnection,
  type ConnState,
} from './api'
import { BeforeAfter } from './BeforeAfter'
import { DoodleCanvas } from './DoodleCanvas'
import { fmt, packLabel, t } from './i18n'
import { JoinQr } from './qr'
import type { Lang, PromptPack, PublicRoom, RoomPreview } from './types'
import { NONE_GUESS } from './types'

const KLOTTERKAOS_URL = 'https://klotterkaos.com'
const FACTOPIA_URL = 'https://factopia.net'
const PARTYPATHS_URL = 'https://partypaths.com'
const SABOTEXT_URL = 'https://sabotext.com'
const YOURTASKIS_URL = 'https://yourtaskis.com'
const SCOURGEBORN_URL = 'https://scourgeborn.com'
const PULSEKAOS_URL = 'https://pulsekaos.com'

function SisterGames({ compact, hubHint }: { compact?: boolean; hubHint: string }) {
  return (
    <div className={`sister-games${compact ? ' compact' : ''}`}>
      <a className="sister-game hub" href={PULSEKAOS_URL} target="_blank" rel="noreferrer">
        <strong>Pulsekaos</strong>
        <span className="sister-hint">{hubHint}</span>
      </a>
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
      <SisterGames hubHint={ui.sisterHub} />
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
    if (step !== 'name' || code.length !== 4) return
    let cancelled = false
    void (async () => {
      try {
        const p = await fetchRoomPreview(code)
        if (!cancelled) setPreview(p)
      } catch {
        if (!cancelled) setPreview(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step, code])

  async function goName(e: React.FormEvent) {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c.length !== 4) {
      setError(lang === 'en' ? 'Enter a 4-letter code' : 'Ange en 4-bokstavskod')
      return
    }
    setCode(c)
    setStep('name')
    setError(null)
  }

  async function join(e: React.FormEvent) {
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
    <div className="home">
      <header className="hero compact">
        <p className="brand">Kluddkrig</p>
        <p className="tagline">{ui.joinTitle}</p>
      </header>

      {step === 'code' ? (
        <form className="panel" onSubmit={(e) => void goName(e)}>
          <label>
            {ui.code}
            <input
              value={code}
              maxLength={4}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <button type="submit" className="btn primary wide">
            {ui.join}
          </button>
          <button type="button" className="btn ghost wide" onClick={onBack}>
            {ui.back}
          </button>
        </form>
      ) : (
        <form className="panel" onSubmit={(e) => void join(e)}>
          <p className="muted">
            {ui.joinCodeHint} <span className="code-inline">{code}</span>
            {preview ? ` · ${preview.playerCount} ${ui.previewPlayers}` : ''}
          </p>
          <label>
            {ui.name}
            <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          </label>
          <button type="submit" className="btn primary wide" disabled={busy}>
            {ui.join}
          </button>
          <button type="button" className="btn ghost wide" onClick={() => setStep('code')}>
            {ui.back}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
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

function playerName(room: PublicRoom, id: string) {
  return room.players.find((p) => p.id === id)?.name ?? '?'
}

function difficultyLabel(ui: ReturnType<typeof t>, d: string) {
  if (d === 'wild') return ui.difficultyWild
  if (d === 'stealth') return ui.difficultyStealth
  return ui.difficultyMild
}

const PACKS: PromptPack[] = ['classic', 'food', 'dark', 'absurd']

function RoomView({
  room,
  playerId,
  onLeave,
  startInTv,
}: {
  room: PublicRoom
  playerId: string
  onLeave: () => void
  startInTv?: boolean
}) {
  const ui = t(room.language)
  const [tvMode, setTvMode] = useState(Boolean(startInTv))
  const [fsActive, setFsActive] = useState(() => isFullscreenActive())
  const [highlightIdx, setHighlightIdx] = useState(0)
  const countdown = useCountdown(room.phaseEndsAt)
  const joinUrl = `${window.location.origin}?join=${room.code}`
  const round = room.round

  useEffect(() => {
    document.body.classList.toggle('tv-mode', tvMode)
    return () => document.body.classList.remove('tv-mode')
  }, [tvMode])

  useEffect(() => {
    const onFs = () => setFsActive(isFullscreenActive())
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs as EventListener)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('webkitfullscreenchange', onFs as EventListener)
    }
  }, [])

  const hadFs = useRef(false)
  useEffect(() => {
    if (fsActive) hadFs.current = true
    if (!fsActive && hadFs.current && tvMode) {
      hadFs.current = false
      setTvMode(false)
    }
  }, [fsActive, tvMode])

  useEffect(() => {
    if (room.status !== 'results' || room.highlights.length < 2) return
    const id = setInterval(() => {
      setHighlightIdx((i) => (i + 1) % room.highlights.length)
    }, 3200)
    return () => clearInterval(id)
  }, [room.status, room.highlights.length])

  async function toggleTvMode() {
    if (tvMode) {
      setTvMode(false)
      hadFs.current = false
      await exitFullscreen()
      setFsActive(false)
      return
    }
    await enterFullscreen()
    setFsActive(isFullscreenActive())
    setTvMode(true)
  }

  const youPlaying = room.youPlaying
  const canStart = room.youAreHost && room.playingCount >= room.minPlayers
  const highlight = room.highlights[highlightIdx] ?? room.highlights[0]

  return (
    <div className="room">
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

      {room.status === 'lobby' && (
        <>
          <div className="tv-lobby-stage">
            {tvMode && !fsActive && (
              <button type="button" className="btn primary tv-fs-cta" onClick={() => void enterFullscreen()}>
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
                    className={`${p.playing ? 'is-playing' : ''}${p.id === room.hostId ? ' is-hosting' : ''}${
                      !p.connected ? ' offline' : ''
                    }`}
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
                  {!canStart && <p className="muted">{fmt(ui.needPlayers, { n: room.minPlayers })}</p>}
                  <button
                    type="button"
                    className="btn primary"
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
            <section className="panel">
              <JoinQr url={joinUrl} size={200} alt={room.code} />
              <p className="muted">{ui.scanOnPhone}</p>
            </section>
            <section className="panel">
              <h3>{ui.players}</h3>
              <ul className="player-list">
                {room.players.map((p) => (
                  <li key={p.id}>
                    {p.name}
                    {p.id === room.hostId && <strong> ★</strong>}
                    {!p.connected && <span className="muted"> ({ui.offline})</span>}
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
                  <div className="pack-row">
                    <span className="muted">{ui.promptPack}</span>
                    <div className="pack-chips">
                      {PACKS.map((pack) => (
                        <button
                          key={pack}
                          type="button"
                          className={`chip${room.promptPack === pack ? ' active' : ''}`}
                          onClick={() => void setGameOptions({ promptPack: pack })}
                        >
                          {packLabel(ui, pack)}
                        </button>
                      ))}
                    </div>
                  </div>
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
            </section>
          </div>
        </>
      )}

      {room.status !== 'lobby' && room.status !== 'results' && (
        <p className="phase-meta">
          {fmt(ui.round, { n: room.roundIndex, max: room.maxRounds })}
          {room.phaseEndsAt > 0 ? ` · ${countdown}s` : ''}
          {youPlaying && room.yourStreak >= 2 ? ` · ${fmt(ui.streakHint, { n: room.yourStreak })}` : ''}
        </p>
      )}

      {room.status === 'draw' && round && (
        <section className="phase">
          <h2>{ui.drawTitle}</h2>
          {(tvMode || !youPlaying) && (
            <div className="stage-card">
              <p className="stage-lead">{ui.drawWait}</p>
              <p className="muted">
                {fmt(ui.drawProgress, { done: round.drawingsDone, need: round.drawingsNeeded })}
              </p>
            </div>
          )}
          {youPlaying && round.youCanDraw && (
            <>
              <p className="prompt-card">
                {ui.yourWord}: <strong>{round.prompt}</strong>
              </p>
              <p className="muted">{fmt(ui.drawHint, { n: countdown || room.drawSeconds })}</p>
              <DoodleCanvas
                submitLabel={ui.drawDone}
                onSubmit={(url) => void submitDrawing(url)}
              />
            </>
          )}
          {youPlaying && !round.youCanDraw && (
            <div className="stage-card">
              <p className="muted">{ui.youDrew}</p>
              <p className="muted">
                {fmt(ui.drawProgress, { done: round.drawingsDone, need: round.drawingsNeeded })}
              </p>
            </div>
          )}
        </section>
      )}

      {room.status === 'sabotage' && round && (
        <section className="phase">
          <h2>{ui.sabotageTitle}</h2>
          {(tvMode || !youPlaying) && (
            <div className="stage-card">
              <p className="stage-lead">{ui.sabotageWait}</p>
              <p className="muted">
                {fmt(ui.sabotageProgress, { done: round.editsDone, need: round.editsNeeded })}
              </p>
            </div>
          )}
          {youPlaying && round.youCanEdit && round.yourMission && (
            <>
              <div className={`mission-card hot diff-${round.yourMission.difficulty}`}>
                <p className="muted">{ui.sabotageHint}</p>
                <p className="diff-badge">{difficultyLabel(ui, round.yourMission.difficulty)}</p>
                <p className="mission-label">{round.yourMission.label}</p>
              </div>
              <DoodleCanvas
                baseImageUrl={round.yourEditBaseUrl}
                submitLabel={ui.sabotageDone}
                onSubmit={(url) => void submitSabotage(url)}
              />
            </>
          )}
          {youPlaying && !round.youCanEdit && (
            <div className="mission-card">
              {round.yourMission && (
                <>
                  <p className="muted">{ui.sabotageHint}</p>
                  <p className="diff-badge">{difficultyLabel(ui, round.yourMission.difficulty)}</p>
                  <p className="mission-label">{round.yourMission.label}</p>
                </>
              )}
              <p className="muted">{ui.youEdited}</p>
              <p className="muted">
                {fmt(ui.sabotageProgress, { done: round.editsDone, need: round.editsNeeded })}
              </p>
            </div>
          )}
        </section>
      )}

      {room.status === 'guess' && round && (
        <section className="phase">
          <h2>{ui.guessTitle}</h2>
          <p className="muted">{ui.guessHint}</p>
          {(tvMode || !round.youCanGuess) && (
            <p className="muted">
              {ui.guessWait} ({round.guessesCount})
            </p>
          )}
          <div className="suspect-grid">
            {round.suspectOptions.map((opt, i) =>
              opt.isNone ? (
                <button
                  key={opt.id}
                  type="button"
                  className={`suspect-card none-card${round.yourGuess === NONE_GUESS ? ' picked' : ''}`}
                  disabled={!youPlaying || !round.youCanGuess}
                  onClick={() => void submitGuess(NONE_GUESS)}
                >
                  <span className="suspect-num">{i + 1}</span>
                  <span className="none-label">{ui.guessNone}</span>
                </button>
              ) : (
                <button
                  key={opt.id}
                  type="button"
                  className={`suspect-card${round.yourGuess === opt.id ? ' picked' : ''}`}
                  disabled={!youPlaying || !round.youCanGuess}
                  onClick={() => void submitGuess(opt.id)}
                >
                  <span className="suspect-num">{i + 1}</span>
                  <img src={opt.imageUrl} alt="" />
                </button>
              ),
            )}
          </div>
          {youPlaying && round.yourGuess && <p className="muted">{ui.youGuessed}</p>}
        </section>
      )}

      {room.status === 'vote' && round && (
        <section className="phase">
          <h2>{ui.voteTitle}</h2>
          {(tvMode || !round.youCanVote) && (
            <p className="muted">
              {ui.voteWait} ({round.votesCount})
            </p>
          )}
          {youPlaying && round.youCanVote && (
            <div className="choice-grid">
              {room.players
                .filter((p) => p.playing && p.id !== playerId)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn choice"
                    onClick={() => void submitVote(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          )}
          {youPlaying && round.yourVote && <p className="muted">{ui.youVoted}</p>}
        </section>
      )}

      {room.status === 'reveal' && round && (
        <section className="phase reveal-phase">
          <h2 className="reveal-pop">{ui.revealTitle}</h2>
          {round.roast && <p className="roast-line">{round.roast}</p>}
          <p className="reveal-line">
            {ui.theWord}: <strong>{round.prompt}</strong>
          </p>
          {round.mode === 'doubleBluff' || round.saboteurIds.length === 0 ? (
            <p className="reveal-line hot-line">{ui.noSaboteur}</p>
          ) : (
            <p className="reveal-line">
              {round.saboteurIds.length > 1 ? ui.theSaboteurs : ui.theSaboteur}:{' '}
              <strong>{round.saboteurIds.map((id) => playerName(room, id)).join(', ')}</strong>
              {round.saboteurMissions.length > 0 ? ` · ${round.saboteurMissions.join(' / ')}` : ''}
            </p>
          )}
          {round.focusOriginalUrl && round.focusFinalUrl && (
            <BeforeAfter
              beforeUrl={round.focusOriginalUrl}
              afterUrl={round.focusFinalUrl}
              beforeLabel={ui.original}
              afterLabel={ui.sabotaged}
              hint={ui.dragCompare}
            />
          )}
          <div className="reveal-meta">
            {round.correctGuessers.length > 0 && (
              <p>
                {ui.spotters}:{' '}
                <strong>{round.correctGuessers.map((id) => playerName(room, id)).join(', ')}</strong>
              </p>
            )}
            {round.votedSaboteurCorrectly.length > 0 && (
              <p>
                {ui.voters}:{' '}
                <strong>
                  {round.votedSaboteurCorrectly.map((id) => playerName(room, id)).join(', ')}
                </strong>
              </p>
            )}
            {round.revengeIds.length > 0 && (
              <p className="revenge-line">
                {ui.revenge}{' '}
                <strong>{round.revengeIds.map((id) => playerName(room, id)).join(', ')}</strong>
              </p>
            )}
            {round.stealthBonusIds.length > 0 && (
              <p>
                {ui.stealthWin}:{' '}
                <strong>{round.stealthBonusIds.map((id) => playerName(room, id)).join(', ')}</strong>
              </p>
            )}
          </div>
          {round.gallery.length > 0 && (
            <div className="gallery-grid">
              {round.gallery.map((g) => (
                <figure
                  key={g.artistId}
                  className={round.sabotagedArtistIds.includes(g.artistId) ? 'is-sabotaged' : ''}
                >
                  <figcaption>{g.artistName}</figcaption>
                  <img src={g.finalUrl} alt="" />
                </figure>
              ))}
            </div>
          )}
          {countdown > 0 && <p className="muted">{ui.nextRound}</p>}
        </section>
      )}

      {room.status === 'results' && (
        <section className="phase">
          <h2>
            {ui.resultsTitle}
            {room.phaseEndsAt > 0 ? ` · ${countdown}s` : ''}
          </h2>
          {highlight && (
            <div className="highlight-reel">
              <h3>{ui.highlights}</h3>
              <div className="highlight-card">
                <img src={highlight.imageUrl} alt="" />
                <p className="highlight-cap">
                  R{highlight.roundIndex} · {highlight.saboteurName}
                  {highlight.mission ? ` · ${highlight.mission}` : ''}
                </p>
                {highlight.roast && <p className="muted">{highlight.roast}</p>}
              </div>
            </div>
          )}
          <h3>{ui.scores}</h3>
          <ol className="scores">
            {room.scores.map((s) => (
              <li key={s.playerId}>
                <span>{s.name}</span>
                <strong>{s.score}</strong>
              </li>
            ))}
          </ol>
          {room.youAreHost && (
            <div className="results-actions">
              <button type="button" className="btn primary wide" onClick={() => void startGame()}>
                {ui.playAgain}
              </button>
              <button type="button" className="btn ghost wide" onClick={() => void rematch()}>
                {ui.rematch}
              </button>
            </div>
          )}
        </section>
      )}

      {!tvMode && room.status === 'lobby' && (
        <>
          <p className="sister-label">{ui.sister}</p>
          <SisterGames compact hubHint={ui.sisterHub} />
        </>
      )}
    </div>
  )
}

type Screen = 'home' | 'join' | 'room'

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
        setScreen('room')
      }
    })()
  }, [])

  function enterRoom(r: PublicRoom, pid: string, name: string, asTvHost = false) {
    setRoom(r)
    setPlayerId(pid)
    setLang(r.language)
    setStartInTv(asTvHost)
    saveSession({ code: r.code, playerId: pid, name })
    setScreen('room')
  }

  const ui = t(lang)

  return (
    <div className="app">
      <p className={`conn ${conn}`}>
        {conn === 'connected' ? ui.connected : conn === 'connecting' ? ui.connecting : ui.disconnected}
      </p>

      {screen === 'home' && (
        <Home
          lang={lang}
          setLang={(l) => {
            setLang(l)
            void setLanguage(l)
          }}
          onCreated={(r, pid, name, hostPlays) => {
            enterRoom(r, pid, name, !hostPlays)
            void setLanguage(lang)
          }}
          onOpenJoin={(code) => {
            setJoinCode(code ?? '')
            setScreen('join')
          }}
        />
      )}

      {screen === 'join' && (
        <JoinScreen
          lang={lang}
          initialCode={joinCode}
          onJoined={(r, pid, name) => enterRoom(r, pid, name)}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'room' && room && playerId && (
        <RoomView
          room={room}
          playerId={playerId}
          startInTv={startInTv}
          onLeave={() => {
            setRoom(null)
            setPlayerId(null)
            setScreen('home')
          }}
        />
      )}
    </div>
  )
}
