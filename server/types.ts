export type Lang = 'sv' | 'en'

export type RoomStatus =
  | 'lobby'
  | 'draw'
  | 'sabotage'
  | 'guess'
  | 'vote'
  | 'reveal'
  | 'results'

export type MissionKind = 'sabotage' | 'bluff'

export type PlayerMission = {
  id: string
  kind: MissionKind
  label: string
}

export type Player = {
  id: string
  name: string
  score: number
  connected: boolean
  playing: boolean
}

export type RoundState = {
  drawerId: string
  saboteurId: string
  prompt: string
  /** Assigned missions (saboteur gets real; others get bluff — client only sees own) */
  missions: Record<string, PlayerMission>
  originalUrl: string | null
  sabotagedUrl: string | null
  guessOptions: string[]
  guesses: Record<string, string>
  votes: Record<string, string>
  usedPromptHistory: string[]
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
  phaseEndsAt: number
  round: RoundState | null
  updatedAt: number
}

export type PublicPlayer = {
  id: string
  name: string
  score: number
  connected: boolean
  playing: boolean
}

export type PublicRound = {
  drawerId: string
  /** Only set during reveal */
  saboteurId: string | null
  /** Only for drawer during draw, or everyone during reveal */
  prompt: string | null
  originalUrl: string | null
  sabotagedUrl: string | null
  guessOptions: string[]
  guessesCount: number
  votesCount: number
  /** Your private mission during sabotage */
  yourMission: PlayerMission | null
  youAreDrawer: boolean
  youAreSaboteur: boolean
  youCanDraw: boolean
  youCanSabotage: boolean
  youCanGuess: boolean
  youCanVote: boolean
  yourGuess: string | null
  yourVote: string | null
  /** Reveal-only summary */
  correctGuessers: string[]
  votedSaboteurCorrectly: string[]
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
  phaseEndsAt: number
  round: PublicRound | null
  youAreHost: boolean
  youPlaying: boolean
  scores: { playerId: string; name: string; score: number }[]
  minPlayers: number
  playingCount: number
  drawSeconds: number
  sabotageSeconds: number
}
