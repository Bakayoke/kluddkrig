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

/** Platform tops are reachable in 1–2 jumps from ground. */
export const ARENAS: Record<ArenaId, ArenaLayout> = {
  platforms: {
    id: 'platforms',
    platforms: [
      ground(0, ARENA_W),
      { x: 70, y: 275, w: 180, h: 18 },
      { x: 550, y: 275, w: 180, h: 18 },
      { x: 260, y: 200, w: 280, h: 18 },
      { x: 40, y: 130, w: 140, h: 18 },
      { x: 620, y: 130, w: 140, h: 18 },
    ],
    pits: [],
    spawns: [
      { x: 100, y: GROUND_TOP },
      { x: 700, y: GROUND_TOP },
      { x: 160, y: 275 },
      { x: 640, y: 275 },
      { x: 400, y: 200 },
      { x: 110, y: 130 },
      { x: 690, y: 130 },
      { x: 400, y: GROUND_TOP },
    ],
    crateSpots: [
      { x: 160, y: 275 },
      { x: 640, y: 275 },
      { x: 400, y: 200 },
      { x: 110, y: 130 },
      { x: 690, y: 130 },
      { x: 400, y: GROUND_TOP },
    ],
  },
  pit: {
    id: 'pit',
    platforms: [
      ground(0, 220),
      ground(580, 220),
      { x: 50, y: 250, w: 160, h: 18 },
      { x: 590, y: 250, w: 160, h: 18 },
      { x: 280, y: 175, w: 240, h: 18 },
      { x: 240, y: 105, w: 120, h: 18 },
      { x: 440, y: 105, w: 120, h: 18 },
    ],
    pits: [{ x: 220, w: 360 }],
    spawns: [
      { x: 80, y: GROUND_TOP },
      { x: 720, y: GROUND_TOP },
      { x: 130, y: 250 },
      { x: 670, y: 250 },
      { x: 400, y: 175 },
      { x: 300, y: 105 },
      { x: 500, y: 105 },
    ],
    crateSpots: [
      { x: 130, y: 250 },
      { x: 670, y: 250 },
      { x: 400, y: 175 },
      { x: 300, y: 105 },
      { x: 500, y: 105 },
    ],
  },
  bridge: {
    id: 'bridge',
    platforms: [
      ground(0, ARENA_W),
      { x: 80, y: 285, w: 640, h: 20 },
      { x: 180, y: 210, w: 140, h: 18 },
      { x: 480, y: 210, w: 140, h: 18 },
      { x: 330, y: 140, w: 140, h: 18 },
      { x: 40, y: 170, w: 100, h: 18 },
      { x: 660, y: 170, w: 100, h: 18 },
    ],
    pits: [],
    spawns: [
      { x: 120, y: GROUND_TOP },
      { x: 680, y: GROUND_TOP },
      { x: 200, y: 285 },
      { x: 600, y: 285 },
      { x: 250, y: 210 },
      { x: 550, y: 210 },
      { x: 400, y: 140 },
      { x: 90, y: 170 },
    ],
    crateSpots: [
      { x: 400, y: 285 },
      { x: 250, y: 210 },
      { x: 550, y: 210 },
      { x: 400, y: 140 },
      { x: 90, y: 170 },
      { x: 710, y: 170 },
    ],
  },
}

/** Mario/Sonic-ish: accel run, snappy jump, heavier fall */
export const GRAVITY_UP = 0.95
export const GRAVITY_DOWN = 1.75
export const GRAVITY = GRAVITY_DOWN
export const JUMP_V = -17.8
export const MAX_FALL = 19
export const MAX_RUN = 8.4
export const ACCEL_GROUND = 1.15
export const ACCEL_AIR = 0.7
export const FRICTION_GROUND = 0.78
export const FRICTION_AIR = 0.95
export const COYOTE_MS = 110
export const JUMP_BUFFER_MS = 120
/** Legacy aliases used by older imports */
export const MOVE_GROUND = MAX_RUN
export const MOVE_AIR = MAX_RUN * 0.85

/**
 * One-way platforms: land when falling onto a top; never block from below.
 * (Jump straight through platforms underfoot — Mario-style.)
 */
export function resolveVertical(
  feetX: number,
  feetY: number,
  vy: number,
  layout: ArenaLayout,
  halfW = FIGHTER_W / 2,
): { y: number; vy: number; grounded: boolean } {
  const prevY = feetY - vy
  let y = feetY
  let v = vy
  let grounded = false

  // Only land while falling / resting — ascending passes through
  if (v >= 0) {
    const ordered = [...layout.platforms].sort((a, b) => a.y - b.y)
    for (const p of ordered) {
      const overlappingX = feetX + halfW > p.x + 2 && feetX - halfW < p.x + p.w - 2
      if (overlappingX && prevY <= p.y + 1 && feetY >= p.y) {
        y = p.y
        v = 0
        grounded = true
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
  if (feetY < GROUND_TOP - 2) return false
  return layout.pits.some((pit) => feetX > pit.x + 8 && feetX < pit.x + pit.w - 8)
}
