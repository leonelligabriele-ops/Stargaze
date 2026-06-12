import { useRef, useCallback, useEffect, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import './ConstellationGraph.css'

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

export default function ConstellationGraph({ data, selected, onSelect, onExpand }) {
  const fgRef    = useRef()
  const centerId = data?.center

  // Only the top-12 scoring nodes get persistent labels.
  // The rest are legible stars that reveal their title via the tooltip on hover.
  const labelSet = useMemo(() => {
    if (!data?.nodes) return new Set()
    const sorted = [...data.nodes].sort((a, b) => (b.score || 0) - (a.score || 0))
    return new Set(sorted.slice(0, 12).map(n => n.id))
  }, [data])

  // Force tuning: stronger repulsion + weight-proportional link distance
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.d3Force('charge')?.strength(-240)
    fg.d3Force('link')?.distance(
      link => 55 + (1 - (link.weight || 0.1)) * 75   // 55 (strong) → 130 (weak)
    )
    fg.d3ReheatSimulation?.()
    const timer = setTimeout(() => fg.zoomToFit?.(500, 110), 1100)
    return () => clearTimeout(timer)
  }, [data?.center])

  const paintNode = useCallback((node, ctx, scale) => {
    const isCenter   = node.id === centerId
    const isSelected = selected?.id === node.id
    const showLabel  = isCenter || isSelected || labelSet.has(node.id)
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

    // ── Label pill ────────────────────────────────────────────────────
    if (showLabel) {
      const label      = truncate(node.title, 22)
      const fs         = Math.max(11 / scale, 2)
      const fontWeight = isCenter || isSelected ? 600 : 400
      ctx.font         = `${fontWeight} ${fs}px Inter, system-ui, sans-serif`

      const tw  = ctx.measureText(label).width
      const padX = fs * 0.55
      const padY = fs * 0.38
      const bx   = node.x - tw / 2 - padX
      const by   = node.y + r + fs * 0.55
      const bw   = tw + padX * 2
      const bh   = fs + padY * 2
      const brad = bh / 2   // full-pill radius

      // Semi-transparent dark pill
      ctx.fillStyle = 'rgba(4, 5, 18, 0.82)'
      pillPath(ctx, bx, by, bw, bh, brad)
      ctx.fill()

      // Optional: subtle border on center label so it stands out more
      if (isCenter) {
        ctx.strokeStyle = `rgba(${hexToRgb(color)}, 0.55)`
        ctx.lineWidth   = 1
        pillPath(ctx, bx, by, bw, bh, brad)
        ctx.stroke()
      }

      // Text centred inside pill
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle    = isSelected
        ? '#ffffff'
        : isCenter
        ? 'rgba(225,235,255,0.98)'
        : 'rgba(190,200,255,0.82)'
      ctx.fillText(label, node.x, by + bh / 2)

      // Reset baselines
      ctx.textBaseline = 'alphabetic'
    }
  }, [selected, centerId, labelSet])

  // Link: both opacity and width encode weight
  const paintLink = useCallback((link, ctx) => {
    const w     = link.weight || 0.1
    const alpha = 0.06 + w * 0.74   // 0.06 (weak) → 0.80 (strong)
    const lw    = 0.3 + w * 2.7     // 0.3 (weak)  → 3.0 (strong)

    ctx.strokeStyle = `rgba(140,160,255,${alpha.toFixed(2)})`
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
        backgroundColor="#05060f"
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => 'replace'}
        nodePointerAreaPaint={paintPointerArea}
        linkCanvasObject={paintLink}
        linkCanvasObjectMode={() => 'replace'}
        onNodeClick={node => onSelect(node)}
        onNodeRightClick={node => onExpand(node.id)}
        nodeLabel={node => `${node.title}${node.year ? ` (${node.year})` : ''}`}
        cooldownTicks={160}
        d3AlphaDecay={0.018}
        d3VelocityDecay={0.28}
        enableZoomInteraction
        enablePanInteraction
      />
      <div className="graph-hint">
        left-click — details &nbsp;·&nbsp; right-click — expand from this star
      </div>
    </div>
  )
}

// Helper: extract R,G,B string from hex colour for rgba() usage
function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return '165,180,252'
  return m.map(x => parseInt(x, 16)).join(',')
}
