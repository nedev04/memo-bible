import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyFixups, buildOutput, cleanText, parseZefania, selectBooks, toChapters } from './zefania.mjs'

const books = JSON.parse(readFileSync(new URL('../src/bible/books.json', import.meta.url), 'utf8'))

/** Минимальный файл: по одной книге с одной главой и одним стихом */
function fakeXml(count = 66, numberOf = (i) => i + 1) {
  const parts = []
  for (let i = 0; i < count; i++) {
    parts.push(`<BIBLEBOOK bnumber="${numberOf(i)}" bname="Книга ${i + 1}"><CHAPTER cnumber="1"><VERS vnumber="1">Текст ${i + 1}</VERS></CHAPTER></BIBLEBOOK>`)
  }
  return `<?xml version="1.0"?><XMLBIBLE>${parts.join('\n')}</XMLBIBLE>`
}

describe('cleanText', () => {
  it('убирает разметку, сноски и сущности', () => {
    expect(cleanText('В начале <STYLE css="x">сотворил</STYLE> Бог&nbsp;небо &amp; землю<NOTE>сноска</NOTE>.\n  '))
      .toBe('В начале сотворил Бог небо & землю.')
    expect(cleanText('&#1041;&#x41;')).toBe('БA')
  })
})

describe('parseZefania', () => {
  const xml = `<XMLBIBLE>
    <BIBLEBOOK bnumber="1" bname="Бытие">
      <CHAPTER cnumber="1">
        <VERS vnumber="1">Первый</VERS>
        <VERS vnumber="3">Третий</VERS>
      </CHAPTER>
      <CHAPTER cnumber="2"><VERS vnumber="1">Глава два</VERS></CHAPTER>
    </BIBLEBOOK></XMLBIBLE>`

  it('читает книги, главы и стихи', () => {
    const [b] = parseZefania(xml)
    expect(b.number).toBe(1)
    expect(b.name).toBe('Бытие')
    expect(b.chapters.get(1).get(3)).toBe('Третий')
  })

  it('пропущенный стих становится пустой строкой', () => {
    const [b] = parseZefania(xml)
    expect(toChapters(b)).toEqual([['Первый', '', 'Третий'], ['Глава два']])
  })
})

describe('selectBooks / buildOutput', () => {
  it('сопоставляет по номерам, дополнительные книги пропускает', () => {
    const parsed = parseZefania(fakeXml(70))
    const { byId, notes } = selectBooks(parsed, books)
    expect(byId.size).toBe(66)
    expect(byId.get('gen').name).toBe('Книга 1')
    expect(byId.get('rev').name).toBe('Книга 66') // Откровение — 66-я в источнике
    expect(notes.length).toBe(1)
  })

  it('если номера странные, но книг 66 — по порядку', () => {
    const parsed = parseZefania(fakeXml(66, (i) => i + 1000))
    const { notes } = selectBooks(parsed, books)
    expect(notes[0]).toMatch(/по порядку/)
  })

  it('если книг не хватает — понятная ошибка', () => {
    expect(() => selectBooks(parseZefania(fakeXml(60)), books)).toThrow(/нужно 66/)
  })

  it('собирает файлы, индекс и отчёт', () => {
    const out = buildOutput(parseZefania(fakeXml(66)), books, { source: 'test' })
    expect(Object.keys(out.files)).toHaveLength(66)
    expect(out.index.books[0]).toEqual({ id: 'gen', verses: [1] })
    expect(out.index.source).toBe('test')
    expect(out.totalVerses).toBe(66)
    expect(out.errors).toEqual([])
    expect(out.warnings.some((w) => w.includes('глав 1, ожидалось 50'))).toBe(true)
  })
})

const chapter = (n, label = 'в') => Array.from({ length: n }, (_, i) => `${label}${i + 1}`)

describe('правки источника', () => {
  const sizes = [21, 49, 100, 34, 30, 29, 28, 27, 27, 21, 45, 13, 64, 42]

  it('Даниил: убирает главы 13–14 и переносит 6:1 в 5:31', () => {
    const src = sizes.map((n, i) => chapter(n, `д${i + 1}_`))
    const { chapters, notes, warnings } = applyFixups('dan', src)
    expect(chapters.map((c) => c.length)).toEqual([21, 49, 100, 34, 31, 28, 28, 27, 27, 21, 45, 13])
    expect(chapters[4][30]).toBe('д6_1')
    expect(chapters[5][0]).toBe('д6_2')
    expect(notes).toHaveLength(2)
    expect(warnings).toEqual([])
  })

  it('Даниил: при другой структуре ничего не меняет и предупреждает', () => {
    const src = [chapter(5), chapter(5), chapter(5)]
    const { chapters, warnings } = applyFixups('dan', src)
    expect(chapters).toBe(src)
    expect(warnings).toHaveLength(1)
  })

  it('Иоиль: 4 главы превращаются в 3 с делением 20 / 32 / 21', () => {
    const src = [chapter(20), chapter(27), chapter(5), chapter(21)]
    const { chapters } = applyFixups('jol', src)
    expect(chapters.map((c) => c.length)).toEqual([20, 32, 21])
    expect(chapters[1][27]).toBe('в1') // бывший стих 3:1 стал 2:28
  })

  it('Иоиль: готовое деление не трогает', () => {
    const src = [chapter(20), chapter(32), chapter(21)]
    expect(applyFixups('jol', src).chapters).toBe(src)
  })

  it('прочие книги не меняются', () => {
    const src = [chapter(3)]
    expect(applyFixups('gen', src).chapters).toBe(src)
  })
})
