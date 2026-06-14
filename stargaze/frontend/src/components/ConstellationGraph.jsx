import { useRef, useState, useCallback, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCollide } from 'd3-force'
import './ConstellationGraph.css'

// Cap auto-fit zoom so tiny graphs (e.g. one saved film) don't fill the screen.
const MAX_FIT_ZOOM = 2.5

const GENRE_COLOR = {
  'Action': '#ef4444', 'Adventure': '#f97316', 'Animation': '#fbbf24',
  'Comedy': '#a3e635', 'Crime': '#818cf8', 'Documentary': '#22d3ee',
  'Drama': '#a78bfa', 'Family': '#fb7185', 'Fantasy': '#c084fc',
  'History': '#d97706', 'Horror': '#dc2626', 'Music': '#34d399',
  'Mystery': '#7c3aed', 'Romance': '#f472b6', 'Science Fiction': '#60a5fa',
  'Thriller': '#3b82f6', 'War': '#92400e', 'Western': '#b45309',
}

function nodeColor(genres) {
  if (!genres?.length) return '#6366f1'
  for (const g of genres) {
    if (GENRE_COLOR[g]) return GENRE_COLOR[g]
  }
  return '#6366f1'
}

function nodeRadius(node, isCenter) {
  const r = 6 + Math.pow(node.score || 0, 2) * 14
  return isCenter ? r * 1.5 : r
}

function starPath(ctx, cx, cy, outerR) {
  const spikes = 5
  const innerR = outerR * 0.42
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
  }
  ctx.closePath()
}

// Rounded rectangle path (CanvasRenderingContext2D.roundRect not universally available)
function pillPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function Legend() {
  const [open, setOpen] = useState(false)
  return (
    <div className="legend">
      {open && (
        <div className="legend-panel">
          <div className="legend-title">Star colour = genre</div>
          <div className="legend-grid">
            {Object.entries(GENRE_COLOR).map(([name, color]) => (
              <div key={name} className="legend-row">
                <span className="legend-swatch" style={{ background: color }} />
                <span className="legend-name">{name}</span>
              </div>
            ))}
            <div className="legend-row">
              <span className="legend-swatch" style={{ background: '#6366f1' }} />
              <span className="legend-name">Other / unknown</span>
            </div>
          </div>
        </div>
      )}
      <button className="legend-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="legend-toggle-dot" /> Genres
        <span className={`legend-caret ${open ? 'up' : ''}`}>⌄</span>
      </button>
    </div>
  )
}

export default function ConstellationGraph({
  data, selected, onSelect, onExpand,
  hint = 'left-click — details  ·  right-click — expand from this star',
}) {
  const fgRef    = useRef()
  const centerId = data?.center

  // Force tuning: open the field up so the constellation is easy to explore.
  //  · stronger (but range-limited) repulsion pushes stars apart
  //  · longer links — weaker/less-similar pairs sit further out
  //  · a collision force guarantees stars + their labels never overlap
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const cId = data?.center

    fg.d3Force('charge')
      ?.strength(-520)        // was -240: much more breathing room
      .distanceMax(900)       // cap so huge graphs don't blow apart

    fg.d3Force('link')?.distance(
      link => 110 + (1 - (link.weight || 0.1)) * 190   // 110 (strong) → 300 (weak)
    )

    // Keep a hard minimum gap around every star (radius + label headroom).
    fg.d3Force('collide', forceCollide(node => {
      const isCenter = node.id === cId
      return nodeRadius(node, isCenter) + (isCenter ? 30 : 22)
    }).strength(0.9).iterations(2))

    fg.d3ReheatSimulation?.()
    const fit = setTimeout(() => fg.zoomToFit?.(600, 90), 1400)
    // zoomToFit over-zooms when there are very few stars (e.g. a single saved
    // film) — the lone star would fill the screen. Clamp the resulting zoom.
    const clamp = setTimeout(() => {
      if (fg.zoom && fg.zoom() > MAX_FIT_ZOOM) fg.zoom(MAX_FIT_ZOOM, 400)
    }, 2150)
    return () => { clearTimeout(fit); clearTimeout(clamp) }
    // Re-centers (expand/drill-in) change the centre id → re-settle + refit.
  }, [data?.center])

  const paintNode = useCallback((node, ctx) => {
    const isCenter   = node.id === centerId
    const isSelected = selected?.id === node.id
    const color      = nodeColor(node.genres)
    const r          = nodeRadius(node, isCenter)

    // ── Star body + glow ──────────────────────────────────────────────
    ctx.shadowColor = color
    ctx.shadowBlur  = isSelected ? 28 : isCenter ? 22 : 10
    starPath(ctx, node.x, node.y, r)
    ctx.fillStyle   = color
    ctx.fill()
    ctx.shadowBlur  = 0

    // ── White outline for center / selected ───────────────────────────
    if (isCenter || isSelected) {
      starPath(ctx, node.x, node.y, r)
      ctx.strokeStyle = isSelected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)'
      ctx.lineWidth   = isSelected ? 2.2 : 1.6
      ctx.stroke()
    }
  }, [selected, centerId])

  // Labels are drawn in a separate post-pass so they can be placed by
  // importance with collision avoidance — the most important films always get a
  // visible, non-overlapping title, and labels distribute around the stars.
  const paintLabels = useCallback((ctx, globalScale) => {
    if (!data?.nodes) return
    const fs = Math.max(11 / globalScale, 2)
    const padX = fs * 0.55
    const padY = fs * 0.38
    const placed = []

    const overlaps = (x0, y0, x1, y1) =>
      placed.some(p => x0 < p.x1 && x1 > p.x0 && y0 < p.y1 && y1 > p.y0)

    // Priority: centre, then selected, then by relevance score.
    const order = [...data.nodes].sort((a, b) => {
      const pa = a.id === centerId ? 2 : (selected?.id === a.id ? 1 : 0)
      const pb = b.id === centerId ? 2 : (selected?.id === b.id ? 1 : 0)
      return pb - pa || (b.score || 0) - (a.score || 0)
    })

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (const node of order) {
      const isCenter   = node.id === centerId
      const isSelected = selected?.id === node.id
      const r     = nodeRadius(node, isCenter)
      const label = truncate(node.title, 22)
      ctx.font = `${isCenter || isSelected ? 600 : 400} ${fs}px Inter, system-ui, sans-serif`
      const bw  = ctx.measureText(label).width + padX * 2
      const bh  = fs + padY * 2
      const off = r + fs * 0.5

      // Try placements around the star: below, above, right, left.
      const candidates = [
        [node.x - bw / 2, node.y + off],
        [node.x - bw / 2, node.y - off - bh],
        [node.x + off, node.y - bh / 2],
        [node.x - off - bw, node.y - bh / 2],
      ]
      let spot = null
      for (const [bx, by] of candidates) {
        if (!overlaps(bx, by, bx + bw, by + bh)) { spot = [bx, by]; break }
      }
      // Centre/selected are always labelled even if it means overlapping.
      if (!spot) {
        if (isCenter || isSelected) spot = [node.x - bw / 2, node.y + off]
        else continue
      }

      const [bx, by] = spot
      const brad = bh / 2
      ctx.fillStyle = 'rgba(4, 5, 18, 0.82)'
      pillPath(ctx, bx, by, bw, bh, brad)
      ctx.fill()
      if (isCenter) {
        ctx.strokeStyle = `rgba(${hexToRgb(nodeColor(node.genres))}, 0.55)`
        ctx.lineWidth = 1
        pillPath(ctx, bx, by, bw, bh, brad)
        ctx.stroke()
      }
      ctx.fillStyle = isSelected ? '#ffffff'
        : isCenter ? 'rgba(225,235,255,0.98)' : 'rgba(190,200,255,0.82)'
      ctx.fillText(label, bx + bw / 2, by + bh / 2)
      placed.push({ x0: bx, y0: by, x1: bx + bw, y1: by + bh })
    }
    ctx.textBaseline = 'alphabetic'
  }, [data, centerId, selected])

  // Link: both opacity and width encode weight. Gold edges per the cosmos theme.
  const paintLink = useCallback((link, ctx) => {
    const w     = link.weight || 0.1
    const alpha = 0.05 + w * 0.55   // 0.05 (weak) → 0.60 (strong)
    const lw    = 0.3 + w * 2.4     // 0.3 (weak)  → 2.7 (strong)

    ctx.strokeStyle = `rgba(245,166,35,${alpha.toFixed(2)})`
    ctx.lineWidth   = lw
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(link.source.x, link.source.y)
    ctx.lineTo(link.target.x, link.target.y)
    ctx.stroke()
  }, [])

  // Click hit-area: circle covering the full visual star
  const paintPointerArea = useCallback((node, color, ctx) => {
    const r = nodeRadius(node, node.id === centerId) + 3
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fill()
  }, [centerId])

  return (
    <div className="graph-wrap">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => 'replace'}
        nodePointerAreaPaint={paintPointerArea}
        linkCanvasObject={paintLink}
        linkCanvasObjectMode={() => 'replace'}
        onRenderFramePost={paintLabels}
        onNodeClick={node => onSelect(node)}
        onNodeRightClick={node => onExpand(node.id)}
        nodeLabel={node => `${node.title}${node.year ? ` (${Math.trunc(node.year)})` : ''}`}
        cooldownTicks={220}
        d3AlphaDecay={0.018}
        d3VelocityDecay={0.24}
        enableZoomInteraction
        enablePanInteraction
      />
      {hint && <div className="graph-hint">{hint}</div>}
      <Legend />
    </div>
  )
}

// Helper: extract R,G,B string from hex colour for rgba() usage
function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return '165,180,252'
  return m.map(x => parseInt(x, 16)).join(',')
}
