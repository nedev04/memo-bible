import { describe, expect, it } from "vitest";
import {
  buildBlocks,
  buildGaps,
  flattenWords,
  scoreOrder,
  shuffleBlocks,
  visibleMask,
} from "./exercises";

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXT = `Я помню чудное мгновенье:
Передо мной явилась ты,
Как мимолетное виденье,
Как гений чистой красоты.

В томленьях грусти безнадежной,
В тревогах шумной суеты,
Звучал мне долго голос нежный
И снились милые черты.`;

describe("buildGaps", () => {
  it("пропуски (кроме тяжёлого уровня) не соседние, ответ входит в варианты", () => {
    for (const d of [1, 2, 3] as const) {
      const words = flattenWords(TEXT);
      const gaps = buildGaps(words, d, seeded(d));
      expect(gaps.length).toBeGreaterThan(0);
      gaps.forEach((g, i) => {
        expect(g.options).toContain(g.answer);
        expect(new Set(g.options.map((o) => o.toLowerCase())).size).toBe(
          g.options.length,
        );
        if (i > 0 && d < 3)
          expect(g.wordIndex - gaps[i - 1].wordIndex).toBeGreaterThan(1);
      });
    }
  });
  it("на тяжёлом пропусков больше, а вариантов больше", () => {
    const words = flattenWords(TEXT);
    const easy = buildGaps(words, 1, seeded(1));
    const hard = buildGaps(words, 3, seeded(1));
    expect(hard.length).toBeGreaterThan(easy.length);
    expect(hard[0].options.length).toBeGreaterThan(easy[0].options.length);
  });
});

const SENTENCE =
  "Это довольно длинное предложение, в котором ровно двенадцать слов для полной проверки.";
const LONG_LINES = Array.from({ length: 10 }, () => SENTENCE).join("\n"); // 10 предложений по 12 слов
const LONG_PARAGRAPH = Array.from({ length: 10 }, () => SENTENCE).join(" ");

describe("количество пропусков и блоков на длинном тексте", () => {
  it("пропусков много и их число растёт с уровнем", () => {
    const words = flattenWords(LONG_LINES);
    const counts = ([1, 2, 3] as const).map(
      (d) => buildGaps(words, d, seeded(d)).length,
    );
    expect(counts[0]).toBeGreaterThanOrEqual(14);
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });
  it("блоков: ~8 / ~13 / ~20 для 10 предложений", () => {
    for (const text of [LONG_LINES, LONG_PARAGRAPH]) {
      expect(buildBlocks(text, 1).length).toBe(8);
      expect(buildBlocks(text, 2).length).toBe(13);
      expect(buildBlocks(text, 3).length).toBe(20);
    }
  });
  it("абзац без переносов режется по знакам препинания", () => {
    const blocks = buildBlocks(LONG_PARAGRAPH, 1);
    expect(blocks.filter((b) => /[,.]$/.test(b)).length).toBeGreaterThanOrEqual(
      blocks.length - 1,
    );
  });
});

describe("buildBlocks", () => {
  it("число блоков зависит от сложности и склеивается обратно в текст", () => {
    for (const d of [1, 2, 3] as const) {
      const blocks = buildBlocks(TEXT, d);
      expect(blocks.length).toBe({ 1: 4, 2: 6, 3: 10 }[d]);
      const joined = blocks.join(" ").replace(/\s+/g, " ");
      expect(joined).toBe(TEXT.replace(/\s+/g, " "));
    }
  });
  it("перемешивание отличается от исходного порядка", () => {
    const blocks = buildBlocks(TEXT, 1);
    const order = shuffleBlocks(blocks, seeded(5));
    expect(order).not.toEqual([0, 1, 2, 3]);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
  });
  it("оценка по позициям", () => {
    expect(scoreOrder(["a", "b", "c", "d"], ["a", "b", "c", "d"])).toBe(100);
    expect(scoreOrder(["b", "a", "c", "d"], ["a", "b", "c", "d"])).toBe(50);
  });
});

describe("visibleMask", () => {
  it("лёгкая — все видны, тяжёлая — только слова без букв", () => {
    const words = flattenWords("Раз — два три");
    expect(visibleMask(words, 1).every(Boolean)).toBe(true);
    expect(visibleMask(words, 3)).toEqual([false, true, false, false]);
  });
});
