import { useState, useRef, useEffect } from 'react'
import {
  getNotifications, unreadCount, markNotificationsRead,
  clearNotifications, seedNotificationsOnce, COLLECTIONS_EVENT,
} from '../lib/saved.js'
import './NotificationBell.css'

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [, force] = useState(0)
  const ref = useRef(null)

  useEffect(() => { seedNotificationsOnce() }, [])

  useEffect(() => {
    const bump = () => force(n => n + 1)
    window.addEventListener(COLLECTIONS_EVENT, bump)
    return () => window.removeEventListener(COLLECTIONS_EVENT, bump)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const notifs = getNotifications()
  const unread = unreadCount()

  function toggle() {
    setOpen(o => {
      const next = !o
      if (next && unread) markNotificationsRead()
      return next
    })
  }

  return (
    <div className="notif-bell" ref={ref}>
      <button className="bell-btn" onClick={toggle} aria-label="Notifications">
        🔔
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-pop">
          <div className="bell-head">
            <span>Notifications</span>
            {notifs.length > 0 && (
              <button onClick={() => { clearNotifications(); force(n => n + 1) }}>Clear all</button>
            )}
          </div>
          {notifs.length === 0 ? (
            <p className="bell-empty">No notifications yet.</p>
          ) : (
            <ul className="bell-list">
              {notifs.map(n => (
                <li key={n.id} className={n.read ? '' : 'unread'}>
                  <p>{n.text}</p>
                  <span className="bell-time">{timeAgo(n.time)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
