import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import ConstellationGraph from '../components/ConstellationGraph.jsx'
import {
  getProfile, setProfile,
  getWatchlist, getWatched,
  removeFromWatchlist, removeWatched,
  markWatched, setUserRating, getUserRating,
  COLLECTIONS_EVENT,
} from '../lib/saved.js'
import './Profile.css'

const API = '/api'

const GENRE_COLOR = {
  'Action': '#ef4444', 'Adventure': '#f97316', 'Animation': '#fbbf24',
  'Comedy': '#a3e635', 'Crime': '#818cf8', 'Documentary': '#22d3ee',
  'Drama': '#a78bfa', 'Family': '#fb7185', 'Fantasy': '#c084fc',
  'History': '#d97706', 'Horror': '#dc2626', 'Music': '#34d399',
  'Mystery': '#7c3aed', 'Romance': '#f472b6', 'Science Fiction': '#60a5fa',
  'Thriller': '#3b82f6', 'War': '#92400e', 'Western': '#b45309',
}

// Live hook: re-read a collection whenever any collection changes.
function useCollections() {
  const [, force] = useState(0)
  useEffect(() => {
    const bump = () => force(n => n + 1)
    window.addEventListener(COLLECTIONS_EVENT, bump)
    return () => window.removeEventListener(COLLECTIONS_EVENT, bump)
  }, [])
  return { watchlist: getWatchlist(), watched: getWatched() }
}

/* ───────────────────────── 1–10 rating control ───────────────────────── */
function Rating10({ value, onChange }) {
  const [hover, setHover] = useState(0)
  const active = hover || value || 0
  return (
    <div className="rate10" onMouseLeave={() => setHover(0)}>
      <div className="rate-stars">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            className={`rate-star ${n <= active ? 'on' : ''}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n === value ? null : n)}
            aria-label={`Rate ${n} of 10`}
          >★</button>
        ))}
      </div>
      <span className="rate-val">{value ? `${value} / 10` : 'Tap to rate'}</span>
    </div>
  )
}

/* ───────────────────────── Node action panel ───────────────────────── */
function NodePanel({ node, mode, onClose }) {
  const navigate = useNavigate()
  const [rating, setRating] = useState(() => getUserRating(node.id))

  useEffect(() => { setRating(getUserRating(node.id)) }, [node.id])

  const accent = GENRE_COLOR[node.genres?.[0]] ?? 'var(--brand-emerald)'

  function onRate(v) {
    setRating(v)
    setUserRating(node, v)
  }

  return (
    <aside className="node-panel" role="dialog">
      <button className="node-close" onClick={onClose} aria-label="Close">✕</button>
      <div className="node-head">
        {node.poster_url
          ? <img className="node-poster" src={node.poster_url} alt="" />
          : <div className="node-poster node-poster--ph" style={{ '--accent': accent }}>✦</div>}
        <div className="node-meta">
          <h3>{node.title}</h3>
          <p className="node-sub">
            {node.director || 'Unknown'}{node.year ? ` · ${Math.trunc(node.year)}` : ''}
          </p>
          {node.rating != null && (
            <p className="node-tmdb">★ {Number(node.rating).toFixed(1)} TMDB</p>
          )}
        </div>
      </div>

      {mode === 'watched' && (
        <div className="node-rate">
          <span className="mini-label">Your rating</span>
          <Rating10 value={rating} onChange={onRate} />
        </div>
      )}

      <div className="node-actions">
        {mode === 'watchlist' ? (
          <button className="np-primary" onClick={() => { markWatched(node); onClose() }}>
            ✓ Mark as watched
          </button>
        ) : null}
        <button className="np-secondary" onClick={() => navigate(`/film/${node.id}`)}>
          View details →
        </button>
        <button
          className="np-danger"
          onClick={() => {
            mode === 'watchlist' ? removeFromWatchlist(node.id) : removeWatched(node.id)
            onClose()
          }}
        >
          Remove
        </button>
      </div>
    </aside>
  )
}

/* ───────────────────────── Collection constellation ───────────────────────── */
function CollectionConstellation({ films, mode }) {
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)

  const ids = useMemo(() => films.map(f => f.id).join(','), [films])

  useEffect(() => {
    setSelected(null)
    if (!ids) { setGraph(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`${API}/constellation?ids=${ids}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setGraph(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ids])

  if (!films.length) {
    return (
      <div className="collection-empty">
        <span className="empty-glyph">🔖</span>
        <p>
          {mode === 'watchlist'
            ? 'Your watchlist is empty. Save films to map them here.'
            : 'No watched films yet. Mark films as watched and rate them 1–10.'}
        </p>
      </div>
    )
  }

  return (
    <div className="collection-graph">
      {loading && !graph && <div className="collection-loading">Mapping your stars…</div>}
      {graph && graph.nodes?.length > 0 && (
        <ConstellationGraph
          data={graph}
          selected={selected}
          onSelect={setSelected}
          onExpand={() => {}}
          hint="click a star to rate, view or remove"
        />
      )}
      {selected && (
        <NodePanel
          node={selected}
          mode={mode}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/* ───────────────────────── Profile card ───────────────────────── */
function ProfileCard({ savedCount, genreCount, favouriteGenres }) {
  const [profile, setLocalProfile] = useState(getProfile)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile)

  const initial = (profile.display_name || '?').trim()[0]?.toUpperCase() || '?'

  function save() {
    setProfile(draft)
    setLocalProfile(draft)
    setEditing(false)
  }

  return (
    <section className="profile-card">
      <div className="pc-top">
        <div className="pc-avatar">{initial}</div>
        {!editing && (
          <button className="edit-btn" onClick={() => { setDraft(profile); setEditing(true) }}>
            Edit profile
          </button>
        )}
      </div>

      {editing ? (
        <div className="pc-edit">
          <input
            className="pc-input"
            value={draft.display_name}
            maxLength={40}
            onChange={e => setDraft(d => ({ ...d, display_name: e.target.value }))}
            placeholder="Display name"
          />
          <textarea
            className="pc-input pc-textarea"
            value={draft.bio}
            maxLength={140}
            rows={2}
            onChange={e => setDraft(d => ({ ...d, bio: e.target.value }))}
            placeholder="Short bio"
          />
          <div className="pc-edit-actions">
            <button className="np-secondary" onClick={() => setEditing(false)}>Cancel</button>
            <button className="np-primary" onClick={save}>Save</button>
          </div>
        </div>
      ) : (
        <>
          <h1 className="pc-name">{profile.display_name}</h1>
          <p className="pc-bio">{profile.bio}</p>
        </>
      )}

      <div className="pc-stats">
        <div className="stat">
          <span className="stat-num">{savedCount}</span>
          <span className="stat-label">SAVED</span>
        </div>
        <div className="stat-divider" />
        <div className="stat">
          <span className="stat-num">{genreCount}</span>
          <span className="stat-label">GENRES</span>
        </div>
      </div>

      <div className="pc-genres">
        <span className="mini-label">Favourite genres</span>
        {favouriteGenres.length ? (
          <div className="genre-row">
            {favouriteGenres.map(g => (
              <span key={g} className="fav-genre">{g}</span>
            ))}
          </div>
        ) : (
          <p className="pc-bio">Save some films to discover your favourites.</p>
        )}
      </div>
    </section>
  )
}

/* ───────────────────────── Page ───────────────────────── */
export default function Profile() {
  const navigate = useNavigate()
  const { watchlist, watched } = useCollections()
  const [tab, setTab] = useState('watchlist')

  const { genreCount, favouriteGenres } = useMemo(() => {
    const counts = {}
    const byId = new Map()
    for (const f of [...watchlist, ...watched]) byId.set(f.id, f)
    for (const f of byId.values()) {
      for (const g of f.genres || []) counts[g] = (counts[g] || 0) + 1
    }
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
    return { genreCount: sorted.length, favouriteGenres: sorted.slice(0, 8) }
  }, [watchlist, watched])

  const films = tab === 'watchlist' ? watchlist : watched

  const onHome = useCallback(() => navigate('/'), [navigate])

  return (
    <div className="profile">
      <header className="profile-bar">
        <button className="back-arrow-btn" onClick={onHome} aria-label="Home">←</button>
        <span className="profile-brand">Stargaze</span>
      </header>

      <ProfileCard
        savedCount={watchlist.length}
        genreCount={genreCount}
        favouriteGenres={favouriteGenres}
      />

      <section className="constellation-section">
        <div className="cs-head">
          <div>
            <h2 className="cs-title">My Constellation</h2>
            <p className="cs-sub">Your saved films, mapped as stars</p>
          </div>
          <div className="cs-tabs">
            <button
              className={`cs-tab ${tab === 'watchlist' ? 'active' : ''}`}
              onClick={() => setTab('watchlist')}
            >
              Watchlist <span className="cs-count">{watchlist.length}</span>
            </button>
            <button
              className={`cs-tab ${tab === 'watched' ? 'active' : ''}`}
              onClick={() => setTab('watched')}
            >
              Watched <span className="cs-count">{watched.length}</span>
            </button>
          </div>
        </div>

        <CollectionConstellation films={films} mode={tab} />
      </section>
    </div>
  )
}
