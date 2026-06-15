import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileAvatar from '../components/ProfileAvatar.jsx'
import AuthButton from '../components/AuthButton.jsx'
import FollowButton from '../components/FollowButton.jsx'
import { getProfileByUsername, getFollowCounts } from '../lib/profiles.js'
import './Profile.css'

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
        <ProfileAvatar />
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
            <div className="counter"><span className="c-num">{counts.followers}</span><span className="c-label">followers</span></div>
            <div className="counter"><span className="c-num">{counts.following}</span><span className="c-label">following</span></div>
          </div>
        </div>
        <p className="pc-handle">@{profile.username}</p>
        {profile.bio && <p className="pc-bio">{profile.bio}</p>}
      </section>
    </div>
  )
}
