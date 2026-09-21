import React, { useState, useEffect, useRef } from 'react'
import {
  Users,
  UserPlus,
  Search,
  Shield,
  ShieldCheck,
  UserCheck,
  Crown,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Phone,
  Mail,
  Camera,
  RefreshCw,
} from 'lucide-react'
import { usersService } from '@/services/users'
import type { UserRecord, UserPerfil } from '@/lib/types'
import { useAuth } from '@/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPerfil, setFilterPerfil] = useState<string>('all')

  // Modais de Criação e Edição
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)

  // Formulário de Usuário
  const [formNome, setFormNome] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formCelular, setFormCelular] = useState('')
  const [formPerfil, setFormPerfil] = useState<'MASTER' | 'ADMINISTRADOR' | 'SECRETARIA'>(
    'SECRETARIA',
  )
  const [formAtivo, setFormAtivo] = useState(true)
  const [formPassword, setFormPassword] = useState('')
  const [formFotoFile, setFormFotoFile] = useState<File | null>(null)
  const [formFotoPreview, setFormFotoPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Confirmação de exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const list = await usersService.getAll()
      setUsers(list)
    } catch (err: any) {
      console.error('Erro ao carregar usuários:', err)
      toast.error('Erro ao carregar lista de usuários.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleOpenCreateModal = () => {
    setIsEditing(false)
    setSelectedUser(null)
    setFormNome('')
    setFormEmail('')
    setFormCelular('')
    setFormPerfil('SECRETARIA')
    setFormAtivo(true)
    setFormPassword('')
    setFormFotoFile(null)
    setFormFotoPreview(null)
    setUserModalOpen(true)
  }

  const handleOpenEditModal = (u: UserRecord) => {
    setIsEditing(true)
    setSelectedUser(u)
    setFormNome(u.nome || u.name || '')
    setFormEmail(u.email || '')
    setFormCelular(u.celular || '')
    const p = String(u.perfil).toUpperCase()
    setFormPerfil(
      p === 'MASTER' ? 'MASTER' : p === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : 'SECRETARIA',
    )
    setFormAtivo(u.ativo !== false)
    setFormPassword('')
    setFormFotoFile(null)
    setFormFotoPreview(u.avatar || null)
    setUserModalOpen(true)
  }

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem válida.')
      return
    }

    setFormFotoFile(file)
    const reader = new FileReader()
    reader.onload = () => {
      setFormFotoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formNome.trim() || !formEmail.trim()) {
      toast.error('Nome e E-mail são obrigatórios.')
      return
    }

    setIsSubmitting(true)

    try {
      if (isEditing && selectedUser) {
        await usersService.update(selectedUser.id, {
          nome: formNome.trim(),
          email: formEmail.trim(),
          celular: formCelular.trim(),
          perfil: formPerfil,
          ativo: formAtivo,
          password: formPassword || undefined,
          fotoFile: formFotoFile,
        })
        toast.success(`Usuário ${formNome} atualizado com sucesso!`)
      } else {
        if (!formPassword) {
          toast.error('Informe uma senha inicial para o novo usuário.')
          setIsSubmitting(false)
          return
        }
        if (formPassword.length < 8) {
          toast.error('A senha deve ter no mínimo 8 caracteres.')
          setIsSubmitting(false)
          return
        }

        await usersService.create({
          nome: formNome.trim(),
          email: formEmail.trim(),
          celular: formCelular.trim(),
          perfil: formPerfil,
          ativo: formAtivo,
          password: formPassword,
          fotoFile: formFotoFile,
        })
        toast.success(`Usuário ${formNome} criado com sucesso!`)
      }

      setUserModalOpen(false)
      await loadUsers()
    } catch (err: any) {
      console.error('Erro ao salvar usuário:', err)
      const msg = err?.data?.message || err?.message || 'Falha ao processar operação.'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Toggle rápido de ativação/desativação
  const handleToggleAtivo = async (u: UserRecord) => {
    if (u.id === currentUser?.id) {
      toast.error('Você não pode desativar seu próprio usuário master logado.')
      return
    }

    const novoStatus = !(u.ativo !== false)
    try {
      await usersService.update(u.id, { ativo: novoStatus })
      toast.success(
        `Usuário ${u.nome || u.name} ${novoStatus ? 'reativado' : 'desativado'} com sucesso!`,
      )
      setUsers((prev) =>
        prev.map((item) => (item.id === u.id ? { ...item, ativo: novoStatus } : item)),
      )
    } catch (err: any) {
      console.error('Erro ao alternar status:', err)
      toast.error('Não foi possível alterar o status do usuário.')
    }
  }

  const handleDeleteUser = async () => {
    if (!userToDelete) return
    if (userToDelete.id === currentUser?.id) {
      toast.error('Você não pode excluir sua própria conta master.')
      setDeleteDialogOpen(false)
      return
    }

    setIsDeleting(true)
    try {
      await usersService.delete(userToDelete.id)
      toast.success('Usuário removido do sistema.')
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id))
      setDeleteDialogOpen(false)
      setUserToDelete(null)
    } catch (err: any) {
      console.error('Erro ao excluir usuário:', err)
      toast.error('Não foi possível excluir o usuário.')
    } finally {
      setIsDeleting(false)
    }
  }

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      (u.nome || u.name || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.celular || '').toLowerCase().includes(term)

    const p = String(u.perfil).toUpperCase()
    const matchesPerfil =
      filterPerfil === 'all' ||
      (filterPerfil === 'MASTER' && p === 'MASTER') ||
      (filterPerfil === 'ADMINISTRADOR' && (p === 'ADMINISTRADOR' || p === 'ADMINISTRADOR')) ||
      (filterPerfil === 'SECRETARIA' && (p === 'SECRETARIA' || p === 'SECRETARIA'))

    return matchesSearch && matchesPerfil
  })

  const renderPerfilBadge = (p: UserPerfil) => {
    const raw = String(p).toUpperCase()
    if (raw === 'MASTER') {
      return (
        <Badge className="bg-amber-600 hover:bg-amber-700 text-white gap-1 text-[11px] font-normal">
          <Crown className="h-3 w-3" />
          MASTER
        </Badge>
      )
    }
    if (raw === 'ADMINISTRADOR') {
      return (
        <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1 text-[11px] font-normal">
          <ShieldCheck className="h-3 w-3" />
          ADMINISTRADOR
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
        <UserCheck className="h-3 w-3" />
        SECRETÁRIA
      </Badge>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Topo / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <span>Gestão de Usuários</span>
            <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400 border border-amber-600/20 text-xs ml-2">
              Exclusivo MASTER
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre, edite perfis de acesso (MASTER, ADMINISTRADOR, SECRETÁRIA) e controle o status
            das contas de operadores da cooperativa.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button onClick={handleOpenCreateModal} size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </div>
      </div>

      {/* Filtros e Busca */}
      <Card className="shadow-sm border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, e-mail ou celular..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="w-full sm:w-56">
              <Select value={filterPerfil} onValueChange={setFilterPerfil}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os perfis</SelectItem>
                  <SelectItem value="MASTER">Apenas MASTER</SelectItem>
                  <SelectItem value="ADMINISTRADOR">Apenas ADMINISTRADOR</SelectItem>
                  <SelectItem value="SECRETARIA">Apenas SECRETÁRIA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Usuários */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Usuários Cadastrados</CardTitle>
              <CardDescription>
                Total de {filteredUsers.length} conta(s) encontrada(s)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Foto</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Celular</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-sm">Carregando usuários...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Nenhum usuário encontrado para os critérios de busca.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => {
                    const displayName = u.nome || u.name || 'Sem nome'
                    const initials =
                      displayName
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n) => n[0].toUpperCase())
                        .join('') || 'U'
                    const isSelf = u.id === currentUser?.id
                    const isAtivo = u.ativo !== false

                    return (
                      <TableRow key={u.id} className={!isAtivo ? 'opacity-60 bg-muted/20' : ''}>
                        {/* Foto */}
                        <TableCell>
                          <Avatar className="h-10 w-10 border border-border">
                            {u.avatar && <AvatarImage src={u.avatar} alt={displayName} />}
                            <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>

                        {/* Nome */}
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <span>{displayName}</span>
                            {isSelf && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                                Você
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* E-mail */}
                        <TableCell className="text-muted-foreground text-sm">
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground/70" />
                            {u.email}
                          </span>
                        </TableCell>

                        {/* Celular */}
                        <TableCell className="text-muted-foreground text-sm">
                          {u.celular ? (
                            <span className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground/70" />
                              {u.celular}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">—</span>
                          )}
                        </TableCell>

                        {/* Perfil */}
                        <TableCell>{renderPerfilBadge(u.perfil)}</TableCell>

                        {/* Status / Toggle Ativo */}
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch
                              checked={isAtivo}
                              onCheckedChange={() => handleToggleAtivo(u)}
                              disabled={isSelf}
                              title={
                                isSelf ? 'Você não pode desativar seu próprio usuário' : undefined
                              }
                            />
                            <span
                              className={`text-xs font-medium ${
                                isAtivo
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {isAtivo ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                        </TableCell>

                        {/* Ações */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => handleOpenEditModal(u)}
                              title="Editar Usuário"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setUserToDelete(u)
                                setDeleteDialogOpen(true)
                              }}
                              disabled={isSelf}
                              title={
                                isSelf
                                  ? 'Não é possível excluir o próprio usuário'
                                  : 'Excluir Usuário'
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Criar/Editar Usuário */}
      <Dialog open={userModalOpen} onOpenChange={setUserModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span>{isEditing ? 'Editar Usuário' : 'Novo Usuário do Sistema'}</span>
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Atualize os dados cadastrais, perfil de permissão e status da conta.'
                : 'Cadastre um novo operador para a cooperativa e defina seu nível de acesso.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitUser} className="space-y-4 py-2">
            {/* Foto e Preview */}
            <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
              <Avatar className="h-16 w-16 border-2 border-primary/20">
                {formFotoPreview && <AvatarImage src={formFotoPreview} alt="Foto selecionada" />}
                <AvatarFallback className="text-base font-semibold bg-primary/10 text-primary">
                  {formNome ? formNome[0].toUpperCase() : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">Foto de Identificação</Label>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs h-8"
                  >
                    <Camera className="h-3.5 w-3.5 mr-1.5" />
                    {formFotoFile ? 'Substituir Foto' : 'Selecionar Foto'}
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFotoChange}
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">Formatos JPG, PNG ou WebP</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="formNome">Nome Completo</Label>
              <Input
                id="formNome"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="Ex: Carlos Eduardo de Oliveira"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="formEmail">E-mail</Label>
                <Input
                  id="formEmail"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="usuario@coop.local"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="formCelular">Celular / WhatsApp</Label>
                <Input
                  id="formCelular"
                  value={formCelular}
                  onChange={(e) => setFormCelular(e.target.value)}
                  placeholder="(21) 98888-7777"
                />
              </div>
            </div>

            {/* Perfil de Acesso */}
            <div className="space-y-2">
              <Label htmlFor="formPerfil">Perfil de Acesso</Label>
              <Select value={formPerfil} onValueChange={(val: any) => setFormPerfil(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MASTER">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-600" />
                      <div>
                        <span className="font-medium">MASTER</span>
                        <span className="text-xs text-muted-foreground block">
                          Acesso total, gestão de usuários e configurações da cooperativa
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="ADMINISTRADOR">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <div>
                        <span className="font-medium">ADMINISTRADOR</span>
                        <span className="text-xs text-muted-foreground block">
                          Gestão de produtos, escolas, contratos e relatórios operacionais
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="SECRETARIA">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-blue-600" />
                      <div>
                        <span className="font-medium">SECRETÁRIA</span>
                        <span className="text-xs text-muted-foreground block">
                          Operacional diário (pedidos, rotas, consolidação, importação, atestos)
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Senha */}
            <div className="space-y-2">
              <Label htmlFor="formPassword">
                {isEditing ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha Inicial'}
              </Label>
              <Input
                id="formPassword"
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={isEditing ? '••••••••' : 'Mínimo de 8 caracteres'}
                required={!isEditing}
              />
            </div>

            {/* Status Ativo */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
              <div>
                <Label className="font-medium">Conta Ativa</Label>
                <p className="text-xs text-muted-foreground">
                  Usuários inativos não conseguem autenticar no sistema.
                </p>
              </div>
              <Switch
                checked={formAtivo}
                onCheckedChange={setFormAtivo}
                disabled={isEditing && selectedUser?.id === currentUser?.id}
              />
            </div>

            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUserModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : isEditing ? (
                  'Salvar Alterações'
                ) : (
                  'Criar Usuário'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o usuário{' '}
              <strong>{userToDelete?.nome || userToDelete?.name || userToDelete?.email}</strong>?
              Esta ação revogará todo o acesso dessa conta ao sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
