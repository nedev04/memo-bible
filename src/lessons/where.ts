import { BOOKS, bookOrder, getBook } from '../bible/books'
import { shuffle, type Rng } from '../logic/exercises'

export interface Choice {
  value: string
  label: string
}

export interface WhereQuestion {
  /** Что спрашивается: «Книга», «Глава», «Стих» */
  field: 'book' | 'chapter' | 'verse'
  title: string
  answer: string
  options: Choice[]
}

/** Числа рядом с правильным (глава или стих), по возрастанию */
export function nearNumbers(correct: number, max: number, count: number, rng: Rng = Math.random): number[] {
  const candidates = Array.from({ length: max }, (_, i) => i + 1)
    .filter((n) => n !== correct)
    .map((n) => ({ n, key: Math.abs(n - correct) + rng() * 2 }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count - 1)
    .map((x) => x.n)
  return [...candidates, correct].sort((a, b) => a - b)
}

/** Книги для вариантов: две из того же завета и одна из другого, в порядке Библии */
export function nearBooks(correctId: string, rng: Rng = Math.random): Choice[] {
  const meta = getBook(correctId)
  if (!meta) return []
  const same = shuffle(BOOKS.filter((b) => b.testament === meta.testament && b.id !== correctId), rng).slice(0, 2)
  const other = shuffle(BOOKS.filter((b) => b.testament !== meta.testament), rng).slice(0, 1)
  return [meta, ...same, ...other]
    .sort((a, b) => bookOrder(a.id) - bookOrder(b.id))
    .map((b) => ({ value: b.id, label: b.name }))
}

/**
 * Вопросы «где написано» для стиха. levels: 1 — только книга, 2 — книга и глава, 3 — ещё и стих.
 * Вопрос про главу или стих пропускается, если выбирать не из чего (в книге одна глава, в главе один стих).
 */
export function buildWhereQuestions(
  v: { book: string; chapter: number; verse: number; bookChapters: number; chapterVerses: number },
  levels: 1 | 2 | 3,
  rng: Rng = Math.random,
): WhereQuestion[] {
  const out: WhereQuestion[] = [
    { field: 'book', title: 'В какой книге написан этот стих?', answer: v.book, options: nearBooks(v.book, rng) },
  ]
  const name = getBook(v.book)?.name ?? v.book
  if (levels >= 2 && v.bookChapters > 1) {
    out.push({
      field: 'chapter',
      title: `В какой главе книги «${name}»?`,
      answer: String(v.chapter),
      options: nearNumbers(v.chapter, v.bookChapters, 5, rng).map((n) => ({ value: String(n), label: String(n) })),
    })
  }
  if (levels >= 3 && v.chapterVerses > 1) {
    out.push({
      field: 'verse',
      title: `Какой это стих главы ${v.chapter}?`,
      answer: String(v.verse),
      options: nearNumbers(v.verse, v.chapterVerses, 5, rng).map((n) => ({ value: String(n), label: String(n) })),
    })
  }
  return out
}
