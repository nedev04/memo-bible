import { useState } from 'react'
import { useSync } from '../sync/SyncProvider'

const fmt = (t: number) => new Date(t).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })

export default function CloudSection() {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  if (!sync.configured) {
    return (
      <>
        <h2>Облако</h2>
        <p className="muted-block">
          Синхронизация между устройствами не подключена: в сборке нет настроек Supabase. Приложение работает без неё,
          данные хранятся на этом устройстве. Как подключить, написано в README.
        </p>
      </>
    )
  }

  async function submit(kind: 'in' | 'up') {
    setMsg(null)
    if (!email.trim() || password.length < 6) {
      setMsg({ kind: 'error', text: 'Введите почту и пароль (минимум 6 символов).' })
      return
    }
    setBusy(true)
    const res = kind === 'in' ? await sync.signIn(email, password) : await sync.signUp(email, password)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else if (res.info) setMsg({ kind: 'ok', text: res.info })
    else setPassword('')
  }

  if (!sync.ready) {
    return (
      <>
        <h2>Облако</h2>
        <p className="muted-block">Проверяем вход…</p>
      </>
    )
  }

  if (!sync.user) {
    return (
      <>
        <h2>Облако</h2>
        <p className="muted-block">
          Войдите, чтобы тексты и прогресс синхронизировались между устройствами. Данные с этого устройства
          загрузятся в аккаунт.
        </p>
        <label className="field">
          Почта
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Пароль
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg && <p className={msg.kind === 'ok' ? 'notice ok' : 'notice error'} role="status">{msg.text}</p>}
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => submit('in')}>Войти</button>
          <button className="btn ghost" disabled={busy} onClick={() => submit('up')}>Создать аккаунт</button>
        </div>
      </>
    )
  }

  const statusText =
    sync.status === 'syncing' ? 'Синхронизация…'
    : sync.status === 'offline' ? 'Нет сети. Синхронизируем, когда появится.'
    : sync.status === 'error' ? 'Ошибка синхронизации'
    : sync.lastSyncAt ? `Синхронизировано: ${fmt(sync.lastSyncAt)}`
    : 'Ещё не синхронизировалось'

  return (
    <>
      <h2>Облако</h2>
      <p>
        Вы вошли как <strong>{sync.user.email}</strong>
        <small>{statusText}</small>
      </p>
      {sync.error && <p className="notice error" role="status">{sync.error}</p>}
      <div className="row">
        <button className="btn primary" disabled={sync.status === 'syncing'} onClick={() => sync.syncNow()}>Синхронизировать сейчас</button>
        <button className="btn ghost" onClick={() => sync.signOut()}>Выйти</button>
      </div>
      <p className="muted-block">
        Изменения отправляются сами. При выходе данные остаются на устройстве. Одна и та же запись, изменённая на двух
        устройствах, берётся из последнего изменения.
      </p>
    </>
  )
}
