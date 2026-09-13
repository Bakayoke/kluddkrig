import type { ArenaId } from './types.js'

export const ARENA_W = 800
export const ARENA_H = 400
export const GROUND_TOP = 352
export const FIGHTER_H = 48
export const FIGHTER_W = 36

export type Platform = { x: number; y: number; w: number; h: number }

export type ArenaLayout = {
  id: ArenaId
  platforms: Platform[]
  /** Open pits — falling in respawns */
  pits: { x: number; w: number }[]
  spawns: { x: number; y: number }[]
  crateSpots: { x: number; y: number }[]
}

const ground = (x: number, w: number): Platform => ({
  x,
  y: GROUND_TOP,
  w,
  h: ARENA_H - GROUND_TOP,
})

export const ARENAS: Record<ArenaId, ArenaLayout> = {
  platforms: {
    id: 'platforms',
    platforms: [
      ground(0, ARENA_W),
      { x: 80, y: 260, w: 160, h: 16 },
      { x: 560, y: 260, w: 160, h: 16 },
      { x: 280, y: 180, w: 240, h: 16 },
      { x: 40, y: 120, w: 120, h: 16 },
      { x: 640, y: 120, w: 120, h: 16 },
    ],
    pits: [],
    spawns: [
      { x: 100, y: GROUND_TOP },
      { x: 700, y: GROUND_TOP },
      { x: 160, y: 260 },
      { x: 640, y: 260 },
      { x: 400, y: 180 },
      { x: 100, y: 120 },
      { x: 700, y: 120 },
      { x: 400, y: GROUND_TOP },
    ],
    crateSpots: [
      { x: 160, y: 260 },
      { x: 640, y: 260 },
      { x: 400, y: 180 },
      { x: 100, y: 120 },
      { x: 700, y: 120 },
      { x: 400, y: GROUND_TOP },
    ],
  },
  pit: {
    id: 'pit',
    platforms: [
      ground(0, 220),
      ground(580, 220),
      { x: 60, y: 230, w: 140, h: 16 },
      { x: 600, y: 230, w: 140, h: 16 },
      { x: 300, y: 160, w: 200, h: 16 },
      { x: 250, y: 90, w: 100, h: 16 },
      { x: 450, y: 90, w: 100, h: 16 },
    ],
    pits: [{ x: 220, w: 360 }],
    spawns: [
      { x: 80, y: GROUND_TOP },
      { x: 720, y: GROUND_TOP },
      { x: 130, y: 230 },
      { x: 670, y: 230 },
      { x: 400, y: 160 },
      { x: 300, y: 90 },
      { x: 500, y: 90 },
    ],
    crateSpots: [
      { x: 130, y: 230 },
      { x: 670, y: 230 },
      { x: 400, y: 160 },
      { x: 300, y: 90 },
      { x: 500, y: 90 },
    ],
  },
  bridge: {
    id: 'bridge',
    platforms: [
      ground(0, ARENA_W),
      { x: 100, y: 280, w: 600, h: 18 },
      { x: 200, y: 200, w: 120, h: 16 },
      { x: 480, y: 200, w: 120, h: 16 },
      { x: 340, y: 130, w: 120, h: 16 },
      { x: 50, y: 160, w: 90, h: 16 },
      { x: 660, y: 160, w: 90, h: 16 },
    ],
    pits: [],
    spawns: [
      { x: 120, y: GROUND_TOP },
      { x: 680, y: GROUND_TOP },
      { x: 200, y: 280 },
      { x: 600, y: 280 },
      { x: 260, y: 200 },
      { x: 540, y: 200 },
      { x: 400, y: 130 },
      { x: 95, y: 160 },
    ],
    crateSpots: [
      { x: 400, y: 280 },
      { x: 260, y: 200 },
      { x: 540, y: 200 },
      { x: 400, y: 130 },
      { x: 95, y: 160 },
      { x: 705, y: 160 },
    ],
  },
}

export const GRAVITY = 1.35
export const JUMP_V = -15.5
export const MAX_FALL = 20
export const MOVE_GROUND = 6.2
export const MOVE_AIR = 4.2
export const FRICTION_GROUND = 0.72
export const FRICTION_AIR = 0.94

/** Resolve vertical landing on platforms. `feetY` is fighter feet. */
export function resolveVertical(
  feetX: number,
  feetY: number,
  vy: number,
  layout: ArenaLayout,
  halfW = FIGHTER_W / 2,
): { y: number; vy: number; grounded: boolean } {
  let y = feetY
  let v = vy
  let grounded = false

  if (v >= 0) {
    for (const p of layout.platforms) {
      const wasAbove = feetY - v <= p.y + 0.5
      const overlappingX = feetX + halfW > p.x && feetX - halfW < p.x + p.w
      if (wasAbove && overlappingX && y >= p.y && feetY - v <= p.y + 12) {
        y = p.y
        v = 0
        grounded = true
        break
      }
    }
  }

  // Ceiling bump (simple)
  if (v < 0) {
    for (const p of layout.platforms) {
      const top = p.y + p.h
      const overlappingX = feetX + halfW > p.x && feetX - halfW < p.x + p.w
      const head = y - FIGHTER_H
      if (overlappingX && head < top && head > p.y && feetY - FIGHTER_H - v >= top) {
        y = top + FIGHTER_H
        v = 0
        break
      }
    }
  }

  return { y, vy: v, grounded }
}

export function clampX(x: number, halfW = FIGHTER_W / 2) {
  return Math.max(halfW + 4, Math.min(ARENA_W - halfW - 4, x))
}

export function inPit(feetX: number, feetY: number, layout: ArenaLayout) {
  if (feetY < GROUND_TOP - 4) return false
  return layout.pits.some((pit) => feetX > pit.x && feetX < pit.x + pit.w)
}
