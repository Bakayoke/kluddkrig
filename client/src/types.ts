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

export type PublicPlayer = {
  id: string
  name: string
  score: number
  connected: boolean
  playing: boolean
}

export type PublicRound = {
  drawerId: string
  saboteurId: string | null
  prompt: string | null
  originalUrl: string | null
  sabotagedUrl: string | null
  guessOptions: string[]
  guessesCount: number
  votesCount: number
  yourMission: PlayerMission | null
  youAreDrawer: boolean
  youAreSaboteur: boolean
  youCanDraw: boolean
  youCanSabotage: boolean
  youCanGuess: boolean
  youCanVote: boolean
  yourGuess: string | null
  yourVote: string | null
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

export type Session = {
  code: string
  playerId: string
  name: string
}

export type RoomPreview = {
  code: string
  language: Lang
  status: string
  playerCount: number
  hostName: string
  isPublic: boolean
}
