import { useState, useCallback } from 'react'
import SearchBar from './components/SearchBar.jsx'
import ConstellationGraph from './components/ConstellationGraph.jsx'
import MoviePanel from './components/MoviePanel.jsx'
import './App.css'

const API = '/api'

export default function App() {
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)

  const search = useCallback(async (query) => {
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const res = await fetch(`${API}/search?q=${encodeURIComponent(query)}&n=30`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setGraph(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const expandFrom = useCallback(async (tmdbId) => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/similar/${tmdbId}?n=25`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()

      setGraph(prev => {
        if (!prev) return data

        const existingIds = new Set(prev.nodes.map(n => String(n.id)))
        const newNodes = data.nodes.filter(n => !existingIds.has(String(n.id)))

        // After d3 processes links, source/target become objects
        const existingPairs = new Set(
          prev.links.map(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source
            const t = typeof l.target === 'object' ? l.target.id : l.target
            return `${s}|${t}`
          })
        )
        const newLinks = data.links.filter(l => {
          return (
            !existingPairs.has(`${l.source}|${l.target}`) &&
            !existingPairs.has(`${l.target}|${l.source}`)
          )
        })

        return {
          nodes: [...prev.nodes, ...newNodes],
          links: [...prev.links, ...newLinks],
        }
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="app">
      <header className="header">
        <span className="brand">✦ Stargaze</span>
        <SearchBar onSearch={search} loading={loading} />
      </header>

      <div className="workspace">
        <main className="main">
          {error && <div className="error">{error}</div>}

          {!graph && !loading && (
            <div className="empty">
              <div className="empty-star">✦</div>
              <p>Search for a movie, theme, emotion, or director</p>
              <p className="hint">
                "cyberpunk noir", "coming-of-age Japan", "Kubrick space odyssey"
              </p>
            </div>
          )}

          {loading && !graph && (
            <div className="empty">
              <div className="empty-star pulse">✦</div>
              <p>Mapping the constellation…</p>
            </div>
          )}

          {graph && (
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
          />
        )}
      </div>
    </div>
  )
}
