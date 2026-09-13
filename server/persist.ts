import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import type { Room } from './types.js'

export type PersistedSnapshot = {
  version: 1
  savedAt: number
  rooms: Room[]
}

type Backend = {
  name: string
  load(): Promise<PersistedSnapshot | null>
  save(snapshot: PersistedSnapshot): Promise<void>
}

let backend: Backend | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pending: PersistedSnapshot | null = null
let ready = false
let lastSaveAt = 0
let lastError: string | null = null

function emptySnapshot(): PersistedSnapshot {
  return { version: 1, savedAt: Date.now(), rooms: [] }
}

function fileBackend(dir: string): Backend {
  const file = path.join(dir, 'kluddkrig-state.json')
  return {
    name: `file:${file}`,
    async load() {
      try {
        const raw = await readFile(file, 'utf8')
        return JSON.parse(raw) as PersistedSnapshot
      } catch {
        return null
      }
    },
    async save(snapshot) {
      await mkdir(dir, { recursive: true })
      await writeFile(file, JSON.stringify(snapshot), 'utf8')
    },
  }
}

async function redisBackend(url: string): Promise<Backend> {
  const { createClient } = await import('redis')
  const client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
    },
  })
  client.on('error', (err) => {
    lastError = err instanceof Error ? err.message : 'redis error'
    console.error('Redis error', err)
  })
  await client.connect()
  const key = 'kluddkrig:state'
  return {
    name: 'redis',
    async load() {
      const raw = await client.get(key)
      if (!raw) return null
      return JSON.parse(raw) as PersistedSnapshot
    },
    async save(snapshot) {
      await client.set(key, JSON.stringify(snapshot), { EX: 60 * 60 * 48 })
    },
  }
}

async function dirExists(dir: string) {
  try {
    await access(dir)
    return true
  } catch {
    return false
  }
}

function resolveRedisUrl(): string | null {
  const direct =
    process.env.REDIS_URL?.trim() ||
    process.env.REDIS_PRIVATE_URL?.trim() ||
    process.env.REDIS_PUBLIC_URL?.trim() ||
    process.env.REDISCONNECTIONSTRING?.trim()
  if (direct) return direct

  const host = process.env.REDISHOST?.trim() || process.env.REDIS_HOST?.trim()
  const port = process.env.REDISPORT?.trim() || process.env.REDIS_PORT?.trim() || '6379'
  const user = process.env.REDISUSER?.trim() || process.env.REDIS_USER?.trim() || 'default'
  const password = process.env.REDISPASSWORD?.trim() || process.env.REDIS_PASSWORD?.trim()
  if (host && password) {
    return `redis://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`
  }
  if (host) {
    return `redis://${host}:${port}`
  }
  return null
}

export async function initPersist(): Promise<{ backend: string | null }> {
  const redisUrl = resolveRedisUrl()
  const dataDir =
    process.env.KLUDDKRIG_DATA_DIR?.trim() || ((await dirExists('/data')) ? '/data' : '')

  try {
    if (redisUrl) {
      backend = await redisBackend(redisUrl)
      lastError = null
      console.log('Persist: connected to Redis')
    } else if (dataDir) {
      backend = fileBackend(dataDir)
      lastError = null
      console.log(`Persist: using file backend at ${dataDir}`)
    } else {
      backend = null
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'persist init failed'
    console.error('Persist init failed', err)
    backend = null
  }

  ready = true
  return { backend: backend?.name ?? null }
}

export async function loadSnapshot(): Promise<PersistedSnapshot | null> {
  if (!backend) return null
  try {
    const snap = await backend.load()
    if (!snap || snap.version !== 1) return null
    return snap
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'load failed'
    return null
  }
}

export function buildSnapshot(roomList: Iterable<Room>): PersistedSnapshot {
  const now = Date.now()
  const keepMs = 12 * 60 * 60 * 1000
  return {
    version: 1,
    savedAt: now,
    rooms: [...roomList]
      .map((r) => ({
        ...r,
        players: r.players.map((p) => ({ ...p, connected: false })),
      }))
      .filter((room) => now - (room.updatedAt || 0) < keepMs),
  }
}

export function scheduleSave(snapshot: PersistedSnapshot) {
  if (!backend || !ready) return
  pending = snapshot
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    const toWrite = pending
    pending = null
    if (!toWrite || !backend) return
    void backend
      .save({ ...toWrite, savedAt: Date.now() })
      .then(() => {
        lastSaveAt = Date.now()
        lastError = null
      })
      .catch((err) => {
        lastError = err instanceof Error ? err.message : 'save failed'
        console.error('Persist save failed', err)
      })
  }, 400)
}

export async function flushPersist() {
  if (!backend) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const toWrite = pending
  pending = null
  if (!toWrite) return
  await backend.save({ ...toWrite, savedAt: Date.now() })
  lastSaveAt = Date.now()
}

export function persistDiagnostics() {
  return {
    configured: Boolean(backend),
    backend: backend?.name ?? null,
    ready,
    lastSaveAt: lastSaveAt || null,
    lastError,
    hint: backend
      ? null
      : 'Sätt REDIS_URL (Railway Redis-plugin) eller KLUDDKRIG_DATA_DIR=/data med volume — annars försvinner rum vid restart.',
  }
}

export { emptySnapshot }
