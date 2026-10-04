import { describe, expect, it } from 'vitest'
import {
  buildBlocks, buildErrors, buildGaps, buildLineEnding, buildNextLineTasks, buildPartialMask,
  flattenWords, groupLines, judgeTyped, scoreOrder, shuffleBlocks, toLines, visibleMask,
} from './exercises'

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TEXT = `Я помню чудное мгновенье:
Передо мной явилась ты,
Как мимолетное виденье,
Как гений чистой красоты.

В томленьях грусти безнадежной,
В тревогах шумной суеты,
Звучал мне долго голос нежный
И снились милые черты.`

describe('buildGaps', () => {
  it('пропуски (кроме тяжёлого уровня) не соседние, ответ входит в варианты', () => {
    for (const d of [1, 2, 3] as const) {
      const words = flattenWords(TEXT)
      const gaps = buildGaps(words, d, seeded(d))
      expect(gaps.length).toBeGreaterThan(0)
      gaps.forEach((g, i) => {
        expect(g.options).toContain(g.answer)
        expect(new Set(g.options.map((o) => o.toLowerCase())).size).toBe(g.options.length)
        if (i > 0 && d < 3) expect(g.wordIndex - gaps[i - 1].wordIndex).toBeGreaterThan(1)
      })
    }
  })
  it('на тяжёлом пропусков больше, а вариантов больше', () => {
    const words = flattenWords(TEXT)
    const easy = buildGaps(words, 1, seeded(1))
    const hard = buildGaps(words, 3, seeded(1))
    expect(hard.length).toBeGreaterThan(easy.length)
    expect(hard[0].options.length).toBeGreaterThan(easy[0].options.length)
  })
})

const SENTENCE = 'Это довольно длинное предложение, в котором ровно двенадцать слов для полной проверки.'
const LONG_LINES = Array.from({ length: 10 }, () => SENTENCE).join('\n') // 10 предложений по 12 слов
const LONG_PARAGRAPH = Array.from({ length: 10 }, () => SENTENCE).join(' ')

describe('количество пропусков и блоков на длинном тексте', () => {
  it('пропусков много и их число растёт с уровнем', () => {
    const words = flattenWords(LONG_LINES)
    const counts = ([1, 2, 3] as const).map((d) => buildGaps(words, d, seeded(d)).length)
    expect(counts[0]).toBeGreaterThanOrEqual(14)
    expect(counts[0]).toBeLessThan(counts[1])
    expect(counts[1]).toBeLessThan(counts[2])
  })
  it('блоков: ~8 / ~13 / ~20 для 10 предложений', () => {
    for (const text of [LONG_LINES, LONG_PARAGRAPH]) {
      expect(buildBlocks(text, 1).length).toBe(8)
      expect(buildBlocks(text, 2).length).toBe(13)
      expect(buildBlocks(text, 3).length).toBe(20)
    }
  })
  it('абзац без переносов режется по знакам препинания', () => {
    const blocks = buildBlocks(LONG_PARAGRAPH, 1)
    expect(blocks.filter((b) => /[,.]$/.test(b)).length).toBeGreaterThanOrEqual(blocks.length - 1)
  })
})

describe('buildBlocks', () => {
  it('число блоков зависит от сложности и склеивается обратно в текст', () => {
    for (const d of [1, 2, 3] as const) {
      const blocks = buildBlocks(TEXT, d)
      expect(blocks.length).toBe({ 1: 4, 2: 6, 3: 10 }[d])
      const joined = blocks.join(' ').replace(/\s+/g, ' ')
      expect(joined).toBe(TEXT.replace(/\s+/g, ' '))
    }
  })
  it('перемешивание отличается от исходного порядка', () => {
    const blocks = buildBlocks(TEXT, 1)
    const order = shuffleBlocks(blocks, seeded(5))
    expect(order).not.toEqual([0, 1, 2, 3])
    expect([...order].sort()).toEqual([0, 1, 2, 3])
  })
  it('оценка по позициям', () => {
    expect(scoreOrder(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(100)
    expect(scoreOrder(['b', 'a', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(50)
  })
})

describe('visibleMask', () => {
  it('лёгкая — все видны, тяжёлая — только слова без букв', () => {
    const words = flattenWords('Раз — два три')
    expect(visibleMask(words, 1).every(Boolean)).toBe(true)
    expect(visibleMask(words, 3)).toEqual([false, true, false, false])
  })
})

describe('judgeTyped', () => {
  it('засчитывает слово по совпадению, пробелу или длине', () => {
    expect(judgeTyped('Тебе', 'тебе')).toBe('ok')
    expect(judgeTyped('ёж', 'еж')).toBe('ok')
    expect(judgeTyped('теб', 'тебе')).toBe('wait')
    expect(judgeTyped('теб ', 'тебе')).toBe('bad')
    expect(judgeTyped('тебя', 'тебе')).toBe('bad')
    expect(judgeTyped('тебе,', 'тебе')).toBe('ok')
    expect(judgeTyped('   ', 'тебе')).toBe('wait')
  })
})

describe('groupLines / toLines', () => {
  it('группирует слова по строкам', () => {
    const spans = groupLines(flattenWords(TEXT))
    expect(spans.length).toBe(8)
    expect(spans[4].blankBefore).toBe(true)
  })
  it('режет прозу на «строки»', () => {
    expect(toLines(LONG_PARAGRAPH).length).toBeGreaterThanOrEqual(10)
    expect(toLines(TEXT).length).toBe(8)
  })
})

describe('buildPartialMask', () => {
  it('на лёгком скрыто меньше, чем на тяжёлом; первая буква в частично скрытых остаётся', () => {
    const words = flattenWords(LONG_LINES)
    const easy = buildPartialMask(words, 1, seeded(1)).filter(Boolean).length
    const hard = buildPartialMask(words, 3, seeded(1)).filter(Boolean).length
    expect(easy).toBeLessThan(hard)
    buildPartialMask(words, 1, seeded(2)).forEach((m, i) => {
      if (m && m.includes('_') && !/^_+$/.test(m)) expect(m[0]).toBe(words[i].core[0])
    })
  })
})

describe('buildNextLineTasks', () => {
  it('на тяжёлом нужно ввести две строки, на лёгком подставлено первое слово', () => {
    const lines = toLines(TEXT)
    const easy = buildNextLineTasks(lines, 1, seeded(3))
    const hard = buildNextLineTasks(lines, 3, seeded(3))
    expect(easy[0].answer.length).toBe(1)
    expect(easy[0].givenCount).toBe(1)
    expect(hard[0].answer.length).toBe(2)
    expect(easy.length).toBe(3)
  })
  it('для одной строки заданий нет', () => {
    expect(buildNextLineTasks([['а', 'б']], 1)).toEqual([])
  })
})

describe('buildLineEnding', () => {
  it('на тяжёлом скрыто больше слов', () => {
    const lines = toLines(TEXT)
    const hidden = (d: 1 | 2 | 3) => buildLineEnding(lines, d, seeded(4)).given.filter((g) => !g).length
    expect(hidden(1)).toBeLessThan(hidden(2))
    expect(hidden(2)).toBeLessThan(hidden(3))
  })
})

describe('buildErrors', () => {
  it('ошибки не соседние, исправление входит в варианты, подмена отличается от оригинала', () => {
    const words = flattenWords(LONG_LINES)
    for (const d of [1, 2, 3] as const) {
      const errs = buildErrors(words, d, seeded(d))
      expect(errs.length).toBeGreaterThanOrEqual(3)
      errs.forEach((e, i) => {
        expect(e.options).toContain(e.original)
        expect(e.fake.toLowerCase()).not.toBe(e.original.toLowerCase())
        if (i > 0) expect(e.wordIndex - errs[i - 1].wordIndex).toBeGreaterThan(1)
      })
    }
  })
})
