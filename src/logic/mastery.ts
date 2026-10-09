import type { VerseState } from '../types'
import { BAD_SCORE, DAY, PARTIAL_SCORE, PASS_SCORE } from './config'

/**
 * У стиха две независимые характеристики.
 *
 * Сила (0–6) показывает, насколько хорошо стих знают сейчас: 0 — только добавлен, 1–2 — начал учить,
 * 3–4 — средне, 5–6 — твёрдо. Она растёт за любые успешные упражнения, сколько угодно раз в день
 * (но упражнение должно быть достаточно сложным для текущей силы), и падает при ошибках.
 *
 * Стадия повторения (0–6) задаёт расписание: когда стих нужно повторить через 1, 3, 7, 14, 30 и 60 дней.
 * Она растёт только когда повторение прошло успешно в назначенный срок.
 */
export const MAX_STRENGTH = 6

/** Через сколько дней повторять стих на каждой стадии (индекс = стадия) */
export const VERSE_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60]

/**
 * Сложность упражнения для запоминания:
 * 1 — узнавание (выбрать слово, расставить части, открыть по тапу),
 * 2 — вспоминание с опорой (первые буквы, частично скрытый текст),
 * 3 — вспоминание без подсказок (ввести текст по памяти).
 */
export type Tier = 1 | 2 | 3

/** Упражнение какой сложности нужно пройти, чтобы сила (или стадия) выросла с N на N+1 */
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
 * Сила:
 * - результат 90% и выше растёт силу на 1, если упражнение не проще нужного (REQUIRED_TIER) и сила не максимальная.
 *   Ограничения «раз в день» нет;
 * - результат ниже 70% снижает силу на 1 (ниже 40% — на 2), но не ниже 1;
 * - результат 70–89% силу не меняет.
 *
 * Расписание повторений:
 * - первый зачёт нового стиха ставит его на стадию 1: повторить через день;
 * - зачёт в назначенный срок (и достаточно сложным упражнением) переводит на следующую стадию (3, 7, 14, 30, 60 дней).
 *   До зачёта стих остаётся «к повторению»;
 * - ошибка в срок снижает стадию (на 1, ниже 40% — на 2, не ниже 1) и возвращает стих на завтра;
 * - ошибка до срока стадию не меняет, но стих вернётся в очередь не позже чем через день;
 * - результат 70–89% в срок: повтор раньше (через половину интервала).
 */
export function applyVerseResult(verse: VerseState, result: { tier: Tier; score: number }, now: number): VerseUpdate {
  const { tier, score } = result
  const s = verse.strength
  const st = verse.stage
  const due = isDue(verse, now)
  const v: VerseState = { ...verse, lastPracticedAt: now, lastScore: score }
  let change: VerseUpdate['change'] = 'same'

  if (score < PARTIAL_SCORE) {
    const drop = score < BAD_SCORE ? 2 : 1
    if (s >= 1) {
      v.strength = Math.max(1, s - drop)
      if (v.strength < s) change = 'down'
    }
    if (st >= 1 && due) {
      v.stage = Math.max(1, st - drop)
      v.lapses = verse.lapses + 1
      v.nextReviewAt = now + DAY
    } else if (st >= 1) {
      v.nextReviewAt = Math.min(verse.nextReviewAt, now + DAY)
    } else {
      v.nextReviewAt = now // новый стих пока не получился — остаётся «к изучению»
    }
  } else if (score < PASS_SCORE) {
    if (st === 0) v.nextReviewAt = now
    else if (due) v.nextReviewAt = now + 0.5 * VERSE_INTERVAL_DAYS[st] * DAY
  } else {
    if (s < MAX_STRENGTH && tier >= REQUIRED_TIER[s]) {
      v.strength = s + 1
      v.lastUpAt = now
      change = 'up'
    }
    if (st === 0) {
      if (v.strength >= 1) {
        v.stage = 1
        v.nextReviewAt = now + VERSE_INTERVAL_DAYS[1] * DAY
      } else {
        v.nextReviewAt = now
      }
    } else if (due && tier >= REQUIRED_TIER[st]) {
      v.stage = Math.min(MAX_STRENGTH, st + 1)
      v.nextReviewAt = now + VERSE_INTERVAL_DAYS[v.stage] * DAY
    }
  }
  return { verse: v, change }
}

/** Стих нужно уделить внимание: недавно допущена ошибка или он ещё не получился */
export const needsAttention = (v: VerseState): boolean => v.lastScore !== null && v.lastScore < PARTIAL_SCORE
