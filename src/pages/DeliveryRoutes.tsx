import { useState, useMemo } from 'react'
import { useApp } from '@/context/app-context'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Label } from '@/components/ui/label'
import {
  Truck,
  Layers,
  CheckCircle2,
  Play,
  Loader2,
  Package,
  UserCheck,
  Building2,
  GripVertical,
  SlidersHorizontal,
  XCircle,
  AlertTriangle,
  ArrowUpDown,
  FileCheck2,
  Plus,
  Trash2,
  Pencil,
  Route as RouteIcon,
  Sparkles,
  ClipboardPaste,
  HelpCircle,
  Check,
  Upload,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { matchPastedSchoolLine } from '@/lib/excelImporter'
import { RouteSchoolBatchImportModal } from '@/components/RouteSchoolBatchImportModal'
import {
  MOTIVOS_LOGISTICOS_CANCELAMENTO,
  type MotivoLogisticoCancelamento,
  type Order,
  type RotaLogisticaRecord,
} from '@/lib/types'

export default function DeliveryRoutes() {
  const {
    contracts,
    orders,
    schools,
    rotasLogisticas,
    paradasRota,
    despachos,
    criarRotaLogistica,
    atualizarRotaLogistica,
    excluirRotaLogistica,
    sincronizarEscolasRotaLogistica,
    despacharRotaInteira,
    confirmarEntregaRotaInteira,
    marcarNaoEntreguePedido,
    atribuirPedidosARotaLogistica,
    salvarSequenciamentoParadas,
    updateOrderStatus,
    refreshData,
  } = useApp()
  const { user } = useAuth()

  // Selecionar contrato ativo para roteamento e despacho
  const [selectedContratoId, setSelectedContratoId] = useState<string>(contracts[0]?.id || 'todos')

  // Estado para criação rápida de rota logística
  const [createRouteDialogOpen, setCreateRouteDialogOpen] = useState(false)
  const [newRouteName, setNewRouteName] = useState('')
  const [isCreatingRoute, setIsCreatingRoute] = useState(false)

  // Estado para edição / renomeação de rota logística
  const [editRouteDialogOpen, setEditRouteDialogOpen] = useState(false)
  const [routeToEdit, setRouteToEdit] = useState<RotaLogisticaRecord | null>(null)
  const [editRouteName, setEditRouteName] = useState('')
  const [isEditingRoute, setIsEditingRoute] = useState(false)

  // Estado para exclusão de rota logística
  const [routeToDelete, setRouteToDelete] = useState<RotaLogisticaRecord | null>(null)
  const [isDeletingRoute, setIsDeletingRoute] = useState(false)

  // Estado para montagem/atribuição de roteamento (exclusivamente sobre ESCOLAS)
  const [routingDialogOpen, setRoutingDialogOpen] = useState(false)
  const [selectedRotaForRouting, setSelectedRotaForRouting] = useState<RotaLogisticaRecord | null>(
    null,
  )
  const [selectedSchoolsToAssign, setSelectedSchoolsToAssign] = useState<string[]>([])
  const [isSavingAssignment, setIsSavingAssignment] = useState(false)
  // Estado para colagem em lote de escolas
  const [pastedSchoolsText, setPastedSchoolsText] = useState('')
  const [unmatchedPastedLines, setUnmatchedPastedLines] = useState<string[]>([])
  const [pastedMatchFeedback, setPastedMatchFeedback] = useState<string | null>(null)
  const [batchImportFileModalOpen, setBatchImportFileModalOpen] = useState(false)

  // Estado para confirmação de despacho da rota inteira
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false)
  const [rotaToDispatch, setRotaToDispatch] = useState<RotaLogisticaRecord | null>(null)
  const [isDispatching, setIsDispatching] = useState(false)

  // Estado para confirmação de rota entregue (rota inteira)
  const [deliverWholeRouteOpen, setDeliverWholeRouteOpen] = useState(false)
  const [rotaToDeliver, setRotaToDeliver] = useState<RotaLogisticaRecord | null>(null)
  const [isDeliveringWholeRoute, setIsDeliveringWholeRoute] = useState(false)

  // Estado para cancelamento por "Não entregue" após despacho (motivo logístico fixo)
  const [undeliveredDialogOpen, setUndeliveredDialogOpen] = useState(false)
  const [orderForUndelivered, setOrderForUndelivered] = useState<Order | null>(null)
  const [selectedMotivoLogistico, setSelectedMotivoLogistico] =
    useState<MotivoLogisticoCancelamento>(MOTIVOS_LOGISTICOS_CANCELAMENTO[0])
  const [detalheMotivoLogistico, setDetalheMotivoLogistico] = useState('')
  const [isProcessingUndelivered, setIsProcessingUndelivered] = useState(false)

  // Estado de Drag and Drop para reordenamento de paradas
  const [draggedEscolaId, setDraggedEscolaId] = useState<string | null>(null)
  const [dragOverEscolaId, setDragOverEscolaId] = useState<string | null>(null)

  // Contrato atualmente focado
  const currentContrato = useMemo(() => {
    if (selectedContratoId === 'todos') return null
    return contracts.find((c) => c.id === selectedContratoId) || null
  }, [contracts, selectedContratoId])

  // Rotas logísticas filtradas pelo contrato selecionado com deduplicação defensiva por ID e por Nome
  const filteredRotasLogisticas = useMemo(() => {
    let list = rotasLogisticas
    if (selectedContratoId !== 'todos') {
      list = list.filter((r) => r.contrato_id === selectedContratoId)
    }

    // Deduplicação defensiva por ID e por Nome normalizado no mesmo contrato
    const seenIds = new Set<string>()
    const seenNames = new Set<string>()
    const dedupedList: RotaLogisticaRecord[] = []

    for (const r of list) {
      if (seenIds.has(r.id)) continue
      seenIds.add(r.id)

      const normName = (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()
      // Se for temporário e já existir rota salva com o mesmo nome, ou duplicata de nome:
      const keyName = `${r.contrato_id}:${normName}`
      if (seenNames.has(keyName)) {
        continue
      }
      seenNames.add(keyName)
      dedupedList.push(r)
    }

    // Regra 3: O despacho e o sequenciamento só operam sobre rotas dentro do limite definido no contrato
    if (currentContrato?.num_rotas_logisticas) {
      return dedupedList.slice(0, currentContrato.num_rotas_logisticas)
    }
    return dedupedList
  }, [rotasLogisticas, selectedContratoId, currentContrato])

  // Pedidos que pertencem ao contrato selecionado (via escolas do contrato)
  const contratoOrders = useMemo(() => {
    if (!currentContrato) return orders
    const schoolIds = new Set(currentContrato.escolas.map((e) => e.escolaId))
    return orders.filter((o) => schoolIds.has(o.schoolId))
  }, [orders, currentContrato])

  // Detalhes completos por rota logística
  const rotasLogisticasDetalhes = useMemo(() => {
    return filteredRotasLogisticas.map((rota) => {
      const contrato = contracts.find((c) => c.id === rota.contrato_id)

      // Paradas cadastradas no banco (collection paradas_rota) - estrutura da rota baseada em escolas
      const paradasCadastradas = paradasRota
        .filter((p) => p.rota_logistica_id === rota.id)
        .sort((a, b) => a.ordem - b.ordem)

      const escolaIdsDaRota = new Set(paradasCadastradas.map((p) => p.escola_id))

      // Pedidos desta rota logística: herdados da escola (paradas_rota) OU com rotaLogisticaId definido
      const pedidosDaRota = orders.filter(
        (o) => escolaIdsDaRota.has(o.schoolId) || o.rotaLogisticaId === rota.id,
      )

      const pedidosPendentes = pedidosDaRota.filter((o) => o.status === 'Pendente')
      const pedidosEmRota = pedidosDaRota.filter((o) => o.status === 'Em Rota')
      const pedidosEntregues = pedidosDaRota.filter((o) => o.status === 'Entregue')
      const pedidosCancelados = pedidosDaRota.filter((o) => o.status === 'Cancelado')

      // Montar lista ordenada de paradas (baseada estritamente nas escolas cadastradas em paradas_rota)
      const paradasOrdenadas: Array<{
        escolaId: string
        nome: string
        endereco: string
        alunos?: number
        ordem: number
        pedidos: Order[]
      }> = []

      paradasCadastradas.forEach((p, idx) => {
        const sch = schools.find((s) => s.id === p.escola_id)
        const peds = pedidosDaRota.filter((o) => o.schoolId === p.escola_id)
        paradasOrdenadas.push({
          escolaId: p.escola_id,
          nome: sch?.name || 'Escola',
          endereco: sch?.address || '',
          alunos: sch?.alunos,
          ordem: idx + 1,
          pedidos: peds,
        })
      })

      // Último despacho realizado desta rota
      const ultimoDespacho = despachos
        .filter((d) => d.rota_logistica_id === rota.id)
        .sort(
          (a, b) => new Date(b.data_despacho).getTime() - new Date(a.data_despacho).getTime(),
        )[0]

      const volumeTotal = pedidosDaRota.reduce(
        (acc, p) => acc + p.items.reduce((sum, it) => sum + it.quantity, 0),
        0,
      )
      const valorTotal = pedidosDaRota.reduce((acc, p) => acc + p.total, 0)

      return {
        rota,
        contratoNumero: contrato?.numero || 'Sem contrato',
        modalidade: contrato?.modalidade_pedido || 'individualizado',
        pedidosDaRota,
        pedidosPendentes,
        pedidosEmRota,
        pedidosEntregues,
        pedidosCancelados,
        paradasOrdenadas,
        ultimoDespacho,
        volumeTotal,
        valorTotal,
      }
    })
  }, [filteredRotasLogisticas, contracts, orders, schools, paradasRota, despachos])

  // Escolas vinculadas ao contrato selecionado que AINDA NÃO têm rota logística atribuída
  const escolasSemRota = useMemo(() => {
    if (!currentContrato) return []
    // IDs de todas as escolas em paradas_rota de qualquer rota logística
    const escolasComRotaSet = new Set(paradasRota.map((p) => p.escola_id))
    return currentContrato.escolas.filter((e) => !escolasComRotaSet.has(e.escolaId))
  }, [currentContrato, paradasRota])

  // Pedidos de escolas sem rota logística atribuída (ficam Pendente sem rota e não bloqueiam as demais)
  const pedidosSemRota = useMemo(() => {
    const escolasSemRotaIds = new Set(escolasSemRota.map((e) => e.escolaId))
    return contratoOrders.filter(
      (o) => o.status === 'Pendente' && (!o.rotaLogisticaId || escolasSemRotaIds.has(o.schoolId)),
    )
  }, [escolasSemRota, contratoOrders])

  // Despacho: Abrir modal de confirmação para colocar rota inteira em rota
  const handleOpenDispatch = (rota: RotaLogisticaRecord) => {
    setRotaToDispatch(rota)
    setDispatchConfirmOpen(true)
  }

  // Despacho: Executar colocação da rota inteira em rota
  const handleConfirmDispatch = async () => {
    if (!rotaToDispatch) return
    setIsDispatching(true)
    try {
      await despacharRotaInteira(rotaToDispatch.id, rotaToDispatch.contrato_id, user?.id)
      setDispatchConfirmOpen(false)
      setRotaToDispatch(null)
    } finally {
      setIsDispatching(false)
    }
  }

  // Entrega: Abrir modal para confirmar que a rota inteira foi entregue
  const handleOpenDeliverWholeRoute = (rota: RotaLogisticaRecord) => {
    setRotaToDeliver(rota)
    setDeliverWholeRouteOpen(true)
  }

  // Entrega: Executar confirmação de rota entregue
  const handleConfirmDeliverWholeRoute = async () => {
    if (!rotaToDeliver) return
    setIsDeliveringWholeRoute(true)
    try {
      await confirmarEntregaRotaInteira(rotaToDeliver.id, user?.id)
      setDeliverWholeRouteOpen(false)
      setRotaToDeliver(null)
    } finally {
      setIsDeliveringWholeRoute(false)
    }
  }

  // Cancelamento: Abrir modal de "Não entregue" após despacho (pedido Em Rota)
  const handleOpenUndelivered = (order: Order) => {
    setOrderForUndelivered(order)
    setSelectedMotivoLogistico(MOTIVOS_LOGISTICOS_CANCELAMENTO[0])
    setDetalheMotivoLogistico('')
    setUndeliveredDialogOpen(true)
  }

  // Cancelamento: Executar marcação de não entregue definitiva
  const handleExecuteUndelivered = async () => {
    if (!orderForUndelivered) return
    setIsProcessingUndelivered(true)
    try {
      const motivoCompleto = detalheMotivoLogistico.trim()
        ? `${selectedMotivoLogistico}: ${detalheMotivoLogistico.trim()}`
        : selectedMotivoLogistico

      await marcarNaoEntreguePedido(orderForUndelivered.id, motivoCompleto, user?.id)
      setUndeliveredDialogOpen(false)
      setOrderForUndelivered(null)
    } finally {
      setIsProcessingUndelivered(false)
    }
  }

  // Criar nova rota logística
  const handleOpenCreateRoute = () => {
    setNewRouteName('')
    setCreateRouteDialogOpen(true)
  }

  const handleConfirmCreateRoute = async () => {
    const trimmed = newRouteName.trim()
    if (!trimmed) {
      toast.error('Informe um nome para a rota logística.')
      return
    }

    if (!currentContrato) {
      toast.error('Selecione um contrato específico para criar uma rota.')
      return
    }

    // Validação local no frontend: checar duplicata case-insensitive e trim no mesmo contrato
    const cleanNome = trimmed.replace(/\s+/g, ' ')
    const normalizedTarget = cleanNome.toLowerCase()
    const existeDuplicata = rotasLogisticas.some(
      (r) =>
        r.contrato_id === currentContrato.id &&
        (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTarget,
    )
    if (existeDuplicata) {
      toast.error('Já existe uma rota logística com este nome neste contrato.')
      return
    }

    // Verificar se já atingiu o limite se num_rotas_logisticas estiver definido
    if (
      currentContrato.num_rotas_logisticas &&
      filteredRotasLogisticas.length >= currentContrato.num_rotas_logisticas
    ) {
      toast.error(
        `Este contrato permite no máximo ${currentContrato.num_rotas_logisticas} rotas logísticas.`,
      )
      return
    }

    setIsCreatingRoute(true)
    try {
      const created = await criarRotaLogistica({
        contrato_id: currentContrato.id,
        nome: trimmed,
        ordem: filteredRotasLogisticas.length + 1,
        ativa: true,
      })
      if (created) {
        setCreateRouteDialogOpen(false)
        setNewRouteName('')
      }
    } finally {
      setIsCreatingRoute(false)
    }
  }

  // Abrir modal de edição/renomeação de rota logística
  const handleOpenEditRoute = (rota: RotaLogisticaRecord) => {
    setRouteToEdit(rota)
    setEditRouteName(rota.nome)
    setEditRouteDialogOpen(true)
  }

  // Confirmar edição/renomeação de rota logística
  const handleConfirmEditRoute = async () => {
    if (!routeToEdit) return
    const trimmed = editRouteName.trim()
    if (!trimmed) {
      toast.error('Informe um nome para a rota logística.')
      return
    }

    // Validação local no frontend: bloquear nome duplicado no mesmo contrato (exceto ela própria)
    const normalizedTarget = trimmed.replace(/\s+/g, ' ').toLowerCase()
    const existeDuplicata = rotasLogisticas.some(
      (r) =>
        r.id !== routeToEdit.id &&
        r.contrato_id === routeToEdit.contrato_id &&
        (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTarget,
    )
    if (existeDuplicata) {
      toast.error('Já existe uma rota logística com este nome neste contrato.')
      return
    }

    setIsEditingRoute(true)
    try {
      const updated = await atualizarRotaLogistica(routeToEdit.id, {
        nome: trimmed,
      })
      if (updated) {
        setEditRouteDialogOpen(false)
        setRouteToEdit(null)
        setEditRouteName('')
      }
    } finally {
      setIsEditingRoute(false)
    }
  }

  // Excluir rota logística
  const handleConfirmDeleteRoute = async () => {
    if (!routeToDelete) return
    setIsDeletingRoute(true)
    try {
      await excluirRotaLogistica(routeToDelete.id)
      setRouteToDelete(null)
    } finally {
      setIsDeletingRoute(false)
    }
  }

  // Roteamento por contrato: Abrir modal de montagem de roteamento (exclusivamente sobre escolas)
  const handleOpenRouting = (rota: RotaLogisticaRecord) => {
    setSelectedRotaForRouting(rota)

    // Pré-selecionar escolas já vinculadas a esta rota (pela collection paradas_rota)
    const paradasDaRota = paradasRota
      .filter((p) => p.rota_logistica_id === rota.id)
      .map((p) => p.escola_id)
    setSelectedSchoolsToAssign(paradasDaRota)
    setPastedSchoolsText('')
    setUnmatchedPastedLines([])
    setPastedMatchFeedback(null)

    setRoutingDialogOpen(true)
  }

  // Processar colagem de lista de escolas com endereço
  const handleApplyPastedSchools = () => {
    if (!currentContrato) {
      toast.error('Nenhum contrato selecionado.')
      return
    }

    const lines = pastedSchoolsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      toast.error('Cole ao menos uma linha com o nome da escola.')
      return
    }

    const matchedIds: string[] = []
    const unmatched: string[] = []

    for (const line of lines) {
      const match = matchPastedSchoolLine(line, currentContrato.escolas, schools)
      if (match.matchedLink) {
        matchedIds.push(match.matchedLink.escolaId)
      } else {
        unmatched.push(line)
      }
    }

    // Unir com as já marcadas (comportamento aditivo sem duplicatas)
    const currentSet = new Set(selectedSchoolsToAssign)
    let newlyAddedCount = 0
    matchedIds.forEach((id) => {
      if (!currentSet.has(id)) {
        currentSet.add(id)
        newlyAddedCount++
      }
    })

    setSelectedSchoolsToAssign(Array.from(currentSet))
    setUnmatchedPastedLines(unmatched)

    const uniqueMatchedCount = new Set(matchedIds).size
    if (uniqueMatchedCount > 0) {
      const msg = `${uniqueMatchedCount} escola(s) reconhecida(s) (${newlyAddedCount} nova(s) marcada(s)).`
      setPastedMatchFeedback(msg)
      toast.success(msg)
    } else {
      setPastedMatchFeedback('Nenhuma escola correspondente foi encontrada.')
      toast.warning('Nenhuma escola encontrada na lista colada. Verifique os nomes.')
    }
  }

  // Roteamento por contrato: Salvar atribuição de escolas à rota logística
  // Preenche paradas_rota, atualiza pedidos pendentes automaticamente e sincroniza contrato_escolas
  const handleSaveRouting = async () => {
    if (!selectedRotaForRouting) return
    setIsSavingAssignment(true)
    try {
      await sincronizarEscolasRotaLogistica(
        selectedRotaForRouting.contrato_id,
        selectedRotaForRouting.id,
        selectedSchoolsToAssign,
      )

      setRoutingDialogOpen(false)
      setSelectedRotaForRouting(null)
    } finally {
      setIsSavingAssignment(false)
    }
  }

  // Drag and Drop nativo de sequenciamento de paradas
  const handleDragStart = (e: React.DragEvent, escolaId: string) => {
    setDraggedEscolaId(escolaId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', escolaId)
  }

  const handleDragOver = (e: React.DragEvent, escolaId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverEscolaId !== escolaId) {
      setDragOverEscolaId(escolaId)
    }
  }

  const handleDrop = async (
    e: React.DragEvent,
    targetEscolaId: string,
    rotaId: string,
    currentParadas: Array<{ escolaId: string; ordem: number }>,
  ) => {
    e.preventDefault()
    setDragOverEscolaId(null)
    const sourceEscolaId = draggedEscolaId || e.dataTransfer.getData('text/plain')
    setDraggedEscolaId(null)

    if (!sourceEscolaId || sourceEscolaId === targetEscolaId) return

    const sourceIndex = currentParadas.findIndex((p) => p.escolaId === sourceEscolaId)
    const targetIndex = currentParadas.findIndex((p) => p.escolaId === targetEscolaId)

    if (sourceIndex === -1 || targetIndex === -1) return

    // Reordenar a lista
    const reordered = [...currentParadas]
    const [movedItem] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, movedItem)

    // Recalcular ordens 1, 2, 3...
    const payload = reordered.map((item, idx) => ({
      escola_id: item.escolaId,
      ordem: idx + 1,
    }))

    // Salvar automaticamente no banco em transação/batch único com update otimista local imediato
    const ok = await salvarSequenciamentoParadas(rotaId, payload)
    if (ok) {
      toast.success('Sequência de paradas atualizada com sucesso!')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header e Seleção de Contrato */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roteamento & Despacho Logístico</h1>
          <p className="text-muted-foreground text-sm">
            Gestão de rotas logísticas da cooperativa, sequenciamento drag-and-drop de paradas e
            despacho por rota inteira.
          </p>
        </div>

        {/* Filtro por Contrato e Ações */}
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary shrink-0" />
          <Select value={selectedContratoId} onValueChange={setSelectedContratoId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Selecione o Contrato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Contratos</SelectItem>
              {contracts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.numero} (
                  {c.num_rotas_logisticas
                    ? `${c.num_rotas_logisticas} rota(s) max`
                    : 'Rotas livres'}
                  )
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedContratoId !== 'todos' && (
            <Button
              onClick={handleOpenCreateRoute}
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={
                Boolean(currentContrato?.num_rotas_logisticas) &&
                filteredRotasLogisticas.length >= (currentContrato?.num_rotas_logisticas || 0)
              }
              title={
                Boolean(currentContrato?.num_rotas_logisticas) &&
                filteredRotasLogisticas.length >= (currentContrato?.num_rotas_logisticas || 0)
                  ? `Limite de ${currentContrato?.num_rotas_logisticas} rotas atingido`
                  : 'Criar nova rota logística para este contrato'
              }
            >
              <Plus className="h-4 w-4" /> Nova Rota
            </Button>
          )}
        </div>
      </div>

      {/* Painel de Escolas Vinculadas sem Rota Atribuída */}
      {selectedContratoId !== 'todos' && escolasSemRota.length > 0 && (
        <div className="p-4 rounded-lg border border-amber-500/40 bg-amber-500/10 space-y-2 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                {escolasSemRota.length} escola(s) vinculada(s) ao contrato ainda sem rota logística
              </span>
            </div>
            <Badge
              variant="outline"
              className="text-amber-700 bg-background border-amber-400 shrink-0 w-fit"
            >
              {pedidosSemRota.length} pedido(s) pendente(s) aguardando rota
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            As escolas abaixo fazem parte do contrato mas ainda não foram distribuídas em nenhuma
            rota logística. Os pedidos delas ficam como <strong>Pendente sem rota</strong> e{' '}
            <strong>não bloqueiam o despacho das demais rotas</strong>. Atribua-as usando o botão
            "Roteamento" em uma das rotas.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {escolasSemRota.map((esc) => (
              <Badge
                key={esc.escolaId}
                variant="secondary"
                className="text-[11px] bg-background/80 border border-amber-300 text-foreground"
              >
                <Building2 className="h-3 w-3 mr-1 text-amber-600" />
                {esc.escolaNome}
                {esc.escolaAlunos ? ` (${esc.escolaAlunos} alunos)` : ''}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Grid de Rotas Logísticas da Cooperativa */}
      {filteredRotasLogisticas.length === 0 ? (
        <Card className="border-dashed border-2 border-primary/20 bg-primary/5">
          <CardContent className="py-12 text-center text-muted-foreground space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <RouteIcon className="h-7 w-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-lg font-bold text-foreground">
                Primeira Configuração de Rotas do Contrato
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {currentContrato ? (
                  <>
                    O contrato <strong>{currentContrato.numero}</strong> ainda não possui rotas
                    logísticas configuradas. Crie as rotas aqui mesmo com nomes livres (
                    {currentContrato.num_rotas_logisticas
                      ? `até ${currentContrato.num_rotas_logisticas} rota(s) conforme o contrato`
                      : 'quantas desejar'}
                    ), atribua as escolas e pedidos do contrato e ordene as paradas por
                    drag-and-drop.
                  </>
                ) : (
                  'Selecione um contrato acima para iniciar a primeira configuração de rotas logísticas, atribuição de escolas e pedidos.'
                )}
              </p>
            </div>

            {currentContrato && (
              <div className="pt-2">
                <Button onClick={handleOpenCreateRoute} className="gap-2">
                  <Plus className="h-4 w-4" /> Criar Primeira Rota Logística
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {rotasLogisticasDetalhes.map((item) => {
            const hasPendentes = item.pedidosPendentes.length > 0
            const hasEmRota = item.pedidosEmRota.length > 0
            const totalEmTransito = item.pedidosPendentes.length + item.pedidosEmRota.length

            return (
              <Card
                key={item.rota.id}
                className="flex flex-col border-t-4 border-t-primary shadow-sm hover:shadow-md transition-shadow"
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg flex items-center gap-2 text-foreground font-bold">
                          <Truck className="h-5 w-5 text-primary" /> {item.rota.nome}
                        </CardTitle>
                        {hasEmRota && (
                          <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-[10px] animate-pulse">
                            Em Rota
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs mt-0.5">
                        Contrato: <strong className="text-foreground">{item.contratoNumero}</strong>{' '}
                        • Modalidade: <span className="capitalize">{item.modalidade}</span>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Indicador de persistência de rota temporária */}
                      {item.rota.id.startsWith('temp-') && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-amber-600 border-amber-400 gap-1 animate-pulse"
                        >
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Salvando...
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5"
                        onClick={() => {
                          setSelectedRotaForRouting(item.rota)
                          setBatchImportFileModalOpen(true)
                        }}
                        title="Importar escolas em lote via arquivo Excel, Word, CSV ou texto simples"
                      >
                        <Upload className="h-3.5 w-3.5 text-primary" />
                        Importar Arquivo
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleOpenRouting(item.rota)}
                        title="Atribuir escolas a esta rota logística"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                        Roteamento ({item.paradasOrdenadas.length} escolas)
                      </Button>
                      {/* Opção para renomear rota logística */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Renomear rota logística"
                        onClick={() => handleOpenEditRoute(item.rota)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {/* Opção para excluir rota vazia */}
                      {item.pedidosEmRota.length === 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Excluir rota logística"
                          onClick={() => setRouteToDelete(item.rota)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>{' '}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 flex-1">
                  {/* Resumo de Carga da Rota */}
                  <div className="grid grid-cols-3 gap-2 text-xs p-2.5 rounded-lg bg-muted/30 border">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">
                        Paradas / Escolas:
                      </span>
                      <p className="font-bold text-sm text-foreground">
                        {item.paradasOrdenadas.length} parada(s)
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">
                        Pedidos Ativos:
                      </span>
                      <p className="font-bold text-sm text-primary">{totalEmTransito} entrega(s)</p>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground block text-[11px]">Volume Total:</span>
                      <p className="font-mono font-bold text-sm text-foreground">
                        {item.volumeTotal} itens
                      </p>
                    </div>
                  </div>

                  {/* Ações de Despacho e Entrega por Rota Inteira */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg border bg-primary/5 gap-2">
                    <div className="text-xs">
                      <span className="font-semibold text-primary block">
                        Controle de Despacho & Entrega:
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {item.ultimoDespacho
                          ? `Último despacho: ${new Date(item.ultimoDespacho.data_despacho).toLocaleDateString('pt-BR')} (${item.ultimoDespacho.status})`
                          : 'Rota aguardando despacho da central'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Botão Colocar em Rota (Rota Inteira) */}
                      {hasPendentes && (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1"
                          onClick={() => handleOpenDispatch(item.rota)}
                          title="Despacha a rota inteira: todos os pedidos passam de Pendente para Em Rota"
                        >
                          <Play className="h-3.5 w-3.5" /> Colocar em Rota
                        </Button>
                      )}

                      {/* Botão Rota Entregue (Operação Offline da Rota Inteira) */}
                      {hasEmRota && (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-semibold"
                          onClick={() => handleOpenDeliverWholeRoute(item.rota)}
                          title="Confirma o retorno do veículo: marca TODOS os pedidos Em Rota como Entregue"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Rota Entregue
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Lista de Paradas com Sequenciamento Drag-and-Drop */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <ArrowUpDown className="h-3.5 w-3.5" /> Sequência de Paradas (Arraste para
                        Reordenar)
                      </h4>
                      <span className="text-[10px] text-muted-foreground">
                        {item.paradasOrdenadas.length} escola(s) atendida(s)
                      </span>
                    </div>

                    {item.paradasOrdenadas.length === 0 ? (
                      <div className="py-6 text-center text-muted-foreground border border-dashed rounded-lg text-xs">
                        Nenhuma escola vinculada a esta rota logística.
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleOpenRouting(item.rota)}
                          >
                            Atribuir Escolas
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                        {item.paradasOrdenadas.map((parada) => {
                          const isOver = dragOverEscolaId === parada.escolaId

                          return (
                            <div
                              key={parada.escolaId}
                              draggable
                              onDragStart={(e) => handleDragStart(e, parada.escolaId)}
                              onDragOver={(e) => handleDragOver(e, parada.escolaId)}
                              onDrop={(e) =>
                                handleDrop(
                                  e,
                                  parada.escolaId,
                                  item.rota.id,
                                  item.paradasOrdenadas.map((p) => ({
                                    escolaId: p.escolaId,
                                    ordem: p.ordem,
                                  })),
                                )
                              }
                              className={`p-2.5 rounded-lg border bg-card text-xs space-y-2 shadow-xs transition-colors cursor-move ${
                                isOver
                                  ? 'border-primary border-2 bg-primary/10'
                                  : 'hover:border-primary/40'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <GripVertical className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shrink-0">
                                    {parada.ordem}
                                  </span>
                                  <div>
                                    <p className="font-semibold text-foreground">{parada.nome}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {parada.endereco || 'Endereço não informado'}
                                    </p>
                                  </div>
                                </div>

                                {/* Referência de Volume: Nº de Alunos da Escola */}
                                <div className="flex items-center gap-2 shrink-0">
                                  {parada.alunos !== undefined && parada.alunos !== null && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] font-mono font-medium"
                                      title="Número de alunos matriculados como referência de volume da escola"
                                    >
                                      {parada.alunos} alunos
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-[10px]">
                                    {parada.pedidos.length} pedido(s)
                                  </Badge>
                                </div>
                              </div>

                              {/* Pedidos vinculados a esta parada */}
                              {parada.pedidos.length > 0 && (
                                <div className="space-y-1.5 pl-7 border-l-2 border-primary/20 ml-2">
                                  {parada.pedidos.map((ped) => (
                                    <div
                                      key={ped.id}
                                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded bg-muted/20 border text-xs"
                                    >
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-bold text-primary">
                                            {ped.numero}
                                          </span>
                                          {ped.id.startsWith('temp-') && (
                                            <span
                                              className="inline-flex items-center text-[9px] text-amber-600 dark:text-amber-400 gap-0.5"
                                              title="Sincronizando com o servidor"
                                            >
                                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                            </span>
                                          )}
                                          <Badge
                                            className={`text-[9px] px-1.5 py-0 ${
                                              ped.status === 'Em Rota'
                                                ? 'bg-amber-600'
                                                : ped.status === 'Entregue'
                                                  ? 'bg-emerald-600'
                                                  : ped.status === 'Cancelado'
                                                    ? 'bg-destructive'
                                                    : 'bg-blue-600'
                                            }`}
                                          >
                                            {ped.status}
                                          </Badge>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                          {ped.items.length} produto(s) • R$ {ped.total.toFixed(2)}
                                        </p>
                                      </div>

                                      {/* Ações no pedido: se estiver Em Rota e motorista não entregou */}
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {ped.status === 'Em Rota' && (
                                          <Button
                                            size="sm"
                                            variant="destructive"
                                            className="h-6 text-[10px] px-2 gap-1"
                                            onClick={() => handleOpenUndelivered(ped)}
                                            title="Motorista não entregou este pedido: cancela definitivamente por motivo logístico"
                                          >
                                            <XCircle className="h-3 w-3" /> Não entregue
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* MODAL 0: Criar Rota Logística no Contrato */}
      <Dialog open={createRouteDialogOpen} onOpenChange={setCreateRouteDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> Nova Rota Logística
            </DialogTitle>
            <DialogDescription>
              Crie uma rota logística para o contrato <strong>{currentContrato?.numero}</strong>. O
              nome é livre e define o roteiro de despacho da cooperativa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="route-name" className="font-semibold">
                Nome da Rota Logística <span className="text-destructive">*</span>
              </Label>
              <Input
                id="route-name"
                placeholder="Ex: Rota Centro-Sul, Rota Rural 1, Setor Escolar A..."
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                {currentContrato?.num_rotas_logisticas ? (
                  <>
                    Limite contratual: {filteredRotasLogisticas.length + 1} de{' '}
                    {currentContrato.num_rotas_logisticas} rotas permitidas.
                  </>
                ) : (
                  'Número de rotas ilimitado para este contrato.'
                )}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isCreatingRoute}
              onClick={() => setCreateRouteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isCreatingRoute || !newRouteName.trim()}
              onClick={handleConfirmCreateRoute}
            >
              {isCreatingRoute ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...
                </>
              ) : (
                'Criar Rota'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Renomear / Editar Rota Logística */}
      <Dialog
        open={editRouteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRouteToEdit(null)
            setEditRouteName('')
          }
          setEditRouteDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" /> Renomear Rota Logística
            </DialogTitle>
            <DialogDescription>
              Altere o nome da rota logística. A alteração será refletida em todas as paradas e
              pedidos vinculados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="edit-route-name" className="font-semibold">
                Nome da Rota Logística <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-route-name"
                placeholder="Ex: Rota Centro-Sul, Rota Rural 1..."
                value={editRouteName}
                onChange={(e) => setEditRouteName(e.target.value)}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                O nome deve ser único para este contrato.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isEditingRoute}
              onClick={() => {
                setEditRouteDialogOpen(false)
                setRouteToEdit(null)
                setEditRouteName('')
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isEditingRoute || !editRouteName.trim()}
              onClick={handleConfirmEditRoute}
            >
              {isEditingRoute ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL Excluir Rota Logística */}
      <AlertDialog
        open={Boolean(routeToDelete)}
        onOpenChange={(open) => !open && setRouteToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Excluir Rota Logística
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover a rota logística <strong>{routeToDelete?.nome}</strong>? Suas paradas
              cadastradas e eventuais pedidos pendentes vinculados serão desatribuídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingRoute}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={isDeletingRoute}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDeleteRoute()
              }}
            >
              {isDeletingRoute ? 'Excluindo...' : 'Confirmar Exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MODAL 1: Montagem de Roteamento por Contrato (Operando sobre ESCOLAS) */}
      <Dialog open={routingDialogOpen} onOpenChange={setRoutingDialogOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" /> Roteamento de Escolas da Rota
            </DialogTitle>
            <DialogDescription>
              Atribua as <strong>escolas participantes do contrato</strong> que compõem o roteiro da
              rota <strong>{selectedRotaForRouting?.nome}</strong>. O roteamento é estrutura do
              contrato: feita uma vez, repetida em todos os ciclos. Pedidos existentes ou futuros
              destas escolas <strong>herdam esta rota automaticamente</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Seção de Importação por Arquivo e Colagem em Massa */}
            <div className="rounded-lg border border-primary/25 bg-primary/[0.03] p-3 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <Label
                  htmlFor="paste-schools-textarea"
                  className="font-semibold text-foreground flex items-center gap-1.5 text-xs"
                >
                  <ClipboardPaste className="h-4 w-4 text-primary" /> Adicionar Escolas em Lote
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10 w-fit"
                  onClick={() => setBatchImportFileModalOpen(true)}
                  title="Selecionar arquivo Excel, Word, CSV ou texto simples"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Selecionar Arquivo (Excel/Word/CSV/TXT)
                </Button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
                  Ou cole o texto diretamente abaixo:
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" /> Uma escola por linha
                </span>
              </div>

              <Textarea
                id="paste-schools-textarea"
                rows={3}
                placeholder={`Cole uma escola por linha (nome e opcionalmente endereço):
Ex: CMEI MARÍLIA MORGADO CARNEIRO - Rua X, 123
Ou: ESCOLA MUNICIPAL SÃO PEDRO; Av. Principal, 450
Ou apenas o nome da escola copiado do Excel/Word`}
                value={pastedSchoolsText}
                onChange={(e) => {
                  setPastedSchoolsText(e.target.value)
                  if (pastedMatchFeedback) setPastedMatchFeedback(null)
                }}
                className="text-xs bg-background resize-y min-h-[64px]"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <p className="text-[10px] text-muted-foreground">
                  Separe por tab, <code>;</code> ou <code> - </code>. As escolas reconhecidas são
                  somadas às já marcadas.
                </p>
                <div className="flex items-center gap-2">
                  {pastedSchoolsText.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] px-2 text-muted-foreground"
                      onClick={() => {
                        setPastedSchoolsText('')
                        setUnmatchedPastedLines([])
                        setPastedMatchFeedback(null)
                      }}
                    >
                      Limpar texto
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs px-3 gap-1.5"
                    disabled={!pastedSchoolsText.trim()}
                    onClick={handleApplyPastedSchools}
                  >
                    <Check className="h-3.5 w-3.5" /> Aplicar Lista
                  </Button>
                </div>
              </div>

              {/* Feedback de sucesso / matching */}
              {pastedMatchFeedback && (
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded px-2.5 py-1">
                  ✓ {pastedMatchFeedback}
                </p>
              )}

              {/* Aviso discreto de linhas não encontradas para correção */}
              {unmatchedPastedLines.length > 0 && (
                <div className="rounded border border-amber-300/80 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-800 p-2 text-[11px] space-y-1">
                  <div className="flex items-center justify-between text-amber-900 dark:text-amber-200 font-semibold">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Não encontradas ({unmatchedPastedLines.length}):
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[10px] px-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setUnmatchedPastedLines([])}
                    >
                      Dispensar
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Estas linhas não casaram com as escolas cadastradas neste contrato. Você pode
                    corrigir o nome e reaplicar:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-950 dark:text-amber-200 font-mono text-[10px] max-h-24 overflow-y-auto">
                    {unmatchedPastedLines.map((line, idx) => (
                      <li key={idx} className="truncate" title={line}>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-foreground flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-primary" /> Escolas do Contrato
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-primary"
                    onClick={() => {
                      if (!currentContrato) return
                      setSelectedSchoolsToAssign(currentContrato.escolas.map((e) => e.escolaId))
                    }}
                  >
                    Marcar Todas
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-muted-foreground"
                    onClick={() => setSelectedSchoolsToAssign([])}
                  >
                    Desmarcar Todas
                  </Button>
                  <span className="text-[11px] font-medium text-foreground ml-2">
                    {selectedSchoolsToAssign.length} selecionada(s)
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Marque as escolas atendidas por esta rota logística. Ao salvar, as paradas serão
                criadas em <code>paradas_rota</code> e os pedidos das escolas receberão esta rota
                automaticamente.
              </p>

              <div className="rounded-lg border divide-y max-h-[300px] overflow-y-auto bg-card">
                {currentContrato ? (
                  currentContrato.escolas.map((esc) => {
                    const isChecked = selectedSchoolsToAssign.includes(esc.escolaId)
                    // Verificar se já está em outra rota logística
                    const paradaOutraRota = paradasRota.find(
                      (p) =>
                        p.escola_id === esc.escolaId &&
                        p.rota_logistica_id !== selectedRotaForRouting?.id,
                    )
                    const outraRotaObj = paradaOutraRota
                      ? rotasLogisticas.find((r) => r.id === paradaOutraRota.rota_logistica_id)
                      : null

                    return (
                      <label
                        key={esc.escolaId}
                        className={`flex items-center justify-between p-3 hover:bg-muted/30 cursor-pointer text-xs transition-colors ${
                          isChecked ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSchoolsToAssign((prev) => [...prev, esc.escolaId])
                              } else {
                                setSelectedSchoolsToAssign((prev) =>
                                  prev.filter((id) => id !== esc.escolaId),
                                )
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <div>
                            <p className="font-semibold text-foreground text-sm">
                              {esc.escolaNome || 'Escola'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {esc.escolaEndereco || 'Endereço não informado'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {esc.escolaAlunos !== undefined && esc.escolaAlunos !== null && (
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {esc.escolaAlunos} alunos
                            </Badge>
                          )}
                          {outraRotaObj && !isChecked && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-700 bg-amber-50 border-amber-300"
                            >
                              Atualmente na {outraRotaObj.nome}
                            </Badge>
                          )}
                          {(esc.rotaPlanilha || esc.rotaNome) && !outraRotaObj && (
                            <Badge
                              variant="outline"
                              className="text-[9px] bg-muted/50 text-muted-foreground"
                            >
                              Aba: {esc.rotaPlanilha || esc.rotaNome}
                            </Badge>
                          )}
                        </div>
                      </label>
                    )
                  })
                ) : (
                  <div className="py-6 text-center text-muted-foreground">
                    Selecione um contrato específico para visualizar e atribuir suas escolas.
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              disabled={isSavingAssignment}
              onClick={() => setRoutingDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={isSavingAssignment} onClick={handleSaveRouting}>
              {isSavingAssignment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando Escolas...
                </>
              ) : (
                `Salvar Escolas na Rota (${selectedSchoolsToAssign.length})`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Confirmação de Despacho (Colocar em Rota a Rota Inteira) */}
      <AlertDialog open={dispatchConfirmOpen} onOpenChange={setDispatchConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-amber-600" /> Colocar Rota Logística em Rota
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja despachar a rota <strong>{rotaToDispatch?.nome}</strong> inteira? Todos os
              pedidos pendentes associados passarão para o status <strong>"Em Rota"</strong> e a
              data/hora do despacho será registrada na central.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDispatching}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={isDispatching}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDispatch()
              }}
            >
              {isDispatching ? 'Despachando...' : 'Confirmar Despacho'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MODAL 3: Confirmação de Entrega da Rota Inteira (Operação Offline da Central) */}
      <AlertDialog open={deliverWholeRouteOpen} onOpenChange={setDeliverWholeRouteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> Confirmar Retorno e Entrega da Rota Inteira
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Confirmação offline da central: o motorista retornou do campo com a rota{' '}
                <strong>{rotaToDeliver?.nome}</strong> cumprida.
              </p>
              <p>
                Todos os pedidos <strong>"Em Rota"</strong> dela serão marcados como{' '}
                <strong>Entregue</strong>, com registro de data/hora (entregue_em) e usuário
                conferente (entregue_por: <strong>{user?.name || user?.email}</strong>), realizando
                a <strong>baixa automática no estoque</strong> e liberando a emissão de Atesto.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeliveringWholeRoute}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isDeliveringWholeRoute}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDeliverWholeRoute()
              }}
            >
              {isDeliveringWholeRoute ? 'Confirmando Entrega...' : 'Confirmar Rota Entregue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MODAL 4: Botão "Não Entregue" após despacho -> Cancelado Definitivamente por Motivo Logístico */}
      <Dialog open={undeliveredDialogOpen} onOpenChange={setUndeliveredDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" /> Registrar "Não Entregue" (Cancelamento Logístico)
            </DialogTitle>
            <DialogDescription>
              O pedido foi despachado mas não foi entregue pelo motorista. Ao registrar "Não
              entregue", o pedido <strong>{orderForUndelivered?.numero}</strong> será{' '}
              <strong>CANCELADO DEFINITIVAMENTE</strong> com motivo logístico (sem reentrega — não
              volta para Pendente).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 rounded bg-muted/30 border space-y-1">
              <p>
                <strong>Escola:</strong> {orderForUndelivered?.schoolName}
              </p>
              <p>
                <strong>Valor:</strong> R$ {orderForUndelivered?.total.toFixed(2)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="motivo-logistico-sel" className="font-semibold">
                Motivo Logístico da Cooperativa <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedMotivoLogistico}
                onValueChange={(val) =>
                  setSelectedMotivoLogistico(val as MotivoLogisticoCancelamento)
                }
              >
                <SelectTrigger id="motivo-logistico-sel" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS_LOGISTICOS_CANCELAMENTO.map((motivo) => (
                    <SelectItem key={motivo} value={motivo}>
                      {motivo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="detalhe-logistico" className="font-semibold">
                Detalhamento Livre (Opcional)
              </Label>
              <textarea
                id="detalhe-logistico"
                rows={3}
                placeholder="Ex.: Caminhão quebrou no km 12, portão trancado sem resposta, etc."
                value={detalheMotivoLogistico}
                onChange={(e) => setDetalheMotivoLogistico(e.target.value)}
                className="w-full p-2 rounded-md border text-xs bg-background"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isProcessingUndelivered}
              onClick={() => setUndeliveredDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isProcessingUndelivered}
              onClick={handleExecuteUndelivered}
            >
              {isProcessingUndelivered ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registrando...
                </>
              ) : (
                'Confirmar "Não Entregue"'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação em Lote via Arquivo (Excel, Word, CSV, TXT) */}
      {currentContrato && selectedRotaForRouting && (
        <RouteSchoolBatchImportModal
          open={batchImportFileModalOpen}
          onOpenChange={setBatchImportFileModalOpen}
          targetRouteName={selectedRotaForRouting.nome}
          targetRouteId={selectedRotaForRouting.id}
          targetRouteType="logistica"
          contract={currentContrato}
          allContracts={contracts}
          masterSchools={schools}
          paradasRota={paradasRota}
          rotasLogisticas={rotasLogisticas}
          onSuccess={async () => {
            // Recarrega todos os dados de rotas, contratos e paradas
            await refreshData()
            // Atualizar o estado local de escolas selecionadas se o modal de roteamento estiver aberto
            const paradasDaRota = paradasRota
              .filter((p) => p.rota_logistica_id === selectedRotaForRouting.id)
              .map((p) => p.escola_id)
            setSelectedSchoolsToAssign(paradasDaRota)
          }}
        />
      )}
    </div>
  )
}
