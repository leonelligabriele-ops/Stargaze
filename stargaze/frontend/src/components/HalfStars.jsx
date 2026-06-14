import { useState } from 'react'
import './HalfStars.css'

/**
 * Interactive 1–5 star rating with half-star precision (0.5, 1, 1.5 … 5).
 * Each star has two click zones — left half = X.5, right half = X.0.
 */
export default function HalfStars({ value = 0, onChange, size = '1.9rem', clearable = false }) {
  const [hover, setHover] = useState(0)
  const active = hover || value || 0

  function pick(v) {
    onChange(clearable && v === value ? null : v)
  }

  return (
    <div className="hstars" style={{ fontSize: size }} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => {
        const fill = active >= n ? 'full' : (active >= n - 0.5 ? 'half' : 'empty')
        return (
          <span key={n} className="hstar">
            <span className="hstar-base">★</span>
            <span className={`hstar-fill ${fill}`}>★</span>
            <button
              type="button" className="hstar-hit left"
              onMouseEnter={() => setHover(n - 0.5)} onClick={() => pick(n - 0.5)}
              aria-label={`${n - 0.5} stars`}
            />
            <button
              type="button" className="hstar-hit right"
              onMouseEnter={() => setHover(n)} onClick={() => pick(n)}
              aria-label={`${n} stars`}
            />
          </span>
        )
      })}
    </div>
  )
}
