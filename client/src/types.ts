export type Lang = 'sv' | 'en'

export type RoomStatus = 'lobby' | 'doodle' | 'fight' | 'results'

export type AbilityId = 'teleport' | 'freeze' | 'invert' | 'giant' | 'inkblot'

export type ArenaId = 'platforms' | 'pit' | 'bridge'

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

export type FighterState = {
  playerId: string
  x: number
  y: number
  vx: number
  vy: number
  facing: 1 | -1
  hp: number
  frozenUntil: number
  giantUntil: number
  invertUntil: number
  blindUntil: number
  punchCooldownUntil: number
}

export type LootCrate = {
  id: string
  x: number
  y: number
  ability: AbilityId
}

export type FightSnapshot = {
  arenaId: ArenaId
  fighters: FighterState[]
  crates: LootCrate[]
  tick: number
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

export type Session = {
  code: string
  playerId: string
  name: string
}
