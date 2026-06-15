import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import HalfStars from '../components/HalfStars.jsx'
import SaveMenu from '../components/SaveMenu.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import AuthButton from '../components/AuthButton.jsx'
import { getReview, setReview, removeWatched, isBlocked, toggleBlocked } from '../lib/saved.js'
import { API } from '../lib/api.js'
import './FilmPage.css'

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

function fmtRuntime(min) {
  if (!min || min <= 0) return null
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h ${m}m` : `${m}m`
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

function PersonItem({ name, role, onPerson }) {
  return (
    <li className="person person--clickable" onClick={() => onPerson(name)}
        title={`See ${name}'s constellation`}>
      <span className="person-avatar">{(name || '?')[0]}</span>
      <span className="person-name">{name}</span>
      {role && <span className="person-role">{role}</span>}
    </li>
  )
}

function TabContent({ tab, movie, onPerson }) {
  if (tab === 'CAST') {
    if (!movie.cast?.length) return <p className="tab-empty">No cast information available.</p>
    return (
      <ul className="people">
        {movie.cast.map(name => <PersonItem key={name} name={name} onPerson={onPerson} />)}
      </ul>
    )
  }

  if (tab === 'CREW') {
    // Most important people, in priority order, deduped, ~5–6 shown.
    const ordered = [
      [movie.director, 'Director'],
      ...(movie.dop || []).map(n => [n, 'Cinematography']),
      ...(movie.writers || []).map(n => [n, 'Screenplay']),
      ...(movie.producers || []).map(n => [n, 'Producer']),
    ].filter(([n]) => n)
    const seen = new Set()
    const crew = []
    for (const [name, role] of ordered) {
      if (!seen.has(name)) { seen.add(name); crew.push({ name, role }) }
    }
    const top = crew.slice(0, 6)
    if (!top.length) return <p className="tab-empty">No crew information available.</p>
    return (
      <ul className="people">
        {top.map(c => <PersonItem key={c.name} name={c.name} role={c.role} onPerson={onPerson} />)}
      </ul>
    )
  }

  if (tab === 'DETAILS') {
    const rows = []
    if (movie.original_title && movie.original_title !== movie.title)
      rows.push(['Original title', movie.original_title])
    if (movie.year != null) rows.push(['Release year', fmtYear(movie.year)])
    if (fmtRuntime(movie.runtime)) rows.push(['Runtime', fmtRuntime(movie.runtime)])
    if (movie.original_language)
      rows.push(['Original language', LANG[movie.original_language] || movie.original_language.toUpperCase()])
    if (movie.countries?.length) rows.push(['Country', movie.countries.join(', ')])
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
  const [shared, setShared] = useState(false)
  const [region, setRegion] = useState(DEFAULT_REGION)

  // Your grade (1–5) + comment for this film.
  const [myRating, setMyRating] = useState(null)
  const [comment, setComment] = useState('')
  const [commentSaved, setCommentSaved] = useState(false)
  const [commentOpen, setCommentOpen] = useState(false)
  const [trailer, setTrailer] = useState(null)
  const [trailerOpen, setTrailerOpen] = useState(false)
  const [blocked, setBlocked] = useState(false)

  // Core film record — depends only on the id.
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setMovie(null)
    const r = getReview(id)
    setMyRating(r.rating); setComment(r.comment); setCommentSaved(false)
    window.scrollTo(0, 0)

    fetch(`${API}/movie/${id}`)
      .then(r => { if (!r.ok) throw new Error(r.status === 404 ? 'Film not found' : `Server error ${r.status}`); return r.json() })
      .then(d => { if (!cancelled) { setMovie(d); setBlocked(isBlocked(d.id)) } })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [id])

  // Clicking a star grades the film and immediately adds it to Watched.
  const onRate = useCallback((n) => {
    setMyRating(n)
    setReview(movie, n, comment)
  }, [movie, comment])

  const onSaveComment = useCallback(() => {
    setReview(movie, myRating, comment)
    setCommentSaved(true)
    setTimeout(() => setCommentSaved(false), 1600)
  }, [movie, myRating, comment])

  const onRemoveReview = useCallback(() => {
    removeWatched(id)
    setMyRating(null); setComment('')
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

  // Trailer — fetched once per film; the heavy YouTube iframe only mounts on play.
  useEffect(() => {
    let cancelled = false
    setTrailer(null); setTrailerOpen(false)
    fetch(`${API}/movie/${id}/trailer`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setTrailer(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [id])

  // Close the trailer with Escape.
  useEffect(() => {
    if (!trailerOpen) return
    const onKey = e => { if (e.key === 'Escape') setTrailerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [trailerOpen])

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

  // Clicking a director / actor / crew member → their constellation in Explore.
  const goToPerson = useCallback((name) => {
    if (name) navigate(`/explore?person=${encodeURIComponent(name)}`)
  }, [navigate])

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
          <SaveMenu movie={movie} variant="pill" />
          <button className="icon-pill" onClick={onShare} aria-label="Share">
            {shared ? '✓' : '⤴'}
          </button>
          <button
            className={`icon-pill block-pill has-tip ${blocked ? 'is-blocked' : ''}`}
            data-tip={blocked ? 'Blocked — click to unblock' : 'Block — never recommend again'}
            onClick={() => setBlocked(toggleBlocked(movie))}
            aria-label="Block film"
            aria-pressed={blocked}
          >🚫</button>
          <NotificationBell />
          <AuthButton />
        </div>
      </header>

      <div className="film-grid">
        {/* Left column */}
        <div className="film-left">
          <PosterBlock movie={movie} />

          {/* Your rating — grading a film adds it to Watched immediately */}
          <div className="grade-card">
            <span className="section-label">Your rating</span>
            <HalfStars value={myRating || 0} onChange={onRate} />

            <div className="comment-drop">
              <button
                className="comment-toggle"
                onClick={() => setCommentOpen(o => !o)}
                aria-expanded={commentOpen}
              >
                {comment ? '✎ Your comment' : '+ Add a comment'}
                <span className={`caret ${commentOpen ? 'up' : ''}`}>⌄</span>
              </button>

              {!commentOpen && comment && <p className="comment-preview">“{comment}”</p>}

              {commentOpen && (
                <div className="comment-body">
                  <textarea
                    className="grade-comment"
                    placeholder="Write a comment about this film…"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                  />
                  <button className="grade-save" onClick={onSaveComment}>
                    {commentSaved ? '✓ Saved' : 'Save comment'}
                  </button>
                </div>
              )}
            </div>

            {(myRating || comment) && (
              <button className="grade-remove" onClick={onRemoveReview}>Remove from Watched</button>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="film-right">
          <span className="film-chip">FILM</span>

          <h1 className="film-title">
            {movie.title} {year && <span className="film-year">({year})</span>}
          </h1>

          <p className="film-director">
            Directed by {movie.director
              ? <button className="director-name person-link" onClick={() => goToPerson(movie.director)}>{movie.director}</button>
              : <span className="director-name">Unknown</span>}
          </p>

          {fmtRuntime(movie.runtime) && (
            <p className="film-meta"><span className="meta-clock">🕑</span> {fmtRuntime(movie.runtime)}</p>
          )}

          <section className="film-section">
            <span className="section-label">Description</span>
            <p className="film-desc">
              {movie.description || 'No description available for this title yet.'}
            </p>
          </section>

          {trailer?.key && (
            <section className="film-section">
              <span className="section-label">Trailer</span>
              <button className="trailer-thumb" onClick={() => setTrailerOpen(true)} aria-label="Play trailer">
                <img
                  src={`https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`}
                  alt=""
                  loading="lazy"
                />
                <span className="trailer-play" aria-hidden="true">▶</span>
              </button>
            </section>
          )}

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
          <TabContent tab={tab} movie={movie} onPerson={goToPerson} />
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

      {/* Trailer lightbox — iframe only mounts while open */}
      {trailerOpen && trailer?.key && (
        <div className="trailer-modal" onClick={() => setTrailerOpen(false)}>
          <div className="trailer-frame" onClick={e => e.stopPropagation()}>
            <button className="trailer-close" onClick={() => setTrailerOpen(false)} aria-label="Close trailer">✕</button>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
              title={`${movie.title} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  )
}
