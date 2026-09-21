import React, { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ProtectedRouteProps {
  children: React.ReactElement
  requiredRole?: 'MASTER' | 'ADMINISTRADOR'
  requiredPerfil?: 'administrador' | 'MASTER' | 'ADMINISTRADOR'
}

export default function ProtectedRoute({
  children,
  requiredRole,
  requiredPerfil,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading, isMaster, isAdmin, hasAccessToRoute } = useAuth()
  const location = useLocation()

  const roleToCheck = requiredRole || (requiredPerfil as any)

  const isAllowedRole = () => {
    if (!roleToCheck) return true
    if (roleToCheck === 'MASTER') return isMaster
    if (roleToCheck === 'ADMINISTRADOR' || roleToCheck === 'administrador') {
      return isMaster || isAdmin
    }
    return false
  }

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isAllowedRole()) {
      toast.error('Acesso não permitido. Seu perfil não possui permissão para acessar esta área.')
    }
  }, [isLoading, isAuthenticated, roleToCheck, user])

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Verificando sessão...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Redireciona para /login guardando a rota de origem
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Verifica se o perfil tem permissão para a rota atual ou se a rota exige perfil específico
  if (!isAllowedRole()) {
    return <Navigate to="/" replace />
  }

  if (!hasAccessToRoute(location.pathname)) {
    return <Navigate to="/" replace />
  }

  return children
}
