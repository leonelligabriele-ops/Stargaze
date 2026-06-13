import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getProfile } from '../lib/saved.js'
import './Home.css'

export default function Home() {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navigate = useNavigate()
  const avatarInitial = (getProfile().display_name || '?').trim()[0]?.toUpperCase() || '?'

  function submit(e) {
    e.preventDefault()
    const q = query.trim()
    if (q) navigate(`/explore?q=${encodeURIComponent(q)}`)
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

        <Link to="/profile" className="avatar" aria-label="Your profile">
          {avatarInitial}
        </Link>
      </header>

      {/* Centered hero column */}
      <main className="home-hero">
        <div className="tagline-pill">DISCOVER FILMS THROUGH THE COSMOS</div>

        <h1 className="wordmark">Stargaze</h1>

        <form
          className={`home-search ${focused ? 'is-focused' : ''}`}
          onSubmit={submit}
        >
          <input
            className="home-search-input"
            type="text"
            placeholder="Search a film, director, actor, or theme..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus
          />
          <button
            className="home-search-btn"
            type="submit"
            disabled={!query.trim()}
          >
            Explore <span className="arrow">→</span>
          </button>
        </form>
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
