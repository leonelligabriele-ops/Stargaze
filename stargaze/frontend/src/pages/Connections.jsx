import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileAvatar from '../components/ProfileAvatar.jsx'
import FollowButton from '../components/FollowButton.jsx'
import { getFollowing, COLLECTIONS_EVENT } from '../lib/saved.js'
import { getDemoUser } from '../lib/demoUsers.js'
import './Profile.css'

export default function Connections() {
  const { type } = useParams()             // 'following' | 'followers'
  const navigate = useNavigate()
  const isFollowers = type === 'followers'

  // Re-render when follow state changes (unfollowing from this list).
  const [, force] = useState(0)
  useEffect(() => {
    const bump = () => force(n => n + 1)
    window.addEventListener(COLLECTIONS_EVENT, bump)
    return () => window.removeEventListener(COLLECTIONS_EVENT, bump)
  }, [])

  // Enrich each followed user with demo data (colour, follower count, …).
  const following = getFollowing().map(u => ({ ...getDemoUser(u.id), ...u }))
  // Nobody can follow you back in a single-user demo, so followers is empty.
  const list = isFollowers ? [] : following

  return (
    <div className="profile">
      <header className="profile-bar">
        <button className="back-arrow-btn" onClick={() => navigate('/profile')} aria-label="Back">←</button>
        <span className="profile-brand">Stargaze</span>
        <div className="profile-bar-right">
          <NotificationBell />
          <ProfileAvatar />
        </div>
      </header>

      <section className="connections">
        <div className="conn-tabs">
          <button className={`conn-tab ${!isFollowers ? 'active' : ''}`}
                  onClick={() => navigate('/connections/following')}>
            Following <span className="cs-count">{following.length}</span>
          </button>
          <button className={`conn-tab ${isFollowers ? 'active' : ''}`}
                  onClick={() => navigate('/connections/followers')}>
            Followers <span className="cs-count">0</span>
          </button>
        </div>

        {list.length ? (
          <div className="people-row">
            {list.map(u => (
              <div className="person-card" key={u.id}>
                <Link to={`/u/${u.id}`} className="person-main">
                  <span className="person-av" style={{ background: u.color || '#64748b' }}>
                    {(u.name || '?').trim()[0].toUpperCase()}
                  </span>
                  <span className="person-info">
                    <span className="person-name">{u.name}</span>
                    <span className="person-sub">{(u.followers ?? 0).toLocaleString()} followers</span>
                  </span>
                </Link>
                <FollowButton user={u} size="sm" />
              </div>
            ))}
          </div>
        ) : (
          <div className="conn-empty">
            <span className="empty-glyph">{isFollowers ? '✦' : '👤'}</span>
            <p>
              {isFollowers
                ? 'No followers yet — this is a single-user demo, so no one can follow you back.'
                : 'You’re not following anyone yet. Discover stargazers to follow on your profile.'}
            </p>
            {!isFollowers && (
              <button className="np-primary empty-add" onClick={() => navigate('/profile')}>
                Find people
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
