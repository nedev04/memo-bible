import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadBook } from '../bible/bible'
import { getBook } from '../bible/books'
import { formatRange, TRANSLATION } from '../bible/refs'
import { liveVerses, removeVerses } from '../db/db'
import { buildLibrary, levelCounts, type LibraryGroup } from '../logic/library'
import { isDue, STRENGTH_LABEL, type StrengthGroup } from '../logic/mastery'
import { dueLabel } from '../logic/progress'

type Filter = 'all' | StrengthGroup

/** Порядок и названия вкладок: от самых выученных к новым */
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'strong', label: STRENGTH_LABEL.strong },
  { id: 'medium', label: STRENGTH_LABEL.medium },
  { id: 'started', label: STRENGTH_LABEL.started },
  { id: 'new', label: STRENGTH_LABEL.new },
]

/** Текст группы стихов: подгружаем книгу и склеиваем стихи */
function useGroupText(group: LibraryGroup): string | null {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    loadBook(TRANSLATION, group.book)
      .then((chapters) => {
        if (!alive) return
        const verses = chapters[group.chapter - 1] ?? []
        setText(group.verses.map((n) => verses[n - 1] ?? '').filter(Boolean).join(' '))
      })
      .catch(() => alive && setText(''))
    return () => { alive = false }
  }, [group.book, group.chapter, group.verses])
  return text
}

function statusLine(group: LibraryGroup, now: number): string {
  if (isDue({ nextReviewAt: group.soonest }, now)) return group.level === 'new' ? 'к изучению' : 'пора повторить'
  return dueLabel(group.soonest, now).toLowerCase()
}

function GroupRow({ group, now }: { group: LibraryGroup; now: number }) {
  const text = useGroupText(group)
  const preview = text && text.length > 160 ? `${text.slice(0, 160).trimEnd()}…` : text
  const label = formatRange(group)

  async function remove() {
    if (!confirm(`Убрать «${label}» из списка?`)) return
    await removeVerses(group.keys)
  }

  return (
    <li className="verse-row">
      <div className="grow">
        <div className="row-head">
          <strong>{label}</strong>
          <span className={`level-badge ${group.level}`}>{STRENGTH_LABEL[group.level]}</span>
        </div>
        <small className="vstatus">
          <span className="dots" role="img" aria-label={`Сила ${group.minStrength} из 6`}>
            {'●'.repeat(group.minStrength)}{'○'.repeat(6 - group.minStrength)}
          </span>
          {' · '}{statusLine(group, now)}
        </small>
        <small className="vpreview">{preview ?? '…'}</small>
      </div>
      <button className="btn ghost small" onClick={remove} aria-label={`Убрать ${label}`}>Убрать</button>
    </li>
  )
}

export default function VersesPage() {
  const verses = useLiveQuery(() => liveVerses(), [])
  const [filter, setFilter] = useState<Filter>('all')
  const library = useMemo(() => buildLibrary(verses ?? []), [verses])
  const counts = useMemo(() => levelCounts(verses ?? []), [verses])
  if (!verses) return null

  const now = Date.now()
  const dueCount = verses.filter((v) => v.strength > 0 && isDue(v, now)).length
  const shown = library.filter((g) => filter === 'all' || g.level === filter)

  // Книги по порядку Библии, внутри — строки списка
  const byBook: { book: string; groups: LibraryGroup[] }[] = []
  for (const g of shown) {
    const last = byBook[byBook.length - 1]
    if (last && last.book === g.book) last.groups.push(g)
    else byBook.push({ book: g.book, groups: [g] })
  }

  const countOf = (f: Filter) => (f === 'all' ? verses.length : counts[f])

  return (
    <>
      <div className="row between">
        <h1>Мои стихи</h1>
        <Link className="btn primary" to="/add" aria-label="Добавить стихи">+ Добавить</Link>
      </div>

      {verses.length > 0 && <Link className="btn primary start" to="/lesson">Начать урок</Link>}

      {verses.length === 0 && (
        <p className="empty">
          Здесь появятся стихи, которые вы учите. Нажмите «Добавить», выберите книгу, главу и нужные стихи.
        </p>
      )}

      {verses.length > 0 && (
        <>
          <div className="chips filters" role="group" aria-label="Показать стихи">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`chip${filter === f.id ? ' active' : ''}`}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label} · {countOf(f.id)}
              </button>
            ))}
          </div>
          <p className="muted-block">К повторению сейчас: {dueCount}</p>
        </>
      )}

      {verses.length > 0 && shown.length === 0 && <p className="empty">В этой группе пока нет стихов.</p>}

      {byBook.map(({ book, groups }) => (
        <section key={book}>
          <h2>{getBook(book)?.name ?? book}</h2>
          <ul className="list">
            {groups.map((g) => <GroupRow key={`${g.chapter}:${g.from}:${g.level}`} group={g} now={now} />)}
          </ul>
        </section>
      ))}

      <p className="muted-block">
        <Link to="/texts">Свои тексты (прежний режим)</Link>
      </p>
    </>
  )
}
