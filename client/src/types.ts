export type Lang = 'sv' | 'en'

export type RoomStatus =
  | 'lobby'
  | 'draw'
  | 'sabotage'
  | 'guess'
  | 'vote'
  | 'reveal'
  | 'results'

export type MissionDifficulty = 'mild' | 'wild' | 'stealth'
export type PromptPack = 'classic' | 'food' | 'dark' | 'absurd'
export type RoundMode = 'normal' | 'doubleBluff' | 'doubleSaboteur'

export type PublicMission = {
  id: string
  label: string
  difficulty: MissionDifficulty
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
  isNone?: boolean
}

export type Highlight = {
  roundIndex: number
  imageUrl: string
  originalUrl: string
  saboteurName: string
  artistName: string
  mission: string
  roast: string
}

export type PublicRound = {
  prompt: string | null
  mode: RoundMode
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
  saboteurIds: string[]
  sabotagedArtistIds: string[]
  saboteurMissions: string[]
  focusOriginalUrl: string | null
  focusFinalUrl: string | null
  gallery: { artistId: string; artistName: string; originalUrl: string; finalUrl: string }[]
  correctGuessers: string[]
  votedSaboteurCorrectly: string[]
  revengeIds: string[]
  roast: string | null
  stealthBonusIds: string[]
}

export type PublicRoom = {
  code: string
  hostId: string
  hostName: string
  players: PublicPlayer[]
  language: Lang
  status: RoomStatus
  isPublic: boolean
  promptPack: PromptPack
  roundIndex: number
  maxRounds: number
  phaseEndsAt: number
  round: PublicRound | null
  youAreHost: boolean
  youPlaying: boolean
  scores: { playerId: string; name: string; score: number }[]
  highlights: Highlight[]
  minPlayers: number
  playingCount: number
  drawSeconds: number
  sabotageSeconds: number
  yourStreak: number
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

export const NONE_GUESS = '__none__'
