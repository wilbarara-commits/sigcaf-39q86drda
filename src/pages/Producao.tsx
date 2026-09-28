import { useState, useMemo } from 'react'
import { useApp } from '@/context/app-context'
import { useAuth } from '@/context/auth-context'
import type { ChamadaRecord, ChamadaStatus, ChamadaModalidade } from '@/lib/types'
import { chamadasService } from '@/services/chamadas'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Layers, Plus, Pencil, Trash2, Loader2, Search, Calendar, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

// Rótulos do módulo: configurados em constantes para facilitar evolução futura
export const MODULO_CHAMADA_SINGULAR = 'Chamada'
export const MODULO_CHAMADAS_LABEL = 'Chamadas'
export const MODULO_CHAMADAS_SUBTITULO =
  'Gestão centralizada de chamadas públicas e programas de fornecimento.'

// Compatibilidade transitória com referências legadas
export const MODULO_PRODUCAO_LABEL = MODULO_CHAMADAS_LABEL
export const MODULO_PRODUCAO_SUBTITULO = MODULO_CHAMADAS_SUBTITULO

export default function Producao() {
  const { chamadas, isLoading, refreshData } = useApp()
  const { isAdmin } = useAuth()

  // Estados de busca / filtro
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | ChamadaStatus>('todos')
  const [modalidadeFilter, setModalidadeFilter] = useState<'todos' | ChamadaModalidade>('todos')

  // Modais
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingChamada, setEditingChamada] = useState<ChamadaRecord | null>(null)
  const [chamadaToDelete, setChamadaToDelete] = useState<ChamadaRecord | null>(null)

  // Formulário de Chamada
  const [formChamada, setFormChamada] = useState('')
  const [formPrograma, setFormPrograma] = useState('PNAE')
  const [formModalidade, setFormModalidade] = useState<ChamadaModalidade>('individualizado')
  const [formStatus, setFormStatus] = useState<ChamadaStatus>('Ativo')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleOpenCreate = () => {
    setEditingChamada(null)
    setFormChamada('')
    setFormPrograma('PNAE')
    setFormModalidade('individualizado')
    setFormStatus('Ativo')
    setDialogOpen(true)
  }

  const handleOpenEdit = (item: ChamadaRecord) => {
    setEditingChamada(item)
    setFormChamada(item.chamada || '')
    setFormPrograma(item.programa || 'PNAE')
    setFormModalidade(item.modalidade || 'individualizado')
    setFormStatus(item.status || 'Ativo')
    setDialogOpen(true)
  }

  const handleOpenDelete = (item: ChamadaRecord) => {
    setChamadaToDelete(item)
    setDeleteDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedChamada = formChamada.trim()
    if (!trimmedChamada) {
      toast.error(`O campo ${MODULO_CHAMADA_SINGULAR} é obrigatório.`)
      return
    }

    setIsSubmitting(true)
    try {
      if (editingChamada) {
        await chamadasService.update(editingChamada.id, {
          chamada: trimmedChamada,
          programa: formPrograma.trim(),
          modalidade: formModalidade,
          status: formStatus,
        })
        toast.success(`${MODULO_CHAMADA_SINGULAR} "${trimmedChamada}" atualizada com sucesso!`)
      } else {
        await chamadasService.create({
          chamada: trimmedChamada,
          programa: formPrograma.trim(),
          modalidade: formModalidade,
          status: formStatus,
        })
        toast.success(`${MODULO_CHAMADA_SINGULAR} "${trimmedChamada}" criada com sucesso!`)
      }
      setDialogOpen(false)
      await refreshData()
    } catch (err: any) {
      console.error('Erro ao salvar chamada:', err)
      const msg =
        err?.data?.message ||
        err?.message ||
        `Falha ao salvar ${MODULO_CHAMADA_SINGULAR.toLowerCase()}.`
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!chamadaToDelete) return
    setIsDeleting(true)
    try {
      await chamadasService.delete(chamadaToDelete.id)
      toast.success(`${MODULO_CHAMADA_SINGULAR} "${chamadaToDelete.chamada}" excluída com sucesso!`)
      setDeleteDialogOpen(false)
      setChamadaToDelete(null)
      await refreshData()
    } catch (err: any) {
      console.error('Erro ao excluir chamada:', err)
      toast.error(`Falha ao excluir ${MODULO_CHAMADA_SINGULAR.toLowerCase()}.`)
    } finally {
      setIsDeleting(false)
    }
  }

  const filteredChamadas = useMemo(() => {
    return chamadas.filter((item) => {
      if (statusFilter !== 'todos' && item.status !== statusFilter) {
        return false
      }
      if (modalidadeFilter !== 'todos' && item.modalidade !== modalidadeFilter) {
        return false
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const matchChamada = (item.chamada || '').toLowerCase().includes(query)
        const matchProg = (item.programa || '').toLowerCase().includes(query)
        const matchMod = (item.modalidade || '').toLowerCase().includes(query)
        const matchStatus = (item.status || '').toLowerCase().includes(query)
        return matchChamada || matchProg || matchMod || matchStatus
      }
      return true
    })
  }, [chamadas, searchQuery, statusFilter, modalidadeFilter])

  const formatDate = (isoString?: string) => {
    if (!isoString) return '-'
    try {
      const d = new Date(isoString)
      if (isNaN(d.getTime())) return isoString
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch {
      return isoString
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{MODULO_CHAMADAS_LABEL}</h1>
          <p className="text-muted-foreground text-sm">
            {MODULO_CHAMADAS_SUBTITULO} Nível hierárquico: Escolas → Operações →{' '}
            {MODULO_CHAMADAS_LABEL}.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Nova {MODULO_CHAMADA_SINGULAR}
          </Button>
        )}
      </div>

      {/* Filtros e Busca */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Buscar ${MODULO_CHAMADA_SINGULAR.toLowerCase()}, programa...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div>
              <Select value={modalidadeFilter} onValueChange={(v) => setModalidadeFilter(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por modalidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as Modalidades</SelectItem>
                  <SelectItem value="individualizado">Individualizado</SelectItem>
                  <SelectItem value="centralizado">Centralizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Status</SelectItem>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Encerrado">Encerrado</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Chamadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> {MODULO_CHAMADAS_LABEL} Cadastradas
          </CardTitle>
          <CardDescription>
            Relação completa de {MODULO_CHAMADAS_LABEL.toLowerCase()} públicas com seus respectivos
            programas, modalidades e status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{MODULO_CHAMADA_SINGULAR}</TableHead>
                  <TableHead>Programa</TableHead>
                  <TableHead>Modalidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando{' '}
                        {MODULO_CHAMADAS_LABEL.toLowerCase()}...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredChamadas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchQuery || statusFilter !== 'todos' || modalidadeFilter !== 'todos'
                        ? `Nenhuma ${MODULO_CHAMADA_SINGULAR.toLowerCase()} encontrada para os filtros selecionados.`
                        : `Nenhuma ${MODULO_CHAMADA_SINGULAR.toLowerCase()} cadastrada ainda.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredChamadas.map((item) => (
                    <TableRow
                      key={item.id}
                      className={isAdmin ? 'cursor-pointer hover:bg-muted/50' : undefined}
                      onClick={() => {
                        if (isAdmin) handleOpenEdit(item)
                      }}
                    >
                      <TableCell className="font-semibold text-primary">
                        <span className="hover:underline font-bold">{item.chamada}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.programa || 'PNAE'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={item.modalidade === 'centralizado' ? 'secondary' : 'default'}
                          className="capitalize text-xs"
                        >
                          {item.modalidade || 'individualizado'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            item.status === 'Ativo'
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : item.status === 'Encerrado'
                                ? 'bg-slate-600 text-slate-100 dark:bg-slate-700 hover:bg-slate-600 border border-slate-500/40'
                                : item.status === 'Cancelado'
                                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                                  : 'bg-muted text-muted-foreground border'
                          }
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{formatDate(item.created)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                title={`Editar ${MODULO_CHAMADA_SINGULAR.toLowerCase()}`}
                                onClick={() => handleOpenEdit(item)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                title={`Excluir ${MODULO_CHAMADA_SINGULAR.toLowerCase()}`}
                                onClick={() => handleOpenDelete(item)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Somente leitura</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Criação / Edição de Chamada */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {editingChamada
                ? `Editar ${MODULO_CHAMADA_SINGULAR} ${editingChamada.chamada}`
                : `Cadastrar Nova ${MODULO_CHAMADA_SINGULAR}`}
            </DialogTitle>
            <DialogDescription>
              {editingChamada
                ? `Atualize os dados e parâmetros da ${MODULO_CHAMADA_SINGULAR.toLowerCase()} pública.`
                : `Preencha os campos para cadastrar uma nova ${MODULO_CHAMADA_SINGULAR.toLowerCase()} no módulo de ${MODULO_CHAMADAS_LABEL.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="ch-nome">
                {MODULO_CHAMADA_SINGULAR} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ch-nome"
                placeholder="Ex: 001/2026 - PNAE Municipal"
                value={formChamada}
                onChange={(e) => setFormChamada(e.target.value)}
                required
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Identificador ou número oficial da chamada pública.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ch-prog">Programa</Label>
              <Input
                id="ch-prog"
                placeholder="Ex: PNAE, PAA, Municipal..."
                value={formPrograma}
                onChange={(e) => setFormPrograma(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ch-mod">Modalidade</Label>
                <Select
                  value={formModalidade}
                  onValueChange={(v) => setFormModalidade(v as ChamadaModalidade)}
                >
                  <SelectTrigger id="ch-mod">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individualizado">Individualizado (por Escola)</SelectItem>
                    <SelectItem value="centralizado">Centralizado (por Planilha)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ch-status">Status</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as ChamadaStatus)}>
                  <SelectTrigger id="ch-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Pendente">Pendente</SelectItem>
                    <SelectItem value="Encerrado">Encerrado</SelectItem>
                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="pt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : editingChamada ? (
                  'Salvar Alterações'
                ) : (
                  `Cadastrar ${MODULO_CHAMADA_SINGULAR}`
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
            <AlertDialogTitle>Excluir {MODULO_CHAMADA_SINGULAR.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a {MODULO_CHAMADA_SINGULAR.toLowerCase()}{' '}
              <strong className="text-foreground">{chamadaToDelete?.chamada}</strong>? Esta ação não
              poderá ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
