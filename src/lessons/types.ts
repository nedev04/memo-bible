import type { Tier } from '../logic/mastery'

export type ExerciseKind = 'reveal' | 'partial' | 'fillGaps'

export const KIND_TITLE: Record<ExerciseKind, string> = {
  reveal: 'Откройте стих по частям',
  partial: 'Прочитайте стих',
  fillGaps: 'Выберите пропущенное слово',
}

/**
 * Сложность упражнения для правил запоминания. null — учебное упражнение: оно знакомит со стихом,
 * но не проверяет его, поэтому на силу стиха не влияет.
 */
export const KIND_TIER: Record<ExerciseKind, Tier | null> = {
  reveal: null,
  partial: null,
  fillGaps: 1,
}

export interface StepSettings {
  /** Сколько слов открывается за одно касание */
  chunk?: number
  /** Доля скрытых слов, % (0–50) */
  wordPct?: number
  /** Доля скрытых букв в остальных словах, % (0–100) */
  letterPct?: number
  /** Сколько пропусков */
  blanks?: number
  /** Сколько вариантов ответа */
  options?: number
}

export interface LessonStep {
  id: string
  kind: ExerciseKind
  verseKeys: string[]
  settings: StepSettings
  /** Повтор после ошибки в конце урока */
  retry?: boolean
}

/** Стих с текстом, готовый к показу */
export interface VerseText {
  key: string
  book: string
  chapter: number
  verse: number
  /** «Матфея 5:7» */
  ref: string
  text: string
  /** Текст всей главы: из него берутся неверные варианты ответа */
  chapterText: string
}

export interface StepResult {
  /** Точность 0–100 */
  score: number
  /** Учебное упражнение: без оценки, урок идёт дальше сразу */
  neutral?: boolean
  /** Пояснение под оценкой, например правильный ответ */
  detail?: string
}

export interface StepOutcome {
  xp: number
  changes: { key: string; change: 'up' | 'down' | 'same' }[]
}

/** Что получает компонент упражнения */
export interface StepProps {
  verse: VerseText
  settings: StepSettings
  onAnswer: (result: StepResult) => void
}
