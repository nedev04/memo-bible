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

/** Доля слов-кандидатов, которые станут пропусками */
const GAP_RATIO: Record<Difficulty, number> = { 1: 0.2, 2: 0.3, 3: 0.45 }
const OPTIONS_COUNT: Record<Difficulty, number> = { 1: 3, 2: 4, 3: 5 }
const MIN_GAPS = 3
const MAX_GAPS = 60

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

  const wanted = Math.round(candidates.length * GAP_RATIO[difficulty])
  const count = Math.min(candidates.length, MAX_GAPS, Math.max(MIN_GAPS, wanted))

  // Выбираем случайные слова. На лёгком и среднем уровнях пропуски не стоят рядом, на тяжёлом — могут.
  const chosen: number[] = []
  for (const { i } of shuffle(candidates, rng)) {
    if (chosen.length >= count) break
    if (difficulty < 3 && chosen.some((c) => Math.abs(c - i) === 1)) continue
    chosen.push(i)
  }
  chosen.sort((a, b) => a - b)

  return chosen.map((wordIndex) => {
    const answer = words[wordIndex].core
    const distractors = pickDistractors(words, answer, OPTIONS_COUNT[difficulty] - 1, difficulty, rng)
    return { wordIndex, answer, options: shuffle([answer, ...distractors], rng) }
  })
}

function sharedSuffix(a: string, b: string): number {
  let n = 0
  while (n < Math.min(a.length, b.length, 3) && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

/**
 * Подбирает слова из самого текста, похожие на answer, но не совпадающие с ним.
 * Чем выше сложность, тем похожее слова (по длине и первой букве). Первое в списке — самое подходящее.
 */
export function pickDistractors(
  words: FlatWord[],
  answer: string,
  count: number,
  difficulty: Difficulty,
  rng: Rng = Math.random,
): string[] {
  const ansNorm = normalize(answer)
  const pool = new Map<string, string>()
  for (const w of words) {
    if (w.core.length >= 2) pool.set(normalize(w.core), w.core)
  }
  return [...pool.entries()]
    .filter(([k]) => k !== ansNorm)
    .map(([k, v]) => {
      let key = 0
      if (difficulty >= 2) key += Math.abs(v.length - answer.length)
      if (difficulty === 3 && k.charAt(0) === ansNorm.charAt(0)) key -= 1.5
      // Слова с тем же окончанием обычно той же формы (падеж, число), поэтому звучат в тексте естественнее
      if (difficulty >= 2) key -= Math.min(2, sharedSuffix(k, ansNorm)) * 0.8
      return { v, key: key + rng() * 1.5 }
    })
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map((x) => matchCase(x.v, answer))
}

// ---------- Порядок блоков ----------

/**
 * Число блоков зависит от длины текста: wordsPer — сколько слов в среднем приходится на блок,
 * min/max ограничивают результат. Для ~120 слов (10 средних предложений) получается ≈8 / 13 / 20 блоков.
 */
const BLOCK_RULES: Record<Difficulty, { wordsPer: number; min: number; max: number }> = {
  1: { wordsPer: 16, min: 4, max: 8 },
  2: { wordsPer: 9, min: 6, max: 14 },
  3: { wordsPer: 6, min: 10, max: 24 },
}

export function blockTarget(wordCount: number, difficulty: Difficulty): number {
  const r = BLOCK_RULES[difficulty]
  return Math.max(r.min, Math.min(r.max, Math.round(wordCount / r.wordsPer)))
}

const STRONG_END = /[.!?…][»"')\]]*$/
const WEAK_END = /[,;:—–][»"')\]]*$/

/** Где разрезать строку из слов: у знака препинания рядом с серединой (конец предложения лучше запятой) */
export function splitPoint(words: string[]): number {
  const mid = words.length / 2
  let best = -1
  let bestCost = Infinity
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1]
    const strong = STRONG_END.test(prev)
    if (!strong && !WEAK_END.test(prev)) continue
    if (i < words.length * 0.3 || i > words.length * 0.7) continue
    const cost = Math.abs(i - mid) + (strong ? 0 : words.length * 0.1)
    if (cost < bestCost) { best = i; bestCost = cost }
  }
  return best === -1 ? Math.ceil(mid) : best
}

/** Делит текст на блоки в правильном порядке. Строки внутри блока разделены \n. */
export function buildBlocks(content: string, difficulty: Difficulty): string[] {
  const lines = parseLines(content).map((l) => l.words)
  const wordCount = lines.reduce((n, l) => n + l.length, 0)
  const target = blockTarget(wordCount, difficulty)

  if (lines.length >= target) {
    const blocks: string[] = []
    for (let i = 0; i < target; i++) {
      const start = Math.floor((i * lines.length) / target)
      const end = Math.floor(((i + 1) * lines.length) / target)
      blocks.push(lines.slice(start, end).map((l) => l.join(' ')).join('\n'))
    }
    return blocks
  }

  // Строк мало — режем самые длинные, пока не наберём нужное число блоков
  const units = lines.map((l) => [...l])
  while (units.length < target) {
    let longest = 0
    units.forEach((u, i) => { if (u.length > units[longest].length) longest = i })
    if (units[longest].length < 2) break
    const u = units[longest]
    const at = splitPoint(u)
    units.splice(longest, 1, u.slice(0, at), u.slice(at))
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

// ---------- Строки и ввод слов ----------

/** Собирает плоский список слов из строк (каждая строка — массив слов) */
export function fromLines(lines: string[][]): FlatWord[] {
  const out: FlatWord[] = []
  lines.forEach((line, li) =>
    line.forEach((w, wi) => out.push({ ...splitToken(w), newLine: wi === 0 && li > 0, blankBefore: false })),
  )
  return out
}

export interface LineSpan {
  start: number
  /** Индекс после последнего слова строки */
  end: number
  blankBefore: boolean
}

/** Группирует плоский список слов по строкам */
export function groupLines(words: FlatWord[]): LineSpan[] {
  const spans: LineSpan[] = []
  words.forEach((w, i) => {
    if (i === 0 || w.newLine) spans.push({ start: i, end: i + 1, blankBefore: w.blankBefore })
    else spans[spans.length - 1].end = i + 1
  })
  return spans
}

/**
 * Строки для упражнений «Продолжи строку» и «Допиши конец».
 * Если в тексте меньше 4 строк (например, проза одним абзацем), режем его на «строки» по знакам препинания.
 */
export function toLines(content: string): string[][] {
  const lines = parseLines(content).map((l) => [...l.words])
  if (lines.length >= 4) return lines
  const wordCount = lines.reduce((n, l) => n + l.length, 0)
  const want = Math.min(Math.floor(wordCount / 2), Math.max(4, Math.round(wordCount / 8)))
  while (lines.length < want) {
    let longest = 0
    lines.forEach((l, i) => { if (l.length > lines[longest].length) longest = i })
    if (lines[longest].length < 2) break
    const l = lines[longest]
    const at = splitPoint(l)
    lines.splice(longest, 1, l.slice(0, at), l.slice(at))
  }
  return lines
}

export type TypedVerdict = 'wait' | 'ok' | 'bad'

/**
 * Решает, что делать с набранным словом.
 * ok/bad — слово засчитывается (верно/неверно), wait — продолжаем ввод.
 * Слово засчитывается: при точном совпадении, по пробелу, или когда набрано столько же букв, сколько в слове.
 */
export function judgeTyped(typed: string, core: string): TypedVerdict {
  const ends = /\s$/.test(typed)
  const raw = typed.trim()
  if (raw === '') return 'wait'
  // Знаки препинания по краям, если пользователь их всё же набрал, не считаются ошибкой
  const t = splitToken(raw).core || raw
  if (normalize(t) === normalize(core)) return 'ok'
  if (ends || [...t].length >= [...core].length) return 'bad'
  return 'wait'
}

// ---------- Частично скрытый текст ----------

/** Какая доля слов затрагивается / сколько из них скрыто целиком / какая доля букв скрыта в остальных */
const P_TOUCH: Record<Difficulty, number> = { 1: 0.4, 2: 0.7, 3: 0.9 }
const P_FULL: Record<Difficulty, number> = { 1: 0.1, 2: 0.3, 3: 0.5 }
const HIDE_FRAC: Record<Difficulty, number> = { 1: 0.4, 2: 0.5, 3: 0.65 }

/**
 * Для каждого слова возвращает его вид со скрытыми буквами («сл__о») или null, если слово показывается целиком.
 * Знаки препинания по краям не входят в core и остаются как есть.
 */
export function buildPartialMask(words: FlatWord[], difficulty: Difficulty, rng: Rng = Math.random): (string | null)[] {
  return words.map((w) => {
    const chars = [...w.core]
    const idx = chars.map((c, i) => (/[\p{L}\p{N}]/u.test(c) ? i : -1)).filter((i) => i >= 0)
    if (idx.length === 0) return null
    if (rng() >= P_TOUCH[difficulty]) return null

    const hide = new Set<number>()
    if (idx.length <= 2) {
      if (rng() >= 0.5) return null
      idx.forEach((i) => hide.add(i))
    } else if (rng() < P_FULL[difficulty]) {
      idx.forEach((i) => hide.add(i))
    } else {
      const inner = idx.slice(1) // первая буква остаётся
      inner.forEach((i) => { if (rng() < HIDE_FRAC[difficulty]) hide.add(i) })
      if (hide.size === 0) hide.add(inner[Math.floor(rng() * inner.length)])
    }
    return chars.map((c, i) => (hide.has(i) ? '_' : c)).join('')
  })
}

// ---------- Продолжи строку ----------

export interface NextLineTask {
  /** Показываемая строка */
  cue: string[]
  /** Строки, которые нужно ввести (на тяжёлом уровне — две) */
  answer: string[][]
  /** Сколько первых слов ответа уже подставлено */
  givenCount: number
}

const NEXT_TASKS: Record<Difficulty, number> = { 1: 3, 2: 5, 3: 6 }

export function buildNextLineTasks(lines: string[][], difficulty: Difficulty, rng: Rng = Math.random): NextLineTask[] {
  const need = Math.min(difficulty === 3 ? 2 : 1, lines.length - 1)
  if (need < 1) return []
  const anchors = Array.from({ length: lines.length - need }, (_, i) => i)
  return shuffle(anchors, rng)
    .slice(0, NEXT_TASKS[difficulty])
    .sort((a, b) => a - b)
    .map((a) => ({
      cue: lines[a],
      answer: lines.slice(a + 1, a + 1 + need),
      givenCount: difficulty === 1 ? 1 : 0,
    }))
}

// ---------- Допиши конец строки ----------

/** Какая часть строки показана / какая доля строк «обрезана» */
const END_SHOWN: Record<Difficulty, number> = { 1: 0.6, 2: 0.5, 3: 0.35 }
const END_LINES: Record<Difficulty, number> = { 1: 0.5, 2: 0.75, 3: 1 }

export function buildLineEnding(
  lines: string[][],
  difficulty: Difficulty,
  rng: Rng = Math.random,
): { words: FlatWord[]; given: boolean[] } {
  const words = fromLines(lines)
  const given = words.map(() => true)
  const eligible = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.length >= 2)
  const count = Math.min(eligible.length, Math.max(1, Math.round(eligible.length * END_LINES[difficulty])))
  const chosen = new Set(shuffle(eligible, rng).slice(0, count).map((x) => x.i))

  let offset = 0
  lines.forEach((l, i) => {
    if (chosen.has(i)) {
      const shown = Math.min(l.length - 1, Math.max(1, Math.round(l.length * END_SHOWN[difficulty])))
      for (let k = shown; k < l.length; k++) given[offset + k] = false
    }
    offset += l.length
  })
  return { words, given }
}

// ---------- Найди ошибку ----------

export interface PlantedError {
  wordIndex: number
  /** Правильное слово */
  original: string
  /** Слово, которое подставили вместо него */
  fake: string
  /** Варианты исправления (среди них original) */
  options: string[]
}

const ERR_RATIO: Record<Difficulty, number> = { 1: 0.04, 2: 0.07, 3: 0.1 }
const ERR_MIN: Record<Difficulty, number> = { 1: 3, 2: 4, 3: 5 }
const ERR_MAX: Record<Difficulty, number> = { 1: 6, 2: 10, 3: 14 }

export function buildErrors(words: FlatWord[], difficulty: Difficulty, rng: Rng = Math.random): PlantedError[] {
  const candidates = words.map((w, i) => ({ w, i })).filter(({ w }) => w.core.length >= 3)
  const want = Math.min(
    ERR_MAX[difficulty],
    Math.max(ERR_MIN[difficulty], Math.round(words.length * ERR_RATIO[difficulty])),
  )

  const result: PlantedError[] = []
  for (const { w, i } of shuffle(candidates, rng)) {
    if (result.length >= want) break
    if (result.some((e) => Math.abs(e.wordIndex - i) <= 1)) continue
    const list = pickDistractors(words, w.core, OPTIONS_COUNT[difficulty], difficulty, rng)
    if (list.length < 2) continue
    const [fake, ...rest] = list
    result.push({ wordIndex: i, original: w.core, fake, options: shuffle([w.core, ...rest], rng) })
  }
  return result.sort((a, b) => a.wordIndex - b.wordIndex)
}

/**
 * Делит текст на указанное число частей примерно равной длины, предпочитая границы по знакам препинания.
 * Если слов не больше, чем частей, каждое слово становится отдельной частью.
 */
export function splitIntoPieces(text: string, pieces: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= pieces) return words
  const units = [words]
  while (units.length < pieces) {
    let longest = 0
    units.forEach((u, i) => { if (u.length > units[longest].length) longest = i })
    if (units[longest].length < 2) break
    const u = units[longest]
    const at = splitPoint(u)
    units.splice(longest, 1, u.slice(0, at), u.slice(at))
  }
  return units.map((u) => u.join(' '))
}
