import Dexie, { type Table } from "dexie";
import type { Attempt, TextItem } from "../types";

class AppDB extends Dexie {
  texts!: Table<TextItem, number>;
  attempts!: Table<Attempt, number>;

  constructor() {
    super("memorize-by-heart");
    this.version(1).stores({
      texts: "++id, nextReviewAt",
      attempts: "++id, textId, createdAt",
    });
  }
}

export const db = new AppDB();

export async function deleteText(id: number) {
  await db.transaction("rw", db.texts, db.attempts, async () => {
    await db.attempts.where("textId").equals(id).delete();
    await db.texts.delete(id);
  });
}
