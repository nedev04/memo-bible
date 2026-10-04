import { describe, expect, it } from 'vitest'
import type { Attempt, TextItem } from '../types'
import { backupFileName, createBackup, parseBackup } from './backup'

const T0 = new Date('2026-03-10T12:00:00').getTime()

const text: TextItem = {
  id: 7, title: 'Стих', content: 'Раз два\nтри', createdAt: T0, level: 3, levelPoints: 40,
  levelChangedAt: T0, lastLevelUpAt: T0, nextReviewAt: T0 + 1000,
}
const attempt: Attempt = { id: 1, textId: 7, exercise: 'fillGaps', difficulty: 2, score: 90, points: 12, createdAt: T0 }

describe('backup', () => {
  it('экспорт и импорт возвращают те же данные', () => {
    const data = parseBackup(createBackup([text], [attempt], T0))
    expect(data.texts).toEqual([text])
    expect(data.attempts).toEqual([{ textId: 7, exercise: 'fillGaps', difficulty: 2, score: 90, points: 12, createdAt: T0 }])
    expect(data.skipped).toBe(0)
  })

  it('отклоняет чужие и битые файлы', () => {
    expect(() => parseBackup('не json')).toThrow()
    expect(() => parseBackup('{"app":"other"}')).toThrow()
    expect(() => parseBackup(JSON.stringify({ app: 'memorize-by-heart', version: 99, texts: [], attempts: [] }))).toThrow()
  })

  it('пропускает повреждённые записи и попытки без текста', () => {
    const raw = JSON.stringify({
      app: 'memorize-by-heart', version: 1, exportedAt: T0,
      texts: [text, { ...text, id: 8, level: 99 }, { ...text, id: 9, title: '' }],
      attempts: [attempt, { ...attempt, textId: 8 }, { ...attempt, exercise: 'nope' }, { ...attempt, score: 500 }],
    })
    const data = parseBackup(raw)
    expect(data.texts).toHaveLength(1)
    expect(data.attempts).toHaveLength(1)
    expect(data.skipped).toBe(5)
  })

  it('имя файла содержит дату', () => {
    expect(backupFileName(T0)).toBe('naizust-2026-03-10.json')
  })
})
