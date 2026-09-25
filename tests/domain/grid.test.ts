import { describe, it, expect } from 'vitest'
import {
  CELLS_PER_FLOOR, FLOOR_COUNT, spanEnd, overlaps, touches, withinFloor, isFloor, floorLabel,
} from '../../src/domain/grid'

describe('grid', () => {
  it('a floor is 26 cells and a vault is 25 floors', () => {
    expect(CELLS_PER_FLOOR).toBe(26)
    expect(FLOOR_COUNT).toBe(25)
  })

  it('a floor holds eight rooms plus two elevators exactly', () => {
    expect(8 * 3 + 2 * 1).toBe(CELLS_PER_FLOOR)
  })

  it('spanEnd is exclusive', () => {
    expect(spanEnd({ x: 7, w: 9 })).toBe(16)
  })

  it('overlapping spans share at least one cell', () => {
    expect(overlaps({ x: 0, w: 6 }, { x: 5, w: 3 })).toBe(true)
    expect(overlaps({ x: 0, w: 6 }, { x: 6, w: 3 })).toBe(false)
  })

  it('touching spans are adjacent but do not overlap', () => {
    expect(touches({ x: 0, w: 6 }, { x: 6, w: 1 })).toBe(true)
    expect(touches({ x: 6, w: 1 }, { x: 0, w: 6 })).toBe(true)
    expect(touches({ x: 0, w: 6 }, { x: 7, w: 3 })).toBe(false)
    expect(touches({ x: 0, w: 6 }, { x: 5, w: 3 })).toBe(false)
  })

  it('a span must fit inside the floor', () => {
    expect(withinFloor({ x: 17, w: 9 })).toBe(true)
    expect(withinFloor({ x: 18, w: 9 })).toBe(false)
    expect(withinFloor({ x: -1, w: 3 })).toBe(false)
    expect(withinFloor({ x: 0, w: 0 })).toBe(false)
  })

  it('floors are 0 to 24', () => {
    expect(isFloor(0)).toBe(true)
    expect(isFloor(24)).toBe(true)
    expect(isFloor(25)).toBe(false)
    expect(isFloor(-1)).toBe(false)
  })

  it('labels a floor one past its model index, for people, not the model', () => {
    expect(floorLabel(0)).toBe('1')
    expect(floorLabel(24)).toBe('25')
  })
})
