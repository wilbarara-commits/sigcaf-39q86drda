// Orders component
import { useState, useMemo, useRef } from 'react'
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
  getDespachoEfetivoCiclo,
  extractCicloCodigo,
  formatFaseAmigavel,
} from '@/lib/cicloUtils'
import type { CicloRecord } from '@/lib/types'

const getCicloDataDespachoInput = (c?: CicloRecord | null): string => {
  if (!c) return new Date().toISOString().split('T')[0]
  if (c.data_despacho) {
    const raw = c.data_despacho.includes('T')
      ? c.data_despacho.split('T')[0]
      : c.data_despacho.split(' ')[0]
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  }
  const d = getDespachoEfetivoCiclo(c)
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}
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
  FileText,
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
  Send,
  PhoneOff,
  ClipboardPaste,
  Image as ImageIcon,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { safeOpenWhatsApp, buildProtocoloWhatsAppMessage } from '@/lib/whatsapp'
import {
  formatQuantityOneDecimal,
  normalizeDecimalTyping,
  validateQuantityStepHalf,
  formatQuantityOnBlur,
} from '@/lib/decimalUtils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { whatsappService } from '@/services/whatsapp-import'
import { parsePastedOrderText, type OrderPasteParseResult } from '@/lib/orderPasteParser'
import { extractTextFromImage } from '@/lib/imageExtractor'

export default function Orders() {
  const {
    products,
    schools,
    chamadas,
    chamadaItems,
    orders,
    contracts,
    rotasLogisticas,
    ciclos,
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

  // Form de criação de pedido — NOVO FLUXO ORIENTADO A CICLO
  const [selectedCicloId, setSelectedCicloId] = useState<string>('')
  const [selectedSchool, setSelectedSchool] = useState('')
  const [orderOrigem, setOrderOrigem] = useState<'whatsapp' | 'manual'>('whatsapp')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [orderItems, setOrderItems] = useState<
    Array<{ productId: string; quantity: number; rawInput?: string }>
  >([])

  // Diálogo / Painel de Colar Produtos do Pedido
  const [pasteModalOpen, setPasteModalOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pastePreview, setPastePreview] = useState<OrderPasteParseResult | null>(null)
  const [isExtractingImage, setIsExtractingImage] = useState(false)
  const [extractionStatusText, setExtractionStatusText] = useState('')
  const [imageExtractError, setImageExtractError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const isPasteModalOpenRef = useRef(false)
  const lastPasteClosedAtRef = useRef(0)

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

  // Envio de protocolo por WhatsApp
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<string | null>(null)

  // ==========================================
  // NOVO FLUXO ORIENTADO A CICLO (Passos 1 a 5)
  // ==========================================

  // PASSO 1: Ciclos elegíveis (status 'coletando' ou 'correcao')
  const openCiclos = useMemo(() => {
    return ciclos.filter((c) => {
      const st = (c.status || '').toLowerCase()
      return st === 'coletando' || st === 'correcao'
    })
  }, [ciclos])

  // Ciclo selecionado no modal (driver)
  const selectedCiclo = useMemo(() => {
    if (!selectedCicloId) return null
    return ciclos.find((c) => c.id === selectedCicloId) || null
  }, [selectedCicloId, ciclos])

  // Chamada associada ao ciclo selecionado
  const selectedChamada = useMemo(() => {
    if (!selectedCiclo?.chamada_id) return null
    return (
      chamadas.find((ch) => ch.id === selectedCiclo.chamada_id) ||
      selectedCiclo.expand?.chamada_id ||
      null
    )
  }, [selectedCiclo, chamadas])

  // PASSO 3: Contratos ativos vinculados à chamada do ciclo selecionado
  const activeContractsForChamada = useMemo(() => {
    if (!selectedCiclo?.chamada_id) return []
    return contracts.filter(
      (c) => c.chamada_id === selectedCiclo.chamada_id && c.status === 'Ativo',
    )
  }, [selectedCiclo, contracts])

  // Escolas = união desduplicada por id das escolas dos contratos ativos da chamada
  interface EscolaOpcaoModal {
    escolaId: string
    nome: string
    inep?: string
    rotaNome: string
    rotaId?: string
    contratoId: string
  }

  const availableSchoolsForCiclo = useMemo<EscolaOpcaoModal[]>(() => {
    if (!selectedCiclo) return []
    const map = new Map<string, EscolaOpcaoModal>()
    for (const c of activeContractsForChamada) {
      for (const esc of c.escolas) {
        if (!map.has(esc.escolaId)) {
          const sch = schools.find((s) => s.id === esc.escolaId)
          const inep = esc.escolaCodigoInep || sch?.codigo_inep || undefined
          const nome = esc.escolaNome || sch?.name || 'Escola'
          const rotaNome =
            esc.rotaNome || esc.rotaPlanilha || esc.rotaLogisticaNome || sch?.route || 'Sem rota'
          map.set(esc.escolaId, {
            escolaId: esc.escolaId,
            nome,
            inep,
            rotaNome,
            rotaId: esc.rotaId || esc.rotaLogisticaId,
            contratoId: c.id,
          })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [selectedCiclo, activeContractsForChamada, schools])

  // PASSO 4: Itens e preços vindos da CHAMADA (itens da chamada são soberanos em preço)
  interface ItemCatalogoChamada {
    productId: string
    nome: string
    unidade: string
    preco: number
  }

  const availableItemsForChamada = useMemo<ItemCatalogoChamada[]>(() => {
    if (!selectedCiclo?.chamada_id) {
      // Fallback para catálogo global caso não haja chamada definida
      return products.map((p) => ({
        productId: p.id,
        nome: p.name,
        unidade: p.unit || 'un',
        preco: Number(p.price) || 0,
      }))
    }

    const itemsChamada = chamadaItems.filter((ci) => ci.chamada_id === selectedCiclo.chamada_id)

    if (itemsChamada.length > 0) {
      return itemsChamada.map((ci) => {
        // Resolução estrita: casar PRIMEIRO por produto_id
        const prod = ci.produto_id ? products.find((p) => p.id === ci.produto_id) : undefined
        // Fallback por nome apenas para legados sem produto_id
        const matchedProd =
          prod ||
          (!ci.produto_id
            ? products.find((p) => p.name.trim().toLowerCase() === ci.produto.trim().toLowerCase())
            : undefined)
        const prodId = ci.produto_id || matchedProd?.id || ci.id
        const nomeOficial = prod?.name || matchedProd?.name || ci.produto || 'Produto'
        return {
          productId: prodId,
          nome: nomeOficial,
          unidade: ci.unidade || prod?.unit || matchedProd?.unit || 'un',
          preco: Number(ci.preco) || 0,
        }
      })
    }

    // Se a chamada ainda não tem itens próprios cadastrados, fallback nos produtos gerais
    return products.map((p) => ({
      productId: p.id,
      nome: p.name,
      unidade: p.unit || 'un',
      preco: Number(p.price) || 0,
    }))
  }, [selectedCiclo, chamadaItems, products])

  // Total calculado em tempo real com base nos preços soberanos da chamada
  const calculatedTotal = useMemo(() => {
    return orderItems.reduce((acc, item) => {
      const itemCat = availableItemsForChamada.find((p) => p.productId === item.productId)
      const preco = itemCat?.preco || 0
      return acc + preco * (Number(item.quantity) || 0)
    }, 0)
  }, [orderItems, availableItemsForChamada])

  // Formatação amigável do ciclo para o select
  const formatCicloOptionLabel = (c: (typeof ciclos)[number]) => {
    const ch = chamadas.find((cham) => cham.id === c.chamada_id) || c.expand?.chamada_id
    const numChamada = ch?.chamada || 'Chamada'
    const codCiclo = extractCicloCodigo(c.nome) || c.nome
    const faseAmigavel = formatFaseAmigavel(c.status)
    return `Ciclo ${codCiclo} [${numChamada}] — ${faseAmigavel}`
  }

  // Abertura do modal: auto-seleciona o primeiro ciclo aberto se ainda não tiver selecionado
  const handleOpenDialog = (isOpen: boolean) => {
    if (!isOpen) {
      // Blindagem estrita: nunca fecha o modal pai se o modal de colagem estiver aberto
      // ou se tiver acabado de fechar (tolerância de 500ms para cliques/interações do Radix)
      if (
        pasteModalOpen ||
        isPasteModalOpenRef.current ||
        Date.now() - lastPasteClosedAtRef.current < 500
      ) {
        return
      }
    }
    setOpen(isOpen)
    if (isOpen) {
      // Só inicializa dados se o formulário ainda não estiver preenchido (preserva itens caso haja toggle acidental)
      if (!selectedCicloId && openCiclos.length > 0) {
        const cicloInicial =
          (activeCiclo && openCiclos.find((c) => c.id === activeCiclo.id)) || openCiclos[0]
        if (cicloInicial) {
          setSelectedCicloId(cicloInicial.id)
          setOrderDate(getCicloDataDespachoInput(cicloInicial))
        }
      }
    }
  }

  // Reseta campos do pedido de forma explícita
  const resetOrderForm = () => {
    const cicloInicial =
      openCiclos.length > 0
        ? (activeCiclo && openCiclos.find((c) => c.id === activeCiclo.id)) || openCiclos[0]
        : null
    setSelectedCicloId(cicloInicial?.id || '')
    setSelectedSchool('')
    setOrderDate(getCicloDataDespachoInput(cicloInicial))
    setOrderItems([])
  }

  const handleAddItem = () => {
    const nextProd = availableItemsForChamada.find(
      (p) => !orderItems.some((i) => i.productId === p.productId),
    )
    const pId = nextProd?.productId || availableItemsForChamada[0]?.productId || ''
    setOrderItems((prev) => [
      ...prev,
      {
        productId: pId,
        quantity: 1,
        rawInput: '1,0',
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleItemProductChange = (index: number, newProductId: string) => {
    setOrderItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, productId: newProductId } : item)),
    )
  }

  const handleItemQuantityTyping = (index: number, raw: string) => {
    const normalized = normalizeDecimalTyping(raw)
    const parsed = validateQuantityStepHalf(normalized)
    setOrderItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              rawInput: normalized,
              quantity: parsed.isValid ? parsed.numericValue : 0,
            }
          : item,
      ),
    )
  }

  const handleItemQuantityBlur = (index: number) => {
    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const formatted = formatQuantityOnBlur(item.rawInput ?? String(item.quantity || ''))
        const parsed = validateQuantityStepHalf(formatted)
        return {
          ...item,
          rawInput: formatted,
          quantity: parsed.isValid ? parsed.numericValue : item.quantity,
        }
      }),
    )
  }

  // Importação e extração de texto via OCR a partir de arquivo de imagem (.jpg, .jpeg, .png)
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Limpa o valor do input imediatamente para permitir selecionar a mesma imagem novamente se necessário
    e.target.value = ''

    if (!file) return

    // Validar tipo de arquivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png']
    const isImageExt = /\.(jpe?g|png)$/i.test(file.name)
    if (!validTypes.includes(file.type.toLowerCase()) && !isImageExt) {
      toast.error('Formato inválido. Por favor, selecione um arquivo JPG ou PNG.')
      return
    }

    // Limite razoável de 15MB
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Imagem muito grande. O limite máximo é de 15 MB.')
      return
    }

    setIsExtractingImage(true)
    setExtractionStatusText('Iniciando extração da imagem...')
    setImageExtractError(null)

    try {
      const result = await extractTextFromImage(file, {
        onProgress: (_pct, statusText) => {
          setExtractionStatusText(statusText)
        },
      })

      const extracted = (result.text || '').trim()

      if (!extracted) {
        throw new Error('Nenhum texto pôde ser lido da imagem selecionada.')
      }

      // Coloca o texto extraído na área de texto existente (se já tiver conteúdo, acrescenta ou substitui conforme fluxo)
      setPasteText((prev) => {
        if (!prev.trim()) return extracted
        return `${prev.trim()}\n\n${extracted}`
      })

      // Limpa prévia para forçar o usuário a revisar/editar antes de clicar em Analisar Linhas
      setPastePreview(null)
      setImageExtractError(null)

      toast.success(
        'Texto extraído da imagem com sucesso! Revise o texto na área abaixo antes de analisar.',
      )
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Falha ao processar e extrair o texto da imagem.'
      setImageExtractError(message)
      toast.error(`Falha no OCR: ${message}`)
    } finally {
      setIsExtractingImage(false)
      setExtractionStatusText('')
    }
  }

  // Analisar texto de produtos colado pelo usuário
  const handleProcessPasteText = () => {
    if (!pasteText.trim()) {
      toast.warning('Cole o texto ou comprovante com produtos e quantidades para analisar.')
      return
    }
    const result = parsePastedOrderText(pasteText, availableItemsForChamada)
    setPastePreview(result)

    if (result.matched.length === 0) {
      toast.error('Nenhum produto reconhecido no texto. Verifique os formatos aceitos.')
    } else if (result.unmatched.length > 0) {
      toast.warning(
        `${result.matched.length} produto(s) reconhecido(s), mas ${result.unmatched.length} linha(s) não foram identificadas.`,
      )
    } else {
      toast.success(`${result.matched.length} produto(s) reconhecido(s) com sucesso!`)
    }
  }

  // Confirmar e aplicar produtos colados exclusivamente à lista de itens do pedido (sem gravar nem fechar o Novo Pedido)
  const handleApplyPastedOrderItems = () => {
    if (!pastePreview || pastePreview.matched.length === 0) return

    setOrderItems((current) => {
      const copy = [...current]
      for (const m of pastePreview.matched) {
        const existingIdx = copy.findIndex((it) => it.productId === m.productId)
        if (existingIdx >= 0) {
          const oldQty = Number(copy[existingIdx].quantity) || 0
          const sumQty = oldQty + m.quantity
          copy[existingIdx] = {
            productId: m.productId,
            quantity: sumQty,
            rawInput: formatQuantityOneDecimal(sumQty),
          }
        } else {
          copy.push({
            productId: m.productId,
            quantity: m.quantity,
            rawInput: formatQuantityOneDecimal(m.quantity),
          })
        }
      }
      return copy
    })

    toast.success(
      `${pastePreview.matched.length} produto(s) adicionado(s) à lista do pedido! Complete os dados e clique em "Salvar Pedido".`,
    )
    // Marca timestamp de fechamento para blindar o diálogo pai contra eventos de clique/foco
    lastPasteClosedAtRef.current = Date.now()
    isPasteModalOpenRef.current = false
    setPasteModalOpen(false)
    setPasteText('')
    setPastePreview(null)
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()

    if (openCiclos.length === 0) {
      toast.error('Nenhum ciclo aberto em coleta ou correção — abra um ciclo em Monitoramento.')
      return
    }

    if (!selectedCicloId || !selectedCiclo) {
      toast.error('Selecione o ciclo operacional antes de salvar o pedido.')
      return
    }

    if (!selectedSchool) {
      toast.error('Selecione a escola antes de salvar o pedido.')
      return
    }

    if (orderItems.length === 0) {
      toast.error('Adicione pelo menos um produto ao pedido antes de salvar.')
      return
    }

    // Trava de fase do ciclo
    const faseCiclo = (selectedCiclo.status || 'coletando').toLowerCase()
    if (faseCiclo !== 'coletando' && faseCiclo !== 'correcao') {
      toast.error(
        `O ciclo selecionado está na fase "${formatFaseAmigavel(selectedCiclo.status)}" — pedidos bloqueados.`,
      )
      return
    }

    // Validar múltiplos de 0,5 e quantidade > 0
    const validItems: Array<{ productId: string; quantity: number }> = []
    for (let idx = 0; idx < orderItems.length; idx++) {
      const it = orderItems[idx]
      if (!it.productId) continue
      const raw = it.rawInput ?? String(it.quantity)
      const validRes = validateQuantityStepHalf(raw)
      if (!validRes.isValid || validRes.numericValue <= 0) {
        toast.error(
          validRes.error ||
            `Item #${idx + 1}: informe uma quantidade válida maior que zero e múltiplo de 0,5 (ex: 0,5 / 1,0 / 1,5).`,
        )
        return
      }

      // Validar preço da chamada/catálogo
      const itemCat = availableItemsForChamada.find((p) => p.productId === it.productId)
      const precoItem = itemCat?.preco || 0
      if (precoItem <= 0) {
        const prodNome =
          itemCat?.nome || products.find((p) => p.id === it.productId)?.name || 'Produto'
        toast.warning(`O produto "${prodNome}" não possui preço cadastrado na chamada selecionada.`)
      }

      validItems.push({
        productId: it.productId,
        quantity: validRes.numericValue,
      })
    }

    if (validItems.length === 0) {
      toast.error('Adicione pelo menos um produto com quantidade maior que zero antes de salvar.')
      return
    }

    setIsSubmitting(true)

    // PASSO 5: Gravação: derive contrato_id/rota em segundo plano (escola escolhida nos contratos ativos da chamada)
    const escolaOpcao = availableSchoolsForCiclo.find((e) => e.escolaId === selectedSchool)
    const rotaIdToUse = escolaOpcao?.rotaId

    const success = await addOrder({
      schoolId: selectedSchool,
      date: orderDate,
      cicloId: selectedCiclo.id,
      origem: orderOrigem,
      rotaId: rotaIdToUse,
      items: validItems,
    })

    setIsSubmitting(false)

    if (success) {
      setOpen(false)
      setSelectedSchool('')
      setOrderItems([])
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

  // Helpers para fase do contrato do pedido (obtida do ciclo do pedido)
  const getFaseContratoDoPedido = (order: Order): string => {
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

  // Mapa de telefone das escolas (para lookup rápido e desativação com tooltip)
  const schoolPhonesMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of schools) {
      if (s.contact && s.contact.trim()) {
        map.set(s.id, s.contact.trim())
      }
    }
    return map
  }, [schools])

  const handleSendProtocoloWhatsApp = async (order: Order) => {
    const schoolPhone = schoolPhonesMap.get(order.schoolId)
    if (!schoolPhone) {
      toast.warning(`A escola ${order.schoolName} não possui telefone cadastrado.`)
      return
    }

    if (!order.numero) {
      toast.warning('Este pedido não possui número de protocolo.')
      return
    }

    setSendingWhatsAppId(order.id)
    try {
      const cicloObj = order.cicloId
        ? ciclos.find((c) => c.id === order.cicloId) || activeCiclo
        : activeCiclo

      // Formatar data prevista sem distorção
      let dataPrevistaFormatada: string | undefined
      if (order.date) {
        const dMatch = String(order.date).match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (dMatch) {
          dataPrevistaFormatada = `${dMatch[3]}/${dMatch[2]}/${dMatch[1]}`
        } else {
          dataPrevistaFormatada = new Date(order.date).toLocaleDateString('pt-BR')
        }
      }

      // Preparar itens com nomes e unidades correspondentes do catálogo de produtos
      const produtosMap = new Map(products.map((p) => [p.id, p]))
      const itensFormatados = (order.items || []).map((it) => {
        const prod = produtosMap.get(it.productId)
        return {
          nome: it.name || prod?.name || 'Item',
          quantidade: formatQuantityOneDecimal(it.quantity),
          unidade: prod?.unit || 'un',
        }
      })

      const mensagem = buildProtocoloWhatsAppMessage({
        schoolName: order.schoolName,
        protocolo: order.numero,
        cicloNome: cicloObj?.nome,
        dataEntrega: dataPrevistaFormatada,
        itens: itensFormatados,
        totalValor: order.total,
      })

      const { preview } = await safeOpenWhatsApp({
        phone: schoolPhone,
        text: mensagem,
        recipientName: order.schoolName,
      })

      // Registrar disparo na collection envios_whatsapp (se houver cicloId)
      if (order.cicloId || activeCiclo?.id) {
        try {
          await whatsappService.logEnvio({
            ciclo_id: order.cicloId || activeCiclo!.id,
            escola_id: order.schoolId,
            status: 'enviado',
          })
        } catch (logErr) {
          console.warn('Aviso: não foi possível registrar envio na collection:', logErr)
        }
      }

      if (!preview) {
        toast.success(`Protocolo ${order.numero} enviado via WhatsApp para ${order.schoolName}!`)
      }
    } catch (err: any) {
      console.error('Erro ao enviar protocolo por WhatsApp:', err)
      toast.error('Falha ao gerar link do WhatsApp para envio do protocolo.')
    } finally {
      setSendingWhatsAppId(null)
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
        <Dialog open={open} onOpenChange={handleOpenDialog}>
          <DialogTrigger asChild>
            <Button
              className="gap-2"
              onClick={() => {
                resetOrderForm()
                setOpen(true)
              }}
            >
              <Plus className="h-4 w-4" /> Lançar Pedido
            </Button>
          </DialogTrigger>
          <DialogContent
            className="sm:max-w-[660px] max-h-[90vh] overflow-y-auto"
            onInteractOutside={(e) => {
              if (
                pasteModalOpen ||
                isPasteModalOpenRef.current ||
                Date.now() - lastPasteClosedAtRef.current < 500
              ) {
                e.preventDefault()
              }
            }}
            onPointerDownOutside={(e) => {
              if (
                pasteModalOpen ||
                isPasteModalOpenRef.current ||
                Date.now() - lastPasteClosedAtRef.current < 500
              ) {
                e.preventDefault()
              }
            }}
          >
            <DialogHeader>
              <div className="flex items-center justify-between pr-6 gap-2">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-5 w-5 text-primary" /> Novo Pedido
                </DialogTitle>
                {/* PASSO 2 — Chamada derivada do ciclo com badge no cabeçalho */}
                {selectedChamada && (
                  <Badge
                    variant="outline"
                    className="bg-primary/10 text-primary border-primary/30 text-xs font-semibold shrink-0"
                  >
                    Chamada {selectedChamada.chamada}
                    {selectedChamada.dependencia_administrativa
                      ? ` • ${selectedChamada.dependencia_administrativa}`
                      : ''}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs">
                Selecione o ciclo em andamento e informe a escola e os itens do pedido com base nos
                preços da chamada.
              </DialogDescription>
            </DialogHeader>

            {/* PASSO 1: Alerta âmbar caso não haja ciclos abertos em coleta ou correcao */}
            {openCiclos.length === 0 ? (
              <div className="space-y-4 pt-2">
                <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="text-sm font-semibold">Nenhum ciclo aberto</AlertTitle>
                  <AlertDescription className="text-xs">
                    Nenhum ciclo aberto em coleta ou correção — abra um ciclo em Monitoramento
                  </AlertDescription>
                </Alert>
                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Fechar
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={handleCreateOrder} className="space-y-4 pt-2">
                {/* PASSO 1 — Seletor de Ciclo (Driver do Modal) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ord-ciclo" className="text-xs font-semibold">
                      Ciclo Operacional <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={selectedCicloId}
                      onValueChange={(val) => {
                        setSelectedCicloId(val)
                        const novoCiclo = ciclos.find((c) => c.id === val)
                        if (novoCiclo) {
                          setOrderDate(getCicloDataDespachoInput(novoCiclo))
                        }
                      }}
                      required
                    >
                      <SelectTrigger id="ord-ciclo" className="text-xs">
                        <SelectValue placeholder="Selecione o Ciclo" />
                      </SelectTrigger>
                      <SelectContent>
                        {openCiclos.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {formatCicloOptionLabel(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ord-origem" className="text-xs font-semibold">
                      Canal de Origem
                    </Label>
                    <Select
                      value={orderOrigem}
                      onValueChange={(v) => setOrderOrigem(v as 'whatsapp' | 'manual')}
                    >
                      <SelectTrigger id="ord-origem" className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp" className="text-xs">
                          Mensagem WhatsApp (Individual)
                        </SelectItem>
                        <SelectItem value="manual" className="text-xs">
                          Lançamento Interno / Manual
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* PASSO 3 — Seletor de Escola (desduplicada por id dos contratos ativos da chamada) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ord-escola" className="text-xs font-semibold">
                      Escola / Instituição <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={selectedSchool}
                      onValueChange={setSelectedSchool}
                      disabled={!selectedCicloId || availableSchoolsForCiclo.length === 0}
                      required
                    >
                      <SelectTrigger id="ord-escola" className="text-xs">
                        <SelectValue
                          placeholder={
                            !selectedCicloId
                              ? 'Selecione o ciclo primeiro'
                              : availableSchoolsForCiclo.length === 0
                                ? 'Nenhuma escola vinculada à chamada'
                                : 'Selecione a escola'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSchoolsForCiclo.map((esc) => (
                          <SelectItem key={esc.escolaId} value={esc.escolaId} className="text-xs">
                            {esc.nome}
                            {esc.inep ? ` (INEP ${esc.inep})` : ''} • {esc.rotaNome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedCicloId && availableSchoolsForCiclo.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Não há contratos ativos com escolas vinculadas a esta chamada.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ord-date" className="text-xs font-semibold">
                      Data Prevista de Entrega
                    </Label>
                    <div className="relative">
                      <CalIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="date"
                        id="ord-date"
                        className="pl-9 h-9 text-xs"
                        value={orderDate}
                        onChange={(e) => setOrderDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* PASSO 4 — Itens e Quantidades vindos da Chamada (múltiplos de 0,5) */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-semibold text-xs">Itens e Quantidades</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Preços soberanos da chamada. Aceita múltiplos de 0,5 (ex: 0,5 / 1,0 / 1,5 /
                        2,0).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setPasteText('')
                          setPastePreview(null)
                          isPasteModalOpenRef.current = true
                          setPasteModalOpen(true)
                        }}
                        disabled={!selectedCicloId || availableItemsForChamada.length === 0}
                        className="h-7 text-xs gap-1 text-primary border border-primary/20 hover:bg-primary/10"
                        title="Colar produtos do comprovante/planilha para adicionar à lista"
                      >
                        <ClipboardPaste className="h-3.5 w-3.5" /> Colar Produtos
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddItem}
                        disabled={!selectedCicloId || availableItemsForChamada.length === 0}
                        className="h-7 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Produto
                      </Button>
                    </div>
                  </div>

                  {orderItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      Nenhum item adicionado. Clique em &quot;Adicionar Produto&quot; para incluir
                      os itens do pedido.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {orderItems.map((item, idx) => {
                        const catItem = availableItemsForChamada.find(
                          (p) => p.productId === item.productId,
                        )
                        const itemPreco = catItem?.preco ?? 0
                        const itemSubtotal = itemPreco * (Number(item.quantity) || 0)
                        const valRes = item.rawInput
                          ? validateQuantityStepHalf(item.rawInput)
                          : { isValid: true, error: null }
                        const hasError = !valRes.isValid

                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                              hasError ? 'border-destructive/60 bg-destructive/5' : 'bg-muted/20'
                            }`}
                          >
                            <div className="flex-1">
                              <Select
                                value={item.productId}
                                onValueChange={(val) => handleItemProductChange(idx, val)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Selecione o produto" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableItemsForChamada.map((p) => (
                                    <SelectItem
                                      key={p.productId}
                                      value={p.productId}
                                      className="text-xs"
                                    >
                                      {p.nome} — R$ {p.preco.toFixed(2)} / {p.unidade}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="w-24">
                              <Input
                                type="text"
                                inputMode="decimal"
                                className={`h-8 text-xs font-mono text-center ${
                                  hasError ? 'border-destructive ring-destructive/30' : ''
                                }`}
                                placeholder="0,5"
                                value={item.rawInput ?? formatQuantityOneDecimal(item.quantity)}
                                onChange={(e) => handleItemQuantityTyping(idx, e.target.value)}
                                onBlur={() => handleItemQuantityBlur(idx)}
                                title={valRes.error || 'Quantidade em múltiplos de 0,5'}
                              />
                            </div>
                            <span className="text-[11px] text-muted-foreground w-10 shrink-0">
                              {catItem?.unidade || 'un'}
                            </span>
                            <div className="w-24 text-right font-mono font-medium text-foreground shrink-0">
                              R$ {itemSubtotal.toFixed(2)}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                              onClick={() => handleRemoveItem(idx)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <span className="font-semibold text-xs">Valor Total Calculado:</span>
                    <span className="text-base font-bold text-primary font-mono">
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
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Modal "Colar Produtos" — declarado como irmão de nível raiz para evitar interferência Radix */}
      <Dialog
        open={pasteModalOpen}
        onOpenChange={(openNext) => {
          if (!openNext) {
            lastPasteClosedAtRef.current = Date.now()
            isPasteModalOpenRef.current = false
          } else {
            isPasteModalOpenRef.current = true
          }
          setPasteModalOpen(openNext)
        }}
      >
        <DialogContent
          className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onPointerDownOutside={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            lastPasteClosedAtRef.current = Date.now()
            isPasteModalOpenRef.current = false
            setPasteModalOpen(false)
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardPaste className="h-5 w-5 text-primary" /> Colar Produtos do Pedido
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cole produtos e quantidades ou o <strong>Comprovante de Pedido</strong> gerado pelo
              formulário para adicionar à lista do pedido em criação. Aceita tabulação (planilha),
              vírgula, ponto-e-vírgula, &quot;5x Produto&quot;, lista com marcadores (&quot;•&quot;)
              e sufixo Kg. A colagem apenas popula a lista com fusão de quantidades repetidas — a
              gravação do pedido ocorre exclusivamente pelo botão &quot;Salvar Pedido&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="paste-order-text" className="text-xs font-semibold">
                  Texto de Produtos ou Comprovante Completo
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  Ex: Comprovante com &quot; • AIPIM: 1,0 Kg&quot; ou &quot;Arroz 5&quot;
                </span>
              </div>
              <Textarea
                id="paste-order-text"
                rows={6}
                placeholder={`Cole aqui o comprovante de pedido completo ou linhas como:\n • AIPIM: 1,0 Kg\n • CENOURA: 100,0 Kg\nou no formato planilha:\nArroz Tipo 1\t5\nFeijão Carioca\t2,5`}
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value)
                  setPastePreview(null)
                }}
                disabled={isExtractingImage}
                className="font-mono text-xs resize-y"
              />
            </div>

            {/* Input de arquivo de imagem oculto para acionamento pelo botão */}
            <input
              type="file"
              ref={imageInputRef}
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              className="hidden"
              onChange={handleImageFileChange}
              disabled={isExtractingImage}
            />

            {/* Alerta de status ou erro de extração de imagem */}
            {isExtractingImage && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/30 bg-primary/5 text-xs text-primary">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span className="font-medium">
                  {extractionStatusText || 'Extraindo texto da imagem...'}
                </span>
              </div>
            )}

            {imageExtractError && !isExtractingImage && (
              <Alert className="border-destructive/50 bg-destructive/10 text-destructive text-xs py-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <AlertTitle className="text-xs font-semibold">Falha na Extração OCR</AlertTitle>
                <AlertDescription className="text-xs mt-0.5">
                  {imageExtractError} O texto atual da área de colagem foi mantido intacto.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => imageInputRef.current?.click()}
                disabled={isExtractingImage}
                className="text-xs border-dashed"
                title="Selecionar imagem JPG ou PNG para extração literal do texto via OCR"
              >
                {isExtractingImage ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-primary" />
                    Processando imagem...
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    Importar imagem
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleProcessPasteText}
                disabled={!pasteText.trim() || isExtractingImage}
                className="text-xs"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Analisar Linhas
              </Button>
            </div>

            {/* Prévia dos itens interpretados */}
            {pastePreview && (
              <div className="space-y-3 pt-2 border-t">
                {/* Informações detectadas do comprovante se houver */}
                {pastePreview.metadata?.isComprovante && (
                  <div className="p-2.5 rounded-lg border bg-primary/5 text-xs space-y-1">
                    <div className="font-semibold text-primary flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Comprovante de Pedido Identificado
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-muted-foreground pt-0.5">
                      {pastePreview.metadata.protocolo && (
                        <div>
                          <span className="font-medium text-foreground">Protocolo:</span>{' '}
                          {pastePreview.metadata.protocolo}
                        </div>
                      )}
                      {pastePreview.metadata.escolaNome && (
                        <div>
                          <span className="font-medium text-foreground">Escola:</span>{' '}
                          {pastePreview.metadata.escolaNome}
                        </div>
                      )}
                      {pastePreview.metadata.cicloTexto && (
                        <div>
                          <span className="font-medium text-foreground">Ciclo:</span>{' '}
                          {pastePreview.metadata.cicloTexto}
                        </div>
                      )}
                      {pastePreview.metadata.previsaoEntrega && (
                        <div>
                          <span className="font-medium text-foreground">Previsão:</span>{' '}
                          {pastePreview.metadata.previsaoEntrega}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    Prévia dos Itens Reconhecidos:
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-emerald-700 bg-emerald-50 text-[11px]">
                      {pastePreview.matched.length} identificado(s)
                    </Badge>
                    {pastePreview.unmatched.length > 0 && (
                      <Badge
                        variant="outline"
                        className="text-destructive bg-destructive/10 text-[11px]"
                      >
                        {pastePreview.unmatched.length} não localizado(s)
                      </Badge>
                    )}
                  </div>
                </div>

                {pastePreview.matched.length > 0 ? (
                  <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
                    {pastePreview.matched.map((m) => (
                      <div
                        key={m.productId}
                        className="flex items-center justify-between p-2 rounded-lg border bg-muted/20 text-xs"
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="font-medium text-foreground truncate">
                            {m.productName}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {m.matchedVia} • R$ {m.unitPrice.toFixed(2)} / {m.unidade}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-semibold text-primary">
                            {formatQuantityOneDecimal(m.quantity)} {m.unidade}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            R$ {m.subtotal.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Nenhum item do catálogo desta chamada foi identificado no texto colado.
                  </div>
                )}

                {/* Linhas não casadas */}
                {pastePreview.unmatched.length > 0 && (
                  <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertTitle className="text-xs font-semibold">
                      Linhas não reconhecidas ({pastePreview.unmatched.length}):
                    </AlertTitle>
                    <AlertDescription className="text-xs mt-1 space-y-1 max-h-[120px] overflow-y-auto">
                      {pastePreview.unmatched.map((un, uIdx) => (
                        <div
                          key={uIdx}
                          className="font-mono text-[11px] border-b border-amber-500/20 pb-0.5 last:border-b-0"
                        >
                          <span className="font-semibold text-destructive">L{un.lineNumber}:</span>{' '}
                          &quot;{un.line}&quot; —{' '}
                          <span className="text-muted-foreground italic">{un.reason}</span>
                        </div>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}

                {pastePreview.matched.length > 0 && (
                  <div className="flex justify-between items-center p-2.5 bg-primary/5 rounded-lg border border-primary/20">
                    <span className="text-xs font-semibold">Subtotal dos Itens a Importar:</span>
                    <span className="text-sm font-bold text-primary font-mono">
                      R${' '}
                      {pastePreview.totalCalculated.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                lastPasteClosedAtRef.current = Date.now()
                isPasteModalOpenRef.current = false
                setPasteModalOpen(false)
                setPasteText('')
                setPastePreview(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApplyPastedOrderItems}
              disabled={!pastePreview || pastePreview.matched.length === 0}
            >
              Adicionar Produtos à Lista{' '}
              {pastePreview?.matched.length ? `(${pastePreview?.matched.length || 0})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                        {(() => {
                          const m = String(order.date || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
                          if (m) {
                            return `${m[3]}/${m[2]}/${m[1]}`
                          }
                          return new Date(order.date).toLocaleDateString('pt-BR')
                        })()}
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
                          {/* Botão Enviar protocolo por WhatsApp */}
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-green-700 hover:text-green-800 hover:bg-green-50 dark:text-green-400"
                                    title={
                                      schoolPhonesMap.get(order.schoolId)
                                        ? 'Enviar protocolo por WhatsApp'
                                        : undefined
                                    }
                                    disabled={
                                      !order.numero ||
                                      !schoolPhonesMap.get(order.schoolId) ||
                                      sendingWhatsAppId === order.id
                                    }
                                    onClick={() => handleSendProtocoloWhatsApp(order)}
                                  >
                                    {sendingWhatsAppId === order.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Send className="h-4 w-4" />
                                    )}
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-[220px] text-xs">
                                {!order.numero
                                  ? 'Este pedido não possui número de protocolo.'
                                  : !schoolPhonesMap.get(order.schoolId)
                                    ? `A escola ${order.schoolName} não possui telefone cadastrado. Cadastre em Escolas para habilitar o envio.`
                                    : 'Enviar protocolo por WhatsApp'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

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
                    const prodObj = products.find((p) => p.id === it.productId)
                    const unitStr = prodObj?.unit || 'un'
                    return (
                      <div key={idx} className="flex justify-between p-2">
                        <span>{it.name}</span>
                        <span className="font-mono">
                          {formatQuantityOneDecimal(it.quantity)} {unitStr} × R${' '}
                          {itPreco.toFixed(2)} = R$ {itSubtotal.toFixed(2)}
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

              {/* Envio do protocolo por WhatsApp */}
              {(() => {
                const phone = viewingOrder.schoolId
                  ? schoolPhonesMap.get(viewingOrder.schoolId)
                  : undefined
                const canSend = Boolean(viewingOrder.numero && phone)
                const tooltipText = !viewingOrder.numero
                  ? 'Este pedido não possui número de protocolo.'
                  : !phone
                    ? `A escola ${viewingOrder.schoolName} não possui telefone cadastrado. Cadastre em Escolas para habilitar o envio.`
                    : 'Enviar protocolo por WhatsApp'
                return (
                  <div className="pt-2 border-t">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex w-full">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full gap-2 text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950"
                              disabled={!canSend || sendingWhatsAppId === viewingOrder.id}
                              onClick={() => handleSendProtocoloWhatsApp(viewingOrder)}
                            >
                              {sendingWhatsAppId === viewingOrder.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" /> Preparando link...
                                </>
                              ) : (
                                <>
                                  <Send className="h-4 w-4" /> Enviar protocolo por WhatsApp
                                </>
                              )}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!canSend && (
                          <TooltipContent className="max-w-[240px] text-xs">
                            {tooltipText}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                    {!canSend && phone === undefined && viewingOrder.numero && (
                      <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
                        {tooltipText}
                      </p>
                    )}
                  </div>
                )
              })()}
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
                  <span className="text-muted-foreground">Fase do Contrato:</span>
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
