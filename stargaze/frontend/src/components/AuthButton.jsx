import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { getProfile, COLLECTIONS_EVENT } from '../lib/saved.js'
import AuthModal from './AuthModal.jsx'
import './AuthButton.css'

// Falls back to the owner's email so the Admin link shows without an env var.
// (Real access is still enforced server-side by the public.admins table.)
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'leonelli.gabriele@gmail.com'

/**
 * The single profile button for the top bars: your avatar (uploaded picture or
 * initial), opening a menu with "Your profile" + account actions. Always shown
 * — sign-in/out items only appear when Supabase auth is configured.
 */
export default function AuthButton() {
  const { enabled, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(getProfile)
  const [showModal, setShowModal] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef(null)

  // Keep the avatar live as the profile picture changes / syncs.
  useEffect(() => {
    const sync = () => setProfile(getProfile())
    window.addEventListener(COLLECTIONS_EVENT, sync)
    return () => window.removeEventListener(COLLECTIONS_EVENT, sync)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const initial = (profile.display_name || user?.email || '?').trim()[0]?.toUpperCase() || '?'
  const isAdmin = user && user.email?.toLowerCase() === ADMIN_EMAIL?.toLowerCase()

  return (
    <div className="auth-user" ref={ref}>
      <button
        className="auth-userbtn"
        onClick={() => setMenuOpen(o => !o)}
        aria-label="Your profile"
        title={user?.email || 'Your profile'}
      >
        {profile.avatar ? <img src={profile.avatar} alt="" /> : initial}
      </button>

      {menuOpen && (
        <div className="auth-menu">
          {user && <div className="auth-menu-email">{user.email}</div>}
          <button className="auth-menu-item" onClick={() => { setMenuOpen(false); navigate('/profile') }}>
            Your profile
          </button>
          {isAdmin && (
            <button className="auth-menu-item" onClick={() => { setMenuOpen(false); navigate('/admin') }}>
              Admin dashboard
            </button>
          )}
          {enabled && (user ? (
            <button className="auth-menu-signout" onClick={() => { setMenuOpen(false); signOut() }}>
              Sign out
            </button>
          ) : (
            <button className="auth-menu-item" onClick={() => { setMenuOpen(false); setShowModal(true) }}>
              Sign in
            </button>
          ))}
        </div>
      )}

      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
