import { EXERCISES } from '../logic/config'
import { parseKey } from '../bible/refs'
import type { Attempt, Difficulty, ExerciseId, LessonRecord, TextItem, VerseReview, VerseState } from '../types'

/** Строка таблицы texts в облаке */
export interface TextRow {
  user_id?: string
  uid: string
  title: string
  content: string
  created_at: number
  level: number
  level_points: number
  level_changed_at: number
  last_level_up_at: number | null
  next_review_at: number
  updated_at: number
  deleted_at: number | null
  server_updated_at?: string
}

/** Строка таблицы attempts в облаке */
export interface AttemptRow {
  user_id?: string
  uid: string
  text_uid: string
  exercise: string
  difficulty: number
  score: number
  points: number
  created_at: number
  server_updated_at?: string
}

export function textToRow(t: TextItem, userId: string): TextRow {
  return {
    user_id: userId,
    uid: t.uid,
    title: t.title,
    content: t.content,
    created_at: t.createdAt,
    level: t.level,
    level_points: t.levelPoints,
    level_changed_at: t.levelChangedAt,
    last_level_up_at: t.lastLevelUpAt,
    next_review_at: t.nextReviewAt,
    updated_at: t.updatedAt,
    deleted_at: t.deletedAt ?? null,
  }
}

export function rowToText(r: TextRow): Omit<TextItem, 'id'> {
  return {
    uid: r.uid,
    title: r.title,
    content: r.content,
    createdAt: Number(r.created_at),
    level: r.level,
    levelPoints: r.level_points,
    levelChangedAt: Number(r.level_changed_at),
    lastLevelUpAt: r.last_level_up_at === null ? null : Number(r.last_level_up_at),
    nextReviewAt: Number(r.next_review_at),
    updatedAt: Number(r.updated_at),
    deletedAt: r.deleted_at === null ? null : Number(r.deleted_at),
  }
}

export function attemptToRow(a: Attempt, userId: string): AttemptRow {
  return {
    user_id: userId,
    uid: a.uid,
    text_uid: a.textUid,
    exercise: a.exercise,
    difficulty: a.difficulty,
    score: a.score,
    points: a.points,
    created_at: a.createdAt,
  }
}

/** Попытка с упражнением, которого эта версия приложения не знает (например, из более новой версии), пропускается */
export function isKnownAttemptRow(r: AttemptRow): boolean {
  return r.exercise in EXERCISES && r.difficulty >= 1 && r.difficulty <= 3
}

export function rowToAttempt(r: AttemptRow, localTextId: number): Attempt {
  return {
    uid: r.uid,
    textId: localTextId,
    textUid: r.text_uid,
    exercise: r.exercise as ExerciseId,
    difficulty: r.difficulty as Difficulty,
    score: r.score,
    points: r.points,
    createdAt: Number(r.created_at),
    dirty: 0,
  }
}

/** Побеждает более новая версия записи. Нет локальной записи — берём облачную. При равенстве остаётся локальная. */
export function remoteWins(local: { updatedAt: number } | undefined, remoteUpdatedAt: number): boolean {
  return !local || remoteUpdatedAt > local.updatedAt
}

/** Самое позднее серверное время среди строк (мс) */
export function maxServerTime(rows: { server_updated_at?: string }[], current: number | null): number | null {
  let max = current
  for (const r of rows) {
    if (!r.server_updated_at) continue
    const t = Date.parse(r.server_updated_at)
    if (Number.isFinite(t) && (max === null || t > max)) max = t
  }
  return max
}

/**
 * С какого момента запрашивать изменения. Берём с запасом назад: транзакции на сервере могут завершаться
 * не в порядке начала, и запись с чуть более ранним временем появится позже. Повторная обработка безопасна.
 */
export const OVERLAP_MS = 5 * 60 * 1000
export function sinceIso(cursor: number | null): string {
  return new Date(cursor === null ? 0 : Math.max(0, cursor - OVERLAP_MS)).toISOString()
}

/** Строка таблицы verses в облаке */
export interface VerseRow {
  user_id?: string
  key: string
  translation: string
  book: string
  chapter: number
  verse: number
  added_at: number
  strength: number
  next_review_at: number
  last_up_at: number | null
  last_practiced_at: number | null
  last_score: number | null
  lapses: number
  updated_at: number
  deleted_at: number | null
  server_updated_at?: string
}

/** Строка таблицы reviews в облаке */
export interface ReviewRow {
  user_id?: string
  uid: string
  verse_key: string
  exercise: string
  tier: number
  score: number
  xp: number
  created_at: number
  server_updated_at?: string
}

export function verseToRow(v: VerseState, userId: string): VerseRow {
  return {
    user_id: userId,
    key: v.key,
    translation: v.translation,
    book: v.book,
    chapter: v.chapter,
    verse: v.verse,
    added_at: v.addedAt,
    strength: v.strength,
    next_review_at: v.nextReviewAt,
    last_up_at: v.lastUpAt,
    last_practiced_at: v.lastPracticedAt,
    last_score: v.lastScore,
    lapses: v.lapses,
    updated_at: v.updatedAt,
    deleted_at: v.deletedAt ?? null,
  }
}

const orNull = (x: number | null): number | null => (x === null || x === undefined ? null : Number(x))

export function rowToVerse(r: VerseRow): VerseState {
  return {
    key: r.key,
    translation: r.translation,
    book: r.book,
    chapter: r.chapter,
    verse: r.verse,
    addedAt: Number(r.added_at),
    strength: r.strength,
    nextReviewAt: Number(r.next_review_at),
    lastUpAt: orNull(r.last_up_at),
    lastPracticedAt: orNull(r.last_practiced_at),
    lastScore: orNull(r.last_score),
    lapses: r.lapses,
    updatedAt: Number(r.updated_at),
    deletedAt: orNull(r.deleted_at),
    dirty: 0,
  }
}

/** Стих с ключом, который эта версия не понимает, пропускается */
export const isKnownVerseRow = (r: VerseRow): boolean => parseKey(r.key) !== null

export function reviewToRow(v: VerseReview, userId: string): ReviewRow {
  return {
    user_id: userId,
    uid: v.uid,
    verse_key: v.verseKey,
    exercise: v.exercise,
    tier: v.tier,
    score: v.score,
    xp: v.xp,
    created_at: v.createdAt,
  }
}

export function rowToReview(r: ReviewRow): VerseReview {
  return {
    uid: r.uid,
    verseKey: r.verse_key,
    exercise: r.exercise,
    tier: r.tier as 1 | 2 | 3,
    score: r.score,
    xp: r.xp,
    createdAt: Number(r.created_at),
    dirty: 0,
  }
}

/** Строка таблицы lessons в облаке */
export interface LessonRow {
  user_id?: string
  uid: string
  type: string
  status: string
  verse_keys: string[]
  xp: number
  mistakes: number
  created_at: number
  server_updated_at?: string
}

export function lessonToRow(l: LessonRecord, userId: string): LessonRow {
  return {
    user_id: userId,
    uid: l.uid,
    type: l.type,
    status: l.status,
    verse_keys: l.verseKeys,
    xp: l.xp,
    mistakes: l.mistakes,
    created_at: l.createdAt,
  }
}

/** Урок неизвестного типа (из более новой версии приложения) пропускается */
export const isKnownLessonRow = (r: LessonRow): boolean =>
  ['regular', 'review', 'test'].includes(r.type) && ['done', 'skipped'].includes(r.status)

export function rowToLesson(r: LessonRow): LessonRecord {
  return {
    uid: r.uid,
    type: r.type as LessonRecord['type'],
    status: r.status as LessonRecord['status'],
    verseKeys: Array.isArray(r.verse_keys) ? r.verse_keys : [],
    xp: r.xp,
    mistakes: r.mistakes,
    createdAt: Number(r.created_at),
    dirty: 0,
  }
}
