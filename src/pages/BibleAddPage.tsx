import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadBook, loadIndex } from '../bible/bible'
import { BOOKS, getBook } from '../bible/books'
import { formatRange, groupVerses, TRANSLATION } from '../bible/refs'
import type { BibleIndex } from '../bible/types'
import { addVerses, liveVerses } from '../db/db'

export default function BibleAddPage() {
  const navigate = useNavigate()
  const [index, setIndex] = useState<BibleIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [book, setBook] = useState<string | null>(null)
  const [chapter, setChapter] = useState<number | null>(null)
  const [texts, setTexts] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [anchor, setAnchor] = useState<number | null>(null)

  const mine = useLiveQuery(() => liveVerses(), [])
  const added = useMemo(() => new Set((mine ?? []).map((v) => v.key)), [mine])

  useEffect(() => {
    loadIndex(TRANSLATION).then(setIndex).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
  }, [])

  useEffect(() => {
    setTexts(null)
    setSelected([])
    setAnchor(null)
    if (!book || !chapter) return
    loadBook(TRANSLATION, book)
      .then((chapters) => setTexts(chapters[chapter - 1] ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
  }, [book, chapter])

  const key = (verse: number) => `${TRANSLATION}:${book}:${chapter}:${verse}`
  const hasText = (verse: number) => !!texts && !!texts[verse - 1]

  /**
   * Выбор стихов. Первое касание отмечает стих, второе на другом стихе выделяет весь диапазон между ними.
   * Дальше касания по одному добавляют и снимают отдельные стихи.
   */
  function tap(verse: number) {
    if (!hasText(verse) || added.has(key(verse))) return
    if (selected.length === 0) {
      setSelected([verse])
      setAnchor(verse)
    } else if (anchor !== null && selected.length === 1 && verse !== anchor) {
      const [a, b] = [Math.min(anchor, verse), Math.max(anchor, verse)]
      const range: number[] = []
      for (let n = a; n <= b; n++) if (hasText(n) && !added.has(key(n))) range.push(n)
      setSelected(range)
      setAnchor(null)
    } else {
      const next = selected.includes(verse) ? selected.filter((n) => n !== verse) : [...selected, verse].sort((x, y) => x - y)
      setSelected(next)
      setAnchor(next.length === 1 ? next[0] : null)
    }
  }

  function selectAll() {
    if (!texts) return
    setSelected(texts.map((_, i) => i + 1).filter((n) => hasText(n) && !added.has(key(n))))
    setAnchor(null)
  }

  async function save() {
    if (!book || !chapter || selected.length === 0) return
    await addVerses(selected.map((verse) => ({ book, chapter, verse })))
    navigate('/verses')
  }

  const summary = book && chapter
    ? groupVerses(selected.map((verse) => ({ book, chapter, verse }))).map(formatRange).join(', ')
    : ''

  if (error) {
    return (
      <>
        <Link to="/verses" className="back">← Мои стихи</Link>
        <h1>Добавить стихи</h1>
        <p className="notice error" role="status">{error}</p>
      </>
    )
  }
  if (!index) return <p className="muted-block">Загрузка…</p>

  // ---- Шаг 1: книга ----
  if (!book) {
    return (
      <>
        <Link to="/verses" className="back">← Мои стихи</Link>
        <h1>Выберите книгу</h1>
        {(['ot', 'nt'] as const).map((t) => (
          <section key={t}>
            <h2>{t === 'ot' ? 'Ветхий Завет' : 'Новый Завет'}</h2>
            <div className="chips">
              {BOOKS.filter((b) => b.testament === t).map((b) => (
                <button key={b.id} className="chip" onClick={() => setBook(b.id)}>{b.name}</button>
              ))}
            </div>
          </section>
        ))}
      </>
    )
  }

  const meta = getBook(book)!
  const verseCounts = index.books.find((b) => b.id === book)?.verses ?? []

  // ---- Шаг 2: глава ----
  if (!chapter) {
    return (
      <>
        <button className="back linklike" onClick={() => setBook(null)}>← Книги</button>
        <h1>{meta.name}</h1>
        <h2>Глава</h2>
        <div className="numgrid">
          {verseCounts.map((_, i) => (
            <button key={i} className="chip num" onClick={() => setChapter(i + 1)}>{i + 1}</button>
          ))}
        </div>
      </>
    )
  }

  // ---- Шаг 3: стихи ----
  return (
    <>
      <button className="back linklike" onClick={() => setChapter(null)}>← {meta.name}, главы</button>
      <h1>{meta.name} {chapter}</h1>
      <p className="muted-block">
        Коснитесь первого стиха, затем последнего: выделится весь отрывок. Остальные стихи можно добавлять и снимать по одному.
      </p>
      <div className="row">
        <button className="btn ghost" onClick={selectAll} disabled={!texts}>Вся глава</button>
        <button className="btn ghost" onClick={() => { setSelected([]); setAnchor(null) }} disabled={selected.length === 0}>Сбросить</button>
      </div>

      {!texts && <p className="muted-block">Загрузка…</p>}
      <ol className="versepick">
        {texts?.map((t, i) => {
          const n = i + 1
          if (!t) return null // в издании этого стиха нет
          const isAdded = added.has(key(n))
          const isSel = selected.includes(n)
          return (
            <li key={n}>
              <button
                className={`verse${isSel ? ' sel' : ''}${isAdded ? ' added' : ''}`}
                onClick={() => tap(n)}
                aria-pressed={isSel}
                disabled={isAdded}
              >
                <span className="vnum">{n}</span>
                <span className="vtext">{t}</span>
                {isAdded && <span className="vtag">в списке</span>}
              </button>
            </li>
          )
        })}
      </ol>

      <div className="reveal-bar">
        <span className="counter">{selected.length > 0 ? summary : 'Ничего не выбрано'}</span>
        <button className="btn primary" disabled={selected.length === 0} onClick={save}>
          Добавить{selected.length > 0 ? ` (${selected.length})` : ''}
        </button>
      </div>
    </>
  )
}
