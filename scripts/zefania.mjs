// Разбор Библии в формате Zefania XML и подготовка файлов для приложения.
// Чистые функции без обращения к сети и диску, чтобы их можно было тестировать.

const ATTR_RE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function attrs(source) {
  const result = {}
  for (const m of source.matchAll(ATTR_RE)) result[m[1].toLowerCase()] = m[2] ?? m[3]
  return result
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Убирает разметку и сноски, раскрывает &-сущности, схлопывает пробелы */
export function cleanText(raw) {
  return raw
    .replace(/<NOTE\b[\s\S]*?<\/NOTE>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Разбирает Zefania XML. Возвращает книги в порядке следования в файле:
 * [{ number, name, chapters: Map<номер главы, Map<номер стиха, текст>> }]
 */
export function parseZefania(xml) {
  const books = []
  for (const b of xml.matchAll(/<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi)) {
    const ba = attrs(b[1])
    const chapters = new Map()
    let autoChapter = 0
    for (const c of b[2].matchAll(/<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER>/gi)) {
      const ca = attrs(c[1])
      const chapterNo = Number.isFinite(Number(ca.cnumber)) && ca.cnumber ? Number(ca.cnumber) : ++autoChapter
      autoChapter = chapterNo
      const verses = chapters.get(chapterNo) ?? new Map()
      let autoVerse = 0
      for (const v of c[2].matchAll(/<VERS\b([^>]*)>([\s\S]*?)<\/VERS>/gi)) {
        const va = attrs(v[1])
        const verseNo = Number.isFinite(Number(va.vnumber)) && va.vnumber ? Number(va.vnumber) : ++autoVerse
        autoVerse = verseNo
        const text = cleanText(v[2])
        verses.set(verseNo, verses.has(verseNo) ? `${verses.get(verseNo)} ${text}`.trim() : text)
      }
      chapters.set(chapterNo, verses)
    }
    books.push({
      number: ba.bnumber !== undefined && ba.bnumber !== '' ? Number(ba.bnumber) : null,
      name: ba.bname ?? ba.bsname ?? '',
      chapters,
    })
  }
  return books
}

/**
 * Сопоставляет книги файла с нашим списком из 66 книг.
 * 1) по номерам bnumber 1..66; 2) если номера не подходят, но книг ровно 66 — по порядку; иначе ошибка.
 * Возвращает { byId: Map<id, книга>, notes: string[] }.
 */
export function selectBooks(parsed, books) {
  const notes = []
  const byNumber = new Map(parsed.filter((b) => b.number !== null).map((b) => [b.number, b]))
  const haveAll = books.every((b) => byNumber.has(b.num))

  if (haveAll) {
    const extra = parsed.filter((b) => b.number === null || b.number < 1 || b.number > 66)
    if (extra.length) notes.push(`В файле есть дополнительные книги (${extra.length}), они пропущены.`)
    return { byId: new Map(books.map((b) => [b.id, byNumber.get(b.num)])), notes }
  }
  if (parsed.length === 66) {
    notes.push('Номера книг в файле не совпали с ожидаемыми, книги сопоставлены по порядку. Проверьте отчёт.')
    const sorted = [...books].sort((a, b) => a.num - b.num)
    return { byId: new Map(sorted.map((b, i) => [b.id, parsed[i]])), notes }
  }
  const found = parsed.map((b) => `${b.number ?? '?'}: ${b.name}`).join(', ')
  throw new Error(`Не удалось сопоставить книги: найдено ${parsed.length}, нужно 66. В файле: ${found}`)
}

/** Превращает главы книги в массив строк (индекс = номер стиха − 1; пропущенный стих — пустая строка) */
export function toChapters(book) {
  const chapterNumbers = [...book.chapters.keys()]
  const count = chapterNumbers.length ? Math.max(...chapterNumbers) : 0
  const out = []
  for (let c = 1; c <= count; c++) {
    const verses = book.chapters.get(c)
    if (!verses || verses.size === 0) {
      out.push([])
      continue
    }
    const last = Math.max(...verses.keys())
    const arr = Array.from({ length: last }, () => '')
    for (const [n, text] of verses) if (n >= 1) arr[n - 1] = text
    out.push(arr)
  }
  return out
}

/**
 * Правки известных расхождений источника с печатным Синодальным изданием.
 * Каждая правка применяется только если структура книги в точности такая, как ожидается;
 * иначе возвращается предупреждение и книга остаётся как есть.
 */
const snippet = (t) => (t.length > 60 ? `${t.slice(0, 60)}…` : t)

export const FIXUPS = {
  // В файле есть неканонические главы 13–14 (Сусанна, Бел и дракон), а деление глав 5 и 6 еврейское
  dan(ch) {
    const notes = []
    let out = ch
    if (out.length === 14 && out[12].length === 64 && out[13].length === 42) {
      out = out.slice(0, 12)
      notes.push('Даниил: удалены неканонические главы 13 (Сусанна) и 14 (Бел и дракон).')
    } else if (out.length !== 12) {
      return { chapters: ch, notes: [], warnings: [`Даниил: глав ${out.length}, ожидалось 14 или 12, правка не применена`] }
    }
    if (out[4].length === 30 && out[5].length === 29) {
      // еврейское 6:1 — это 5:31 в Синодальном издании («Дарий Мидянин принял царство»)
      const moved = out[5][0]
      out = out.map((c, i) => (i === 4 ? [...c, moved] : i === 5 ? c.slice(1) : c))
      notes.push(`Даниил: стих 6:1 источника перенесён в 5:31 («${snippet(moved)}»), глава 5 теперь 31 стих, глава 6 — 28.`)
    }
    return { chapters: out, notes, warnings: [] }
  },

  // В файле еврейское деление: 4 главы вместо 3 (еврейские 3:1–5 — это 2:28–32 в Синодальном)
  jol(ch) {
    if (ch.length === 3) return { chapters: ch, notes: [], warnings: [] }
    if (ch.length === 4 && ch[1].length === 27 && ch[2].length === 5 && ch[3].length === 21) {
      return {
        chapters: [ch[0], [...ch[1], ...ch[2]], ch[3]],
        notes: ['Иоиль: главы приведены к Синодальному делению (3 главы: 20, 32 и 21 стих).'],
        warnings: [],
      }
    }
    return { chapters: ch, notes: [], warnings: ['Иоиль: структура глав неожиданная, правка не применена'] }
  },
}

export function applyFixups(bookId, chapters) {
  const fix = FIXUPS[bookId]
  return fix ? fix(chapters) : { chapters, notes: [], warnings: [] }
}

/**
 * Готовит содержимое для записи: файлы книг, индекс и отчёт для человека.
 * Критичные проблемы (нет глав, пустая книга) попадают в errors, остальное — в warnings.
 */
export function buildOutput(parsed, books, meta = {}) {
  const { byId, notes } = selectBooks(parsed, books)
  const files = {}
  const indexBooks = []
  const errors = []
  const warnings = [...notes]
  const fixes = []
  const lines = []
  let totalVerses = 0
  let totalChapters = 0

  for (const b of books) {
    const fixed = applyFixups(b.id, toChapters(byId.get(b.id)))
    const chapters = fixed.chapters
    fixes.push(...fixed.notes)
    warnings.push(...fixed.warnings)
    files[b.id] = chapters
    indexBooks.push({ id: b.id, verses: chapters.map((ch) => ch.length) })

    const verseCount = chapters.reduce((n, ch) => n + ch.filter(Boolean).length, 0)
    totalVerses += verseCount
    totalChapters += chapters.length
    lines.push(`${b.name.padEnd(22)} глав ${String(chapters.length).padStart(3)}, стихов ${String(verseCount).padStart(5)}`)

    if (chapters.length === 0) errors.push(`${b.name}: нет глав`)
    if (chapters.length !== b.chapters) {
      warnings.push(`${b.name}: глав ${chapters.length}, ожидалось ${b.chapters}`)
    }
    chapters.forEach((ch, i) => {
      if (ch.length === 0) errors.push(`${b.name} ${i + 1}: пустая глава`)
      const gaps = ch.map((t, k) => (t ? 0 : k + 1)).filter(Boolean)
      if (gaps.length) warnings.push(`${b.name} ${i + 1}: нет текста у стихов ${gaps.join(', ')}`)
    })
  }

  const summary = `Итого: книг ${books.length}, глав ${totalChapters}, стихов ${totalVerses}`
  const index = {
    translation: meta.translation ?? 'rst',
    name: meta.name ?? 'Синодальный перевод',
    source: meta.source ?? '',
    books: indexBooks,
  }
  return { files, index, errors, warnings, fixes, report: [...lines, summary].join('\n'), totalVerses, totalChapters }
}
