import type { ArenaId } from './types'

export const ARENA_W = 800
export const ARENA_H = 400
export const GROUND_TOP = 352

export type Platform = { x: number; y: number; w: number; h: number }

export type ArenaLayout = {
  id: ArenaId
  platforms: Platform[]
  pits: { x: number; w: number }[]
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
  },
}
