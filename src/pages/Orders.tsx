// Orders component
import { useState, useMemo } from 'react'
import { useApp } from '@/context/app-context'
import { useAuth } from '@/context/auth-context'
import {
  type Order,
  type MotivoLogisticoCancelamento,
  MOTIVOS_LOGISTICOS_CANCELAMENTO,
} from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  formatIntervaloCiclo,
  formatDespachoAmigavel,
  getDespachoPrevistoCiclo,
} from '@/lib/cicloUtils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ShoppingCart,
  Plus,
  Trash2,
  Calendar as CalIcon,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  MessageSquare,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Info,
  MoreVertical,
  Truck,
  XCircle,
  Edit,
  Play,
  UserCheck,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'

export default function Orders() {
  const {
    products,
    schools,
    orders,
    contracts,
    rotasLogisticas,
    ciclos,
    cicloContratos,
    contractSchools,
    activeCiclo,
    addOrder,
    updateOrderStatus,
    updateOrderItemsAndDate,
    confirmarEntregaPedido,
    cancelarPedido,
    marcarNaoEntreguePedido,
    isLoading,
  } = useApp()
  const { user, isAdmin: isAuthAdmin, isMaster } = useAuth()

  const isAdmin =
    isAuthAdmin ||
    isMaster ||
    (user as any)?.role === 'admin' ||
    user?.perfil === 'ADMINISTRADOR' ||
    user?.perfil === 'administrador' ||
    user?.email?.includes('admin')

  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Filtros de listagem
  const [filterOrigem, setFilterOrigem] = useState<string>('todos')
  const [filterStatus, setFilterStatus] = useState<string>('todos')
  const [filterValidacao, setFilterValidacao] = useState<string>('todos')
  const [filterRotaPlanilha, setFilterRotaPlanilha] = useState<string>('todas')
  const [filterRotaLogistica, setFilterRotaLogistica] = useState<string>('todas')

  // Form de criação de pedido
  const [selectedContractId, setSelectedContractId] = useState<string>('')
  const [selectedSchool, setSelectedSchool] = useState('')
  const [orderOrigem, setOrderOrigem] = useState<'whatsapp' | 'manual'>('whatsapp')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [orderItems, setOrderItems] = useState<Array<{ productId: string; quantity: number }>>([
    { productId: products[0]?.id || '', quantity: 5 },
  ])

  // Detalhes do pedido selecionado
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Diálogo de Edição de Pedido Pós-Coleta (Administrador, apenas antes do despacho)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [orderToEdit, setOrderToEdit] = useState<Order | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editItems, setEditItems] = useState<Array<{ productId: string; quantity: number }>>([])
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Diálogo de cancelamento (livre para Pendente / logístico para Em Rota)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [selectedMotivoLogistico, setSelectedMotivoLogistico] =
    useState<MotivoLogisticoCancelamento>(MOTIVOS_LOGISTICOS_CANCELAMENTO[0])
  const [cancelReasonLogisticoDetalhe, setCancelReasonLogisticoDetalhe] = useState('')
  const [isCanceling, setIsCanceling] = useState(false)

  // Diálogo de confirmação de entrega
  const [deliverDialogOpen, setDeliverDialogOpen] = useState(false)
  const [orderToDeliver, setOrderToDeliver] = useState<Order | null>(null)
  const [isDelivering, setIsDelivering] = useState(false)

  // Filtrar contratos com modalidade individualizada para lançamento via WhatsApp
  const individualContracts = useMemo(
    () => contracts.filter((c) => c.modalidade_pedido === 'individualizado'),
    [contracts],
  )

  // Escolas disponíveis baseadas no contrato selecionado (ou todas se não filtrar)
  const availableSchools = useMemo(() => {
    if (!selectedContractId) return schools
    const c = contracts.find((cnt) => cnt.id === selectedContractId)
    if (!c) return schools
    const schoolIds = new Set(c.escolas.map((e) => e.escolaId))
    return schools.filter((s) => schoolIds.has(s.id))
  }, [selectedContractId, contracts, schools])

  const calculatedTotal = useMemo(() => {
    return orderItems.reduce((acc, item) => {
      const prod = products.find((p) => p.id === item.productId)
      return acc + (prod?.price || 0) * (Number(item.quantity) || 0)
    }, 0)
  }, [orderItems, products])

  const handleAddItem = () => {
    const nextProd = products.find((p) => !orderItems.some((i) => i.productId === p.id))
    setOrderItems((prev) => [
      ...prev,
      {
        productId: nextProd?.id || products[0]?.id || '',
        quantity: 1,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (
    index: number,
    field: 'productId' | 'quantity',
    value: string | number,
  ) => {
    setOrderItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    )
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedSchool) {
      toast.error('Selecione a escola solicitante.')
      return
    }

    // Identificar contrato da escola selecionada
    const linkEscola = contractSchools.find((cs) => cs.escola_id === selectedSchool)
    const contratoIdDaEscola = selectedContractId || linkEscola?.contrato_id

    // TRAVA DE FASE POR CONTRATO (MUDANÇA 3):
    // Validada contra o vínculo ciclo_contratos do contrato no ciclo ativo
    if (!activeCiclo) {
      toast.error('Nenhum ciclo ativo cadastrado. Abra um ciclo antes de lançar pedidos.')
      return
    }

    let faseContrato = (activeCiclo.status || 'coletando').toLowerCase()
    if (contratoIdDaEscola) {
      const cc = cicloContratos.find(
        (c) => c.ciclo_id === activeCiclo.id && c.contrato_id === contratoIdDaEscola,
      )
      if (cc) {
        faseContrato = (cc.fase || 'coletando').toLowerCase()
      }
    }

    if (
      faseContrato === 'coleta_encerrada' ||
      faseContrato === 'coletado' ||
      faseContrato === 'coleta encerrada'
    ) {
      toast.error('Coleta encerrada para este contrato — pedidos bloqueados.')
      return
    }

    if (faseContrato === 'fechado') {
      toast.error('Ciclo fechado para este contrato — abra o próximo ciclo.')
      return
    }

    if (faseContrato === 'cancelado') {
      toast.error('Ciclo cancelado para este contrato.')
      return
    }

    const validItems = orderItems.filter((i) => i.productId && Number(i.quantity) > 0)
    if (validItems.length === 0) {
      toast.error(
        'Não é possível criar pedido sem itens ou com quantidade zero. Adicione pelo menos um item válido com quantidade maior que zero.',
      )
      return
    }

    // Se houver algum item preenchido com quantidade <= 0, alertar o usuário
    const hasZeroItem = orderItems.some(
      (i) => i.productId && (isNaN(Number(i.quantity)) || Number(i.quantity) <= 0),
    )
    if (hasZeroItem) {
      toast.warning('Itens com quantidade menor ou igual a zero não serão incluídos no pedido.')
    }

    setIsSubmitting(true)

    // Achar rota associada da escola no contrato
    let rotaIdToUse: string | undefined = undefined
    if (selectedContractId) {
      const c = contracts.find((cnt) => cnt.id === selectedContractId)
      const esc = c?.escolas.find((e) => e.escolaId === selectedSchool)
      rotaIdToUse = esc?.rotaId
    }

    const success = await addOrder({
      schoolId: selectedSchool,
      date: orderDate,
      cicloId: activeCiclo?.id,
      origem: orderOrigem,
      rotaId: rotaIdToUse,
      items: validItems.map((i) => ({
        productId: i.productId,
        quantity: Number(i.quantity),
      })),
    })

    setIsSubmitting(false)

    if (success) {
      setOpen(false)
      setSelectedSchool('')
      setOrderItems([{ productId: products[0]?.id || '', quantity: 5 }])
    }
  }

  // Rotas da Planilha distintas presentes nos pedidos
  const availableRotasPlanilha = useMemo(() => {
    const routeSet = new Set<string>()
    for (const o of orders) {
      if (o.rotaNome && o.rotaNome.trim() && o.rotaNome !== 'Sem Rota') {
        routeSet.add(o.rotaNome.trim())
      }
    }
    return Array.from(routeSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [orders])

  // Rotas Logísticas distintas presentes nos pedidos ou cadastradas
  const availableRotasLogisticas = useMemo(() => {
    const routeSet = new Set<string>()
    for (const r of rotasLogisticas) {
      if (r.nome && r.nome.trim()) routeSet.add(r.nome.trim())
    }
    for (const o of orders) {
      if (o.rotaLogisticaNome && o.rotaLogisticaNome.trim()) {
        routeSet.add(o.rotaLogisticaNome.trim())
      }
    }
    return Array.from(routeSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [orders])

  // Filtragem da lista com filtros separados de Rota (Planilha) e Rota Logística
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filterOrigem !== 'todos' && o.origem !== filterOrigem) return false
      if (filterStatus !== 'todos' && o.status !== filterStatus) return false
      if (filterValidacao !== 'todos' && o.validacao?.status !== filterValidacao) return false

      // Filtro Rota (Planilha)
      if (filterRotaPlanilha !== 'todas') {
        if (
          !o.rotaNome ||
          o.rotaNome.trim().toLowerCase() !== filterRotaPlanilha.trim().toLowerCase()
        ) {
          return false
        }
      }

      // Filtro Rota Logística
      if (filterRotaLogistica !== 'todas') {
        if (filterRotaLogistica === 'sem_rota_logistica') {
          if (o.rotaLogisticaId || o.rotaLogisticaNome) return false
        } else {
          const matchId = o.rotaLogisticaId === filterRotaLogistica
          const matchNome =
            o.rotaLogisticaNome &&
            o.rotaLogisticaNome.trim().toLowerCase() === filterRotaLogistica.trim().toLowerCase()
          if (!matchId && !matchNome) return false
        }
      }

      return true
    })
  }, [orders, filterOrigem, filterStatus, filterValidacao, filterRotaPlanilha, filterRotaLogistica])

  const getOrigemBadge = (origem: Order['origem']) => {
    switch (origem) {
      case 'formulario':
        return (
          <Badge
            variant="outline"
            className="text-purple-700 bg-purple-50 border-purple-300 gap-1 text-[11px] font-medium"
          >
            <FileText className="h-3 w-3" /> Formulário
          </Badge>
        )
      case 'excel':
        return (
          <Badge
            variant="outline"
            className="text-emerald-700 bg-emerald-50 border-emerald-300 gap-1 text-[11px]"
          >
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </Badge>
        )
      case 'whatsapp':
        return (
          <Badge
            variant="outline"
            className="text-green-700 bg-green-50 border-green-400 gap-1 text-[11px]"
          >
            <MessageSquare className="h-3 w-3" /> WhatsApp
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px]">
            Manual
          </Badge>
        )
    }
  }

  const getValidacaoBadge = (val: Order['validacao']) => {
    if (!val || val.status === 'validado') {
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] gap-1">
          <CheckCircle2 className="h-3 w-3" /> Validado
        </Badge>
      )
    }
    if (val.status === 'invalido') {
      return (
        <Badge variant="destructive" className="text-[10px] gap-1" title={val.motivo}>
          <AlertTriangle className="h-3 w-3" /> Inválido
        </Badge>
      )
    }
    return (
      <Badge className="bg-amber-600 text-[10px] gap-1">
        <Clock className="h-3 w-3" /> Em Progresso
      </Badge>
    )
  }

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'Entregue':
        return <Badge className="bg-emerald-600 text-white font-medium">Entregue</Badge>
      case 'Pendente':
        return <Badge variant="secondary">Pendente</Badge>
      case 'Em Rota':
        return <Badge className="bg-amber-600 text-white font-medium">Em Rota</Badge>
      default:
        return <Badge variant="destructive">Cancelado</Badge>
    }
  }

  // Helpers para fase do contrato do pedido
  const getFaseContratoDoPedido = (order: Order): string => {
    const linkEscola = contractSchools.find((cs) => cs.escola_id === order.schoolId)
    const contratoIdDaEscola =
      linkEscola?.contrato_id ||
      contracts.find((cnt) => cnt.escolas.some((e) => e.escolaId === order.schoolId))?.id
    const cicloId = order.cicloId || activeCiclo?.id
    if (cicloId && contratoIdDaEscola) {
      const cc = cicloContratos.find(
        (c) => c.ciclo_id === cicloId && c.contrato_id === contratoIdDaEscola,
      )
      if (cc && cc.fase) return cc.fase.toLowerCase()
    }
    const pedidoCiclo = ciclos.find((c) => c.id === order.cicloId) || activeCiclo
    return (pedidoCiclo?.status || 'coletando').toLowerCase()
  }

  const isDespachoLiberado = (order: Order): boolean => {
    const fase = getFaseContratoDoPedido(order)
    // Despacho só é liberado na fase Coleta Encerrada; no Fechado nada entra nem sai
    return fase === 'coleta_encerrada' || fase === 'coletado' || fase === 'coleta encerrada'
  }

  // Ações de evolução de status
  const handleAvancarParaEmRota = async (order: Order) => {
    if (order.status !== 'Pendente') {
      toast.warning('Apenas pedidos Pendentes podem avançar para "Em Rota".')
      return
    }

    // Despacho só é liberado na fase Coleta Encerrada
    if (!isDespachoLiberado(order)) {
      toast.error('Despacho liberado apenas na fase Coleta Encerrada.')
      return
    }

    await updateOrderStatus(order.id, 'Em Rota')
  }

  // Abertura e submissão da Edição de Pedido Pós-Coleta (Admin)
  const handleOpenEditOrder = (order: Order) => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem editar pedidos após a coleta.')
      return
    }
    if (order.status === 'Em Rota' || order.status === 'Entregue') {
      toast.error('Pedido já colocado em rota ou entregue não pode ser editado (congelado).')
      return
    }
    if (order.status === 'Cancelado') {
      toast.error('Pedido cancelado não pode ser editado.')
      return
    }

    // Regra: Não pode editar pedidos de contrato já cancelado
    const faseContrato = getFaseContratoDoPedido(order)
    if (faseContrato === 'cancelado') {
      toast.error('O contrato deste pedido está cancelado. Edição bloqueada.')
      return
    }

    setOrderToEdit(order)
    setEditDate(order.date ? order.date.split('T')[0] : new Date().toISOString().split('T')[0])
    setEditItems(
      order.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
      })),
    )
    setEditDialogOpen(true)
  }

  const handleSaveEditOrder = async () => {
    if (!orderToEdit) return
    const validItems = editItems.filter((i) => i.productId && Number(i.quantity) > 0)
    if (validItems.length === 0) {
      toast.error('O pedido precisa conter ao menos um item com quantidade positiva.')
      return
    }

    setIsSavingEdit(true)
    try {
      const ok = await updateOrderItemsAndDate(orderToEdit.id, validItems, editDate)
      if (ok) {
        setEditDialogOpen(false)
        setOrderToEdit(null)
      }
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleOpenConfirmDelivery = (order: Order) => {
    setOrderToDeliver(order)
    setDeliverDialogOpen(true)
  }

  const handleExecuteDelivery = async () => {
    if (!orderToDeliver) return
    setIsDelivering(true)
    try {
      const ok = await confirmarEntregaPedido(orderToDeliver.id, user?.id)
      if (ok) {
        setDeliverDialogOpen(false)
        setOrderToDeliver(null)
      }
    } finally {
      setIsDelivering(false)
    }
  }

  const handleOpenCancelDialog = (order: Order) => {
    if (order.status === 'Cancelado') {
      toast.info('Este pedido já está cancelado.')
      return
    }
    if (order.status === 'Entregue') {
      toast.error('Não é possível cancelar um pedido já entregue.')
      return
    }

    // Verificar status do ciclo/contrato do pedido:
    // Fechado/Cancelado não aceita cancelamento de pedido pendente — EXCETO cancelamento por motivo logístico (para pedidos já despachados / Em Rota).
    const faseContrato = getFaseContratoDoPedido(order)
    if (faseContrato === 'fechado' && order.status !== 'Em Rota') {
      toast.error(
        'Ciclo fechado não aceita cancelamento de pedido pendente. Apenas cancelamento logístico para pedidos em rota é permitido.',
      )
      return
    }

    if (faseContrato === 'cancelado') {
      toast.error('O contrato/ciclo deste pedido já se encontra cancelado.')
      return
    }

    setOrderToCancel(order)
    setCancelReason('')
    setSelectedMotivoLogistico(MOTIVOS_LOGISTICOS_CANCELAMENTO[0])
    setCancelReasonLogisticoDetalhe('')
    setCancelDialogOpen(true)
  }

  const handleExecuteCancel = async () => {
    if (!orderToCancel) return

    setIsCanceling(true)
    try {
      if (orderToCancel.status === 'Pendente') {
        // Regra 8: Pedido NÃO despachado (Pendente): pode ser cancelado antes do despacho, com motivo livre
        if (!cancelReason.trim()) {
          toast.error('Informe obrigatoriamente o motivo do cancelamento.')
          return
        }
        const ok = await cancelarPedido(orderToCancel.id, cancelReason.trim(), false)
        if (ok) {
          setCancelDialogOpen(false)
          setOrderToCancel(null)
          setCancelReason('')
        }
      } else if (orderToCancel.status === 'Em Rota') {
        // Regra 8: Pedido despachado (Em Rota) ou Não entregue: só por motivos logísticos da cooperativa (lista fixa + detalhe livre)
        const motivoCompleto = cancelReasonLogisticoDetalhe.trim()
          ? `${selectedMotivoLogistico}: ${cancelReasonLogisticoDetalhe.trim()}`
          : selectedMotivoLogistico
        const ok = await marcarNaoEntreguePedido(orderToCancel.id, motivoCompleto, user?.id)
        if (ok) {
          setCancelDialogOpen(false)
          setOrderToCancel(null)
          setCancelReasonLogisticoDetalhe('')
        }
      }
    } finally {
      setIsCanceling(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestão de Pedidos</h1>
          <p className="text-muted-foreground">
            Lançamento via WhatsApp para contratos individualizados, validação de regras e rastreio
            por origem.
          </p>
        </div>

        {/* Botão de Lançar Pedido */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Lançar Pedido
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" /> Novo Pedido (Individualizado /
                WhatsApp)
              </DialogTitle>
              <DialogDescription>
                Ciclo Ativo:{' '}
                <strong className="text-foreground">{activeCiclo?.nome || 'Nenhum'}</strong> (
                {activeCiclo?.status || '-'})
                {activeCiclo && (
                  <>
                    {' '}
                    • {formatIntervaloCiclo(activeCiclo.data_inicio, activeCiclo.data_fim)} •
                    Despacho:{' '}
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatDespachoAmigavel(
                        activeCiclo.snapshot?.despacho_previsto_segunda ||
                          getDespachoPrevistoCiclo(activeCiclo.data_inicio),
                      )}
                    </span>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateOrder} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ord-contrato">Contrato Vinculado</Label>
                  <Select value={selectedContractId} onValueChange={setSelectedContractId}>
                    <SelectTrigger id="ord-contrato">
                      <SelectValue placeholder="Selecione o Contrato" />
                    </SelectTrigger>
                    <SelectContent>
                      {individualContracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.numero} ({c.escolas.length} escolas)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ord-origem">Canal de Origem</Label>
                  <Select
                    value={orderOrigem}
                    onValueChange={(v) => setOrderOrigem(v as 'whatsapp' | 'manual')}
                  >
                    <SelectTrigger id="ord-origem">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">Mensagem WhatsApp (Individual)</SelectItem>
                      <SelectItem value="manual">Lançamento Interno / Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ord-escola">
                    Escola / Instituição <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedSchool} onValueChange={setSelectedSchool} required>
                    <SelectTrigger id="ord-escola">
                      <SelectValue placeholder="Selecione a escola" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSchools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.route})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ord-date">Data Prevista de Entrega</Label>
                  <div className="relative">
                    <CalIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      type="date"
                      id="ord-date"
                      className="pl-9"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Itens do Pedido */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold text-sm">Itens e Quantidades</Label>
                    <p className="text-xs text-muted-foreground">
                      Informe os produtos e as respectivas quantidades solicitadas pela escola.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddItem}
                    className="h-8 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Produto
                  </Button>
                </div>

                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {orderItems.map((item, idx) => {
                    const selectedProd = products.find((p) => p.id === item.productId)
                    const itemSubtotal =
                      selectedProd &&
                      selectedProd.price !== undefined &&
                      selectedProd.price !== null
                        ? selectedProd.price * (Number(item.quantity) || 0)
                        : 0

                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-xs"
                      >
                        <div className="flex-1">
                          <Select
                            value={item.productId}
                            onValueChange={(val) => handleItemChange(idx, 'productId', val)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Selecione o produto" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                  {p.price !== undefined && p.price !== null && p.price > 0
                                    ? ` - R$ ${p.price.toFixed(2)}`
                                    : ''}{' '}
                                  / {p.unit}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-20">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            className="h-8 text-xs font-mono"
                            placeholder="Qtd"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)
                            }
                          />
                        </div>
                        <div className="w-24 text-right font-mono font-medium text-foreground">
                          R$ {itemSubtotal.toFixed(2)}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveItem(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <span className="font-semibold text-xs">Valor Total Calculado:</span>
                  <span className="text-base font-bold text-primary">
                    R${' '}
                    {calculatedTotal.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
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
                    'Salvar Pedido'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Barra de Filtros */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
            <div>
              <Label className="text-xs">Origem do Pedido</Label>
              <Select value={filterOrigem} onValueChange={setFilterOrigem}>
                <SelectTrigger className="h-9 mt-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as Origens</SelectItem>
                  <SelectItem value="formulario">Formulário (Escola R24)</SelectItem>
                  <SelectItem value="excel">Excel (Centralizado)</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp (Individual)</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Status da Entrega</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 mt-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Status</SelectItem>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Em Rota">Em Rota</SelectItem>
                  <SelectItem value="Entregue">Entregue</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Status da Validação</Label>
              <Select value={filterValidacao} onValueChange={setFilterValidacao}>
                <SelectTrigger className="h-9 mt-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as Validações</SelectItem>
                  <SelectItem value="validado">Validado</SelectItem>
                  <SelectItem value="invalido">Inválido / Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro Aba da Planilha */}
            <div>
              <Label className="text-xs flex items-center gap-1">
                <FileSpreadsheet className="h-3 w-3 text-muted-foreground" /> Aba da Planilha
              </Label>
              <Select value={filterRotaPlanilha} onValueChange={setFilterRotaPlanilha}>
                <SelectTrigger className="h-9 mt-1 text-xs">
                  <SelectValue placeholder="Todas as Abas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Abas</SelectItem>
                  {availableRotasPlanilha.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro Rota */}
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Truck className="h-3 w-3 text-amber-600" /> Rota
              </Label>
              <Select value={filterRotaLogistica} onValueChange={setFilterRotaLogistica}>
                <SelectTrigger className="h-9 mt-1 text-xs">
                  <SelectValue placeholder="Todas as Rotas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Rotas</SelectItem>
                  <SelectItem value="sem_rota_logistica">Sem rota</SelectItem>
                  {availableRotasLogisticas.map((r) => (
                    <SelectItem key={r} value={r}>
                      Rota {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(filterOrigem !== 'todos' ||
            filterStatus !== 'todos' ||
            filterValidacao !== 'todos' ||
            filterRotaPlanilha !== 'todas' ||
            filterRotaLogistica !== 'todas') && (
            <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
              <span>Filtros ativos refinando a visualização dos pedidos</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setFilterOrigem('todos')
                  setFilterStatus('todos')
                  setFilterValidacao('todos')
                  setFilterRotaPlanilha('todas')
                  setFilterRotaLogistica('todas')
                }}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de Pedidos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5 text-primary" /> Relação de Pedidos Lançados
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {filteredOrders.length} pedido(s) listado(s)
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Pedido</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Instituição Escolar</TableHead>
                  <TableHead>Aba</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Data Prevista</TableHead>
                  <TableHead>Validação</TableHead>
                  <TableHead>Cancelamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total (R$)</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedidos...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      Nenhum pedido encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-semibold text-primary text-xs">
                        <div className="flex items-center gap-1.5">
                          {order.numero}
                          {order.id.startsWith('temp-') && (
                            <span
                              className="inline-flex items-center text-[10px] text-amber-600 gap-0.5"
                              title="Sincronizando com o servidor"
                            >
                              <Loader2 className="h-3 w-3 animate-spin" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getOrigemBadge(order.origem)}</TableCell>
                      <TableCell className="font-medium text-xs">{order.schoolName}</TableCell>
                      {/* Coluna 1: Aba da Planilha */}
                      <TableCell>
                        {order.rotaNome ? (
                          <Badge
                            variant="secondary"
                            className="bg-muted text-foreground border border-border/80 text-[10px] font-normal gap-1"
                            title="Aba de origem na planilha centralizada da secretaria"
                          >
                            <FileSpreadsheet className="h-2.5 w-2.5 text-muted-foreground" />
                            Aba: {order.rotaNome}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60 italic">
                            Sem ref.
                          </span>
                        )}
                      </TableCell>
                      {/* Coluna 2: Rota */}
                      <TableCell>
                        {order.rotaLogisticaNome ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 text-[10px] font-semibold gap-1"
                          >
                            <Truck className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                            Rota {order.rotaLogisticaNome}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground border-dashed bg-muted/20"
                          >
                            Sem rota
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(order.date).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>{getValidacaoBadge(order.validacao)}</TableCell>
                      <TableCell className="text-xs">
                        {order.status === 'Cancelado' ? (
                          <div className="max-w-[190px]" title={order.motivo_cancelamento || ''}>
                            <span className="text-xs font-semibold text-destructive line-clamp-2">
                              {order.motivo_cancelamento || 'Sem motivo registrado'}
                            </span>
                            {order.cancelado_em && (
                              <span className="text-[9px] text-muted-foreground block">
                                Em {new Date(order.cancelado_em).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-right font-mono font-medium text-xs">
                        R${' '}
                        {order.total.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="Ver detalhes do pedido"
                            onClick={() => {
                              setViewingOrder(order)
                              setDetailsOpen(true)
                            }}
                          >
                            <Info className="h-4 w-4" />
                          </Button>

                          {/* Menu de Ações de Transição de Status */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0"
                                title="Ações do pedido"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 text-xs">
                              <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                                Status: {order.status}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />

                              {/* Ação de EDIÇÃO PÓS-COLETA por Administrador (antes do despacho) */}
                              {isAdmin && order.status === 'Pendente' && (
                                <DropdownMenuItem
                                  className="gap-2 cursor-pointer text-blue-700 dark:text-blue-400 font-medium"
                                  onClick={() => handleOpenEditOrder(order)}
                                >
                                  <Edit className="h-3.5 w-3.5" /> Editar Pedido (Admin)
                                </DropdownMenuItem>
                              )}

                              {/* Se Pendente: pode avançar para Em Rota, Entregue ou Cancelar */}
                              {order.status === 'Pendente' && (
                                <>
                                  {(() => {
                                    const liberado = isDespachoLiberado(order)
                                    const fase = getFaseContratoDoPedido(order)
                                    return (
                                      <DropdownMenuItem
                                        disabled={!liberado}
                                        className={`gap-2 ${
                                          liberado
                                            ? 'cursor-pointer text-amber-700 dark:text-amber-400'
                                            : 'opacity-50 cursor-not-allowed'
                                        }`}
                                        onClick={() => {
                                          if (liberado) {
                                            handleAvancarParaEmRota(order)
                                          } else {
                                            toast.error(
                                              'Despacho liberado apenas na fase Coleta Encerrada.',
                                            )
                                          }
                                        }}
                                        title={
                                          liberado
                                            ? 'Colocar em rota de entrega'
                                            : 'Despacho liberado apenas na fase Coleta Encerrada'
                                        }
                                      >
                                        <Truck className="h-3.5 w-3.5" /> Colocar em Rota
                                        {!liberado && (
                                          <span className="text-[10px] text-muted-foreground ml-auto capitalize">
                                            ({fase})
                                          </span>
                                        )}
                                      </DropdownMenuItem>
                                    )
                                  })()}
                                  <DropdownMenuItem
                                    className="gap-2 cursor-pointer text-emerald-700 dark:text-emerald-400"
                                    onClick={() => handleOpenConfirmDelivery(order)}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar Entrega
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                    onClick={() => handleOpenCancelDialog(order)}
                                  >
                                    <XCircle className="h-3.5 w-3.5" /> Cancelar Pedido
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* Se Em Rota: pode avançar para Entregue ou marcar "Não entregue" */}
                              {order.status === 'Em Rota' && (
                                <>
                                  <DropdownMenuItem
                                    className="gap-2 cursor-pointer text-emerald-700 dark:text-emerald-400"
                                    onClick={() => handleOpenConfirmDelivery(order)}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar Entrega
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="gap-2 cursor-pointer text-destructive focus:text-destructive font-semibold"
                                    onClick={() => handleOpenCancelDialog(order)}
                                  >
                                    <XCircle className="h-3.5 w-3.5" /> Não entregue (Cancelar)
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* Se Entregue: finalizado */}
                              {order.status === 'Entregue' && (
                                <div className="px-2 py-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
                                  <Check className="h-3.5 w-3.5" /> Pedido Concluído
                                </div>
                              )}

                              {/* Se Cancelado: bloqueado, não pode voltar */}
                              {order.status === 'Cancelado' && (
                                <div className="px-2 py-1.5 text-[11px] text-destructive flex items-center gap-1.5 font-medium">
                                  <XCircle className="h-3.5 w-3.5" /> Cancelado (sem retorno)
                                </div>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Modal de Detalhes do Pedido */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" /> Pedido {viewingOrder?.numero}
            </DialogTitle>
            <DialogDescription>
              {viewingOrder?.schoolName} • Origem: {viewingOrder?.origem}
            </DialogDescription>
          </DialogHeader>
          {viewingOrder && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="p-3 rounded border bg-muted/20 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status Atual:</span>
                  <span>{getStatusBadge(viewingOrder.status)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Aba da Planilha:</span>
                  <span className="font-medium text-foreground">
                    {viewingOrder.rotaNome || 'Sem referência de planilha'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Rota:</span>
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {viewingOrder.rotaLogisticaNome
                      ? `Rota ${viewingOrder.rotaLogisticaNome}`
                      : 'Sem rota atribuída'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status da Validação:</span>
                  <span>{getValidacaoBadge(viewingOrder.validacao)}</span>
                </div>
                {viewingOrder.validacao?.motivo && (
                  <p className="text-[11px] text-muted-foreground pt-1 border-t">
                    👉 {viewingOrder.validacao.motivo}
                  </p>
                )}
              </div>

              {/* Informações de Entrega se entregue */}
              {viewingOrder.status === 'Entregue' && (
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-1 text-emerald-900 dark:text-emerald-200">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Dados da Entrega Confirmada
                  </div>
                  {viewingOrder.entregue_em && (
                    <p className="text-[11px]">
                      <strong>Data/Hora:</strong>{' '}
                      {new Date(viewingOrder.entregue_em).toLocaleString('pt-BR')}
                    </p>
                  )}
                  {viewingOrder.entreguePorNome && (
                    <p className="text-[11px]">
                      <strong>Confirmado por:</strong> {viewingOrder.entreguePorNome}
                    </p>
                  )}
                </div>
              )}

              {/* Motivo de Cancelamento se cancelado */}
              {viewingOrder.status === 'Cancelado' && (
                <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 space-y-1 text-destructive">
                  <div className="flex items-center gap-1.5 font-bold">
                    <XCircle className="h-4 w-4" /> Pedido Cancelado Definitivamente
                  </div>
                  <p className="text-[11px] text-foreground">
                    <strong>Motivo:</strong>{' '}
                    {viewingOrder.motivo_cancelamento || 'Motivo não informado.'}
                  </p>
                  {viewingOrder.cancelado_em && (
                    <p className="text-[10px] text-muted-foreground">
                      <strong>Data/Hora do Cancelamento:</strong>{' '}
                      {new Date(viewingOrder.cancelado_em).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              )}

              <div>
                <h4 className="font-semibold text-xs mb-2">Itens Solicitados:</h4>
                <div className="rounded border divide-y max-h-[220px] overflow-y-auto">
                  {viewingOrder.items.map((it, idx) => {
                    const itPreco = typeof it.price === 'number' && !isNaN(it.price) ? it.price : 0
                    const itSubtotal = (it.quantity || 0) * itPreco
                    return (
                      <div key={idx} className="flex justify-between p-2">
                        <span>{it.name}</span>
                        <span className="font-mono">
                          {it.quantity} un × R$ {itPreco.toFixed(2)} = R$ {itSubtotal.toFixed(2)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 font-bold text-sm">
                <span>Total do Pedido:</span>
                <span className="text-primary font-mono">
                  R$ {(viewingOrder.total || 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}{' '}
        </DialogContent>
      </Dialog>
      {/* Modal de Cancelamento de Pedido (Pendente: Motivo Livre | Em Rota: "Não entregue" Motivo Logístico) */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              {orderToCancel?.status === 'Em Rota'
                ? `Registrar "Não Entregue" - Pedido ${orderToCancel?.numero}`
                : `Cancelar Pedido ${orderToCancel?.numero}`}
            </DialogTitle>
            <DialogDescription>
              {orderToCancel?.status === 'Em Rota' ? (
                <span>
                  Pedido despachado não entregue: será <strong>cancelado definitivamente</strong>{' '}
                  por motivo logístico da cooperativa (sem reentrega — não volta para Pendente).
                </span>
              ) : (
                <span>
                  Pedido ainda não despachado (Pendente): pode ser cancelado com motivo livre antes
                  do despacho.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 rounded bg-muted/30 border space-y-1">
              <p>
                <strong>Escola:</strong> {orderToCancel?.schoolName}
              </p>
              <p>
                <strong>Valor:</strong> R$ {(orderToCancel?.total || 0).toFixed(2)}
              </p>
              {orderToCancel?.rotaLogisticaNome && (
                <p>
                  <strong>Rota:</strong> {orderToCancel?.rotaLogisticaNome}
                </p>
              )}
            </div>

            {orderToCancel?.status === 'Pendente' ? (
              // Regra 8.1: Pedido NÃO despachado (Pendente): motivo livre
              <div className="space-y-1.5">
                <Label htmlFor="cancel-motivo" className="text-xs font-semibold">
                  Motivo do Cancelamento (Livre) <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="cancel-motivo"
                  placeholder="Informe detalhadamente por que este pedido está sendo cancelado antes do despacho..."
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>
            ) : (
              // Regra 8.2 & 8.3: Pedido despachado (Em Rota): Motivo Logístico da lista fixa + detalhe livre
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cancel-logistico-sel" className="text-xs font-semibold">
                    Motivo Logístico da Cooperativa <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedMotivoLogistico}
                    onValueChange={(val) =>
                      setSelectedMotivoLogistico(val as MotivoLogisticoCancelamento)
                    }
                  >
                    <SelectTrigger id="cancel-logistico-sel" className="h-8 text-xs">
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
                  <Label htmlFor="cancel-logistico-detalhe" className="text-xs font-semibold">
                    Detalhamento Livre (Opcional)
                  </Label>
                  <Textarea
                    id="cancel-logistico-detalhe"
                    placeholder="Ex.: Motorista relata caminhão quebrado no km 15, escola fechada sem aviso prévio..."
                    rows={2}
                    value={cancelReasonLogisticoDetalhe}
                    onChange={(e) => setCancelReasonLogisticoDetalhe(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isCanceling}
              onClick={() => setCancelDialogOpen(false)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isCanceling}
              onClick={handleExecuteCancel}
            >
              {isCanceling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...
                </>
              ) : orderToCancel?.status === 'Em Rota' ? (
                'Confirmar "Não Entregue"'
              ) : (
                'Confirmar Cancelamento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação Direta de Entrega (Baixa de Estoque + Registro) */}
      <Dialog open={deliverDialogOpen} onOpenChange={setDeliverDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Confirmar Entrega do Pedido
            </DialogTitle>
            <DialogDescription>
              O status mudará para <strong>Entregue</strong>, liberando a emissão de Atesto e
              realizando a baixa de estoque dos itens.
            </DialogDescription>
          </DialogHeader>

          {orderToDeliver && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-lg bg-muted/30 border space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pedido:</span>
                  <span className="font-bold text-primary">{orderToDeliver.numero}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Instituição:</span>
                  <span className="font-medium">{orderToDeliver.schoolName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Total:</span>
                  <span className="font-mono font-bold text-foreground">
                    R$ {(orderToDeliver.total || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5 text-primary" /> Confirmado por:
                  </span>
                  <span className="font-semibold text-foreground">
                    {user?.name || user?.email || 'Usuário Atual'}
                  </span>
                </div>
              </div>

              <div>
                <p className="font-semibold mb-1 text-muted-foreground">
                  Itens com baixa no estoque:
                </p>
                <div className="rounded border divide-y max-h-[160px] overflow-y-auto">
                  {orderToDeliver.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between p-2">
                      <span>{it.name}</span>
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                        -{it.quantity} un
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isDelivering}
              onClick={() => setDeliverDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isDelivering}
              onClick={handleExecuteDelivery}
            >
              {isDelivering ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Concluindo...
                </>
              ) : (
                'Confirmar Entrega'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Edição de Pedido Pós-Coleta (Admin, antes do despacho) */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Edit className="h-5 w-5" /> Editar Pedido: {orderToEdit?.numero}
            </DialogTitle>
            <DialogDescription>
              Edição permitida a administradores para pedidos não despachados (mesmo nas fases
              Coleta Encerrada ou Fechado).
            </DialogDescription>
          </DialogHeader>

          {orderToEdit && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Escola:</span>
                  <span className="font-semibold text-foreground">{orderToEdit.schoolName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Origem:</span>
                  <span className="capitalize">{orderToEdit.origem}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fase Operacional do Contrato:</span>
                  <Badge variant="outline" className="capitalize">
                    {getFaseContratoDoPedido(orderToEdit)}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-date" className="text-xs font-semibold">
                  Data Prevista do Pedido
                </Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Itens e Quantidades</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      const nextP = products.find(
                        (p) => !editItems.some((it) => it.productId === p.id),
                      )
                      setEditItems((prev) => [
                        ...prev,
                        { productId: nextP?.id || products[0]?.id || '', quantity: 1 },
                      ])
                    }}
                  >
                    <Plus className="h-3 w-3" /> Adicionar Item
                  </Button>
                </div>

                <div className="border rounded-md divide-y max-h-[220px] overflow-y-auto">
                  {editItems.map((item, index) => {
                    const prod = products.find((p) => p.id === item.productId)
                    return (
                      <div key={index} className="p-2 flex items-center gap-2">
                        <Select
                          value={item.productId}
                          onValueChange={(val) => {
                            setEditItems((prev) =>
                              prev.map((it, idx) =>
                                idx === index ? { ...it, productId: val } : it,
                              ),
                            )
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} ({p.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Input
                          type="number"
                          step="any"
                          min="0"
                          className="h-8 w-24 text-xs font-mono"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            setEditItems((prev) =>
                              prev.map((it, idx) =>
                                idx === index ? { ...it, quantity: val } : it,
                              ),
                            )
                          }}
                        />

                        <span className="text-[11px] text-muted-foreground w-12 text-right">
                          {prod?.unit || 'un'}
                        </span>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            setEditItems((prev) => prev.filter((_, idx) => idx !== index))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isSavingEdit}
              onClick={() => setEditDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isSavingEdit}
              onClick={handleSaveEditOrder}
              className="gap-1.5"
            >
              {isSavingEdit ? (
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
    </div>
  )
}
