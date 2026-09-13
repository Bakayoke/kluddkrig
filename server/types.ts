export type Lang = 'sv' | 'en'

export type RoomStatus = 'lobby' | 'doodle' | 'fight' | 'results'

export type AbilityId =
  | 'teleport'
  | 'freeze'
  | 'invert'
  | 'giant'
  | 'inkblot'

export type Player = {
  id: string
  name: string
  score: number
  connected: boolean
  playing: boolean
  /** Data URL of doodle avatar (set during doodle phase) */
  avatarDataUrl: string | null
  /** Held loot ability, if any */
  ability: AbilityId | null
  doodleDone: boolean
}

export type ArenaId = 'platforms' | 'pit' | 'bridge'

export type FighterState = {
  playerId: string
  x: number
  y: number
  vx: number
  vy: number
  facing: 1 | -1
  hp: number
  grounded: boolean
  frozenUntil: number
  giantUntil: number
  invertUntil: number
  blindUntil: number
  punchCooldownUntil: number
  /** Visual flash after being hit */
  hitFlashUntil: number
}

export type LootCrate = {
  id: string
  x: number
  y: number
  ability: AbilityId
}

export type CombatEvent = {
  kind: 'hit' | 'loot' | 'ability'
  at: number
  actorId: string
  targetId?: string
  ability?: AbilityId
}

export type FightSnapshot = {
  arenaId: ArenaId
  fighters: FighterState[]
  crates: LootCrate[]
  tick: number
  shakeUntil: number
}

export type Room = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  hostPlays: boolean
  status: RoomStatus
  isPublic: boolean
  roundIndex: number
  maxRounds: number
  fightSeconds: number
  doodleSeconds: number
  phaseEndsAt: number
  arenaId: ArenaId
  fight: FightSnapshot | null
  lastEvent: CombatEvent | null
  updatedAt: number
}

export type PublicPlayer = {
  id: string
  name: string
  score: number
  connected: boolean
  playing: boolean
  avatarDataUrl: string | null
  doodleDone: boolean
  hasAbility: boolean
}

export type PublicRoom = {
  code: string
  hostId: string
  hostName: string
  players: PublicPlayer[]
  language: Lang
  status: RoomStatus
  isPublic: boolean
  roundIndex: number
  maxRounds: number
  fightSeconds: number
  doodleSeconds: number
  phaseEndsAt: number
  arenaId: ArenaId
  fight: FightSnapshot | null
  lastEvent: CombatEvent | null
  youAreHost: boolean
  youPlaying: boolean
  yourAbility: AbilityId | null
  yourAvatar: string | null
  doodleDoneCount: number
  doodleNeeded: number
  scores: { playerId: string; name: string; score: number }[]
  minPlayers: number
  playingCount: number
}
