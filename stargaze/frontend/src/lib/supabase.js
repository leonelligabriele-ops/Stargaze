import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client. Configured via env vars (set in Netlify, and in a local
 * frontend/.env.local for dev):
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<anon public key>
 *
 * When the env vars are absent the client is null and the app runs in
 * guest-only mode (localStorage), so nothing breaks without Supabase set up.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null
export const authEnabled = Boolean(supabase)
