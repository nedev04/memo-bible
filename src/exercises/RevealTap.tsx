import { useMemo, useState } from 'react'
import { parseLines } from '../logic/parser'
import type { Difficulty } from '../types'
import type { ExerciseProps } from './types'

interface Chunk {
  text: string
  newLine: boolean
  blankBefore: boolean
}

/** Лёгкая — по 1 слову, средняя — по 3 слова, тяжёлая — строка целиком */
const CHUNK_SIZE: Record<Difficulty, number> = { 1: 1, 2: 3, 3: Infinity }

function buildChunks(content: string, difficulty: Difficulty): Chunk[] {
  const size = CHUNK_SIZE[difficulty]
  const chunks: Chunk[] = []
  parseLines(content).forEach((line, lineIndex) => {
    for (let i = 0; i < line.words.length; i += size) {
      chunks.push({
        text: line.words.slice(i, i + size).join(' '),
        newLine: i === 0 && lineIndex > 0,
        blankBefore: i === 0 && line.blankBefore,
      })
    }
  })
  return chunks
}

export default function RevealTap({ content, difficulty, onComplete }: ExerciseProps) {
  const chunks = useMemo(() => buildChunks(content, difficulty), [content, difficulty])
  const [shown, setShown] = useState(0)
  const done = shown >= chunks.length

  return (
    <div className="reveal" onClick={() => !done && setShown((s) => s + 1)}>
      <div className="reveal-text">
        {shown === 0 && <p className="hint">Коснитесь экрана, чтобы открыть первый фрагмент</p>}
        {chunks.slice(0, shown).map((c, i) => (
          <span key={i}>
            {c.blankBefore && <br />}
            {c.newLine && <br />}
            <span className={i === shown - 1 && !done ? 'fresh' : undefined}>{c.text}</span>{' '}
          </span>
        ))}
      </div>

      <div className="reveal-bar" onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost" disabled={shown === 0} onClick={() => setShown((s) => Math.max(0, s - 1))}>
          Назад
        </button>
        <span className="counter">{shown} / {chunks.length}</span>
        {done ? (
          <button className="btn primary" onClick={() => onComplete(100)}>Готово</button>
        ) : (
          <button className="btn ghost" onClick={() => setShown(chunks.length)}>Весь текст</button>
        )}
      </div>
    </div>
  )
}
