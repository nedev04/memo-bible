import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadBook } from '../bible/bible'
import { getBook } from '../bible/books'
import { formatRange, groupVerses, TRANSLATION, verseKey, type VerseGroup } from '../bible/refs'
import { liveVerses, removeVerses } from '../db/db'

/** Текст группы стихов: подгружаем книгу и склеиваем стихи */
function useGroupText(group: VerseGroup): string | null {
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

function GroupRow({ group }: { group: VerseGroup }) {
  const text = useGroupText(group)
  const preview = text && text.length > 160 ? `${text.slice(0, 160).trimEnd()}…` : text

  async function remove() {
    const label = formatRange(group)
    if (!confirm(`Убрать «${label}» из списка?`)) return
    await removeVerses(group.verses.map((verse) => verseKey(TRANSLATION, { book: group.book, chapter: group.chapter, verse })))
  }

  return (
    <li className="verse-row">
      <div className="grow">
        <strong>{formatRange(group)}</strong>
        <small className="vpreview">{preview ?? '…'}</small>
      </div>
      <button className="btn ghost small" onClick={remove} aria-label={`Убрать ${formatRange(group)}`}>Убрать</button>
    </li>
  )
}

export default function VersesPage() {
  const verses = useLiveQuery(() => liveVerses(), [])
  const groups = useMemo(() => groupVerses(verses ?? []), [verses])
  if (!verses) return null

  // Книги по порядку Библии, внутри — группы стихов
  const byBook: { book: string; groups: VerseGroup[] }[] = []
  for (const g of groups) {
    const last = byBook[byBook.length - 1]
    if (last && last.book === g.book) last.groups.push(g)
    else byBook.push({ book: g.book, groups: [g] })
  }

  return (
    <>
      <div className="row between">
        <h1>Мои стихи</h1>
        <Link className="btn primary" to="/add" aria-label="Добавить стихи">+ Добавить</Link>
      </div>

      {verses.length === 0 && (
        <p className="empty">
          Здесь появятся стихи, которые вы учите. Нажмите «Добавить», выберите книгу, главу и нужные стихи.
        </p>
      )}

      {byBook.map(({ book, groups: list }) => (
        <section key={book}>
          <h2>{getBook(book)?.name ?? book}</h2>
          <ul className="list">
            {list.map((g) => <GroupRow key={`${g.chapter}:${g.from}`} group={g} />)}
          </ul>
        </section>
      ))}

      <p className="muted-block">
        <Link to="/texts">Свои тексты (прежний режим)</Link>
      </p>
    </>
  )
}
