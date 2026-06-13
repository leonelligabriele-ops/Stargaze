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

/** Add a film to the watched set (optionally with a rating). Idempotent. */
export function addWatched(movie, userRating = null) {
  const map = read(WATCHED_KEY)
  const id = String(movie.id)
  map[id] = { ...snapshot(movie), user_rating: userRating ?? map[id]?.user_rating ?? null }
  write(WATCHED_KEY, map)
}

/** Set/clear the 1–10 rating for a watched film (adds it if missing). */
export function setUserRating(movie, userRating) {
  const map = read(WATCHED_KEY)
  const id = String(movie.id)
  const base = map[id] || snapshot(movie)
  map[id] = { ...base, user_rating: userRating }
  write(WATCHED_KEY, map)
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

/* ───────────────────────── Profile ───────────────────────── */
const DEFAULT_PROFILE = {
  display_name: 'Gabriele',
  bio: 'Charting films through the cosmos.',
}

export function getProfile() {
  return { ...DEFAULT_PROFILE, ...read(PROFILE_KEY) }
}

export function setProfile(patch) {
  write(PROFILE_KEY, { ...getProfile(), ...patch })
}
