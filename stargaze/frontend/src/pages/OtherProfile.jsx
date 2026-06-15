import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import NotificationBell from '../components/NotificationBell.jsx'
import AuthButton from '../components/AuthButton.jsx'
import FollowButton from '../components/FollowButton.jsx'
import ConstellationGraph from '../components/ConstellationGraph.jsx'
import { getProfileByUsername, getFollowCounts } from '../lib/profiles.js'
import { API } from '../lib/api.js'
import './Profile.css'

/** Read-only constellation of another user's shared (watched) films. */
function PublicConstellation({ films }) {
  const navigate = useNavigate()
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(false)
  const ids = useMemo(() => (films || []).map(f => f.id).join(','), [films])

  useEffect(() => {
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
  return (
    <div className="collection-graph">
      {loading && !graph && <div className="collection-loading">Mapping their stars…</div>}
      {graph && graph.nodes?.length > 0 && (
        <ConstellationGraph
          data={graph}
          selected={null}
          onSelect={n => n && navigate(`/film/${n.id}`)}
          onExpand={() => {}}
          hint="click a star to open the film"
        />
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
