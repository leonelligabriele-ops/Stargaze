import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isSaved, toggleSaved } from '../lib/saved.js'
import './MoviePanel.css'

const GENRE_COLOR = {
  'Action': '#ef4444', 'Adventure': '#f97316', 'Animation': '#fbbf24',
  'Comedy': '#a3e635', 'Crime': '#818cf8', 'Documentary': '#22d3ee',
  'Drama': '#a78bfa', 'Family': '#fb7185', 'Fantasy': '#c084fc',
  'History': '#d97706', 'Horror': '#dc2626', 'Music': '#34d399',
  'Mystery': '#7c3aed', 'Romance': '#f472b6', 'Science Fiction': '#60a5fa',
  'Thriller': '#3b82f6', 'War': '#92400e', 'Western': '#b45309',
}

function StarRating({ value }) {
  if (value == null) return null
  // TMDB rating is out of 10; show as 5 stars.
  const outOf5 = value / 2
  const full = Math.floor(outOf5)
  const half = outOf5 - full >= 0.5
  return (
    <div className="card-rating" title={`${Number(value).toFixed(1)} / 10`}>
      <span className="stars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => {
          const fill = i < full ? 'full' : (i === full && half ? 'half' : 'empty')
          return <span key={i} className={`star ${fill}`}>★</span>
        })}
      </span>
      <span className="rating-num">{Number(value).toFixed(1)}</span>
    </div>
  )
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

export default function MoviePanel({ movie, onClose, onExpand }) {
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)

  // Sync saved state whenever the displayed film changes.
  useEffect(() => {
    setSaved(isSaved(movie.id))
  }, [movie.id])

  function onToggleSave() {
    setSaved(toggleSaved(movie))
  }

  return (
    <aside className="card" role="dialog" aria-label={`${movie.title} preview`}>
      <button className="card-close" onClick={onClose} aria-label="Close preview">✕</button>

      <PosterHeader movie={movie} />

      <div className="card-body">
        <span className="film-chip">FILM</span>

        <h2 className="card-title">{movie.title}</h2>
        <div className="card-sub">
          {movie.director && <span>{movie.director}</span>}
          {movie.director && movie.year && <span className="dot">·</span>}
          {movie.year && <span>{Math.trunc(movie.year)}</span>}
        </div>

        <StarRating value={movie.rating} />

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
          <button
            className={`save-btn ${saved ? 'is-saved' : ''}`}
            onClick={onToggleSave}
            aria-pressed={saved}
          >
            {saved ? '★ Saved' : '☆ Save'}
          </button>
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
