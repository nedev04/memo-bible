import { useEffect, useMemo, useState } from 'react'
import { buildGaps, flattenWords } from '../logic/exercises'
import type { ExerciseProps } from './types'
import WordFlow from './WordFlow'

export default function FillGaps({ content, difficulty, onComplete }: ExerciseProps) {
  const words = useMemo(() => flattenWords(content), [content])
  const gaps = useMemo(() => buildGaps(words, difficulty), [words, difficulty])
  const gapByWord = useMemo(() => new Map(gaps.map((g, i) => [g.wordIndex, i])), [gaps])

  const [solved, setSolved] = useState<boolean[]>(() => gaps.map(() => false))
  /** wrong[i] — на пропуске i была ошибка (слово при этом открывается и подсвечивается красным) */
  const [wrong, setWrong] = useState<boolean[]>(() => gaps.map(() => false))
  const [cur, setCur] = useState(0)

  // Если следующий пропуск ушёл из видимой зоны — прокручиваем к нему
  useEffect(() => {
    const el = document.querySelector('.gap.cur')
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top < 90 || top > window.innerHeight * 0.55) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [cur])

  const solvedCount = solved.filter(Boolean).length
  const done = gaps.length > 0 && solvedCount === gaps.length
  const mistakeGaps = wrong.filter(Boolean).length
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
    const isRight = option === gap.answer
    // Ошибка не заставляет гадать: правильное слово сразу встаёт на место, но помечается красным
    if (!isRight) setWrong((w) => w.map((x, i) => (i === cur ? true : x)))
    const nextSolved = solved.map((s, i) => (i === cur ? true : s))
    setSolved(nextSolved)
    for (let k = 1; k <= gaps.length; k++) {
      const j = (cur + k) % gaps.length
      if (!nextSolved[j]) { setCur(j); break }
    }
  }

  return (
    <div className="exwrap">
      <p className="hint">Нажмите на пропуск и выберите слово. Если ошибётесь, верное слово встанет на место и станет красным.</p>
      <WordFlow
        words={words}
        renderWord={(w, i) => {
          const g = gapByWord.get(i)
          if (g === undefined) return w.raw
          if (solved[g]) {
            return <span>{w.lead}<span className={wrong[g] ? 'filled bad' : 'filled'}>{w.core}</span>{w.trail}</span>
          }
          return (
            <span>
              {w.lead}
              <button className={g === cur ? 'gap cur' : 'gap'} onClick={() => setCur(g)} aria-label="Пропуск">
                {w.core}
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
                <button key={o} className="btn ghost" onClick={() => choose(o)}>
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
