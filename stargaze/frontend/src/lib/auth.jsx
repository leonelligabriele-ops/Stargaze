import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, authEnabled } from './supabase.js'
import { startSync, stopSync } from './cloudSync.js'
import { clearAllState } from './saved.js'

const AuthCtx = createContext({ user: null, loading: false, enabled: false })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(authEnabled)
  const syncedId = useRef(null)

  useEffect(() => {
    if (!authEnabled) { setLoading(false); return }

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      setLoading(false)
      if (u && syncedId.current !== u.id) { syncedId.current = u.id; startSync(u.id) }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u && syncedId.current !== u.id) { syncedId.current = u.id; startSync(u.id) }
      if (event === 'SIGNED_OUT') syncedId.current = null
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value = {
    user,
    loading,
    enabled: authEnabled,
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: async () => {
      await stopSync()                 // flush final state to the cloud
      await supabase.auth.signOut()
      clearAllState()                  // don't leak data to the next person on this device
    },
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
