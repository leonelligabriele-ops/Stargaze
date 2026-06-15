import { useState, useEffect, useRef } from 'react'
import { API } from '../lib/api.js'
import './SearchBar.css'

export default function SearchBar({
  onSearch,
  onPerson,
  loading,
  initialValue = '',
  placeholder = 'Search movies, themes, directors...',
  buttonLabel = 'Search',
  className = '',
  moviesOnly = false,
}) {
  const [value, setValue] = useState(initialValue)
  const [sug, setSug] = useState({ movies: [], directors: [], people: [] })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)        // suggestions loading
  const [searched, setSearched] = useState(false) // a fetch has completed for current input
  const boxRef = useRef(null)

  // Flat, display-ordered list for keyboard navigation.
  const hasPeople = sug.people?.length > 0
  const people = hasPeople ? sug.people : sug.directors
  // Movies first (priority); people only appear when the letters really match.
  const items = moviesOnly
    ? sug.movies.map(m => ({ type: 'movie', ...m }))
    : [
        ...sug.movies.map(m => ({ type: 'movie', ...m })),
        ...people.map(p => ({ type: 'person', ...p })),
      ]

  // Debounced suggestion fetch.
  useEffect(() => {
    const q = value.trim()
    if (q.length < 2) {
      setSug({ movies: [], directors: [], people: [] })
      setBusy(false); setSearched(false)
      return
    }
    let cancelled = false
    setBusy(true); setSearched(false)
    const t = setTimeout(() => {
      fetch(`${API}/suggest?q=${encodeURIComponent(q)}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (cancelled || !d) return
          setSug({
            movies: d.movies || [],
            directors: d.directors || [],
            people: d.people || [],
          })
          setActive(-1)
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) { setBusy(false); setSearched(true) } })
    }, 180)
    return () => { cancelled = true; clearTimeout(t) }
  }, [value])

  // Close on outside click.
  useEffect(() => {
    const onDown = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function run(q) {
    const term = (q ?? value).trim()
    if (!term) return
    setValue(term)
    setOpen(false)
    onSearch(term)
  }

  function choose(item) {
    if (item.type === 'person' && onPerson) {
      setValue(item.name)
      setOpen(false)
      onPerson(item.name)
      return
    }
    run(item.type === 'person' ? item.name : item.title)
  }

  function onKeyDown(e) {
    if (!open || !items.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % items.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? items.length - 1 : i - 1)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(items[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  const showDrop = open && value.trim().length >= 2 && (busy || items.length > 0 || searched)

  return (
    <div className={`search-box ${className}`.trim()} ref={boxRef}>
      <form className="search-form" onSubmit={e => { e.preventDefault(); run() }}>
        <input
          className="search-input"
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => { setValue(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={loading}
          autoFocus
          autoComplete="off"
        />
        <button className="search-btn" type="submit" disabled={loading || !value.trim()}>
          {loading ? '...' : buttonLabel}
        </button>
      </form>

      {showDrop && (
        <ul className="search-suggest" role="listbox">
          {busy && (
            <li className="ss-loading"><span className="ss-spin" />Loading suggestions…</li>
          )}
          {!busy && searched && items.length === 0 && (
            <li className="ss-empty">No matches found.</li>
          )}
          {sug.movies.length > 0 && <li className="ss-head">Movies</li>}
          {sug.movies.map((m, i) => {
            const idx = i
            return (
              <li
                key={`m-${m.id}`}
                className={`ss-item ${active === idx ? 'active' : ''}`}
                role="option" aria-selected={active === idx}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={e => { e.preventDefault(); choose({ type: 'movie', ...m }) }}
              >
                {m.poster_url
                  ? <img className="ss-poster" src={m.poster_url} alt="" />
                  : <span className="ss-poster ss-poster--ph">✦</span>}
                <span className="ss-info">
                  <span className="ss-title">{m.title}</span>
                  <span className="ss-sub">
                    {m.director || 'Unknown'}{m.year ? ` · ${m.year}` : ''}
                  </span>
                </span>
              </li>
            )
          })}

          {!moviesOnly && people.length > 0 && <li className="ss-head">{hasPeople ? 'People' : 'Directors'}</li>}
          {!moviesOnly && people.map((d, i) => {
            const idx = sug.movies.length + i
            const roles = d.roles?.length ? d.roles.join(', ') : 'Director'
            return (
              <li
                key={`d-${d.name}`}
                className={`ss-item ss-person ${active === idx ? 'active' : ''}`}
                role="option" aria-selected={active === idx}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={e => { e.preventDefault(); choose({ type: 'person', ...d }) }}
              >
                <span className="ss-person-ic">P</span>
                <span className="ss-info">
                  <span className="ss-title">{d.name}</span>
                  <span className="ss-sub">{roles} · {d.count} film{d.count === 1 ? '' : 's'}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
