import { useMemo, useState } from 'react'
import { buildNextLineTasks, fromLines, toLines, type NextLineTask } from '../logic/exercises'
import TypedText from './TypedText'
import type { ExerciseProps } from './types'
import { useWordTyper } from './useWordTyper'

interface TaskProps {
  task: NextLineTask
  index: number
  count: number
  onNext: (total: number, bad: number) => void
}

function Task({ task, index, count, onNext }: TaskProps) {
  const words = useMemo(() => fromLines(task.answer), [task])
  const given = useMemo(() => words.map((_, i) => i < task.givenCount), [words, task])
  const typer = useWordTyper(words, given)
  const last = index === count - 1
  const lines = task.answer.length

  return (
    <div className="exwrap">
      <p className="hint">
        {typer.focused || typer.done
          ? `Введите ${lines === 1 ? 'следующую строку' : 'следующие две строки'}. Ошибочное слово откроется и станет красным.`
          : 'Коснитесь текста, чтобы открыть клавиатуру.'}
      </p>
      <h2>Строка</h2>
      <blockquote className="cue">{task.cue.join(' ')}</blockquote>
      <h2>Что дальше?</h2>
      <TypedText typer={typer} />
      <div className="reveal-bar" onClick={(e) => e.stopPropagation()}>
        <span className="counter">{index + 1} / {count}</span>
        {typer.done ? (
          <button className="btn primary" onClick={() => onNext(typer.total, typer.bad.size)}>
            {last ? 'Завершить' : 'Дальше'}
          </button>
        ) : (
          <button className="btn ghost" onClick={typer.reveal}>Показать слово</button>
        )}
      </div>
    </div>
  )
}

export default function NextLine({ content, difficulty, onComplete }: ExerciseProps) {
  const tasks = useMemo(() => buildNextLineTasks(toLines(content), difficulty), [content, difficulty])
  const [index, setIndex] = useState(0)
  const [stats, setStats] = useState({ total: 0, bad: 0 })

  if (tasks.length === 0) {
    return (
      <div className="exwrap">
        <p>В тексте слишком мало строк для этого упражнения.</p>
        <button className="btn primary" onClick={() => onComplete(100)}>Пропустить</button>
      </div>
    )
  }

  function next(total: number, bad: number) {
    const s = { total: stats.total + total, bad: stats.bad + bad }
    if (index === tasks.length - 1) {
      onComplete(s.total === 0 ? 100 : Math.round(((s.total - s.bad) / s.total) * 100))
    } else {
      setStats(s)
      setIndex(index + 1)
    }
  }

  return <Task key={index} task={tasks[index]} index={index} count={tasks.length} onNext={next} />
}
