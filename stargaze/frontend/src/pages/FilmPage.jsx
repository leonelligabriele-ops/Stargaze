import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { isSaved, toggleSaved } from '../lib/saved.js'
import './FilmPage.css'

const API = '/api'

const GENRE_COLOR = {
  'Action': '#ef4444', 'Adventure': '#f97316', 'Animation': '#fbbf24',
  'Comedy': '#a3e635', 'Crime': '#818cf8', 'Documentary': '#22d3ee',
  'Drama': '#a78bfa', 'Family': '#fb7185', 'Fantasy': '#c084fc',
  'History': '#d97706', 'Horror': '#dc2626', 'Music': '#34d399',
  'Mystery': '#7c3aed', 'Romance': '#f472b6', 'Science Fiction': '#60a5fa',
  'Thriller': '#3b82f6', 'War': '#92400e', 'Western': '#b45309',
}

const LANG = {
  en: 'English', fr: 'French', ja: 'Japanese', it: 'Italian', es: 'Spanish',
  de: 'German', ko: 'Korean', zh: 'Chinese', ru: 'Russian', hi: 'Hindi',
  sv: 'Swedish', da: 'Danish', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish',
  fa: 'Persian', tr: 'Turkish', cn: 'Cantonese',
}

// Watch-provider regions: largest European markets + the Nordics.
const REGIONS = [
  { group: 'Europe', items: [
    { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
    { code: 'DE', flag: '🇩🇪', name: 'Germany' },
    { code: 'FR', flag: '🇫🇷', name: 'France' },
    { code: 'IT', flag: '🇮🇹', name: 'Italy' },
    { code: 'ES', flag: '🇪🇸', name: 'Spain' },
    { code: 'NL', flag: '🇳🇱', name: 'Netherlands' },
    { code: 'PL', flag: '🇵🇱', name: 'Poland' },
  ]},
  { group: 'Scandinavia & Nordics', items: [
    { code: 'SE', flag: '🇸🇪', name: 'Sweden' },
    { code: 'NO', flag: '🇳🇴', name: 'Norway' },
    { code: 'DK', flag: '🇩🇰', name: 'Denmark' },
    { code: 'FI', flag: '🇫🇮', name: 'Finland' },
    { code: 'IS', flag: '🇮🇸', name: 'Iceland' },
  ]},
]
const REGION_NAME = Object.fromEntries(
  REGIONS.flatMap(g => g.items.map(i => [i.code, i.name]))
)
const DEFAULT_REGION = 'SE'

function fmtYear(y) {
  return y != null ? String(Math.trunc(y)) : null
}

function StarRow({ value }) {
  const outOf5 = (value ?? 0) / 2
  const full = Math.floor(outOf5)
  const half = outOf5 - full >= 0.5
  return (
    <span className="stars" aria-hidden="true">
      {[0, 1, 2, 3, 4].map(i => {
        const cls = i < full ? 'full' : (i === full && half ? 'half' : 'empty')
        return <span key={i} className={`star ${cls}`}>★</span>
      })}
    </span>
  )
}

function PosterBlock({ movie }) {
  const [errored, setErrored] = useState(false)
  const accent = GENRE_COLOR[movie.genres?.[0]] ?? 'var(--brand-emerald)'
  if (movie.poster_url && !errored) {
    return (
      <img
        className="film-poster"
        src={movie.poster_url}
        alt={`${movie.title} poster`}
        onError={() => setErrored(true)}
      />
    )
  }
  return (
    <div className="film-poster film-poster--placeholder" style={{ '--accent': accent }}>
      <span className="ph-icon">✦</span>
      <span className="ph-title">{movie.title}</span>
    </div>
  )
}

function WhereToWatch({ data, loading, region, onRegionChange }) {
  const [open, setOpen] = useState(false)
  const count = data?.count ?? 0
  const providers = data?.providers ?? []
  const regionName = REGION_NAME[region] || region

  return (
    <section className="watch">
      <div className="watch-head">
        <button className="watch-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span className="section-label">Where to watch</span>
        </button>
        <div className="watch-head-right">
          <label className="region-select">
            <span className="region-globe">🌐</span>
            <select
              value={region}
              onChange={e => onRegionChange(e.target.value)}
              aria-label="Streaming region"
            >
              {REGIONS.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(i => (
                    <option key={i.code} value={i.code}>{i.flag} {i.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            className={`chevron-btn ${open ? 'up' : ''}`}
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Collapse' : 'Expand'}
          >⌄</button>
        </div>
      </div>

      {!open && (
        <div className="watch-summary">
          {loading ? (
            <span className="watch-muted">Checking availability in {regionName}…</span>
          ) : count > 0 ? (
            <>
              <span className="logo-stack">
                {providers.slice(0, 4).map((p, i) => (
                  <span key={p.name} className="logo-bubble" style={{ zIndex: 4 - i }}>
                    {p.logo_url
                      ? <img src={p.logo_url} alt={p.name} title={p.name} />
                      : <span className="logo-fallback">{p.name[0]}</span>}
                  </span>
                ))}
              </span>
              <span className="watch-text">
                <strong>Available on {count} platform{count === 1 ? '' : 's'}</strong>
                <span className="watch-sub">In {regionName} · stream, rent or buy</span>
              </span>
            </>
          ) : (
            <span className="watch-muted">Not available to stream in {regionName} right now.</span>
          )}
        </div>
      )}

      {open && (
        <div className="watch-body">
          {loading && <p className="watch-muted">Checking availability in {regionName}…</p>}
          {!loading && count === 0 && (
            <p className="watch-muted">Not available to stream in {regionName} right now.</p>
          )}
          {!loading && count > 0 && (
            <>
              <ul className="provider-list">
                {providers.map(p => (
                  <li key={p.name} className="provider">
                    <span className="logo-bubble">
                      {p.logo_url
                        ? <img src={p.logo_url} alt="" />
                        : <span className="logo-fallback">{p.name[0]}</span>}
                    </span>
                    <span className="provider-name">{p.name}</span>
                    <span className="provider-type">{p.type}</span>
                  </li>
                ))}
              </ul>
              {data?.link && (
                <a className="watch-link" href={data.link} target="_blank" rel="noreferrer">
                  View all options on TMDB →
                </a>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

const TABS = ['CAST', 'CREW', 'DETAILS', 'GENRES']

function TabContent({ tab, movie }) {
  if (tab === 'CAST') {
    if (!movie.cast?.length) return <p className="tab-empty">No cast information available.</p>
    return (
      <ul className="people">
        {movie.cast.map(name => (
          <li key={name} className="person">
            <span className="person-avatar">{name[0]}</span>
            <span className="person-name">{name}</span>
          </li>
        ))}
      </ul>
    )
  }

  if (tab === 'CREW') {
    if (!movie.director) return <p className="tab-empty">No crew information available.</p>
    return (
      <ul className="people">
        <li className="person">
          <span className="person-avatar">{movie.director[0]}</span>
          <span className="person-name">{movie.director}</span>
          <span className="person-role">Director</span>
        </li>
      </ul>
    )
  }

  if (tab === 'DETAILS') {
    const rows = []
    if (movie.original_title && movie.original_title !== movie.title)
      rows.push(['Original title', movie.original_title])
    if (movie.year != null) rows.push(['Release year', fmtYear(movie.year)])
    if (movie.original_language)
      rows.push(['Original language', LANG[movie.original_language] || movie.original_language.toUpperCase()])
    if (movie.countries?.length) rows.push(['Country', movie.countries.join(', ')])
    if (movie.rating != null) rows.push(['Rating', `${Number(movie.rating).toFixed(1)} / 10`])
    if (movie.vote_count != null) rows.push(['Votes', Number(movie.vote_count).toLocaleString()])
    if (!rows.length) return <p className="tab-empty">No additional details available.</p>
    return (
      <dl className="details">
        {rows.map(([k, v]) => (
          <div key={k} className="detail-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    )
  }

  if (tab === 'GENRES') {
    if (!movie.genres?.length) return <p className="tab-empty">No genres listed.</p>
    return (
      <div className="genre-chips">
        {movie.genres.map(g => {
          const c = GENRE_COLOR[g] ?? '#6366f1'
          return (
            <span key={g} className="genre-chip" style={{ borderColor: `${c}66`, color: c }}>
              {g}
            </span>
          )
        })}
      </div>
    )
  }
  return null
}

export default function FilmPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [movie, setMovie] = useState(null)
  const [providers, setProviders] = useState(null)
  const [provLoading, setProvLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('CAST')
  const [saved, setSaved] = useState(false)
  const [shared, setShared] = useState(false)
  const [region, setRegion] = useState(DEFAULT_REGION)

  // Core film record — depends only on the id.
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setMovie(null)
    window.scrollTo(0, 0)

    fetch(`${API}/movie/${id}`)
      .then(r => { if (!r.ok) throw new Error(r.status === 404 ? 'Film not found' : `Server error ${r.status}`); return r.json() })
      .then(d => { if (!cancelled) { setMovie(d); setSaved(isSaved(d.id)) } })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [id])

  // Watch providers — refetched whenever the selected region changes.
  useEffect(() => {
    let cancelled = false
    setProvLoading(true); setProviders(null)

    fetch(`${API}/movie/${id}/providers?region=${region}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setProviders(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setProvLoading(false) })

    return () => { cancelled = true }
  }, [id, region])

  const onShare = useCallback(async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: movie?.title || 'Stargaze', url })
      } else {
        await navigator.clipboard.writeText(url)
        setShared(true)
        setTimeout(() => setShared(false), 1600)
      }
    } catch { /* user cancelled */ }
  }, [movie])

  if (loading) {
    return (
      <div className="film-state">
        <span className="film-state-star pulse">✦</span>
        <p>Loading film…</p>
      </div>
    )
  }

  if (error || !movie) {
    return (
      <div className="film-state">
        <span className="film-state-star">✦</span>
        <p>{error || 'Film not found'}</p>
        <button className="ghost-btn" onClick={() => navigate(-1)}>← Back</button>
      </div>
    )
  }

  const year = fmtYear(movie.year)

  return (
    <div className="film">
      {/* Top bar */}
      <header className="film-topbar">
        <button className="back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <span className="back-arrow">←</span>
          <span className="topbar-title">
            <strong>{movie.title}</strong>
            <span className="topbar-sub">{year ? `${movie.director || '—'} · ${year}` : (movie.director || '—')}</span>
          </span>
        </button>

        <div className="topbar-actions">
          <button
            className={`pill-btn ${saved ? 'is-saved' : ''}`}
            onClick={() => setSaved(toggleSaved(movie))}
            aria-pressed={saved}
          >
            {saved ? '★ Saved' : '🔖 Save'}
          </button>
          <button className="icon-pill" onClick={onShare} aria-label="Share">
            {shared ? '✓' : '⤴'}
          </button>
        </div>
      </header>

      <div className="film-grid">
        {/* Left column */}
        <div className="film-left">
          <PosterBlock movie={movie} />
          <div className="rating-block">
            <div className="rating-stars">
              <StarRow value={movie.rating} />
            </div>
            <div className="rating-num">
              {movie.rating != null ? Number(movie.rating).toFixed(1) : '—'}
              <span className="rating-out">/ 10</span>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="film-right">
          <span className="film-chip">FILM</span>

          <h1 className="film-title">
            {movie.title} {year && <span className="film-year">({year})</span>}
          </h1>

          <p className="film-director">
            Directed by <span className="director-name">{movie.director || 'Unknown'}</span>
          </p>

          <section className="film-section">
            <span className="section-label">Description</span>
            <p className="film-desc">
              {movie.description || 'No description available for this title yet.'}
            </p>
          </section>

          <WhereToWatch
            data={providers}
            loading={provLoading}
            region={region}
            onRegionChange={setRegion}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="film-tabs">
        <div className="tab-row">
          {TABS.map(t => (
            <button
              key={t}
              className={`tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="tab-panel">
          <TabContent tab={tab} movie={movie} />
        </div>
      </div>

      {/* Comments */}
      <section className="comments">
        <div className="comments-head">
          <span className="section-label">Comments</span>
          <span className="review-badge">0 REVIEWS</span>
        </div>
        <p className="tab-empty">No reviews yet. Be the first.</p>
      </section>
    </div>
  )
}
