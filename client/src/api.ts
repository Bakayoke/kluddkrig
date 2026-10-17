import { io, type Socket } from 'socket.io-client'
import type { Lang, PublicRoom, ReactionEvent, Session } from './types'

const API_BASE = (import.meta.env.VITE_SOCKET_URL || '').replace(/\/$/, '')

let socket: Socket | null = null
let rejoinInFlight: Promise<{
  ok: boolean
  playerId?: string
  room?: PublicRoom
  error?: string
} | null> | null = null
let connectionListenersAttached = false
/** Only apply room events matching this code (set when entering a room). */
let activeRoomCode: string | null = null
/** Bumps when session is cleared/replaced so in-flight rejoins are ignored. */
let sessionEpoch = 0

type RoomHandler = (room: PublicRoom) => void
type ReactionHandler = (reaction: ReactionEvent) => void
let onRoomHandler: RoomHandler | null = null
let onReactionHandler: ReactionHandler | null = null

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE || undefined, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8_000,
      timeout: 25_000,
    })
  }

  if (!connectionListenersAttached) {
    connectionListenersAttached = true
    socket.on('connect', () => {
      void ensureSessionBound()
    })
    socket.on('room', (room: PublicRoom) => {
      if (!activeRoomCode || room.code !== activeRoomCode) return
      onRoomHandler?.(room)
    })
    socket.on('reaction', (reaction: ReactionEvent) => {
      onReactionHandler?.(reaction)
    })
  }

  return socket
}

export type ConnState = 'connected' | 'connecting' | 'disconnected'

export function subscribeConnection(handler: (state: ConnState) => void): () => void {
  const s = getSocket()
  const emit = () => {
    if (s.connected) handler('connected')
    else if (s.active) handler('connecting')
    else handler('disconnected')
  }
  const onConnect = () => handler('connected')
  const onDisconnect = () => handler('disconnected')
  const onAttempt = () => handler('connecting')
  s.on('connect', onConnect)
  s.on('disconnect', onDisconnect)
  s.on('reconnect_attempt', onAttempt)
  s.on('reconnect', onConnect)
  emit()
  return () => {
    s.off('connect', onConnect)
    s.off('disconnect', onDisconnect)
    s.off('reconnect_attempt', onAttempt)
    s.off('reconnect', onConnect)
  }
}

export function setRoomHandler(handler: RoomHandler | null) {
  onRoomHandler = handler
  getSocket()
}

export function setReactionHandler(handler: ReactionHandler | null) {
  onReactionHandler = handler
  getSocket()
}

function apiUrl(path: string) {
  return `${API_BASE}${path}`
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init)
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      res.ok
        ? 'Invalid API response / Ogiltigt API-svar'
        : `API error ${res.status}. Check VITE_SOCKET_URL / Railway.`,
    )
  }
}

type OkMaybe = { ok: boolean; error?: string; playerId?: string; room?: PublicRoom }

function ack<T>(event: string, payload: unknown) {
  return new Promise<T>((resolve, reject) => {
    const s = getSocket()
    if (!s.connected) {
      s.connect()
    }
    s.timeout(18_000).emit(event, payload, (err: Error | null, res: T) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

const FATAL_REJOIN = new Set(['NOT_FOUND', 'NO_PLAYER'])

/** Wait out any in-flight rejoin so it cannot race create/join on the server. */
async function settlePendingRejoin() {
  const pending = rejoinInFlight
  if (!pending) return
  try {
    await pending
  } catch {
    /* ignore */
  }
}

export async function ensureSessionBound(
  retries = 5,
): Promise<{ ok: boolean; playerId?: string; room?: PublicRoom; error?: string; code?: string } | null> {
  const session = loadSession()
  if (!session) return null
  if (rejoinInFlight) return rejoinInFlight

  const epochAtStart = sessionEpoch
  const wanted = `${session.code}:${session.playerId}`

  rejoinInFlight = (async () => {
    let last: { ok: boolean; playerId?: string; room?: PublicRoom; error?: string; code?: string } = {
      ok: false,
      error: 'offline',
    }
    for (let i = 0; i < retries; i++) {
      if (sessionEpoch !== epochAtStart) return { ok: false, error: 'session replaced' }
      const current = loadSession()
      if (!current || `${current.code}:${current.playerId}` !== wanted) {
        return { ok: false, error: 'session replaced' }
      }
      try {
        const s = getSocket()
        if (!s.connected) {
          await new Promise<void>((resolve) => {
            if (s.connected) return resolve()
            const done = () => resolve()
            s.once('connect', done)
            setTimeout(() => {
              s.off('connect', done)
              resolve()
            }, 5_000)
          })
        }
        if (!s.connected) {
          last = { ok: false, error: 'offline' }
          await new Promise((r) => setTimeout(r, 700 * (i + 1)))
          continue
        }
        if (sessionEpoch !== epochAtStart) return { ok: false, error: 'session replaced' }
        last = await ack<OkMaybe & { code?: string }>('rejoin', {
          code: current.code,
          playerId: current.playerId,
        })
        if (sessionEpoch !== epochAtStart) return { ok: false, error: 'session replaced' }
        if (last.ok && last.room) {
          activeRoomCode = last.room.code
          return last
        }
        if (last.code && FATAL_REJOIN.has(last.code)) {
          clearSession()
          return last
        }
        // BUSY = this socket is already bound elsewhere; stop retrying.
        if (last.code === 'BUSY') return last
      } catch {
        last = { ok: false, error: 'reconnect failed' }
      }
      await new Promise((r) => setTimeout(r, 700 * (i + 1)))
    }
    return last
  })()

  try {
    return await rejoinInFlight
  } finally {
    rejoinInFlight = null
  }
}

export async function leaveGame() {
  try {
    await ack<OkMaybe>('leave', {})
  } catch {
    /* offline — still clear local session */
  }
  clearSession()
}

export async function createGame(
  name: string,
  language: Lang,
  isPublic: boolean,
  hostPlays: boolean,
) {
  clearSession()
  await settlePendingRejoin()
  const res = await ack<OkMaybe & { playerId: string; room: PublicRoom }>('create', {
    name,
    language,
    isPublic,
    hostPlays,
  })
  if (res.ok && res.room && res.playerId) {
    activeRoomCode = res.room.code
    saveSession({ code: res.room.code, playerId: res.playerId, name })
  }
  return res
}

export async function joinGame(code: string, name: string) {
  clearSession()
  await settlePendingRejoin()
  const res = await ack<OkMaybe & { playerId: string; room: PublicRoom }>('join', { code, name })
  if (res.ok && res.room && res.playerId) {
    activeRoomCode = res.room.code
    saveSession({ code: res.room.code, playerId: res.playerId, name })
  }
  return res
}

export async function setHostPlaying(playing: boolean) {
  return ack<OkMaybe>('setHostPlaying', { playing })
}

export async function setLanguage(language: Lang) {
  return ack<OkMaybe>('setLanguage', { language })
}

export async function setPublicLobby(isPublic: boolean) {
  return ack<OkMaybe>('setPublicLobby', { isPublic })
}

export async function setGameOptions(opts: { maxRounds?: number; promptPack?: string }) {
  return ack<OkMaybe>('setGameOptions', opts)
}

export async function startGame() {
  return ack<OkMaybe>('startGame', {})
}

export async function submitDrawing(imageDataUrl: string) {
  return ack<OkMaybe>('submitDrawing', { imageDataUrl })
}

export async function submitSabotage(imageDataUrl: string) {
  return ack<OkMaybe>('submitSabotage', { imageDataUrl })
}

export async function submitGuess(guess: string) {
  return ack<OkMaybe>('submitGuess', { guess })
}

export async function submitVote(targetId: string) {
  return ack<OkMaybe>('submitVote', { targetId })
}

export async function sendReaction(emoji: string) {
  return ack<OkMaybe>('sendReaction', { emoji })
}

export async function rematch() {
  return ack<OkMaybe>('rematch', {})
}

export async function backToLobby() {
  return ack<OkMaybe>('backToLobby', {})
}

export async function fetchHealth() {
  return apiJson<{ ok: boolean; rooms?: number; persist?: { configured: boolean } }>('/api/health')
}

export async function fetchRoomPreview(code: string) {
  const path = `/api/room/${encodeURIComponent(code.trim().toUpperCase())}/preview`
  const res = await fetch(apiUrl(path), { signal: AbortSignal.timeout(8_000) })
  const data = (await res.json().catch(() => ({}))) as import('./types').RoomPreview & {
    error?: string
  }
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`)
  return data
}

const SESSION_KEY = 'kluddkrig-session'

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export function saveSession(session: Session) {
  sessionEpoch += 1
  activeRoomCode = session.code
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  sessionEpoch += 1
  activeRoomCode = null
  localStorage.removeItem(SESSION_KEY)
}
