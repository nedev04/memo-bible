import { describe, expect, it } from 'vitest'
import type { Attempt, TextItem, VerseState } from '../types'
import { backupFileName, createBackup, parseBackup } from './backup'

const T0 = new Date('2026-03-10T12:00:00').getTime()

const text: TextItem = {
  id: 7, uid: 'text-uid', title: 'Стих', content: 'Раз два\nтри', createdAt: T0, level: 3, levelPoints: 40,
  levelChangedAt: T0, lastLevelUpAt: T0, nextReviewAt: T0 + 1000, updatedAt: T0, dirty: 1,
}
const attempt: Attempt = {
  id: 1, uid: 'attempt-uid', textId: 7, textUid: 'text-uid', exercise: 'fillGaps', difficulty: 2,
  score: 90, points: 12, createdAt: T0, dirty: 1,
}
// В файл попадают только данные самого текста, без служебных полей синхронизации
const { uid: _u, updatedAt: _t, dirty: _d, ...backupText } = text

describe('backup', () => {
  it('экспорт и импорт возвращают те же данные', () => {
    const data = parseBackup(createBackup([text], [attempt], T0))
    expect(data.texts).toEqual([backupText])
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
      texts: [backupText, { ...backupText, id: 8, level: 99 }, { ...backupText, id: 9, title: '' }],
      attempts: [attempt, { ...attempt, textId: 8 }, { ...attempt, exercise: 'nope' }, { ...attempt, score: 500 }],
    })
    const data = parseBackup(raw)
    expect(data.texts).toHaveLength(1)
    expect(data.attempts).toHaveLength(1)
    expect(data.skipped).toBe(5)
  })

  it('удалённые тексты и их попытки в копию не попадают', () => {
    const data = parseBackup(createBackup([{ ...text, deletedAt: T0 }], [attempt], T0))
    expect(data.texts).toHaveLength(0)
    expect(data.attempts).toHaveLength(0)
  })

  it('стихи сохраняются и читаются, повреждённые пропускаются', () => {
    const verse: VerseState = {
      key: 'rst:mat:5:7', translation: 'rst', book: 'mat', chapter: 5, verse: 7,
      addedAt: T0, strength: 2, stage: 3, nextReviewAt: T0 + 5, updatedAt: T0, dirty: 1,
      lastUpAt: T0, lastPracticedAt: T0, lastScore: 95, lapses: 1,
    }
    const data = parseBackup(createBackup([], [], T0, [verse, { ...verse, key: 'rst:mat:5:8', verse: 8, deletedAt: T0 }]))
    expect(data.verses).toHaveLength(1)
    expect(data.verses[0]).toMatchObject({
      key: 'rst:mat:5:7', book: 'mat', chapter: 5, verse: 7, strength: 2, stage: 3, lastUpAt: T0, lastScore: 95, lapses: 1,
    })

    const raw = JSON.parse(createBackup([], [], T0, [verse]))
    raw.verses.push({ key: 'мусор' }, { ...raw.verses[0], key: 'rst:mat:5:9', strength: 99 }, raw.verses[0])
    const parsed = parseBackup(JSON.stringify(raw))
    expect(parsed.verses).toHaveLength(1)
    expect(parsed.skipped).toBe(3)
  })

  it('копия стихов без полей прогресса (прежняя версия) читается со значениями по умолчанию', () => {
    const raw = {
      app: 'memorize-by-heart', version: 1, exportedAt: T0, texts: [], attempts: [],
      verses: [{ key: 'rst:mat:5:7', addedAt: T0, strength: 1, nextReviewAt: T0 }],
    }
    expect(parseBackup(JSON.stringify(raw)).verses[0]).toMatchObject({ lastUpAt: null, lastScore: null, lapses: 0, stage: 1 })
  })

  it('старые копии без стихов читаются', () => {
    expect(parseBackup(createBackup([text], [attempt], T0)).verses).toEqual([])
  })

  it('имя файла содержит дату', () => {
    expect(backupFileName(T0)).toBe('naizust-2026-03-10.json')
  })
})
