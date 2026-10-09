import { describe, expect, it } from 'vitest'
import type { VerseState } from '../types'
import { DAY } from './config'
import { applyVerseResult, needsAttention, strengthGroup, xpFor } from './mastery'

const T0 = new Date('2026-03-10T10:00:00').getTime()

function verse(over: Partial<VerseState> = {}): VerseState {
  return {
    key: 'rst:mat:5:7', translation: 'rst', book: 'mat', chapter: 5, verse: 7,
    addedAt: T0, strength: 0, stage: 0, nextReviewAt: T0, updatedAt: T0,
    lastUpAt: null, lastPracticedAt: null, lastScore: null, lapses: 0,
    ...over,
  }
}

describe('сила растёт без привязки к дню', () => {
  it('несколько зачётов подряд поднимают силу, пока упражнения достаточно сложные', () => {
    let v = verse()
    const steps: [1 | 2 | 3, number][] = [[1, 1], [1, 2], [2, 3], [2, 4], [3, 5], [3, 6]]
    for (const [tier, expected] of steps) {
      v = applyVerseResult(v, { tier, score: 100 }, T0).verse
      expect(v.strength).toBe(expected)
    }
  })

  it('лёгкие упражнения не поднимают выше нужной планки', () => {
    const tier1 = (strength: number) => applyVerseResult(verse({ strength, stage: 1 }), { tier: 1, score: 100 }, T0)
    expect(tier1(1).change).toBe('up')
    expect(tier1(2).change).toBe('same')
    expect(applyVerseResult(verse({ strength: 2, stage: 1 }), { tier: 2, score: 100 }, T0).change).toBe('up')
    expect(applyVerseResult(verse({ strength: 4, stage: 1 }), { tier: 2, score: 95 }, T0).change).toBe('same')
    expect(applyVerseResult(verse({ strength: 4, stage: 1 }), { tier: 3, score: 95 }, T0).verse.strength).toBe(5)
  })

  it('результат 70–89% силу не меняет', () => {
    const r = applyVerseResult(verse({ strength: 3, stage: 2, nextReviewAt: T0 + 3 * DAY }), { tier: 2, score: 80 }, T0)
    expect(r.change).toBe('same')
    expect(r.verse.strength).toBe(3)
  })

  it('ошибка снижает силу на 1 (ниже 40% — на 2), но не ниже 1', () => {
    const fail = (strength: number, score: number) =>
      applyVerseResult(verse({ strength, stage: 2, nextReviewAt: T0 + 3 * DAY }), { tier: 2, score }, T0).verse.strength
    expect(fail(4, 50)).toBe(3)
    expect(fail(5, 10)).toBe(3)
    expect(fail(2, 10)).toBe(1)
    expect(fail(1, 10)).toBe(1)
  })
})

describe('расписание повторений', () => {
  it('первый зачёт нового стиха ставит его на стадию 1 с повтором через день', () => {
    const r = applyVerseResult(verse(), { tier: 1, score: 100 }, T0)
    expect(r.verse.stage).toBe(1)
    expect(r.verse.nextReviewAt).toBe(T0 + DAY)
  })

  it('следующие зачёты в тот же день расписание не двигают', () => {
    const first = applyVerseResult(verse(), { tier: 1, score: 100 }, T0).verse
    const second = applyVerseResult(first, { tier: 1, score: 100 }, T0 + 1000)
    expect(second.stage).toBe(1)
    expect(second.nextReviewAt).toBe(T0 + DAY)
    expect(second.strength).toBe(2)
  })

  it('зачёт в срок переводит на следующую стадию: 1 → 3 → 7 → 14 → 30 → 60 дней', () => {
    let v = verse({ strength: 3, stage: 1, nextReviewAt: T0 })
    const expected = [3, 7, 14, 30, 60, 60]
    let now = T0
    for (const days of expected) {
      v = applyVerseResult(v, { tier: 3, score: 100 }, now).verse
      expect(v.nextReviewAt).toBe(now + days * DAY)
      now = v.nextReviewAt
    }
    expect(v.stage).toBe(6)
  })

  it('недостаточно сложное упражнение не засчитывает повторение: стих остаётся к повторению', () => {
    const due = verse({ strength: 4, stage: 3, nextReviewAt: T0 })
    const easy = applyVerseResult(due, { tier: 1, score: 100 }, T0).verse
    expect(easy.stage).toBe(3)
    expect(easy.nextReviewAt).toBe(T0)
    const hard = applyVerseResult(easy, { tier: 2, score: 100 }, T0).verse
    expect(hard.stage).toBe(4)
    expect(hard.nextReviewAt).toBe(T0 + 14 * DAY)
  })

  it('до срока зачёт расписание не меняет', () => {
    const r = applyVerseResult(verse({ strength: 3, stage: 3, nextReviewAt: T0 + 7 * DAY }), { tier: 3, score: 100 }, T0)
    expect(r.verse.stage).toBe(3)
    expect(r.verse.nextReviewAt).toBe(T0 + 7 * DAY)
  })

  it('ошибка в срок снижает стадию и возвращает стих на завтра', () => {
    const r = applyVerseResult(verse({ strength: 4, stage: 4, nextReviewAt: T0 }), { tier: 3, score: 50 }, T0 + 8 * DAY)
    expect(r.change).toBe('down')
    expect(r.verse.stage).toBe(3)
    expect(r.verse.lapses).toBe(1)
    expect(r.verse.nextReviewAt).toBe(T0 + 9 * DAY)
    expect(applyVerseResult(verse({ strength: 5, stage: 5, nextReviewAt: T0 }), { tier: 3, score: 10 }, T0).verse.stage).toBe(3)
    expect(applyVerseResult(verse({ strength: 2, stage: 1, nextReviewAt: T0 }), { tier: 3, score: 10 }, T0).verse.stage).toBe(1)
  })

  it('ошибка до срока стадию не меняет, но стих вернётся не позже чем через день', () => {
    const r = applyVerseResult(verse({ strength: 4, stage: 4, nextReviewAt: T0 + 14 * DAY }), { tier: 2, score: 40 }, T0)
    expect(r.verse.stage).toBe(4)
    expect(r.verse.nextReviewAt).toBe(T0 + DAY)
    expect(needsAttention(r.verse)).toBe(true)
  })

  it('результат 70–89% в срок: повтор через половину интервала, стадия прежняя', () => {
    const r = applyVerseResult(verse({ strength: 3, stage: 3, nextReviewAt: T0 }), { tier: 2, score: 80 }, T0)
    expect(r.verse.stage).toBe(3)
    expect(r.verse.nextReviewAt).toBe(T0 + 3.5 * DAY)
  })

  it('новый стих, который не получился, остаётся к изучению', () => {
    const r = applyVerseResult(verse(), { tier: 1, score: 30 }, T0 + 5000)
    expect(r.verse.strength).toBe(0)
    expect(r.verse.stage).toBe(0)
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
