import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import './AuthModal.css'

/** Shown after a user returns via a password-reset email link. */
export default function SetPasswordModal() {
  const { recovery, completeRecovery, dismissRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  if (!recovery) return null

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await completeRecovery(password)
    setBusy(false)
    if (error) { setMsg({ type: 'err', text: error.message }); return }
    // recovery cleared inside completeRecovery on success → modal unmounts
  }

  return (
    <div className="auth-scrim">
      <div className="auth-modal">
        <button className="auth-close" onClick={dismissRecovery} aria-label="Close">✕</button>
        <h2 className="auth-title">Set a new password</h2>
        <p className="auth-sub">Choose a new password for your account.</p>
        <form onSubmit={submit} className="auth-form">
          <input className="auth-input" type="password" required minLength={6} autoFocus
                 placeholder="New password (min 6 characters)" value={password}
                 onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          {msg && <p className={`auth-msg auth-${msg.type}`}>{msg.text}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? '…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
