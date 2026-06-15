import { useState, useRef, useEffect, useCallback } from 'react'
import {
  getNotifications, unreadCount, markNotificationsRead,
  clearNotifications, seedNotificationsOnce, COLLECTIONS_EVENT,
  getNotifPrefs, setNotifPref, NOTIF_CATEGORIES,
} from '../lib/saved.js'
import { useAuth } from '../lib/auth.jsx'
import {
  getServerNotifications, markServerNotificationsRead, clearServerNotifications,
} from '../lib/notifications.js'
import './NotificationBell.css'

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function serverText(n) {
  const who = n.actor?.display_name || (n.actor?.username ? `@${n.actor.username}` : 'Someone')
  if (n.type === 'follow') return `${who} started following you`
  return 'New activity'
}

export default function NotificationBell() {
  const { enabled, user } = useAuth()
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [server, setServer] = useState([])     // cross-user notifications from the DB
  const [, force] = useState(0)
  const ref = useRef(null)

  useEffect(() => { seedNotificationsOnce() }, [])

  useEffect(() => {
    const bump = () => force(n => n + 1)
    window.addEventListener(COLLECTIONS_EVENT, bump)
    return () => window.removeEventListener(COLLECTIONS_EVENT, bump)
  }, [])

  // Fetch server notifications on sign-in, then poll for new ones.
  const refreshServer = useCallback(() => {
    if (enabled && user) getServerNotifications(user.id).then(setServer)
    else setServer([])
  }, [enabled, user])

  useEffect(() => { refreshServer() }, [refreshServer])
  useEffect(() => {
    if (!enabled || !user) return
    const t = setInterval(refreshServer, 45000)
    return () => clearInterval(t)
  }, [enabled, user, refreshServer])

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const prefs = getNotifPrefs()
  // Server follow-notifications respect the "Follows" toggle too.
  const serverItems = (prefs.follows === false ? [] : server).map(n => ({
    id: `s${n.id}`, text: serverText(n), time: n.created_at, read: n.read,
  }))
  const notifs = [...getNotifications(), ...serverItems]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
  const unread = unreadCount() + serverItems.filter(n => !n.read).length

  function toggle() {
    setOpen(o => {
      const next = !o
      if (next) {
        if (unreadCount()) markNotificationsRead()
        if (enabled && user && serverItems.some(n => !n.read)) {
          markServerNotificationsRead(user.id).then(() =>
            setServer(s => s.map(n => ({ ...n, read: true }))))
        }
      }
      return next
    })
  }

  function clearAll() {
    clearNotifications()
    if (enabled && user) clearServerNotifications(user.id).then(() => setServer([]))
    force(n => n + 1)
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
            <div className="bell-head-actions">
              {notifs.length > 0 && <button onClick={clearAll}>Clear all</button>}
              <button
                className={`bell-gear ${settingsOpen ? 'active' : ''}`}
                onClick={() => setSettingsOpen(s => !s)}
                aria-label="Notification settings" title="Notification settings"
              >⚙</button>
            </div>
          </div>

          {settingsOpen ? (
            <div className="bell-settings">
              <p className="bell-settings-title">Notify me about</p>
              {NOTIF_CATEGORIES.map(c => {
                const on = getNotifPrefs()[c.key] !== false
                return (
                  <label key={c.key} className="bell-pref">
                    <span className="bell-pref-text">
                      <span className="bell-pref-label">{c.label}</span>
                      <span className="bell-pref-hint">{c.hint}</span>
                    </span>
                    <button
                      type="button"
                      className={`bell-switch ${on ? 'on' : ''}`}
                      role="switch" aria-checked={on}
                      onClick={() => { setNotifPref(c.key, !on); force(n => n + 1) }}
                    >
                      <span className="bell-knob" />
                    </button>
                  </label>
                )
              })}
            </div>
          ) : notifs.length === 0 ? (
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
