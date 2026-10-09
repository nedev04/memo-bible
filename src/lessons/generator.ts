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

// ---------- Какие уроки бывают ----------

/** Порядок типов уроков на пути (по номеру урока): два обычных, закрепление, обычный, тест */
const PATTERN: LessonType[] = ['regular', 'regular', 'review', 'regular', 'test']

/** Какой тип урока «по плану» стоит на этом месте пути (index — сколько уроков уже пройдено или пропущено) */
export const patternType = (index: number): LessonType => PATTERN[index % PATTERN.length]

export function availableTypes(all: VerseState[]): Record<LessonType, boolean> {
  return {
    regular: all.length > 0,
    review: all.some((v) => v.strength >= 1),
    test: all.some((v) => v.strength >= 3),
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
 * Обычный урок: до двух новых стихов (в порядке Библии), затем те, что пора повторять или где была ошибка.
 * Если набралось мало, добавляются самые слабые из остальных.
 */
export function pickVerses(verses: VerseState[], now: number): VerseState[] {
  const fresh = verses.filter((v) => v.strength === 0).sort(byBible)
  const review = verses
    .filter((v) => v.strength >= 1 && (isDue(v, now) || needsAttention(v)))
    .sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || a.nextReviewAt - b.nextReviewAt)

  const list = [...fresh.slice(0, MAX_NEW), ...review].slice(0, MAX_VERSES)
  if (list.length < 3) {
    const taken = new Set(list.map((v) => v.key))
    const rest = verses
      .filter((v) => !taken.has(v.key))
      .sort((a, b) => a.strength - b.strength || (a.lastPracticedAt ?? 0) - (b.lastPracticedAt ?? 0))
    list.push(...rest.slice(0, 3 - list.length))
  }
  return list
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

export function pickReviewVerses(verses: VerseState[], now: number, rng: Rng = Math.random): VerseState[] {
  const pool = verses.filter((v) => v.strength >= 1)
  return weightedSample(pool, (v) => reviewWeight(v, now), Math.min(MAX_VERSES, pool.length), rng)
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

/**
 * Упражнения для одного стиха, который уже учится: дополнительные и «главное»
 * (его сложности достаточно для роста силы). Главное идёт последним.
 * Если стиху подошёл срок повторения, дополнительных упражнений два вместо одного: в этот день он встречается чаще.
 */
function reviewSteps(v: VerseState, all: VerseState[], rng: Rng, now: number): Candidate[] {
  const s = v.strength
  const own = [v.key]
  const run = followingVerses(v, all)
  const parts: Candidate | null = run.length > 0 ? { kind: 'orderParts', settings: {}, verseKeys: [v.key, ...run.map((x) => x.key)] } : null
  const c = (kind: LessonStep['kind'], settings: StepSettings): Candidate => ({ kind, settings, verseKeys: own })

  let gate: Candidate
  let others: Candidate[]
  if (s <= 1) {
    gate = c('fillGaps', gapSettings(s))
    others = [c('partial', partialSettings(s)), c('whereWritten', { levels: 1 })]
  } else if (s === 2) {
    gate = c('assemble', { pieces: 6 })
    others = [c('fillGaps', gapSettings(s)), c('partial', partialSettings(s))]
  } else if (s === 3) {
    gate = parts ?? c('assemble', { pieces: 9 })
    others = [c('whereWritten', { levels: 2 }), c('fillGaps', gapSettings(s))]
  } else if (s === 4) {
    gate = parts ?? c('assemble', { pieces: 12 })
    others = [c('fillGaps', gapSettings(s)), c('whereWritten', { levels: 3 })]
  } else {
    gate = c('fillGaps', gapSettings(s))
    others = [c('whereWritten', { levels: 3 }), c('assemble', { pieces: 14 })]
  }
  return [...shuffle(others, rng).slice(0, isDue(v, now) ? 2 : 1), gate]
}

function toSteps(candidates: Candidate[]): LessonStep[] {
  return candidates.map((c, n) => ({ id: `${c.kind}:${c.verseKeys.join('+')}:${n}`, ...c }))
}

// ---------- Планы уроков ----------

const restrict = (all: VerseState[], only?: Set<string>) => (only ? all.filter((v) => only.has(v.key)) : all)

/** Несложные упражнения для только что изученного стиха (порядок свободный) */
function easyPractice(v: VerseState, rng: Rng): Candidate[] {
  const own = [v.key]
  const pool: Candidate[] = [
    { kind: 'fillGaps', verseKeys: own, settings: { blanks: 1, options: 3 } },
    { kind: 'fillGaps', verseKeys: own, settings: { blanks: 2, options: 3 } },
    { kind: 'assemble', verseKeys: own, settings: { pieces: 4 } },
    { kind: 'whereWritten', verseKeys: own, settings: { levels: 1 } },
  ]
  return shuffle(pool, rng).slice(0, 3)
}

/**
 * Обычный урок. Новые стихи: сначала знакомство (открытие, скрытый текст), затем несколько несложных упражнений
 * вперемешку по всем новым стихам. Затем повторение стихов, которые уже учатся.
 */
export function planRegular(all: VerseState[], now: number, rng: Rng = Math.random, only?: Set<string>): LessonStep[] {
  const picked = only ? restrict(all, only).sort(byBible).slice(0, MAX_VERSES) : pickVerses(all, now)
  const fresh = picked.filter((x) => x.strength === 0)
  const out: Candidate[] = []
  for (const v of fresh) {
    out.push({ kind: 'reveal', verseKeys: [v.key], settings: { chunk: 2 } })
    out.push({ kind: 'partial', verseKeys: [v.key], settings: partialSettings(0) })
  }
  out.push(...shuffle(fresh.flatMap((v) => easyPractice(v, rng)), rng))
  for (const v of picked.filter((x) => x.strength > 0)) out.push(...reviewSteps(v, all, rng, now))
  return toSteps(out)
}

/** Урок закрепления: только уже начатые стихи, без нового материала */
export function planReview(all: VerseState[], now: number, rng: Rng = Math.random, only?: Set<string>): LessonStep[] {
  const pool = all.filter((v) => v.strength >= 1)
  const picked = only ? restrict(pool, only).sort(byBible).slice(0, MAX_VERSES) : pickReviewVerses(all, now, rng)
  return toSteps(picked.flatMap((v) => reviewSteps(v, all, rng, now)))
}

/**
 * Тестовый урок: одно большое задание, ввод по памяти. Берётся стих, который уже выучен достаточно хорошо
 * (сила не ниже 3), а если рядом учатся соседние такие же стихи, то до трёх стихов подряд.
 */
export function planTest(all: VerseState[], now: number, rng: Rng = Math.random, only?: Set<string>): LessonStep[] {
  const pool = restrict(all, only).filter((v) => v.strength >= 3)
  if (pool.length === 0) return []

  let keys: string[]
  if (only) {
    keys = pool.sort(byBible).slice(0, 3).map((v) => v.key)
  } else {
    const anchor = weightedSample(
      pool,
      (v) => 1 + (isDue(v, now) ? 3 : 0) + (needsAttention(v) ? 2 : 0) + 0.5 * v.strength,
      1,
      rng,
    )[0]
    const run: VerseState[] = []
    for (const next of followingVerses(anchor, all)) {
      if (next.strength < 3 || run.length >= 2) break
      run.push(next)
    }
    keys = [anchor, ...run].map((v) => v.key)
  }
  return [{ id: `typing:${keys.join('+')}:0`, kind: 'typing', verseKeys: keys, settings: {} }]
}

export function planOfType(
  type: LessonType,
  all: VerseState[],
  now: number,
  rng: Rng = Math.random,
  only?: Set<string>,
): LessonStep[] {
  if (type === 'review') return planReview(all, now, rng, only)
  if (type === 'test') return planTest(all, now, rng, only)
  return planRegular(all, now, rng, only)
}

/** Прежнее название: обычный урок */
export const planLesson = planRegular
