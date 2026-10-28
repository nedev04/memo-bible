import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import BibleAddPage from './pages/BibleAddPage'
import DataPage from './pages/DataPage'
import LessonPage from './pages/LessonPage'
import PracticePage from './pages/PracticePage'
import TodayPage from './pages/TodayPage'
import VersesPage from './pages/VersesPage'
import { SyncProvider, useSync } from './sync/SyncProvider'

function Header() {
  const { user, status } = useSync()
  const mark = status === 'error' ? ' error' : status === 'syncing' ? ' busy' : ''
  const title = status === 'error' ? 'Ошибка синхронизации' : 'Профиль и облако'
  return (
    <header className="top">
      <Link to="/" className="brand">Наизусть</Link>
      <nav>
        <NavLink to="/" end>Сегодня</NavLink>
        <NavLink to="/verses">Стихи</NavLink>
        <NavLink to="/data" className={`gear${user ? ' cloud' : ''}${mark}`} aria-label={title} title={title}>⚙</NavLink>
      </nav>
    </header>
  )
}

// HashRouter — чтобы работало на статическом хостинге без настройки серверных редиректов
export default function App() {
  return (
    <SyncProvider>
      <HashRouter>
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/verses" element={<VersesPage />} />
            <Route path="/add" element={<BibleAddPage />} />
            <Route path="/lesson" element={<LessonPage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/data" element={<DataPage />} />
          </Routes>
        </main>
      </HashRouter>
    </SyncProvider>
  )
}
