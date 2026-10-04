const KEY = 'memo:lastBackupAt'

/** Когда в последний раз скачивали резервную копию (хранится в localStorage; если он недоступен — null) */
export function getLastBackup(): number | null {
  try {
    const v = localStorage.getItem(KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function setLastBackup(t: number) {
  try {
    localStorage.setItem(KEY, String(t))
  } catch {
    /* хранилище недоступно — не страшно */
  }
}
