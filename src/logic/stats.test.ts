import { describe, expect, it } from 'vitest'
import type { Attempt, ExerciseId } from '../types'
import { dailyStats, exerciseStats, memoryAccuracy, streaks } from './stats'

const NOON = new Date('2026-03-10T12:00:00').getTime()
const DAY = 86400000

function at(daysAgo: number, exercise: ExerciseId = 'fillGaps', score = 100, points = 8): Attempt {
  return { uid: `a-${daysAgo}-${exercise}-${score}`, textId: 1, textUid: 't', exercise, difficulty: 1, score, points, createdAt: NOON - daysAgo * DAY }
}

describe('streaks', () => {
  it('считает текущую и лучшую серии', () => {
    const list = [at(0), at(1), at(2), at(5), at(6), at(7), at(8), at(9)]
    expect(streaks(list, NOON)).toEqual({ current: 3, best: 5 })
  })
  it('серия не обрывается, если сегодня ещё не занимались, но вчера занимались', () => {
    expect(streaks([at(1), at(2)], NOON).current).toBe(2)
  })
  it('пропуск дня обнуляет серию', () => {
    expect(streaks([at(2), at(3)], NOON).current).toBe(0)
    expect(streaks([], NOON)).toEqual({ current: 0, best: 0 })
  })
})

describe('dailyStats', () => {
  it('суммирует очки по дням, последний день — сегодня', () => {
    const list = [at(0, 'fillGaps', 100, 8), at(0, 'fullInput', 90, 15), at(2, 'fillGaps', 100, 8)]
    const days = dailyStats(list, NOON, 7)
    expect(days).toHaveLength(7)
    expect(days[6].points).toBe(23)
    expect(days[6].count).toBe(2)
    expect(days[4].points).toBe(8)
    expect(days[5].points).toBe(0)
  })
})

describe('exerciseStats / memoryAccuracy', () => {
  it('средняя точность по упражнениям', () => {
    const list = [at(0, 'fillGaps', 100), at(0, 'fillGaps', 80), at(0, 'fullInput', 60)]
    const s = exerciseStats(list)
    expect(s[0]).toEqual({ exercise: 'fillGaps', count: 2, avgScore: 90 })
  })
  it('точность считается только по группам 2 и 3', () => {
    const list = [at(0, 'revealTap', 100), at(0, 'fillGaps', 80), at(0, 'fullInput', 60)]
    expect(memoryAccuracy(list, NOON - DAY, NOON + DAY)).toBe(70)
    expect(memoryAccuracy(list, NOON + DAY, NOON + 2 * DAY)).toBeNull()
  })
})
