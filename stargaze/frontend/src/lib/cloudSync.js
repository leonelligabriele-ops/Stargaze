import { supabase } from './supabase.js'
import { exportState, importState, COLLECTIONS_EVENT } from './saved.js'

/**
 * Mirrors the whole localStorage profile (watchlist, watched, collections,
 * follows, blocked, notifications, profile) to a single per-user JSONB row in
 * Supabase (table `user_state`). On login it pulls the cloud copy (or seeds it
 * from local guest data on a brand-new account); afterwards every local change
 * is pushed up, debounced. Last write wins across devices — fine for this app.
 */
const TABLE = 'user_state'

let _userId = null
let _pushTimer = null
let _detach = null

async function _pull(userId) {
  const { data, error } = await supabase
    .from(TABLE).select('data').eq('user_id', userId).maybeSingle()
  if (error) { console.warn('[sync] pull failed:', error.message); return undefined }
  return data?.data
}

async function _push(userId, state) {
  const { error } = await supabase.from(TABLE).upsert({
    user_id: userId, data: state, updated_at: new Date().toISOString(),
  })
  if (error) console.warn('[sync] push failed:', error.message)
}

function _schedulePush() {
  if (!_userId) return
  clearTimeout(_pushTimer)
  _pushTimer = setTimeout(() => _push(_userId, exportState()), 800)
}

/** Begin syncing for a signed-in user. */
export async function startSync(userId) {
  if (!supabase || _userId === userId) return
  _userId = userId

  const remote = await _pull(userId)
  if (remote && Object.keys(remote).length) {
    importState(remote)                       // existing account → adopt cloud copy
  } else {
    await _push(userId, exportState())        // new account → seed from local data
  }

  if (!_detach) {
    const handler = () => _schedulePush()
    window.addEventListener(COLLECTIONS_EVENT, handler)
    _detach = () => window.removeEventListener(COLLECTIONS_EVENT, handler)
  }
}

/** Stop syncing (sign-out); flush any pending change first. */
export async function stopSync() {
  if (_userId) {
    clearTimeout(_pushTimer)
    await _push(_userId, exportState())
  }
  _userId = null
  if (_detach) { _detach(); _detach = null }
}
