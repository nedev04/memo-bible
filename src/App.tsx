import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import ExercisePage from './pages/ExercisePage'
import TextDetailPage from './pages/TextDetailPage'
import TextEditPage from './pages/TextEditPage'
import TextsPage from './pages/TextsPage'

// HashRouter — чтобы работало на статическом хостинге без настройки серверных редиректов
export default function App() {
  return (
    <HashRouter>
      <header className="top"><Link to="/">Наизусть</Link></header>
      <main>
        <Routes>
          <Route path="/" element={<TextsPage />} />
          <Route path="/new" element={<TextEditPage />} />
          <Route path="/text/:id" element={<TextDetailPage />} />
          <Route path="/text/:id/edit" element={<TextEditPage />} />
          <Route path="/text/:id/exercise/:exerciseId" element={<ExercisePage />} />
        </Routes>
      </main>
    </HashRouter>
  )
}
