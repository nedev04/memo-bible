export type Difficulty = 1 | 2 | 3;
export type Group = 1 | 2 | 3;

export type ExerciseId =
  | "revealTap"
  | "partialHidden"
  | "firstLetters"
  | "fillGaps"
  | "orderBlocks"
  | "fullInput"
  | "nextLine"
  | "findError"
  | "lineEnding";

export interface TextItem {
  id?: number;
  title: string;
  content: string;
  createdAt: number;
  /** Уровень освоения 1–7 */
  level: number;
  /** Очки, набранные на текущем уровне */
  levelPoints: number;
  /** Когда уровень менялся последний раз (начало окна для проверки условий) */
  levelChangedAt: number;
  /** Когда последний раз был повышен уровень (null — ещё ни разу) */
  lastLevelUpAt: number | null;
  /** Когда пора повторять */
  nextReviewAt: number;
}

export interface Attempt {
  id?: number;
  textId: number;
  exercise: ExerciseId;
  difficulty: Difficulty;
  /** Точность 0–100 */
  score: number;
  points: number;
  createdAt: number;
}
