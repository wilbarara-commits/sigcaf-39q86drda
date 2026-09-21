import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { toast } from 'sonner'

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { changePassword, user } = useAuth()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const resetForm = () => {
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setErrorMessage(null)
    setShowOldPassword(false)
    setShowNewPassword(false)
    setShowConfirmPassword(false)
  }

  const handleClose = (newOpen: boolean) => {
    if (!isSubmitting) {
      if (!newOpen) resetForm()
      onOpenChange(newOpen)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    // Validações locais
    if (!oldPassword.trim()) {
      setErrorMessage('Informe sua senha atual.')
      return
    }
    if (!newPassword.trim()) {
      setErrorMessage('Informe a nova senha.')
      return
    }
    if (newPassword.length < 8) {
      setErrorMessage('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('A confirmação da senha não coincide com a nova senha.')
      return
    }
    if (oldPassword === newPassword) {
      setErrorMessage('A nova senha deve ser diferente da senha atual.')
      return
    }

    setIsSubmitting(true)

    try {
      await changePassword(oldPassword, newPassword)
      toast.success('Senha alterada com sucesso!')
      resetForm()
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao alterar senha:', err)
      const msg =
        err?.response?.data?.oldPassword?.message ||
        err?.data?.data?.oldPassword?.message ||
        err?.message ||
        ''

      if (
        msg.toLowerCase().includes('old') ||
        msg.toLowerCase().includes('antiga') ||
        msg.toLowerCase().includes('atual') ||
        err?.status === 400
      ) {
        setErrorMessage(
          'A senha atual informada está incorreta ou os dados não atendem aos critérios de segurança.',
        )
      } else {
        setErrorMessage('Não foi possível alterar a senha. Verifique os dados e tente novamente.')
      }
      toast.error('Falha ao alterar senha.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <KeyRound className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Segurança da Conta
            </span>
          </div>
          <DialogTitle className="text-xl font-bold">Alterar Senha</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Altere a senha de acesso da conta de <strong>{user?.email}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {errorMessage && (
            <div className="p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-md">
              {errorMessage}
            </div>
          )}

          {/* Senha Atual */}
          <div className="space-y-1.5">
            <Label htmlFor="old-password" className="text-xs font-medium">
              Senha Atual <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="old-password"
                type={showOldPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Digite sua senha atual"
                disabled={isSubmitting}
                className="pr-10 text-sm"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowOldPassword((prev) => !prev)}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Nova Senha */}
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-xs font-medium">
              Nova Senha <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="No mínimo 8 caracteres"
                disabled={isSubmitting}
                className="pr-10 text-sm"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">Mínimo de 8 caracteres.</p>
          </div>

          {/* Confirmar Nova Senha */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-xs font-medium">
              Confirmar Nova Senha <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                disabled={isSubmitting}
                className="pr-10 text-sm"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Atualizando...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Salvar Nova Senha
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
