import { bookOrder } from '../bible/books'
import { compareVerses } from '../bible/refs'
import { shuffle, type Rng } from '../logic/exercises'
import { isDue, needsAttention } from '../logic/mastery'
import type { LessonType, VerseState } from '../types'
import type { LessonStep, StepSettings } from './types'

const MAX_VERSES = 4
const MAX_NEW = 2
const DAY = 24 * 60 * 60 * 1000

const ref = (v: VerseState) => ({ book: v.book, chapter: v.chapter, verse: v.verse })
const byBible = (a: VerseState, b: VerseState) => compareVerses(ref(a), ref(b))

/**
 * «Расстояние» между стихами в Библии: в одной главе — разница номеров стихов,
 * в одной книге — от 100, в разных книгах — от 1000. Нужно, чтобы в урок попадали стихи по соседству.
 */
export function distance(a: VerseState, b: VerseState): number {
  if (a.book !== b.book) return 1000 + Math.abs(bookOrder(a.book) - bookOrder(b.book))
  if (a.chapter !== b.chapter) return 100 + Math.abs(a.chapter - b.chapter)
  return Math.abs(a.verse - b.verse)
}

/** Контекст планирования: что уже спрашивали недавно (чтобы не надоедать однотипными вопросами) */
export interface PlanContext {
  /** Книги последних вопросов «где написано», самые свежие первыми */
  recentWhere: string[]
}

/**
 * Пропустить ли вопрос «где написано» для стиха из этой книги. Если подряд несколько раз ответом была та же книга,
 * вопрос бессмыслен (ответ всегда один), поэтому его всё реже предлагают, пока не сменится книга.
 */
export function shouldSkipWhere(book: string, recent: string[], rng: Rng = Math.random): boolean {
  let n = 0
  while (n < recent.length && recent[n] === book) n++
  if (n >= 3) return true
  if (n === 2) return rng() < 0.7
  if (n === 1) return rng() < 0.4
  return false
}

/** Настройки «частично скрытого текста»: чем сильнее стих, тем больше скрыто */
export function partialSettings(strength: number): StepSettings {
  return { wordPct: Math.min(50, 10 + 8 * strength), letterPct: Math.min(100, 20 + 15 * strength) }
}

/** Настройки выбора пропущенных слов: чем сильнее стих, тем больше пропусков и вариантов */
export function gapSettings(strength: number): StepSettings {
  if (strength <= 2) return { blanks: 1, options: 3 }
  if (strength <= 4) return { blanks: 2, options: 4 }
  return { blanks: 3, options: 5 }
}

/** Ввод по памяти: чем сильнее стих, тем меньше слов подсказано. С силы 4 — чистый лист. */
export function typingVisiblePct(strength: number): number {
  if (strength <= 2) return 60
  if (strength === 3) return 35
  return 0
}

// ---------- Какие уроки бывают ----------

/** Порядок типов уроков на пути (по номеру урока): два обычных, закрепление, обычный, тест */
const PATTERN: LessonType[] = ['regular', 'regular', 'review', 'regular', 'test']

/** Какой тип урока «по плану» стоит на этом месте пути (index — сколько уроков уже пройдено или пропущено) */
export const patternType = (index: number): LessonType => PATTERN[index % PATTERN.length]

/** Для теста нужны стихи, которые уже можно вводить по памяти хотя бы с подсказками */
export const TEST_MIN_STRENGTH = 2

export function availableTypes(all: VerseState[]): Record<LessonType, boolean> {
  return {
    regular: all.length > 0,
    review: all.some((v) => v.strength >= 1),
    test: all.some((v) => v.strength >= TEST_MIN_STRENGTH),
  }
}

/**
 * Тип урока с учётом того, что реально можно провести сейчас.
 * Обычный урок без нового материала и без стихов к повторению превращается в закрепление;
 * тест без достаточно выученных стихов — в закрепление или обычный урок. null — стихов нет совсем.
 */
export function resolveType(preferred: LessonType, all: VerseState[], now: number): LessonType | null {
  if (all.length === 0) return null
  const can = availableTypes(all)
  if (preferred === 'regular') {
    const hasWork = all.some((v) => v.strength === 0 || isDue(v, now) || needsAttention(v))
    return hasWork || !can.review ? 'regular' : 'review'
  }
  if (preferred === 'review') return can.review ? 'review' : 'regular'
  return can.test ? 'test' : can.review ? 'review' : 'regular'
}

// ---------- Подбор стихов ----------

/** Случайная выборка без возвращения: чем больше вес, тем вероятнее попасть в урок */
export function weightedSample<T>(items: T[], weight: (t: T) => number, k: number, rng: Rng = Math.random): T[] {
  const pool = items.map((t) => ({ t, w: Math.max(0, weight(t)) }))
  const out: T[] = []
  while (out.length < k && pool.length > 0) {
    const total = pool.reduce((n, p) => n + p.w, 0)
    if (total <= 0) {
      out.push(pool.shift()!.t)
      continue
    }
    let r = rng() * total
    let i = 0
    for (; i < pool.length; i++) {
      r -= pool[i].w
      if (r <= 0) break
    }
    out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0].t)
  }
  return out
}

/**
 * Обычный урок. Новые стихи вводятся строго по порядку Библии (до двух за урок), чтобы длинный отрывок
 * разучивался с начала. Остальные места занимают стихи по соседству с ними, которым пора повторяться
 * или где была ошибка; если таких мало, добавляются ближайшие по тексту. Результат отсортирован как в Библии.
 */
export function pickVerses(verses: VerseState[], now: number): VerseState[] {
  const newOnes = verses.filter((v) => v.strength === 0).sort(byBible).slice(0, MAX_NEW)
  const urgent = verses
    .filter((v) => v.strength >= 1 && (isDue(v, now) || needsAttention(v)))
    .sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || a.nextReviewAt - b.nextReviewAt)

  const anchor = newOnes[0] ?? urgent[0]
  const taken = new Set(newOnes.map((v) => v.key))
  const list = [...newOnes]
  if (anchor) {
    const near = urgent
      .filter((v) => !taken.has(v.key))
      .sort((a, b) => distance(anchor, a) - distance(anchor, b))
    for (const v of near) {
      if (list.length >= MAX_VERSES) break
      list.push(v)
      taken.add(v.key)
    }
  }

  // Если набралось мало, добавляем ближайшие по тексту уже начатые стихи (новые сверх лимита не вводим)
  if (list.length < 3) {
    const started = verses.filter((v) => v.strength >= 1 && !taken.has(v.key))
    const center =
      anchor ?? [...started].sort((a, b) => a.strength - b.strength || (a.lastPracticedAt ?? 0) - (b.lastPracticedAt ?? 0))[0]
    if (center) {
      started.sort((a, b) => distance(center, a) - distance(center, b) || a.strength - b.strength)
      list.push(...started.slice(0, 3 - list.length))
    }
  }
  return list.sort(byBible)
}

/**
 * Вес стиха для урока закрепления. Выше у стихов с недавней ошибкой, которые пора повторять,
 * которые недавно начали учить и которые слабее; твёрдо выученные, которым ещё не пора, попадаются редко.
 */
export function reviewWeight(v: VerseState, now: number): number {
  let w = 1
  if (needsAttention(v)) w += 4
  if (isDue(v, now)) w += 3
  if (now - v.addedAt < 7 * DAY) w += 2
  w += (6 - v.strength) * 0.6
  if (v.strength >= 5 && !isDue(v, now)) w *= 0.3
  return w
}

/**
 * Стихи для закрепления: сначала выбирается «опорный» (чем нужнее, тем вероятнее), затем остальные,
 * причём вероятность быстро падает с расстоянием до опорного. Так отрывок повторяется кусками, а не вразброс (но без жёстких рамок).
 */
export function pickReviewVerses(verses: VerseState[], now: number, rng: Rng = Math.random): VerseState[] {
  const pool = verses.filter((v) => v.strength >= 1)
  if (pool.length === 0) return []
  const anchor = weightedSample(pool, (v) => reviewWeight(v, now), 1, rng)[0]
  const others = weightedSample(
    pool.filter((v) => v.key !== anchor.key),
    (v) => reviewWeight(v, now) / Math.pow(1 + distance(anchor, v) / 3, 3),
    Math.min(MAX_VERSES, pool.length) - 1,
    rng,
  )
  return [anchor, ...others].sort(byBible)
}

/** Подряд идущие стихи после данного (не больше трёх), которые тоже учатся и уже не новые */
export function followingVerses(v: VerseState, all: VerseState[]): VerseState[] {
  const same = new Map(all.filter((x) => x.book === v.book && x.chapter === v.chapter && x.strength >= 1).map((x) => [x.verse, x]))
  const out: VerseState[] = []
  for (let n = v.verse + 1; out.length < 3 && same.has(n); n++) out.push(same.get(n)!)
  return out
}

// ---------- Упражнения для стиха ----------

type Candidate = Pick<LessonStep, 'kind' | 'settings' | 'verseKeys'>

const where = (v: VerseState, levels: 1 | 2 | 3): Candidate => ({ kind: 'whereWritten', verseKeys: [v.key], settings: { levels } })
const letters = (v: VerseState, hintLevel: 1 | 2 | 3): Candidate => ({ kind: 'firstLetters', verseKeys: [v.key], settings: { hintLevel } })

/**
 * Упражнения для одного стиха, который уже учится: дополнительные и «главное»
 * (его сложности достаточно для роста силы). Главное идёт последним.
 * Если стиху подошёл срок повторения, дополнительных упражнений два вместо одного: в этот день он встречается чаще.
 * Вопрос «где написано» пропускается, если несколько раз подряд ответом была та же книга.
 */
function reviewSteps(v: VerseState, all: VerseState[], rng: Rng, now: number, ctx: PlanContext): Candidate[] {
  const s = v.strength
  const own = [v.key]
  const run = followingVerses(v, all)
  const parts: Candidate | null = run.length > 0 ? { kind: 'orderParts', settings: {}, verseKeys: [v.key, ...run.map((x) => x.key)] } : null
  const c = (kind: LessonStep['kind'], settings: StepSettings): Candidate => ({ kind, settings, verseKeys: own })

  // gates — упражнения, сложности которых достаточно для роста силы; others — разминка и поддержка
  let gates: Candidate[]
  let others: Candidate[]
  if (s <= 1) {
    gates = [c('fillGaps', gapSettings(s))]
    others = [c('partial', partialSettings(s)), where(v, 1), letters(v, 1)]
  } else if (s === 2) {
    gates = [c('assemble', { pieces: 6 }), letters(v, 2)]
    others = [c('fillGaps', gapSettings(s)), c('partial', partialSettings(s)), letters(v, 1)]
  } else if (s === 3) {
    gates = [c('assemble', { pieces: 9 }), letters(v, 3), ...(parts ? [parts, parts] : [])]
    others = [where(v, 2), c('fillGaps', gapSettings(s)), letters(v, 2)]
  } else if (s === 4) {
    // дальше рост требует ввода по памяти с чистого листа (тестовый урок), здесь поддержка
    gates = [c('assemble', { pieces: 12 }), letters(v, 3), ...(parts ? [parts, parts] : [])]
    others = [c('fillGaps', gapSettings(s)), where(v, 3)]
  } else {
    gates = [c('fillGaps', gapSettings(s)), letters(v, 3)]
    others = [where(v, 3), c('assemble', { pieces: 14 })]
  }

  if (shouldSkipWhere(v.book, ctx.recentWhere, rng)) others = others.filter((o) => o.kind !== 'whereWritten')
  if (others.length === 0) others = [c('fillGaps', gapSettings(s))]

  const chosen = [...shuffle(others, rng).slice(0, isDue(v, now) ? 2 : 1), shuffle(gates, rng)[0]]
  if (chosen.some((x) => x.kind === 'whereWritten')) ctx.recentWhere.unshift(v.book)
  return chosen
}

function toSteps(candidates: Candidate[]): LessonStep[] {
  return candidates.map((c, n) => ({ id: `${c.kind}:${c.verseKeys.join('+')}:${n}`, ...c }))
}

// ---------- Планы уроков ----------

const restrict = (all: VerseState[], only?: Set<string>) => (only ? all.filter((v) => only.has(v.key)) : all)

/** Несложные упражнения для только что изученного стиха (порядок свободный) */
function easyPractice(v: VerseState, rng: Rng, ctx: PlanContext): Candidate[] {
  const own = [v.key]
  const pool: Candidate[] = [
    { kind: 'fillGaps', verseKeys: own, settings: { blanks: 1, options: 3 } },
    { kind: 'fillGaps', verseKeys: own, settings: { blanks: 2, options: 3 } },
    { kind: 'assemble', verseKeys: own, settings: { pieces: 4 } },
    letters(v, 1),
    ...(shouldSkipWhere(v.book, ctx.recentWhere, rng) ? [] : [where(v, 1)]),
  ]
  const chosen = shuffle(pool, rng).slice(0, 3)
  if (chosen.some((x) => x.kind === 'whereWritten')) ctx.recentWhere.unshift(v.book)
  return chosen
}

const newContext = (ctx?: PlanContext): PlanContext => ({ recentWhere: [...(ctx?.recentWhere ?? [])] })

/**
 * Обычный урок. Новые стихи: сначала знакомство (открытие, скрытый текст), затем несколько несложных упражнений
 * вперемешку по всем новым стихам. Затем повторение стихов, которые уже учатся (по порядку Библии).
 */
export function planRegular(
  all: VerseState[], now: number, rng: Rng = Math.random, only?: Set<string>, context?: PlanContext,
): LessonStep[] {
  const ctx = newContext(context)
  const picked = only ? restrict(all, only).sort(byBible).slice(0, MAX_VERSES) : pickVerses(all, now)
  const fresh = picked.filter((x) => x.strength === 0)
  const out: Candidate[] = []
  for (const v of fresh) {
    out.push({ kind: 'reveal', verseKeys: [v.key], settings: { chunk: 2 } })
    out.push({ kind: 'partial', verseKeys: [v.key], settings: partialSettings(0) })
  }
  out.push(...shuffle(fresh.flatMap((v) => easyPractice(v, rng, ctx)), rng))
  for (const v of picked.filter((x) => x.strength > 0)) out.push(...reviewSteps(v, all, rng, now, ctx))
  return toSteps(out)
}

/** Урок закрепления: только уже начатые стихи, без нового материала */
export function planReview(
  all: VerseState[], now: number, rng: Rng = Math.random, only?: Set<string>, context?: PlanContext,
): LessonStep[] {
  const ctx = newContext(context)
  const pool = all.filter((v) => v.strength >= 1)
  const picked = only ? restrict(pool, only).sort(byBible).slice(0, MAX_VERSES) : pickReviewVerses(all, now, rng)
  return toSteps(picked.flatMap((v) => reviewSteps(v, all, rng, now, ctx)))
}

/**
 * Тестовый урок: одно большое задание, ввод по памяти. Берётся стих, который уже можно вводить (сила не ниже 2),
 * а если рядом учатся соседние такие же стихи, то до трёх стихов подряд. Чем слабее стих, тем больше слов подсказано;
 * с силы 4 текст вводится с чистого листа.
 */
export function planTest(all: VerseState[], now: number, rng: Rng = Math.random, only?: Set<string>): LessonStep[] {
  const pool = restrict(all, only).filter((v) => v.strength >= TEST_MIN_STRENGTH)
  if (pool.length === 0) return []

  let chosen: VerseState[]
  if (only) {
    chosen = pool.sort(byBible).slice(0, 3)
  } else {
    const anchor = weightedSample(
      pool,
      (v) => 1 + (isDue(v, now) ? 3 : 0) + (needsAttention(v) ? 2 : 0) + 0.5 * v.strength,
      1,
      rng,
    )[0]
    const run: VerseState[] = []
    for (const next of followingVerses(anchor, all)) {
      if (next.strength < TEST_MIN_STRENGTH || run.length >= 2) break
      run.push(next)
    }
    chosen = [anchor, ...run]
  }

  const keys = chosen.map((v) => v.key)
  const weakest = Math.min(...chosen.map((v) => v.strength))
  return [{ id: `typing:${keys.join('+')}:0`, kind: 'typing', verseKeys: keys, settings: { visiblePct: typingVisiblePct(weakest) } }]
}

export function planOfType(
  type: LessonType,
  all: VerseState[],
  now: number,
  rng: Rng = Math.random,
  only?: Set<string>,
  context?: PlanContext,
): LessonStep[] {
  if (type === 'review') return planReview(all, now, rng, only, context)
  if (type === 'test') return planTest(all, now, rng, only)
  return planRegular(all, now, rng, only, context)
}

/** Прежнее название: обычный урок */
export const planLesson = planRegular
