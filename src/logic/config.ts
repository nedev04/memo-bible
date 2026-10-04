import type { Difficulty, ExerciseId, Group } from '../types'

export const DAY = 24 * 60 * 60 * 1000
export const MAX_LEVEL = 7

/** Интервал (в днях) до следующего повторения для каждого уровня */
export const INTERVAL_DAYS: Record<number, number> = {
  1: 0, 2: 1, 3: 3, 4: 7, 5: 14, 6: 30, 7: 60,
}

/** Очки, нужные для перехода с уровня N на N+1 */
export const POINTS_TO_NEXT: Record<number, number> = {
  1: 140, 2: 150, 3: 170, 4: 200, 5: 230, 6: 270,
}

/** Минимальная сложность, на которой нужен зачёт для перехода с уровня N */
export const REQUIRED_DIFFICULTY: Record<number, Difficulty> = {
  1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3,
}

export const DIFFICULTY_MULT: Record<Difficulty, number> = { 1: 1, 2: 1.5, 3: 2 }
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: 'Лёгкая', 2: 'Средняя', 3: 'Тяжёлая' }

/** Пороги точности */
export const PASS_SCORE = 90
export const PARTIAL_SCORE = 70
export const BAD_SCORE = 40

export const GROUP_TITLES: Record<Group, string> = {
  1: 'Знакомство',
  2: 'Запоминание',
  3: 'Проверка',
}

export interface ExerciseInfo {
  title: string
  description: string
  group: Group
  basePoints: number
  implemented: boolean
}

export const EXERCISES: Record<ExerciseId, ExerciseInfo> = {
  revealTap: {
    title: 'Раскрытие по тапу',
    description: 'Касайтесь экрана — текст открывается по частям',
    group: 1, basePoints: 4, implemented: true,
  },
  partialHidden: {
    title: 'Частично скрытый текст',
    description: 'Часть букв и слов скрыта, касание подсказывает слово',
    group: 1, basePoints: 4, implemented: true,
  },
  firstLetters: {
    title: 'Первые буквы',
    description: 'Вводите первую букву каждого слова',
    group: 2, basePoints: 8, implemented: true,
  },
  fillGaps: {
    title: 'Пропущенные слова',
    description: 'Выберите нужное слово из вариантов',
    group: 2, basePoints: 8, implemented: true,
  },
  orderBlocks: {
    title: 'Порядок блоков',
    description: 'Расставьте части текста по порядку',
    group: 2, basePoints: 8, implemented: true,
  },
  fullInput: {
    title: 'Ввод текста целиком',
    description: 'Напечатайте текст по памяти, знаки подставятся сами',
    group: 3, basePoints: 15, implemented: true,
  },
  nextLine: {
    title: 'Продолжи строку',
    description: 'Покажем строку — введите следующую',
    group: 3, basePoints: 12, implemented: true,
  },
  findError: {
    title: 'Найди ошибку',
    description: 'В тексте заменено слово — найдите и исправьте',
    group: 3, basePoints: 12, implemented: true,
  },
  lineEnding: {
    title: 'Допиши конец строки',
    description: 'Дана первая половина строки — допишите вторую',
    group: 3, basePoints: 12, implemented: true,
  },
}
