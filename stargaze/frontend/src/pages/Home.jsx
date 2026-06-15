import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getProfile } from '../lib/saved.js'
import NotificationBell from '../components/NotificationBell.jsx'
import AuthButton from '../components/AuthButton.jsx'
import SearchBar from '../components/SearchBar.jsx'
import './Home.css'

export default function Home() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navigate = useNavigate()
  const profile = getProfile()
  const avatarInitial = (profile.display_name || '?').trim()[0]?.toUpperCase() || '?'

  function search(q) {
    if (q) navigate(`/explore?q=${encodeURIComponent(q)}`)
  }

  function goPerson(name) {
    if (name) navigate(`/explore?person=${encodeURIComponent(name)}`)
  }

  return (
    <div className="home">
      {/* Top bar */}
      <header className="home-topbar">
        <button
          className="icon-btn"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="home-topbar-right">
          <NotificationBell />
          <Link to="/profile" className="avatar" aria-label="Your profile">
            {profile.avatar
              ? <img src={profile.avatar} alt="" className="avatar-img" />
              : avatarInitial}
          </Link>
          <AuthButton />
        </div>
      </header>

      {/* Centered hero column */}
      <main className="home-hero">
        <div className="tagline-pill">DISCOVER FILMS THROUGH THE COSMOS</div>

        <h1 className="wordmark">Stargaze</h1>

        <SearchBar
          className="home-search"
          onSearch={search}
          onPerson={goPerson}
          placeholder="Search a film, director, actor, or theme..."
          buttonLabel="Explore"
        />
      </main>

      {/* Nav drawer */}
      {drawerOpen && (
        <div className="drawer-scrim" onClick={() => setDrawerOpen(false)}>
          <nav className="drawer" onClick={e => e.stopPropagation()}>
            <button
              className="icon-btn drawer-close"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
            >
              ✕
            </button>
            <span className="drawer-title">Stargaze</span>
            <Link to="/" className="drawer-link" onClick={() => setDrawerOpen(false)}>Home</Link>
            <Link to="/explore" className="drawer-link" onClick={() => setDrawerOpen(false)}>Explore</Link>
            <Link to="/profile" className="drawer-link" onClick={() => setDrawerOpen(false)}>Profile</Link>
          </nav>
        </div>
      )}
    </div>
  )
}
