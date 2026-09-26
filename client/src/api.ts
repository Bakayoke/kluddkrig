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

type OkMaybe = { ok: boolean; error?: string; playerId?: string; room?: PublicRoom }

function ack<T>(event: string, payload: unknown) {
  return new Promise<T>((resolve, reject) => {
    const s = getSocket()
    if (!s.connected) {
      s.connect()
    }
    s.timeout(12_000).emit(event, payload, (err: Error | null, res: T) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
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
      error: 'offline',
    }
    for (let i = 0; i < retries; i++) {
      try {
        const s = getSocket()
        if (!s.connected) {
          await new Promise<void>((resolve) => {
            if (s.connected) return resolve()
            s.once('connect', () => resolve())
            setTimeout(() => resolve(), 3000)
          })
        }
        last = await ack<OkMaybe>('rejoin', { code: session.code, playerId: session.playerId })
        if (last.ok) return last
      } catch {
        last = { ok: false, error: 'reconnect failed' }
      }
      await new Promise((r) => setTimeout(r, 600 * (i + 1)))
    }
    return last
  })()

  try {
    return await rejoinInFlight
  } finally {
    rejoinInFlight = null
  }
}

export async function createGame(
  name: string,
  language: Lang,
  isPublic: boolean,
  hostPlays: boolean,
) {
  return ack<OkMaybe & { playerId: string; room: PublicRoom }>('create', {
    name,
    language,
    isPublic,
    hostPlays,
  })
}

export async function joinGame(code: string, name: string) {
  return ack<OkMaybe & { playerId: string; room: PublicRoom }>('join', { code, name })
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
