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
  /** Shared word for the round */
  prompt: string
  /** playerId → original drawing */
  drawings: Record<string, string>
  /** editorId → artistId whose drawing they edit */
  editOf: Record<string, string>
  /** editorId → mission */
  missions: Record<string, PlayerMission>
  /** Editor with the real sabotage mission */
  saboteurId: string
  /** artistId → final image after edit (defaults to original if skipped) */
  finals: Record<string, string>
  /** artistId of the drawing that received real sabotage */
  sabotagedArtistId: string
  /** guesses: playerId → artistId they think was sabotaged */
  guesses: Record<string, string>
  /** votes: playerId → saboteur playerId */
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

export type SuspectOption = {
  id: string
  imageUrl: string
}

/** Mission shown to a player — never includes real vs bluff */
export type PublicMission = {
  id: string
  label: string
}

export type PublicRound = {
  /** Shared prompt — during draw for players; during reveal for all */
  prompt: string | null
  drawingsDone: number
  drawingsNeeded: number
  editsDone: number
  editsNeeded: number
  /** Your private mission during sabotage (looks like sabotage for everyone) */
  yourMission: PublicMission | null
  /** Base image you should edit */
  yourEditBaseUrl: string | null
  youCanDraw: boolean
  youCanEdit: boolean
  youCanGuess: boolean
  youCanVote: boolean
  yourGuess: string | null
  yourVote: string | null
  /** Anonymized finals to pick the sabotaged one */
  suspectOptions: SuspectOption[]
  guessesCount: number
  votesCount: number
  /** Reveal */
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
