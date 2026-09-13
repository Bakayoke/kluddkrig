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

export type Platform = { x: number; y: number; w: number; h: number }

export type FighterState = {
  playerId: string
  x: number
  y: number
  vx: number
  vy: number
  facing: 1 | -1
  /** Held move intent from phone (-1/0/1). Applied each physics tick. */
  moveAxis: -1 | 0 | 1
  hp: number
  grounded: boolean
  coyoteUntil: number
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

/** Things to dodge in the arena */
export type Hazard = {
  id: string
  kind: 'meteor' | 'spike' | 'beam'
  x: number
  y: number
  /** meteor radius / beam half-width */
  size: number
  /** For meteor: vertical speed once active */
  vy: number
  /** Warning phase until this time, then active */
  warnUntil: number
  /** Remove after */
  endsAt: number
}

export type ChaosKind = 'wind' | 'quake' | 'lowgrav'

export type ChaosState = {
  kind: ChaosKind
  /** wind direction */
  dir: -1 | 0 | 1
  endsAt: number
}

export type CombatEvent = {
  kind: 'hit' | 'loot' | 'ability' | 'chaos' | 'ko'
  at: number
  seq: number
  actorId: string
  actorName: string
  targetId?: string
  targetName?: string
  ability?: AbilityId
  damage?: number
  chaosKind?: ChaosKind | Hazard['kind']
}

export type FightSnapshot = {
  arenaId: ArenaId
  /** Authoritative geometry — client must draw these, not a local copy */
  platforms: Platform[]
  pits: { x: number; w: number }[]
  fighters: FighterState[]
  crates: LootCrate[]
  hazards: Hazard[]
  chaos: ChaosState | null
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
