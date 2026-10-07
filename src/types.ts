export type Difficulty = 1 | 2 | 3
export type Group = 1 | 2 | 3

export type ExerciseId =
  | 'revealTap'
  | 'partialHidden'
  | 'firstLetters'
  | 'fillGaps'
  | 'orderBlocks'
  | 'fullInput'
  | 'nextLine'
  | 'findError'
  | 'lineEnding'

export interface TextItem {
  /** Локальный числовой id (в адресах страниц) */
  id?: number
  /** Глобальный id для синхронизации между устройствами */
  uid: string
  title: string
  content: string
  createdAt: number
  /** Уровень освоения 1–7 */
  level: number
  /** Очки, набранные на текущем уровне */
  levelPoints: number
  /** Когда уровень менялся последний раз (начало окна для проверки условий) */
  levelChangedAt: number
  /** Когда последний раз был повышен уровень (null — ещё ни разу) */
  lastLevelUpAt: number | null
  /** Когда пора повторять */
  nextReviewAt: number
  /** Когда запись менялась последний раз (для синхронизации: побеждает более новая) */
  updatedAt: number
  /** Когда текст удалили (запись остаётся до отправки в облако) */
  deletedAt?: number | null
  /** 1 — есть изменения, ещё не отправленные в облако */
  dirty?: 0 | 1
}

export interface Attempt {
  id?: number
  /** Глобальный id попытки (попытки не меняются, при синхронизации только добавляются) */
  uid: string
  textId: number
  /** uid текста, к которому относится попытка */
  textUid: string
  exercise: ExerciseId
  difficulty: Difficulty
  /** Точность 0–100 */
  score: number
  points: number
  createdAt: number
  dirty?: 0 | 1
}

/** Состояние запоминания одного стиха. Ключ: rst:mat:5:7 */
export interface VerseState {
  key: string
  translation: string
  book: string
  chapter: number
  verse: number
  addedAt: number
  /** Сила запоминания 0–6; 0 — стих только добавлен */
  strength: number
  nextReviewAt: number
  updatedAt: number
  deletedAt?: number | null
  dirty?: 0 | 1
}
