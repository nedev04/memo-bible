import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatRange, groupVerses, parseKey } from '../bible/refs'
import { getLastBackup } from '../db/backupMeta'
import { liveLessons, liveTexts, liveVerses, saveLesson } from '../db/db'
import { patternType, resolveType } from '../lessons/generator'
import { LESSON_TYPE_INFO } from '../lessons/typeInfo'
import { isDue, needsAttention } from '../logic/mastery'
import { useSync } from '../sync/SyncProvider'
import type { LessonRecord, LessonType } from '../types'

type NodeState = 'done' | 'skipped' | 'current' | 'future'
interface PathNode {
  key: string
  number: number
  state: NodeState
  type: LessonType
  lesson?: LessonRecord
}

/** Смещение узлов по горизонтали, px: путь «змейкой» */
const OFFSETS = [0, 34, 54, 34, 0, -34, -54, -34]
const PAST_SHOWN = 5
const FUTURE_SHOWN = 4

function refsOf(keys: string[]): string {
  const refs = keys.map(parseKey).filter((p): p is NonNullable<typeof p> => p !== null)
  return groupVerses(refs).map(formatRange).join(', ')
}

export default function TodayPage() {
  const { user } = useSync()
  const verses = useLiveQuery(() => liveVerses(), [])
  const lessons = useLiveQuery(() => liveLessons(), [])
  const texts = useLiveQuery(() => liveTexts(), [])
  const [open, setOpen] = useState<string | null>('current')
  const currentRef = useRef<HTMLLIElement>(null)
  const scrolled = useRef(false)

  useEffect(() => {
    if (!scrolled.current && currentRef.current) {
      scrolled.current = true
      currentRef.current.scrollIntoView({ block: 'center' })
    }
  })

  if (!verses || !lessons || !texts) return null

  const now = Date.now()
  const doneCount = lessons.length
  const currentType = resolveType(patternType(doneCount), verses, now)

  const lastBackup = getLastBackup()
  const needBackup = !user && (verses.length > 0 || texts.length > 0) && (lastBackup === null || now - lastBackup > 14 * 24 * 60 * 60 * 1000)
  const dueTexts = texts.filter((t) => now >= t.nextReviewAt).length

  const past = lessons.slice(-PAST_SHOWN)
  const firstNumber = doneCount - past.length + 1
  const nodes: PathNode[] = past.map((l, i) => ({
    key: l.uid, number: firstNumber + i, state: l.status, type: l.type, lesson: l,
  }))
  if (currentType) {
    nodes.push({ key: 'current', number: doneCount + 1, state: 'current', type: currentType })
    for (let k = 1; k <= FUTURE_SHOWN; k++) {
      nodes.push({ key: `future-${k}`, number: doneCount + 1 + k, state: 'future', type: patternType(doneCount + k) })
    }
  }

  const newCount = verses.filter((v) => v.strength === 0).length
  const dueCount = verses.filter((v) => v.strength > 0 && (isDue(v, now) || needsAttention(v))).length

  async function skip() {
    if (!currentType) return
    if (!confirm('Пропустить этот урок? Он попадёт в историю, а следующий будет собран заново.')) return
    await saveLesson({ type: currentType, status: 'skipped', verseKeys: [], xp: 0, mistakes: 0 })
    setOpen('current')
  }

  const glyph = (n: PathNode) => (n.state === 'done' ? '✓' : n.state === 'skipped' ? '»' : LESSON_TYPE_INFO[n.type].glyph)

  return (
    <>
      <h1>Сегодня</h1>

      {needBackup && (
        <p className="notice">
          Данные хранятся только на этом устройстве. <Link to="/data">Сохраните резервную копию</Link>, чтобы не потерять прогресс.
        </p>
      )}
      {dueTexts > 0 && (
        <p className="notice">
          Свои тексты к повторению: {dueTexts}. <Link to="/texts">Открыть</Link>
        </p>
      )}

      {verses.length === 0 ? (
        <section className="lesson-card">
          <strong>Начните с первых стихов</strong>
          <small>Выберите книгу, главу и стихи, которые хотите выучить. Уроки соберутся автоматически.</small>
          <Link className="btn primary start" to="/add">Добавить стихи</Link>
        </section>
      ) : (
        <ol className="path">
          {nodes.map((n, i) => {
            const info = LESSON_TYPE_INFO[n.type]
            const isOpen = open === n.key
            return (
              <li key={n.key} className="path-node" ref={n.state === 'current' ? currentRef : undefined}>
                <div className="node-head" style={{ transform: `translateX(${OFFSETS[(n.number - 1) % OFFSETS.length]}px)` }}>
                  <button
                    className={`circle ${n.state}`}
                    disabled={n.state === 'future'}
                    aria-expanded={isOpen}
                    aria-label={`Урок ${n.number}: ${info.label}${n.state === 'future' ? ', пока недоступен' : ''}`}
                    onClick={() => setOpen(isOpen ? null : n.key)}
                  >
                    {glyph(n)}
                  </button>
                  <span className="node-label">{info.label}</span>
                </div>

                {isOpen && n.state === 'current' && (
                  <div className="path-detail">
                    <strong>Урок {n.number}: {info.label}</strong>
                    <p>{info.description}</p>
                    {n.type === 'regular' && <small>Новых стихов: {newCount} · к повторению: {dueCount}</small>}
                    <Link className="btn primary start" to="/lesson">Начать</Link>
                    <button className="btn ghost" onClick={skip}>Пропустить</button>
                  </div>
                )}

                {isOpen && (n.state === 'done' || n.state === 'skipped') && n.lesson && (
                  <div className="path-detail">
                    <strong>Урок {n.number}: {info.label}</strong>
                    {n.state === 'skipped' ? (
                      <small>Пропущен</small>
                    ) : (
                      <>
                        <small>+{n.lesson.xp} опыта · ошибок: {n.lesson.mistakes}</small>
                        {n.lesson.verseKeys.length > 0 && <p>{refsOf(n.lesson.verseKeys)}</p>}
                        {n.lesson.verseKeys.length > 0 && (
                          <Link className="btn ghost" to={`/lesson?replay=${n.lesson.uid}`}>Повторить урок</Link>
                        )}
                      </>
                    )}
                  </div>
                )}
                {i === nodes.length - 1 && n.state === 'future' && (
                  <small className="path-note">Состав будущих уроков определится, когда до них дойдёте: он зависит от результатов.</small>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}
