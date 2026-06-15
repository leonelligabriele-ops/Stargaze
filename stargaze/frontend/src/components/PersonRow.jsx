import { Link } from 'react-router-dom'
import FollowButton from './FollowButton.jsx'

/** A person card: avatar + name + @username, linking to their profile, with a Follow button. */
export default function PersonRow({ profile, showFollow = true, onChange }) {
  const name = profile.display_name || profile.username
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <div className="person-card">
      <Link to={`/u/${profile.username}`} className="person-main">
        <span className="person-av">
          {profile.avatar ? <img src={profile.avatar} alt="" /> : initial}
        </span>
        <span className="person-info">
          <span className="person-name">{name}</span>
          <span className="person-sub">@{profile.username}</span>
        </span>
      </Link>
      {showFollow && <FollowButton targetId={profile.id} size="sm" onChange={onChange} />}
    </div>
  )
}
