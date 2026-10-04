import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import DataPage from './pages/DataPage'
import ExercisePage from './pages/ExercisePage'
import StatsPage from './pages/StatsPage'
import TextDetailPage from './pages/TextDetailPage'
import TextEditPage from './pages/TextEditPage'
import TextsPage from './pages/TextsPage'
import TodayPage from './pages/TodayPage'

// HashRouter — чтобы работало на статическом хостинге без настройки серверных редиректов
export default function App() {
  return (
    <HashRouter>
      <header className="top">
        <Link to="/" className="brand">Наизусть</Link>
        <nav>
          <NavLink to="/" end>Сегодня</NavLink>
          <NavLink to="/texts">Тексты</NavLink>
          <NavLink to="/stats">Статистика</NavLink>
          <NavLink to="/data" className="gear" aria-label="Данные и резервная копия" title="Данные и резервная копия">⚙</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/texts" element={<TextsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/new" element={<TextEditPage />} />
          <Route path="/text/:id" element={<TextDetailPage />} />
          <Route path="/text/:id/edit" element={<TextEditPage />} />
          <Route path="/text/:id/exercise/:exerciseId" element={<ExercisePage />} />
        </Routes>
      </main>
    </HashRouter>
  )
}
