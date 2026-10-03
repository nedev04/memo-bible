import { useEffect, useMemo, useRef, useState } from 'react'
import { firstChar, flattenWords, normalize, visibleMask } from '../logic/exercises'
import type { ExerciseProps } from './types'
import WordFlow from './WordFlow'

export default function FirstLetters({ content, difficulty, onComplete }: ExerciseProps) {
  const words = useMemo(() => flattenWords(content), [content])
  const visible = useMemo(() => visibleMask(words, difficulty), [words, difficulty])
  const letters = useMemo(() => words.map(firstChar), [words])
  const total = letters.filter((l) => l !== null).length

  const next = (from: number) => {
    let i = from
    while (i < words.length && letters[i] === null) i++
    return i
  }

  const [pos, setPos] = useState(() => next(0))
  const [mistakes, setMistakes] = useState<Set<number>>(new Set())
  const [flash, setFlash] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const done = pos >= words.length
  const doneCount = letters.slice(0, pos).filter((l) => l !== null).length

  useEffect(() => {
    document.querySelector('.cur')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [pos])

  function onInput(value: string) {
    const ch = [...value].pop()
    if (!ch || done) return
    if (normalize(ch) === letters[pos]) {
      setPos(next(pos + 1))
    } else {
      setMistakes((m) => new Set(m).add(pos))
      setFlash((f) => f + 1)
    }
  }

  function hint() {
    if (done) return
    setMistakes((m) => new Set(m).add(pos))
    setPos(next(pos + 1))
    inputRef.current?.focus()
  }

  const score = total === 0 ? 100 : Math.round(((total - mistakes.size) / total) * 100)

  return (
    <div className="exwrap">
      <p className="hint">Вводите первую букву каждого слова по порядку.</p>
      <WordFlow
        words={words}
        renderWord={(w, i) => {
          const shown = i < pos || visible[i]
          const cls = i === pos && !done ? `cur w-${flash % 2}` : i < pos && mistakes.has(i) ? 'missed' : undefined
          return <span className={cls}>{shown ? w.raw : '___'}</span>
        }}
      />

      <div className="reveal-bar">
        {done ? (
          <>
            <span className="counter">Точность {score}%</span>
            <button className="btn primary" onClick={() => onComplete(score)}>Готово</button>
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              className="letter-input"
              value=""
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="Буква"
              aria-label="Первая буква слова"
              onChange={(e) => onInput(e.target.value)}
            />
            <span className="counter">{doneCount} / {total}</span>
            <button className="btn ghost" onClick={hint}>Подсказка</button>
          </>
        )}
      </div>
    </div>
  )
}
