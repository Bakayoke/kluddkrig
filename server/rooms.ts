import { customAlphabet } from 'nanoid'
import {
  ARENAS as ARENA_LAYOUTS,
  ARENA_W,
  COYOTE_MS,
  FRICTION_AIR,
  GRAVITY,
  JUMP_V,
  MAX_FALL,
  MOVE_AIR,
  MOVE_GROUND,
  clampX,
  inPit,
  resolveVertical,
} from './arena.js'
import type {
  AbilityId,
  ArenaId,
  ChaosKind,
  FightSnapshot,
  FighterState,
  Hazard,
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

const ARENA_IDS: ArenaId[] = ['platforms', 'pit', 'bridge']
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
  const pool = exclude ? ARENA_IDS.filter((a) => a !== exclude) : ARENA_IDS
  return pool[Math.floor(Math.random() * pool.length)] ?? 'platforms'
}

function spawnFighters(room: Room): FighterState[] {
  const layout = ARENA_LAYOUTS[room.arenaId]
  const players = playingPlayers(room)
  return players.map((p, i) => {
    const spawn = layout.spawns[i % layout.spawns.length]!
    return {
      playerId: p.id,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facing: (spawn.x < 400 ? 1 : -1) as 1 | -1,
      moveAxis: 0,
      hp: 100,
      grounded: true,
      coyoteUntil: 0,
      frozenUntil: 0,
      giantUntil: 0,
      invertUntil: 0,
      blindUntil: 0,
      punchCooldownUntil: 0,
      hitFlashUntil: 0,
    }
  })
}

function emptyFight(room: Room): FightSnapshot {
  const layout = ARENA_LAYOUTS[room.arenaId]
  return {
    arenaId: room.arenaId,
    platforms: layout.platforms.map((p) => ({ ...p })),
    pits: layout.pits.map((p) => ({ ...p })),
    fighters: spawnFighters(room),
    crates: [],
    hazards: [],
    chaos: null,
    tick: 0,
    shakeUntil: 0,
  }
}

function respawnFighter(f: FighterState, arenaId: ArenaId, fullHp = false) {
  const layout = ARENA_LAYOUTS[arenaId]
  const spawn = layout.spawns[Math.floor(Math.random() * layout.spawns.length)]!
  f.x = spawn.x
  f.y = spawn.y
  f.vx = 0
  f.vy = 0
  f.moveAxis = 0
  f.grounded = true
  f.coyoteUntil = Date.now() + COYOTE_MS
  f.frozenUntil = 0
  f.blindUntil = 0
  f.invertUntil = 0
  f.giantUntil = 0
  f.hp = fullHp ? 100 : Math.max(20, f.hp - 15)
  f.hitFlashUntil = Date.now() + 400
}

/** Apply damage; KO → full heal + random respawn. Returns true if KO. */
function hurtFighter(
  room: Room,
  f: FighterState,
  amount: number,
  opts?: { killerId?: string; killerName?: string },
): boolean {
  if (!room.fight) return false
  f.hp = Math.max(0, f.hp - amount)
  f.hitFlashUntil = Date.now() + 350
  if (f.hp > 0) return false
  const victim = room.players.find((p) => p.id === f.playerId)
  if (opts?.killerId && opts.killerId !== f.playerId) {
    const killer = room.players.find((p) => p.id === opts.killerId)
    if (killer) killer.score += 2
  }
  respawnFighter(f, room.fight.arenaId, true)
  pushEvent(room, {
    kind: 'ko',
    actorId: opts?.killerId ?? f.playerId,
    actorName: opts?.killerName ?? victim?.name ?? '?',
    targetId: f.playerId,
    targetName: victim?.name ?? '?',
    damage: amount,
  })
  room.fight.shakeUntil = Date.now() + 400
  return true
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
    lastEvent: null,
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
  room.lastEvent = null
  for (const p of room.players) {
    p.avatarDataUrl = null
    p.ability = null
    p.doodleDone = !p.playing
  }
  // No doodle timer — fight starts when every playing player marks ready
  room.phaseEndsAt = 0
  touch(room)
}

function pushEvent(
  room: Room,
  event: Omit<import('./types.js').CombatEvent, 'seq' | 'at'> & { at?: number },
) {
  const seq = (room.lastEvent?.seq ?? 0) + 1
  room.lastEvent = {
    ...event,
    at: event.at ?? Date.now(),
    seq,
    actorName: event.actorName,
  }
}

function beginFight(room: Room) {
  room.status = 'fight'
  room.fight = emptyFight(room)
  room.lastEvent = null
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
): { error: string } | { room: Room; broadcast: boolean } {
  const room = getRoom(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'fight' || !room.fight) return { error: 'Inte fight-fas' }
  const fighter = room.fight.fighters.find((f) => f.playerId === playerId)
  if (!fighter) return { error: 'Ingen fighter' }
  const actor = room.players.find((p) => p.id === playerId)

  const now = Date.now()
  if (fighter.frozenUntil > now) return { room, broadcast: false }

  let important = Boolean(input.jump || input.punch || input.ability)

  // Store raw stick intent; invert is applied each tick
  if (input.move !== undefined) {
    const move = input.move
    fighter.moveAxis = move
    if (move === 0) {
      fighter.vx = 0
    } else {
      const facing = fighter.invertUntil > now ? ((-move) as -1 | 1) : move
      fighter.facing = facing > 0 ? 1 : -1
    }
  }

  const canJump = fighter.grounded || fighter.coyoteUntil > now
  if (input.jump && canJump) {
    fighter.vy = JUMP_V
    fighter.grounded = false
    fighter.coyoteUntil = 0
  }

  if (input.punch && fighter.punchCooldownUntil <= now) {
    fighter.punchCooldownUntil = now + 320
    for (const other of room.fight.fighters) {
      if (other.playerId === playerId) continue
      const dx = other.x - fighter.x
      const dy = other.y - fighter.y
      const reach = fighter.giantUntil > now ? 78 : 52
      if (Math.abs(dx) < reach && Math.abs(dy) < 50 && Math.sign(dx || fighter.facing) === fighter.facing) {
        const dmg = fighter.giantUntil > now ? 16 : 10
        other.vx += fighter.facing * 10
        other.vy = Math.min(other.vy, -5)
        other.grounded = false
        other.coyoteUntil = 0
        if (actor) actor.score += 1
        const ko = hurtFighter(room, other, dmg, {
          killerId: playerId,
          killerName: actor?.name,
        })
        if (!ko) {
          pushEvent(room, {
            kind: 'hit',
            actorId: playerId,
            actorName: actor?.name ?? '?',
            targetId: other.playerId,
            targetName: room.players.find((p) => p.id === other.playerId)?.name ?? '?',
            damage: dmg,
          })
        }
        room.fight.shakeUntil = now + 350
        important = true
      }
    }
  }

  if (input.ability) {
    const player = room.players.find((p) => p.id === playerId)
    if (player?.ability) {
      const ability = player.ability
      const targetId = applyAbility(room, playerId, ability)
      player.ability = null
      const target = targetId ? room.players.find((p) => p.id === targetId) : undefined
      pushEvent(room, {
        kind: 'ability',
        actorId: playerId,
        actorName: actor?.name ?? '?',
        targetId: targetId ?? undefined,
        targetName: target?.name,
        ability,
      })
      room.fight.shakeUntil = now + 280
      important = true
    }
  }

  // Don't persist Redis on every stick nudge
  if (important) touch(room)
  return { room, broadcast: important }
}

function applyAbility(room: Room, fromId: string, ability: AbilityId): string | null {
  if (!room.fight) return null
  const now = Date.now()
  const layout = ARENA_LAYOUTS[room.arenaId]
  const others = room.fight.fighters.filter((f) => f.playerId !== fromId)
  const pick = others[Math.floor(Math.random() * others.length)]
  switch (ability) {
    case 'teleport':
      if (pick) {
        const spot = layout.spawns[Math.floor(Math.random() * layout.spawns.length)]!
        pick.x = spot.x
        pick.y = spot.y
        pick.vx = 0
        pick.vy = 0
        pick.hitFlashUntil = now + 400
        return pick.playerId
      }
      break
    case 'freeze':
      if (pick) {
        pick.frozenUntil = now + 2500
        return pick.playerId
      }
      break
    case 'invert':
      if (pick) {
        pick.invertUntil = now + 4000
        return pick.playerId
      }
      break
    case 'giant': {
      const self = room.fight.fighters.find((f) => f.playerId === fromId)
      if (self) self.giantUntil = now + 5000
      return fromId
    }
    case 'inkblot':
      if (pick) {
        pick.blindUntil = now + 3000
        pick.hitFlashUntil = now + 400
        return pick.playerId
      }
      break
  }
  return null
}

/** Physics tick ~33 Hz when polled at 30ms */
export function tickFight(room: Room) {
  if (room.status !== 'fight' || !room.fight) return
  const fight = room.fight
  if (!fight.hazards) fight.hazards = []
  if (fight.chaos === undefined) fight.chaos = null
  const layout = ARENA_LAYOUTS[fight.arenaId]
  fight.tick += 1
  const now = Date.now()

  if (fight.chaos && fight.chaos.endsAt <= now) fight.chaos = null

  const gravMul = fight.chaos?.kind === 'lowgrav' ? 0.42 : 1
  const wind = fight.chaos?.kind === 'wind' ? fight.chaos.dir * 2.4 : 0
  const quake = fight.chaos?.kind === 'quake'

  for (const f of fight.fighters) {
    if (f.frozenUntil > now) {
      f.vx = 0
      f.vy = 0
      f.moveAxis = 0
      continue
    }

    let axis = f.moveAxis
    if (f.invertUntil > now) axis = (-axis) as -1 | 0 | 1
    const speed = f.grounded ? MOVE_GROUND : MOVE_AIR
    if (axis === 0) {
      f.vx = f.grounded ? 0 : f.vx * FRICTION_AIR
    } else {
      f.vx = axis * (f.giantUntil > now ? speed * 0.85 : speed)
      f.facing = axis > 0 ? 1 : -1
    }
    f.vx += wind
    if (quake) f.vx += (Math.random() - 0.5) * 5

    f.vy = Math.min(MAX_FALL, f.vy + GRAVITY * gravMul)
    f.x = clampX(f.x + f.vx)
    const nextY = f.y + f.vy
    const resolved = resolveVertical(f.x, nextY, f.vy, layout)
    f.y = resolved.y
    f.vy = resolved.vy
    if (resolved.grounded) {
      f.grounded = true
      f.coyoteUntil = now + COYOTE_MS
      if (axis === 0 && !wind && !quake) f.vx = 0
    } else {
      f.grounded = false
    }

    if (inPit(f.x, f.y, layout) || f.y > 430) {
      respawnFighter(f, fight.arenaId, false)
      const name = room.players.find((p) => p.id === f.playerId)?.name ?? '?'
      pushEvent(room, {
        kind: 'hit',
        actorId: f.playerId,
        actorName: name,
        targetId: f.playerId,
        targetName: name,
        damage: 15,
      })
      fight.shakeUntil = now + 320
    }
  }

  // Random arena chaos (wind / quake / low grav)
  if (fight.tick % 110 === 35 && !fight.chaos && Math.random() < 0.62) {
    const kinds: ChaosKind[] = ['wind', 'quake', 'lowgrav']
    const kind = kinds[Math.floor(Math.random() * kinds.length)]!
    fight.chaos = {
      kind,
      dir: kind === 'wind' ? (Math.random() < 0.5 ? -1 : 1) : 0,
      endsAt: now + (kind === 'quake' ? 2800 : 4800),
    }
    if (kind === 'quake') fight.shakeUntil = Math.max(fight.shakeUntil, now + 2800)
    pushEvent(room, {
      kind: 'chaos',
      actorId: 'arena',
      actorName: 'Arena',
      chaosKind: kind,
    })
  }

  // Spawn dodge hazards
  if (fight.tick % 48 === 0 && fight.hazards.length < 4 && Math.random() < 0.72) {
    const roll = Math.random()
    let hazard: Hazard
    if (roll < 0.42) {
      hazard = {
        id: crypto.randomUUID(),
        kind: 'meteor',
        x: 50 + Math.random() * (ARENA_W - 100),
        y: -30,
        size: 26 + Math.random() * 10,
        vy: 0,
        warnUntil: now + 850,
        endsAt: now + 4200,
      }
    } else if (roll < 0.72) {
      const plat = layout.platforms[Math.floor(Math.random() * layout.platforms.length)]!
      hazard = {
        id: crypto.randomUUID(),
        kind: 'spike',
        x: plat.x + 16 + Math.random() * Math.max(8, plat.w - 32),
        y: plat.y,
        size: 20,
        vy: 0,
        warnUntil: now + 650,
        endsAt: now + 3200,
      }
    } else {
      hazard = {
        id: crypto.randomUUID(),
        kind: 'beam',
        x: 70 + Math.random() * (ARENA_W - 140),
        y: 0,
        size: 16,
        vy: 0,
        warnUntil: now + 750,
        endsAt: now + 2600,
      }
    }
    fight.hazards.push(hazard)
  }

  // Update + collide hazards
  const still: Hazard[] = []
  for (const h of fight.hazards) {
    if (h.endsAt <= now) continue
    const active = h.warnUntil <= now
    if (active && h.kind === 'meteor') {
      h.vy = Math.min(15, h.vy + 0.55)
      h.y += h.vy
      if (h.y > 460) continue
    }
    if (active) {
      for (const f of fight.fighters) {
        if (f.frozenUntil > now) continue
        let hit = false
        if (h.kind === 'meteor') {
          const dx = f.x - h.x
          const dy = f.y - 24 - h.y
          hit = dx * dx + dy * dy < (h.size + 22) * (h.size + 22)
        } else if (h.kind === 'spike' && fight.tick % 6 === 0) {
          hit = Math.abs(f.x - h.x) < h.size + 10 && f.y > h.y - 50 && f.y < h.y + 8
        } else if (h.kind === 'beam' && fight.tick % 7 === 0) {
          hit = Math.abs(f.x - h.x) < h.size + 14
        }
        if (hit) {
          const dmg = h.kind === 'meteor' ? 20 : h.kind === 'spike' ? 14 : 10
          hurtFighter(room, f, dmg)
          f.vx += (f.x < h.x ? -1 : 1) * 7
          f.vy = Math.min(f.vy, -4)
          f.grounded = false
          if (h.kind === 'meteor') {
            // meteor consumed
            h.endsAt = now
          }
        }
      }
    }
    if (h.endsAt > now) still.push(h)
  }
  fight.hazards = still

  if (fight.tick % 90 === 0 && fight.crates.length < 3) {
    const spot = layout.crateSpots[Math.floor(Math.random() * layout.crateSpots.length)]!
    const cluttered = fight.crates.some((c) => Math.abs(c.x - spot.x) < 40)
    if (!cluttered) {
      fight.crates.push({
        id: crypto.randomUUID(),
        x: spot.x,
        y: spot.y - 18,
        ability: ABILITIES[Math.floor(Math.random() * ABILITIES.length)]!,
      })
    }
  }

  for (const f of fight.fighters) {
    const idx = fight.crates.findIndex(
      (c) => Math.abs(c.x - f.x) < 36 && Math.abs(c.y - (f.y - 24)) < 44,
    )
    if (idx >= 0) {
      const crate = fight.crates[idx]!
      const player = room.players.find((p) => p.id === f.playerId)
      if (player && !player.ability) {
        player.ability = crate.ability
        fight.crates.splice(idx, 1)
        pushEvent(room, {
          kind: 'loot',
          actorId: f.playerId,
          actorName: player.name,
          ability: crate.ability,
        })
        fight.shakeUntil = now + 200
      }
    }
  }

  touch(room)
}

export function onPhaseTimeout(room: Room) {
  // Doodle has no timeout — players ready up individually via submitDoodle
  if (room.status === 'doodle') {
    room.phaseEndsAt = 0
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
    if (
      room.phaseEndsAt > 0 &&
      room.phaseEndsAt <= now &&
      room.status !== 'lobby' &&
      room.status !== 'doodle'
    ) {
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
  room.lastEvent = null
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
    const fight =
      room.status === 'fight' && room.fight
        ? {
            ...room.fight,
            hazards: room.fight.hazards ?? [],
            chaos: room.fight.chaos ?? null,
          }
        : null
    rooms.set(room.code, {
      ...room,
      lastEvent: room.lastEvent ?? null,
      players: room.players.map((p) => ({ ...p, connected: false })),
      fight,
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
    phaseEndsAt: room.status === 'doodle' ? 0 : room.phaseEndsAt,
    arenaId: room.arenaId,
    fight: room.fight,
    lastEvent: room.lastEvent,
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
