import type { Difficulty } from '../types'
import { parseLines, splitToken } from './parser'

/** Генератор случайных чисел [0,1). В тестах подменяется на детерминированный. */
export type Rng = () => number

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Нижний регистр, «ё» = «е» — для сравнения ответов */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е')
}

// ---------- Плоский список слов ----------

export interface FlatWord {
  raw: string
  lead: string
  core: string
  trail: string
  newLine: boolean
  blankBefore: boolean
}

export function flattenWords(content: string): FlatWord[] {
  const out: FlatWord[] = []
  parseLines(content).forEach((line, li) => {
    line.words.forEach((w, wi) => {
      const t = splitToken(w)
      out.push({ ...t, newLine: wi === 0 && li > 0, blankBefore: wi === 0 && line.blankBefore })
    })
  })
  return out
}

/** Первая буква (или цифра) слова в нормализованном виде; null, если в слове нет букв (например, «—») */
export function firstChar(w: FlatWord): string | null {
  const m = w.core.match(/[\p{L}\p{N}]/u)
  return m ? normalize(m[0]) : null
}

// ---------- Первые буквы ----------

/** true — слово видно до ввода буквы. Лёгкая: все, средняя: примерно половина, тяжёлая: ни одного. */
export function visibleMask(words: FlatWord[], difficulty: Difficulty, rng: Rng = Math.random): boolean[] {
  return words.map((w) => {
    if (firstChar(w) === null) return true
    if (difficulty === 1) return true
    if (difficulty === 2) return rng() < 0.5
    return false
  })
}

// ---------- Пропущенные слова ----------

export interface Gap {
  wordIndex: number
  answer: string
  /** Варианты в случайном порядке, среди них правильный */
  options: string[]
}

const GAP_RATIO: Record<Difficulty, number> = { 1: 0.1, 2: 0.2, 3: 0.3 }
const OPTIONS_COUNT: Record<Difficulty, number> = { 1: 3, 2: 4, 3: 5 }
const MAX_GAPS = 30

function matchCase(word: string, like: string): string {
  const first = like.charAt(0)
  const upper = first !== first.toLowerCase()
  const head = word.charAt(0)
  return (upper ? head.toUpperCase() : head.toLowerCase()) + word.slice(1)
}

export function buildGaps(words: FlatWord[], difficulty: Difficulty, rng: Rng = Math.random): Gap[] {
  // Кандидаты на пропуск: слова от 3 букв (если таких нет — любые со значимыми символами)
  let candidates = words.map((w, i) => ({ w, i })).filter(({ w }) => w.core.length >= 3)
  if (candidates.length === 0) candidates = words.map((w, i) => ({ w, i })).filter(({ w }) => firstChar(w) !== null)
  if (candidates.length === 0) return []

  const count = Math.max(1, Math.min(MAX_GAPS, Math.round(candidates.length * GAP_RATIO[difficulty])))

  // Выбираем случайные несоседние слова
  const chosen: number[] = []
  for (const { i } of shuffle(candidates, rng)) {
    if (chosen.length >= count) break
    if (chosen.some((c) => Math.abs(c - i) === 1)) continue
    chosen.push(i)
  }
  chosen.sort((a, b) => a - b)

  // Пул слов для неверных вариантов — уникальные слова самого текста
  const pool = new Map<string, string>()
  for (const w of words) {
    if (w.core.length >= 2) pool.set(normalize(w.core), w.core)
  }

  return chosen.map((wordIndex) => {
    const answer = words[wordIndex].core
    const ansNorm = normalize(answer)
    const others = [...pool.entries()].filter(([k]) => k !== ansNorm)

    // Чем выше сложность, тем более похожие слова подбираем (по длине и первой букве)
    const ranked = others
      .map(([k, v]) => {
        let key = 0
        if (difficulty >= 2) key += Math.abs(v.length - answer.length)
        if (difficulty === 3 && k.charAt(0) === ansNorm.charAt(0)) key -= 1.5
        return { v, key: key + rng() * 1.5 }
      })
      .sort((a, b) => a.key - b.key)
      .slice(0, OPTIONS_COUNT[difficulty] - 1)
      .map((x) => matchCase(x.v, answer))

    return { wordIndex, answer, options: shuffle([answer, ...ranked], rng) }
  })
}

// ---------- Порядок блоков ----------

const BLOCK_TARGET: Record<Difficulty, number> = { 1: 4, 2: 6, 3: 10 }

/** Делит текст на блоки в правильном порядке. Строки внутри блока разделены \n. */
export function buildBlocks(content: string, difficulty: Difficulty): string[] {
  const lines = parseLines(content).map((l) => l.words)
  const target = BLOCK_TARGET[difficulty]

  if (lines.length >= target) {
    const blocks: string[] = []
    for (let i = 0; i < target; i++) {
      const start = Math.floor((i * lines.length) / target)
      const end = Math.floor(((i + 1) * lines.length) / target)
      blocks.push(lines.slice(start, end).map((l) => l.join(' ')).join('\n'))
    }
    return blocks
  }

  // Строк мало — режем самые длинные пополам, пока не наберём нужное число блоков
  const units = lines.map((l) => [...l])
  while (units.length < target) {
    let longest = 0
    units.forEach((u, i) => { if (u.length > units[longest].length) longest = i })
    if (units[longest].length < 2) break
    const u = units[longest]
    const mid = Math.ceil(u.length / 2)
    units.splice(longest, 1, u.slice(0, mid), u.slice(mid))
  }
  return units.map((u) => u.join(' '))
}

/** Перемешивает так, чтобы порядок не совпал с исходным (если это возможно) */
export function shuffleBlocks(blocks: string[], rng: Rng = Math.random): number[] {
  const idx = blocks.map((_, i) => i)
  const sameAsOriginal = (order: number[]) => order.every((o, i) => blocks[o] === blocks[i])
  let order = shuffle(idx, rng)
  for (let tries = 0; tries < 20 && sameAsOriginal(order); tries++) order = shuffle(idx, rng)
  return order
}

/** Доля блоков, стоящих на своих местах, в процентах */
export function scoreOrder(placed: string[], correct: string[]): number {
  if (correct.length === 0) return 100
  const ok = correct.filter((b, i) => placed[i] === b).length
  return Math.round((ok / correct.length) * 100)
}
