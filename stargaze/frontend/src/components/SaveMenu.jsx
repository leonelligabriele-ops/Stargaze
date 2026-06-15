import { useState, useRef, useEffect } from 'react'
import {
  isSaved, toggleSaved,
  isWatched, addWatched, removeWatched,
  getCollections, isInCollection, toggleInCollection, createCollection,
  COLLECTIONS_EVENT,
} from '../lib/saved.js'
import './SaveMenu.css'

export default function SaveMenu({ movie, variant = 'pill' }) {
  const [open, setOpen] = useState(false)
  const [, force] = useState(0)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef(null)

  const refresh = () => force(n => n + 1)

  useEffect(() => {
    window.addEventListener(COLLECTIONS_EVENT, refresh)
    return () => window.removeEventListener(COLLECTIONS_EVENT, refresh)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setCreating(false) }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const collections = getCollections()
  const savedAnywhere =
    isSaved(movie.id) || isWatched(movie.id) || collections.some(c => isInCollection(c.id, movie.id))

  const targets = [
    { key: 'watchlist', label: 'Watchlist', has: isSaved(movie.id), toggle: () => toggleSaved(movie) },
    {
      key: 'watched', label: 'Watched', has: isWatched(movie.id),
      toggle: () => (isWatched(movie.id) ? removeWatched(movie.id) : addWatched(movie)),
    },
    ...collections.map(c => ({
      key: c.id, label: c.name, shared: c.shared_with?.length > 0,
      has: isInCollection(c.id, movie.id), toggle: () => toggleInCollection(c.id, movie),
    })),
  ]

  function doCreate() {
    const id = createCollection(name)
    toggleInCollection(id, movie)   // add this film to the new constellation
    setName(''); setCreating(false)
  }

  return (
    <div className={`save-menu save-menu--${variant}`} ref={ref}>
      <button
        className={`save-trigger save-trigger--${variant} ${savedAnywhere ? 'is-saved' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {savedAnywhere ? '★ Saved' : '☆ Save'}
        <span className="sm-caret">▾</span>
      </button>

      {open && (
        <div className="save-pop">
          <div className="sm-label">Save to…</div>
          {targets.map(t => (
            <button key={t.key} className={`sm-row ${t.has ? 'on' : ''}`}
              onClick={() => { t.toggle(); refresh() }}>
              <span className="sm-check">{t.has ? '✓' : ''}</span>
              <span className="sm-name">{t.label}</span>
              {t.shared && <span className="sm-shared" title="Shared with a friend">👥</span>}
            </button>
          ))}

          {creating ? (
            <div className="sm-create">
              <input
                autoFocus value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doCreate() }}
                placeholder="Constellation name…"
                maxLength={40}
              />
              <button className="sm-create-go" onClick={doCreate}>Create</button>
            </div>
          ) : (
            <button className="sm-row sm-new" onClick={() => setCreating(true)}>＋ New constellation</button>
          )}
        </div>
      )}
    </div>
  )
}
