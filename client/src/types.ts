export type Lang = 'sv' | 'en'

export type RoomStatus =
  | 'lobby'
  | 'draw'
  | 'sabotage'
  | 'guess'
  | 'vote'
  | 'reveal'
  | 'results'

export type PublicMission = {
  id: string
  label: string
}

export type PublicPlayer = {
  id: string
  name: string
  score: number
  connected: boolean
  playing: boolean
}

export type SuspectOption = {
  id: string
  imageUrl: string
}

export type PublicRound = {
  prompt: string | null
  drawingsDone: number
  drawingsNeeded: number
  editsDone: number
  editsNeeded: number
  yourMission: PublicMission | null
  yourEditBaseUrl: string | null
  youCanDraw: boolean
  youCanEdit: boolean
  youCanGuess: boolean
  youCanVote: boolean
  yourGuess: string | null
  yourVote: string | null
  suspectOptions: SuspectOption[]
  guessesCount: number
  votesCount: number
  saboteurId: string | null
  sabotagedArtistId: string | null
  saboteurMission: string | null
  focusOriginalUrl: string | null
  focusFinalUrl: string | null
  gallery: { artistId: string; artistName: string; originalUrl: string; finalUrl: string }[]
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
