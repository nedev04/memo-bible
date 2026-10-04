import { useEffect, useMemo, useRef, useState } from 'react'
import { buildPartialMask, flattenWords } from '../logic/exercises'
import type { ExerciseProps } from './types'
import WordFlow from './WordFlow'

const PEEK_MS = 1600

export default function PartialHidden({ content, difficulty, onComplete }: ExerciseProps) {
  const words = useMemo(() => flattenWords(content), [content])
  const [round, setRound] = useState(0)
  // round меняется по кнопке «Новая маска» — тогда прячутся другие буквы и слова
  const mask = useMemo(() => buildPartialMask(words, difficulty), [words, difficulty, round]) // eslint-disable-line react-hooks/exhaustive-deps
  const [peek, setPeek] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function peekWord(i: number) {
    window.clearTimeout(timer.current)
    setPeek(i)
    timer.current = window.setTimeout(() => setPeek(null), PEEK_MS)
  }

  return (
    <div className="exwrap">
      <p className="hint">Читайте текст вслух. Коснитесь скрытого слова, чтобы на секунду увидеть его целиком.</p>
      <WordFlow
        words={words}
        renderWord={(w, i) => {
          const m = mask[i]
          if (m === null) return w.raw
          const open = peek === i
          return (
            <span>
              {w.lead}
              <button className={open ? 'peek open' : 'peek'} onClick={() => peekWord(i)}>
                {open ? w.core : m}
              </button>
              {w.trail}
            </span>
          )
        }}
      />
      <div className="reveal-bar">
        <button className="btn ghost" onClick={() => { setPeek(null); setRound((r) => r + 1) }}>Новая маска</button>
        <button className="btn primary" onClick={() => onComplete(100)}>Готово</button>
      </div>
    </div>
  )
}
