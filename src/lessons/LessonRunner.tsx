import { useState, type ComponentType } from 'react'
import ProgressBar from '../components/ProgressBar'
import { PASS_SCORE, PARTIAL_SCORE } from '../logic/config'
import FillGapsVerse from './exercises/FillGapsVerse'
import PartialVerse from './exercises/PartialVerse'
import RevealVerse from './exercises/RevealVerse'
import { KIND_TITLE, type ExerciseKind, type LessonStep, type StepOutcome, type StepProps, type StepResult, type VerseText } from './types'

const COMPONENTS: Record<ExerciseKind, ComponentType<StepProps>> = {
  reveal: RevealVerse,
  partial: PartialVerse,
  fillGaps: FillGapsVerse,
}

interface Props {
  steps: LessonStep[]
  texts: Map<string, VerseText>
  /** Сохраняет результат (сила стиха, журнал) и возвращает полученный опыт */
  record: (step: LessonStep, result: StepResult) => Promise<StepOutcome>
  /** Закрыть урок (вернуться к стихам) */
  onClose: () => void
  /** Начать следующий урок */
  onAnother: () => void
}

export default function LessonRunner({ steps, texts, record, onClose, onAnother }: Props) {
  const [queue, setQueue] = useState<LessonStep[]>(steps)
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<StepResult | null>(null)
  const [xp, setXp] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [changes, setChanges] = useState<Map<string, 'up' | 'down'>>(new Map())
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const step = queue[index]

  async function onAnswer(r: StepResult) {
    if (result || busy || done) return
    setBusy(true)
    try {
      const outcome = await record(step, r)
      setXp((x) => x + outcome.xp)
      setChanges((prev) => {
        const next = new Map(prev)
        for (const c of outcome.changes) if (c.change !== 'same') next.set(c.key, c.change)
        return next
      })
    } finally {
      setBusy(false)
    }
    if (r.neutral) {
      advance(queue.length)
      return
    }
    setResult(r)
    // Ошибка: то же упражнение будет ещё раз в конце урока (один раз)
    if (r.score < PASS_SCORE && !step.retry) {
      setMistakes((m) => m + 1)
      setQueue((q) => [...q, { ...step, id: `${step.id}:retry`, retry: true }])
    }
  }

  function advance(length = queue.length) {
    setResult(null)
    if (index + 1 >= length) setDone(true)
    else setIndex(index + 1)
  }

  function close() {
    if (done || confirm('Выйти из урока? Результаты уже пройденных упражнений сохранены.')) onClose()
  }

  if (done) {
    const list = [...changes.entries()]
    return (
      <div className="result lesson-done">
        <h1>Урок пройден</h1>
        <p className="xp">+{xp} опыта</p>
        <p className="muted-block">{mistakes === 0 ? 'Без ошибок.' : `Ошибок: ${mistakes}.`}</p>
        {list.length > 0 && (
          <ul className="changes">
            {list.map(([key, change]) => (
              <li key={key} className={change}>
                {change === 'up' ? '▲' : '▼'} {texts.get(key)?.ref ?? key}: {change === 'up' ? 'запомнился лучше' : 'нужно повторить'}
              </li>
            ))}
          </ul>
        )}
        <div className="result-actions">
          <button className="btn primary" onClick={onAnother}>Ещё урок</button>
          <button className="btn ghost" onClick={onClose}>К стихам</button>
        </div>
      </div>
    )
  }

  const verse = texts.get(step.verseKeys[0])!
  const Exercise = COMPONENTS[step.kind]
  const total = queue.length
  const finished = index + (result ? 1 : 0)

  return (
    <div className="lesson">
      <div className="lesson-top">
        <button className="lesson-close" onClick={close} aria-label="Выйти из урока">✕</button>
        <ProgressBar value={finished} max={total} />
      </div>

      <h1 className="lesson-title">
        {KIND_TITLE[step.kind]} <small>{verse.ref}{step.retry ? ' · повтор' : ''}</small>
      </h1>

      <Exercise key={step.id} verse={verse} settings={step.settings} onAnswer={onAnswer} />

      {result && (
        <div className={`feedback ${result.score >= PASS_SCORE ? 'ok' : result.score >= PARTIAL_SCORE ? 'mid' : 'bad'}`} role="status">
          <strong>
            {result.score >= PASS_SCORE ? 'Верно!' : result.score >= PARTIAL_SCORE ? 'Почти верно' : 'Есть ошибки'}
          </strong>
          {result.detail && <span>{result.detail}</span>}
          {result.score < PASS_SCORE && !step.retry && <small>Это упражнение повторится в конце урока.</small>}
          <button className="btn primary" autoFocus onClick={() => advance()}>Продолжить</button>
        </div>
      )}
    </div>
  )
}
