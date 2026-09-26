import { customAlphabet } from 'nanoid'
import {
  guessOptions,
  missionLabel,
  pickBluffMission,
  pickPrompt,
  pickSabotageMission,
} from './content.js'
import type {
  Lang,
  Player,
  PlayerMission,
  PublicRoom,
  PublicRound,
  Room,
  RoomStatus,
  RoundState,
} from './types.js'

const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ', 4)

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 8
export const DEFAULT_MAX_ROUNDS = 3
export const DRAW_MS = 60_000
export const SABOTAGE_MS = 45_000
export const GUESS_MS = 30_000
export const VOTE_MS = 25_000
export const REVEAL_MS = 12_000
export const RESULTS_MS = 15_000

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

function normalizeGuess(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, '')
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

export function setGameOptions(code: string, playerId: string, opts: { maxRounds?: number }) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  if (opts.maxRounds != null) room.maxRounds = Math.min(8, Math.max(1, Math.round(opts.maxRounds)))
  touch(room)
  return room
}

function pickDrawer(room: Room) {
  const playing = playingPlayers(room)
  if (playing.length === 0) return null
  return playing[(room.roundIndex - 1) % playing.length]!
}

function beginDraw(room: Room) {
  room.roundIndex += 1
  const drawer = pickDrawer(room)
  if (!drawer) {
    room.status = 'lobby'
    room.round = null
    room.phaseEndsAt = 0
    return
  }
  const history = room.round?.usedPromptHistory ?? []
  const prompt = pickPrompt(room.language, history)
  const round: RoundState = {
    drawerId: drawer.id,
    saboteurId: '',
    prompt,
    missions: {},
    originalUrl: null,
    sabotagedUrl: null,
    guessOptions: [],
    guesses: {},
    votes: {},
    usedPromptHistory: [...history, prompt].slice(-40),
  }
  room.round = round
  room.status = 'draw'
  room.phaseEndsAt = Date.now() + DRAW_MS
  touch(room)
}

function dealMissions(room: Room) {
  const round = room.round
  if (!round) return
  const candidates = playingPlayers(room).filter((p) => p.id !== round.drawerId)
  if (candidates.length === 0) return
  const saboteur = candidates[Math.floor(Math.random() * candidates.length)]!
  round.saboteurId = saboteur.id
  const sabMission = pickSabotageMission()
  const usedBluff: string[] = []
  const missions: Record<string, PlayerMission> = {}
  for (const p of candidates) {
    if (p.id === saboteur.id) {
      missions[p.id] = {
        id: sabMission.id,
        kind: 'sabotage',
        label: missionLabel(sabMission, room.language),
      }
    } else {
      const bluff = pickBluffMission(usedBluff)
      usedBluff.push(bluff.id)
      missions[p.id] = {
        id: bluff.id,
        kind: 'bluff',
        label: missionLabel(bluff, room.language),
      }
    }
  }
  round.missions = missions
}

function beginSabotage(room: Room) {
  if (!room.round?.originalUrl) {
    // Nothing drawn — skip to next round
    advanceAfterReveal(room)
    return
  }
  dealMissions(room)
  room.status = 'sabotage'
  room.phaseEndsAt = Date.now() + SABOTAGE_MS
  touch(room)
}

function beginGuess(room: Room) {
  const round = room.round
  if (!round) return
  if (!round.sabotagedUrl) round.sabotagedUrl = round.originalUrl
  round.guessOptions = guessOptions(round.prompt, room.language, 6)
  round.guesses = {}
  room.status = 'guess'
  room.phaseEndsAt = Date.now() + GUESS_MS
  touch(room)
}

function beginVote(room: Room) {
  if (!room.round) return
  room.round.votes = {}
  room.status = 'vote'
  room.phaseEndsAt = Date.now() + VOTE_MS
  touch(room)
}

function scoreRound(room: Room) {
  const round = room.round
  if (!round) return
  const guessers = playingPlayers(room).filter((p) => p.id !== round.drawerId)
  const correctIds: string[] = []
  for (const g of guessers) {
    const guess = round.guesses[g.id]
    if (guess && normalizeGuess(guess) === normalizeGuess(round.prompt)) {
      correctIds.push(g.id)
      g.score += 1
    }
  }
  const half = Math.ceil(guessers.length / 2)
  const majorityCorrect = correctIds.length >= half && guessers.length > 0
  const drawer = room.players.find((p) => p.id === round.drawerId)
  if (drawer && majorityCorrect) drawer.score += 2

  const voters = playingPlayers(room).filter((p) => p.id !== round.saboteurId)
  const correctVoters: string[] = []
  let wrongMajority = 0
  let rightMajority = 0
  for (const v of voters) {
    const vote = round.votes[v.id]
    if (!vote) continue
    if (vote === round.saboteurId) {
      correctVoters.push(v.id)
      v.score += 1
      rightMajority += 1
    } else {
      wrongMajority += 1
    }
  }
  const saboteur = room.players.find((p) => p.id === round.saboteurId)
  const sabotageWorked = !majorityCorrect || wrongMajority > rightMajority
  if (saboteur && sabotageWorked) saboteur.score += 3

  // stash for reveal UI via toPublicRoom derived fields
  ;(round as RoundState & { _correctGuessers?: string[]; _correctVoters?: string[] })._correctGuessers =
    correctIds
  ;(round as RoundState & { _correctGuessers?: string[]; _correctVoters?: string[] })._correctVoters =
    correctVoters
}

function beginReveal(room: Room) {
  scoreRound(room)
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
  }
  room.round = null
  beginDraw(room)
  return room
}

export function submitDrawing(code: string, playerId: string, imageDataUrl: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'draw' || !room.round) return { error: 'Inte ritfas' }
  if (room.round.drawerId !== playerId) return { error: 'Du ritar inte nu' }
  const img = sanitizeImage(imageDataUrl)
  if (!img) return { error: 'Ogiltig bild' }
  room.round.originalUrl = img
  beginSabotage(room)
  return room
}

export function submitSabotage(code: string, playerId: string, imageDataUrl: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'sabotage' || !room.round) return { error: 'Inte sabotage-fas' }
  if (room.round.saboteurId !== playerId) return { error: 'Du är inte sabotören' }
  const img = sanitizeImage(imageDataUrl)
  if (!img) return { error: 'Ogiltig bild' }
  room.round.sabotagedUrl = img
  beginGuess(room)
  return room
}

export function submitGuess(code: string, playerId: string, guess: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'guess' || !room.round) return { error: 'Inte gissningsfas' }
  if (room.round.drawerId === playerId) return { error: 'Ritaren gissar inte' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player?.playing) return { error: 'Du spelar inte' }
  const cleaned = String(guess ?? '').trim().slice(0, 40)
  if (!cleaned) return { error: 'Tom gissning' }
  if (!room.round.guessOptions.includes(cleaned)) return { error: 'Ogiltig gissning' }
  room.round.guesses[playerId] = cleaned
  touch(room)
  const need = playingPlayers(room).filter((p) => p.id !== room.round!.drawerId)
  if (need.every((p) => room.round!.guesses[p.id])) beginVote(room)
  return room
}

export function submitVote(code: string, playerId: string, targetId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'vote' || !room.round) return { error: 'Inte röstrunda' }
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
    if (!room.round?.originalUrl) {
      // Skip empty draw
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
      players: room.players.map((p) => ({ ...p, connected: false })),
      round: room.status === 'lobby' || room.status === 'results' ? room.round : room.round,
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
  const round = room.round
  if (!round) return null
  const reveal = room.status === 'reveal' || room.status === 'results'
  const youAreDrawer = round.drawerId === viewerId
  const youAreSaboteur = round.saboteurId === viewerId
  const showPrompt =
    reveal || (room.status === 'draw' && youAreDrawer)
  const yourMission =
    room.status === 'sabotage' && !youAreDrawer ? round.missions[viewerId] ?? null : null

  const extra = round as RoundState & {
    _correctGuessers?: string[]
    _correctVoters?: string[]
  }

  return {
    drawerId: round.drawerId,
    saboteurId: reveal ? round.saboteurId : null,
    prompt: showPrompt ? round.prompt : null,
    originalUrl: reveal || room.status === 'sabotage' ? round.originalUrl : round.originalUrl,
    // During draw: no image yet on TV until submitted; during sabotage TV can show original dimmed
    // During guess/vote: only sabotaged; during reveal: both
    sabotagedUrl:
      room.status === 'guess' || room.status === 'vote' || reveal
        ? round.sabotagedUrl
        : null,
    guessOptions: room.status === 'guess' || reveal ? round.guessOptions : [],
    guessesCount: Object.keys(round.guesses).length,
    votesCount: Object.keys(round.votes).length,
    yourMission,
    youAreDrawer,
    youAreSaboteur: reveal ? youAreSaboteur : false,
    youCanDraw: room.status === 'draw' && youAreDrawer && !round.originalUrl,
    youCanSabotage: room.status === 'sabotage' && youAreSaboteur && !round.sabotagedUrl,
    youCanGuess:
      room.status === 'guess' && !youAreDrawer && !round.guesses[viewerId],
    youCanVote: room.status === 'vote' && !round.votes[viewerId],
    yourGuess: round.guesses[viewerId] ?? null,
    yourVote: round.votes[viewerId] ?? null,
    correctGuessers: reveal ? extra._correctGuessers ?? [] : [],
    votedSaboteurCorrectly: reveal ? extra._correctVoters ?? [] : [],
  }
}

export function toPublicRoom(room: Room, viewerId: string): PublicRoom {
  const you = room.players.find((p) => p.id === viewerId)
  const playing = playingPlayers(room)
  const pubRound = toPublicRound(room, viewerId)

  // TV-friendly: during draw show nothing until done; expose original for TV wait screen after submit
  if (pubRound && room.status === 'draw' && room.round?.originalUrl) {
    pubRound.originalUrl = room.round.originalUrl
  }
  if (pubRound && room.status === 'sabotage') {
    pubRound.originalUrl = room.round?.originalUrl ?? null
  }
  if (pubRound && (room.status === 'guess' || room.status === 'vote')) {
    pubRound.originalUrl = null
  }

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
    roundIndex: room.roundIndex,
    maxRounds: room.maxRounds,
    phaseEndsAt: room.phaseEndsAt,
    round: pubRound,
    youAreHost: room.hostId === viewerId,
    youPlaying: Boolean(you?.playing),
    scores: [...room.players]
      .filter((p) => p.playing)
      .map((p) => ({ playerId: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    minPlayers: MIN_PLAYERS,
    playingCount: playing.length,
    drawSeconds: Math.round(DRAW_MS / 1000),
    sabotageSeconds: Math.round(SABOTAGE_MS / 1000),
  }
}

export type { RoomStatus }
