import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileAvatar from '../components/ProfileAvatar.jsx'
import AuthButton from '../components/AuthButton.jsx'
import PersonRow from '../components/PersonRow.jsx'
import { useAuth } from '../lib/auth.jsx'
import { getFollowers, getFollowingProfiles, getFollowCounts } from '../lib/profiles.js'

export default function Connections() {
  const { type } = useParams()             // 'following' | 'followers'
  const navigate = useNavigate()
  const { enabled, user, loading } = useAuth()
  const isFollowers = type === 'followers'

  const [list, setList] = useState([])
  const [counts, setCounts] = useState({ followers: 0, following: 0 })
  const [pending, setPending] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!enabled || !user) { setPending(false); return }
    let cancelled = false
    setPending(true)
    const fetchList = isFollowers ? getFollowers : getFollowingProfiles
    Promise.all([fetchList(user.id), getFollowCounts(user.id)]).then(([rows, c]) => {
      if (cancelled) return
      setList(rows); setCounts(c); setPending(false)
    })
    return () => { cancelled = true }
  }, [enabled, user, loading, isFollowers])

  return (
    <div className="profile">
      <header className="profile-bar">
        <button className="back-arrow-btn" onClick={() => navigate('/profile')} aria-label="Back">←</button>
        <span className="profile-brand">Stargaze</span>
        <div className="profile-bar-right">
          <NotificationBell />
          <ProfileAvatar />
          <AuthButton />
        </div>
      </header>

      <section className="connections">
        <div className="conn-tabs">
          <button className={`conn-tab ${!isFollowers ? 'active' : ''}`}
                  onClick={() => navigate('/connections/following')}>
            Following <span className="cs-count">{counts.following}</span>
          </button>
          <button className={`conn-tab ${isFollowers ? 'active' : ''}`}
                  onClick={() => navigate('/connections/followers')}>
            Followers <span className="cs-count">{counts.followers}</span>
          </button>
        </div>

        {!enabled || !user ? (
          <div className="conn-empty">
            <span className="empty-glyph">👤</span>
            <p>Sign in to follow other stargazers and see your connections.</p>
          </div>
        ) : pending ? (
          <p className="admin-msg">Loading…</p>
        ) : list.length ? (
          <div className="people-row">
            {list.map(p => <PersonRow key={p.id} profile={p} />)}
          </div>
        ) : (
          <div className="conn-empty">
            <span className="empty-glyph">{isFollowers ? '✦' : '👤'}</span>
            <p>
              {isFollowers
                ? 'No followers yet.'
                : 'You’re not following anyone yet. Find people on your profile.'}
            </p>
            {!isFollowers && (
              <button className="np-primary empty-add" onClick={() => navigate('/profile')}>Find people</button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
