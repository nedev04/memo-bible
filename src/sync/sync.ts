import { db, markSyncTx } from '../db/db'
import { supabase } from './client'
import {
  attemptToRow, isKnownAttemptRow, maxServerTime, remoteWins, rowToAttempt, rowToText, sinceIso, textToRow,
  type AttemptRow, type TextRow,
} from './mapping'
import { getPullCursor, setPullCursor } from './syncMeta'

const PAGE = 500
const CHUNK = 200

export interface SyncSummary {
  pulledTexts: number
  pulledAttempts: number
  pushedTexts: number
  pushedAttempts: number
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

/** Забирает все записи таблицы, изменённые после `since`, страницами */
async function fetchChanged<T>(table: 'texts' | 'attempts', since: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase!
      .from(table)
      .select('*')
      .gt('server_updated_at', since)
      .order('server_updated_at', { ascending: true })
      .order('uid', { ascending: true })
      .range(from, from + PAGE - 1)
    fail(error)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

function chunks<T>(list: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size))
  return result
}

/**
 * Один цикл синхронизации: сначала забираем изменения из облака, затем отправляем локальные.
 * Тексты сливаются по правилу «побеждает более новая запись» (updatedAt), попытки только добавляются.
 */
export async function syncOnce(userId: string): Promise<SyncSummary> {
  if (!supabase) throw new Error('Облако не настроено')
  const summary: SyncSummary = { pulledTexts: 0, pulledAttempts: 0, pushedTexts: 0, pushedAttempts: 0 }

  // ---------- 1. Забираем ----------
  const cursor = getPullCursor(userId)
  const since = sinceIso(cursor)
  const textRows = await fetchChanged<TextRow>('texts', since)
  const attemptRows = await fetchChanged<AttemptRow>('attempts', since)

  await db.transaction('rw', db.texts, db.attempts, async (tx) => {
    markSyncTx(tx)

    for (const r of textRows) {
      const local = await db.texts.where('uid').equals(r.uid).first()
      if (!remoteWins(local, Number(r.updated_at))) continue

      if (r.deleted_at !== null) {
        if (local) {
          await db.attempts.where('textUid').equals(r.uid).delete()
          await db.texts.delete(local.id!)
          summary.pulledTexts++
        }
        continue
      }
      const next = { ...rowToText(r), dirty: 0 as const }
      if (local) await db.texts.put({ ...next, id: local.id })
      else await db.texts.add(next)
      summary.pulledTexts++
    }

    for (const r of attemptRows) {
      if (!isKnownAttemptRow(r)) continue
      if ((await db.attempts.where('uid').equals(r.uid).count()) > 0) continue
      const text = await db.texts.where('uid').equals(r.text_uid).first()
      if (!text || text.deletedAt) continue
      await db.attempts.add(rowToAttempt(r, text.id!))
      summary.pulledAttempts++
    }
  })

  // ---------- 2. Отправляем ----------
  const dirtyTexts = await db.texts.where('dirty').equals(1).toArray()
  for (const part of chunks(dirtyTexts, CHUNK)) {
    const { error } = await supabase
      .from('texts')
      .upsert(part.map((t) => textToRow(t, userId)), { onConflict: 'user_id,uid' })
    fail(error)
  }

  // Попытки удалённых текстов в облаке больше не нужны
  const deletedUids = dirtyTexts.filter((t) => t.deletedAt).map((t) => t.uid)
  for (const part of chunks(deletedUids, CHUNK)) {
    const { error } = await supabase.from('attempts').delete().eq('user_id', userId).in('text_uid', part)
    fail(error)
  }

  const dirtyAttempts = await db.attempts.where('dirty').equals(1).toArray()
  for (const part of chunks(dirtyAttempts, CHUNK)) {
    const { error } = await supabase
      .from('attempts')
      .upsert(part.map((a) => attemptToRow(a, userId)), { onConflict: 'user_id,uid', ignoreDuplicates: true })
    fail(error)
  }

  // Снимаем пометки. Если запись успели изменить во время отправки, она остаётся «грязной» до следующего раза.
  await db.transaction('rw', db.texts, db.attempts, async (tx) => {
    markSyncTx(tx)
    for (const t of dirtyTexts) {
      const cur = await db.texts.get(t.id!)
      if (!cur || cur.updatedAt !== t.updatedAt) continue
      if (cur.deletedAt) await db.texts.delete(cur.id!)
      else await db.texts.update(cur.id!, { dirty: 0 })
    }
    for (const a of dirtyAttempts) await db.attempts.update(a.id!, { dirty: 0 })
  })
  summary.pushedTexts = dirtyTexts.length
  summary.pushedAttempts = dirtyAttempts.length

  setPullCursor(userId, maxServerTime([...textRows, ...attemptRows], cursor))
  return summary
}
