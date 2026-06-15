import { supabase } from './supabase.js'

/**
 * Server notifications for cross-user events (e.g. someone followed you).
 * No-ops when Supabase isn't configured.
 */
export async function getServerNotifications(userId) {
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, read, created_at, actor:profiles!notifications_actor_id_fkey(username, display_name)')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) { console.warn('[notif] fetch failed:', error.message); return [] }
  return data || []
}

export async function markServerNotificationsRead(userId) {
  if (!supabase || !userId) return
  await supabase.from('notifications').update({ read: true })
    .eq('recipient_id', userId).eq('read', false)
}

export async function clearServerNotifications(userId) {
  if (!supabase || !userId) return
  await supabase.from('notifications').delete().eq('recipient_id', userId)
}
