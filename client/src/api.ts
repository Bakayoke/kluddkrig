import { io, type Socket } from 'socket.io-client'
import type { Lang, PublicRoom, Session } from './types'

const API_BASE = (import.meta.env.VITE_SOCKET_URL || '').replace(/\/$/, '')

let socket: Socket | null = null
let rejoinInFlight: Promise<{
  ok: boolean
  playerId?: string
  room?: PublicRoom
  error?: string
} | null> | null = null
let connectionListenersAttached = false

type RoomHandler = (room: PublicRoom) => void
let onRoomHandler: RoomHandler | null = null

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE || undefined, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 20_000,
    })
  }

  if (!connectionListenersAttached) {
    connectionListenersAttached = true
    socket.on('connect', () => {
      void ensureSessionBound()
    })
    socket.on('room', (room: PublicRoom) => {
      onRoomHandler?.(room)
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

export async function ensureSessionBound(
  retries = 4,
): Promise<{ ok: boolean; playerId?: string; room?: PublicRoom; error?: string } | null> {
  const session = loadSession()
  if (!session) return null
  if (rejoinInFlight) return rejoinInFlight

  rejoinInFlight = (async () => {
    let last: { ok: boolean; playerId?: string; room?: PublicRoom; error?: string } = {
      ok: false,
      error: 'rejoin failed',
    }
    for (let i = 0; i < retries; i++) {
      last = await rejoinGame(session.code, session.playerId)
      if (last.ok && last.room) return last
      const err = last.error ?? ''
      if (err.includes('finns inte') || err.includes('hittades inte') || err.includes('not found')) {
        break
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

async function ack<T>(event: string, payload?: unknown): Promise<T> {
  const s = getSocket()
  if (!s.connected) {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('Could not reach server / Kunde inte ansluta till servern')),
        12_000,
      )
      s.once('connect', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }

  if (event !== 'create' && event !== 'join' && event !== 'rejoin') {
    await ensureSessionBound(2)
  }

  const session = loadSession()
  const raw =
    payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>) } : {}
  const isIdentityEvent = event === 'create' || event === 'join' || event === 'rejoin'
  const body = isIdentityEvent
    ? raw
    : {
        ...raw,
        playerId: raw.playerId ?? session?.playerId,
        roomCode: raw.roomCode ?? session?.code,
      }

  return new Promise((resolve, reject) => {
    s.timeout(12000).emit(event, body, (err: Error | null, res: T) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

type OkRoom = { ok: true; playerId: string; room: PublicRoom }
type Err = { ok: false; error: string; code?: string }
type OkMaybe = { ok: boolean; error?: string }

export async function createGame(name: string, language: Lang, isPublic = false, hostPlays = true) {
  return ack<OkRoom | Err>('create', { name, language, isPublic, hostPlays })
}

export async function joinGame(code: string, name: string) {
  return ack<OkRoom | Err>('join', { code, name })
}

export async function rejoinGame(code: string, playerId: string) {
  return ack<OkRoom | Err>('rejoin', { code, playerId })
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

export async function setGameOptions(opts: {
  maxRounds?: number
  fightSeconds?: number
  doodleSeconds?: number
}) {
  return ack<OkMaybe>('setGameOptions', opts)
}

export async function startGame() {
  return ack<OkMaybe>('startGame', {})
}

export async function submitDoodle(imageDataUrl: string) {
  return ack<OkMaybe>('submitDoodle', { imageDataUrl })
}

export async function sendInput(input: {
  move?: -1 | 0 | 1
  jump?: boolean
  jumpRelease?: boolean
  punch?: boolean
  ability?: boolean
}) {
  const s = getSocket()
  if (!s.connected) return
  // Fire-and-forget — waiting for ack adds perceived lag on every stick nudge
  s.emit('input', input)
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
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
