import { describe, expect, it } from 'vitest'
import type { Attempt, TextItem } from '../types'
import { attemptToRow, isKnownAttemptRow, maxServerTime, remoteWins, rowToAttempt, rowToText, sinceIso, textToRow } from './mapping'

const text: TextItem = {
  id: 3, uid: 'u1', title: 'Стих', content: 'Раз два', createdAt: 100, level: 2, levelPoints: 10,
  levelChangedAt: 120, lastLevelUpAt: null, nextReviewAt: 500, updatedAt: 300, dirty: 1,
}
const attempt: Attempt = {
  id: 9, uid: 'a1', textId: 3, textUid: 'u1', exercise: 'fillGaps', difficulty: 2, score: 90, points: 12, createdAt: 200, dirty: 1,
}

describe('mapping', () => {
  it('текст: туда и обратно без потерь', () => {
    const row = textToRow(text, 'user')
    expect(row.user_id).toBe('user')
    expect(row.deleted_at).toBeNull()
    const { id: _id, dirty: _dirty, ...expected } = text
    expect(rowToText(row)).toEqual({ ...expected, deletedAt: null })
  })

  it('удалённый текст сохраняет время удаления', () => {
    const row = textToRow({ ...text, deletedAt: 777 }, 'user')
    expect(row.deleted_at).toBe(777)
    expect(rowToText(row).deletedAt).toBe(777)
  })

  it('попытка: привязывается к локальному id текста', () => {
    const row = attemptToRow(attempt, 'user')
    expect(row.text_uid).toBe('u1')
    const back = rowToAttempt(row, 42)
    expect(back).toMatchObject({ uid: 'a1', textId: 42, textUid: 'u1', exercise: 'fillGaps', difficulty: 2, dirty: 0 })
  })

  it('неизвестные упражнения из будущих версий пропускаются', () => {
    expect(isKnownAttemptRow({ ...attemptToRow(attempt, 'u') })).toBe(true)
    expect(isKnownAttemptRow({ ...attemptToRow(attempt, 'u'), exercise: 'newThing' })).toBe(false)
  })
})

describe('слияние', () => {
  it('побеждает более новая запись', () => {
    expect(remoteWins(undefined, 1)).toBe(true)
    expect(remoteWins({ updatedAt: 100 }, 101)).toBe(true)
    expect(remoteWins({ updatedAt: 100 }, 100)).toBe(false)
    expect(remoteWins({ updatedAt: 100 }, 99)).toBe(false)
  })

  it('курсор: максимум по серверному времени и запас назад', () => {
    const rows = [
      { server_updated_at: '2026-03-10T12:00:00.500000+00:00' },
      { server_updated_at: '2026-03-10T12:00:05.000000+00:00' },
      {},
    ]
    const max = maxServerTime(rows, null)
    expect(max).toBe(Date.parse('2026-03-10T12:00:05Z'))
    expect(maxServerTime([], 123)).toBe(123)
    expect(sinceIso(null)).toBe('1970-01-01T00:00:00.000Z')
    expect(Date.parse(sinceIso(max))).toBe(Date.parse('2026-03-10T11:55:05Z'))
  })
})
