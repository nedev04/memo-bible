import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { useSync } from '../sync/SyncProvider'
import LevelProgress from '../components/LevelProgress'
import { getLastBackup } from '../db/backupMeta'
import { db, liveTexts } from '../db/db'
import { DIFFICULTY_LABEL, EXERCISES } from '../logic/config'
import { dueLabel, exerciseLink, overdueLabel, recommend, sameDay } from '../logic/progress'
import type { Attempt } from '../types'

export default function TodayPage() {
  const { user } = useSync()
  const texts = useLiveQuery(() => liveTexts(), [])
  const attempts = useLiveQuery(() => db.attempts.toArray(), [])
  if (!texts || !attempts) return null

  const now = Date.now()
  const byText = new Map<number, Attempt[]>()
  for (const a of attempts) byText.set(a.textId, [...(byText.get(a.textId) ?? []), a])

  const due = texts.filter((t) => now >= t.nextReviewAt).sort((a, b) => a.nextReviewAt - b.nextReviewAt)
  const later = texts.filter((t) => now < t.nextReviewAt).sort((a, b) => a.nextReviewAt - b.nextReviewAt)

  const lastBackup = getLastBackup()
  const needBackup = !user && texts.length > 0 && (lastBackup === null || now - lastBackup > 14 * 24 * 60 * 60 * 1000)

  const todays = attempts.filter((a) => sameDay(a.createdAt, now))
  const todayPoints = todays.reduce((n, a) => n + a.points, 0)

  return (
    <>
      <h1>Сегодня</h1>
      <p className="muted">
        {todays.length === 0
          ? 'Сегодня упражнений ещё не было.'
          : `Сегодня: ${todays.length} упр. · ${todayPoints} очк.`}
      </p>

      {needBackup && (
        <p className="notice">
          Данные хранятся только на этом устройстве. <Link to="/data">Сохраните резервную копию</Link>, чтобы не потерять прогресс.
        </p>
      )}

      {texts.length === 0 && (
        <div className="empty">
          <p>Здесь появятся тексты, которые пора повторить. Начните с первого.</p>
          <Link className="btn primary" to="/new">Добавить текст</Link>
        </div>
      )}

      {texts.length > 0 && due.length === 0 && (
        <p className="empty">
          На сегодня всё повторено.
          {later.length > 0 && ` Ближайшее повторение: «${later[0].title}» — ${dueLabel(later[0].nextReviewAt, now).toLowerCase()}.`}
        </p>
      )}

      {due.length > 0 && <h2>К повторению · {due.length}</h2>}
      <ul className="list">
        {due.map((t) => {
          const history = byText.get(t.id!) ?? []
          const rec = recommend(t, history, now)
          const isNew = history.length === 0
          return (
            <li key={t.id} className="today-item">
              <div className="row">
                <span className="level">{t.level}</span>
                <div className="grow">
                  <Link to={`/text/${t.id}`} className="title-link"><strong>{t.title}</strong></Link>
                  <small className={isNew ? undefined : 'due'}>
                    {isNew ? 'Новый текст' : overdueLabel(t.nextReviewAt, now)}
                  </small>
                </div>
              </div>
              <LevelProgress text={t} />
              <p className="reason">{rec.reason}</p>
              <Link className="btn primary start" to={exerciseLink(t.id!, rec)}>
                {EXERCISES[rec.exercise].title} · {DIFFICULTY_LABEL[rec.difficulty].toLowerCase()}
              </Link>
            </li>
          )
        })}
      </ul>

      {later.length > 0 && <h2>Позже</h2>}
      <ul className="list">
        {later.map((t) => (
          <li key={t.id}>
            <Link to={`/text/${t.id}`} className="list-item">
              <span className="level">{t.level}</span>
              <span className="grow">
                <strong>{t.title}</strong>
                <small>{dueLabel(t.nextReviewAt, now)}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
