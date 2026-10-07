import { compareVerses } from '../bible/refs'
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

/** Простой урок: новые стихи (знакомство → пропуски), затем повторение (скрытый текст → пропуски) */
export function planLesson(verses: VerseState[], now: number): LessonStep[] {
  const picked = pickVerses(verses, now)
  const steps: LessonStep[] = []
  let n = 0
  const add = (kind: LessonStep['kind'], v: VerseState, settings: StepSettings) =>
    steps.push({ id: `${kind}:${v.key}:${n++}`, kind, verseKeys: [v.key], settings })

  for (const v of picked.filter((x) => x.strength === 0)) {
    add('reveal', v, { chunk: 2 })
    add('partial', v, partialSettings(0))
    add('fillGaps', v, gapSettings(0))
  }
  for (const v of picked.filter((x) => x.strength > 0)) {
    add('partial', v, partialSettings(v.strength))
    add('fillGaps', v, gapSettings(v.strength))
  }
  return steps
}
