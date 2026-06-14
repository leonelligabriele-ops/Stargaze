import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Explore from './pages/Explore.jsx'
import Profile from './pages/Profile.jsx'
import FilmPage from './pages/FilmPage.jsx'
import BlockedFilms from './pages/BlockedFilms.jsx'

export default function App() {
  return (
    <>
      <div className="cosmos-bg" aria-hidden="true" />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/film/:id" element={<FilmPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/blocked" element={<BlockedFilms />} />
      </Routes>
    </>
  )
}
