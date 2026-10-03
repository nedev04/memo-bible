# Наизусть — приложение для заучивания текстов

React + TypeScript + Vite, данные хранятся локально (IndexedDB через Dexie).

## Запуск

```
npm install
npm run dev      # разработка
npm test         # тесты логики прогресса
npm run build    # сборка в dist/
```

## Структура

- `src/logic/config.ts` — все числа: интервалы, пороги очков, очки за упражнения. Меняйте здесь.
- `src/logic/progress.ts` — очки, уровни, условия повышения и понижения (чистые функции, покрыты тестами).
- `src/logic/parser.ts` — разбор текста на строки и слова.
- `src/exercises/` — упражнения (готовы все 9). Новое упражнение: компонент + запись в `index.ts` + `implemented: true` в `config.ts`.
- `src/exercises/useWordTyper.ts`, `TypedText.tsx` — общий ввод слов для «Ввода текста целиком», «Продолжи строку» и «Допиши конец строки».
- `src/logic/exercises.ts` — генерация заданий (пропуски, блоки, маски) — чистые функции, покрыты тестами.
- `src/pages/` — экраны.
- `src/db/db.ts` — база (Dexie).

## Бесплатный хостинг

Сборка статическая (HashRouter, `base: './'`), подойдёт GitHub Pages, Cloudflare Pages или Netlify:
команда сборки `npm run build`, папка публикации `dist`.
