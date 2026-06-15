import { useState, useEffect } from 'react'
import { isFollowing, toggleFollow, COLLECTIONS_EVENT } from '../lib/saved.js'
import './FollowButton.css'

/** Follow ⇄ Following toggle for another user. Stays in sync across the app. */
export default function FollowButton({ user, size = 'md' }) {
  const [following, setFollowing] = useState(() => isFollowing(user.id))

  useEffect(() => {
    const sync = () => setFollowing(isFollowing(user.id))
    window.addEventListener(COLLECTIONS_EVENT, sync)
    return () => window.removeEventListener(COLLECTIONS_EVENT, sync)
  }, [user.id])

  function onClick(e) {
    e.preventDefault()
    e.stopPropagation()
    setFollowing(toggleFollow(user))
  }

  return (
    <button
      className={`follow-btn follow-btn--${size} ${following ? 'is-following' : ''}`}
      onClick={onClick}
      title={following ? `Unfollow ${user.name}` : `Follow ${user.name}`}
    >
      {following ? '✓ Following' : '+ Follow'}
    </button>
  )
}
