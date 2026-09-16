import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import cors from 'cors'
import {
  allRooms,
  backToLobby,
  createRoom,
  disconnectSocket,
  getBinding,
  getRoom,
  hydrateRooms,
  joinRoom,
  listPublicLobbies,
  onPhaseTimeout,
  playerInput,
  pruneIdleRooms,
  reconnectSocket,
  rematch,
  roomsInFight,
  roomsNeedingTick,
  setGameOptions,
  setHostPlaying,
  setLanguage,
  setPersistHook,
  setPublicLobby,
  startGame,
  submitDoodle,
  tickFight,
  toPublicRoom,
} from './rooms.js'
import { buildSnapshot, flushPersist, initPersist, loadSnapshot, persistDiagnostics, scheduleSave } from './persist.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3001

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://kluddkrig.linus-stenvi.workers.dev',
  'https://kluddkrig.com',
  'https://www.kluddkrig.com',
]

const corsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const allowedOrigins = [...new Set([...defaultOrigins, ...corsOrigins])]

const app = express()
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
)

app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'kluddkrig',
    version: '2026-09-16-combo',
    rooms: allRooms().size,
    persist: persistDiagnostics(),
  })
})

app.get('/api/lobbies', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : req.query.lang === 'sv' ? 'sv' : null
  const lobbies = listPublicLobbies({ language: lang, limit: 24 })
  res.json({ lobbies, onlineRooms: lobbies.length })
})

app.get('/api/room/:code/preview', (req, res) => {
  const room = getRoom(String(req.params.code ?? '').toUpperCase())
  if (!room) {
    res.status(404).json({ error: 'not found' })
    return
  }
  res.json({
    code: room.code,
    status: room.status,
    language: room.language,
    playerCount: room.players.length,
    hostName: room.players.find((p) => p.id === room.hostId)?.name ?? '?',
    isPublic: room.isPublic,
  })
})

const clientDist = path.join(__dirname, '../client/dist')
app.use(express.static(clientDist))
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next()
  })
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 20_000,
  pingTimeout: 60_000,
  connectTimeout: 30_000,
  maxHttpBufferSize: 1e6,
})

function broadcastRoom(roomCode: string) {
  const room = getRoom(roomCode)
  if (!room) return
  const sockets = io.sockets.adapter.rooms.get(roomCode)
  if (!sockets) return
  for (const socketId of sockets) {
    const binding = getBinding(socketId)
    const socket = io.sockets.sockets.get(socketId)
    if (socket && binding) {
      socket.emit('room', toPublicRoom(room, binding.playerId))
    }
  }
}

io.on('connection', (socket) => {
  socket.on('create', ({ name, hostPlays, language, isPublic }, ack) => {
    try {
      const { room, playerId } = createRoom(
        name,
        socket.id,
        hostPlays !== false,
        language === 'en' ? 'en' : 'sv',
        Boolean(isPublic),
      )
      socket.join(room.code)
      const payload = { ok: true as const, playerId, room: toPublicRoom(room, playerId) }
      ack?.(payload)
      socket.emit('room', payload.room)
    } catch {
      ack?.({ ok: false, error: 'Kunde inte skapa spel' })
    }
  })

  socket.on('join', ({ code, name }, ack) => {
    try {
      const result = joinRoom(String(code ?? ''), String(name ?? ''), socket.id)
      if ('error' in result) {
        ack?.({ ok: false, error: result.error, code: result.code })
        return
      }
      socket.join(result.room.code)
      const payload = {
        ok: true as const,
        playerId: result.playerId,
        room: toPublicRoom(result.room, result.playerId),
      }
      ack?.(payload)
      socket.emit('room', payload.room)
      broadcastRoom(result.room.code)
    } catch {
      ack?.({ ok: false, error: 'Kunde inte gå med' })
    }
  })

  socket.on('rejoin', ({ code, playerId }, ack) => {
    try {
      const result = reconnectSocket(String(code ?? ''), String(playerId ?? ''), socket.id)
      if ('error' in result) {
        ack?.({ ok: false, ...result })
        return
      }
      socket.join(result.code)
      const payload = { ok: true as const, playerId, room: toPublicRoom(result, playerId) }
      ack?.(payload)
      socket.emit('room', payload.room)
      broadcastRoom(result.code)
    } catch {
      ack?.({ ok: false, error: 'Kunde inte återansluta' })
    }
  })

  socket.on('setHostPlaying', ({ playing }, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ ok: false, error: 'Inte ansluten' })
    const result = setHostPlaying(binding.code, binding.playerId, Boolean(playing))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true })
    broadcastRoom(result.code)
  })

  socket.on('setLanguage', ({ language }, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ ok: false, error: 'Inte ansluten' })
    const result = setLanguage(binding.code, binding.playerId, language === 'en' ? 'en' : 'sv')
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true })
    broadcastRoom(result.code)
  })

  socket.on('setPublicLobby', ({ isPublic }, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ ok: false, error: 'Inte ansluten' })
    const result = setPublicLobby(binding.code, binding.playerId, Boolean(isPublic))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true })
    broadcastRoom(result.code)
  })

  socket.on('setGameOptions', (opts, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ ok: false, error: 'Inte ansluten' })
    const result = setGameOptions(binding.code, binding.playerId, opts ?? {})
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true })
    broadcastRoom(result.code)
  })

  socket.on('startGame', (_data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ ok: false, error: 'Inte ansluten' })
    const result = startGame(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true })
    broadcastRoom(result.code)
  })

  socket.on('submitDoodle', ({ imageDataUrl }, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ ok: false, error: 'Inte ansluten' })
    const result = submitDoodle(binding.code, binding.playerId, String(imageDataUrl ?? ''))
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true })
    broadcastRoom(result.code)
  })

  socket.on('input', (payload, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ ok: false, error: 'Inte ansluten' })
    const input: {
      move?: -1 | 0 | 1
      jump?: boolean
      jumpRelease?: boolean
      punch?: boolean
      ability?: boolean
    } = {}
    if (payload?.move === -1 || payload?.move === 0 || payload?.move === 1) {
      input.move = payload.move
    }
    if (payload?.jump) input.jump = true
    if (payload?.jumpRelease) input.jumpRelease = true
    if (payload?.punch) input.punch = true
    if (payload?.ability) input.ability = true
    const result = playerInput(binding.code, binding.playerId, input)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true })
    // Actions + stick changes broadcast immediately for snappier TV feel
    if (result.broadcast) broadcastRoom(result.room.code)
  })

  socket.on('rematch', (_data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ ok: false, error: 'Inte ansluten' })
    const result = rematch(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true })
    broadcastRoom(result.code)
  })

  socket.on('backToLobby', (_data, ack) => {
    const binding = getBinding(socket.id)
    if (!binding) return ack?.({ ok: false, error: 'Inte ansluten' })
    const result = backToLobby(binding.code, binding.playerId)
    if ('error' in result) return ack?.({ ok: false, error: result.error })
    ack?.({ ok: true })
    broadcastRoom(result.code)
  })

  socket.on('disconnect', () => {
    const room = disconnectSocket(socket.id)
    if (room) broadcastRoom(room.code)
  })
})

// Phase timeouts
setInterval(() => {
  for (const room of roomsNeedingTick()) {
    onPhaseTimeout(room)
    broadcastRoom(room.code)
  }
}, 250)

// Fight tick ~45 Hz
setInterval(() => {
  for (const room of roomsInFight()) {
    tickFight(room)
    broadcastRoom(room.code)
  }
}, 22)

setInterval(() => {
  pruneIdleRooms()
  scheduleSave(buildSnapshot(allRooms().values()))
}, 30_000)

async function boot() {
  const persist = await initPersist()
  const persistNow = () => scheduleSave(buildSnapshot(allRooms().values()))
  setPersistHook(persistNow)

  const snapshot = await loadSnapshot()
  if (snapshot) {
    hydrateRooms(snapshot.rooms)
    console.log(`Persist restore: ${snapshot.rooms.length} rooms (${persist.backend})`)
  } else if (persist.backend) {
    console.log(`Persist ready (${persist.backend}) — empty state`)
  } else {
    console.log(
      'Persist: memory only. Set REDIS_URL or KLUDDKRIG_DATA_DIR to keep rooms across restarts.',
    )
  }

  process.on('SIGTERM', () => {
    void flushPersist().finally(() => process.exit(0))
  })
  process.on('SIGINT', () => {
    void flushPersist().finally(() => process.exit(0))
  })

  httpServer.listen(PORT, () => {
    const pdiag = persistDiagnostics()
    console.log(`Kluddkrig API on :${PORT}`)
    console.log(`Allowed origins: ${allowedOrigins.join(', ')}`)
    console.log(
      `Persist: ${pdiag.configured ? pdiag.backend : 'memory only'}${pdiag.hint ? ` | ${pdiag.hint}` : ''}`,
    )
  })
}

void boot()
