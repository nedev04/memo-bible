import type { VerseState } from '../types'
import { BAD_SCORE, DAY, PARTIAL_SCORE, PASS_SCORE } from './config'
import { sameDay } from './progress'

/**
 * Сила запоминания стиха:
 * 0 — только добавлен, 1–2 — начал учить, 3–4 — средне, 5–6 — твёрдо.
 */
export const MAX_STRENGTH = 6

/** Через сколько дней повторять стих при каждой силе (индекс = сила) */
export const VERSE_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60]

/**
 * Сложность упражнения для запоминания:
 * 1 — узнавание (выбрать слово, расставить части, открыть по тапу),
 * 2 — вспоминание с опорой (первые буквы, частично скрытый текст),
 * 3 — вспоминание без подсказок (ввести текст по памяти).
 */
export type Tier = 1 | 2 | 3

/** Упражнение какой сложности нужно пройти, чтобы сила выросла с N на N+1 */
export const REQUIRED_TIER: Tier[] = [1, 1, 2, 2, 3, 3, 3]

/** Очки опыта за упражнение при результате 100% (по сложности) */
const XP_BASE: Record<Tier, number> = { 1: 5, 2: 10, 3: 15 }

export const xpFor = (tier: Tier, score: number): number => Math.round((XP_BASE[tier] * Math.max(0, Math.min(100, score))) / 100)

export const isDue = (v: Pick<VerseState, 'nextReviewAt'>, now: number): boolean => now >= v.nextReviewAt

export type StrengthGroup = 'new' | 'started' | 'medium' | 'strong'

export function strengthGroup(strength: number): StrengthGroup {
  if (strength <= 0) return 'new'
  if (strength <= 2) return 'started'
  if (strength <= 4) return 'medium'
  return 'strong'
}

export const STRENGTH_LABEL: Record<StrengthGroup, string> = {
  new: 'Новый',
  started: 'Начал учить',
  medium: 'Средне',
  strong: 'Твёрдо',
}

export interface VerseUpdate {
  verse: VerseState
  change: 'up' | 'down' | 'same'
}

/**
 * Применяет результат одного упражнения по стиху.
 *
 * Правила:
 * - Сила растёт, только когда пришёл срок повторения (или стих новый), упражнение не проще нужного (REQUIRED_TIER),
 *   результат не ниже 90% и сегодня сила этого стиха ещё не росла (не больше одного шага в день).
 * - Результат 70–89%: сила не меняется, повтор раньше (через половину интервала).
 * - Результат ниже 70% при плановом повторении: сила падает на 1 (ниже 40% — на 2, но не ниже 1), повтор завтра.
 * - Ошибка вне срока повторения силу не меняет, но стих возвращается в очередь не позже чем через день.
 * - Упражнение вне срока и без ошибок ничего не меняет (это просто тренировка).
 */
export function applyVerseResult(verse: VerseState, result: { tier: Tier; score: number }, now: number): VerseUpdate {
  const { tier, score } = result
  const s = verse.strength
  const due = isDue(verse, now)
  const v: VerseState = { ...verse, lastPracticedAt: now, lastScore: score }
  let change: VerseUpdate['change'] = 'same'

  if (score < PARTIAL_SCORE) {
    if (s >= 1 && due) {
      v.strength = Math.max(1, s - (score < BAD_SCORE ? 2 : 1))
      v.lapses = verse.lapses + 1
      v.nextReviewAt = now + DAY
      if (v.strength < s) change = 'down'
    } else if (s >= 1) {
      v.nextReviewAt = Math.min(verse.nextReviewAt, now + DAY)
    } else {
      v.nextReviewAt = now // новый стих пока не получился — остаётся «к изучению»
    }
  } else if (score < PASS_SCORE) {
    if (s === 0) v.nextReviewAt = now
    else if (due) v.nextReviewAt = now + 0.5 * VERSE_INTERVAL_DAYS[s] * DAY
  } else {
    const risenToday = verse.lastUpAt !== null && sameDay(verse.lastUpAt, now)
    const canRise = s < MAX_STRENGTH && (s === 0 || due) && tier >= REQUIRED_TIER[s] && !risenToday
    if (canRise) {
      v.strength = s + 1
      v.lastUpAt = now
      v.nextReviewAt = now + VERSE_INTERVAL_DAYS[v.strength] * DAY
      change = 'up'
    } else if (s === MAX_STRENGTH && due && tier >= REQUIRED_TIER[s]) {
      v.nextReviewAt = now + VERSE_INTERVAL_DAYS[MAX_STRENGTH] * DAY
    }
  }
  return { verse: v, change }
}

/** Стих нужно уделить внимание: недавно допущена ошибка или он ещё не получился */
export const needsAttention = (v: VerseState): boolean => v.lastScore !== null && v.lastScore < PARTIAL_SCORE
