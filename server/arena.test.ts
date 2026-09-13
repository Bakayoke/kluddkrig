import assert from 'node:assert/strict'
import { ARENAS, JUMP_V, GRAVITY, resolveVertical } from './arena.ts'

const layout = ARENAS.platforms
const mid = layout.platforms.find((p) => p.y === 275)!

// Fall onto mid platform from above
{
  const prevY = 250
  const vy = 30
  const feetY = prevY + vy
  const r = resolveVertical(160, feetY, vy, layout)
  assert.equal(r.grounded, true)
  assert.equal(r.y, mid.y)
  assert.equal(r.vy, 0)
}

// Jump height clears mid platform (~77px up from ground 352 → 275)
{
  const height = (JUMP_V * JUMP_V) / (2 * GRAVITY)
  assert.ok(height > 352 - 275, `jump height ${height} should clear mid platform`)
}

// Stay grounded when resting
{
  const r = resolveVertical(160, 275, 1.2, layout)
  assert.equal(r.grounded, true)
  assert.equal(r.y, 275)
}

console.log('arena physics ok')
