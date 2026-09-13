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

/** Keep in sync with server/arena.ts platform rects. */
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
  },
}
