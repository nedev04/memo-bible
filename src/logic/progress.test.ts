import { describe, expect, it } from 'vitest'
import type { Attempt, ExerciseId, TextItem } from '../types'
import { DAY } from './config'
import { applyAttempt, calcPoints, createText, recommend } from './progress'

const T0 = new Date('2026-01-01T10:00:00').getTime()

function attempt(exercise: ExerciseId, difficulty: 1 | 2 | 3, score: number, at: number, points = 10): Attempt {
  return { textId: 1, exercise, difficulty, score, points, createdAt: at }
}

describe('calcPoints', () => {
  it('множитель сложности и точности', () => {
    expect(calcPoints('fillGaps', 1, 100, 0)).toBe(8)
    expect(calcPoints('fillGaps', 3, 100, 0)).toBe(16)
    expect(calcPoints('fillGaps', 2, 80, 0)).toBe(6)
    expect(calcPoints('fillGaps', 2, 60, 0)).toBe(0)
  })
  it('повторы в один день', () => {
    expect(calcPoints('fullInput', 1, 100, 1)).toBe(8)
    expect(calcPoints('fullInput', 1, 100, 2)).toBe(0)
  })
})

describe('applyAttempt', () => {
  it('не повышает уровень только упражнениями из группы 1', () => {
    const text: TextItem = { ...createText('t', 'a b', T0), levelPoints: 135 }
    const r = applyAttempt(text, attempt('revealTap', 1, 100, T0, 4), [], T0)
    expect(r.leveledUp).toBe(false)
    expect(r.text.levelPoints).toBe(139)
  })

  it('повышает уровень, когда выполнены все условия', () => {
    const text: TextItem = { ...createText('t', 'a b', T0), levelPoints: 135 }
    const history = [attempt('fillGaps', 1, 95, T0), attempt('fullInput', 1, 90, T0)]
    const r = applyAttempt(text, attempt('revealTap', 1, 100, T0, 5), history, T0)
    expect(r.leveledUp).toBe(true)
    expect(r.text.level).toBe(2)
    expect(r.text.levelPoints).toBe(0)
  })

  it('не повышает дважды за один день', () => {
    const text: TextItem = {
      ...createText('t', 'a b', T0), level: 2, levelPoints: 150,
      lastLevelUpAt: T0, levelChangedAt: T0,
    }
    const history = [attempt('fillGaps', 1, 95, T0 + 1), attempt('fullInput', 1, 95, T0 + 2)]
    const r = applyAttempt(text, attempt('fillGaps', 1, 95, T0 + 3, 0), history, T0 + 3)
    expect(r.leveledUp).toBe(false)
  })

  it('понижает уровень при плохом результате на плановом повторении', () => {
    const text: TextItem = { ...createText('t', 'a b', T0), level: 4, levelPoints: 60, nextReviewAt: T0 }
    const now = T0 + 8 * DAY
    const r = applyAttempt(text, attempt('fullInput', 2, 50, now, 0), [], now)
    expect(r.text.level).toBe(3)
    expect(r.text.levelPoints).toBe(0)
    expect(r.text.nextReviewAt).toBe(now + DAY)
  })

  it('сильно проваленный результат снижает на 2 уровня', () => {
    const text: TextItem = { ...createText('t', 'a b', T0), level: 5, nextReviewAt: T0 }
    const r = applyAttempt(text, attempt('fullInput', 3, 20, T0 + DAY, 0), [], T0 + DAY)
    expect(r.text.level).toBe(3)
  })
})

describe('recommend', () => {
  it('новый текст — знакомство', () => {
    const r = recommend(createText('t', 'a b', T0), [], T0)
    expect(r.difficulty).toBe(1)
    expect(['revealTap', 'partialHidden']).toContain(r.exercise)
  })

  it('на уровне 1 после знакомства сначала запоминание, затем проверка', () => {
    const text = createText('t', 'a b', T0)
    const h1 = [attempt('revealTap', 1, 100, T0 + 1)]
    expect(['firstLetters', 'fillGaps', 'orderBlocks']).toContain(recommend(text, h1, T0 + 2).exercise)
    const h2 = [...h1, attempt('fillGaps', 1, 95, T0 + 3)]
    expect(['fullInput', 'nextLine', 'findError', 'lineEnding']).toContain(recommend(text, h2, T0 + 4).exercise)
  })

  it('когда пора повторять, предлагает проверку из группы 3 на нужной сложности', () => {
    const text: TextItem = { ...createText('t', 'a b', T0), level: 3, nextReviewAt: T0 + DAY }
    const r = recommend(text, [attempt('fillGaps', 1, 95, T0)], T0 + 4 * DAY)
    expect(['fullInput', 'nextLine', 'findError', 'lineEnding']).toContain(r.exercise)
    expect(r.difficulty).toBe(2)
  })

  it('чередует упражнения: давно не делавшееся — первым', () => {
    const text: TextItem = { ...createText('t', 'a b', T0), level: 3, nextReviewAt: T0 }
    const history = [
      attempt('fullInput', 2, 95, T0 + 1),
      attempt('nextLine', 2, 95, T0 + 2),
      attempt('findError', 2, 95, T0 + 3),
    ]
    expect(recommend(text, history, T0 + DAY).exercise).toBe('lineEnding')
  })
})
