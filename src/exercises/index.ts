import type { ComponentType } from "react";
import type { ExerciseId } from "../types";
import FillGaps from "./FillGaps";
import FindError from "./FindError";
import FirstLetters from "./FirstLetters";
import FullInput from "./FullInput";
import LineEnding from "./LineEnding";
import NextLine from "./NextLine";
import OrderBlocks from "./OrderBlocks";
import PartialHidden from "./PartialHidden";
import RevealTap from "./RevealTap";
import type { ExerciseProps } from "./types";

export const exerciseComponents: Record<
  ExerciseId,
  ComponentType<ExerciseProps>
> = {
  revealTap: RevealTap,
  partialHidden: PartialHidden,
  firstLetters: FirstLetters,
  fillGaps: FillGaps,
  orderBlocks: OrderBlocks,
  fullInput: FullInput,
  nextLine: NextLine,
  findError: FindError,
  lineEnding: LineEnding,
};
