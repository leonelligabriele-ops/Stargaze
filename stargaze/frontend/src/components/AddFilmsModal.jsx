import { useState, useEffect } from 'react'
import {
  isSaved, toggleSaved, isWatched, markWatched,
  isInCollection, toggleInCollection,
} from '../lib/saved.js'
import { API } from '../lib/api.js'
import './AddFilmsModal.css'

/**
 * Search-and-add picker. Adds films straight into the active list
 * (watchlist / watched / a custom collection) without leaving the profile.
 */
export default function AddFilmsModal({ mode, collectionId, targetName, onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [, force] = useState(0)

  useEffect(() => {
    const term = q.trim()
    if (!term) { setResults([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      fetch(`${API}/search?q=${encodeURIComponent(term)}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (!cancelled) setResults(d?.nodes || []) })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 320)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function inTarget(m) {
    if (mode === 'watched') return isWatched(m.id)
    if (mode === 'collection') return isInCollection(collectionId, m)
    return isSaved(m.id)
  }
  function add(m) {
    if (mode === 'watched') markWatched(m)
    else if (mode === 'collection') toggleInCollection(collectionId, m)
    else toggleSaved(m)
    force(n => n + 1)
  }

  return (
    <div className="afm-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="afm-modal">
        <div className="afm-head">
          <h3 className="afm-h">Add films to <span>{targetName}</span></h3>
          <button className="afm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <input
          className="afm-input" autoFocus value={q}
          placeholder="Search a title, director or theme…"
          onChange={e => setQ(e.target.value)}
        />

        <div className="afm-results">
          {loading && <p className="afm-msg">Searching the cosmos…</p>}
          {!loading && !q.trim() && <p className="afm-msg">Start typing to find films.</p>}
          {!loading && q.trim() && !results.length && <p className="afm-msg">No films found — try another search.</p>}

          {results.map(m => {
            const added = inTarget(m)
            return (
              <div className="afm-item" key={m.id}>
                {m.poster_url
                  ? <img className="afm-poster" src={m.poster_url} alt="" />
                  : <div className="afm-poster afm-poster--ph">✦</div>}
                <div className="afm-info">
                  <span className="afm-title">{m.title}</span>
                  <span className="afm-sub">
                    {m.director || 'Unknown'}{m.year ? ` · ${Math.trunc(m.year)}` : ''}
                  </span>
                </div>
                <button
                  className={`afm-add ${added ? 'is-added' : ''}`}
                  onClick={() => add(m)}
                  disabled={mode === 'watched' && added}
                >
                  {added ? '✓ Added' : '+ Add'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
