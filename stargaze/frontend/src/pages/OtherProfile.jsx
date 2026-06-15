import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileAvatar from '../components/ProfileAvatar.jsx'
import FollowButton from '../components/FollowButton.jsx'
import { getDemoUser } from '../lib/demoUsers.js'
import { isFollowing, COLLECTIONS_EVENT } from '../lib/saved.js'
import './Profile.css'

export default function OtherProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = getDemoUser(id)

  // Re-render when follow state changes so the follower count reflects it.
  const [, force] = useState(0)
  useEffect(() => {
    const bump = () => force(n => n + 1)
    window.addEventListener(COLLECTIONS_EVENT, bump)
    return () => window.removeEventListener(COLLECTIONS_EVENT, bump)
  }, [])

  if (!user) {
    return (
      <div className="profile">
        <header className="profile-bar">
          <button className="back-arrow-btn" onClick={() => navigate('/profile')} aria-label="Back">←</button>
          <span className="profile-brand">Stargaze</span>
        </header>
        <section className="profile-card"><p className="pc-bio">This profile doesn’t exist.</p></section>
      </div>
    )
  }

  const initial = user.name.trim()[0].toUpperCase()
  const youFollow = isFollowing(user.id)
  const counters = [
    { num: user.movies.toLocaleString(), label: 'movies' },
    { num: (user.followers + (youFollow ? 1 : 0)).toLocaleString(), label: 'followers' },
    { num: user.following.toLocaleString(), label: 'following' },
  ]

  return (
    <div className="profile">
      <header className="profile-bar">
        <button className="back-arrow-btn" onClick={() => navigate(-1)} aria-label="Back">←</button>
        <span className="profile-brand">Stargaze</span>
        <div className="profile-bar-right">
          <NotificationBell />
          <ProfileAvatar />
        </div>
      </header>

      <section className="profile-card">
        <div className="pc-top">
          <div className="pc-avatar" style={{ background: user.color, color: '#04130d', cursor: 'default' }}>
            {initial}
          </div>
          <FollowButton user={user} size="md" />
        </div>

        <div className="pc-name-row">
          <h1 className="pc-name">{user.name}</h1>
          <div className="pc-counters">
            {counters.map(c => (
              <div className="counter" key={c.label}>
                <span className="c-num">{c.num}</span>
                <span className="c-label">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="pc-bio">{user.bio}</p>

        <div className="pc-genres">
          <span className="mini-label">Favourite genres</span>
          <div className="genre-row">
            {user.genres.map(g => <span key={g} className="fav-genre">{g}</span>)}
          </div>
        </div>

        <p className="demo-note">✦ Demo profile — follows are saved locally on your device.</p>
      </section>
    </div>
  )
}
