import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, authEnabled } from './supabase.js'
import { startSync, stopSync, pushPublicFilms } from './cloudSync.js'
import { clearAllState, seedDisplayNameFromEmail, getProfile } from './saved.js'
import { ensureProfile } from './profiles.js'

// Pull cloud data, name a brand-new account from its email, ensure a public
// profile row exists, then publish the watched films for others to see.
async function onSignedIn(user) {
  await startSync(user.id)
  seedDisplayNameFromEmail(user.email)
  await ensureProfile(user, getProfile())
  await pushPublicFilms(user.id)
}

const AuthCtx = createContext({ user: null, loading: false, enabled: false })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(authEnabled)
  const [recovery, setRecovery] = useState(false)   // came in via a reset-password link
  const syncedId = useRef(null)

  useEffect(() => {
    if (!authEnabled) { setLoading(false); return }

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      setLoading(false)
      if (u && syncedId.current !== u.id) { syncedId.current = u.id; onSignedIn(u) }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (u && syncedId.current !== u.id) { syncedId.current = u.id; onSignedIn(u) }
      if (event === 'SIGNED_OUT') syncedId.current = null
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value = {
    user,
    loading,
    enabled: authEnabled,
    recovery,
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    resetPassword: (email) =>
      supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }),
    completeRecovery: async (password) => {
      const res = await supabase.auth.updateUser({ password })
      if (!res.error) setRecovery(false)
      return res
    },
    dismissRecovery: () => setRecovery(false),
    signOut: async () => {
      await stopSync()                 // flush final state to the cloud
      await supabase.auth.signOut()
      clearAllState()                  // don't leak data to the next person on this device
    },
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
