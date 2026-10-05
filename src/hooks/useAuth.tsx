/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { authService } from '../services/auth/authService'
import type { AppUser } from '../types'

type SignInInput = {
  email: string
  password: string
}

type SignUpInput = SignInInput & {
  fullName?: string
}

type AuthContextValue = {
  user: AppUser | null
  isLoading: boolean
  signIn: (input: SignInInput) => Promise<void>
  signUp: (input: SignUpInput) => Promise<AppUser | null>
  resetPassword: (email: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const syncSession = useCallback(async () => {
    try {
      const { user: nextUser } = await authService.getCurrentSession()
      setUser(nextUser)
    } catch (error) {
      console.warn('Unable to read auth session', error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void syncSession()
  }, [syncSession])

  const signIn = useCallback(async ({ email, password }: SignInInput) => {
    const { user: nextUser } = await authService.signIn(email, password)
    setUser(nextUser)
  }, [])

  const signUp = useCallback(async ({ email, password, fullName }: SignUpInput) => {
    const { user: nextUser } = await authService.signUp(email, password, fullName)
    setUser(nextUser)
    return nextUser
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    await authService.resetPassword(email)
  }, [])

  const logout = useCallback(async () => {
    await authService.signOut()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      signIn,
      signUp,
      resetPassword,
      logout,
    }),
    [isLoading, logout, resetPassword, signIn, signUp, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }

  return context
}
