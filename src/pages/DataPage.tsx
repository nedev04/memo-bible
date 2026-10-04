import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { clearAll, db, exportAll, importBackup } from '../db/db'
import { getLastBackup, setLastBackup } from '../db/backupMeta'
import { backupFileName, createBackup, parseBackup, type BackupData } from '../logic/backup'

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fmt = (t: number) => new Date(t).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })

export default function DataPage() {
  const textCount = useLiveQuery(() => db.texts.count(), [])
  const attemptCount = useLiveQuery(() => db.attempts.count(), [])
  const [lastBackup, setLast] = useState<number | null>(() => getLastBackup())
  const [pending, setPending] = useState<BackupData | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function doExport() {
    const { texts, attempts } = await exportAll()
    const now = Date.now()
    download(backupFileName(now), createBackup(texts, attempts, now))
    setLastBackup(now)
    setLast(now)
    setMessage({ kind: 'ok', text: 'Файл скачан. Сохраните его в надёжном месте: в облаке или отправьте себе.' })
  }

  async function onFile(file: File | undefined) {
    setMessage(null)
    setPending(null)
    if (!file) return
    try {
      setPending(parseBackup(await file.text()))
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Не удалось прочитать файл.' })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function doImport(mode: 'replace' | 'merge') {
    if (!pending) return
    if (mode === 'replace' && !confirm('Текущие тексты и вся история будут заменены данными из файла. Продолжить?')) return
    try {
      await importBackup(pending, mode)
      setMessage({ kind: 'ok', text: `Загружено: текстов ${pending.texts.length}, упражнений ${pending.attempts.length}.` })
      setPending(null)
    } catch {
      setMessage({ kind: 'error', text: 'Не удалось сохранить данные из файла.' })
    }
  }

  async function doClear() {
    if (!confirm('Удалить все тексты и всю историю? Это нельзя отменить.')) return
    await clearAll()
    setMessage({ kind: 'ok', text: 'Все данные удалены.' })
  }

  return (
    <>
      <h1>Данные</h1>
      <p className="muted-block">
        Всё хранится только в браузере на этом устройстве. Очистка данных сайта или смена телефона сотрут тексты и прогресс,
        поэтому периодически сохраняйте резервную копию.
      </p>

      {message && <p className={message.kind === 'ok' ? 'notice ok' : 'notice error'} role="status">{message.text}</p>}

      <h2>Резервная копия</h2>
      <p>
        Сейчас в приложении: текстов {textCount ?? 0}, упражнений {attemptCount ?? 0}.
        <small>{lastBackup ? `Последняя копия: ${fmt(lastBackup)}` : 'Копия ещё не скачивалась.'}</small>
      </p>
      <button className="btn primary" onClick={doExport} disabled={!textCount}>Скачать копию</button>

      <h2>Восстановление</h2>
      <p className="muted-block">Выберите файл, скачанный ранее. Данные можно заменить или добавить к текущим.</p>
      <input ref={fileRef} type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} />

      {pending && (
        <div className="pending">
          <p>
            В файле: текстов {pending.texts.length}, упражнений {pending.attempts.length}
            {pending.exportedAt > 0 && ` (копия от ${fmt(pending.exportedAt)})`}.
            {pending.skipped > 0 && ` Пропущено повреждённых записей: ${pending.skipped}.`}
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => doImport('replace')}>Заменить текущие</button>
            <button className="btn ghost" onClick={() => doImport('merge')}>Добавить к текущим</button>
            <button className="btn ghost" onClick={() => setPending(null)}>Отмена</button>
          </div>
          <small>«Добавить» не проверяет дубликаты: если загрузить один файл дважды, тексты задвоятся.</small>
        </div>
      )}

      <h2>Удаление</h2>
      <button className="btn danger" onClick={doClear} disabled={!textCount}>Удалить все данные</button>
    </>
  )
}
