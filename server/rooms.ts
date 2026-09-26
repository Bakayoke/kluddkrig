import { customAlphabet } from 'nanoid'
import {
  buildRoast,
  isPromptPack,
  missionLabel,
  pickBluffMission,
  pickPrompt,
  pickSabotageMission,
} from './content.js'
import type {
  Highlight,
  Lang,
  Player,
  PlayerMission,
  PromptPack,
  PublicRoom,
  PublicRound,
  Room,
  RoomStatus,
  RoundMode,
  RoundState,
  SuspectOption,
} from './types.js'

const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ', 4)

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 8
export const DEFAULT_MAX_ROUNDS = 3
export const DRAW_MS = 45_000
export const SABOTAGE_MS = 25_000
export const GUESS_MS = 20_000
export const VOTE_MS = 18_000
export const REVEAL_MS = 16_000
export const RESULTS_MS = 45_000
export const NONE_GUESS = '__none__'

const DISCONNECT_GRACE_MS = 60_000
const ROOM_IDLE_MS = 12 * 60 * 60 * 1000
const MAX_IMAGE_CHARS = 900_000

const rooms = new Map<string, Room>()
const socketToPlayer = new Map<string, { code: string; playerId: string }>()
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

let onPersist: (() => void) | null = null

export function setPersistHook(fn: (() => void) | null) {
  onPersist = fn
}

function touch(room?: Room) {
  if (room) room.updatedAt = Date.now()
  onPersist?.()
}

function playerKey(code: string, playerId: string) {
  return `${code}:${playerId}`
}

function cancelDisconnectTimer(code: string, playerId: string) {
  const key = playerKey(code, playerId)
  const t = disconnectTimers.get(key)
  if (t) {
    clearTimeout(t)
    disconnectTimers.delete(key)
  }
}

function uniqueCode(): string {
  let code = makeCode()
  while (rooms.has(code)) code = makeCode()
  return code
}

function playingPlayers(room: Room) {
  return room.players.filter((p) => p.playing)
}

function sanitizeImage(dataUrl: string) {
  const raw = String(dataUrl ?? '')
  if (!raw.startsWith('data:image/')) return null
  if (raw.length > MAX_IMAGE_CHARS) return null
  return raw
}

function emptyRoomMeta() {
  return {
    promptPack: 'classic' as PromptPack,
    saboteurStreak: {} as Record<string, number>,
    highlights: [] as Highlight[],
  }
}

export function allRooms() {
  return rooms
}

export function getRoom(code: string) {
  return rooms.get(code.toUpperCase().trim())
}

export function getBinding(socketId: string) {
  return socketToPlayer.get(socketId)
}

export function createRoom(
  hostName: string,
  socketId: string,
  hostPlays = true,
  language: Lang = 'sv',
  isPublic = false,
): { room: Room; playerId: string } {
  const code = uniqueCode()
  const playerId = crypto.randomUUID()
  const host: Player = {
    id: playerId,
    name: hostName.trim().slice(0, 20) || (language === 'en' ? 'Host' : 'Värd'),
    score: 0,
    connected: true,
    playing: hostPlays,
  }

  const room: Room = {
    code,
    hostId: playerId,
    players: [host],
    language: language === 'en' ? 'en' : 'sv',
    hostPlays,
    status: 'lobby',
    isPublic: Boolean(isPublic),
    ...emptyRoomMeta(),
    roundIndex: 0,
    maxRounds: DEFAULT_MAX_ROUNDS,
    phaseEndsAt: 0,
    round: null,
    updatedAt: Date.now(),
  }
  rooms.set(code, room)
  socketToPlayer.set(socketId, { code, playerId })
  touch(room)
  return { room, playerId }
}

export function joinRoom(code: string, name: string, socketId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte', code: 'NOT_FOUND' as const }
  if (room.status !== 'lobby') return { error: 'Spelet har redan startat', code: 'STARTED' as const }
  if (room.players.length >= MAX_PLAYERS) return { error: 'Rummet är fullt', code: 'FULL' as const }

  const playerId = crypto.randomUUID()
  const player: Player = {
    id: playerId,
    name: name.trim().slice(0, 20) || (room.language === 'en' ? 'Player' : 'Spelare'),
    score: 0,
    connected: true,
    playing: true,
  }
  room.players.push(player)
  socketToPlayer.set(socketId, { code: room.code, playerId })
  touch(room)
  return { room, playerId }
}

export function reconnectSocket(code: string, playerId: string, socketId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte', code: 'NOT_FOUND' as const }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { error: 'Spelaren finns inte', code: 'NO_PLAYER' as const }
  cancelDisconnectTimer(room.code, playerId)
  for (const [sid, b] of socketToPlayer) {
    if (b.code === room.code && b.playerId === playerId) socketToPlayer.delete(sid)
  }
  player.connected = true
  socketToPlayer.set(socketId, { code: room.code, playerId })
  touch(room)
  return room
}

export function disconnectSocket(socketId: string) {
  const binding = socketToPlayer.get(socketId)
  if (!binding) return null
  socketToPlayer.delete(socketId)
  const room = getRoom(binding.code)
  if (!room) return null
  const player = room.players.find((p) => p.id === binding.playerId)
  if (!player) return room
  player.connected = false
  cancelDisconnectTimer(room.code, binding.playerId)
  const key = playerKey(room.code, binding.playerId)
  disconnectTimers.set(
    key,
    setTimeout(() => {
      disconnectTimers.delete(key)
      const r = getRoom(binding.code)
      if (!r) return
      const still = [...socketToPlayer.values()].some(
        (b) => b.code === binding.code && b.playerId === binding.playerId,
      )
      if (still) return
      const p = r.players.find((x) => x.id === binding.playerId)
      if (p) p.connected = false
      touch(r)
    }, DISCONNECT_GRACE_MS),
  )
  touch(room)
  return room
}

export function setHostPlaying(code: string, playerId: string, playing: boolean) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  if (room.status !== 'lobby') return { error: 'Spelet körs redan' }
  const host = room.players.find((p) => p.id === room.hostId)
  if (!host) return { error: 'Ingen värd' }
  host.playing = Boolean(playing)
  room.hostPlays = host.playing
  touch(room)
  return room
}

export function setLanguage(code: string, playerId: string, language: Lang) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  room.language = language === 'en' ? 'en' : 'sv'
  touch(room)
  return room
}

export function setPublicLobby(code: string, playerId: string, isPublic: boolean) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  room.isPublic = Boolean(isPublic)
  touch(room)
  return room
}

export function setGameOptions(
  code: string,
  playerId: string,
  opts: { maxRounds?: number; promptPack?: string },
) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  if (opts.maxRounds != null) room.maxRounds = Math.min(8, Math.max(1, Math.round(opts.maxRounds)))
  if (opts.promptPack != null && isPromptPack(opts.promptPack)) {
    room.promptPack = opts.promptPack
  }
  touch(room)
  return room
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/** editorId → artistId, no self-assignments */
function derange(ids: string[]): Record<string, string> {
  if (ids.length < 2) return {}
  for (let attempt = 0; attempt < 50; attempt++) {
    const artists = shuffle([...ids])
    let ok = true
    const map: Record<string, string> = {}
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === artists[i]) {
        ok = false
        break
      }
      map[ids[i]!] = artists[i]!
    }
    if (ok) return map
  }
  const map: Record<string, string> = {}
  for (let i = 0; i < ids.length; i++) {
    map[ids[i]!] = ids[(i + 1) % ids.length]!
  }
  return map
}

function beginDraw(room: Room) {
  room.roundIndex += 1
  const playing = playingPlayers(room)
  if (playing.length < MIN_PLAYERS) {
    room.status = 'lobby'
    room.round = null
    room.phaseEndsAt = 0
    return
  }
  const history = room.round?.usedPromptHistory ?? []
  const prompt = pickPrompt(room.language, history, room.promptPack ?? 'classic')
  room.round = {
    prompt,
    drawings: {},
    editOf: {},
    missions: {},
    mode: 'normal',
    saboteurIds: [],
    finals: {},
    sabotagedArtistIds: [],
    guesses: {},
    votes: {},
    usedPromptHistory: [...history, prompt].slice(-40),
  }
  room.status = 'draw'
  room.phaseEndsAt = Date.now() + DRAW_MS
  touch(room)
}

function tryFinishDraw(room: Room) {
  const round = room.round
  if (!round) return
  const need = playingPlayers(room)
  if (need.every((p) => round.drawings[p.id])) beginSabotage(room)
}

function pickRoundMode(playerCount: number): RoundMode {
  const roll = Math.random()
  if (playerCount >= 5 && roll < 0.18) return 'doubleSaboteur'
  if (roll < 0.14) return 'doubleBluff'
  return 'normal'
}

function beginSabotage(room: Room) {
  const round = room.round
  if (!round) return
  const artists = playingPlayers(room).filter((p) => round.drawings[p.id])
  if (artists.length < 2) {
    advanceAfterReveal(room)
    return
  }
  const ids = artists.map((p) => p.id)
  round.editOf = derange(ids)
  const editors = shuffle(Object.keys(round.editOf))
  const mode = pickRoundMode(editors.length)
  round.mode = mode

  const streakEligible = editors.filter((id) => (room.saboteurStreak[id] ?? 0) >= 2)
  let saboteurIds: string[] = []

  if (mode === 'doubleBluff') {
    saboteurIds = []
  } else if (mode === 'doubleSaboteur') {
    const count = Math.min(2, editors.length)
    if (streakEligible.length > 0 && Math.random() < 0.55) {
      saboteurIds = [streakEligible[0]!]
      const rest = editors.filter((e) => e !== saboteurIds[0])
      saboteurIds.push(rest[Math.floor(Math.random() * rest.length)]!)
    } else {
      saboteurIds = editors.slice(0, count)
    }
  } else {
    if (streakEligible.length > 0 && Math.random() < 0.6) {
      saboteurIds = [streakEligible[Math.floor(Math.random() * streakEligible.length)]!]
    } else {
      saboteurIds = [editors[Math.floor(Math.random() * editors.length)]!]
    }
  }

  round.saboteurIds = saboteurIds
  round.sabotagedArtistIds = saboteurIds.map((sid) => round.editOf[sid]!).filter(Boolean)

  const usedMissionIds: string[] = []
  const missions: Record<string, PlayerMission> = {}
  for (const editorId of editors) {
    const isSab = saboteurIds.includes(editorId)
    if (isSab) {
      const preferStealth = (room.saboteurStreak[editorId] ?? 0) >= 2
      const sabMission = pickSabotageMission(usedMissionIds, preferStealth)
      usedMissionIds.push(sabMission.id)
      missions[editorId] = {
        id: sabMission.id,
        kind: 'sabotage',
        difficulty: sabMission.difficulty,
        label: missionLabel(sabMission, room.language),
      }
    } else {
      const bluff = pickBluffMission(usedMissionIds)
      usedMissionIds.push(bluff.id)
      missions[editorId] = {
        id: bluff.id,
        kind: 'bluff',
        difficulty: bluff.difficulty,
        label: missionLabel(bluff, room.language),
      }
    }
  }
  round.missions = missions
  round.finals = {}
  room.status = 'sabotage'
  room.phaseEndsAt = Date.now() + SABOTAGE_MS
  touch(room)
}

function tryFinishSabotage(room: Room) {
  const round = room.round
  if (!round) return
  const editors = Object.keys(round.editOf)
  const done = editors.filter((editorId) => {
    const artistId = round.editOf[editorId]!
    return Boolean(round.finals[artistId])
  })
  if (done.length >= editors.length) beginGuess(room)
}

function fillMissingFinals(round: RoundState) {
  for (const [, artistId] of Object.entries(round.editOf)) {
    if (!round.finals[artistId]) {
      round.finals[artistId] = round.drawings[artistId] ?? ''
    }
  }
}

type RoundExtra = RoundState & {
  _correctGuessers?: string[]
  _correctVoters?: string[]
  _revengeIds?: string[]
  _stealthBonusIds?: string[]
  _roast?: string
  _editSubmitted?: Record<string, boolean>
  _suspectOrder?: string[]
}

function beginGuess(room: Room) {
  const round = room.round as RoundExtra | null
  if (!round) return
  fillMissingFinals(round)
  round.guesses = {}
  const order = Object.keys(round.finals).filter((id) => Boolean(round.finals[id]))
  shuffle(order)
  round._suspectOrder = order
  room.status = 'guess'
  room.phaseEndsAt = Date.now() + GUESS_MS
  touch(room)
}

function beginVote(room: Room) {
  if (!room.round) return
  if (room.round.mode === 'doubleBluff') {
    beginReveal(room)
    return
  }
  room.round.votes = {}
  room.status = 'vote'
  room.phaseEndsAt = Date.now() + VOTE_MS
  touch(room)
}

function scoreRound(room: Room) {
  const round = room.round as RoundExtra | null
  if (!round) return
  const players = playingPlayers(room)
  const sabotagedSet = new Set(round.sabotagedArtistIds)
  const saboteurSet = new Set(round.saboteurIds)

  const correctIds: string[] = []
  for (const g of players) {
    const guess = round.guesses[g.id]
    if (!guess) continue
    const ok =
      round.mode === 'doubleBluff'
        ? guess === NONE_GUESS
        : sabotagedSet.has(guess)
    if (ok) {
      correctIds.push(g.id)
      g.score += 1
    }
  }
  const halfG = Math.ceil(players.length / 2)
  const majoritySpotted = correctIds.length >= halfG && players.length > 0

  const correctVoters: string[] = []
  let rightVotes = 0
  let wrongVotes = 0
  const revengeIds: string[] = []

  if (round.mode !== 'doubleBluff') {
    for (const v of players) {
      if (saboteurSet.has(v.id)) continue
      const vote = round.votes[v.id]
      if (!vote) continue
      if (saboteurSet.has(vote)) {
        correctVoters.push(v.id)
        v.score += 1
        rightVotes += 1
      } else {
        wrongVotes += 1
      }

      // Artist's revenge: spot who sabotaged YOUR drawing
      const myEditor = Object.entries(round.editOf).find(([, artistId]) => artistId === v.id)?.[0]
      if (
        myEditor &&
        saboteurSet.has(myEditor) &&
        round.sabotagedArtistIds.includes(v.id) &&
        vote === myEditor
      ) {
        revengeIds.push(v.id)
        v.score += 1
      }
    }
  }

  const stealthBonusIds: string[] = []
  const stealthOk =
    round.mode === 'doubleBluff'
      ? correctIds.length < halfG
      : !majoritySpotted || wrongVotes > rightVotes

  for (const sid of round.saboteurIds) {
    const saboteur = room.players.find((p) => p.id === sid)
    if (saboteur && stealthOk) {
      saboteur.score += 3
      stealthBonusIds.push(sid)
      room.saboteurStreak[sid] = (room.saboteurStreak[sid] ?? 0) + 1
    } else {
      room.saboteurStreak[sid] = 0
    }
  }
  // Reset streak for non-saboteurs who failed previous? only saboteurs update.

  for (const artistId of round.sabotagedArtistIds) {
    const artist = room.players.find((p) => p.id === artistId)
    if (artist && !majoritySpotted) artist.score += 2
  }

  round._correctGuessers = correctIds
  round._correctVoters = correctVoters
  round._revengeIds = revengeIds
  round._stealthBonusIds = stealthBonusIds
  round._roast = buildRoast(room.language, correctIds.length, players.length, round.mode)
}

function pushHighlight(room: Room) {
  const round = room.round as RoundExtra | null
  if (!round) return
  const focusArtist = round.sabotagedArtistIds[0]
  const focusSab = round.saboteurIds[0]
  const finalUrl =
    (focusArtist && (round.finals[focusArtist] ?? round.drawings[focusArtist])) ||
    Object.values(round.finals)[0]
  const originalUrl =
    (focusArtist && round.drawings[focusArtist]) || Object.values(round.drawings)[0]
  if (!finalUrl || !originalUrl) return

  const entry: Highlight = {
    roundIndex: room.roundIndex,
    imageUrl: finalUrl,
    originalUrl,
    saboteurName: focusSab
      ? room.players.find((p) => p.id === focusSab)?.name ?? '?'
      : room.language === 'en'
        ? 'Nobody'
        : 'Ingen',
    artistName: focusArtist
      ? room.players.find((p) => p.id === focusArtist)?.name ?? '?'
      : '?',
    mission: focusSab ? round.missions[focusSab]?.label ?? '' : '',
    roast: round._roast ?? '',
  }
  room.highlights = [...room.highlights, entry].slice(-12)
}

function beginReveal(room: Room) {
  scoreRound(room)
  pushHighlight(room)
  room.status = 'reveal'
  room.phaseEndsAt = Date.now() + REVEAL_MS
  touch(room)
}

function advanceAfterReveal(room: Room) {
  if (room.roundIndex >= room.maxRounds) {
    room.status = 'results'
    room.phaseEndsAt = Date.now() + RESULTS_MS
    touch(room)
    return
  }
  beginDraw(room)
}

export function startGame(code: string, playerId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  if (room.status !== 'lobby' && room.status !== 'results') {
    return { error: 'Spelet körs redan' }
  }
  const count = playingPlayers(room).filter((p) => p.connected).length
  if (count < MIN_PLAYERS) {
    return {
      error:
        room.language === 'en'
          ? `Need at least ${MIN_PLAYERS} players`
          : `Behöver minst ${MIN_PLAYERS} spelare`,
    }
  }
  if (room.status === 'results') {
    for (const p of room.players) p.score = 0
    room.roundIndex = 0
    room.saboteurStreak = {}
    room.highlights = []
  }
  room.round = null
  beginDraw(room)
  return room
}

export function submitDrawing(code: string, playerId: string, imageDataUrl: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'draw' || !room.round) return { error: 'Inte ritfas' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player?.playing) return { error: 'Du spelar inte' }
  if (room.round.drawings[playerId]) return { error: 'Redan skickat' }
  const img = sanitizeImage(imageDataUrl)
  if (!img) return { error: 'Ogiltig bild' }
  room.round.drawings[playerId] = img
  touch(room)
  tryFinishDraw(room)
  return room
}

export function submitSabotage(code: string, playerId: string, imageDataUrl: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'sabotage' || !room.round) return { error: 'Inte sabotage-fas' }
  const artistId = room.round.editOf[playerId]
  if (!artistId) return { error: 'Ingen bild att editera' }
  if (room.round.finals[artistId]) return { error: 'Redan skickat' }
  const img = sanitizeImage(imageDataUrl)
  if (!img) return { error: 'Ogiltig bild' }
  room.round.finals[artistId] = img
  const extra = room.round as RoundExtra
  if (!extra._editSubmitted) extra._editSubmitted = {}
  extra._editSubmitted[playerId] = true
  touch(room)
  tryFinishSabotage(room)
  return room
}

export function submitGuess(code: string, playerId: string, guess: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'guess' || !room.round) return { error: 'Inte gissningsfas' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player?.playing) return { error: 'Du spelar inte' }
  const artistId = String(guess ?? '')
  const valid =
    artistId === NONE_GUESS ||
    Boolean(room.round.finals[artistId]) ||
    Boolean(room.round.drawings[artistId])
  if (!valid) return { error: 'Ogiltig gissning' }
  room.round.guesses[playerId] = artistId
  touch(room)
  const need = playingPlayers(room)
  if (need.every((p) => room.round!.guesses[p.id])) beginVote(room)
  return room
}

export function submitVote(code: string, playerId: string, targetId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'vote' || !room.round) return { error: 'Inte röstrunda' }
  if (room.round.mode === 'doubleBluff') return { error: 'Ingen röstning denna runda' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player?.playing) return { error: 'Du spelar inte' }
  const target = room.players.find((p) => p.id === targetId && p.playing)
  if (!target) return { error: 'Ogiltig röst' }
  if (targetId === playerId) return { error: 'Kan inte rösta på dig själv' }
  room.round.votes[playerId] = targetId
  touch(room)
  const need = playingPlayers(room)
  if (need.every((p) => room.round!.votes[p.id])) beginReveal(room)
  return room
}

export function onPhaseTimeout(room: Room) {
  if (room.status === 'draw') {
    const round = room.round
    if (!round) return
    const drawn = Object.keys(round.drawings).length
    if (drawn < 2) {
      advanceAfterReveal(room)
      return
    }
    beginSabotage(room)
    return
  }
  if (room.status === 'sabotage') {
    beginGuess(room)
    return
  }
  if (room.status === 'guess') {
    beginVote(room)
    return
  }
  if (room.status === 'vote') {
    beginReveal(room)
    return
  }
  if (room.status === 'reveal') {
    advanceAfterReveal(room)
    return
  }
  if (room.status === 'results') {
    room.status = 'lobby'
    room.phaseEndsAt = 0
    room.round = null
    touch(room)
  }
}

export function roomsNeedingTick(): Room[] {
  const now = Date.now()
  const out: Room[] = []
  for (const room of rooms.values()) {
    if (room.phaseEndsAt > 0 && room.phaseEndsAt <= now && room.status !== 'lobby') {
      out.push(room)
    }
  }
  return out
}

export function rematch(code: string, playerId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  room.status = 'lobby'
  room.roundIndex = 0
  room.phaseEndsAt = 0
  room.round = null
  room.saboteurStreak = {}
  room.highlights = []
  for (const p of room.players) p.score = 0
  touch(room)
  return room
}

export function backToLobby(code: string, playerId: string) {
  return rematch(code, playerId)
}

export function pruneIdleRooms() {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > ROOM_IDLE_MS) rooms.delete(code)
  }
}

export function hydrateRooms(list: Room[]) {
  rooms.clear()
  for (const room of list) {
    rooms.set(room.code, {
      ...room,
      promptPack: room.promptPack ?? 'classic',
      saboteurStreak: room.saboteurStreak ?? {},
      highlights: room.highlights ?? [],
      players: room.players.map((p) => ({ ...p, connected: false })),
      round: room.round,
    })
  }
}

export function listPublicLobbies(opts?: { language?: Lang | null; limit?: number }) {
  const now = Date.now()
  const limit = opts?.limit ?? 24
  return [...rooms.values()]
    .filter((r) => r.isPublic && r.status === 'lobby')
    .filter((r) => (opts?.language ? r.language === opts.language : true))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((r) => ({
      code: r.code,
      language: r.language,
      playerCount: r.players.length,
      hostName: r.players.find((p) => p.id === r.hostId)?.name ?? '?',
      updatedAt: r.updatedAt,
      ageMs: now - r.updatedAt,
    }))
}

function toPublicRound(room: Room, viewerId: string): PublicRound | null {
  const round = room.round as RoundExtra | null
  if (!round) return null
  const reveal = room.status === 'reveal' || room.status === 'results'
  const playing = playingPlayers(room)
  const drawingsNeeded = playing.length
  const drawingsDone = Object.keys(round.drawings).length
  const editors = Object.keys(round.editOf)
  const editsNeeded = editors.length
  const editsDone = editors.filter((e) => Boolean(round.finals[round.editOf[e]!])).length
  const youPlaying = Boolean(room.players.find((p) => p.id === viewerId)?.playing)
  const artistForYou = round.editOf[viewerId]
  const youSubmittedEdit = Boolean(artistForYou && round.finals[artistForYou])

  let suspectOptions: SuspectOption[] = []
  if (room.status === 'guess' || reveal) {
    const order =
      round._suspectOrder ??
      Object.keys(round.finals).filter((id) => Boolean(round.finals[id]))
    suspectOptions = order
      .map((id) => ({ id, imageUrl: round.finals[id]! }))
      .filter((o) => Boolean(o.imageUrl))
    if (room.status === 'guess') {
      suspectOptions = [
        ...suspectOptions,
        { id: NONE_GUESS, imageUrl: '', isNone: true },
      ]
    }
  }

  const gallery = reveal
    ? Object.keys(round.drawings).map((artistId) => ({
        artistId,
        artistName: room.players.find((p) => p.id === artistId)?.name ?? '?',
        originalUrl: round.drawings[artistId]!,
        finalUrl: round.finals[artistId] ?? round.drawings[artistId]!,
      }))
    : []

  const focusArtist = round.sabotagedArtistIds[0]
  const mission = round.missions[viewerId]

  return {
    prompt:
      room.status === 'draw' && youPlaying
        ? round.prompt
        : reveal
          ? round.prompt
          : null,
    mode: round.mode,
    drawingsDone,
    drawingsNeeded,
    editsDone,
    editsNeeded,
    yourMission:
      room.status === 'sabotage' && youPlaying && mission
        ? { id: mission.id, label: mission.label, difficulty: mission.difficulty }
        : null,
    yourEditBaseUrl:
      room.status === 'sabotage' && artistForYou && !youSubmittedEdit
        ? round.drawings[artistForYou] ?? null
        : null,
    youCanDraw: room.status === 'draw' && youPlaying && !round.drawings[viewerId],
    youCanEdit: room.status === 'sabotage' && youPlaying && Boolean(artistForYou) && !youSubmittedEdit,
    youCanGuess: room.status === 'guess' && youPlaying && !round.guesses[viewerId],
    youCanVote:
      room.status === 'vote' &&
      youPlaying &&
      round.mode !== 'doubleBluff' &&
      !round.votes[viewerId],
    yourGuess: round.guesses[viewerId] ?? null,
    yourVote: round.votes[viewerId] ?? null,
    suspectOptions: room.status === 'guess' || reveal ? suspectOptions : [],
    guessesCount: Object.keys(round.guesses).length,
    votesCount: Object.keys(round.votes).length,
    saboteurIds: reveal ? round.saboteurIds : [],
    sabotagedArtistIds: reveal ? round.sabotagedArtistIds : [],
    saboteurMissions: reveal
      ? round.saboteurIds.map((id) => round.missions[id]?.label ?? '').filter(Boolean)
      : [],
    focusOriginalUrl: reveal && focusArtist ? round.drawings[focusArtist] ?? null : null,
    focusFinalUrl:
      reveal && focusArtist
        ? round.finals[focusArtist] ?? round.drawings[focusArtist] ?? null
        : null,
    gallery,
    correctGuessers: reveal ? round._correctGuessers ?? [] : [],
    votedSaboteurCorrectly: reveal ? round._correctVoters ?? [] : [],
    revengeIds: reveal ? round._revengeIds ?? [] : [],
    roast: reveal ? round._roast ?? null : null,
    stealthBonusIds: reveal ? round._stealthBonusIds ?? [] : [],
  }
}

export function toPublicRoom(room: Room, viewerId: string): PublicRoom {
  const you = room.players.find((p) => p.id === viewerId)
  const playing = playingPlayers(room)
  return {
    code: room.code,
    hostId: room.hostId,
    hostName: room.players.find((p) => p.id === room.hostId)?.name ?? '?',
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
      playing: p.playing,
    })),
    language: room.language,
    status: room.status,
    isPublic: room.isPublic,
    promptPack: room.promptPack ?? 'classic',
    roundIndex: room.roundIndex,
    maxRounds: room.maxRounds,
    phaseEndsAt: room.phaseEndsAt,
    round: toPublicRound(room, viewerId),
    youAreHost: room.hostId === viewerId,
    youPlaying: Boolean(you?.playing),
    scores: [...room.players]
      .filter((p) => p.playing)
      .map((p) => ({ playerId: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    highlights: room.status === 'results' ? room.highlights ?? [] : [],
    minPlayers: MIN_PLAYERS,
    playingCount: playing.length,
    drawSeconds: Math.round(DRAW_MS / 1000),
    sabotageSeconds: Math.round(SABOTAGE_MS / 1000),
    yourStreak: room.saboteurStreak[viewerId] ?? 0,
  }
}

export type { RoomStatus }
