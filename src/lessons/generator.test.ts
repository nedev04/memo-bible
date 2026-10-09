import { describe, expect, it } from 'vitest'
import type { VerseState } from '../types'
import { DAY } from '../logic/config'
import { applySliderMask, makeRanks } from './mask'
import { buildVerseGaps } from './gaps'
import { followingVerses, gapSettings, partialSettings, pickVerses, planLesson } from './generator'
import { buildWhereQuestions, nearBooks, nearNumbers } from './where'
import { splitIntoPieces } from '../logic/exercises'
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
  const kinds = (steps: { kind: string }[]) => steps.map((s) => s.kind)

  it('новый стих: открытие → скрытый текст → пропуски', () => {
    const steps = planLesson([verse(1)], T0, seeded(1))
    expect(kinds(steps)).toEqual(['reveal', 'partial', 'fillGaps'])
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length)
  })

  it('повторение: одно дополнительное упражнение и «главное» последним, сложность зависит от силы', () => {
    const gateFor = (strength: number) =>
      planLesson([verse(1, { strength, nextReviewAt: T0 - DAY })], T0, seeded(3)).at(-1)!
    expect(gateFor(1).kind).toBe('fillGaps')
    expect(gateFor(2).kind).toBe('assemble')
    expect(gateFor(2).settings.pieces).toBe(6)
    expect(gateFor(3).kind).toBe('assemble')
    expect(gateFor(3).settings.pieces).toBe(9)
    expect(gateFor(5).kind).toBe('fillGaps')
    expect(planLesson([verse(1, { strength: 3, nextReviewAt: T0 - DAY })], T0, seeded(3))).toHaveLength(2)
  })

  it('если рядом учатся соседние стихи, на сильных стихах предлагается «Расставьте части»', () => {
    const verses = [
      verse(7, { strength: 3, nextReviewAt: T0 - DAY }),
      verse(8, { strength: 1, nextReviewAt: T0 + 5 * DAY }),
      verse(9, { strength: 2, nextReviewAt: T0 + 5 * DAY }),
      verse(10, { strength: 0 }),
    ]
    expect(followingVerses(verses[0], verses).map((v) => v.verse)).toEqual([8, 9])
    const gate = planLesson(verses.slice(0, 3), T0, seeded(2)).find((s) => s.kind === 'orderParts')
    expect(gate?.verseKeys).toEqual(['rst:mat:5:7', 'rst:mat:5:8', 'rst:mat:5:9'])
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

describe('вопросы «где написано»', () => {
  const v = { book: 'mat', chapter: 5, verse: 7, bookChapters: 28, chapterVerses: 48 }

  it('число вопросов зависит от уровня; правильный ответ среди вариантов', () => {
    for (const levels of [1, 2, 3] as const) {
      const qs = buildWhereQuestions(v, levels, seeded(levels))
      expect(qs).toHaveLength(levels)
      qs.forEach((q) => expect(q.options.map((o) => o.value)).toContain(q.answer))
    }
  })

  it('варианты книг: 4 разные, в порядке Библии, две из того же завета', () => {
    const books = nearBooks('mat', seeded(4))
    expect(books).toHaveLength(4)
    expect(new Set(books.map((b) => b.value)).size).toBe(4)
  })

  it('числа рядом с правильным, по возрастанию, без повторов', () => {
    const nums = nearNumbers(5, 28, 5, seeded(1))
    expect(nums).toHaveLength(5)
    expect(nums).toContain(5)
    expect([...nums].sort((a, b) => a - b)).toEqual(nums)
    expect(Math.max(...nums) - Math.min(...nums)).toBeLessThanOrEqual(8)
  })

  it('вопрос пропускается, если выбирать не из чего', () => {
    const one = { book: 'oba', chapter: 1, verse: 3, bookChapters: 1, chapterVerses: 1 }
    expect(buildWhereQuestions(one, 3, seeded(1)).map((q) => q.field)).toEqual(['book'])
  })
})

describe('разбиение на части', () => {
  const text = 'Блаженны милостивые, ибо они помилованы будут; блаженны чистые сердцем, ибо они Бога узрят'

  it('части склеиваются обратно в исходный текст', () => {
    for (const n of [2, 4, 6, 9]) {
      const parts = splitIntoPieces(text, n)
      expect(parts.join(' ')).toBe(text)
      expect(parts.length).toBeLessThanOrEqual(n)
      expect(parts.length).toBeGreaterThan(1)
    }
  })

  it('слов меньше, чем частей, — каждое слово отдельно', () => {
    expect(splitIntoPieces('Господь пастырь мой', 10)).toEqual(['Господь', 'пастырь', 'мой'])
  })

  it('разбивает по знакам препинания, если они есть рядом с серединой', () => {
    const parts = splitIntoPieces(text, 2)
    expect(parts[0].endsWith(';')).toBe(true)
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

import { availableTypes, patternType, planOfType, planReview, planTest, resolveType, reviewWeight, weightedSample } from './generator'

describe('типы уроков', () => {
  it('порядок на пути повторяется: два обычных, закрепление, обычный, тест', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(patternType)).toEqual(['regular', 'regular', 'review', 'regular', 'test', 'regular', 'test'])
  })

  it('нет стихов — нет урока', () => {
    expect(resolveType('regular', [], T0)).toBeNull()
  })

  it('обычный урок без работы превращается в закрепление; тест без выученных — в закрепление или обычный', () => {
    const calm = [verse(1, { strength: 2, nextReviewAt: T0 + 5 * DAY })]
    expect(resolveType('regular', calm, T0)).toBe('review')
    expect(resolveType('regular', [verse(1)], T0)).toBe('regular')
    expect(resolveType('test', calm, T0)).toBe('review')
    expect(resolveType('test', [verse(1)], T0)).toBe('regular')
    expect(resolveType('test', [verse(1, { strength: 4, nextReviewAt: T0 + DAY })], T0)).toBe('test')
    expect(resolveType('review', [verse(1)], T0)).toBe('regular')
    expect(availableTypes([verse(1, { strength: 3 })])).toEqual({ regular: true, review: true, test: true })
  })
})

describe('выборка с весами', () => {
  it('без повторов, не больше k, вес 0 попадает в конец', () => {
    const r = weightedSample([1, 2, 3, 4], (n) => (n === 4 ? 0 : 10), 3, seeded(1))
    expect(new Set(r).size).toBe(3)
    expect(r).not.toContain(4)
  })

  it('тяжёлые элементы выбираются чаще', () => {
    let heavy = 0
    for (let i = 0; i < 200; i++) if (weightedSample(['a', 'b'], (x) => (x === 'a' ? 9 : 1), 1, seeded(i + 1))[0] === 'a') heavy++
    expect(heavy).toBeGreaterThan(140)
  })
})

describe('закрепление', () => {
  it('новых стихов нет; стих с ошибкой весомее твёрдо выученного', () => {
    const verses = [verse(1), verse(2, { strength: 2, nextReviewAt: T0 - DAY }), verse(3, { strength: 6, nextReviewAt: T0 + 30 * DAY, addedAt: T0 - 90 * DAY })]
    const steps = planReview(verses, T0, seeded(5))
    expect(steps.every((s) => !s.verseKeys.includes('rst:mat:5:1'))).toBe(true)
    expect(steps.length).toBeGreaterThan(0)
    expect(reviewWeight(verse(4, { strength: 3, lastScore: 30, nextReviewAt: T0 + DAY }), T0))
      .toBeGreaterThan(reviewWeight(verse(5, { strength: 6, nextReviewAt: T0 + 30 * DAY, addedAt: T0 - 90 * DAY }), T0))
  })

  it('без начатых стихов плана нет', () => {
    expect(planReview([verse(1)], T0, seeded(1))).toEqual([])
  })
})

describe('тест', () => {
  it('одно задание «ввод по памяти» по стиху с силой не ниже 3; соседние выученные стихи добавляются', () => {
    const verses = [
      verse(7, { strength: 4, nextReviewAt: T0 - DAY }),
      verse(8, { strength: 3 }),
      verse(9, { strength: 1 }),
    ]
    const results = new Set<string>()
    for (let i = 1; i <= 30; i++) {
      const steps = planTest(verses, T0, seeded(i))
      expect(steps).toHaveLength(1)
      expect(steps[0].kind).toBe('typing')
      results.add(steps[0].verseKeys.join())
    }
    // начало с седьмого стиха захватывает и восьмой; девятый ещё слаб и в тест не попадает
    expect([...results].sort()).toEqual(['rst:mat:5:7,rst:mat:5:8', 'rst:mat:5:8'])
  })

  it('нет выученных стихов — нет теста', () => {
    expect(planTest([verse(1, { strength: 2 })], T0, seeded(1))).toEqual([])
  })

  it('повтор урока ограничивается теми же стихами', () => {
    const verses = [verse(7, { strength: 4 }), verse(8, { strength: 4 })]
    const steps = planOfType('test', verses, T0, seeded(1), new Set(['rst:mat:5:8']))
    expect(steps[0].verseKeys).toEqual(['rst:mat:5:8'])
    const regular = planOfType('regular', [verse(1), verse(2), verse(3, { strength: 3 })], T0, seeded(1), new Set(['rst:mat:5:2']))
    expect(regular.every((s) => s.verseKeys.every((k) => k === 'rst:mat:5:2'))).toBe(true)
  })
})
