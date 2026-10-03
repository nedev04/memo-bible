import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate, useParams } from "react-router-dom";
import LevelProgress from "../components/LevelProgress";
import { db, deleteText } from "../db/db";
import {
  DIFFICULTY_LABEL,
  EXERCISES,
  GROUP_TITLES,
  INTERVAL_DAYS,
  MAX_LEVEL,
} from "../logic/config";
import {
  dueLabel,
  exerciseLink,
  levelUpBlockers,
  pointsNeeded,
  recommend,
} from "../logic/progress";
import type { Difficulty, ExerciseId, Group } from "../types";

const GROUPS: Group[] = [1, 2, 3];

export default function TextDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const text = useLiveQuery(() => db.texts.get(id), [id]);
  const attempts = useLiveQuery(
    () => db.attempts.where("textId").equals(id).toArray(),
    [id],
  );

  if (!text || !attempts) return null;
  const now = Date.now();

  const pointsFull =
    text.level < MAX_LEVEL && text.levelPoints >= pointsNeeded(text.level);
  const blockers = pointsFull ? levelUpBlockers(text, attempts, now) : [];
  const rec = recommend(text, attempts, now);

  async function remove() {
    if (confirm("Удалить текст вместе с историей?")) {
      await deleteText(id);
      navigate("/texts");
    }
  }

  return (
    <>
      <Link to="/texts" className="back">
        ← Все тексты
      </Link>
      <h1>{text.title}</h1>

      <section className="status">
        <div className="row">
          <span className="level big">{text.level}</span>
          <div className="grow">
            <strong>
              Уровень {text.level} из {MAX_LEVEL}
            </strong>
            <small>
              {dueLabel(text.nextReviewAt, now)} · интервал{" "}
              {INTERVAL_DAYS[text.level]} дн.
            </small>
          </div>
        </div>
        <LevelProgress text={text} />
        {blockers.length > 0 && (
          <div className="blockers">
            <p>Очки набраны. Чтобы перейти на следующий уровень:</p>
            <ul>
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="recommend">
        <small>Рекомендуем · {rec.reason}</small>
        <Link className="btn primary" to={exerciseLink(id, rec)}>
          {EXERCISES[rec.exercise].title} ·{" "}
          {DIFFICULTY_LABEL[rec.difficulty].toLowerCase()}
        </Link>
      </section>

      {GROUPS.map((g) => (
        <section key={g}>
          <h2>{GROUP_TITLES[g]}</h2>
          <ul className="list">
            {(Object.keys(EXERCISES) as ExerciseId[])
              .filter((e) => EXERCISES[e].group === g)
              .map((e) => {
                const info = EXERCISES[e];
                return (
                  <li
                    key={e}
                    className={info.implemented ? "exercise" : "exercise soon"}
                  >
                    <strong>{info.title}</strong>
                    <small>{info.description}</small>
                    {info.implemented ? (
                      <div className="row diffs">
                        {([1, 2, 3] as Difficulty[]).map((d) => (
                          <Link
                            key={d}
                            className="btn ghost"
                            to={`/text/${id}/exercise/${e}?d=${d}`}
                          >
                            {DIFFICULTY_LABEL[d]}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <small className="badge">Скоро</small>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      <div className="row footer-actions">
        <Link className="btn ghost" to={`/text/${id}/edit`}>
          Редактировать
        </Link>
        <button className="btn danger" onClick={remove}>
          Удалить
        </button>
      </div>
    </>
  );
}
