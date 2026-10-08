import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadBook } from '../bible/bible'
import { formatRange, parseKey, TRANSLATION } from '../bible/refs'
import { liveVerses, recordVerseResult } from '../db/db'
import { planLesson } from '../lessons/generator'
import LessonRunner from '../lessons/LessonRunner'
import { stepTier, type LessonStep, type StepOutcome, type StepResult, type VerseText } from '../lessons/types'

interface Loaded {
  steps: LessonStep[]
  texts: Map<string, VerseText>
}

/** Подгружает тексты стихов (и главы целиком, из неё берутся неверные варианты ответа) */
async function loadTexts(keys: string[]): Promise<Map<string, VerseText>> {
  const out = new Map<string, VerseText>()
  for (const key of keys) {
    const p = parseKey(key)
    if (!p) continue
    const chapters = await loadBook(TRANSLATION, p.book)
    const verses = chapters[p.chapter - 1] ?? []
    const text = verses[p.verse - 1]
    if (!text) continue
    out.set(key, {
      key, book: p.book, chapter: p.chapter, verse: p.verse,
      ref: formatRange({ book: p.book, chapter: p.chapter, from: p.verse, to: p.verse }),
      text,
      chapterText: verses.filter(Boolean).join(' '),
      bookChapters: chapters.length,
      chapterVerses: verses.length,
    })
  }
  return out
}

export default function LessonPage() {
  const navigate = useNavigate()
  const [round, setRound] = useState(0)
  const [state, setState] = useState<'loading' | 'empty' | 'error' | Loaded>('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    ;(async () => {
      try {
        const verses = await liveVerses()
        const steps = planLesson(verses, Date.now())
        if (steps.length === 0) return alive && setState('empty')
        const texts = await loadTexts([...new Set(steps.flatMap((s) => s.verseKeys))])
        const playable = steps.filter((s) => s.verseKeys.every((k) => texts.has(k)))
        if (alive) setState(playable.length === 0 ? 'error' : { steps: playable, texts })
      } catch {
        if (alive) setState('error')
      }
    })()
    return () => { alive = false }
  }, [round])

  async function record(step: LessonStep, result: StepResult): Promise<StepOutcome> {
    const tier = stepTier(step)
    if (result.neutral || tier === null) return { xp: 0, changes: [] }
    let xp = 0
    const changes: StepOutcome['changes'] = []
    for (const key of step.verseKeys) {
      const r = await recordVerseResult(key, { exercise: step.kind, tier, score: result.score })
      xp += r.xp
      changes.push({ key, change: r.change })
    }
    return { xp, changes }
  }

  if (state === 'loading') return <p className="muted-block">Готовим урок…</p>
  if (state === 'empty') {
    return (
      <>
        <h1>Урок</h1>
        <p className="empty">Сначала добавьте стихи, которые хотите учить.</p>
        <button className="btn primary" onClick={() => navigate('/add')}>Добавить стихи</button>
      </>
    )
  }
  if (state === 'error') {
    return (
      <>
        <h1>Урок</h1>
        <p className="notice error" role="status">Не удалось подготовить урок: текст стихов не загрузился. Проверьте соединение и попробуйте ещё раз.</p>
        <button className="btn primary" onClick={() => setRound((r) => r + 1)}>Повторить</button>
      </>
    )
  }

  return (
    <LessonRunner
      key={round}
      steps={state.steps}
      texts={state.texts}
      record={record}
      onClose={() => navigate('/verses')}
      onAnother={() => setRound((r) => r + 1)}
    />
  )
}
