import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { formatRange, groupVerses, parseKey } from '../bible/refs'
import { liveLessons, liveVerses } from '../db/db'
import { isDue } from '../logic/mastery'

const HISTORY_SHOWN = 10

function refsOf(keys: string[]): string {
  const refs = keys.map(parseKey).filter((p): p is NonNullable<typeof p> => p !== null)
  return groupVerses(refs).map(formatRange).join(', ')
}

const fmtDate = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function TodayPage() {
  const verses = useLiveQuery(() => liveVerses(), [])
  const lessons = useLiveQuery(() => liveLessons(), [])
  if (!verses || !lessons) return null

  const now = Date.now()
  const done = lessons.filter((l) => l.verseKeys.length > 0)
  const newCount = verses.filter((v) => v.strength === 0).length
  const dueCount = verses.filter((v) => v.strength > 0 && isDue(v, now)).length
  const recent = done.slice(-HISTORY_SHOWN).reverse()

  return (
    <>
      <h1>Сегодня</h1>

      {verses.length === 0 ? (
        <section className="lesson-card">
          <strong>Начните с первых стихов</strong>
          <small>Выберите книгу, главу и стихи, которые хотите выучить. Урок соберётся автоматически.</small>
          <Link className="btn primary start" to="/add">Добавить стихи</Link>
        </section>
      ) : (
        <section className="lesson-card">
          <strong>Урок {done.length + 1}</strong>
          <small>Новых стихов: {newCount} · к повторению: {dueCount}</small>
          <Link className="btn primary start" to="/lesson">Начать урок</Link>
        </section>
      )}

      {recent.length > 0 && (
        <>
          <h2>Пройденные уроки</h2>
          <ul className="list">
            {recent.map((l, i) => (
              <li key={l.uid} className="history-item">
                <div className="grow">
                  <strong>Урок {done.length - i}</strong>
                  <small>{fmtDate(l.createdAt)} · +{l.xp} опыта · ошибок: {l.mistakes}</small>
                  <small className="vpreview">{refsOf(l.verseKeys)}</small>
                </div>
                <Link className="btn ghost small" to={`/lesson?replay=${l.uid}`}>Повторить</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
