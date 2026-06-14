import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBlockedList, removeBlocked } from '../lib/saved.js'
import './BlockedFilms.css'

export default function BlockedFilms() {
  const navigate = useNavigate()
  const [, force] = useState(0)
  const films = getBlockedList()

  const unblock = useCallback((id) => {
    removeBlocked(id)
    force(n => n + 1)   // re-read after change
  }, [])

  return (
    <div className="blocked-page">
      <header className="blocked-bar">
        <button className="back-arrow-btn" onClick={() => navigate('/profile')} aria-label="Back to profile">←</button>
        <div>
          <h1 className="blocked-title">Blocked films</h1>
          <p className="blocked-sub">These never appear in your recommendations. Unblock to see them again.</p>
        </div>
      </header>

      {films.length === 0 ? (
        <div className="blocked-empty">
          <span className="blocked-empty-icon">🚫</span>
          <p>You haven’t blocked any films.</p>
          <p className="blocked-empty-hint">
            Use the 🚫 button on a preview card or film page to stop a film being recommended.
          </p>
        </div>
      ) : (
        <ul className="blocked-list">
          {films.map(f => (
            <li className="blocked-row" key={f.id}>
              {f.poster_url
                ? <img className="blocked-poster" src={f.poster_url} alt="" />
                : <div className="blocked-poster blocked-poster--ph">✦</div>}
              <button className="blocked-info" onClick={() => navigate(`/film/${f.id}`)}>
                <span className="blocked-name">{f.title}</span>
                <span className="blocked-meta">
                  {[f.director, f.year != null ? Math.trunc(f.year) : null].filter(Boolean).join(' · ')}
                </span>
              </button>
              <button className="unblock-btn" onClick={() => unblock(f.id)}>Unblock</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
