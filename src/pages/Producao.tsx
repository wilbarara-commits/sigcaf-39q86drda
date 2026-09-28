import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Calendar,
  Sparkles,
  FileText,
  ExternalLink,
  School,
  DollarSign,
  Truck,
  Route as RouteIcon,
  SlidersHorizontal,
  Package,
} from 'lucide-react'
import { toast } from 'sonner'
import { ChamadaItemsManager, ChamadaItemForm } from '@/components/ChamadaItemsManager'

// Rótulos do módulo: configurados em constantes para facilitar evolução futura
export const MODULO_CHAMADA_SINGULAR = 'Chamada'
export const MODULO_CHAMADAS_LABEL = 'Chamadas'
export const MODULO_CHAMADAS_SUBTITULO =
  'Gestão centralizada de chamadas públicas e programas de fornecimento.'

// Compatibilidade transitória com referências legadas
export const MODULO_PRODUCAO_LABEL = MODULO_CHAMADAS_LABEL
export const MODULO_PRODUCAO_SUBTITULO = MODULO_CHAMADAS_SUBTITULO

export default function Producao() {
  const navigate = useNavigate()
  const {
    chamadas,
    chamadaItems,
    contracts,
    contractItems,
    products,
    rotasLogisticas,
    contractSchools,
    paradasRota,
    isLoading,
    refreshData,
  } = useApp()
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
  const [activeTab, setActiveTab] = useState<'geral' | 'itens' | 'rotas' | 'contratos'>('geral')
  const [formItems, setFormItems] = useState<ChamadaItemForm[]>([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Carrega e agrega itens da chamada combinando com as quantidades dos contratos vinculados
  const buildChamadaItemsForModal = (chamadaId: string) => {
    // 1. Contratos pertencentes a esta chamada
    const contratosDestaChamada = contracts.filter((c) => c.chamada_id === chamadaId)
    const contratosIdsSet = new Set(contratosDestaChamada.map((c) => c.id))

    // 2. contrato_itens desses contratos
    const cItensDestaChamada = contractItems.filter((ci) => contratosIdsSet.has(ci.contrato_id))

    // Mapa de somas de quantidade por chave (produto_id ou nome normalizado)
    const somaQtdMap = new Map<string, number>()
    const hasAnyQtdMap = new Map<string, boolean>()

    for (const ci of cItensDestaChamada) {
      const rawQ = ci.quantidade_contratada
      const q =
        rawQ !== undefined && rawQ !== null && String(rawQ).trim() !== '' ? Number(rawQ) : undefined
      const keys: string[] = []
      if (ci.produto_id) keys.push(ci.produto_id)
      const nomeKey = (ci.nome_contrato || ci.expand?.produto_id?.nome || '').trim().toLowerCase()
      if (nomeKey) keys.push(nomeKey)

      if (q !== undefined && !isNaN(q) && q > 0) {
        for (const k of keys) {
          somaQtdMap.set(k, (somaQtdMap.get(k) || 0) + q)
          hasAnyQtdMap.set(k, true)
        }
      }
    }

    // 3. Itens gravados em chamada_itens
    const gravados = chamadaItems.filter((ci) => ci.chamada_id === chamadaId)

    return gravados.map((gi) => {
      const keyId = gi.produto_id || ''
      const keyNome = (gi.produto || '').trim().toLowerCase()

      const hasQtd = Boolean(
        (keyId && hasAnyQtdMap.get(keyId)) || (keyNome && hasAnyQtdMap.get(keyNome)),
      )
      const soma =
        (keyId ? somaQtdMap.get(keyId) : undefined) ??
        (keyNome ? somaQtdMap.get(keyNome) : undefined) ??
        0

      return {
        id: gi.id,
        productId: gi.produto_id,
        produto: gi.produto,
        aka: gi.aka || '',
        unidade: gi.unidade || 'Kg',
        preco: Number(gi.preco) || 0,
        quantidadeAgregada: hasQtd ? soma : undefined,
      }
    })
  }

  const handleOpenCreate = () => {
    setEditingChamada(null)
    setFormChamada('')
    setFormPrograma('PNAE')
    setFormModalidade('individualizado')
    setFormStatus('Ativo')
    setFormItems([])
    setActiveTab('geral')
    setDialogOpen(true)
  }

  const handleOpenEdit = (item: ChamadaRecord) => {
    setEditingChamada(item)
    setFormChamada(item.chamada || '')
    setFormPrograma(item.programa || 'PNAE')
    setFormModalidade(item.modalidade || 'individualizado')
    setFormStatus(item.status || 'Ativo')
    setFormItems(buildChamadaItemsForModal(item.id))
    setActiveTab('geral')
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
      let savedChamadaId: string
      if (editingChamada) {
        await chamadasService.update(editingChamada.id, {
          chamada: trimmedChamada,
          programa: formPrograma.trim(),
          modalidade: formModalidade,
          status: formStatus,
        })
        savedChamadaId = editingChamada.id
        toast.success(`${MODULO_CHAMADA_SINGULAR} "${trimmedChamada}" atualizada com sucesso!`)
      } else {
        const created = await chamadasService.create({
          chamada: trimmedChamada,
          programa: formPrograma.trim(),
          modalidade: formModalidade,
          status: formStatus,
        })
        savedChamadaId = created.id
        toast.success(`${MODULO_CHAMADA_SINGULAR} "${trimmedChamada}" criada com sucesso!`)
      }

      // Sincronizar itens da chamada (chamada_itens)
      if (formItems && formItems.length >= 0) {
        const validItems = formItems.filter((i) => i.produto && i.produto.trim())
        await chamadasService.syncItems(
          savedChamadaId,
          validItems.map((it) => ({
            id: it.id,
            produto_id: it.productId,
            produto: it.produto.trim(),
            aka: it.aka?.trim() || '',
            unidade: it.unidade?.trim() || 'Kg',
            preco: Number(it.preco) || 0,
          })),
        )
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
            {MODULO_CHAMADAS_SUBTITULO} Nível hierárquico: {MODULO_CHAMADAS_LABEL} → Contratos →
            Escolas.
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
                  <TableHead>Contratos Vinculados</TableHead>
                  <TableHead>Rotas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando{' '}
                        {MODULO_CHAMADAS_LABEL.toLowerCase()}...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredChamadas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {searchQuery || statusFilter !== 'todos' || modalidadeFilter !== 'todos'
                        ? `Nenhuma ${MODULO_CHAMADA_SINGULAR.toLowerCase()} encontrada para os filtros selecionados.`
                        : `Nenhuma ${MODULO_CHAMADA_SINGULAR.toLowerCase()} cadastrada ainda.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredChamadas.map((item) => {
                    const contratosDestaChamada = contracts.filter((c) => c.chamada_id === item.id)
                    const contratosIdsSet = new Set(contratosDestaChamada.map((c) => c.id))
                    const rotasDestaChamada = rotasLogisticas.filter(
                      (r) =>
                        r.chamada_id === item.id ||
                        (r.contrato_id && contratosIdsSet.has(r.contrato_id)),
                    )

                    return (
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
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="secondary"
                              className="font-medium text-xs bg-muted border"
                            >
                              <FileText className="h-3 w-3 mr-1 text-primary" />
                              {contratosDestaChamada.length} contrato(s)
                            </Badge>
                            {contratosDestaChamada.length > 0 && (
                              <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                                ({contratosDestaChamada.map((c) => c.numero).join(', ')})
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="font-medium text-xs border-primary/40 text-primary gap-1"
                            >
                              <Truck className="h-3 w-3" />
                              {rotasDestaChamada.length} rota(s)
                            </Badge>
                          </div>
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
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5"
                              title="Gerenciar Rotas de Entrega desta Chamada"
                              onClick={() => navigate(`/rotas?chamadaId=${item.id}`)}
                            >
                              <RouteIcon className="h-3.5 w-3.5 text-primary" />
                              <span className="hidden sm:inline">Gerenciar Rotas</span>
                            </Button>
                            {isAdmin && (
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
                            )}
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

      {/* Modal de Criação / Edição de Chamada */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {editingChamada
                ? `Editar ${MODULO_CHAMADA_SINGULAR} ${editingChamada.chamada}`
                : `Cadastrar Nova ${MODULO_CHAMADA_SINGULAR}`}
            </DialogTitle>
            <DialogDescription>
              {editingChamada
                ? `Atualize os dados e parâmetros da ${MODULO_CHAMADA_SINGULAR.toLowerCase()} pública e visualize os contratos vinculados.`
                : `Preencha os campos para cadastrar uma nova ${MODULO_CHAMADA_SINGULAR.toLowerCase()} no módulo de ${MODULO_CHAMADAS_LABEL.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>

          {editingChamada ? (
            (() => {
              const contratosDestaChamada = contracts.filter(
                (c) => c.chamada_id === editingChamada.id,
              )
              const contratosIdsSet = new Set(contratosDestaChamada.map((c) => c.id))

              // Escolas agregadas: vínculos vivos em contrato_escolas dos contratos com chamada_id = chamada em edição
              // contractSchools do context são os vínculos de contrato_escolas carregados
              const vinculosEscolasChamada = contractSchools.filter(
                (ce) => contratosIdsSet.has(ce.contrato_id) && !ce.encerrado_em,
              )
              const totalEscolasAgregadas = vinculosEscolasChamada.length

              // Rotas logísticas da chamada
              const rawRoutes = rotasLogisticas.filter(
                (r) =>
                  r.chamada_id === editingChamada.id ||
                  (r.contrato_id && contratosIdsSet.has(r.contrato_id)),
              )
              const seenIds = new Set<string>()
              const seenNames = new Set<string>()
              const chamadaRotas = rawRoutes.filter((r) => {
                if (seenIds.has(r.id)) return false
                seenIds.add(r.id)
                const norm = (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()
                if (seenNames.has(norm)) return false
                seenNames.add(norm)
                return true
              })

              return (
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as any)}
                  className="w-full"
                >
                  <TabsList className="grid grid-cols-4 w-full">
                    <TabsTrigger value="geral">Dados Gerais</TabsTrigger>
                    <TabsTrigger value="itens">Itens & Preços ({formItems.length})</TabsTrigger>
                    <TabsTrigger value="rotas">Rotas ({chamadaRotas.length})</TabsTrigger>
                    <TabsTrigger value="contratos">
                      Contratos ({contratosDestaChamada.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="geral" className="space-y-4 pt-2">
                    <form onSubmit={handleSubmit} className="space-y-4">
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
                        <Select value={formPrograma} onValueChange={setFormPrograma}>
                          <SelectTrigger id="ch-prog">
                            <SelectValue placeholder="Selecione o programa" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PNAE">PNAE (Alimentação Escolar)</SelectItem>
                            <SelectItem value="PAA">PAA (Aquisição de Alimentos)</SelectItem>
                            <SelectItem value="Municipal">Municipal / Direto</SelectItem>
                            <SelectItem value="Outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
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
                              <SelectItem value="individualizado">
                                Individualizado (Pedido por Escola via WhatsApp/Manual)
                              </SelectItem>
                              <SelectItem value="centralizado">
                                Centralizado (Consolidado por Importação de Planilha)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="ch-status">Status</Label>
                          <Select
                            value={formStatus}
                            onValueChange={(v) => setFormStatus(v as ChamadaStatus)}
                          >
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

                      {/* Contador de Escolas Agregadas (somente leitura) */}
                      <div className="p-3 rounded-lg border bg-muted/40 space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <Label
                              htmlFor="ch-escolas-agregadas"
                              className="font-semibold text-xs text-foreground flex items-center gap-1.5"
                            >
                              <School className="h-3.5 w-3.5 text-primary" />
                              Escolas Vinculadas (total)
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              Soma das escolas de todos os contratos vinculados a esta chamada. O
                              vínculo e edição de escolas é feito nos contratos.
                            </p>
                          </div>
                          <div className="w-24">
                            <Input
                              id="ch-escolas-agregadas"
                              readOnly
                              tabIndex={-1}
                              aria-readonly="true"
                              className="h-8 font-bold text-center bg-background cursor-default select-all"
                              value={totalEscolasAgregadas}
                            />
                          </div>
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
                          ) : (
                            'Salvar Alterações'
                          )}
                        </Button>
                      </DialogFooter>
                    </form>
                  </TabsContent>

                  {/* Aba Itens & Preços da Chamada */}
                  <TabsContent value="itens" className="space-y-4 pt-2">
                    <ChamadaItemsManager
                      chamadaId={editingChamada.id}
                      chamadaNumero={editingChamada.chamada}
                      items={formItems}
                      onChange={setFormItems}
                      catalogProducts={products}
                    />

                    <DialogFooter className="pt-4 gap-2 border-t">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogOpen(false)}
                        disabled={isSubmitting}
                      >
                        Fechar
                      </Button>
                      <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                          </>
                        ) : (
                          'Salvar Chamada & Itens'
                        )}
                      </Button>
                    </DialogFooter>
                  </TabsContent>

                  {/* Aba Rotas Logísticas da Chamada */}
                  <TabsContent value="rotas" className="space-y-4 pt-2">
                    <div className="space-y-3 p-4 rounded-lg border bg-card">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <Label className="text-sm font-bold flex items-center gap-2 text-primary">
                            <RouteIcon className="h-4 w-4" /> Rotas Logísticas da Chamada
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            As rotas logísticas, seus nomes, atribuição de escolas e sequenciamento
                            de paradas são configurados diretamente na tela de{' '}
                            <strong>Roteamento & Despacho</strong>, agrupando escolas de todos os
                            contratos da chamada.
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs text-primary border-primary/40 hover:bg-primary/10 shrink-0"
                          onClick={() => {
                            setDialogOpen(false)
                            navigate(`/rotas?chamadaId=${editingChamada.id}`)
                          }}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Configurar no Roteamento & Despacho
                        </Button>
                      </div>

                      {chamadaRotas.length === 0 ? (
                        <div className="py-8 text-center border rounded-lg bg-muted/20 text-xs text-muted-foreground space-y-2">
                          <p className="font-medium text-foreground">
                            Nenhuma rota logística configurada para esta chamada ainda.
                          </p>
                          <p>
                            Você pode salvar esta chamada agora sem rotas e configurá-las
                            diretamente na tela de <strong>Roteamento & Despacho</strong>.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            className="text-xs gap-1 mt-2 bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold shadow-sm"
                            onClick={() => {
                              setDialogOpen(false)
                              navigate(`/rotas?chamadaId=${editingChamada.id}`)
                            }}
                          >
                            <Truck className="h-3.5 w-3.5 text-amber-950" /> Ir para Roteamento &
                            Despacho
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-2 max-h-[240px] overflow-y-auto">
                            {chamadaRotas.map((r, idx) => {
                              const paradasCount = paradasRota.filter(
                                (p) => (p.rota_id || (p as any).rota_logistica_id) === r.id,
                              ).length
                              return (
                                <div
                                  key={r.id}
                                  className="flex items-center justify-between p-2.5 rounded border bg-muted/20 text-xs"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <Badge variant="outline" className="font-mono text-[10px]">
                                      {idx + 1}ª
                                    </Badge>
                                    <span className="font-semibold text-foreground">{r.nome}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-[10px]">
                                      {paradasCount} parada(s)
                                    </Badge>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          <div className="flex justify-end pt-2">
                            <Button
                              type="button"
                              size="sm"
                              className="text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold shadow-sm"
                              onClick={() => {
                                setDialogOpen(false)
                                navigate(`/rotas?chamadaId=${editingChamada.id}`)
                              }}
                            >
                              <Truck className="h-3.5 w-3.5 text-amber-950" /> Ir para Roteamento &
                              Despacho
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <DialogFooter className="pt-2">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Fechar
                      </Button>
                    </DialogFooter>
                  </TabsContent>

                  {/* Aba Contratos Vinculados (padrão Escolas Participantes de Contratos) */}
                  <TabsContent value="contratos" className="space-y-4 pt-2">
                    {/* Card de Sumário no Topo da aba Contratos */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            Total de Contratos vinculados
                          </p>
                          <p className="text-xl font-bold text-foreground">
                            {contratosDestaChamada.length}
                          </p>
                        </div>
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <FileText className="h-5 w-5" />
                        </div>
                      </div>
                      <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            Total de Escolas Vinculadas à Chamada
                          </p>
                          <p className="text-xl font-bold text-foreground">
                            {totalEscolasAgregadas}
                          </p>
                        </div>
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <School className="h-5 w-5" />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold flex items-center gap-1.5">
                            <FileText className="h-4 w-4 text-primary" /> Contratos Desta Chamada
                            Pública
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Hierarquia: {MODULO_CHAMADAS_LABEL} → Contratos → Escolas. Relação de
                            contratos vinculados a esta chamada pública (1 chamada : N contratos).
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => {
                            setDialogOpen(false)
                            navigate('/contratos')
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" /> Novo Contrato
                        </Button>
                      </div>

                      {(() => {
                        const contratosDesta = contracts.filter(
                          (c) => c.chamada_id === editingChamada.id,
                        )
                        if (contratosDesta.length === 0) {
                          return (
                            <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-md bg-background">
                              Nenhum contrato vinculado a esta chamada pública ainda.
                              <div className="mt-2">
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  className="text-xs text-primary"
                                  onClick={() => {
                                    setDialogOpen(false)
                                    navigate('/contratos')
                                  }}
                                >
                                  Ir para Contratos vincular
                                </Button>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div className="space-y-2">
                            {contratosDesta.map((c) => (
                              <div
                                key={c.id}
                                className="flex items-center justify-between p-2.5 rounded-md border bg-background hover:bg-muted/40 transition-colors"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-foreground">
                                      {c.numero}
                                    </span>
                                    <Badge variant="outline" className="text-[10px]">
                                      {c.tipo || 'PNAE'}
                                    </Badge>
                                    <Badge
                                      className={
                                        c.status === 'Ativo'
                                          ? 'bg-emerald-600 text-white text-[10px]'
                                          : 'bg-muted text-muted-foreground text-[10px] border'
                                      }
                                    >
                                      {c.status}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <DollarSign className="h-3 w-3" />
                                      R${' '}
                                      {c.totalValue.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                      })}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <School className="h-3 w-3" />
                                      {c.escolas.length} escola(s) vinculada(s)
                                    </span>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-xs text-primary hover:bg-primary/10"
                                  onClick={() => {
                                    setDialogOpen(false)
                                    navigate('/contratos')
                                  }}
                                  title="Abrir contrato"
                                >
                                  Abrir <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </div>

                    <DialogFooter className="pt-2">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Fechar
                      </Button>
                    </DialogFooter>
                  </TabsContent>
                </Tabs>
              )
            })()
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as any)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="geral">Dados Gerais</TabsTrigger>
                <TabsTrigger value="itens">Itens & Preços ({formItems.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="geral" className="space-y-4 pt-2">
                <form onSubmit={handleSubmit} className="space-y-4">
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
                    <Select value={formPrograma} onValueChange={setFormPrograma}>
                      <SelectTrigger id="ch-prog">
                        <SelectValue placeholder="Selecione o programa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PNAE">PNAE (Alimentação Escolar)</SelectItem>
                        <SelectItem value="PAA">PAA (Aquisição de Alimentos)</SelectItem>
                        <SelectItem value="Municipal">Municipal / Direto</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
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
                          <SelectItem value="individualizado">
                            Individualizado (Pedido por Escola via WhatsApp/Manual)
                          </SelectItem>
                          <SelectItem value="centralizado">
                            Centralizado (Consolidado por Importação de Planilha)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ch-status">Status</Label>
                      <Select
                        value={formStatus}
                        onValueChange={(v) => setFormStatus(v as ChamadaStatus)}
                      >
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
                      ) : (
                        `Cadastrar ${MODULO_CHAMADA_SINGULAR}`
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </TabsContent>

              <TabsContent value="itens" className="space-y-4 pt-2">
                <ChamadaItemsManager
                  items={formItems}
                  onChange={setFormItems}
                  catalogProducts={products}
                />

                <DialogFooter className="pt-4 gap-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                      </>
                    ) : (
                      `Cadastrar ${MODULO_CHAMADA_SINGULAR} & Itens`
                    )}
                  </Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          )}
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
