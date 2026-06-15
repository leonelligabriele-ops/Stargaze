import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import './Admin.css'

export default function Admin() {
  const navigate = useNavigate()
  const { enabled, user, loading } = useAuth()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!enabled || !user) { setPending(false); setError('Sign in required.'); return }
    let cancelled = false
    supabase.rpc('admin_stats')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setStats(data)
      })
      .finally(() => { if (!cancelled) setPending(false) })
    return () => { cancelled = true }
  }, [enabled, user, loading])

  return (
    <div className="admin">
      <header className="profile-bar">
        <button className="back-arrow-btn" onClick={() => navigate('/')} aria-label="Home">←</button>
        <span className="profile-brand">Stargaze · Admin</span>
      </header>

      {pending ? (
        <p className="admin-msg">Loading…</p>
      ) : error ? (
        <div className="admin-denied">
          <span className="empty-glyph">🔒</span>
          <p>You don’t have admin access.</p>
          <p className="admin-hint">{error}</p>
        </div>
      ) : (
        <section className="admin-body">
          <div className="admin-cards">
            <div className="admin-card">
              <span className="admin-num">{stats.total_users}</span>
              <span className="admin-label">Total users</span>
            </div>
            <div className="admin-card">
              <span className="admin-num">{stats.with_data}</span>
              <span className="admin-label">With saved data</span>
            </div>
            <div className="admin-card">
              <span className="admin-num">{stats.signups_7d}</span>
              <span className="admin-label">Signups · 7 days</span>
            </div>
          </div>

          <h2 className="admin-h2">Latest signups</h2>
          <ul className="admin-list">
            {(stats.latest || []).map((u, i) => (
              <li key={i}>
                <span className="admin-email">{u.email}</span>
                <span className="admin-when">{new Date(u.created_at).toLocaleDateString()}</span>
              </li>
            ))}
            {(!stats.latest || stats.latest.length === 0) && <li className="admin-msg">No users yet.</li>}
          </ul>
        </section>
      )}
    </div>
  )
}
