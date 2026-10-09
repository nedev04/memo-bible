import type { LessonType } from '../types'

export const LESSON_TYPE_INFO: Record<LessonType, { label: string; glyph: string; description: string }> = {
  regular: {
    label: 'Урок',
    glyph: '▶',
    description: 'Новые стихи и повторение недавних, ещё не закрепившихся.',
  },
  review: {
    label: 'Закрепление',
    glyph: '↻',
    description: 'Повторение пройденного без нового материала. Чаще встречаются стихи, которые ещё не закрепились.',
  },
  test: {
    label: 'Тест',
    glyph: '✎',
    description: 'Одно большое задание: ввести стих по памяти. Без разбивки на упражнения.',
  },
}
