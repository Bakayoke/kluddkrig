import { customAlphabet } from 'nanoid'
import type {
  AbilityId,
  ArenaId,
  FightSnapshot,
  FighterState,
  Lang,
  Player,
  PublicRoom,
  Room,
  RoomStatus,
} from './types.js'

const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ', 4)

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8
export const DEFAULT_DOODLE_SECONDS = 15
export const DEFAULT_FIGHT_SECONDS = 75
export const DEFAULT_MAX_ROUNDS = 3
export const RESULTS_MS = 12_000

const ARENAS: ArenaId[] = ['platforms', 'pit', 'bridge']
const ABILITIES: AbilityId[] = ['teleport', 'freeze', 'invert', 'giant', 'inkblot']

const DISCONNECT_GRACE_MS = 60_000
const ROOM_IDLE_MS = 12 * 60 * 60 * 1000

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

function pickArena(exclude?: ArenaId): ArenaId {
  const pool = exclude ? ARENAS.filter((a) => a !== exclude) : ARENAS
  return pool[Math.floor(Math.random() * pool.length)] ?? 'platforms'
}

function spawnFighters(room: Room): FighterState[] {
  const players = playingPlayers(room)
  return players.map((p, i) => ({
    playerId: p.id,
    x: 120 + i * 100,
    y: 280,
    vx: 0,
    vy: 0,
    facing: 1 as const,
    hp: 100,
    frozenUntil: 0,
    giantUntil: 0,
    invertUntil: 0,
    blindUntil: 0,
    punchCooldownUntil: 0,
  }))
}

function emptyFight(room: Room): FightSnapshot {
  return {
    arenaId: room.arenaId,
    fighters: spawnFighters(room),
    crates: [],
    tick: 0,
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
    avatarDataUrl: null,
    ability: null,
    doodleDone: false,
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
    fightSeconds: DEFAULT_FIGHT_SECONDS,
    doodleSeconds: DEFAULT_DOODLE_SECONDS,
    phaseEndsAt: 0,
    arenaId: 'platforms',
    fight: null,
    updatedAt: Date.now(),
  }

  rooms.set(code, room)
  socketToPlayer.set(socketId, { code, playerId })
  touch(room)
  return { room, playerId }
}

export function joinRoom(
  code: string,
  name: string,
  socketId: string,
): { room: Room; playerId: string } | { error: string; code?: string } {
  const room = rooms.get(code.toUpperCase().trim())
  if (!room) return { error: 'Hittade inget spel med den koden', code: 'NOT_FOUND' }

  if (room.status !== 'lobby') {
    return { error: 'Spelet har redan startat', code: 'STARTED' }
  }

  if (room.players.length >= MAX_PLAYERS) {
    return { error: `Rummet är fullt (max ${MAX_PLAYERS})`, code: 'ROOM_FULL' }
  }

  const displayName =
    name.trim().slice(0, 20) || (room.language === 'en' ? 'Player' : 'Spelare')

  const playerId = crypto.randomUUID()
  room.players.push({
    id: playerId,
    name: displayName,
    score: 0,
    connected: true,
    playing: true,
    avatarDataUrl: null,
    ability: null,
    doodleDone: false,
  })
  socketToPlayer.set(socketId, { code: room.code, playerId })
  touch(room)
  return { room, playerId }
}

export function reconnectSocket(
  code: string,
  playerId: string,
  socketId: string,
): Room | { error: string } {
  const room = rooms.get(code.toUpperCase().trim())
  if (!room) return { error: 'Rummet finns inte' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { error: 'Spelaren hittades inte' }

  cancelDisconnectTimer(room.code, playerId)
  for (const [sid, binding] of socketToPlayer) {
    if (binding.code === room.code && binding.playerId === playerId) {
      socketToPlayer.delete(sid)
    }
  }
  socketToPlayer.set(socketId, { code: room.code, playerId })
  player.connected = true
  touch(room)
  return room
}

export function disconnectSocket(socketId: string): Room | null {
  const binding = socketToPlayer.get(socketId)
  if (!binding) return null
  socketToPlayer.delete(socketId)
  const room = rooms.get(binding.code)
  if (!room) return null
  const player = room.players.find((p) => p.id === binding.playerId)
  if (!player) return null

  player.connected = false
  touch(room)

  const key = playerKey(room.code, player.id)
  cancelDisconnectTimer(room.code, player.id)
  disconnectTimers.set(
    key,
    setTimeout(() => {
      disconnectTimers.delete(key)
      const r = rooms.get(binding.code)
      if (!r) return
      const p = r.players.find((x) => x.id === binding.playerId)
      if (!p || p.connected) return
      if (r.status === 'lobby') {
        r.players = r.players.filter((x) => x.id !== p.id)
        if (r.hostId === p.id && r.players.length > 0) {
          r.hostId = r.players[0]!.id
        }
        if (r.players.length === 0) rooms.delete(r.code)
      }
      touch(r)
    }, DISCONNECT_GRACE_MS),
  )

  return room
}

export function setHostPlaying(code: string, playerId: string, playing: boolean) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  if (room.status !== 'lobby') return { error: 'Kan bara ändras i lobbyn' }
  room.hostPlays = playing
  const host = room.players.find((p) => p.id === room.hostId)
  if (host) host.playing = playing
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
  opts: { maxRounds?: number; fightSeconds?: number; doodleSeconds?: number },
) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  if (room.status !== 'lobby') return { error: 'Kan bara ändras i lobbyn' }
  if (opts.maxRounds != null) room.maxRounds = Math.min(7, Math.max(1, Math.round(opts.maxRounds)))
  if (opts.fightSeconds != null)
    room.fightSeconds = Math.min(180, Math.max(30, Math.round(opts.fightSeconds)))
  if (opts.doodleSeconds != null)
    room.doodleSeconds = Math.min(30, Math.max(8, Math.round(opts.doodleSeconds)))
  touch(room)
  return room
}

function beginDoodle(room: Room) {
  room.status = 'doodle'
  room.roundIndex += 1
  room.arenaId = pickArena(room.arenaId)
  room.fight = null
  for (const p of room.players) {
    p.avatarDataUrl = null
    p.ability = null
    p.doodleDone = !p.playing
  }
  room.phaseEndsAt = Date.now() + room.doodleSeconds * 1000
  touch(room)
}

function beginFight(room: Room) {
  room.status = 'fight'
  room.fight = emptyFight(room)
  room.phaseEndsAt = Date.now() + room.fightSeconds * 1000
  touch(room)
}

function beginResults(room: Room) {
  room.status = 'results'
  room.phaseEndsAt = Date.now() + RESULTS_MS
  // Placeholder scoring: +1 for each connected playing fighter still "alive" (hp > 0)
  if (room.fight) {
    for (const f of room.fight.fighters) {
      if (f.hp > 0) {
        const p = room.players.find((x) => x.id === f.playerId)
        if (p) p.score += 1
      }
    }
  }
  touch(room)
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
  if (room.status === 'lobby') {
    room.roundIndex = 0
    for (const p of room.players) p.score = 0
  }
  beginDoodle(room)
  return room
}

export function submitDoodle(code: string, playerId: string, imageDataUrl: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'doodle') return { error: 'Inte doodle-fas' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player || !player.playing) return { error: 'Du spelar inte' }

  const raw = String(imageDataUrl ?? '')
  if (!raw.startsWith('data:image/') || raw.length > 800_000) {
    return { error: 'Ogiltig bild' }
  }

  player.avatarDataUrl = raw
  player.doodleDone = true
  touch(room)

  const needed = playingPlayers(room)
  if (needed.every((p) => p.doodleDone)) {
    beginFight(room)
  }
  return room
}

export function playerInput(
  code: string,
  playerId: string,
  input: { move?: -1 | 0 | 1; jump?: boolean; punch?: boolean; ability?: boolean },
) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'fight' || !room.fight) return { error: 'Inte fight-fas' }
  const fighter = room.fight.fighters.find((f) => f.playerId === playerId)
  if (!fighter) return { error: 'Ingen fighter' }

  const now = Date.now()
  if (fighter.frozenUntil > now) return room

  let move = input.move ?? 0
  if (fighter.invertUntil > now) move = (-move) as -1 | 0 | 1
  if (move !== 0) {
    fighter.vx = move * (fighter.giantUntil > now ? 4 : 6)
    fighter.facing = move > 0 ? 1 : -1
  } else {
    fighter.vx *= 0.7
  }

  if (input.jump) {
    fighter.vy = -12
  }

  if (input.punch && fighter.punchCooldownUntil <= now) {
    fighter.punchCooldownUntil = now + 400
    // Simple hit check placeholder
    for (const other of room.fight.fighters) {
      if (other.playerId === playerId) continue
      const dx = other.x - fighter.x
      const dy = other.y - fighter.y
      const reach = fighter.giantUntil > now ? 80 : 50
      if (Math.abs(dx) < reach && Math.abs(dy) < 40 && Math.sign(dx) === fighter.facing) {
        other.hp = Math.max(0, other.hp - (fighter.giantUntil > now ? 18 : 10))
        other.vx += fighter.facing * 8
        const attacker = room.players.find((p) => p.id === playerId)
        if (attacker) attacker.score += 1
      }
    }
  }

  if (input.ability) {
    const player = room.players.find((p) => p.id === playerId)
    if (player?.ability) {
      applyAbility(room, playerId, player.ability)
      player.ability = null
    }
  }

  touch(room)
  return room
}

function applyAbility(room: Room, fromId: string, ability: AbilityId) {
  if (!room.fight) return
  const now = Date.now()
  const others = room.fight.fighters.filter((f) => f.playerId !== fromId)
  const pick = others[Math.floor(Math.random() * others.length)]
  switch (ability) {
    case 'teleport':
      if (pick) {
        pick.x = 80 + Math.random() * 640
        pick.y = 80 + Math.random() * 240
      }
      break
    case 'freeze':
      if (pick) pick.frozenUntil = now + 2500
      break
    case 'invert':
      if (pick) pick.invertUntil = now + 4000
      break
    case 'giant': {
      const self = room.fight.fighters.find((f) => f.playerId === fromId)
      if (self) self.giantUntil = now + 5000
      break
    }
    case 'inkblot':
      if (pick) pick.blindUntil = now + 3000
      break
  }
}

/** Lightweight placeholder tick — real physics comes later */
export function tickFight(room: Room) {
  if (room.status !== 'fight' || !room.fight) return
  const fight = room.fight
  fight.tick += 1

  for (const f of fight.fighters) {
    f.x += f.vx
    f.y += f.vy
    f.vy += 0.6
    if (f.y > 320) {
      f.y = 320
      f.vy = 0
    }
    f.x = Math.max(40, Math.min(760, f.x))
  }

  // Spawn loot occasionally
  if (fight.tick % 100 === 0 && fight.crates.length < 3) {
    fight.crates.push({
      id: crypto.randomUUID(),
      x: 100 + Math.random() * 600,
      y: 280,
      ability: ABILITIES[Math.floor(Math.random() * ABILITIES.length)]!,
    })
  }

  // Pickup crates
  for (const f of fight.fighters) {
    const idx = fight.crates.findIndex(
      (c) => Math.abs(c.x - f.x) < 30 && Math.abs(c.y - f.y) < 40,
    )
    if (idx >= 0) {
      const crate = fight.crates[idx]!
      const player = room.players.find((p) => p.id === f.playerId)
      if (player && !player.ability) {
        player.ability = crate.ability
        fight.crates.splice(idx, 1)
      }
    }
  }

  touch(room)
}

export function onPhaseTimeout(room: Room) {
  if (room.status === 'doodle') {
    for (const p of playingPlayers(room)) {
      if (!p.doodleDone) p.doodleDone = true
    }
    beginFight(room)
    return
  }
  if (room.status === 'fight') {
    beginResults(room)
    return
  }
  if (room.status === 'results') {
    if (room.roundIndex >= room.maxRounds) {
      room.status = 'lobby'
      room.phaseEndsAt = 0
      room.fight = null
      touch(room)
      return
    }
    beginDoodle(room)
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

export function roomsInFight(): Room[] {
  return [...rooms.values()].filter((r) => r.status === 'fight')
}

export function rematch(code: string, playerId: string) {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  room.status = 'lobby'
  room.roundIndex = 0
  room.phaseEndsAt = 0
  room.fight = null
  for (const p of room.players) {
    p.score = 0
    p.avatarDataUrl = null
    p.ability = null
    p.doodleDone = false
  }
  touch(room)
  return room
}

export function backToLobby(code: string, playerId: string) {
  return rematch(code, playerId)
}

export function pruneIdleRooms() {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > ROOM_IDLE_MS) {
      rooms.delete(code)
    }
  }
}

export function hydrateRooms(list: Room[]) {
  rooms.clear()
  for (const room of list) {
    rooms.set(room.code, {
      ...room,
      players: room.players.map((p) => ({ ...p, connected: false })),
      fight: room.status === 'fight' ? room.fight : null,
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
      avatarDataUrl: p.avatarDataUrl,
      doodleDone: p.doodleDone,
      hasAbility: Boolean(p.ability),
    })),
    language: room.language,
    status: room.status,
    isPublic: room.isPublic,
    roundIndex: room.roundIndex,
    maxRounds: room.maxRounds,
    fightSeconds: room.fightSeconds,
    doodleSeconds: room.doodleSeconds,
    phaseEndsAt: room.phaseEndsAt,
    arenaId: room.arenaId,
    fight: room.fight,
    youAreHost: room.hostId === viewerId,
    youPlaying: Boolean(you?.playing),
    yourAbility: you?.ability ?? null,
    yourAvatar: you?.avatarDataUrl ?? null,
    doodleDoneCount: playing.filter((p) => p.doodleDone).length,
    doodleNeeded: playing.length,
    scores: [...room.players]
      .filter((p) => p.playing)
      .map((p) => ({ playerId: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    minPlayers: MIN_PLAYERS,
    playingCount: playing.length,
  }
}

export type { RoomStatus }
