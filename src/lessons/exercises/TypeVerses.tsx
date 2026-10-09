import { useEffect, useMemo, useRef } from 'react'
import TypedText from '../../exercises/TypedText'
import { useWordTyper } from '../../exercises/useWordTyper'
import { firstChar, fromLines } from '../../logic/exercises'
import type { StepProps } from '../types'

/**
 * Тестовое задание: ввести стих (или несколько стихов подряд) по памяти с чистого листа.
 * Знаки препинания ставятся сами, ошибочное слово сразу открывается красным.
 */
export default function TypeVerses({ verses, onAnswer }: StepProps) {
  const words = useMemo(() => fromLines(verses.map((v) => v.text.split(/\s+/).filter(Boolean))), [verses])
  const given = useMemo(() => words.map(() => false), [words])
  const typer = useWordTyper(words, given)
  const answered = useRef(false)

  useEffect(() => {
    if (!typer.done || answered.current) return
    answered.current = true
    // Результат по каждому стиху отдельно: каждый стих — своя строка
    const perVerse: Record<string, number> = {}
    typer.lines.forEach((ln, li) => {
      let total = 0
      let bad = 0
      for (let i = ln.start; i < ln.end; i++) {
        if (firstChar(words[i]) === null) continue
        total++
        if (typer.bad.has(i)) bad++
      }
      if (verses[li]) perVerse[verses[li].key] = total === 0 ? 100 : Math.round(((total - bad) / total) * 100)
    })
    onAnswer({ score: typer.score, perVerse })
  }, [typer.done]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="exwrap">
      <p className="hint">
        {typer.focused || typer.done
          ? verses.length > 1
            ? 'Введите стихи по памяти, каждый с новой строки. Знаки препинания ставятся сами.'
            : 'Введите стих по памяти. Знаки препинания ставятся сами.'
          : 'Коснитесь текста, чтобы открыть клавиатуру.'}
      </p>
      <TypedText typer={typer} />
      {!typer.done && (
        <div className="reveal-bar" onClick={(e) => e.stopPropagation()}>
          <span className="counter">{typer.doneCount} / {typer.total}</span>
          <button className="btn ghost" onClick={typer.reveal}>Показать слово</button>
        </div>
      )}
    </div>
  )
}
