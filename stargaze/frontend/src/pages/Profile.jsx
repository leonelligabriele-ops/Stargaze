import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import ConstellationGraph from '../components/ConstellationGraph.jsx'
import HalfStars from '../components/HalfStars.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import AvatarEditor from '../components/AvatarEditor.jsx'
import FollowButton from '../components/FollowButton.jsx'
import AddFilmsModal from '../components/AddFilmsModal.jsx'
import { DEMO_USERS } from '../lib/demoUsers.js'
import {
  getProfile, setProfile, getWatchedStats, getFollowingCount,
  getWatchlist, getWatched,
  removeFromWatchlist, removeWatched,
  markWatched, setUserRating, getReview, getBlockedList,
  getCollections, getCollectionFilms, createCollection,
  removeCollection, removeFromCollection,
  COLLECTIONS_EVENT,
} from '../lib/saved.js'
import { API } from '../lib/api.js'
import './Profile.css'

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
  return { watchlist: getWatchlist(), watched: getWatched(), collections: getCollections() }
}

/* ───────────────────────── Node action panel ───────────────────────── */
function NodePanel({ node, mode, collectionId, onClose }) {
  const navigate = useNavigate()
  const [rating, setRating] = useState(() => getReview(node.id).rating)
  const [comment, setComment] = useState(() => getReview(node.id).comment)

  useEffect(() => {
    const r = getReview(node.id)
    setRating(r.rating); setComment(r.comment)
  }, [node.id])

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
        </div>
      </div>

      {mode === 'watched' && (
        <div className="node-rate">
          <span className="mini-label">Your rating</span>
          <div className="node-rate-row">
            <HalfStars value={rating || 0} onChange={onRate} size="1.2rem" clearable />
            <span className="rate-val">{rating ? `${rating} / 5` : 'Tap to rate'}</span>
          </div>
          {comment && <p className="node-comment">“{comment}”</p>}
        </div>
      )}

      <div className="node-actions">
        {mode !== 'watched' && (
          <button className="np-primary" onClick={() => { markWatched(node); onClose() }}>
            ✓ Mark as watched
          </button>
        )}
        <button className="np-secondary" onClick={() => navigate(`/film/${node.id}`)}>
          View details →
        </button>
        <button
          className="np-danger"
          onClick={() => {
            if (mode === 'watchlist') removeFromWatchlist(node.id)
            else if (mode === 'watched') removeWatched(node.id)
            else if (collectionId) removeFromCollection(collectionId, node.id)
            onClose()
          }}
        >
          {mode === 'collection' ? 'Remove from constellation' : 'Remove'}
        </button>
      </div>
    </aside>
  )
}

/* ───────────────────────── Collection constellation ───────────────────────── */
function CollectionConstellation({ films, mode, collectionId, onAdd }) {
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
        <span className="empty-glyph">{mode === 'collection' ? '✦' : '🔖'}</span>
        <p>
          {mode === 'watchlist'
            ? 'Your watchlist is empty. Save films to map them here.'
            : mode === 'watched'
            ? 'No watched films yet. Mark films as watched and rate them 1–5.'
            : 'This constellation is empty. Add films to map them here.'}
        </p>
        <button className="np-primary empty-add" onClick={onAdd}>✦ Add films</button>
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
          collectionId={collectionId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/* ───────────────────────── Profile card ───────────────────────── */
function ProfileCard({ favouriteGenres, onOpenConstellation }) {
  const navigate = useNavigate()
  const [profile, setLocalProfile] = useState(getProfile)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile)
  const [editorSrc, setEditorSrc] = useState(null)   // image being cropped

  const stats = getWatchedStats()
  const initial = (profile.display_name || '?').trim()[0]?.toUpperCase() || '?'

  function save() {
    setProfile(draft)
    setLocalProfile(draft)
    setEditing(false)
  }

  // Picking a file opens the crop/zoom editor; saving happens from there.
  function onPickAvatar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setEditorSrc(URL.createObjectURL(file))
    e.target.value = ''   // allow re-selecting the same file
  }
  function onAvatarSave(dataUrl) {
    setProfile({ avatar: dataUrl })
    setLocalProfile(p => ({ ...p, avatar: dataUrl }))
    if (editorSrc) URL.revokeObjectURL(editorSrc)
    setEditorSrc(null)
  }
  function onAvatarCancel() {
    if (editorSrc) URL.revokeObjectURL(editorSrc)
    setEditorSrc(null)
  }

  const counters = [
    { num: stats.total, label: 'movies', onClick: () => onOpenConstellation('watched') },
    { num: stats.thisYear, label: 'this year', onClick: () => onOpenConstellation('watched') },
    { num: getFollowingCount(), label: 'following', onClick: () => navigate('/connections/following') },
    { num: profile.followers, label: 'followers', onClick: () => navigate('/connections/followers') },
  ]

  return (
    <section className="profile-card">
      <div className="pc-top">
        <label className="pc-avatar" title="Upload a picture">
          {profile.avatar
            ? <img className="pc-avatar-img" src={profile.avatar} alt="" />
            : initial}
          <span className="pc-avatar-edit">✎</span>
          <input type="file" accept="image/*" hidden onChange={onPickAvatar} />
        </label>
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
          <div className="pc-name-row">
            <h1 className="pc-name">{profile.display_name}</h1>
            <div className="pc-counters">
              {counters.map(c => (
                <button className="counter" key={c.label} onClick={c.onClick}>
                  <span className="c-num">{c.num}</span>
                  <span className="c-label">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="pc-bio">{profile.bio}</p>
        </>
      )}

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

      {editorSrc && (
        <AvatarEditor src={editorSrc} onSave={onAvatarSave} onCancel={onAvatarCancel} />
      )}
    </section>
  )
}

/* ─────────────────── Create-constellation dropdown ─────────────────── */
function CreateConstellation({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [friend, setFriend] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function create() {
    if (!name.trim()) return
    const id = createCollection(name, friend ? [friend] : [])
    setName(''); setFriend(''); setOpen(false)
    onCreated?.(id)
  }

  return (
    <div className="cs-new" ref={ref}>
      <button className="cs-add" onClick={() => setOpen(o => !o)} title="New constellation" aria-label="New constellation">＋</button>
      {open && (
        <div className="cs-new-pop">
          <div className="mini-label">New constellation</div>
          <input
            autoFocus className="cs-new-input" value={name} maxLength={40}
            placeholder="Name it…" onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') create() }}
          />
          <input
            className="cs-new-input" value={friend} maxLength={40}
            placeholder="Create with a friend (optional)" onChange={e => setFriend(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') create() }}
          />
          <button className="np-primary cs-new-go" onClick={create}>Create constellation</button>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Page ───────────────────────── */
export default function Profile() {
  const navigate = useNavigate()
  const { watchlist, watched, collections } = useCollections()
  const [tab, setTab] = useState('watchlist')
  const [addOpen, setAddOpen] = useState(false)
  const constellationRef = useRef(null)

  const openConstellation = useCallback((t) => {
    setTab(t)
    requestAnimationFrame(() =>
      constellationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }, [])

  const { favouriteGenres } = useMemo(() => {
    const counts = {}
    const byId = new Map()
    const colFilms = collections.flatMap(c => Object.values(c.films || {}))
    for (const f of [...watchlist, ...watched, ...colFilms]) byId.set(f.id, f)
    for (const f of byId.values()) {
      for (const g of f.genres || []) counts[g] = (counts[g] || 0) + 1
    }
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
    return { favouriteGenres: sorted.slice(0, 8) }
  }, [watchlist, watched, collections])

  // Resolve the active tab → films + mode (+ collection id for custom lists).
  const activeCol = collections.find(c => c.id === tab)
  let films = watchlist, mode = 'watchlist', collectionId = null
  if (tab === 'watched') { films = watched; mode = 'watched' }
  else if (activeCol) { films = Object.values(activeCol.films || {}); mode = 'collection'; collectionId = activeCol.id }

  const targetName = mode === 'watched' ? 'Watched'
    : mode === 'collection' ? (activeCol?.name || 'this constellation')
    : 'Watchlist'

  const blockedCount = getBlockedList().length
  const onHome = useCallback(() => navigate('/'), [navigate])

  function deleteActive() {
    if (activeCol) { removeCollection(activeCol.id); setTab('watchlist') }
  }

  return (
    <div className="profile">
      <header className="profile-bar">
        <button className="back-arrow-btn" onClick={onHome} aria-label="Home">←</button>
        <span className="profile-brand">Stargaze</span>
        <div className="profile-bar-right">
          <button className="blocked-link" onClick={() => navigate('/blocked')}>
            🚫 Blocked{blockedCount ? ` (${blockedCount})` : ''}
          </button>
          <NotificationBell />
        </div>
      </header>

      <ProfileCard favouriteGenres={favouriteGenres} onOpenConstellation={openConstellation} />

      <section className="people-section">
        <div className="cs-head">
          <div>
            <h2 className="cs-title">People to follow</h2>
            <p className="cs-sub">Discover other stargazers</p>
          </div>
        </div>
        <div className="people-row">
          {DEMO_USERS.map(u => (
            <div className="person-card" key={u.id}>
              <Link to={`/u/${u.id}`} className="person-main">
                <span className="person-av" style={{ background: u.color }}>
                  {u.name.trim()[0].toUpperCase()}
                </span>
                <span className="person-info">
                  <span className="person-name">{u.name}</span>
                  <span className="person-sub">{u.followers.toLocaleString()} followers</span>
                </span>
              </Link>
              <FollowButton user={u} size="sm" />
            </div>
          ))}
        </div>
      </section>

      <section className="constellation-section" ref={constellationRef}>
        <div className="cs-head">
          <div>
            <h2 className="cs-title">My Constellation</h2>
            <p className="cs-sub">
              {activeCol
                ? (activeCol.shared_with?.length
                    ? `Shared with ${activeCol.shared_with.join(', ')}`
                    : 'Your custom constellation')
                : 'Your saved films, mapped as stars'}
            </p>
          </div>
          <div className="cs-tabs">
            <button className={`cs-tab ${tab === 'watchlist' ? 'active' : ''}`} onClick={() => setTab('watchlist')}>
              Watchlist <span className="cs-count">{watchlist.length}</span>
            </button>
            <button className={`cs-tab ${tab === 'watched' ? 'active' : ''}`} onClick={() => setTab('watched')}>
              Watched <span className="cs-count">{watched.length}</span>
            </button>
            {collections.map(c => (
              <button key={c.id} className={`cs-tab ${tab === c.id ? 'active' : ''}`} onClick={() => setTab(c.id)}>
                {c.name}{c.shared_with?.length ? ' 👥' : ''} <span className="cs-count">{Object.keys(c.films || {}).length}</span>
              </button>
            ))}
            <CreateConstellation onCreated={id => setTab(id)} />
          </div>
        </div>

        <div className="cs-actions">
          <button className="cs-addfilms" onClick={() => setAddOpen(true)}>✦ Add films</button>
          {activeCol && (
            <button className="cs-delete" onClick={deleteActive}>🗑 Delete “{activeCol.name}”</button>
          )}
        </div>

        <CollectionConstellation
          films={films} mode={mode} collectionId={collectionId}
          onAdd={() => setAddOpen(true)}
        />
      </section>

      {addOpen && (
        <AddFilmsModal
          mode={mode}
          collectionId={collectionId}
          targetName={targetName}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}
