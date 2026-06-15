import { supabase } from './supabase.js'

/**
 * Public profiles + follows (real social graph, Supabase-backed).
 * All functions no-op / return empty when Supabase isn't configured, so the
 * guest build stays functional.
 */

function sanitizeUsername(s) {
  const u = (s || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
  return u || 'user'
}

/** Ensure the signed-in user has a public profile row; create one if missing. */
export async function ensureProfile(user, localProfile) {
  if (!supabase || !user) return
  const { data: existing } = await supabase
    .from('profiles').select('id').eq('id', user.id).maybeSingle()
  if (existing) return

  const base = sanitizeUsername(user.email?.split('@')[0])
  let username = base
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      username,
      display_name: localProfile?.display_name || base,
      bio: localProfile?.bio || null,
      avatar: localProfile?.avatar || null,
    })
    if (!error) return
    if (error.code === '23505') username = base + Math.floor(1000 + Math.random() * 9000) // unique clash
    else { console.warn('[profiles] ensure failed:', error.message); return }
  }
}

export async function getMyProfile(userId) {
  if (!supabase || !userId) return null
  const { data } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle()
  return data
}

export async function getProfileByUsername(username) {
  if (!supabase || !username) return null
  const { data } = await supabase
    .from('profiles').select('*').eq('username', username.toLowerCase()).maybeSingle()
  return data
}

/** Update own profile. Returns { error } (e.g. username taken → code 23505). */
export async function updateMyProfile(userId, patch) {
  if (!supabase || !userId) return { error: { message: 'not signed in' } }
  const clean = { ...patch, updated_at: new Date().toISOString() }
  if (clean.username) clean.username = sanitizeUsername(clean.username)
  const { error } = await supabase.from('profiles').update(clean).eq('id', userId)
  if (error?.code === '23505') return { error: { message: 'That username is taken.' } }
  return { error }
}

/** Find people by @username or display name. */
export async function searchProfiles(query, excludeId) {
  if (!supabase || !query?.trim()) return []
  const q = query.trim()
  let req = supabase
    .from('profiles')
    .select('id, username, display_name, avatar')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(12)
  if (excludeId) req = req.neq('id', excludeId)
  const { data } = await req
  return data || []
}

/** A few suggested people to follow (most recent profiles). */
export async function suggestedProfiles(excludeId) {
  if (!supabase) return []
  let req = supabase
    .from('profiles')
    .select('id, username, display_name, avatar')
    .order('updated_at', { ascending: false })
    .limit(8)
  if (excludeId) req = req.neq('id', excludeId)
  const { data } = await req
  return data || []
}

/* ───────────────────────── Follows ───────────────────────── */
export async function isFollowing(targetId, meId) {
  if (!supabase || !meId || !targetId) return false
  const { data } = await supabase
    .from('follows').select('follower_id')
    .eq('follower_id', meId).eq('followee_id', targetId).maybeSingle()
  return Boolean(data)
}

export async function follow(targetId, meId) {
  if (!supabase || !meId) return { error: { message: 'not signed in' } }
  return supabase.from('follows').insert({ follower_id: meId, followee_id: targetId })
}

export async function unfollow(targetId, meId) {
  if (!supabase || !meId) return { error: { message: 'not signed in' } }
  return supabase.from('follows').delete()
    .eq('follower_id', meId).eq('followee_id', targetId)
}

export async function getFollowCounts(userId) {
  if (!supabase || !userId) return { followers: 0, following: 0 }
  const followers = await supabase.from('follows')
    .select('*', { count: 'exact', head: true }).eq('followee_id', userId)
  const following = await supabase.from('follows')
    .select('*', { count: 'exact', head: true }).eq('follower_id', userId)
  return { followers: followers.count || 0, following: following.count || 0 }
}

/** People who follow `userId` (joined to their profile). */
export async function getFollowers(userId) {
  if (!supabase || !userId) return []
  const { data } = await supabase
    .from('follows')
    .select('profiles!follows_follower_id_fkey(id, username, display_name, avatar)')
    .eq('followee_id', userId)
  return (data || []).map(r => r.profiles).filter(Boolean)
}

/** People `userId` follows (joined to their profile). */
export async function getFollowingProfiles(userId) {
  if (!supabase || !userId) return []
  const { data } = await supabase
    .from('follows')
    .select('profiles!follows_followee_id_fkey(id, username, display_name, avatar)')
    .eq('follower_id', userId)
  return (data || []).map(r => r.profiles).filter(Boolean)
}
