import type { Attempt, ExerciseId, TextItem } from '../types'
import { EXERCISES, MAX_LEVEL } from './config'

/** Номер календарного дня по местному времени (устойчив к переходу на летнее время) */
export function dayNumber(t: number): number {
  const d = new Date(t)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
}

export interface DayStat {
  /** Номер дня (см. dayNumber) */
  day: number
  /** Подпись под столбиком: число месяца */
  label: string
  /** Полная дата для подсказки */
  title: string
  points: number
  count: number
}

/** Очки и число упражнений за последние `days` дней, включая сегодня; от старых к новым */
export function dailyStats(attempts: Attempt[], now: number, days: number): DayStat[] {
  const today = dayNumber(now)
  const map = new Map<number, { points: number; count: number }>()
  for (const a of attempts) {
    const d = dayNumber(a.createdAt)
    const cur = map.get(d) ?? { points: 0, count: 0 }
    cur.points += a.points
    cur.count += 1
    map.set(d, cur)
  }
  const result: DayStat[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i
    const date = new Date(day * 86400000 + 12 * 3600000) // полдень UTC — дата не «съезжает»
    const s = map.get(day) ?? { points: 0, count: 0 }
    result.push({
      day,
      label: String(date.getUTCDate()),
      title: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }),
      ...s,
    })
  }
  return result
}

/**
 * Серия дней подряд с занятиями.
 * current — серия, которая ещё не прервалась: если сегодня занятий не было, но вчера были, серия продолжается.
 */
export function streaks(attempts: Attempt[], now: number): { current: number; best: number } {
  const days = [...new Set(attempts.map((a) => dayNumber(a.createdAt)))].sort((a, b) => a - b)
  if (days.length === 0) return { current: 0, best: 0 }

  let best = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = days[i] - days[i - 1] === 1 ? run + 1 : 1
    best = Math.max(best, run)
  }

  const set = new Set(days)
  const today = dayNumber(now)
  let d = set.has(today) ? today : today - 1
  let current = 0
  while (set.has(d)) {
    current++
    d--
  }
  return { current, best }
}

/** Сколько текстов на каждом уровне: индекс 0 — уровень 1 */
export function levelDistribution(texts: TextItem[]): number[] {
  const counts = Array.from({ length: MAX_LEVEL }, () => 0)
  for (const t of texts) counts[Math.min(MAX_LEVEL, Math.max(1, t.level)) - 1]++
  return counts
}

export interface ExerciseStat {
  exercise: ExerciseId
  count: number
  avgScore: number
}

export function exerciseStats(attempts: Attempt[]): ExerciseStat[] {
  const map = new Map<ExerciseId, { sum: number; count: number }>()
  for (const a of attempts) {
    const cur = map.get(a.exercise) ?? { sum: 0, count: 0 }
    cur.sum += a.score
    cur.count += 1
    map.set(a.exercise, cur)
  }
  return [...map.entries()]
    .map(([exercise, { sum, count }]) => ({ exercise, count, avgScore: Math.round(sum / count) }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Средняя точность в упражнениях на запоминание и проверку (группы 2 и 3) за период [from, to).
 * Упражнения группы 1 не считаем: там нет ошибок, они всегда дают 100%.
 */
export function memoryAccuracy(attempts: Attempt[], from: number, to: number): number | null {
  const list = attempts.filter((a) => a.createdAt >= from && a.createdAt < to && EXERCISES[a.exercise].group >= 2)
  if (list.length === 0) return null
  return Math.round(list.reduce((n, a) => n + a.score, 0) / list.length)
}
