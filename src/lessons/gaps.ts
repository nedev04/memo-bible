import { firstChar, pickDistractors, shuffle, type FlatWord, type Rng } from '../logic/exercises'

export interface VerseGap {
  wordIndex: number
  answer: string
  /** Варианты в случайном порядке, среди них правильный */
  options: string[]
}

/**
 * Пропуски в стихе. Неверные варианты берутся из слов всей главы (pool) и подбираются так,
 * чтобы по длине и окончанию они были похожи на правильное слово.
 */
export function buildVerseGaps(
  words: FlatWord[],
  pool: FlatWord[],
  blanks: number,
  optionCount: number,
  rng: Rng = Math.random,
): VerseGap[] {
  let candidates = words.map((w, i) => ({ w, i })).filter(({ w }) => w.core.length >= 3)
  if (candidates.length === 0) candidates = words.map((w, i) => ({ w, i })).filter(({ w }) => firstChar(w) !== null)

  const chosen: number[] = []
  for (const { i } of shuffle(candidates, rng)) {
    if (chosen.length >= blanks) break
    if (chosen.some((c) => Math.abs(c - i) === 1)) continue // пропуски не стоят рядом
    chosen.push(i)
  }
  chosen.sort((a, b) => a - b)

  const gaps: VerseGap[] = []
  for (const wordIndex of chosen) {
    const answer = words[wordIndex].core
    const wrong = pickDistractors(pool, answer, optionCount - 1, 2, rng)
    if (wrong.length === 0) continue // не из чего выбирать
    gaps.push({ wordIndex, answer, options: shuffle([answer, ...wrong], rng) })
  }
  return gaps
}
