import { compareVerses } from '../bible/refs'
import { shuffle, type Rng } from '../logic/exercises'
import { isDue, needsAttention } from '../logic/mastery'
import type { VerseState } from '../types'
import type { LessonStep, StepSettings } from './types'

const MAX_VERSES = 4
const MAX_NEW = 2

const ref = (v: VerseState) => ({ book: v.book, chapter: v.chapter, verse: v.verse })

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

/**
 * Выбирает стихи для урока: до двух новых (в порядке Библии), затем те, что пора повторять
 * или где недавно была ошибка. Если набралось мало, добавляются самые слабые из остальных.
 */
export function pickVerses(verses: VerseState[], now: number): VerseState[] {
  const fresh = verses.filter((v) => v.strength === 0).sort((a, b) => compareVerses(ref(a), ref(b)))
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

/** Подряд идущие стихи после данного (не больше трёх), которые тоже учатся и уже не новые */
export function followingVerses(v: VerseState, all: VerseState[]): VerseState[] {
  const same = new Map(all.filter((x) => x.book === v.book && x.chapter === v.chapter && x.strength >= 1).map((x) => [x.verse, x]))
  const out: VerseState[] = []
  for (let n = v.verse + 1; out.length < 3 && same.has(n); n++) out.push(same.get(n)!)
  return out
}

type Candidate = Pick<LessonStep, 'kind' | 'settings' | 'verseKeys'>

/**
 * Упражнения для одного стиха, который уже учится: «главное» (его сложность достаточна для роста силы)
 * и одно дополнительное на выбор. Главное идёт последним.
 */
function reviewSteps(v: VerseState, all: VerseState[], rng: Rng): Candidate[] {
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
  return [shuffle(others, rng)[0], gate]
}

/**
 * Простой урок: новые стихи (открытие → скрытый текст → пропуски), затем повторение.
 * all — все стихи пользователя (нужны, чтобы найти стихи подряд для «Расставьте части»).
 */
export function planLesson(verses: VerseState[], now: number, rng: Rng = Math.random): LessonStep[] {
  const picked = pickVerses(verses, now)
  const steps: LessonStep[] = []
  let n = 0
  const add = (c: Candidate) => steps.push({ id: `${c.kind}:${c.verseKeys.join('+')}:${n++}`, ...c })

  for (const v of picked.filter((x) => x.strength === 0)) {
    add({ kind: 'reveal', verseKeys: [v.key], settings: { chunk: 2 } })
    add({ kind: 'partial', verseKeys: [v.key], settings: partialSettings(0) })
    add({ kind: 'fillGaps', verseKeys: [v.key], settings: gapSettings(0) })
  }
  for (const v of picked.filter((x) => x.strength > 0)) {
    for (const c of reviewSteps(v, verses, rng)) add(c)
  }
  return steps
}
