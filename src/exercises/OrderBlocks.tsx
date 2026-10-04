import { useMemo, useState } from 'react'
import { buildBlocks, scoreOrder, shuffleBlocks } from '../logic/exercises'
import type { ExerciseProps } from './types'

export default function OrderBlocks({ content, difficulty, onComplete }: ExerciseProps) {
  const correct = useMemo(() => buildBlocks(content, difficulty), [content, difficulty])
  const order = useMemo(() => shuffleBlocks(correct), [correct]) // порядок показа блоков в «куче»
  const [placed, setPlaced] = useState<number[]>([]) // индексы в массиве correct
  const [checked, setChecked] = useState(false)

  if (correct.length < 2) {
    return (
      <div className="exwrap">
        <p>Текст слишком короткий, чтобы разбить его на блоки.</p>
        <button className="btn primary" onClick={() => onComplete(100)}>Пропустить</button>
      </div>
    )
  }

  const pool = order.filter((i) => !placed.includes(i))
  const placedTexts = placed.map((i) => correct[i])
  const score = scoreOrder(placedTexts, correct)
  const allPlaced = placed.length === correct.length

  return (
    <div className="exwrap">
      <p className="hint">Нажимайте на блоки в том порядке, в котором они идут в тексте. Нажатие на выбранный блок возвращает его назад.</p>

      <h2>Ваш порядок</h2>
      {placed.length === 0 && <p className="empty">Пока ничего не выбрано</p>}
      <ol className="blocks placed">
        {placed.map((idx, pos) => {
          const state = checked ? (correct[pos] === correct[idx] ? 'ok' : 'bad') : ''
          return (
            <li key={idx}>
              <button className={`block ${state}`} disabled={checked} onClick={() => setPlaced(placed.filter((p) => p !== idx))}>
                {correct[idx]}
              </button>
            </li>
          )
        })}
      </ol>

      {!checked && pool.length > 0 && (
        <>
          <h2>Блоки</h2>
          <ul className="blocks">
            {pool.map((idx) => (
              <li key={idx}>
                <button className="block" onClick={() => setPlaced([...placed, idx])}>{correct[idx]}</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {checked && score < 100 && (
        <>
          <h2>Правильный порядок</h2>
          <ol className="blocks">
            {correct.map((b, i) => <li key={i}><div className="block static">{b}</div></li>)}
          </ol>
        </>
      )}

      <div className="reveal-bar">
        {checked ? (
          <>
            <span className="counter">Точность {score}%</span>
            <button className="btn primary" onClick={() => onComplete(score)}>Готово</button>
          </>
        ) : (
          <>
            <span className="counter">{placed.length} / {correct.length}</span>
            <button className="btn primary" disabled={!allPlaced} onClick={() => setChecked(true)}>Проверить</button>
          </>
        )}
      </div>
    </div>
  )
}
