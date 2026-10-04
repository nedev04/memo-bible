import Dexie, { type Table, type Transaction } from 'dexie'
import { uuid } from '../lib/uuid'
import type { BackupData } from '../logic/backup'
import { getSyncUserId } from '../sync/syncMeta'
import type { Attempt, TextItem } from '../types'

class AppDB extends Dexie {
  texts!: Table<TextItem, number>
  attempts!: Table<Attempt, number>

  constructor() {
    super('memorize-by-heart')
    this.version(1).stores({
      texts: '++id, nextReviewAt',
      attempts: '++id, textId, createdAt',
    })
    // v2: глобальные id для синхронизации и пометка «не отправлено в облако»
    this.version(2)
      .stores({
        texts: '++id, uid, nextReviewAt, dirty',
        attempts: '++id, uid, textId, textUid, createdAt, dirty',
      })
      .upgrade(async (tx) => {
        const uidById = new Map<number, string>()
        const now = Date.now()
        await tx.table('texts').toCollection().modify((t: Record<string, unknown>) => {
          const uid = uuid()
          uidById.set(t.id as number, uid)
          t.uid = uid
          t.updatedAt = now
          t.dirty = 1
        })
        await tx.table('attempts').toCollection().modify((a: Record<string, unknown>, ctx: { value?: unknown }) => {
          const textUid = uidById.get(a.textId as number)
          if (!textUid) {
            delete ctx.value // попытка без текста — удаляем
            return
          }
          a.uid = uuid()
          a.textUid = textUid
          a.dirty = 1
        })
      })
  }
}

export const db = new AppDB()

// ---------- Пометки для синхронизации ----------

/** Транзакции синхронизации помечаются, чтобы их запись не считалась «локальным изменением» */
export function markSyncTx(tx: Transaction) {
  ;(tx as unknown as { sync?: boolean }).sync = true
}
const isSyncTx = (tx: Transaction | undefined) => !!tx && !!(tx as unknown as { sync?: boolean }).sync

function notifyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('memo:changed'))
}

db.texts.hook('creating', (_key, obj, tx) => {
  if (isSyncTx(tx)) return
  obj.uid ||= uuid()
  obj.updatedAt = Date.now()
  obj.dirty = 1
  notifyChanged()
})
db.texts.hook('updating', (_mods, _key, _obj, tx) => {
  if (isSyncTx(tx)) return
  notifyChanged()
  return { updatedAt: Date.now(), dirty: 1 }
})
db.attempts.hook('creating', (_key, obj, tx) => {
  if (isSyncTx(tx)) return
  obj.uid ||= uuid()
  obj.dirty = 1
  notifyChanged()
})

// ---------- Запросы ----------

/** Тексты без удалённых (удалённые некоторое время хранятся как «надгробия» до отправки в облако) */
export const liveTexts = () => db.texts.filter((t) => !t.deletedAt).toArray()

export async function getLiveText(id: number): Promise<TextItem | undefined> {
  const t = await db.texts.get(id)
  return t && !t.deletedAt ? t : undefined
}

export const countLiveTexts = () => db.texts.filter((t) => !t.deletedAt).count()

/**
 * Удаление текста. Если устройство синхронизируется, запись остаётся с пометкой deletedAt,
 * чтобы удаление дошло до облака и других устройств; иначе удаляем сразу.
 */
export async function deleteText(id: number) {
  await db.transaction('rw', db.texts, db.attempts, async () => {
    await db.attempts.where('textId').equals(id).delete()
    if (getSyncUserId()) await db.texts.update(id, { deletedAt: Date.now() })
    else await db.texts.delete(id)
  })
}

async function removeEverythingInTx() {
  await db.attempts.clear()
  if (getSyncUserId()) {
    await db.texts.filter((t) => !t.deletedAt).modify({ deletedAt: Date.now() })
  } else {
    await db.texts.clear()
  }
}

export async function exportAll(): Promise<{ texts: TextItem[]; attempts: Attempt[] }> {
  const [texts, attempts] = await Promise.all([liveTexts(), db.attempts.toArray()])
  return { texts, attempts }
}

/**
 * replace — убрать текущие тексты и загрузить копию;
 * merge — добавить тексты из копии к существующим (id пересоздаются, попытки привязываются к новым).
 */
export async function importBackup(data: BackupData, mode: 'replace' | 'merge') {
  await db.transaction('rw', db.texts, db.attempts, async () => {
    if (mode === 'replace') await removeEverythingInTx()
    const now = Date.now()
    const map = new Map<number, { id: number; uid: string }>()
    for (const t of data.texts) {
      const { id, ...rest } = t
      const uid = uuid()
      map.set(id, { id: await db.texts.add({ ...rest, uid, updatedAt: now }), uid })
    }
    await db.attempts.bulkAdd(
      data.attempts.map((a) => {
        const m = map.get(a.textId)!
        return { ...a, uid: uuid(), textId: m.id, textUid: m.uid }
      }),
    )
  })
}

/** Удалить все данные. Для синхронизируемого устройства удаление дойдёт и до облака. */
export async function clearAll() {
  await db.transaction('rw', db.texts, db.attempts, removeEverythingInTx)
}

/** Стереть всё локально, не затрагивая облако (при смене аккаунта на устройстве) */
export async function wipeLocal() {
  await db.transaction('rw', db.texts, db.attempts, async () => {
    await db.attempts.clear()
    await db.texts.clear()
  })
}
