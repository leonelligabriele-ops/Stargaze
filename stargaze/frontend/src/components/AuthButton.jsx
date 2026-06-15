import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth.jsx'
import AuthModal from './AuthModal.jsx'
import './AuthButton.css'

/**
 * Account control for the top bars. Renders nothing when Supabase isn't
 * configured (guest-only build), a "Sign in" button when signed out, and an
 * avatar-style menu (email + sign out) when signed in.
 */
export default function AuthButton() {
  const { enabled, user, signOut } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  if (!enabled) return null

  if (!user) {
    return (
      <>
        <button className="signin-btn" onClick={() => setShowModal(true)}>Sign in</button>
        {showModal && <AuthModal onClose={() => setShowModal(false)} />}
      </>
    )
  }

  const initial = (user.email || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <div className="auth-user" ref={ref}>
      <button className="auth-userbtn" onClick={() => setMenuOpen(o => !o)} title={user.email}>
        {initial}
      </button>
      {menuOpen && (
        <div className="auth-menu">
          <div className="auth-menu-email">{user.email}</div>
          <button className="auth-menu-signout" onClick={() => { setMenuOpen(false); signOut() }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
