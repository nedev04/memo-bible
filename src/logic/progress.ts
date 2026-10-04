import type { Attempt, Difficulty, ExerciseId, Group, TextItem } from '../types'
import {
  BAD_SCORE, DAY, DIFFICULTY_LABEL, DIFFICULTY_MULT, EXERCISES, GROUP_TITLES,
  INTERVAL_DAYS, MAX_LEVEL, PARTIAL_SCORE, PASS_SCORE, POINTS_TO_NEXT, REQUIRED_DIFFICULTY,
} from './config'

// ---------- Очки ----------

export function accuracyFactor(score: number): number {
  if (score >= PASS_SCORE) return 1
  if (score >= PARTIAL_SCORE) return 0.5
  return 0
}

/** sameTodayCount — сколько раз то же упражнение на той же сложности уже проходили сегодня */
export function repeatFactor(sameTodayCount: number): number {
  if (sameTodayCount === 0) return 1
  if (sameTodayCount === 1) return 0.5
  return 0
}

export function calcPoints(
  exercise: ExerciseId,
  difficulty: Difficulty,
  score: number,
  sameTodayCount: number,
): number {
  const raw =
    EXERCISES[exercise].basePoints *
    DIFFICULTY_MULT[difficulty] *
    accuracyFactor(score) *
    repeatFactor(sameTodayCount)
  return Math.round(raw)
}

export function pointsNeeded(level: number): number {
  return level >= MAX_LEVEL ? 0 : POINTS_TO_NEXT[level]
}

// ---------- Создание текста ----------

export function createText(title: string, content: string, now: number): TextItem {
  return {
    title,
    content,
    createdAt: now,
    level: 1,
    levelPoints: 0,
    levelChangedAt: now,
    lastLevelUpAt: null,
    nextReviewAt: now,
  }
}

// ---------- Условия повышения ----------

export function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/**
 * Что мешает повысить уровень, кроме нехватки очков.
 * Пустой массив — все остальные условия выполнены.
 */
export function levelUpBlockers(text: TextItem, history: Attempt[], now: number): string[] {
  if (text.level >= MAX_LEVEL) return []
  const since = history.filter((a) => a.createdAt >= text.levelChangedAt)
  const blockers: string[] = []

  const need = REQUIRED_DIFFICULTY[text.level]
  const hasRequired = since.some((a) => a.difficulty >= need && a.score >= PASS_SCORE)
  if (!hasRequired) {
    blockers.push(`Пройдите упражнение на сложности «${DIFFICULTY_LABEL[need]}» минимум на ${PASS_SCORE}%`)
  }
  for (const g of [2, 3] as const) {
    const has = since.some((a) => EXERCISES[a.exercise].group === g && a.score >= PARTIAL_SCORE)
    if (!has) blockers.push(`Нужно упражнение из группы «${GROUP_TITLES[g]}»`)
  }
  if (text.lastLevelUpAt !== null && sameDay(text.lastLevelUpAt, now)) {
    blockers.push('Уровень уже повышался сегодня — продолжите завтра')
  }
  return blockers
}

export function canLevelUp(text: TextItem, history: Attempt[], now: number): boolean {
  if (text.level >= MAX_LEVEL) return false
  return text.levelPoints >= pointsNeeded(text.level) && levelUpBlockers(text, history, now).length === 0
}

// ---------- Применение попытки ----------

export interface AttemptResult {
  text: TextItem
  leveledUp: boolean
  /** На сколько уровней понизили (0 — не понижали) */
  leveledDown: number
}

/**
 * Возвращает обновлённый текст после попытки.
 * history — прошлые попытки по этому тексту (без текущей).
 */
export function applyAttempt(
  text: TextItem,
  attempt: Attempt,
  history: Attempt[],
  now: number,
): AttemptResult {
  const t: TextItem = { ...text }
  const group = EXERCISES[attempt.exercise].group

  // Плановое повторение проверяют только упражнения на запоминание и проверку
  const isReview = group >= 2 && t.level >= 2 && now >= t.nextReviewAt

  if (isReview && attempt.score < PARTIAL_SCORE) {
    const drop = attempt.score < BAD_SCORE ? 2 : 1
    t.level = Math.max(1, t.level - drop)
    t.levelPoints = 0
    t.levelChangedAt = now
    t.nextReviewAt = now + DAY
    return { text: t, leveledUp: false, leveledDown: text.level - t.level }
  }

  if (isReview) {
    const k = attempt.score >= PASS_SCORE ? 1 : 0.5
    t.nextReviewAt = now + k * INTERVAL_DAYS[t.level] * DAY
  }

  if (t.level < MAX_LEVEL) {
    t.levelPoints = Math.min(t.levelPoints + attempt.points, pointsNeeded(t.level))
  }

  if (canLevelUp(t, [...history, attempt], now)) {
    t.level += 1
    t.levelPoints = 0
    t.levelChangedAt = now
    t.lastLevelUpAt = now
    t.nextReviewAt = now + INTERVAL_DAYS[t.level] * DAY
    return { text: t, leveledUp: true, leveledDown: 0 }
  }

  return { text: t, leveledUp: false, leveledDown: 0 }
}

// ---------- Подписи для интерфейса ----------

export function dueLabel(nextReviewAt: number, now: number): string {
  if (now >= nextReviewAt) return 'Пора повторить'
  const days = Math.ceil((nextReviewAt - now) / DAY)
  if (days <= 1) return 'Повтор завтра'
  return `Повтор через ${days} дн.`
}

// ---------- Что делать дальше ----------

export interface Recommendation {
  exercise: ExerciseId
  difficulty: Difficulty
  reason: string
}

const EXERCISE_ORDER = Object.keys(EXERCISES) as ExerciseId[]

function inGroup(g: Group): ExerciseId[] {
  return EXERCISE_ORDER.filter((e) => EXERCISES[e].group === g && EXERCISES[e].implemented)
}

/** Из списка выбирает упражнение, которое для этого текста делали давнее всего (не делали — в первую очередь) */
function leastRecent(candidates: ExerciseId[], history: Attempt[]): ExerciseId {
  const last = new Map<ExerciseId, number>()
  for (const a of history) last.set(a.exercise, Math.max(last.get(a.exercise) ?? 0, a.createdAt))
  return [...candidates].sort(
    (a, b) => (last.get(a) ?? 0) - (last.get(b) ?? 0) || EXERCISE_ORDER.indexOf(a) - EXERCISE_ORDER.indexOf(b),
  )[0]
}

/**
 * Подбирает следующее упражнение для текста.
 * 1) новый текст — знакомство; 2) пора повторять — проверка памяти (группа 3) на нужной сложности;
 * 3) иначе добираем условия для повышения: сначала запоминание и проверка, потом очки.
 */
export function recommend(text: TextItem, history: Attempt[], now: number): Recommendation {
  const need = REQUIRED_DIFFICULTY[Math.min(text.level, MAX_LEVEL - 1)]
  const since = history.filter((a) => a.createdAt >= text.levelChangedAt)
  const hasGroup = (g: Group, list: Attempt[]) => list.some((a) => EXERCISES[a.exercise].group === g)
  const pick = (g: Group, difficulty: Difficulty, reason: string): Recommendation => ({
    exercise: leastRecent(inGroup(g), history),
    difficulty,
    reason,
  })

  if (history.length === 0) return pick(1, 1, 'Знакомство с текстом')

  if (text.level >= 2 && now >= text.nextReviewAt) {
    return pick(3, need, 'Проверка: что осталось в памяти')
  }
  if (text.level === 1 && !hasGroup(1, since)) return pick(1, 1, 'Знакомство с текстом')
  if (!hasGroup(2, since)) return pick(2, need, 'Запоминание')
  if (!hasGroup(3, since)) return pick(3, need, 'Проверка')

  return {
    exercise: leastRecent([...inGroup(2), ...inGroup(3)], history),
    difficulty: need,
    reason: text.level >= MAX_LEVEL ? 'Текст выучен — закрепляем' : 'Набираем очки для следующего уровня',
  }
}

export function exerciseLink(textId: number, r: Recommendation): string {
  return `/text/${textId}/exercise/${r.exercise}?d=${r.difficulty}`
}

export function overdueLabel(nextReviewAt: number, now: number): string {
  const days = Math.floor((now - nextReviewAt) / DAY)
  return days >= 1 ? `Просрочено на ${days} дн.` : 'Пора повторить'
}
