import { useMemo } from 'react'
import { flattenWords } from '../logic/exercises'
import TypedText from './TypedText'
import type { ExerciseProps } from './types'
import { useWordTyper } from './useWordTyper'

export default function FullInput({ content, difficulty, onComplete }: ExerciseProps) {
  const words = useMemo(() => flattenWords(content), [content])
  const given = useMemo(() => words.map(() => false), [words])
  const typer = useWordTyper(words, given)
  const { lines } = typer

  const lineStarts = useMemo(() => new Set(lines.map((l) => l.start)), [lines])
  const stanzaStarts = useMemo(
    () => new Set(lines.filter((l, i) => i === 0 || l.blankBefore).map((l) => l.start)),
    [lines],
  )

  // Лёгкий: видна первая буква каждой строки. Средний: первое слово каждого блока. Тяжёлый: чистый лист.
  const placeholder = (li: number) => {
    const w = words[lines[li].start]
    if (difficulty === 1) return `${[...w.core][0] ?? ''}…`
    if (difficulty === 2 && stanzaStarts.has(lines[li].start)) return `${w.raw} …`
    return null
  }
  const slotHint = (w: (typeof words)[number], i: number) => {
    if (difficulty === 1 && lineStarts.has(i)) return [...w.core][0]
    if (difficulty === 2 && stanzaStarts.has(i)) return w.core
    return undefined
  }

  return (
    <div className="exwrap">
      <p className="hint">
        {typer.focused || typer.done
          ? 'Вводите текст по памяти. Знаки препинания и заглавные буквы не нужны. Ошибочное слово откроется и станет красным.'
          : 'Коснитесь текста, чтобы открыть клавиатуру.'}
      </p>
      <TypedText typer={typer} placeholder={placeholder} slotHint={slotHint} />
      <div className="reveal-bar" onClick={(e) => e.stopPropagation()}>
        {typer.done ? (
          <>
            <span className="counter">Точность {typer.score}%</span>
            <button className="btn primary" onClick={() => onComplete(typer.score)}>Готово</button>
          </>
        ) : (
          <>
            <span className="counter">{typer.doneCount} / {typer.total}</span>
            <button className="btn ghost" onClick={typer.reveal}>Показать слово</button>
          </>
        )}
      </div>
    </div>
  )
}
