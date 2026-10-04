import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { db } from '../db/db'
import { exerciseComponents } from '../exercises'
import { DIFFICULTY_LABEL, EXERCISES } from '../logic/config'
import { applyAttempt, calcPoints, exerciseLink, recommend, sameDay, type Recommendation } from '../logic/progress'
import type { Attempt, Difficulty, ExerciseId } from '../types'

interface Outcome {
  points: number
  leveledUp: boolean
  leveledDown: number
  newLevel: number
  next: Recommendation
}

/** key по location.key: при переходе к следующему упражнению состояние сбрасывается */
export default function ExercisePage() {
  const location = useLocation()
  return <ExerciseInner key={location.key} />
}

function ExerciseInner() {
  const params = useParams()
  const textId = Number(params.id)
  const exerciseId = params.exerciseId as ExerciseId
  const [search] = useSearchParams()
  const d = Number(search.get('d'))
  const difficulty = (d >= 1 && d <= 3 ? d : 1) as Difficulty

  const text = useLiveQuery(() => db.texts.get(textId), [textId])
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const Exercise = exerciseComponents[exerciseId]
  if (!text) return null
  if (!Exercise) return <p>Это упражнение ещё не готово. <Link to={`/text/${textId}`}>Назад</Link></p>

  async function finish(score: number) {
    if (!text) return
    const now = Date.now()
    const history = await db.attempts.where('textId').equals(textId).toArray()
    const sameToday = history.filter(
      (a) => a.exercise === exerciseId && a.difficulty === difficulty && sameDay(a.createdAt, now),
    ).length
    const attempt: Attempt = {
      textId,
      exercise: exerciseId,
      difficulty,
      score,
      points: calcPoints(exerciseId, difficulty, score, sameToday),
      createdAt: now,
    }
    const result = applyAttempt(text, attempt, history, now)
    await db.transaction('rw', db.texts, db.attempts, async () => {
      await db.attempts.add(attempt)
      await db.texts.put(result.text)
    })
    setOutcome({
      points: attempt.points,
      leveledUp: result.leveledUp,
      leveledDown: result.leveledDown,
      newLevel: result.text.level,
      next: recommend(result.text, [...history, attempt], now),
    })
  }

  if (outcome) {
    return (
      <div className="result">
        <h1>+{outcome.points} очков</h1>
        {outcome.points === 0 && <p>Очки за повторы в один день заканчиваются — попробуйте другое упражнение.</p>}
        {outcome.leveledUp && <p className="good">Новый уровень: {outcome.newLevel}!</p>}
        {outcome.leveledDown > 0 && <p>Уровень снижен до {outcome.newLevel}. Повторим скоро.</p>}
        <div className="result-actions">
          <Link className="btn primary" replace to={exerciseLink(textId, outcome.next)}>
            Дальше: {EXERCISES[outcome.next.exercise].title} · {DIFFICULTY_LABEL[outcome.next.difficulty].toLowerCase()}
          </Link>
          <Link className="btn ghost" to={`/text/${textId}`}>К тексту</Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="row between">
        <Link to={`/text/${textId}`} className="back">← Выйти</Link>
        <strong>{EXERCISES[exerciseId].title}</strong>
      </div>
      <Exercise content={text.content} difficulty={difficulty} onComplete={finish} />
    </>
  )
}
