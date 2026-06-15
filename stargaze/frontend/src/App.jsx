import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Explore from './pages/Explore.jsx'
import Profile from './pages/Profile.jsx'
import OtherProfile from './pages/OtherProfile.jsx'
import Connections from './pages/Connections.jsx'
import FilmPage from './pages/FilmPage.jsx'
import BlockedFilms from './pages/BlockedFilms.jsx'
import Admin from './pages/Admin.jsx'
import SetPasswordModal from './components/SetPasswordModal.jsx'

export default function App() {
  return (
    <>
      <div className="cosmos-bg" aria-hidden="true" />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/film/:id" element={<FilmPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/u/:username" element={<OtherProfile />} />
        <Route path="/connections/:type" element={<Connections />} />
        <Route path="/blocked" element={<BlockedFilms />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
      <SetPasswordModal />
    </>
  )
}
