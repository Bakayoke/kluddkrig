import { useEffect, useRef } from 'react'
import type { FightSnapshot, PublicPlayer } from './types'

type Props = {
  fight: FightSnapshot
  players: PublicPlayer[]
  wide?: boolean
}

export function ArenaView({ fight, players, wide }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const avatars = useRef<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    for (const p of players) {
      if (!p.avatarDataUrl) continue
      if (avatars.current.has(p.id)) continue
      const img = new Image()
      img.src = p.avatarDataUrl
      avatars.current.set(p.id, img)
    }
  }, [players])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#5ce1e6')
    grad.addColorStop(0.55, '#ffe566')
    grad.addColorStop(1, '#ff6b9d')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Ground
    ctx.fillStyle = '#1a0f2e'
    ctx.fillRect(0, h - 48, w, 48)

    // Arena flavour
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    if (fight.arenaId === 'platforms') {
      ctx.fillRect(120, 220, 160, 16)
      ctx.fillRect(520, 220, 160, 16)
      ctx.fillRect(300, 160, 200, 16)
    } else if (fight.arenaId === 'pit') {
      ctx.fillRect(0, h - 48, 200, 48)
      ctx.fillRect(w - 200, h - 48, 200, 48)
      ctx.fillStyle = '#3d1f5c'
      ctx.fillRect(220, h - 48, w - 440, 48)
    } else {
      ctx.fillRect(80, 250, w - 160, 18)
    }

    // Crates
    for (const c of fight.crates) {
      ctx.fillStyle = '#ffe566'
      ctx.fillRect(c.x - 14, c.y - 14, 28, 28)
      ctx.strokeStyle = '#1a0f2e'
      ctx.lineWidth = 3
      ctx.strokeRect(c.x - 14, c.y - 14, 28, 28)
    }

    // Fighters
    for (const f of fight.fighters) {
      const player = players.find((p) => p.id === f.playerId)
      const size = f.giantUntil > Date.now() ? 72 : 48
      const img = avatars.current.get(f.playerId)
      ctx.save()
      if (f.frozenUntil > Date.now()) ctx.globalAlpha = 0.55
      if (img?.complete) {
        ctx.drawImage(img, f.x - size / 2, f.y - size, size, size)
      } else {
        ctx.fillStyle = '#7c5cff'
        ctx.beginPath()
        ctx.arc(f.x, f.y - size / 2, size / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      // HP bar
      ctx.fillStyle = '#1a0f2e'
      ctx.fillRect(f.x - 24, f.y - size - 12, 48, 6)
      ctx.fillStyle = '#5ce1e6'
      ctx.fillRect(f.x - 24, f.y - size - 12, 48 * (f.hp / 100), 6)
      // Name
      ctx.fillStyle = '#1a0f2e'
      ctx.font = '600 12px Nunito, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(player?.name ?? '?', f.x, f.y - size - 16)
      ctx.restore()
    }
  }, [fight, players])

  return (
    <canvas
      ref={canvasRef}
      className={`arena-canvas${wide ? ' wide' : ''}`}
      width={800}
      height={400}
      aria-label="Arena"
    />
  )
}
