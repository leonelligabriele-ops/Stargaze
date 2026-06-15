import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { hasLocalData } from '../lib/saved.js'
import './AuthModal.css'

export default function AuthModal({ onClose }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')   // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)         // { type: 'err'|'ok', text }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const fn = mode === 'signup' ? signUp : signIn
    const { data, error } = await fn(email.trim(), password)
    setBusy(false)
    if (error) { setMsg({ type: 'err', text: error.message }); return }
    // Email-confirmation projects return no session on signup until confirmed.
    if (mode === 'signup' && !data.session) {
      setMsg({ type: 'ok', text: 'Account created — check your email to confirm, then sign in.' })
      setMode('signin')
      return
    }
    onClose()   // signed in → sync kicks in via the auth listener
  }

  return (
    <div className="auth-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="auth-modal">
        <button className="auth-close" onClick={onClose} aria-label="Close">✕</button>
        <h2 className="auth-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
        <p className="auth-sub">
          {mode === 'signup' && hasLocalData()
            ? 'Your current saved films and constellations become your account.'
            : 'Save your constellations to the cloud and access them on any device.'}
        </p>

        <form onSubmit={submit} className="auth-form">
          <input className="auth-input" type="email" required placeholder="Email"
                 value={email} onChange={e => setEmail(e.target.value)} autoFocus autoComplete="email" />
          <input className="auth-input" type="password" required minLength={6}
                 placeholder="Password (min 6 characters)" value={password}
                 onChange={e => setPassword(e.target.value)}
                 autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          {msg && <p className={`auth-msg auth-${msg.type}`}>{msg.text}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? '…' : mode === 'signup' ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <p className="auth-toggle">
          {mode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMsg(null) }}>
            {mode === 'signup' ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  )
}
