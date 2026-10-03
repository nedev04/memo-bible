import type { ComponentType } from "react";
import type { ExerciseId } from "../types";
import FillGaps from "./FillGaps";
import FirstLetters from "./FirstLetters";
import OrderBlocks from "./OrderBlocks";
import RevealTap from "./RevealTap";
import type { ExerciseProps } from "./types";

/** Реализованные упражнения. Остальные из config.ts добавляем сюда по мере готовности. */
export const exerciseComponents: Partial<
  Record<ExerciseId, ComponentType<ExerciseProps>>
> = {
  revealTap: RevealTap,
  firstLetters: FirstLetters,
  fillGaps: FillGaps,
  orderBlocks: OrderBlocks,
};
