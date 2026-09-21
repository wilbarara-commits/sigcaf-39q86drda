import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { UserRecord, UserPerfil } from '@/lib/types'
import { authService } from '@/services/auth'

interface AuthContextType {
  user: UserRecord | null
  isAuthenticated: boolean
  isMaster: boolean
  isAdmin: boolean
  isSecretaria: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<UserRecord>
  logout: () => void
  refreshUser: () => void
  updateProfile: (data: {
    nome?: string
    celular?: string
    email?: string
    fotoFile?: File | null
  }) => Promise<UserRecord>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<boolean>
  hasAccessToRoute: (pathname: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Rotas exclusivas de MASTER
const MASTER_ONLY_ROUTES = ['/usuarios', '/configuracoes']

// Rotas restritas para Secretária (acessíveis apenas por MASTER e ADMINISTRADOR)
const ADMIN_ALLOWED_ROUTES = ['/produtos', '/contratos', '/escolas', '/requisitos']

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(() => authService.getCurrentUser())
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const refreshUser = () => {
    setUser(authService.getCurrentUser())
  }

  useEffect(() => {
    // Sincronizar estado inicial
    refreshUser()
    setIsLoading(false)

    // Ouvir alterações do pb.authStore (persistência e revalidação)
    const unsubscribe = authService.subscribe((updatedUser) => {
      setUser(updatedUser)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, password: string): Promise<UserRecord> => {
    const loggedUser = await authService.login(email, password)
    setUser(loggedUser)
    return loggedUser
  }

  const logout = () => {
    authService.logout()
    setUser(null)
  }

  const updateProfile = async (data: {
    nome?: string
    celular?: string
    email?: string
    fotoFile?: File | null
  }): Promise<UserRecord> => {
    const updated = await authService.updateProfile(data)
    setUser(updated)
    return updated
  }

  const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
    await authService.changePassword(oldPassword, newPassword)
  }

  const requestPasswordReset = async (email: string): Promise<boolean> => {
    return await authService.requestPasswordReset(email)
  }

  const isAuthenticated = !!user
  const isMaster = user?.perfil === 'MASTER'
  const isAdmin = user?.perfil === 'ADMINISTRADOR' || user?.perfil === 'administrador' || isMaster
  const isSecretaria = user?.perfil === 'SECRETARIA' || user?.perfil === 'secretaria'

  const hasAccessToRoute = (pathname: string): boolean => {
    if (!user) return false

    // Rotas exclusivas MASTER
    const isMasterRoute = MASTER_ONLY_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    )
    if (isMasterRoute) {
      return isMaster
    }

    // Rotas permitidas para MASTER e ADMINISTRADOR (mas bloqueadas para SECRETÁRIA)
    const isAdminRoute = ADMIN_ALLOWED_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    )
    if (isAdminRoute) {
      return isMaster || isAdmin
    }

    return true
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isMaster,
        isAdmin,
        isSecretaria,
        isLoading,
        login,
        logout,
        refreshUser,
        updateProfile,
        changePassword,
        requestPasswordReset,
        hasAccessToRoute,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
