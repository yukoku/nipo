import { describe, expect, it } from 'vitest'

import { wouldCreateManagerCycle } from './manager-hierarchy'

// 部長(1) ─ 課長(2) ─ 主任(3) ─ 担当(4)、別系統の上長(5)
const managerOf = new Map<number, number | null>([
  [1, null],
  [2, 1],
  [3, 2],
  [4, 3],
  [5, null],
])

describe('wouldCreateManagerCycle（U-06）', () => {
  it('自分自身を上長にすると循環になる（T-STF-05）', () => {
    expect(wouldCreateManagerCycle(2, 2, managerOf)).toBe(true)
  })

  it('直属の部下を上長にすると循環になる（T-STF-06）', () => {
    expect(wouldCreateManagerCycle(2, 3, managerOf)).toBe(true)
  })

  it('部下の部下を上長にしても循環になる', () => {
    expect(wouldCreateManagerCycle(1, 4, managerOf)).toBe(true)
  })

  it('自分の上長・上長の上長・別系統の人なら循環しない', () => {
    expect(wouldCreateManagerCycle(3, 1, managerOf)).toBe(false)
    expect(wouldCreateManagerCycle(4, 2, managerOf)).toBe(false)
    expect(wouldCreateManagerCycle(2, 5, managerOf)).toBe(false)
  })

  it('一覧にない人を上長にしても止まる', () => {
    expect(wouldCreateManagerCycle(2, 99, managerOf)).toBe(false)
  })

  it('既存のデータが循環していても止まる', () => {
    const broken = new Map<number, number | null>([
      [10, 11],
      [11, 10],
    ])

    expect(wouldCreateManagerCycle(1, 10, broken)).toBe(false)
  })
})
