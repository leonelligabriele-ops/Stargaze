import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { isFollowing, follow, unfollow } from '../lib/profiles.js'
import AuthModal from './AuthModal.jsx'
import './FollowButton.css'

/**
 * Real Follow ⇄ Following toggle against the Supabase social graph.
 * Renders nothing when auth is disabled or for your own profile. Prompts
 * sign-in if a signed-out visitor clicks it.
 */
export default function FollowButton({ targetId, size = 'md', onChange }) {
  const { enabled, user } = useAuth()
  const [following, setFollowing] = useState(false)
  const [ready, setReady] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!user || !targetId) { setReady(true); return }
    isFollowing(targetId, user.id).then(f => { if (!cancelled) { setFollowing(f); setReady(true) } })
    return () => { cancelled = true }
  }, [user, targetId])

  if (!enabled || !targetId) return null
  if (user && user.id === targetId) return null   // can't follow yourself

  async function onClick(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!user) { setShowAuth(true); return }
    const next = !following
    setFollowing(next)                              // optimistic
    const { error } = next ? await follow(targetId, user.id) : await unfollow(targetId, user.id)
    if (error) setFollowing(!next)                  // revert on failure
    else onChange?.(next)
  }

  return (
    <>
      <button
        className={`follow-btn follow-btn--${size} ${following ? 'is-following' : ''}`}
        onClick={onClick}
        disabled={!ready && Boolean(user)}
      >
        {following ? '✓ Following' : '+ Follow'}
      </button>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
