import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadBook } from '../bible/bible'
import { getBook } from '../bible/books'
import { formatRange, groupVerses, TRANSLATION, verseKey, type VerseGroup } from '../bible/refs'
import { liveVerses, removeVerses } from '../db/db'
import { STRENGTH_LABEL, isDue, strengthGroup } from '../logic/mastery'
import { dueLabel } from '../logic/progress'
import type { VerseState } from '../types'

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

/** Состояние группы: берём самый слабый стих, чтобы не завышать */
function groupStatus(group: VerseGroup, states: Map<string, VerseState>, now: number): string {
  const list = group.verses
    .map((verse) => states.get(verseKey(TRANSLATION, { book: group.book, chapter: group.chapter, verse })))
    .filter((v): v is VerseState => !!v)
  if (list.length === 0) return ''
  const weakest = list.reduce((a, b) => (b.strength < a.strength ? b : a))
  const label = STRENGTH_LABEL[strengthGroup(weakest.strength)]
  const soonest = list.reduce((a, b) => (b.nextReviewAt < a.nextReviewAt ? b : a))
  return `${label} · ${isDue(soonest, now) ? (weakest.strength === 0 ? 'к изучению' : 'пора повторить') : dueLabel(soonest.nextReviewAt, now).toLowerCase()}`
}

function GroupRow({ group, status }: { group: VerseGroup; status: string }) {
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
        <small className="vstatus">{status}</small>
        <small className="vpreview">{preview ?? '…'}</small>
      </div>
      <button className="btn ghost small" onClick={remove} aria-label={`Убрать ${formatRange(group)}`}>Убрать</button>
    </li>
  )
}

export default function VersesPage() {
  const verses = useLiveQuery(() => liveVerses(), [])
  const groups = useMemo(() => groupVerses(verses ?? []), [verses])
  const states = useMemo(() => new Map((verses ?? []).map((v) => [v.key, v])), [verses])
  if (!verses) return null

  const now = Date.now()
  const dueCount = verses.filter((v) => v.strength > 0 && isDue(v, now)).length
  const newCount = verses.filter((v) => v.strength === 0).length

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

      {verses.length > 0 && (
        <p className="muted">
          Стихов: {verses.length} · к повторению: {dueCount} · новых: {newCount}
        </p>
      )}

      {verses.length === 0 && (
        <p className="empty">
          Здесь появятся стихи, которые вы учите. Нажмите «Добавить», выберите книгу, главу и нужные стихи.
        </p>
      )}

      {byBook.map(({ book, groups: list }) => (
        <section key={book}>
          <h2>{getBook(book)?.name ?? book}</h2>
          <ul className="list">
            {list.map((g) => <GroupRow key={`${g.chapter}:${g.from}`} group={g} status={groupStatus(g, states, now)} />)}
          </ul>
        </section>
      ))}

      <p className="muted-block">
        <Link to="/texts">Свои тексты (прежний режим)</Link>
      </p>
    </>
  )
}
