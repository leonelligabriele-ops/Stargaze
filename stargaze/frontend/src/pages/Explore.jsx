import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import SearchBar from '../components/SearchBar.jsx'
import FilterBar, { FILTER_KEYS } from '../components/FilterBar.jsx'
import ConstellationGraph from '../components/ConstellationGraph.jsx'
import MoviePanel from '../components/MoviePanel.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import ProfileAvatar from '../components/ProfileAvatar.jsx'
import AuthButton from '../components/AuthButton.jsx'
import { getBlockedIds } from '../lib/saved.js'
import { API } from '../lib/api.js'
import './Explore.css'

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const query = searchParams.get('q') || ''
  const person = searchParams.get('person') || ''

  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)

  // Selected filters, derived from the URL.
  const filterValue = useMemo(() => {
    const v = {}
    for (const k of FILTER_KEYS) {
      const s = searchParams.get(k)
      v[k] = s ? s.split(',') : []
    }
    return v
  }, [searchParams])

  const paramsKey = searchParams.toString()
  const hasFilters = FILTER_KEYS.some(k => searchParams.get(k))

  // Fetch whenever the query, a filter, or the person changes. A person/query
  // search runs immediately; filter changes are debounced so picking several in
  // a row triggers a single combined search.
  useEffect(() => {
    const personName = searchParams.get('person')
    const q = (searchParams.get('q') || '').trim()
    const filtersActive = FILTER_KEYS.some(k => searchParams.get(k))
    if (!personName && !q && !filtersActive) { setGraph(null); return }

    let cancelled = false
    const run = () => {
      setLoading(true); setError(null); setSelected(null)

      const blocked = getBlockedIds().join(',')
      let url
      if (personName) {
        const qs = new URLSearchParams({ name: personName })
        if (blocked) qs.set('blocked', blocked)
        url = `${API}/person?${qs.toString()}`
      } else {
        const qs = new URLSearchParams()
        if (q) qs.set('q', q)
        for (const k of FILTER_KEYS) {
          const val = searchParams.get(k)
          if (val) qs.set(k, val)
        }
        if (blocked) qs.set('blocked', blocked)
        url = `${API}/search?${qs.toString()}`
      }

      fetch(url)
        .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.json() })
        .then(d => { if (!cancelled) setGraph(d) })
        .catch(e => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }

    const timer = setTimeout(run, personName ? 0 : 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [paramsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Submitting a search leaves person mode and keeps the active filters.
  const onSearch = useCallback((q) => {
    const p = new URLSearchParams(searchParams)
    p.delete('person')
    if (q) p.set('q', q); else p.delete('q')
    setSearchParams(p)
  }, [searchParams, setSearchParams])

  // Changing filters keeps the current query (and leaves person mode).
  const onFiltersChange = useCallback((next) => {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    for (const k of FILTER_KEYS) {
      if (next[k]?.length) p.set(k, next[k].join(','))
    }
    setSearchParams(p)
  }, [query, setSearchParams])

  // Clicking a person (director / actor / crew) → their constellation.
  const onPerson = useCallback((name) => {
    if (name) setSearchParams({ person: name })
  }, [setSearchParams])

  const clearPerson = useCallback(() => {
    const p = new URLSearchParams(searchParams)
    p.delete('person')
    setSearchParams(p)
  }, [searchParams, setSearchParams])

  // Expand = drill in: rebuild as a fresh ~50-star constellation on the chosen film.
  const expandFrom = useCallback(async (tmdbId) => {
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const blocked = getBlockedIds().join(',')
      const qs = blocked ? `?n=50&blocked=${encodeURIComponent(blocked)}` : '?n=50'
      const res = await fetch(`${API}/similar/${tmdbId}${qs}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setGraph(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Blocking a film removes it from the current map (future searches exclude it).
  const onBlock = useCallback((movie) => {
    const removeId = String(movie.id)
    setGraph(g => {
      if (!g) return g
      const nodes = g.nodes.filter(n => String(n.id) !== removeId)
      const links = (g.links || []).filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source
        const t = typeof l.target === 'object' ? l.target.id : l.target
        return String(s) !== removeId && String(t) !== removeId
      })
      return { ...g, nodes, links }
    })
    setSelected(null)
  }, [])

  const hasResults = graph && graph.nodes?.length > 0
  const noMatches = graph && graph.nodes?.length === 0

  return (
    <div className="explore">
      <header className="explore-header">
        <button className="brand-link" onClick={() => navigate('/')} aria-label="Back to home">
          <span className="brand">✦ Stargaze</span>
        </button>
        <SearchBar onSearch={onSearch} onPerson={onPerson} loading={loading} initialValue={query} />
        {person ? (
          <div className="person-pill">
            <span className="person-pill-icon">🎬</span>
            Films with <strong>{person}</strong>
            <button onClick={clearPerson} aria-label="Clear person" title="Clear">✕</button>
          </div>
        ) : (
          <FilterBar value={filterValue} onChange={onFiltersChange} />
        )}
        <div className="explore-bell"><NotificationBell /><ProfileAvatar /><AuthButton /></div>
      </header>

      <div className="workspace">
        <main className="main">
          {error && <div className="error">{error}</div>}

          {!graph && !loading && (
            <div className="empty">
              <div className="empty-star">✦</div>
              <p>Search for a movie, theme, emotion, or director</p>
              <p className="hint">
                …or just pick filters to browse — try Genre · Horror + Year · 1980s
              </p>
            </div>
          )}

          {loading && !hasResults && (
            <div className="empty">
              <div className="empty-star pulse">✦</div>
              <p>{person ? `Mapping ${person}'s films…` : 'Mapping the constellation…'}</p>
            </div>
          )}

          {noMatches && !loading && (
            <div className="empty">
              <div className="empty-star">✦</div>
              <p>{person ? `No films found for ${person}` : 'No films match these filters'}</p>
              <p className="hint">
                {person
                  ? 'They may not have enough films in this dataset.'
                  : (hasFilters ? 'Try removing a filter or broadening your search.' : 'Try a different search.')}
              </p>
            </div>
          )}

          {hasResults && (
            <ConstellationGraph
              data={graph}
              selected={selected}
              onSelect={setSelected}
              onExpand={expandFrom}
            />
          )}
        </main>

        {selected && (
          <MoviePanel
            movie={selected}
            onClose={() => setSelected(null)}
            onExpand={expandFrom}
            onPerson={onPerson}
            onBlock={onBlock}
          />
        )}
      </div>
    </div>
  )
}
