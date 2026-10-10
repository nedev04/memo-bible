import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { loadBook } from '../bible/bible'
import { formatRange, parseKey, TRANSLATION } from '../bible/refs'
import { liveLessons, liveVerses, recentWhereBooks, recordVerseResult, saveLesson } from '../db/db'
import { patternType, planOfType, resolveType } from '../lessons/generator'
import LessonRunner, { type LessonSummary } from '../lessons/LessonRunner'
import { stepTier, type LessonStep, type StepOutcome, type StepResult, type VerseText } from '../lessons/types'
import type { LessonType } from '../types'

interface Loaded {
  type: LessonType
  steps: LessonStep[]
  texts: Map<string, VerseText>
  replay: boolean
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
  const [params] = useSearchParams()
  const replayUid = params.get('replay')
  const [round, setRound] = useState(0)
  const [state, setState] = useState<'loading' | 'empty' | 'error' | Loaded>('loading')
  const saving = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let alive = true
    setState('loading')
    ;(async () => {
      try {
        const [verses, lessons, recentWhere] = await Promise.all([liveVerses(), liveLessons(), recentWhereBooks()])
        const now = Date.now()
        let type: LessonType | null
        let only: Set<string> | undefined
        if (replayUid) {
          const l = lessons.find((x) => x.uid === replayUid)
          if (!l || l.verseKeys.length === 0) return alive && setState('empty')
          type = l.type
          only = new Set(l.verseKeys)
        } else {
          type = resolveType(patternType(lessons.length), verses, now)
        }
        if (!type) return alive && setState('empty')

        const steps = planOfType(type, verses, now, Math.random, only, { recentWhere })
        if (steps.length === 0) return alive && setState('empty')
        const texts = await loadTexts([...new Set(steps.flatMap((s) => s.verseKeys))])
        const playable = steps.filter((s) => s.verseKeys.every((k) => texts.has(k)))
        if (alive) setState(playable.length === 0 ? 'error' : { type, steps: playable, texts, replay: !!replayUid })
      } catch {
        if (alive) setState('error')
      }
    })()
    return () => { alive = false }
  }, [round, replayUid])

  async function record(step: LessonStep, result: StepResult): Promise<StepOutcome> {
    const tier = stepTier(step)
    if (result.neutral || tier === null) return { xp: 0, changes: [] }
    let xp = 0
    const changes: StepOutcome['changes'] = []
    for (const key of step.verseKeys) {
      const score = result.perVerse?.[key] ?? result.score
      const r = await recordVerseResult(key, { exercise: step.kind, tier, score })
      xp += r.xp
      changes.push({ key, change: r.change })
    }
    return { xp, changes }
  }

  function onFinish(summary: LessonSummary) {
    if (state === 'loading' || state === 'empty' || state === 'error' || state.replay) return // повтор в путь не записывается
    saving.current = saveLesson({ type: state.type, status: 'done', verseKeys: summary.keys, xp: summary.xp, mistakes: summary.mistakes })
  }

  async function another() {
    await saving.current
    if (replayUid) navigate('/lesson', { replace: true })
    else setRound((r) => r + 1)
  }

  if (state === 'loading') return <p className="muted-block">Готовим урок…</p>
  if (state === 'empty') {
    return (
      <>
        <h1>Урок</h1>
        <p className="empty">
          {replayUid
            ? 'Для этого урока не нашлось подходящих стихов: возможно, они удалены из списка.'
            : 'Сначала добавьте стихи, которые хотите учить.'}
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => navigate('/add')}>Добавить стихи</button>
          <Link className="btn ghost" to="/">На главную</Link>
        </div>
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
      key={`${round}:${replayUid ?? ''}`}
      type={state.type}
      steps={state.steps}
      texts={state.texts}
      record={record}
      onClose={() => navigate('/')}
      onAnother={another}
      onFinish={onFinish}
    />
  )
}
