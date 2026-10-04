import { useLiveQuery } from 'dexie-react-hooks'
import { db, liveTexts } from '../db/db'
import { EXERCISES, MAX_LEVEL } from '../logic/config'
import { dailyStats, exerciseStats, levelDistribution, memoryAccuracy, streaks } from '../logic/stats'

const DAY = 24 * 60 * 60 * 1000

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** Горизонтальная полоса: доля от max */
function Meter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <span className="meter" aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </span>
  )
}

export default function StatsPage() {
  const texts = useLiveQuery(() => liveTexts(), [])
  const attempts = useLiveQuery(() => db.attempts.toArray(), [])
  if (!texts || !attempts) return null

  const now = Date.now()
  const { current, best } = streaks(attempts, now)
  const days = dailyStats(attempts, now, 14)
  const maxPoints = Math.max(1, ...days.map((d) => d.points))
  const totalPoints = attempts.reduce((n, a) => n + a.points, 0)
  const levels = levelDistribution(texts)
  const maxLevelCount = Math.max(1, ...levels)
  const byExercise = exerciseStats(attempts)
  const maxCount = Math.max(1, ...byExercise.map((e) => e.count))

  const accNow = memoryAccuracy(attempts, now - 7 * DAY, now + 1)
  const accPrev = memoryAccuracy(attempts, now - 14 * DAY, now - 7 * DAY)
  const diff = accNow !== null && accPrev !== null ? accNow - accPrev : null

  if (attempts.length === 0) {
    return (
      <>
        <h1>Статистика</h1>
        <p className="empty">Пока нечего показывать. Пройдите первое упражнение, и здесь появятся серия дней, очки и точность.</p>
      </>
    )
  }

  return (
    <>
      <h1>Статистика</h1>

      <section className="streak">
        <span className="streak-num">{current}</span>
        <div>
          <strong>{plural(current, 'день', 'дня', 'дней')} подряд</strong>
          <small>Лучшая серия: {best} {plural(best, 'день', 'дня', 'дней')}</small>
        </div>
      </section>

      <dl className="facts">
        <div><dt>Очков всего</dt><dd>{totalPoints}</dd></div>
        <div><dt>Упражнений</dt><dd>{attempts.length}</dd></div>
        <div><dt>Текстов</dt><dd>{texts.length}</dd></div>
        <div><dt>Выучено</dt><dd>{levels[MAX_LEVEL - 1]}</dd></div>
      </dl>

      <h2>Очки за 14 дней</h2>
      <div className="chart" role="img" aria-label={`Очки по дням за две недели, всего ${days.reduce((n, d) => n + d.points, 0)}`}>
        {days.map((d, i) => (
          <div key={d.day} className={i === days.length - 1 ? 'col today' : 'col'} title={`${d.title}: ${d.points} очк., ${d.count} упр.`}>
            <span className="val">{d.points > 0 ? d.points : ''}</span>
            <span className="bar" style={{ height: `${Math.round((d.points / maxPoints) * 100)}%` }} />
            <span className="lab">{d.label}</span>
          </div>
        ))}
      </div>

      <h2>Точность за 7 дней</h2>
      {accNow === null ? (
        <p className="muted-block">За неделю не было упражнений на запоминание и проверку.</p>
      ) : (
        <p className="accuracy">
          <strong>{accNow}%</strong>
          {diff !== null && diff !== 0 && (
            <span className={diff > 0 ? 'up' : 'down'}> {diff > 0 ? '▲' : '▼'} {Math.abs(diff)} п.п. к прошлой неделе</span>
          )}
          {diff === 0 && <span> без изменений к прошлой неделе</span>}
          <small>Только упражнения на запоминание и проверку: в знакомстве ошибок не бывает.</small>
        </p>
      )}

      <h2>Тексты по уровням</h2>
      <ul className="bars">
        {levels.map((n, i) => (
          <li key={i}>
            <span className="bars-label">Ур. {i + 1}</span>
            <Meter value={n} max={maxLevelCount} />
            <span className="bars-val">{n}</span>
          </li>
        ))}
      </ul>

      <h2>По упражнениям</h2>
      <ul className="bars wide">
        {byExercise.map((e) => (
          <li key={e.exercise}>
            <span className="bars-label">{EXERCISES[e.exercise].title}</span>
            <Meter value={e.count} max={maxCount} />
            <span className="bars-val">{e.count} · {e.avgScore}%</span>
          </li>
        ))}
      </ul>
      <p className="muted-block">Число прохождений и средняя точность. Упражнения с низкой точностью стоит делать чаще.</p>
    </>
  )
}
