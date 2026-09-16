import { useEffect, useRef } from 'react'
import { ARENAS, ARENA_H, ARENA_W, GROUND_TOP } from './arena'
import { punchNearWhiteTransparent } from './punchWhite'
import type { FightSnapshot, PublicPlayer } from './types'

type Props = {
  fight: FightSnapshot
  players: PublicPlayer[]
  wide?: boolean
  shake?: boolean
}

export function ArenaView({ fight, players, wide, shake }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const avatars = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const avatarSrc = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    for (const p of players) {
      if (!p.avatarDataUrl) continue
      if (avatarSrc.current.get(p.id) === p.avatarDataUrl && avatars.current.has(p.id)) continue
      avatarSrc.current.set(p.id, p.avatarDataUrl)
      const img = new Image()
      img.onload = () => {
        avatars.current.set(p.id, punchNearWhiteTransparent(img))
      }
      img.src = p.avatarDataUrl
    }
  }, [players])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Prefer server platforms; fall back to local layout if API is behind
    const fallback = ARENAS[fight.arenaId]
    const platforms =
      fight.platforms && fight.platforms.length > 0 ? fight.platforms : fallback.platforms
    const pits = fight.pits && fight.pits.length > 0 ? fight.pits : fallback.pits
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

    for (const pit of pits) {
      ctx.fillStyle = '#12081f'
      ctx.fillRect(pit.x, GROUND_TOP - 8, pit.w, h - GROUND_TOP + 8)
      ctx.fillStyle = 'rgba(255,107,157,0.35)'
      ctx.fillRect(pit.x, GROUND_TOP - 4, pit.w, 6)
    }

    for (const p of platforms) {
      const isGround = p.y >= GROUND_TOP - 1
      ctx.fillStyle = isGround ? '#1a0f2e' : '#7c5cff'
      ctx.fillRect(p.x, p.y, p.w, p.h)
      if (!isGround) {
        ctx.fillStyle = '#ffe566'
        ctx.fillRect(p.x, p.y, p.w, 4)
      }
    }

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

    const hazards = fight.hazards ?? []
    for (const hz of hazards) {
      const warning = hz.warnUntil > now
      const pulse = warning ? 0.35 + 0.35 * Math.sin(now / 80) : 1
      ctx.save()
      ctx.globalAlpha = pulse
      if (hz.kind === 'meteor') {
        const y = warning ? 36 : hz.y
        ctx.fillStyle = warning ? '#ff6b9d' : '#ff3d6e'
        ctx.beginPath()
        ctx.arc(hz.x, y, hz.size, 0, Math.PI * 2)
        ctx.fill()
        if (warning) {
          ctx.strokeStyle = 'rgba(255,107,157,0.9)'
          ctx.lineWidth = 3
          ctx.setLineDash([6, 6])
          ctx.beginPath()
          ctx.moveTo(hz.x, 10)
          ctx.lineTo(hz.x, GROUND_TOP)
          ctx.stroke()
          ctx.setLineDash([])
        } else {
          ctx.fillStyle = '#ffe566'
          ctx.beginPath()
          ctx.moveTo(hz.x - 8, hz.y - hz.size - 10)
          ctx.lineTo(hz.x, hz.y - hz.size)
          ctx.lineTo(hz.x + 8, hz.y - hz.size - 10)
          ctx.fill()
        }
      } else if (hz.kind === 'spike') {
        ctx.fillStyle = warning ? 'rgba(255,107,157,0.55)' : '#ff6b9d'
        const tip = hz.y
        const base = tip - (warning ? 18 : 28)
        ctx.beginPath()
        ctx.moveTo(hz.x - hz.size, tip)
        ctx.lineTo(hz.x, base)
        ctx.lineTo(hz.x + hz.size, tip)
        ctx.closePath()
        ctx.fill()
      } else if (hz.kind === 'beam') {
        ctx.fillStyle = warning ? 'rgba(92,225,230,0.35)' : 'rgba(92,225,230,0.75)'
        ctx.fillRect(hz.x - hz.size, 0, hz.size * 2, h)
        if (!warning) {
          ctx.fillStyle = '#fff6e8'
          ctx.fillRect(hz.x - 3, 0, 6, h)
        }
      }
      ctx.restore()
    }

    if (fight.chaos && fight.chaos.endsAt > now) {
      ctx.save()
      ctx.globalAlpha = 0.18
      if (fight.chaos.kind === 'wind') {
        ctx.fillStyle = '#5ce1e6'
        for (let i = 0; i < 6; i++) {
          const y = 40 + i * 55
          const drift = ((fight.tick * 4 * fight.chaos.dir) % 80) + i * 12
          ctx.fillRect((drift + w) % w, y, 40, 4)
        }
      } else if (fight.chaos.kind === 'lowgrav') {
        ctx.fillStyle = '#7c5cff'
        ctx.fillRect(0, 0, w, h)
      } else if (fight.chaos.kind === 'quake') {
        ctx.fillStyle = '#ff6b9d'
        ctx.fillRect(0, 0, w, h)
      }
      ctx.restore()
    }

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
      if (img) {
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
      const combo = f.combo ?? 0
      if (combo >= 2 && (f.comboUntil ?? 0) > now) {
        ctx.fillStyle = '#ffe566'
        ctx.strokeStyle = '#1a0f2e'
        ctx.lineWidth = 3
        ctx.font = '800 16px Fredoka, sans-serif'
        const label = `x${combo}`
        ctx.strokeText(label, f.x + size * 0.35, f.y - size - 28)
        ctx.fillText(label, f.x + size * 0.35, f.y - size - 28)
      }
      ctx.restore()
    }

    if (fight.suddenDeath) {
      ctx.save()
      const pulse = 0.12 + 0.08 * Math.sin(now / 120)
      ctx.fillStyle = `rgba(255, 60, 80, ${pulse})`
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(255, 107, 157, 0.7)'
      ctx.lineWidth = 6
      ctx.strokeRect(4, 4, w - 8, h - 8)
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
