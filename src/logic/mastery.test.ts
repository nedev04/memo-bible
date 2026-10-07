import { describe, expect, it } from 'vitest'
import type { VerseState } from '../types'
import { DAY } from './config'
import { applyVerseResult, needsAttention, strengthGroup, xpFor } from './mastery'

const T0 = new Date('2026-03-10T10:00:00').getTime()

function verse(over: Partial<VerseState> = {}): VerseState {
  return {
    key: 'rst:mat:5:7', translation: 'rst', book: 'mat', chapter: 5, verse: 7,
    addedAt: T0, strength: 0, nextReviewAt: T0, updatedAt: T0,
    lastUpAt: null, lastPracticedAt: null, lastScore: null, lapses: 0,
    ...over,
  }
}

describe('рост силы', () => {
  it('новый стих получает силу 1 после первого зачёта и повтор назначается на завтра', () => {
    const r = applyVerseResult(verse(), { tier: 1, score: 100 }, T0)
    expect(r.change).toBe('up')
    expect(r.verse.strength).toBe(1)
    expect(r.verse.nextReviewAt).toBe(T0 + DAY)
    expect(r.verse.lastUpAt).toBe(T0)
  })

  it('за один день сила растёт не больше чем на 1', () => {
    const first = applyVerseResult(verse(), { tier: 3, score: 100 }, T0).verse
    const again = applyVerseResult({ ...first, nextReviewAt: T0 }, { tier: 3, score: 100 }, T0 + 1000)
    expect(again.change).toBe('same')
    expect(again.verse.strength).toBe(1)
  })

  it('лёгкие упражнения не поднимают выше нужной планки', () => {
    const due = verse({ strength: 2, nextReviewAt: T0 })
    expect(applyVerseResult(due, { tier: 1, score: 100 }, T0).change).toBe('same')
    expect(applyVerseResult(due, { tier: 2, score: 100 }, T0).change).toBe('up')
    const strong = verse({ strength: 4, nextReviewAt: T0 })
    expect(applyVerseResult(strong, { tier: 2, score: 100 }, T0).change).toBe('same')
    expect(applyVerseResult(strong, { tier: 3, score: 95 }, T0).verse.strength).toBe(5)
  })

  it('до срока повторения сила не растёт', () => {
    const notDue = verse({ strength: 3, nextReviewAt: T0 + 3 * DAY })
    const r = applyVerseResult(notDue, { tier: 3, score: 100 }, T0)
    expect(r.change).toBe('same')
    expect(r.verse.nextReviewAt).toBe(T0 + 3 * DAY)
  })

  it('максимальная сила: успешное повторение откладывает следующее на 60 дней', () => {
    const r = applyVerseResult(verse({ strength: 6, nextReviewAt: T0 }), { tier: 3, score: 100 }, T0)
    expect(r.verse.strength).toBe(6)
    expect(r.verse.nextReviewAt).toBe(T0 + 60 * DAY)
  })
})

describe('ошибки', () => {
  it('провал на плановом повторении снижает силу и назначает повтор на завтра', () => {
    const r = applyVerseResult(verse({ strength: 4, nextReviewAt: T0 }), { tier: 3, score: 50 }, T0 + 8 * DAY)
    expect(r.change).toBe('down')
    expect(r.verse.strength).toBe(3)
    expect(r.verse.lapses).toBe(1)
    expect(r.verse.nextReviewAt).toBe(T0 + 9 * DAY)
  })

  it('очень плохой результат снижает на 2, но не ниже 1', () => {
    expect(applyVerseResult(verse({ strength: 5, nextReviewAt: T0 }), { tier: 3, score: 10 }, T0).verse.strength).toBe(3)
    expect(applyVerseResult(verse({ strength: 2, nextReviewAt: T0 }), { tier: 3, score: 10 }, T0).verse.strength).toBe(1)
  })

  it('ошибка вне срока силу не меняет, но возвращает стих в очередь не позже чем завтра', () => {
    const r = applyVerseResult(verse({ strength: 4, nextReviewAt: T0 + 7 * DAY }), { tier: 2, score: 40 }, T0)
    expect(r.verse.strength).toBe(4)
    expect(r.verse.nextReviewAt).toBe(T0 + DAY)
    expect(needsAttention(r.verse)).toBe(true)
  })

  it('результат 70–89% на плановом повторении: повтор через половину интервала', () => {
    const r = applyVerseResult(verse({ strength: 3, nextReviewAt: T0 }), { tier: 2, score: 80 }, T0)
    expect(r.verse.strength).toBe(3)
    expect(r.verse.nextReviewAt).toBe(T0 + 3.5 * DAY)
  })

  it('новый стих, который не получился, остаётся к изучению', () => {
    const r = applyVerseResult(verse(), { tier: 1, score: 30 }, T0 + 5000)
    expect(r.verse.strength).toBe(0)
    expect(r.verse.nextReviewAt).toBe(T0 + 5000)
  })
})

describe('прочее', () => {
  it('группы силы', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(strengthGroup))
      .toEqual(['new', 'started', 'started', 'medium', 'medium', 'strong', 'strong'])
  })
  it('опыт зависит от сложности и точности', () => {
    expect(xpFor(1, 100)).toBe(5)
    expect(xpFor(3, 100)).toBe(15)
    expect(xpFor(2, 50)).toBe(5)
    expect(xpFor(3, 0)).toBe(0)
  })
})
