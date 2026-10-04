import Dexie, { type Table } from 'dexie'
import type { BackupData } from '../logic/backup'
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
  }
}

export const db = new AppDB()

export async function deleteText(id: number) {
  await db.transaction('rw', db.texts, db.attempts, async () => {
    await db.attempts.where('textId').equals(id).delete()
    await db.texts.delete(id)
  })
}

export async function exportAll(): Promise<{ texts: TextItem[]; attempts: Attempt[] }> {
  const [texts, attempts] = await Promise.all([db.texts.toArray(), db.attempts.toArray()])
  return { texts, attempts }
}

/**
 * replace — стереть текущие данные и загрузить копию;
 * merge — добавить тексты из копии к существующим (id пересоздаются, попытки привязываются к новым id).
 */
export async function importBackup(data: BackupData, mode: 'replace' | 'merge') {
  await db.transaction('rw', db.texts, db.attempts, async () => {
    if (mode === 'replace') {
      await db.attempts.clear()
      await db.texts.clear()
    }
    const idMap = new Map<number, number>()
    for (const t of data.texts) {
      const { id, ...rest } = t
      idMap.set(id, await db.texts.add(rest))
    }
    await db.attempts.bulkAdd(data.attempts.map((a) => ({ ...a, textId: idMap.get(a.textId)! })))
  })
}

export async function clearAll() {
  await db.transaction('rw', db.texts, db.attempts, async () => {
    await db.attempts.clear()
    await db.texts.clear()
  })
}
