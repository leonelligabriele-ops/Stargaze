import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { searchProfiles, suggestedProfiles } from '../lib/profiles.js'
import PersonRow from './PersonRow.jsx'

/** Find and follow real stargazers (by name or @username). */
export default function PeopleToFollow() {
  const { enabled, user } = useAuth()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [suggested, setSuggested] = useState([])

  useEffect(() => {
    if (!user) { setSuggested([]); return }
    let cancelled = false
    suggestedProfiles(user.id).then(r => { if (!cancelled) setSuggested(r) })
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    if (!user) return
    const term = q.trim()
    if (!term) { setResults([]); return }
    let cancelled = false
    const t = setTimeout(() => {
      searchProfiles(term, user.id).then(r => { if (!cancelled) setResults(r) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, user])

  if (!enabled) return null

  const list = q.trim() ? results : suggested

  return (
    <section className="people-section">
      <div className="cs-head">
        <div>
          <h2 className="cs-title">People to follow</h2>
          <p className="cs-sub">Find other stargazers by name or @username</p>
        </div>
      </div>

      {!user ? (
        <div className="conn-empty">
          <span className="empty-glyph">👤</span>
          <p>Sign in to find and follow other stargazers.</p>
        </div>
      ) : (
        <>
          <input
            className="people-search"
            placeholder="Search people…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {list.length ? (
            <div className="people-row">
              {list.map(p => <PersonRow key={p.id} profile={p} />)}
            </div>
          ) : (
            <p className="cs-sub people-empty">
              {q.trim() ? 'No people found.' : 'No one to suggest yet — invite friends to sign up!'}
            </p>
          )}
        </>
      )}
    </section>
  )
}
