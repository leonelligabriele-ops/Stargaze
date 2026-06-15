import { useState, useRef, useEffect } from 'react'
import './AvatarEditor.css'

const FRAME = 260   // on-screen crop circle (px)
const OUT = 256     // exported avatar size (px)

export default function AvatarEditor({ src, onSave, onCancel }) {
  const [img, setImg] = useState(null)          // { el, w, h, cover }
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const drag = useRef(null)

  useEffect(() => {
    const el = new Image()
    el.onload = () => {
      const cover = Math.max(FRAME / el.naturalWidth, FRAME / el.naturalHeight)
      const s = cover
      setImg({ el, w: el.naturalWidth, h: el.naturalHeight, cover })
      setZoom(1)
      setOff({ x: (FRAME - el.naturalWidth * s) / 2, y: (FRAME - el.naturalHeight * s) / 2 })
    }
    el.src = src
    return () => { el.onload = null }
  }, [src])

  const scale = img ? img.cover * zoom : 1
  const dw = img ? img.w * scale : 0
  const dh = img ? img.h * scale : 0

  const clampAt = (s, o) => {
    const w = img.w * s, h = img.h * s
    return { x: Math.min(0, Math.max(FRAME - w, o.x)), y: Math.min(0, Math.max(FRAME - h, o.y)) }
  }

  const pt = e => {
    const t = e.touches?.[0]
    return { x: t ? t.clientX : e.clientX, y: t ? t.clientY : e.clientY }
  }
  function onDown(e) {
    const p = pt(e)
    drag.current = { sx: p.x, sy: p.y, ox: off.x, oy: off.y }
  }
  function onMove(e) {
    if (!drag.current || !img) return
    const p = pt(e)
    setOff(clampAt(scale, { x: drag.current.ox + (p.x - drag.current.sx), y: drag.current.oy + (p.y - drag.current.sy) }))
  }
  function onUp() { drag.current = null }

  function onZoom(e) {
    const nz = parseFloat(e.target.value)
    const s0 = img.cover * zoom, s1 = img.cover * nz
    setOff(o => clampAt(s1, {
      x: FRAME / 2 - (FRAME / 2 - o.x) * (s1 / s0),
      y: FRAME / 2 - (FRAME / 2 - o.y) * (s1 / s0),
    }))
    setZoom(nz)
  }

  function save() {
    if (!img) return
    const c = document.createElement('canvas')
    c.width = OUT; c.height = OUT
    const ctx = c.getContext('2d')
    const k = OUT / FRAME
    ctx.drawImage(img.el, off.x * k, off.y * k, dw * k, dh * k)
    onSave(c.toDataURL('image/jpeg', 0.88))
  }

  return (
    <div className="ae-scrim" onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
         onTouchMove={onMove} onTouchEnd={onUp}>
      <div className="ae-modal" onClick={e => e.stopPropagation()}>
        <h3 className="ae-title">Adjust your picture</h3>

        <div className="ae-frame" style={{ width: FRAME, height: FRAME }}
             onMouseDown={onDown} onTouchStart={onDown}>
          {img && (
            <img className="ae-img" src={src} alt="" draggable={false}
                 style={{ width: dw, height: dh, left: off.x, top: off.y }} />
          )}
        </div>

        <div className="ae-zoom">
          <span>－</span>
          <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={onZoom} />
          <span>＋</span>
        </div>
        <p className="ae-hint">Drag to reposition · slide to zoom</p>

        <div className="ae-actions">
          <button className="ae-btn ae-cancel" onClick={onCancel}>Cancel</button>
          <button className="ae-btn ae-save" onClick={save}>Save picture</button>
        </div>
      </div>
    </div>
  )
}
