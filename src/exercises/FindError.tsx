import { useMemo, useState } from "react";
import { buildErrors, firstChar, flattenWords } from "../logic/exercises";
import type { ExerciseProps } from "./types";
import WordFlow from "./WordFlow";

type Status = "ok" | "bad" | "missed" | null;

export default function FindError({
  content,
  difficulty,
  onComplete,
}: ExerciseProps) {
  const words = useMemo(() => flattenWords(content), [content]);
  const errors = useMemo(
    () => buildErrors(words, difficulty),
    [words, difficulty],
  );
  const byWord = useMemo(
    () => new Map(errors.map((e, i) => [e.wordIndex, i])),
    [errors],
  );

  const [status, setStatus] = useState<Status[]>(() => errors.map(() => null));
  const [alarms, setAlarms] = useState<Set<number>>(() => new Set()); // ложные срабатывания
  const [cur, setCur] = useState<number | null>(null); // какую ошибку исправляем
  const [finished, setFinished] = useState(false);

  const resolved = status.filter((s) => s === "ok" || s === "bad").length;
  const over =
    finished || (errors.length > 0 && status.every((s) => s !== null));

  const points =
    status.reduce((n, s) => n + (s === "ok" ? 1 : s === "bad" ? 0.5 : 0), 0) -
    alarms.size * 0.5;
  const score =
    errors.length === 0
      ? 100
      : Math.round((Math.max(0, points) / errors.length) * 100);

  if (errors.length === 0) {
    return (
      <div className="exwrap">
        <p>В тексте слишком мало слов для этого упражнения.</p>
        <button className="btn primary" onClick={() => onComplete(100)}>
          Пропустить
        </button>
      </div>
    );
  }

  function tap(i: number) {
    if (over) return;
    const e = byWord.get(i);
    if (e !== undefined) {
      if (status[e] === null) setCur(e);
      return;
    }
    if (firstChar(words[i]) === null || alarms.has(i)) return;
    setAlarms(new Set(alarms).add(i)); // слово было верным — штраф
  }

  function choose(option: string) {
    if (cur === null) return;
    const ok = option === errors[cur].original;
    // Неверный выбор не заставляет гадать: правильное слово встаёт на место и подсвечивается красным
    setStatus((s) => s.map((x, i) => (i === cur ? (ok ? "ok" : "bad") : x)));
    setCur(null);
  }

  function finish() {
    setStatus((s) => s.map((x) => (x === null ? "missed" : x)));
    setCur(null);
    setFinished(true);
  }

  return (
    <div className="exwrap">
      <p className="hint">
        В тексте заменено слов: {errors.length}. Нажимайте на слова, которые
        кажутся лишними, и выбирайте верный вариант.
      </p>
      <WordFlow
        words={words}
        renderWord={(w, i) => {
          const e = byWord.get(i);
          if (e !== undefined) {
            const st = status[e];
            if (st === "ok")
              return (
                <span>
                  {w.lead}
                  <span className="filled">{errors[e].original}</span>
                  {w.trail}
                </span>
              );
            if (st === "bad" || st === "missed") {
              return (
                <span>
                  {w.lead}
                  <span className="filled bad">{errors[e].original}</span>
                  {w.trail}
                </span>
              );
            }
            return (
              <span>
                {w.lead}
                <button
                  className={cur === e ? "tapword sel" : "tapword"}
                  onClick={() => tap(i)}
                >
                  {errors[e].fake}
                </button>
                {w.trail}
              </span>
            );
          }
          if (firstChar(w) === null) return w.raw;
          return (
            <span>
              {w.lead}
              <button
                className={alarms.has(i) ? "tapword alarm" : "tapword"}
                onClick={() => tap(i)}
              >
                {w.core}
              </button>
              {w.trail}
            </span>
          );
        }}
      />

      <div className="reveal-bar col">
        {over ? (
          <div className="row between full">
            <span className="counter">Точность {score}%</span>
            <button className="btn primary" onClick={() => onComplete(score)}>
              Готово
            </button>
          </div>
        ) : cur !== null ? (
          <>
            <div className="options">
              {errors[cur].options.map((o) => (
                <button key={o} className="btn ghost" onClick={() => choose(o)}>
                  {o}
                </button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setCur(null)}>
              Отмена
            </button>
          </>
        ) : (
          <div className="row between full">
            <span className="counter">
              Исправлено {resolved} / {errors.length}
              {alarms.size > 0 ? ` · ложных: ${alarms.size}` : ""}
            </span>
            <button className="btn ghost" onClick={finish}>
              Закончить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
