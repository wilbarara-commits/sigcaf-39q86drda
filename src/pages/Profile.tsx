import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/context/auth-context'
import {
  User,
  Mail,
  Phone,
  Shield,
  Camera,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Crown,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

export default function Profile() {
  const { user, updateProfile, changePassword } = useAuth()

  // Form de dados pessoais
  const [nome, setNome] = useState(user?.nome || user?.name || '')
  const [celular, setCelular] = useState(user?.celular || '')
  const [email, setEmail] = useState(user?.email || '')
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Form de troca de senha
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user) {
      setNome(user.nome || user.name || '')
      setCelular(user.celular || '')
      setEmail(user.email || '')
    }
  }, [user])

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione um arquivo de imagem válido (JPEG, PNG, WebP).')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB.')
      return
    }

    setFotoFile(file)
    const reader = new FileReader()
    reader.onload = () => {
      setFotoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      toast.error('O campo nome é obrigatório.')
      return
    }

    setIsSavingProfile(true)
    try {
      await updateProfile({
        nome: nome.trim(),
        celular: celular.trim(),
        email: email.trim(),
        fotoFile,
      })
      toast.success('Perfil atualizado com sucesso!')
      setFotoFile(null)
      setFotoPreview(null)
    } catch (err: any) {
      console.error('Erro ao atualizar perfil:', err)
      const msg = err?.data?.message || err?.message || 'Falha ao salvar alterações do perfil.'
      toast.error(msg)
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)

    if (!currentPassword) {
      setPasswordError('Informe sua senha atual.')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('A nova senha deve possuir pelo menos 8 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação da nova senha não confere.')
      return
    }

    setIsChangingPassword(true)
    try {
      await changePassword(currentPassword, newPassword)
      toast.success('Senha alterada com sucesso!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      console.error('Erro ao alterar senha:', err)
      const msg =
        err?.data?.message ||
        err?.message ||
        'Não foi possível alterar a senha. Verifique a senha atual.'
      setPasswordError(msg)
    } finally {
      setIsChangingPassword(false)
    }
  }

  const displayName = user?.nome || user?.name || user?.email || 'Usuário'
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join('') || 'U'

  const perfil = user?.perfil || 'SECRETARIA'

  const PerfilBadge = () => {
    if (perfil === 'MASTER') {
      return (
        <Badge className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 px-2.5 py-1 text-xs">
          <Crown className="h-3.5 w-3.5" />
          MASTER (Acesso Total)
        </Badge>
      )
    }
    if (perfil === 'ADMINISTRADOR' || perfil === 'administrador') {
      return (
        <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 px-2.5 py-1 text-xs">
          <ShieldCheck className="h-3.5 w-3.5" />
          ADMINISTRADOR
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 text-xs">
        <UserCheck className="h-3.5 w-3.5" />
        SECRETÁRIA (Operacional)
      </Badge>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <User className="h-6 w-6 text-primary" />
          <span>Meu Perfil</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie seus dados pessoais, foto de identificação e segurança de acesso à cooperativa.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card Resumo do Usuário */}
        <Card className="md:col-span-1 shadow-sm border-border">
          <CardHeader className="text-center pb-2">
            <div className="relative mx-auto w-28 h-28 group">
              <Avatar className="w-28 h-28 border-2 border-primary/20 shadow-sm">
                <AvatarImage src={fotoPreview || user?.avatar} alt={displayName} />
                <AvatarFallback className="text-2xl font-semibold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/40 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Trocar foto de perfil"
              >
                <Camera className="h-6 w-6 mb-1" />
                <span className="text-[11px] font-medium">Trocar foto</span>
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFotoChange}
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
            />
            <CardTitle className="text-lg font-semibold mt-3 text-foreground">
              {displayName}
            </CardTitle>
            <CardDescription className="text-xs truncate">{user?.email}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-2">
            <div className="flex justify-center">
              <PerfilBadge />
            </div>

            <Separator />

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Nível de Perfil
                </span>
                <span className="font-medium text-foreground">{perfil}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Celular
                </span>
                <span className="font-medium text-foreground">
                  {user?.celular || 'Não informado'}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Status da Conta
                </span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">Ativa</span>
              </div>
            </div>

            {fotoPreview && (
              <div className="p-2 bg-muted/50 rounded-md text-center text-xs">
                <p className="text-muted-foreground">Nova foto selecionada.</p>
                <p className="text-[11px] text-primary font-medium">
                  Clique em "Salvar Alterações" abaixo.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Formulários de Edição */}
        <div className="md:col-span-2 space-y-6">
          {/* Dados Pessoais */}
          <Card className="shadow-sm border-border">
            <form onSubmit={handleSaveProfile}>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <span>Informações Pessoais</span>
                </CardTitle>
                <CardDescription>
                  Atualize seu nome de exibição, número de telefone celular e e-mail.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome Completo</Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: João Silva da Cooperativa"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu.email@coop.local"
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="celular">Celular / WhatsApp</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="celular"
                        value={celular}
                        onChange={(e) => setCelular(e.target.value)}
                        placeholder="(21) 99999-9999"
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Foto de Perfil</Label>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Selecionar Foto do Dispositivo
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {fotoFile ? fotoFile.name : 'PNG, JPG ou WebP até 5MB'}
                    </span>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex justify-end border-t pt-4 bg-muted/10">
                <Button type="submit" disabled={isSavingProfile}>
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Alterações'
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>

          {/* Trocar Senha */}
          <Card className="shadow-sm border-border">
            <form onSubmit={handleChangePassword}>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <span>Segurança e Senha</span>
                </CardTitle>
                <CardDescription>
                  Altere sua senha de acesso. A nova senha deve ter no mínimo 8 caracteres.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {passwordError && (
                  <Alert variant="destructive" className="py-2.5">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm ml-2">{passwordError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Senha Atual</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nova Senha</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex justify-end border-t pt-4 bg-muted/10">
                <Button type="submit" variant="secondary" disabled={isChangingPassword}>
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Alterando senha...
                    </>
                  ) : (
                    'Atualizar Senha'
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
