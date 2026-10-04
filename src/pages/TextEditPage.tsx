import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { createText } from '../logic/progress'

export default function TextEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const editing = id !== undefined

  useEffect(() => {
    if (!editing) return
    db.texts.get(Number(id)).then((t) => {
      if (t) {
        setTitle(t.title)
        setContent(t.content)
      }
    })
  }, [id, editing])

  const valid = title.trim() !== '' && content.trim() !== ''

  async function save() {
    if (!valid) return
    if (editing) {
      await db.texts.update(Number(id), { title: title.trim(), content: content.trim() })
      navigate(`/text/${id}`)
    } else {
      const newId = await db.texts.add(createText(title.trim(), content.trim(), Date.now()))
      navigate(`/text/${newId}`)
    }
  }

  return (
    <>
      <h1>{editing ? 'Редактирование' : 'Новый текст'}</h1>
      <label className="field">
        Название
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, «Я помню чудное мгновенье»" />
      </label>
      <label className="field">
        Текст
        <textarea rows={12} value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="Вставьте текст. Пустая строка разделяет строфы." />
      </label>
      <div className="row">
        <button className="btn primary" disabled={!valid} onClick={save}>Сохранить</button>
        <Link className="btn ghost" to={editing ? `/text/${id}` : '/texts'}>Отмена</Link>
      </div>
    </>
  )
}
