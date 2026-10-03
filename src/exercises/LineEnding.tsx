import { useMemo } from "react";
import { buildLineEnding, toLines } from "../logic/exercises";
import TypedText from "./TypedText";
import type { ExerciseProps } from "./types";
import { useWordTyper } from "./useWordTyper";

export default function LineEnding({
  content,
  difficulty,
  onComplete,
}: ExerciseProps) {
  const { words, given } = useMemo(
    () => buildLineEnding(toLines(content), difficulty),
    [content, difficulty],
  );
  const typer = useWordTyper(words, given);

  return (
    <div className="exwrap">
      <p className="hint">
        {typer.focused || typer.done
          ? "Допишите окончания строк. Ошибочное слово откроется и станет красным."
          : "Коснитесь текста, чтобы открыть клавиатуру."}
      </p>
      <TypedText typer={typer} ellipsis />
      <div className="reveal-bar" onClick={(e) => e.stopPropagation()}>
        {typer.done ? (
          <>
            <span className="counter">Точность {typer.score}%</span>
            <button
              className="btn primary"
              onClick={() => onComplete(typer.score)}
            >
              Готово
            </button>
          </>
        ) : (
          <>
            <span className="counter">
              {typer.doneCount} / {typer.total}
            </span>
            <button className="btn ghost" onClick={typer.reveal}>
              Показать слово
            </button>
          </>
        )}
      </div>
    </div>
  );
}
