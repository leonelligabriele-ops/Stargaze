import { useState } from 'react'
import './SearchBar.css'

export default function SearchBar({ onSearch, loading }) {
  const [value, setValue] = useState('')

  function submit(e) {
    e.preventDefault()
    const q = value.trim()
    if (q) onSearch(q)
  }

  return (
    <form className="search-form" onSubmit={submit}>
      <input
        className="search-input"
        type="text"
        placeholder="Search movies, themes, directors…"
        value={value}
        onChange={e => setValue(e.target.value)}
        disabled={loading}
        autoFocus
      />
      <button className="search-btn" type="submit" disabled={loading || !value.trim()}>
        {loading ? '…' : 'Search'}
      </button>
    </form>
  )
}
