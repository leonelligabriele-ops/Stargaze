/**
 * Client-side collections, persisted in localStorage. No user/auth backend yet.
 *
 *  - watchlist (key `stargaze:saved`): films to watch. The "Save" buttons on the
 *    preview card and film page toggle this set.
 *  - watched   (key `stargaze:watched`): films watched, each with a 1–10 rating.
 *  - profile   (key `stargaze:profile`): display name + bio.
 *
 * Each film entry keeps a small snapshot (incl. genres) so the profile can
 * render constellations, stats and favourite genres without re-fetching.
 */
const WATCHLIST_KEY = 'stargaze:saved'
const WATCHED_KEY = 'stargaze:watched'
const PROFILE_KEY = 'stargaze:profile'
const BLOCKED_KEY = 'stargaze:blocked'   // films never to recommend again

const CHANGED_EVENT = 'stargaze:saved-changed'

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {}
  } catch {
    return {}
  }
}

function write(key, map) {
  localStorage.setItem(key, JSON.stringify(map))
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

export const COLLECTIONS_EVENT = CHANGED_EVENT

function snapshot(movie) {
  return {
    id: String(movie.id),
    title: movie.title,
    year: movie.year ?? null,
    director: movie.director ?? null,
    poster_url: movie.poster_url ?? null,
    rating: movie.rating ?? movie.vote_average ?? null,  // TMDB score
    genres: movie.genres ?? [],
  }
}

/* ───────────────────────── Watchlist ───────────────────────── */
export function isSaved(id) {
  return Boolean(read(WATCHLIST_KEY)[String(id)])
}

export function toggleSaved(movie) {
  const map = read(WATCHLIST_KEY)
  const id = String(movie.id)
  if (map[id]) delete map[id]
  else map[id] = snapshot(movie)
  write(WATCHLIST_KEY, map)
  return Boolean(map[id])
}

export function getWatchlist() {
  return Object.values(read(WATCHLIST_KEY))
}

export function removeFromWatchlist(id) {
  const map = read(WATCHLIST_KEY)
  delete map[String(id)]
  write(WATCHLIST_KEY, map)
}

/* ───────────────────────── Watched (rated) ───────────────────────── */
export function isWatched(id) {
  return Boolean(read(WATCHED_KEY)[String(id)])
}

export function getWatched() {
  return Object.values(read(WATCHED_KEY))
}

export function getUserRating(id) {
  return read(WATCHED_KEY)[String(id)]?.user_rating ?? null
}

/** Current 1–5 rating + comment for a film (defaults when not yet reviewed). */
export function getReview(id) {
  const e = read(WATCHED_KEY)[String(id)]
  return { rating: e?.user_rating ?? null, comment: e?.comment ?? '' }
}

/** Add a film to the watched set (optionally with a rating). Idempotent. */
export function addWatched(movie, userRating = null) {
  const map = read(WATCHED_KEY)
  const id = String(movie.id)
  map[id] = {
    ...snapshot(movie),
    user_rating: userRating ?? map[id]?.user_rating ?? null,
    watched_at: map[id]?.watched_at || new Date().toISOString(),
  }
  write(WATCHED_KEY, map)
}

/** Set/clear the 1–5 rating for a watched film (adds it if missing). */
export function setUserRating(movie, userRating) {
  const map = read(WATCHED_KEY)
  const id = String(movie.id)
  const base = map[id] || snapshot(movie)
  map[id] = { ...base, user_rating: userRating, watched_at: base.watched_at || new Date().toISOString() }
  write(WATCHED_KEY, map)
}

/** Grade (1–5) and/or comment a film — upserts it into the watched set. */
export function setReview(movie, rating, comment) {
  const map = read(WATCHED_KEY)
  const id = String(movie.id)
  const base = map[id] || snapshot(movie)
  map[id] = {
    ...base,
    user_rating: rating !== undefined ? rating : (base.user_rating ?? null),
    comment: comment !== undefined ? comment : (base.comment ?? ''),
    watched_at: base.watched_at || new Date().toISOString(),
  }
  write(WATCHED_KEY, map)
  // Grading something implies it's watched, so drop it from the watchlist.
  removeFromWatchlist(id)
}

/** Totals for the profile header: lifetime watched + watched this calendar year. */
export function getWatchedStats() {
  const all = getWatched()
  const year = new Date().getFullYear()
  const thisYear = all.filter(
    f => f.watched_at && new Date(f.watched_at).getFullYear() === year,
  ).length
  return { total: all.length, thisYear }
}

export function removeWatched(id) {
  const map = read(WATCHED_KEY)
  delete map[String(id)]
  write(WATCHED_KEY, map)
}

/** Move a film from the watchlist into the watched set. */
export function markWatched(movie, userRating = null) {
  addWatched(movie, userRating)
  removeFromWatchlist(movie.id)
}

/* ───────────────────────── Blocked (never recommend) ───────────────────────── */
export function isBlocked(id) {
  return Boolean(read(BLOCKED_KEY)[String(id)])
}

export function toggleBlocked(movie) {
  const map = read(BLOCKED_KEY)
  const id = String(movie.id)
  if (map[id]) delete map[id]
  else map[id] = snapshot(movie)
  write(BLOCKED_KEY, map)
  return Boolean(map[id])
}

/** Comma-separated blocked ids for passing to the search endpoints. */
export function getBlockedIds() {
  return Object.keys(read(BLOCKED_KEY))
}

export function getBlockedList() {
  return Object.values(read(BLOCKED_KEY))
}

export function removeBlocked(id) {
  const map = read(BLOCKED_KEY)
  delete map[String(id)]
  write(BLOCKED_KEY, map)
}

/* ───────────────────────── Profile ───────────────────────── */
const DEFAULT_PROFILE = {
  display_name: 'Gabriele',
  bio: 'Charting films through the cosmos.',
  avatar: null,        // data-URL of an uploaded picture
  following: 0,        // placeholder — no social backend
  followers: 0,        // placeholder — no social backend
}

export function getProfile() {
  return { ...DEFAULT_PROFILE, ...read(PROFILE_KEY) }
}

export function setProfile(patch) {
  write(PROFILE_KEY, { ...getProfile(), ...patch })
}

/* ───────────────── Custom constellations (user-created lists) ───────────────── */
const COLLECTIONS_KEY = 'stargaze:collections'

export function getCollections() {
  return Object.values(read(COLLECTIONS_KEY))
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
}

export function getCollection(id) {
  return read(COLLECTIONS_KEY)[String(id)] || null
}

export function createCollection(name, sharedWith = []) {
  const map = read(COLLECTIONS_KEY)
  const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const friends = (Array.isArray(sharedWith) ? sharedWith : [sharedWith])
    .map(s => (s || '').trim()).filter(Boolean)
  map[id] = {
    id,
    name: (name || '').trim() || 'New constellation',
    shared_with: friends,
    created_at: new Date().toISOString(),
    films: {},
  }
  write(COLLECTIONS_KEY, map)
  pushNotification(
    friends.length
      ? `You started "${map[id].name}" with ${friends.join(', ')}`
      : `New constellation "${map[id].name}" created`,
  )
  return id
}

export function removeCollection(id) {
  const map = read(COLLECTIONS_KEY)
  delete map[String(id)]
  write(COLLECTIONS_KEY, map)
}

export function renameCollection(id, name) {
  const map = read(COLLECTIONS_KEY)
  if (map[String(id)]) {
    map[String(id)].name = (name || '').trim() || map[String(id)].name
    write(COLLECTIONS_KEY, map)
  }
}

export function isInCollection(id, movieId) {
  return Boolean(read(COLLECTIONS_KEY)[String(id)]?.films?.[String(movieId)])
}

export function toggleInCollection(id, movie) {
  const map = read(COLLECTIONS_KEY)
  const col = map[String(id)]
  if (!col) return false
  const mid = String(movie.id)
  if (col.films[mid]) delete col.films[mid]
  else col.films[mid] = snapshot(movie)
  write(COLLECTIONS_KEY, map)
  return Boolean(col.films[mid])
}

export function removeFromCollection(id, movieId) {
  const map = read(COLLECTIONS_KEY)
  const col = map[String(id)]
  if (col?.films?.[String(movieId)]) {
    delete col.films[String(movieId)]
    write(COLLECTIONS_KEY, map)
  }
}

export function getCollectionFilms(id) {
  return Object.values(read(COLLECTIONS_KEY)[String(id)]?.films || {})
}

/* ───────────────── Following (demo — local only) ───────────────── */
const FOLLOWING_KEY = 'stargaze:following'

export function isFollowing(id) {
  return Boolean(read(FOLLOWING_KEY)[String(id)])
}

export function toggleFollow(user) {
  const map = read(FOLLOWING_KEY)
  const id = String(user.id)
  if (map[id]) delete map[id]
  else map[id] = { id, name: user.name }
  write(FOLLOWING_KEY, map)
  pushNotification(map[id] ? `You followed ${user.name}` : `You unfollowed ${user.name}`)
  return Boolean(map[id])
}

export function getFollowingCount() {
  return Object.keys(read(FOLLOWING_KEY)).length
}

export function getFollowing() {
  return Object.values(read(FOLLOWING_KEY))
}

/* ───────────────────────── Notifications ───────────────────────── */
const NOTIFS_KEY = 'stargaze:notifications'

function readArr(key) {
  try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] }
}
function writeArr(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr))
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

export function getNotifications() {
  return readArr(NOTIFS_KEY)
}

export function unreadCount() {
  return readArr(NOTIFS_KEY).filter(n => !n.read).length
}

export function pushNotification(text) {
  const arr = readArr(NOTIFS_KEY)
  arr.unshift({
    id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    text, time: new Date().toISOString(), read: false,
  })
  writeArr(NOTIFS_KEY, arr.slice(0, 50))
}

export function markNotificationsRead() {
  writeArr(NOTIFS_KEY, readArr(NOTIFS_KEY).map(n => ({ ...n, read: true })))
}

export function clearNotifications() {
  writeArr(NOTIFS_KEY, [])
}

/** Seed a one-time welcome notification (called once on app start). */
export function seedNotificationsOnce() {
  if (localStorage.getItem('stargaze:notif-seeded')) return
  localStorage.setItem('stargaze:notif-seeded', '1')
  pushNotification('Welcome to Stargaze ✦ — save films and build your constellations.')
}
