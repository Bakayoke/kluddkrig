import { useEffect, useRef } from 'react'
import { ARENAS, ARENA_H, ARENA_W, GROUND_TOP } from './arena'
import type { FightSnapshot, PublicPlayer } from './types'

type Props = {
  fight: FightSnapshot
  players: PublicPlayer[]
  wide?: boolean
  shake?: boolean
}

export function ArenaView({ fight, players, wide, shake }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const avatars = useRef<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    for (const p of players) {
      if (!p.avatarDataUrl) continue
      const existing = avatars.current.get(p.id)
      if (existing?.src === p.avatarDataUrl) continue
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
    const layout = ARENAS[fight.arenaId]
    const now = Date.now()
    const w = ARENA_W
    const h = ARENA_H

    ctx.save()
    if (shake && fight.shakeUntil > now) {
      const mag = 5
      ctx.translate((Math.random() - 0.5) * mag * 2, (Math.random() - 0.5) * mag * 2)
    }

    ctx.clearRect(-10, -10, w + 20, h + 20)

    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#5ce1e6')
    grad.addColorStop(0.5, '#ffe566')
    grad.addColorStop(1, '#ff6b9d')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Pits
    for (const pit of layout.pits) {
      ctx.fillStyle = '#12081f'
      ctx.fillRect(pit.x, GROUND_TOP - 8, pit.w, h - GROUND_TOP + 8)
      ctx.fillStyle = 'rgba(255,107,157,0.35)'
      ctx.fillRect(pit.x, GROUND_TOP - 4, pit.w, 6)
    }

    // Platforms
    for (const p of layout.platforms) {
      const isGround = p.y >= GROUND_TOP - 1
      ctx.fillStyle = isGround ? '#1a0f2e' : '#7c5cff'
      ctx.fillRect(p.x, p.y, p.w, p.h)
      if (!isGround) {
        ctx.fillStyle = '#ffe566'
        ctx.fillRect(p.x, p.y, p.w, 4)
      }
    }

    // Crates
    for (const c of fight.crates) {
      const bob = Math.sin(fight.tick / 8 + c.x) * 3
      ctx.fillStyle = '#ffe566'
      ctx.fillRect(c.x - 14, c.y - 14 + bob, 28, 28)
      ctx.strokeStyle = '#1a0f2e'
      ctx.lineWidth = 3
      ctx.strokeRect(c.x - 14, c.y - 14 + bob, 28, 28)
      ctx.fillStyle = '#1a0f2e'
      ctx.font = '700 14px Fredoka, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('?', c.x, c.y + 5 + bob)
    }

    // Fighters
    for (const f of fight.fighters) {
      const player = players.find((p) => p.id === f.playerId)
      const size = f.giantUntil > now ? 72 : 48
      const img = avatars.current.get(f.playerId)
      ctx.save()
      if (f.frozenUntil > now) ctx.globalAlpha = 0.55
      if (f.blindUntil > now) {
        ctx.fillStyle = 'rgba(26,15,46,0.45)'
        ctx.beginPath()
        ctx.arc(f.x, f.y - size / 2, size * 0.7, 0, Math.PI * 2)
        ctx.fill()
      }
      if (f.hitFlashUntil > now) {
        ctx.shadowColor = '#ff6b9d'
        ctx.shadowBlur = 18
      }
      if (img?.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, f.x - size / 2, f.y - size, size, size)
      } else {
        ctx.fillStyle = '#7c5cff'
        ctx.beginPath()
        ctx.arc(f.x, f.y - size / 2, size / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.shadowBlur = 0
      ctx.fillStyle = '#1a0f2e'
      ctx.fillRect(f.x - 24, f.y - size - 12, 48, 6)
      ctx.fillStyle = f.hp > 35 ? '#5ce1e6' : '#ff6b9d'
      ctx.fillRect(f.x - 24, f.y - size - 12, 48 * (f.hp / 100), 6)
      ctx.fillStyle = '#1a0f2e'
      ctx.font = '700 13px Nunito, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(player?.name ?? '?', f.x, f.y - size - 16)
      ctx.restore()
    }

    ctx.restore()
  }, [fight, players, shake])

  return (
    <canvas
      ref={canvasRef}
      className={`arena-canvas${wide ? ' wide' : ''}${shake ? ' shaking' : ''}`}
      width={ARENA_W}
      height={ARENA_H}
      aria-label="Arena"
    />
  )
}
