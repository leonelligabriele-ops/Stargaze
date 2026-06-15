import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import NotificationBell from '../components/NotificationBell.jsx'
import AuthButton from '../components/AuthButton.jsx'
import FollowButton from '../components/FollowButton.jsx'
import ConstellationGraph from '../components/ConstellationGraph.jsx'
import HalfStars from '../components/HalfStars.jsx'
import { getProfileByUsername, getFollowCounts } from '../lib/profiles.js'
import { API } from '../lib/api.js'
import './Profile.css'

/** Read-only constellation of another user's shared (watched) films. */
function PublicConstellation({ films }) {
  const navigate = useNavigate()
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const ids = useMemo(() => (films || []).map(f => f.id).join(','), [films])
  const metaById = useMemo(() => {
    const m = {}
    for (const f of films || []) m[String(f.id)] = { rating: f.user_rating, comment: f.comment }
    return m
  }, [films])

  useEffect(() => {
    setSelected(null)
    if (!ids) { setGraph(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`${API}/constellation?ids=${ids}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setGraph(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ids])

  if (!films?.length) {
    return (
      <div className="collection-empty">
        <span className="empty-glyph">✦</span>
        <p>No films shared yet.</p>
      </div>
    )
  }

  const meta = selected ? (metaById[String(selected.id)] || {}) : {}
  const rating = meta.rating

  return (
    <div className="collection-graph">
      {loading && !graph && <div className="collection-loading">Mapping their stars…</div>}
      {graph && graph.nodes?.length > 0 && (
        <ConstellationGraph
          data={graph}
          selected={selected}
          onSelect={setSelected}
          onExpand={() => {}}
          hint="click a star to preview"
        />
      )}

      {selected && (
        <aside className="node-panel" role="dialog">
          <button className="node-close" onClick={() => setSelected(null)} aria-label="Close">✕</button>
          <div className="node-head">
            {selected.poster_url
              ? <img className="node-poster" src={selected.poster_url} alt="" />
              : <div className="node-poster node-poster--ph" style={{ '--accent': 'var(--brand-emerald)' }}>✦</div>}
            <div className="node-meta">
              <h3>{selected.title}</h3>
              <p className="node-sub">
                {selected.director || 'Unknown'}{selected.year ? ` · ${Math.trunc(selected.year)}` : ''}
              </p>
            </div>
          </div>

          <div className="node-rate">
            <span className="mini-label">Their rating</span>
            <div className="node-rate-row">
              {rating != null ? (
                <>
                  <HalfStars value={rating} readOnly size="1.2rem" />
                  <span className="rate-val">{rating} / 5</span>
                </>
              ) : (
                <span className="rate-val">Not rated</span>
              )}
            </div>
            {meta.comment && <p className="node-comment">“{meta.comment}”</p>}
          </div>

          <div className="node-actions">
            <button className="np-secondary" onClick={() => navigate(`/film/${selected.id}`)}>
              View details →
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}

export default function OtherProfile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(undefined)   // undefined = loading, null = not found
  const [counts, setCounts] = useState({ followers: 0, following: 0 })

  useEffect(() => {
    let cancelled = false
    setProfile(undefined)
    getProfileByUsername(username).then(p => {
      if (cancelled) return
      setProfile(p || null)
      if (p) getFollowCounts(p.id).then(c => { if (!cancelled) setCounts(c) })
    })
    return () => { cancelled = true }
  }, [username])

  function refreshCounts() {
    if (profile) getFollowCounts(profile.id).then(setCounts)
  }

  const Header = (
    <header className="profile-bar">
      <button className="back-arrow-btn" onClick={() => navigate(-1)} aria-label="Back">←</button>
      <span className="profile-brand">Stargaze</span>
      <div className="profile-bar-right">
        <NotificationBell />
        <AuthButton />
      </div>
    </header>
  )

  if (profile === undefined) {
    return <div className="profile">{Header}<p className="admin-msg">Loading…</p></div>
  }
  if (profile === null) {
    return (
      <div className="profile">{Header}
        <section className="profile-card"><p className="pc-bio">This profile doesn’t exist.</p></section>
      </div>
    )
  }

  const name = profile.display_name || profile.username
  const initial = name.trim()[0]?.toUpperCase() || '?'
  const filmCount = profile.films?.length || 0

  return (
    <div className="profile">{Header}
      <section className="profile-card">
        <div className="pc-top">
          <div className="pc-avatar" style={{ cursor: 'default' }}>
            {profile.avatar ? <img className="pc-avatar-img" src={profile.avatar} alt="" /> : initial}
          </div>
          <FollowButton targetId={profile.id} size="md" onChange={refreshCounts} />
        </div>

        <div className="pc-name-row">
          <h1 className="pc-name">{name}</h1>
          <div className="pc-counters">
            <div className="counter"><span className="c-num">{filmCount}</span><span className="c-label">movies</span></div>
            <div className="counter"><span className="c-num">{counts.followers}</span><span className="c-label">followers</span></div>
            <div className="counter"><span className="c-num">{counts.following}</span><span className="c-label">following</span></div>
          </div>
        </div>
        <p className="pc-handle">@{profile.username}</p>
        {profile.bio && <p className="pc-bio">{profile.bio}</p>}
      </section>

      <section className="constellation-section">
        <div className="cs-head">
          <div>
            <h2 className="cs-title">{name}’s Constellation</h2>
            <p className="cs-sub">Films they’ve watched, mapped as stars</p>
          </div>
        </div>
        <PublicConstellation films={profile.films} />
      </section>
    </div>
  )
}
