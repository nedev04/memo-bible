import { describe, expect, it } from 'vitest'
import type { VerseState } from '../types'
import { DAY } from '../logic/config'
import { flattenWords, splitIntoPieces } from '../logic/exercises'
import { buildVerseGaps } from './gaps'
import {
  availableTypes, distance, followingVerses, gapSettings, partialSettings, patternType, pickReviewVerses, pickVerses,
  planLesson, planOfType, planReview, planTest, resolveType, reviewWeight, shouldSkipWhere, typingVisiblePct, weightedSample,
} from './generator'
import { applySliderMask, makeRanks, pickVisibleWords } from './mask'
import { stepTier, type LessonStep } from './types'
import { buildWhereQuestions, nearBooks, nearNumbers } from './where'

const T0 = new Date('2026-03-10T10:00:00').getTime()

function verseIn(book: string, chapter: number, n: number, over: Partial<VerseState> = {}): VerseState {
  return {
    key: `rst:${book}:${chapter}:${n}`, translation: 'rst', book, chapter, verse: n,
    addedAt: T0, strength: 0, stage: 0, nextReviewAt: T0, updatedAt: T0,
    lastUpAt: null, lastPracticedAt: null, lastScore: null, lapses: 0, ...over,
  }
}
const verse = (n: number, over: Partial<VerseState> = {}) => verseIn('mat', 5, n, over)

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TEXT = 'Блаженны милостивые, ибо они помилованы будут'
const kinds = (steps: { kind: string }[]) => steps.map((s) => s.kind)


describe('подбор стихов', () => {
  it('новые вводятся строго по порядку Библии, не больше двух за урок', () => {
    const verses = Array.from({ length: 18 }, (_, i) => verse(i + 1)).reverse()
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([1, 2])
  })

  it('длинный отрывок идёт кусками подряд: за новыми стихами подтягиваются начатые соседи', () => {
    const started = (n: number) => verse(n, { strength: 2, stage: 1, nextReviewAt: T0 + DAY })
    const verses = [started(1), started(2), ...Array.from({ length: 16 }, (_, i) => verse(i + 3))]
    // новые 3 и 4, а недостающее место занимает ближайший начатый стих (2), а не далёкий
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([2, 3, 4])
  })

  it('стихи, которым пора повторяться, выбираются по соседству с новыми, а не из любого места', () => {
    const due = (n: number) => verse(n, { strength: 3, stage: 2, nextReviewAt: T0 - DAY })
    const verses = [due(3), due(40), verse(7), verse(8)]
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([3, 7, 8, 40])
    const crowded = [due(3), due(4), due(40), due(41), due(42), verse(5)]
    expect(pickVerses(crowded, T0).map((v) => v.verse)).toEqual([3, 4, 5, 40])
  })

  it('без новых опорой служит самый срочный стих (с ошибкой), вокруг него собираются соседи', () => {
    const verses = [
      verse(1, { strength: 3, nextReviewAt: T0 - 5 * DAY }),
      verse(2, { strength: 3, nextReviewAt: T0 - DAY, lastScore: 40 }),
      verse(3, { strength: 3, nextReviewAt: T0 - 2 * DAY }),
      verse(30, { strength: 3, nextReviewAt: T0 - 9 * DAY }),
      verse(31, { strength: 5, nextReviewAt: T0 + 30 * DAY }),
    ]
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([1, 2, 3, 30])
  })

  it('если срочного мало, добавляет ближайшие по тексту начатые стихи', () => {
    const verses = [
      verse(10, { strength: 2, nextReviewAt: T0 - DAY }),
      verse(11, { strength: 5, nextReviewAt: T0 + DAY }),
      verse(40, { strength: 1, nextReviewAt: T0 + DAY }),
    ]
    expect(pickVerses(verses, T0).map((v) => v.verse)).toEqual([10, 11, 40])
  })

  it('расстояние растёт при смене главы и книги', () => {
    expect(distance(verse(1), verse(3))).toBe(2)
    expect(distance(verse(1), verseIn('mat', 6, 1))).toBeGreaterThan(distance(verse(1), verse(40)))
    expect(distance(verse(1), verseIn('jhn', 1, 1))).toBeGreaterThan(distance(verse(1), verseIn('mat', 28, 20)))
  })
})

describe('план урока', () => {
  it('новый стих: знакомство, затем три несложных упражнения в свободном порядке', () => {
    const orders = new Set<string>()
    for (let i = 1; i <= 30; i++) {
      const steps = planLesson([verse(1)], T0, seeded(i))
      expect(kinds(steps).slice(0, 2)).toEqual(['reveal', 'partial'])
      const practice = steps.slice(2)
      expect(practice).toHaveLength(3)
      practice.forEach((s) => expect(['fillGaps', 'assemble', 'whereWritten', 'firstLetters']).toContain(s.kind))
      practice.forEach((s) => {
        if (s.kind === 'assemble') expect(s.settings.pieces).toBe(4)
        if (s.kind === 'whereWritten') expect(s.settings.levels).toBe(1)
        if (s.kind === 'firstLetters') expect(s.settings.hintLevel).toBe(1)
      })
      expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length)
      orders.add(kinds(practice).join())
    }
    expect(orders.size).toBeGreaterThan(1)
  })

  it('несколько новых стихов: сначала знакомство со всеми по порядку, потом упражнения вперемешку', () => {
    const steps = planLesson([verse(2), verse(1)], T0, seeded(4))
    expect(steps.slice(0, 4).map((s) => `${s.kind}:${s.verseKeys[0].slice(-1)}`)).toEqual(['reveal:1', 'partial:1', 'reveal:2', 'partial:2'])
    const practice = steps.slice(4)
    expect(practice).toHaveLength(6)
    expect(new Set(practice.map((s) => s.verseKeys[0]))).toEqual(new Set(['rst:mat:5:1', 'rst:mat:5:2']))
  })

  it('повторение: «главное» упражнение последним, его сложности хватает для роста силы', () => {
    const gates = (strength: number) => {
      const found = new Set<string>()
      for (let i = 1; i <= 40; i++) {
        const steps = planLesson([verse(1, { strength, stage: 1, nextReviewAt: T0 + 5 * DAY })], T0, seeded(i))
        const gate = steps[steps.length - 1]
        found.add(gate.kind + (gate.kind === 'firstLetters' ? `:${gate.settings.hintLevel}` : gate.kind === 'assemble' ? `:${gate.settings.pieces}` : ''))
      }
      return [...found].sort()
    }
    expect(gates(1)).toEqual(['fillGaps'])
    expect(gates(2)).toEqual(['assemble:6', 'firstLetters:2'])
    expect(gates(3)).toEqual(['assemble:9', 'firstLetters:3'])
    expect(gates(5)).toEqual(['fillGaps', 'firstLetters:3'])
  })

  it('«главные» упражнения для роста силы с 2 по 4 имеют сложность 2, для роста с 0–1 — 1', () => {
    const tierOfGate = (strength: number) => {
      const tiers = new Set<number | null>()
      for (let i = 1; i <= 40; i++) {
        const steps = planLesson([verse(1, { strength, stage: 1, nextReviewAt: T0 + 5 * DAY })], T0, seeded(i))
        tiers.add(stepTier(steps[steps.length - 1]))
      }
      return [...tiers]
    }
    expect(tierOfGate(1)).toEqual([1])
    expect(tierOfGate(2)).toEqual([2])
    expect(tierOfGate(3)).toEqual([2])
  })

  it('стиху, которому подошёл срок, достаётся больше упражнений', () => {
    const notDue = planLesson([verse(1, { strength: 3, stage: 3, nextReviewAt: T0 + 3 * DAY })], T0, seeded(3))
    const due = planLesson([verse(1, { strength: 3, stage: 3, nextReviewAt: T0 - DAY })], T0, seeded(3))
    expect(notDue).toHaveLength(2)
    expect(due).toHaveLength(3)
  })

  it('если рядом учатся соседние стихи, на сильных стихах иногда предлагается «Расставьте части»', () => {
    const verses = [
      verse(7, { strength: 3, nextReviewAt: T0 - DAY }),
      verse(8, { strength: 1, nextReviewAt: T0 + 5 * DAY }),
      verse(9, { strength: 2, nextReviewAt: T0 + 5 * DAY }),
      verse(10, { strength: 0 }),
    ]
    expect(followingVerses(verses[0], verses).map((v) => v.verse)).toEqual([8, 9])
    const found: LessonStep[] = []
    for (let i = 1; i <= 40; i++) {
      found.push(...planLesson(verses.slice(0, 3), T0, seeded(i)).filter((s) => s.kind === 'orderParts'))
    }
    expect(found.length).toBeGreaterThan(0)
    found.forEach((s) => expect(s.verseKeys).toEqual(['rst:mat:5:7', 'rst:mat:5:8', 'rst:mat:5:9']))
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

describe('вопрос «где написано» не надоедает', () => {
  it('чем дольше подряд одна и та же книга, тем реже вопрос', () => {
    const sureTrue = () => 0
    const sureFalse = () => 0.99
    expect(shouldSkipWhere('jhn', [], sureTrue)).toBe(false)
    expect(shouldSkipWhere('jhn', ['mat'], sureTrue)).toBe(false)
    expect(shouldSkipWhere('jhn', ['jhn'], sureTrue)).toBe(true) // 40%: при малом rng пропускаем
    expect(shouldSkipWhere('jhn', ['jhn'], sureFalse)).toBe(false)
    expect(shouldSkipWhere('jhn', ['jhn', 'jhn'], sureFalse)).toBe(false)
    expect(shouldSkipWhere('jhn', ['jhn', 'jhn'], () => 0.5)).toBe(true) // 70%
    expect(shouldSkipWhere('jhn', ['jhn', 'jhn', 'jhn'], sureFalse)).toBe(true)
    expect(shouldSkipWhere('jhn', ['jhn', 'jhn', 'mat', 'jhn'], sureFalse)).toBe(false)
  })

  it('после трёх одинаковых ответов подряд вопроса по этой книге в уроке нет, по другой книге есть', () => {
    const recent = { recentWhere: ['jhn', 'jhn', 'jhn'] }
    const whereCount = (verses: VerseState[], seeds = 40) => {
      let n = 0
      for (let i = 1; i <= seeds; i++) n += planLesson(verses, T0, seeded(i), undefined, recent).filter((s) => s.kind === 'whereWritten').length
      return n
    }
    const john = [verseIn('jhn', 10, 1), verseIn('jhn', 10, 2)]
    const johnLearning = [verseIn('jhn', 10, 1, { strength: 1, stage: 1, nextReviewAt: T0 + DAY })]
    expect(whereCount(john)).toBe(0)
    expect(whereCount(johnLearning)).toBe(0)
    expect(whereCount([verseIn('rom', 8, 1), verseIn('rom', 8, 2)])).toBeGreaterThan(0)
  })

  it('внутри одного урока вопросы про ту же книгу не повторяются много раз', () => {
    for (let i = 1; i <= 40; i++) {
      const steps = planLesson([verseIn('jhn', 10, 1), verseIn('jhn', 10, 2)], T0, seeded(i), undefined, { recentWhere: [] })
      expect(steps.filter((s) => s.kind === 'whereWritten').length).toBeLessThanOrEqual(2)
    }
  })
})

describe('типы уроков', () => {
  it('порядок на пути повторяется: два обычных, закрепление, обычный, тест', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(patternType)).toEqual(['regular', 'regular', 'review', 'regular', 'test', 'regular', 'test'])
  })

  it('нет стихов — нет урока', () => {
    expect(resolveType('regular', [], T0)).toBeNull()
  })

  it('обычный урок без работы превращается в закрепление; тест без подходящих стихов — в закрепление или обычный', () => {
    const calm = [verse(1, { strength: 1, nextReviewAt: T0 + 5 * DAY })]
    expect(resolveType('regular', calm, T0)).toBe('review')
    expect(resolveType('regular', [verse(1)], T0)).toBe('regular')
    expect(resolveType('test', calm, T0)).toBe('review')
    expect(resolveType('test', [verse(1)], T0)).toBe('regular')
    expect(resolveType('test', [verse(1, { strength: 2, nextReviewAt: T0 + DAY })], T0)).toBe('test')
    expect(resolveType('review', [verse(1)], T0)).toBe('regular')
    expect(availableTypes([verse(1, { strength: 2 })])).toEqual({ regular: true, review: true, test: true })
    expect(availableTypes([verse(1, { strength: 1 })]).test).toBe(false)
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

  it('отрывок повторяется кусками: выбранные стихи ближе друг к другу, чем при случайном выборе', () => {
    const verses = Array.from({ length: 30 }, (_, i) => verse(i + 1, { strength: 3, stage: 2, nextReviewAt: T0 - DAY }))
    let spreadSum = 0
    const runs = 60
    for (let i = 1; i <= runs; i++) {
      const picked = pickReviewVerses(verses, T0, seeded(i)).map((v) => v.verse)
      expect(picked).toEqual([...picked].sort((a, b) => a - b)) // по порядку Библии
      spreadSum += Math.max(...picked) - Math.min(...picked)
    }
    // случайные 4 из 30 стихов в среднем разбросаны примерно на 18; здесь вдвое плотнее
    expect(spreadSum / runs).toBeLessThan(10)
  })
})

describe('тест', () => {
  it('одно задание «ввод по памяти»; чем слабее стих, тем больше слов подсказано, с силы 4 — чистый лист', () => {
    expect([2, 3, 4, 5].map(typingVisiblePct)).toEqual([60, 35, 0, 0])
    const steps = (s: number) => planTest([verse(7, { strength: s })], T0, seeded(1))
    expect(steps(2)[0].settings.visiblePct).toBe(60)
    expect(steps(3)[0].settings.visiblePct).toBe(35)
    expect(steps(4)[0].settings.visiblePct).toBe(0)
    expect(stepTier(steps(3)[0])).toBe(2)
    expect(stepTier(steps(4)[0])).toBe(3)
  })

  it('несколько стихов подряд: сложность определяет самый слабый', () => {
    const verses = [verse(7, { strength: 4 }), verse(8, { strength: 2 })]
    const found = new Set<string>()
    for (let i = 1; i <= 30; i++) {
      const [step] = planTest(verses, T0, seeded(i))
      found.add(`${step.verseKeys.join()}|${step.settings.visiblePct}`)
    }
    expect([...found].sort()).toEqual(['rst:mat:5:7,rst:mat:5:8|60', 'rst:mat:5:8|60'])
  })

  it('нет подходящих стихов — нет теста', () => {
    expect(planTest([verse(1, { strength: 1 })], T0, seeded(1))).toEqual([])
  })

  it('повтор урока ограничивается теми же стихами', () => {
    const verses = [verse(7, { strength: 4 }), verse(8, { strength: 4 })]
    const steps = planOfType('test', verses, T0, seeded(1), new Set(['rst:mat:5:8']))
    expect(steps[0].verseKeys).toEqual(['rst:mat:5:8'])
    const regular = planOfType('regular', [verse(1), verse(2), verse(3, { strength: 3 })], T0, seeded(1), new Set(['rst:mat:5:2']))
    expect(regular.every((s) => s.verseKeys.every((k) => k === 'rst:mat:5:2'))).toBe(true)
  })
})

describe('сложность упражнений', () => {
  const step = (kind: LessonStep['kind'], settings: LessonStep['settings']): LessonStep => ({ id: 'x', kind, verseKeys: ['k'], settings })
  it('первые буквы: слова видны — 1, иначе — 2; ввод по памяти: с подсказкой — 2, с чистого листа — 3', () => {
    expect(stepTier(step('firstLetters', { hintLevel: 1 }))).toBe(1)
    expect(stepTier(step('firstLetters', { hintLevel: 2 }))).toBe(2)
    expect(stepTier(step('firstLetters', { hintLevel: 3 }))).toBe(2)
    expect(stepTier(step('typing', { visiblePct: 35 }))).toBe(2)
    expect(stepTier(step('typing', { visiblePct: 0 }))).toBe(3)
    expect(stepTier(step('typing', {}))).toBe(3)
  })
})

describe('слова, показанные заранее', () => {
  const words = flattenWords('Раз — два три четыре пять шесть семь восемь девять десять')
  it('нужная доля слов с буквами, слова без букв всегда видны', () => {
    const visible = pickVisibleWords(words, 40, seeded(3))
    expect(visible[1]).toBe(true) // тире
    const letters = words.filter((_, i) => i !== 1)
    const shown = letters.filter((_, i) => visible[i >= 1 ? i + 1 : i]).length
    expect(shown).toBe(Math.round(letters.length * 0.4))
    expect(pickVisibleWords(words, 0, seeded(1)).filter(Boolean)).toHaveLength(1)
    expect(pickVisibleWords(words, 100, seeded(1)).every(Boolean)).toBe(true)
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

describe('вопросы «где написано»', () => {
  const v = { book: 'mat', chapter: 5, verse: 7, bookChapters: 28, chapterVerses: 48 }

  it('число вопросов зависит от уровня; правильный ответ среди вариантов', () => {
    for (const levels of [1, 2, 3] as const) {
      const qs = buildWhereQuestions(v, levels, seeded(levels))
      expect(qs).toHaveLength(levels)
      qs.forEach((q) => expect(q.options.map((o) => o.value)).toContain(q.answer))
    }
  })

  it('варианты книг: 4 разные, в порядке Библии', () => {
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
    expect(splitIntoPieces(text, 2)[0].endsWith(';')).toBe(true)
  })
})
