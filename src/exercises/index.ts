import type { ComponentType } from 'react'
import type { ExerciseId } from '../types'
import RevealTap from './RevealTap'
import type { ExerciseProps } from './types'

/** Реализованные упражнения. Остальные из config.ts добавляем сюда по мере готовности. */
export const exerciseComponents: Partial<Record<ExerciseId, ComponentType<ExerciseProps>>> = {
  revealTap: RevealTap,
}
