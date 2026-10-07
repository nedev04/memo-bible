import { parseKey } from '../bible/refs'
import type { Attempt, Difficulty, ExerciseId, TextItem, VerseState } from '../types'
import { EXERCISES, MAX_LEVEL } from './config'

export const BACKUP_APP_ID = 'memorize-by-heart'
export const BACKUP_VERSION = 1

/** Текст в резервной копии. id нужен, чтобы связать с ним попытки при импорте. */
export type BackupText = Omit<TextItem, 'uid' | 'updatedAt' | 'deletedAt' | 'dirty'> & { id: number }
export type BackupAttempt = Omit<Attempt, 'id' | 'uid' | 'textUid' | 'dirty'>

export type BackupVerse = Omit<VerseState, 'updatedAt' | 'deletedAt' | 'dirty'>

export interface BackupData {
  texts: BackupText[]
  attempts: BackupAttempt[]
  verses: BackupVerse[]
  exportedAt: number
  /** Сколько записей пропущено при чтении как повреждённые */
  skipped: number
}

export function createBackup(texts: TextItem[], attempts: Attempt[], now: number, verses: VerseState[] = []): string {
  const live = texts.filter((t) => !t.deletedAt && t.id !== undefined)
  const ids = new Set(live.map((t) => t.id))
  return JSON.stringify(
    {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt: now,
      texts: live.map((t) => ({
        id: t.id,
        title: t.title,
        content: t.content,
        createdAt: t.createdAt,
        level: t.level,
        levelPoints: t.levelPoints,
        levelChangedAt: t.levelChangedAt,
        lastLevelUpAt: t.lastLevelUpAt,
        nextReviewAt: t.nextReviewAt,
      })),
      verses: verses
        .filter((v) => !v.deletedAt)
        .map((v) => ({
          key: v.key, translation: v.translation, book: v.book, chapter: v.chapter, verse: v.verse,
          addedAt: v.addedAt, strength: v.strength, nextReviewAt: v.nextReviewAt,
        })),
      attempts: attempts
        .filter((a) => ids.has(a.textId))
        .map((a) => ({
          textId: a.textId,
          exercise: a.exercise,
          difficulty: a.difficulty,
          score: a.score,
          points: a.points,
          createdAt: a.createdAt,
        })),
    },
    null,
    2,
  )
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function readText(v: unknown): BackupText | null {
  if (!isObj(v)) return null
  const { id, title, content, createdAt, level, levelPoints, levelChangedAt, lastLevelUpAt, nextReviewAt } = v
  if (!isNum(id) || typeof title !== 'string' || typeof content !== 'string') return null
  if (title.trim() === '' || content.trim() === '') return null
  if (!isNum(createdAt) || !isNum(levelChangedAt) || !isNum(nextReviewAt)) return null
  if (!isNum(level) || !Number.isInteger(level) || level < 1 || level > MAX_LEVEL) return null
  if (!isNum(levelPoints) || levelPoints < 0) return null
  if (lastLevelUpAt !== null && !isNum(lastLevelUpAt)) return null
  return {
    id, title, content, createdAt, level, levelPoints, levelChangedAt,
    lastLevelUpAt: lastLevelUpAt as number | null, nextReviewAt,
  }
}

function readVerse(v: unknown): BackupVerse | null {
  if (!isObj(v) || typeof v.key !== 'string') return null
  const ref = parseKey(v.key)
  if (!ref) return null
  const { addedAt, strength, nextReviewAt } = v
  if (!isNum(addedAt) || !isNum(nextReviewAt) || !isNum(strength) || strength < 0 || strength > 6) return null
  return { key: v.key, ...ref, addedAt, strength, nextReviewAt }
}

function readAttempt(v: unknown): BackupAttempt | null {
  if (!isObj(v)) return null
  const { textId, exercise, difficulty, score, points, createdAt } = v
  if (!isNum(textId) || !isNum(createdAt) || !isNum(points) || points < 0) return null
  if (typeof exercise !== 'string' || !(exercise in EXERCISES)) return null
  if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3) return null
  if (!isNum(score) || score < 0 || score > 100) return null
  return { textId, exercise: exercise as ExerciseId, difficulty: difficulty as Difficulty, score, points, createdAt }
}

/** Читает и проверяет файл резервной копии. При проблемах выбрасывает Error с понятным текстом. */
export function parseBackup(raw: string): BackupData {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Не удалось прочитать файл: это не резервная копия.')
  }
  if (!isObj(data) || data.app !== BACKUP_APP_ID) {
    throw new Error('Это не файл резервной копии приложения «Наизусть».')
  }
  if (!isNum(data.version) || data.version > BACKUP_VERSION) {
    throw new Error('Файл создан в более новой версии приложения. Обновите приложение и повторите.')
  }
  if (!Array.isArray(data.texts) || !Array.isArray(data.attempts)) {
    throw new Error('В файле нет данных о текстах.')
  }

  let skipped = 0
  const texts: BackupText[] = []
  const ids = new Set<number>()
  for (const t of data.texts) {
    const parsed = readText(t)
    if (parsed && !ids.has(parsed.id)) {
      texts.push(parsed)
      ids.add(parsed.id)
    } else {
      skipped++
    }
  }
  const attempts: BackupAttempt[] = []
  for (const a of data.attempts) {
    const parsed = readAttempt(a)
    if (parsed && ids.has(parsed.textId)) attempts.push(parsed)
    else skipped++
  }

  const verses: BackupVerse[] = []
  if (Array.isArray(data.verses)) {
    const seen = new Set<string>()
    for (const raw of data.verses) {
      const parsed = readVerse(raw)
      if (parsed && !seen.has(parsed.key)) {
        verses.push(parsed)
        seen.add(parsed.key)
      } else {
        skipped++
      }
    }
  }

  return { texts, attempts, verses, exportedAt: isNum(data.exportedAt) ? data.exportedAt : 0, skipped }
}

export function backupFileName(now: number): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `naizust-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}
