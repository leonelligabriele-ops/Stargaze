import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getFilmRaters } from '../lib/profiles.js'
import './FilmGraders.css'

/**
 * Small avatar stack of people who graded this film: up to 3 circles, then a
 * "+N" (hover to see who). Click an avatar to open that person's profile.
 */
export default function FilmGraders({ filmId }) {
  const [raters, setRaters] = useState([])

  useEffect(() => {
    if (!filmId) return
    let cancelled = false
    getFilmRaters(filmId).then(r => { if (!cancelled) setRaters(r) })
    return () => { cancelled = true }
  }, [filmId])

  if (!raters.length) return null

  const shown = raters.slice(0, 3)
  const extra = raters.slice(3)
  const nameOf = u => u.display_name || `@${u.username}`
  const extraTip = extra.map(u => `${nameOf(u)} — ${u.rating}/5`).join('\n')

  return (
    <div className="graders">
      <span className="graders-label">Graded by</span>
      <div className="graders-row">
        {shown.map(u => (
          <Link
            key={u.username}
            to={`/u/${u.username}`}
            className="grader-av"
            title={`${nameOf(u)} — ${u.rating}/5`}
          >
            {u.avatar ? <img src={u.avatar} alt="" /> : nameOf(u).replace('@', '')[0]?.toUpperCase() || '?'}
          </Link>
        ))}
        {extra.length > 0 && (
          <span className="grader-more" title={extraTip}>+{extra.length}</span>
        )}
      </div>
    </div>
  )
}
