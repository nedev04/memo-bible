import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import LevelProgress from "../components/LevelProgress";
import { db } from "../db/db";
import { dueLabel } from "../logic/progress";

export default function TextsPage() {
  const texts = useLiveQuery(
    () => db.texts.orderBy("nextReviewAt").toArray(),
    [],
  );
  const now = Date.now();

  if (!texts) return null;

  return (
    <>
      <div className="row between">
        <h1>Мои тексты</h1>
        <Link className="btn primary" to="/new">
          Добавить
        </Link>
      </div>

      {texts.length === 0 && (
        <p className="empty">
          Здесь пока пусто. Добавьте стихотворение, речь или роль — и начните
          учить.
        </p>
      )}

      <ul className="list">
        {texts.map((t) => (
          <li key={t.id}>
            <Link to={`/text/${t.id}`} className="list-item">
              <span className="level">{t.level}</span>
              <span className="grow">
                <strong>{t.title}</strong>
                <small className={now >= t.nextReviewAt ? "due" : undefined}>
                  {dueLabel(t.nextReviewAt, now)}
                </small>
                <LevelProgress text={t} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
