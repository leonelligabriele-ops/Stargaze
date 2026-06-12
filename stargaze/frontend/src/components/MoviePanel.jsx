import './MoviePanel.css'

const GENRE_COLOR = {
  'Action': '#ef4444', 'Adventure': '#f97316', 'Animation': '#fbbf24',
  'Comedy': '#a3e635', 'Crime': '#818cf8', 'Documentary': '#22d3ee',
  'Drama': '#a78bfa', 'Family': '#fb7185', 'Fantasy': '#c084fc',
  'History': '#d97706', 'Horror': '#dc2626', 'Music': '#34d399',
  'Mystery': '#7c3aed', 'Romance': '#f472b6', 'Science Fiction': '#60a5fa',
  'Thriller': '#3b82f6', 'War': '#92400e', 'Western': '#b45309',
}

function GenreTag({ name }) {
  const color = GENRE_COLOR[name] ?? '#6366f1'
  return (
    <span
      className="genre-tag"
      style={{ borderColor: `${color}55`, color }}
    >
      {name}
    </span>
  )
}

export default function MoviePanel({ movie, onClose, onExpand }) {
  const showOriginal =
    movie.original_title &&
    movie.original_title !== movie.title

  return (
    <aside className="panel">
      <button className="panel-close" onClick={onClose} title="Close">✕</button>

      <div className="panel-title">{movie.title}</div>
      {showOriginal && (
        <div className="panel-orig">{movie.original_title}</div>
      )}

      <div className="panel-meta">
        {movie.year && <span>{movie.year}</span>}
        {movie.vote_average != null && (
          <span>★ {Number(movie.vote_average).toFixed(1)}</span>
        )}
      </div>

      {movie.explanation && (
        <div className="panel-explanation">{movie.explanation}</div>
      )}

      {movie.genres?.length > 0 && (
        <div className="panel-genres">
          {movie.genres.map(g => <GenreTag key={g} name={g} />)}
        </div>
      )}

      {movie.director && (
        <div className="panel-field">
          <span className="field-label">Director</span>
          <span>{movie.director}</span>
        </div>
      )}

      {movie.cast?.length > 0 && (
        <div className="panel-field">
          <span className="field-label">Cast</span>
          <span>{movie.cast.join(', ')}</span>
        </div>
      )}

      {movie.keywords?.length > 0 && (
        <div className="panel-field">
          <span className="field-label">Keywords</span>
          <span className="keywords">{movie.keywords.join(' · ')}</span>
        </div>
      )}

      {movie.overview && (
        <p className="panel-overview">{movie.overview}</p>
      )}

      <button className="expand-btn" onClick={() => onExpand(movie.id)}>
        ✦ Expand constellation from here
      </button>
    </aside>
  )
}
