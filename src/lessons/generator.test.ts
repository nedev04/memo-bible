import { describe, expect, it } from 'vitest'
import type { VerseState } from '../types'
import { DAY } from '../logic/config'
import { applySliderMask, makeRanks } from './mask'
import { buildVerseGaps } from './gaps'
import { gapSettings, partialSettings, pickVerses, planLesson } from './generator'
import { flattenWords } from '../logic/exercises'

const T0 = new Date('2026-03-10T10:00:00').getTime()

function verse(n: number, over: Partial<VerseState> = {}): VerseState {
  return {
    key: `rst:mat:5:${n}`, translation: 'rst', book: 'mat', chapter: 5, verse: n,
    addedAt: T0, strength: 0, nextReviewAt: T0, updatedAt: T0,
    lastUpAt: null, lastPracticedAt: null, lastScore: null, lapses: 0, ...over,
  }
}

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TEXT = 'Блаженны милостивые, ибо они помилованы будут'

describe('подбор стихов', () => {
  it('новые идут первыми, не больше двух, в порядке Библии', () => {
    const list = pickVerses([verse(9), verse(7), verse(8), verse(3, { strength: 2, nextReviewAt: T0 - DAY })], T0)
    expect(list.map((v) => v.verse)).toEqual([7, 8, 3])
  })

  it('повторение: ошибки раньше остальных, ещё не подошедшие по сроку не берутся, если хватает других', () => {
    const verses = [
      verse(1, { strength: 3, nextReviewAt: T0 - 5 * DAY }),
      verse(2, { strength: 3, nextReviewAt: T0 - 1 * DAY, lastScore: 40 }),
      verse(3, { strength: 3, nextReviewAt: T0 - 2 * DAY }),
      verse(4, { strength: 5, nextReviewAt: T0 + 30 * DAY }),
    ]
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([2, 1, 3])
  })

  it('если срочного мало, добавляет самые слабые из остальных', () => {
    const verses = [verse(1, { strength: 2, nextReviewAt: T0 - DAY }), verse(2, { strength: 5, nextReviewAt: T0 + DAY }), verse(3, { strength: 3, nextReviewAt: T0 + DAY })]
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([1, 3, 2])
  })
})

describe('план урока', () => {
  it('новый стих: открытие → скрытый текст → пропуски; повторение: скрытый текст → пропуски', () => {
    const steps = planLesson([verse(1), verse(2, { strength: 3, nextReviewAt: T0 - DAY })], T0)
    expect(steps.map((s) => s.kind)).toEqual(['reveal', 'partial', 'fillGaps', 'partial', 'fillGaps'])
    expect(steps.every((s) => s.verseKeys.length === 1)).toBe(true)
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length)
  })

  it('сложность растёт с силой стиха', () => {
    expect(partialSettings(0).wordPct!).toBeLessThan(partialSettings(5).wordPct!)
    expect(partialSettings(6).wordPct).toBe(50)
    expect(partialSettings(6).letterPct!).toBeLessThanOrEqual(100)
    expect(gapSettings(0).blanks).toBe(1)
    expect(gapSettings(6).options).toBe(5)
  })

  it('без стихов урока нет', () => {
    expect(planLesson([], T0)).toEqual([])
  })
})

describe('ползунки скрытого текста', () => {
  const words = flattenWords(TEXT)
  const ranks = makeRanks(words, seeded(1))
  const hiddenOf = (w: number, l: number) =>
    applySliderMask(words, ranks, w, l).map((m, i) => (m === null ? '' : `${i}:${m}`)).filter(Boolean)

  it('0 и 0 — текст виден целиком', () => {
    expect(applySliderMask(words, ranks, 0, 0).every((m) => m === null)).toBe(true)
  })

  it('слова скрываются целиком, до половины', () => {
    const mask = applySliderMask(words, ranks, 50, 0)
    expect(mask.filter(Boolean)).toHaveLength(Math.round(words.length / 2))
    mask.forEach((m) => m && expect(m).toMatch(/^_+$/))
  })

  it('100% букв оставляет только первые буквы', () => {
    const mask = applySliderMask(words, ranks, 0, 100)
    mask.forEach((m, i) => {
      if (!m) return
      expect(m[0]).toBe(words[i].core[0])
      expect(m.slice(1)).toMatch(/^_*$/)
    })
  })

  it('при движении ползунка скрытое только добавляется', () => {
    const a = new Set(hiddenOf(20, 30).map((s) => s.split(':')[0]))
    const b = new Set(hiddenOf(40, 60).map((s) => s.split(':')[0]))
    for (const x of a) expect(b.has(x)).toBe(true)
  })
})

describe('пропуски в стихе', () => {
  const words = flattenWords(TEXT)
  const pool = flattenWords(`${TEXT}. Блаженны плачущие, ибо они утешатся. Блаженны кроткие, ибо они наследуют землю.`)

  it('ответ среди вариантов, пропуски не рядом, число вариантов соблюдается', () => {
    const gaps = buildVerseGaps(words, pool, 2, 4, seeded(5))
    expect(gaps).toHaveLength(2)
    gaps.forEach((g) => {
      expect(g.options).toContain(g.answer)
      expect(g.options).toHaveLength(4)
      expect(new Set(g.options.map((o) => o.toLowerCase())).size).toBe(4)
    })
    expect(Math.abs(gaps[0].wordIndex - gaps[1].wordIndex)).toBeGreaterThan(1)
  })

  it('нет вариантов — нет пропуска', () => {
    expect(buildVerseGaps(flattenWords('да'), flattenWords('да'), 1, 3)).toEqual([])
  })
})
