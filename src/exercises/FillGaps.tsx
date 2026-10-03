import { useMemo, useState } from 'react'
import { buildGaps, flattenWords } from '../logic/exercises'
import type { ExerciseProps } from './types'
import WordFlow from './WordFlow'

export default function FillGaps({ content, difficulty, onComplete }: ExerciseProps) {
  const words = useMemo(() => flattenWords(content), [content])
  const gaps = useMemo(() => buildGaps(words, difficulty), [words, difficulty])
  const gapByWord = useMemo(() => new Map(gaps.map((g, i) => [g.wordIndex, i])), [gaps])

  const [solved, setSolved] = useState<boolean[]>(() => gaps.map(() => false))
  const [wrong, setWrong] = useState<string[][]>(() => gaps.map(() => []))
  const [cur, setCur] = useState(0)

  const solvedCount = solved.filter(Boolean).length
  const done = gaps.length > 0 && solvedCount === gaps.length
  const mistakeGaps = wrong.filter((w) => w.length > 0).length
  const score = gaps.length === 0 ? 100 : Math.round(((gaps.length - mistakeGaps) / gaps.length) * 100)

  if (gaps.length === 0) {
    return (
      <div className="exwrap">
        <p>В тексте слишком мало слов для этого упражнения.</p>
        <button className="btn primary" onClick={() => onComplete(100)}>Пропустить</button>
      </div>
    )
  }

  function choose(option: string) {
    const gap = gaps[cur]
    if (option === gap.answer) {
      const nextSolved = solved.map((s, i) => (i === cur ? true : s))
      setSolved(nextSolved)
      // переходим к ближайшему нерешённому пропуску
      for (let k = 1; k <= gaps.length; k++) {
        const j = (cur + k) % gaps.length
        if (!nextSolved[j]) { setCur(j); break }
      }
    } else {
      setWrong((w) => w.map((list, i) => (i === cur ? [...list, option] : list)))
    }
  }

  return (
    <div className="exwrap">
      <p className="hint">Нажмите на пропуск и выберите слово.</p>
      <WordFlow
        words={words}
        renderWord={(w, i) => {
          const g = gapByWord.get(i)
          if (g === undefined) return w.raw
          if (solved[g]) {
            return <span>{w.lead}<span className="filled">{w.core}</span>{w.trail}</span>
          }
          return (
            <span>
              {w.lead}
              <button className={g === cur ? 'gap cur' : 'gap'} onClick={() => setCur(g)} aria-label="Пропуск">
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              </button>
              {w.trail}
            </span>
          )
        }}
      />

      <div className="reveal-bar col">
        {done ? (
          <div className="row between full">
            <span className="counter">Точность {score}%</span>
            <button className="btn primary" onClick={() => onComplete(score)}>Готово</button>
          </div>
        ) : (
          <>
            <div className="options">
              {gaps[cur].options.map((o) => (
                <button key={o} className="btn ghost" disabled={wrong[cur].includes(o)} onClick={() => choose(o)}>
                  {o}
                </button>
              ))}
            </div>
            <span className="counter">{solvedCount} / {gaps.length}</span>
          </>
        )}
      </div>
    </div>
  )
}
