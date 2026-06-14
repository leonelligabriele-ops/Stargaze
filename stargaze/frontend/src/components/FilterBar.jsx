import { useState, useRef, useEffect } from 'react'
import './FilterBar.css'

export const FILTER_KEYS = ['region', 'decade', 'genre', 'length']

const opt = v => ({ value: v, label: v })

const FILTERS = [
  {
    key: 'region', label: 'Continent',
    options: ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'].map(opt),
  },
  {
    key: 'decade', label: 'Year',
    options: ['Pre-1960', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'].map(opt),
  },
  {
    key: 'genre', label: 'Genre',
    options: ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
      'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery',
      'Romance', 'Science Fiction', 'Thriller', 'War', 'Western'].map(opt),
  },
  {
    key: 'length', label: 'Length',
    options: [
      { value: 'lt90', label: '< 90 min' },
      { value: '90-120', label: '90–120 min' },
      { value: '120-150', label: '120–150 min' },
      { value: '150-180', label: '150–180 min' },
      { value: 'gt180', label: '> 180 min' },
    ],
  },
]

export default function FilterBar({ value, onChange }) {
  const [open, setOpen] = useState(null)
  const ref = useRef(null)

  // Close any open dropdown when clicking outside the bar.
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function toggleVal(key, v) {
    const cur = value[key] || []
    const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]
    onChange({ ...value, [key]: next })
  }

  function clear(key) {
    onChange({ ...value, [key]: [] })
  }

  const totalSelected = FILTER_KEYS.reduce((n, k) => n + (value[k]?.length || 0), 0)

  return (
    <div className="filter-bar" ref={ref}>
      {FILTERS.map(f => {
        const sel = value[f.key] || []
        return (
          <div className="filter" key={f.key}>
            <button
              className={`filter-btn ${sel.length ? 'active' : ''} ${open === f.key ? 'open' : ''}`}
              onClick={() => setOpen(open === f.key ? null : f.key)}
            >
              {f.label}
              {sel.length > 0 && <span className="filter-count">{sel.length}</span>}
              <span className="caret">⌄</span>
            </button>
            {open === f.key && (
              <div className="filter-menu">
                {f.options.map(o => (
                  <label key={o.value} className="filter-opt">
                    <input
                      type="checkbox"
                      checked={sel.includes(o.value)}
                      onChange={() => toggleVal(f.key, o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
                {sel.length > 0 && (
                  <button className="filter-menu-clear" onClick={() => clear(f.key)}>
                    Clear {f.label.toLowerCase()}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {totalSelected > 0 && (
        <button className="filter-reset" onClick={() => onChange({})} title="Clear all filters">
          ✕ Reset
        </button>
      )}
    </div>
  )
}
