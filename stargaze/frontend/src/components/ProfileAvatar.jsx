import { Link } from 'react-router-dom'
import { getProfile } from '../lib/saved.js'
import './ProfileAvatar.css'

export default function ProfileAvatar() {
  const profile = getProfile()
  const initial = (profile.display_name || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <Link to="/profile" className="topbar-avatar" aria-label="Your profile" title="Your profile">
      {profile.avatar ? <img src={profile.avatar} alt="" /> : initial}
    </Link>
  )
}
