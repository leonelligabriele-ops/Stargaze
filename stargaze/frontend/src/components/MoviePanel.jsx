import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isBlocked, toggleBlocked } from '../lib/saved.js'
import SaveMenu from './SaveMenu.jsx'
import './MoviePanel.css'

const GENRE_COLOR = {
  'Action': '#ef4444', 'Adventure': '#f97316', 'Animation': '#fbbf24',
  'Comedy': '#a3e635', 'Crime': '#818cf8', 'Documentary': '#22d3ee',
  'Drama': '#a78bfa', 'Family': '#fb7185', 'Fantasy': '#c084fc',
  'History': '#d97706', 'Horror': '#dc2626', 'Music': '#34d399',
  'Mystery': '#7c3aed', 'Romance': '#f472b6', 'Science Fiction': '#60a5fa',
  'Thriller': '#3b82f6', 'War': '#92400e', 'Western': '#b45309',
}

function fmtRuntime(min) {
  if (!min || min <= 0) return null
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}


function PosterHeader({ movie }) {
  const [errored, setErrored] = useState(false)
  const genre = movie.genres?.[0]
  const accent = GENRE_COLOR[genre] ?? 'var(--brand-emerald)'

  if (movie.poster_url && !errored) {
    return (
      <div className="card-poster">
        <img
          src={movie.poster_url}
          alt={`${movie.title} poster`}
          onError={() => setErrored(true)}
        />
        <div className="card-poster-fade" />
      </div>
    )
  }

  // Themed placeholder when no poster is available.
  return (
    <div
      className="card-poster card-poster--placeholder"
      style={{ '--accent': accent }}
    >
      <span className="placeholder-icon">✦</span>
      <span className="placeholder-title">{movie.title}</span>
      <div className="card-poster-fade" />
    </div>
  )
}

export default function MoviePanel({ movie, onClose, onExpand, onPerson, onBlock }) {
  const navigate = useNavigate()
  const [blocked, setBlocked] = useState(false)

  // Sync blocked state whenever the displayed film changes.
  useEffect(() => {
    setBlocked(isBlocked(movie.id))
  }, [movie.id])

  function onToggleBlock() {
    const nowBlocked = toggleBlocked(movie)
    setBlocked(nowBlocked)
    if (nowBlocked) onBlock?.(movie)   // remove it from the current map
  }

  return (
    <aside className="card" role="dialog" aria-label={`${movie.title} preview`}>
      <button
        className={`card-block has-tip ${blocked ? 'is-blocked' : ''}`}
        data-tip={blocked ? 'Blocked — click to unblock' : 'Block — never recommend again'}
        onClick={onToggleBlock}
        aria-label="Block film"
      >🚫</button>
      <button className="card-close" onClick={onClose} aria-label="Close preview">✕</button>

      <PosterHeader movie={movie} />

      <div className="card-body">
        <span className="film-chip">FILM</span>

        <h2 className="card-title">{movie.title}</h2>
        <div className="card-sub">
          {movie.director && (
            <button className="person-link" onClick={() => onPerson?.(movie.director)}>
              {movie.director}
            </button>
          )}
          {movie.director && movie.year && <span className="dot">·</span>}
          {movie.year && <span>{Math.trunc(movie.year)}</span>}
          {fmtRuntime(movie.runtime) && <span className="dot">·</span>}
          {fmtRuntime(movie.runtime) && <span>{fmtRuntime(movie.runtime)}</span>}
        </div>

        {movie.cast?.length > 0 && (
          <div className="card-cast">
            <span className="card-label">CAST</span>
            <span className="cast-names">
              {movie.cast.slice(0, 4).map((name, i) => (
                <span key={name}>
                  {i > 0 && <span className="cast-sep">, </span>}
                  <button className="person-link" onClick={() => onPerson?.(name)}>{name}</button>
                </span>
              ))}
            </span>
          </div>
        )}

        {movie.description && (
          <p className="card-desc">{movie.description}</p>
        )}

        {movie.rationale && (
          <div className="card-why">
            <span className="card-label">WHY THIS</span>
            <p>{movie.rationale}</p>
          </div>
        )}

        <div className="card-actions">
          <SaveMenu movie={movie} variant="card" />
          <button
            className="details-btn"
            onClick={() => navigate(`/film/${movie.id}`)}
          >
            View Details <span className="arrow">→</span>
          </button>
        </div>

        <button className="expand-link" onClick={() => onExpand(movie.id)}>
          ✦ Expand constellation from here
        </button>
      </div>
    </aside>
  )
}
