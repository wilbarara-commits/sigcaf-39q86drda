import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  PhoneCall,
  Navigation,
  MapPin,
  ListOrdered,
  ChevronDown,
  ChevronRight,
  Share2,
  Users,
  Camera,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { RouteMapView } from '@/components/RouteMapView'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { matchPastedSchoolLine } from '@/lib/excelImporter'
import { RouteSchoolBatchImportModal } from '@/components/RouteSchoolBatchImportModal'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  getCicloAtivo,
  formatFaseAmigavel,
  isCicloTerminal,
  isCicloNaoTerminal,
  extractCicloCodigo,
} from '@/lib/cicloUtils'
import { Calendar } from 'lucide-react'
import {
  otimizarSequenciaParadas,
  extrairCoordenadas,
  resolverDepositoCentral,
  type ParadaOtimizavel,
  type ResultadoOtimizacaoRota,
} from '@/lib/routeOptimization'
import { RouteOptimizationDialog } from '@/components/RouteOptimizationDialog'
import { MotoristasManagerDialog } from '@/components/MotoristasManagerDialog'
import { DespachoMotoristaModal } from '@/components/DespachoMotoristaModal'
import { motoristasService } from '@/services/motoristas'
import { rotaDespachosService, entregaRegistrosService } from '@/services/rota-despachos'
import { retencaoHistoricaService } from '@/services/retencao-historica'
import {
  MOTIVOS_LOGISTICOS_CANCELAMENTO,
  type MotivoLogisticoCancelamento,
  type Order,
  type RotaLogisticaRecord,
  type MotoristaRecord,
  type RotaDespachoRecord,
  type EntregaRegistroRecord,
  type EntregaComprovanteRecord,
  type RotaSnapshotRecord,
} from '@/lib/types'
import { DeliveryDetailsDialog, type DeliveryDetailsData } from '@/components/DeliveryDetailsDialog'

/**
 * Verifica se a fase do contrato no ciclo é elegível para despacho de rota.
 * Janela correta: 'coleta_encerrada', 'coletado' ou 'coleta encerrada'.
 * Normalização tolerante a espaços, underscores e acentos.
 */
export function isFaseElegivelParaDespacho(fase?: string): boolean {
  if (!fase) return false
  const norm = fase
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
  return norm === 'coleta_encerrada' || norm === 'coletado'
}

// DeliveryRoutes 0.0.202
export default function DeliveryRoutes() {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramChamadaId = searchParams.get('chamadaId')
  const paramContratoId = searchParams.get('contratoId')
  const paramCicloId = searchParams.get('cicloId')

  const {
    chamadas,
    contracts,
    contractSchools,
    orders,
    schools,
    ciclos,
    activeCiclo,
    cicloCorrente,
    rotasLogisticas,
    paradasRota,
    despachos,
    criarRotaLogistica,
    atualizarRotaLogistica,
    atualizarPosicaoCaminhaoRota,
    escolasComEntregaDuplicadaMap,
    excluirRotaLogistica,
    sincronizarEscolasRotaLogistica,
    despacharRotaInteira,
    confirmarEntregaRotaInteira,
    marcarNaoEntreguePedido,
    atribuirPedidosARotaLogistica,
    salvarSequenciamentoParadas,
    moverEscolaEntreRotas,
    updateOrderStatus,
    refreshData,
    getEntregaRegistrosDaRota,
    config,
  } = useApp()
  const { user, isAdmin, isMaster } = useAuth()
  const canEditRoutes = isAdmin || isMaster

  // Selecionar primariamente a CHAMADA (ou se não houver chamadas, cai para todos ou contratos)
  // Precedência de seleção:
  // 1. Query params URL (?chamadaId= ou ?cicloId= ou ?contratoId=)
  // 2. cicloCorrente se existir no banco (sua chamada correspondente)
  // 3. Fallback atual (primeira chamada ou 'todas')
  const initialChamadaId = useMemo(() => {
    if (paramChamadaId) return paramChamadaId
    if (paramCicloId) {
      const cicloParam = ciclos.find((c) => c.id === paramCicloId)
      if (cicloParam?.chamada_id) return cicloParam.chamada_id
    }
    if (paramContratoId) {
      const cnt = contracts.find((c) => c.id === paramContratoId)
      if (cnt?.chamada_id) return cnt.chamada_id
    }
    if (cicloCorrente?.chamadaId) {
      const existsChamada = chamadas.some((ch) => ch.id === cicloCorrente.chamadaId)
      if (existsChamada) return cicloCorrente.chamadaId
    }
    if (cicloCorrente?.cicloId) {
      const cicloObj = ciclos.find((c) => c.id === cicloCorrente.cicloId)
      if (cicloObj?.chamada_id) return cicloObj.chamada_id
    }
    return chamadas[0]?.id || 'todas'
  }, [paramChamadaId, paramCicloId, paramContratoId, contracts, chamadas, cicloCorrente, ciclos])

  const [selectedChamadaId, setSelectedChamadaId] = useState<string>(initialChamadaId)
  const [selectedCicloId, setSelectedCicloId] = useState<string>('')

  // Sincronizar se os query params ou cicloCorrente mudarem
  useEffect(() => {
    if (paramChamadaId) {
      setSelectedChamadaId(paramChamadaId)
      return
    }
    if (paramCicloId) {
      const cicloParam = ciclos.find((c) => c.id === paramCicloId)
      if (cicloParam?.chamada_id) {
        setSelectedChamadaId(cicloParam.chamada_id)
        return
      }
    }
    if (paramContratoId) {
      const cnt = contracts.find((c) => c.id === paramContratoId)
      if (cnt?.chamada_id) {
        setSelectedChamadaId(cnt.chamada_id)
        return
      }
    }
    if (cicloCorrente?.chamadaId) {
      const existsChamada = chamadas.some((ch) => ch.id === cicloCorrente.chamadaId)
      if (existsChamada) {
        setSelectedChamadaId(cicloCorrente.chamadaId)
        return
      }
    }
    if (cicloCorrente?.cicloId) {
      const cicloObj = ciclos.find((c) => c.id === cicloCorrente.cicloId)
      if (cicloObj?.chamada_id) {
        setSelectedChamadaId(cicloObj.chamada_id)
      }
    }
  }, [paramChamadaId, paramCicloId, paramContratoId, contracts, cicloCorrente, ciclos, chamadas])

  // Ciclos disponíveis da Chamada selecionada (ordenados do mais recente para o mais antigo)
  const chamadaCiclos = useMemo(() => {
    if (selectedChamadaId === 'todas') {
      return [...ciclos].sort((a, b) => {
        const tA = new Date(a.created || a.data_inicio).getTime()
        const tB = new Date(b.created || b.data_inicio).getTime()
        return tB - tA
      })
    }
    return ciclos
      .filter((c) => c.chamada_id === selectedChamadaId)
      .sort((a, b) => {
        const tA = new Date(a.created || a.data_inicio).getTime()
        const tB = new Date(b.created || b.data_inicio).getTime()
        return tB - tA
      })
  }, [ciclos, selectedChamadaId])

  // Resolução e sincronização do Ciclo selecionado com a mesma precedência de /monitoramento:
  // 1. Query param ?cicloId= (se pertencer à chamada selecionada ou geral)
  // 2. cicloCorrente se pertencer à chamada selecionada
  // 3. Ciclo ativo (não-terminal) da chamada selecionada
  // 4. Fallback: ciclo mais recente da chamada (mesmo fechado)
  useEffect(() => {
    // 1. Query param direto
    if (paramCicloId) {
      const targetParam = chamadaCiclos.find((c) => c.id === paramCicloId)
      if (targetParam) {
        setSelectedCicloId(targetParam.id)
        return
      }
    }

    // 2. Se a seleção atual já pertence aos ciclos da chamada em foco, mantém
    if (selectedCicloId && chamadaCiclos.some((c) => c.id === selectedCicloId)) {
      return
    }

    // 3. Ciclo Corrente (se pertencer à chamada selecionada)
    if (cicloCorrente?.cicloId) {
      const targetCorrente = chamadaCiclos.find((c) => c.id === cicloCorrente.cicloId)
      if (targetCorrente) {
        setSelectedCicloId(targetCorrente.id)
        return
      }
    }

    // 4. Ciclo ativo (não-terminal) da chamada
    const ativoChamada = chamadaCiclos.find((c) => isCicloNaoTerminal(c.status))
    if (ativoChamada) {
      setSelectedCicloId(ativoChamada.id)
      return
    }

    // 5. Fallback: ciclo mais recente da chamada
    if (chamadaCiclos.length > 0) {
      setSelectedCicloId(chamadaCiclos[0].id)
      return
    }

    setSelectedCicloId('')
  }, [selectedChamadaId, chamadaCiclos, paramCicloId, cicloCorrente, selectedCicloId])

  // Objeto do ciclo selecionado em foco
  const selectedCiclo = useMemo(() => {
    return (
      chamadaCiclos.find((c) => c.id === selectedCicloId) ||
      (selectedChamadaId !== 'todas' ? getCicloAtivo(ciclos, selectedChamadaId) : null) ||
      activeCiclo ||
      chamadaCiclos[0] ||
      null
    )
  }, [chamadaCiclos, selectedCicloId, selectedChamadaId, ciclos, activeCiclo])

  // Chamada atualmente focada
  const currentChamada = useMemo(() => {
    if (selectedChamadaId === 'todas') return null
    return chamadas.find((ch) => ch.id === selectedChamadaId) || null
  }, [chamadas, selectedChamadaId])

  // Contratos vinculados à chamada selecionada (ou todos se 'todas')
  const chamadaContratos = useMemo(() => {
    if (!currentChamada) return contracts
    return contracts.filter((c) => c.chamada_id === currentChamada.id)
  }, [contracts, currentChamada])

  // Catálogo unificado de escolas da Chamada: agrega escolas de TODOS os contratos vinculados a esta chamada
  const unifiedChamadaSchools = useMemo(() => {
    // Mapa escolaId -> { escolaId, escolaNome, escolaEndereco, escolaAlunos, contratoId, contratoNumero }
    const map = new Map<
      string,
      {
        escolaId: string
        escolaNome: string
        escolaEndereco: string
        escolaTelefone?: string
        escolaAlunos?: number
        contratoId: string
        contratoNumero: string
      }
    >()

    chamadaContratos.forEach((cnt) => {
      cnt.escolas.forEach((esc) => {
        if (!map.has(esc.escolaId)) {
          map.set(esc.escolaId, {
            escolaId: esc.escolaId,
            escolaNome: esc.escolaNome || 'Escola',
            escolaEndereco: esc.escolaEndereco || '',
            escolaTelefone: esc.escolaTelefone,
            escolaAlunos: esc.escolaAlunos,
            contratoId: cnt.id,
            contratoNumero: cnt.numero,
          })
        }
      })
    })

    return Array.from(map.values())
  }, [chamadaContratos])

  // Mapa rápido de escolaId -> Contrato de Origem (para exibir badges em paradas e pedidos)
  const escolaContratoOrigemMap = useMemo(() => {
    const map = new Map<string, { contratoId: string; contratoNumero: string }>()
    contracts.forEach((cnt) => {
      cnt.escolas.forEach((esc) => {
        if (!map.has(esc.escolaId)) {
          map.set(esc.escolaId, { contratoId: cnt.id, contratoNumero: cnt.numero })
        }
      })
    })
    return map
  }, [contracts])

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

  // Estado para gestão de motoristas e despacho com token/whatsapp
  const [motoristasManagerOpen, setMotoristasManagerOpen] = useState(false)
  const [despachoMotoristaOpen, setDespachoMotoristaOpen] = useState(false)
  const [selectedRotaForDriverModal, setSelectedRotaForDriverModal] =
    useState<RotaLogisticaRecord | null>(null)
  const [motoristasList, setMotoristasList] = useState<MotoristaRecord[]>([])
  const [despachosAtivosMap, setDespachosAtivosMap] = useState<Record<string, RotaDespachoRecord>>(
    {},
  )
  const [registrosEntregasMap, setRegistrosEntregasMap] = useState<
    Record<string, EntregaRegistroRecord[]>
  >({})
  // Mapa de comprovantes permanentes por rotaId: Record<rotaId, EntregaComprovanteRecord[]>
  // Lidos do banco (entrega_comprovantes) estritamente filtrados pelo ciclo selecionado (isolamento por ciclo)
  const [comprovantesEntregasMap, setComprovantesEntregasMap] = useState<
    Record<string, EntregaComprovanteRecord[]>
  >({})
  const [visualizandoAssinaturaUrl, setVisualizandoAssinaturaUrl] = useState<string | null>(null)
  const [visualizandoFotoUrl, setVisualizandoFotoUrl] = useState<string | null>(null)

  // Estado para o modal "Dados da Entrega"
  const [deliveryDetailsOpen, setDeliveryDetailsOpen] = useState(false)
  const [selectedDeliveryDetails, setSelectedDeliveryDetails] =
    useState<DeliveryDetailsData | null>(null)

  // Mapa de snapshots do ciclo selecionado por rotaId (rota_snapshots)
  // Permite exibir a composição e ordem das paradas estritamente daquele ciclo
  const [cicloSnapshotsMap, setCicloSnapshotsMap] = useState<Map<string, RotaSnapshotRecord>>(
    new Map(),
  )

  // Carregar lista de motoristas, despachos ativos, comprovantes/registros e snapshots do ciclo selecionado
  const carregarMotoristasEDespachos = async () => {
    try {
      const motList = await motoristasService.getAll()
      setMotoristasList(motList)

      const mapDesp: Record<string, RotaDespachoRecord> = {}
      const mapRegs: Record<string, EntregaRegistroRecord[]> = {}
      const mapComps: Record<string, EntregaComprovanteRecord[]> = {}
      const cicloFiltroId = selectedCiclo?.id

      // 1. Carregar comprovantes permanentes de retenção (entrega_comprovantes) e snapshots do ciclo selecionado
      if (cicloFiltroId) {
        try {
          const compsCiclo = await retencaoHistoricaService.getComprovantesByCiclo(cicloFiltroId)
          compsCiclo.forEach((c) => {
            if (c.rota_id) {
              if (!mapComps[c.rota_id]) mapComps[c.rota_id] = []
              mapComps[c.rota_id].push(c)
            }
          })
        } catch (errComp) {
          console.warn('Erro ao carregar comprovantes do ciclo:', errComp)
        }

        try {
          const snapsMap = await retencaoHistoricaService.getSnapshotsByCiclo(cicloFiltroId)
          setCicloSnapshotsMap(snapsMap)
        } catch (errSnap) {
          console.warn('Erro ao carregar snapshots do ciclo:', errSnap)
        }
      } else {
        setCicloSnapshotsMap(new Map())
      }

      for (const r of rotasLogisticas) {
        const desp = await rotaDespachosService.getAtivoByRota(r.id, cicloFiltroId)
        if (desp) {
          mapDesp[r.id] = desp
        }
        // Se há ciclo selecionado, passa cicloFiltroId. Se não houver ciclo selecionado,
        // não traz registros de outros ciclos (isolamento por ciclo)
        if (cicloFiltroId) {
          const regs = await entregaRegistrosService.getByRota(r.id, cicloFiltroId)
          if (regs.length > 0) {
            mapRegs[r.id] = regs
          }
        }
      }
      setDespachosAtivosMap(mapDesp)
      setRegistrosEntregasMap(mapRegs)
      setComprovantesEntregasMap(mapComps)
    } catch (e) {
      console.warn('Erro ao carregar dados de motoristas/despachos/comprovantes:', e)
    }
  }

  useEffect(() => {
    carregarMotoristasEDespachos()
  }, [rotasLogisticas, selectedCiclo?.id])

  // Subscrição em tempo real na coleção rota_despachos:
  // quando um despacho é desativado (ativo=false) ou excluído, remove rotaId do despachosAtivosMap
  // e atualiza os dados em tempo real se alterado por outra sessão
  useEffect(() => {
    const unsub = rotaDespachosService.subscribe(({ action, record }) => {
      const rotaId = record.rota_id
      if (!rotaId) return

      if (action === 'delete' || !record.ativo) {
        setDespachosAtivosMap((prev) => {
          if (!prev[rotaId]) return prev
          const next = { ...prev }
          delete next[rotaId]
          return next
        })
        refreshData().catch(() => {})
      } else if (record.ativo) {
        setDespachosAtivosMap((prev) => ({
          ...prev,
          [rotaId]: record,
        }))
        refreshData().catch(() => {})
      }
    })

    return () => {
      unsub()
    }
  }, [refreshData])

  // Estado para confirmação de despacho da rota inteira
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false)
  const [rotaToDispatch, setRotaToDispatch] = useState<RotaLogisticaRecord | null>(null)
  const [isDispatching, setIsDispatching] = useState(false)

  // Estado para confirmação de rota entregue (rota inteira)
  const [deliverWholeRouteOpen, setDeliverWholeRouteOpen] = useState(false)
  const [rotaToDeliver, setRotaToDeliver] = useState<RotaLogisticaRecord | null>(null)
  const [observacaoEntregaRota, setObservacaoEntregaRota] = useState('')
  const [isDeliveringWholeRoute, setIsDeliveringWholeRoute] = useState(false)

  // Estado para cancelamento por "Não entregue" após despacho (motivo logístico fixo)
  const [undeliveredDialogOpen, setUndeliveredDialogOpen] = useState(false)
  const [orderForUndelivered, setOrderForUndelivered] = useState<Order | null>(null)
  const [selectedMotivoLogistico, setSelectedMotivoLogistico] =
    useState<MotivoLogisticoCancelamento>(MOTIVOS_LOGISTICOS_CANCELAMENTO[0])
  const [detalheMotivoLogistico, setDetalheMotivoLogistico] = useState('')
  const [isProcessingUndelivered, setIsProcessingUndelivered] = useState(false)

  // Estado de Drag and Drop para movimentação entre rotas e sequenciamento de paradas
  const [draggedEscolaId, setDraggedEscolaId] = useState<string | null>(null)
  const [draggedSourceRotaId, setDraggedSourceRotaId] = useState<string | null>(null)
  const [dragOverRotaId, setDragOverRotaId] = useState<string | null>(null)
  const [dragOverEscolaId, setDragOverEscolaId] = useState<string | null>(null)
  const [isMovingSchool, setIsMovingSchool] = useState(false)

  // Estado para modal/diálogo mobile de mover escola para outra rota
  const [mobileMoveDialogOpen, setMobileMoveDialogOpen] = useState(false)
  const [schoolToMoveMobile, setSchoolToMoveMobile] = useState<{
    escolaId: string
    escolaNome: string
    origemRotaId: string
    origemRotaNome: string
  } | null>(null)
  const [targetRotaIdMobile, setTargetRotaIdMobile] = useState<string>('')

  // Estado de modo de visualização por rota: 'lista' | 'mapa' | 'ambos' (mapa persistido por rotaId)
  const [routeViewModeMap, setRouteViewModeMap] = useState<
    Record<string, 'ambos' | 'mapa' | 'lista'>
  >({})

  // Estado de expansão dos pedidos de cada escola na Sequência de Paradas
  // Chave: `${item.rota.id}:${parada.escolaId}` (ou apenas parada.escolaId)
  // Padrão: tudo fechado (Set vazio)
  const [expandedParadasPedidos, setExpandedParadasPedidos] = useState<Set<string>>(() => new Set())

  const toggleParadaPedidos = (key: string) => {
    setExpandedParadasPedidos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Estado para controle de salvamento de posição do caminhão por rota
  const [updatingTruckRotaId, setUpdatingTruckRotaId] = useState<string | null>(null)

  // Atualizar a posição do caminhão manual para uma rota
  const handleChangeCaminhaoPosicao = async (
    rotaId: string,
    escolaIdOuNenhuma: string,
    paradas: Array<{ escolaId: string; ordem: number }>,
  ) => {
    if (!canEditRoutes) {
      toast.error('Você não tem permissão para alterar a posição do caminhão.')
      return
    }

    setUpdatingTruckRotaId(rotaId)
    try {
      if (!escolaIdOuNenhuma || escolaIdOuNenhuma === 'nenhuma') {
        const ok = await atualizarPosicaoCaminhaoRota(rotaId, null, null)
        if (ok) {
          toast.success('Pino do caminhão desmarcado.')
        }
      } else {
        const parada = paradas.find((p) => p.escolaId === escolaIdOuNenhuma)
        const ordem = parada ? parada.ordem : null
        const ok = await atualizarPosicaoCaminhaoRota(rotaId, escolaIdOuNenhuma, ordem)
        if (ok) {
          toast.success(
            ordem ? `🚚 Caminhão marcado na Parada #${ordem}!` : 'Posição do caminhão salva!',
          )
        }
      }
    } finally {
      setUpdatingTruckRotaId(null)
    }
  }

  // Estado para sugestão de rota otimizada (cálculo cliente haversine + vizinho mais próximo + 2-opt)
  const [optimizationDialogOpen, setOptimizationDialogOpen] = useState(false)
  const [optimizingRota, setOptimizingRota] = useState<RotaLogisticaRecord | null>(null)
  const [optimizationOriginalParadas, setOptimizationOriginalParadas] = useState<
    ParadaOtimizavel[]
  >([])
  const [optimizationResult, setOptimizationResult] = useState<ResultadoOtimizacaoRota | null>(null)
  const [isApplyingOptimization, setIsApplyingOptimization] = useState(false)

  // Rotas logísticas filtradas pela Chamada (ou contrato legado se houver vínculo direto)
  const filteredRotasLogisticas = useMemo(() => {
    let list = rotasLogisticas
    if (selectedChamadaId !== 'todas') {
      const contratosDaChamadaIds = new Set(chamadaContratos.map((c) => c.id))
      list = list.filter((r) => {
        if (r.chamada_id && r.chamada_id === selectedChamadaId) return true
        if (r.contrato_id && contratosDaChamadaIds.has(r.contrato_id)) return true
        return false
      })
    }

    // Deduplicação defensiva por ID e por Nome normalizado no mesmo escopo
    const seenIds = new Set<string>()
    const seenNames = new Set<string>()
    const dedupedList: RotaLogisticaRecord[] = []

    for (const r of list) {
      if (seenIds.has(r.id)) continue
      seenIds.add(r.id)

      const normName = (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()
      const scopeKey = r.chamada_id || r.contrato_id || 'global'
      const keyName = `${scopeKey}:${normName}`
      if (seenNames.has(keyName)) {
        continue
      }
      seenNames.add(keyName)
      dedupedList.push(r)
    }

    return dedupedList
  }, [rotasLogisticas, selectedChamadaId, chamadaContratos])

  // Pedidos que pertencem à dupla Chamada + Ciclo selecionados
  // Se houver ciclo selecionado (ou ciclo ativo de fallback), filtra estritamente por cicloId
  const chamadaCicloOrders = useMemo(() => {
    let pool = orders
    if (currentChamada) {
      const schoolIds = new Set(unifiedChamadaSchools.map((e) => e.escolaId))
      pool = pool.filter((o) => schoolIds.has(o.schoolId))
    }
    if (selectedCiclo?.id) {
      pool = pool.filter((o) => o.cicloId === selectedCiclo.id)
    }
    return pool
  }, [orders, currentChamada, unifiedChamadaSchools, selectedCiclo])

  // Compatibilidade legada com referências de pedidos da chamada
  const chamadaOrders = chamadaCicloOrders

  // Detalhes completos por rota logística (respeitando a dupla Chamada + Ciclo)
  // Ordem de paradas e composição isoladas por ciclo: se o ciclo selecionado possui snapshot gravado
  // (fechamento, despacho ou edicao), a ordem e as escolas exibidas vêm do snapshot histórico daquele ciclo.
  // Caso contrário, usa paradas_rota como default/referência para o ciclo corrente/novo.
  const rotasLogisticasDetalhes = useMemo(() => {
    return filteredRotasLogisticas.map((rota) => {
      const chamadaObj = chamadas.find((ch) => ch.id === rota.chamada_id)
      const contrato = contracts.find((c) => c.id === rota.contrato_id)

      // Verificar se há snapshot gravado para esta rota no ciclo selecionado
      const snapCiclo = selectedCiclo?.id ? cicloSnapshotsMap.get(rota.id) : null
      let paradasSnapshotParsed: Array<{
        escola_id: string
        escola_nome?: string
        ordem?: number
        endereco?: string
        contrato?: string
      }> | null = null

      if (snapCiclo?.paradas_snapshot) {
        try {
          paradasSnapshotParsed =
            typeof snapCiclo.paradas_snapshot === 'string'
              ? JSON.parse(snapCiclo.paradas_snapshot)
              : snapCiclo.paradas_snapshot
        } catch {
          paradasSnapshotParsed = null
        }
      }

      // Paradas cadastradas no banco (collection paradas_rota) - referência global/default
      const paradasCadastradas = paradasRota
        .filter((p) => (p.rota_id || (p as any).rota_logistica_id) === rota.id)
        .sort((a, b) => a.ordem - b.ordem)

      // Se temos snapshot para o ciclo selecionado, respeitamos estritamente as escolas e a ordem daquele snapshot
      const escolaIdsDaRota =
        paradasSnapshotParsed &&
        Array.isArray(paradasSnapshotParsed) &&
        paradasSnapshotParsed.length > 0
          ? new Set(paradasSnapshotParsed.map((p) => p.escola_id).filter(Boolean))
          : new Set(paradasCadastradas.map((p) => p.escola_id))

      // Pedidos desta rota: filtrados pelo ciclo selecionado (chamadaCicloOrders)
      // herdados da escola OU com rotaLogisticaId/rotaId definido
      const pedidosDaRota = chamadaCicloOrders.filter(
        (o) =>
          escolaIdsDaRota.has(o.schoolId) || o.rotaLogisticaId === rota.id || o.rotaId === rota.id,
      )

      const pedidosPendentes = pedidosDaRota.filter((o) => o.status === 'Pendente')
      const pedidosEmRota = pedidosDaRota.filter((o) => o.status === 'Em Rota')
      const pedidosEntregues = pedidosDaRota.filter((o) => o.status === 'Entregue')
      const pedidosCancelados = pedidosDaRota.filter((o) => o.status === 'Cancelado')

      // Montar lista ordenada de paradas com badge de contrato de origem
      const paradasOrdenadas: Array<{
        escolaId: string
        nome: string
        endereco: string
        alunos?: number
        ordem: number
        contratoNumero?: string
        pedidos: Order[]
        latitude?: number | string | null
        longitude?: number | string | null
      }> = []

      if (
        paradasSnapshotParsed &&
        Array.isArray(paradasSnapshotParsed) &&
        paradasSnapshotParsed.length > 0
      ) {
        // Ordenar paradas conforme o snapshot do ciclo selecionado
        const sortedSnapshotItems = [...paradasSnapshotParsed].sort(
          (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0),
        )

        sortedSnapshotItems.forEach((sp, idx) => {
          if (!sp.escola_id) return
          const sch = schools.find((s) => s.id === sp.escola_id)
          const peds = pedidosDaRota.filter(
            (o) => o.schoolId === sp.escola_id && o.status !== 'Cancelado',
          )
          const contratoOrigem = escolaContratoOrigemMap.get(sp.escola_id)

          paradasOrdenadas.push({
            escolaId: sp.escola_id,
            nome: sp.escola_nome || sch?.name || 'Escola',
            endereco: sp.endereco || sch?.address || '',
            alunos: sch?.alunos,
            ordem: idx + 1,
            contratoNumero: sp.contrato || contratoOrigem?.contratoNumero,
            pedidos: peds,
            latitude: sch?.latitude,
            longitude: sch?.longitude,
          })
        })
      } else {
        // Fallback para a ordem default de paradas_rota
        paradasCadastradas.forEach((p, idx) => {
          const sch = schools.find((s) => s.id === p.escola_id)
          const peds = pedidosDaRota.filter(
            (o) => o.schoolId === p.escola_id && o.status !== 'Cancelado',
          )
          const contratoOrigem = escolaContratoOrigemMap.get(p.escola_id)

          paradasOrdenadas.push({
            escolaId: p.escola_id,
            nome: sch?.name || 'Escola',
            endereco: sch?.address || '',
            alunos: sch?.alunos,
            ordem: idx + 1,
            contratoNumero: contratoOrigem?.contratoNumero,
            pedidos: peds,
            latitude: sch?.latitude,
            longitude: sch?.longitude,
          })
        })
      }

      // Último despacho realizado desta rota (respeitando o ciclo selecionado quando houver)
      const ultimoDespacho = despachos
        .filter((d) => {
          const rotaMatch = (d.rota_id || (d as any).rota_logistica_id) === rota.id
          if (!rotaMatch) return false
          if (selectedCiclo?.id) {
            return (d as any).ciclo_id === selectedCiclo.id
          }
          return false
        })
        .sort(
          (a, b) => new Date(b.data_despacho).getTime() - new Date(a.data_despacho).getTime(),
        )[0]

      // Considerar apenas pedidos ativos/em trânsito (Pendente e Em Rota) para métricas ativas da rota (exclui Cancelado e Entregue)
      const pedidosAtivosDaRota = pedidosDaRota.filter(
        (o) => o.status === 'Pendente' || o.status === 'Em Rota',
      )

      const volumeTotal =
        pedidosAtivosDaRota.length === 0
          ? 0
          : pedidosAtivosDaRota.reduce(
              (acc, p) => acc + p.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0),
              0,
            )
      const valorTotal =
        pedidosAtivosDaRota.length === 0
          ? 0
          : pedidosAtivosDaRota.reduce((acc, p) => acc + (Number(p.total) || 0), 0)

      return {
        rota,
        chamadaNome: chamadaObj?.chamada || 'Chamada',
        contratoNumero: contrato?.numero,
        modalidade: chamadaObj?.modalidade || contrato?.modalidade_pedido || 'individualizado',
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
  }, [
    filteredRotasLogisticas,
    chamadas,
    contracts,
    chamadaCicloOrders,
    schools,
    paradasRota,
    despachos,
    escolaContratoOrigemMap,
    cicloSnapshotsMap,
    selectedCiclo?.id,
  ])

  // Escolas vinculadas à Chamada (em qualquer dos seus contratos) que AINDA NÃO têm rota logística atribuída
  const escolasSemRota = useMemo(() => {
    if (!currentChamada) return []
    // IDs de todas as escolas em paradas_rota de qualquer rota logística desta chamada
    const paradasDestaChamadaSet = new Set(
      filteredRotasLogisticas.flatMap((r) =>
        paradasRota.filter((p) => p.rota_id === r.id).map((p) => p.escola_id),
      ),
    )
    return unifiedChamadaSchools.filter((e) => !paradasDestaChamadaSet.has(e.escolaId))
  }, [currentChamada, filteredRotasLogisticas, paradasRota, unifiedChamadaSchools])

  // Pedidos de escolas sem rota logística atribuída (no ciclo selecionado)
  const pedidosSemRota = useMemo(() => {
    const escolasSemRotaIds = new Set(escolasSemRota.map((e) => e.escolaId))
    return chamadaCicloOrders.filter(
      (o) => o.status === 'Pendente' && (!o.rotaLogisticaId || escolasSemRotaIds.has(o.schoolId)),
    )
  }, [escolasSemRota, chamadaCicloOrders])

  // Despacho: Abrir modal de confirmação para colocar rota inteira em rota
  const handleOpenDispatch = (rota: RotaLogisticaRecord) => {
    setRotaToDispatch(rota)
    setDispatchConfirmOpen(true)
  }

  // Despacho: Executar colocação da rota inteira em rota
  const handleConfirmDispatch = async () => {
    if (!rotaToDispatch) return

    // Validação estrita: rota deve possuir paradas gravadas (collection paradas_rota)
    const paradasCadastradas = paradasRota.filter(
      (p) => (p.rota_id || (p as any).rota_logistica_id) === rotaToDispatch.id,
    )
    if (paradasCadastradas.length === 0) {
      toast.error('Monte o roteamento da rota antes de despachar (nenhuma parada definida).')
      return
    }

    // Regra D: Despacho ("Colocar em Rota"): só habilitado quando o ciclo em foco estiver em fase elegível
    // Identificar os pedidos pendentes desta rota respeitando a dupla Chamada + Ciclo em tela
    const escolaIdsDaRota = new Set(paradasCadastradas.map((p) => p.escola_id))
    const pedidosPendentesRota = chamadaCicloOrders.filter(
      (o) =>
        (escolaIdsDaRota.has(o.schoolId) ||
          o.rotaLogisticaId === rotaToDispatch.id ||
          o.rotaId === rotaToDispatch.id) &&
        o.status === 'Pendente',
    )

    // Resolver ciclo de referência para validação:
    // 1. Ciclo selecionado na tela (/rotas)
    // 2. Ciclo ativo da chamada da rota
    // 3. activeCiclo global
    const chamadaDaRotaId = rotaToDispatch.chamada_id || currentChamada?.id
    const cicloReferenciaRota =
      selectedCiclo ||
      (chamadaDaRotaId ? getCicloAtivo(ciclos, chamadaDaRotaId) : null) ||
      activeCiclo

    // Validação de despacho baseada no STATUS DO CICLO:
    // O despacho só é liberado quando o ciclo da chamada/pedido estiver em "coleta_encerrada".
    const pedidoBloqueado = pedidosPendentesRota.find((ped) => {
      const pedCiclo = ciclos.find((c) => c.id === ped.cicloId) || cicloReferenciaRota
      if (!pedCiclo || pedCiclo.status === 'fechado' || pedCiclo.status === 'cancelado') {
        return true
      }
      return !isFaseElegivelParaDespacho(pedCiclo.status)
    })

    if (pedidoBloqueado) {
      const pedCiclo = ciclos.find((c) => c.id === pedidoBloqueado.cicloId) || cicloReferenciaRota
      const faseAtual = pedCiclo?.status || 'desconhecida'

      if (pedCiclo?.status === 'fechado' || faseAtual.toLowerCase() === 'fechado') {
        toast.error('Ciclo já se encontra fechado.')
      } else if (pedCiclo?.status === 'cancelado' || faseAtual.toLowerCase() === 'cancelado') {
        toast.error('Ciclo cancelado. Despacho não permitido.')
      } else {
        toast.error(
          `Despacho liberado apenas após a Coleta Encerrada (fase atual do ciclo: "${faseAtual}").`,
        )
      }
      return
    }

    setIsDispatching(true)
    try {
      await despacharRotaInteira(
        rotaToDispatch.id,
        rotaToDispatch.contrato_id,
        user?.id,
        rotaToDispatch.chamada_id || currentChamada?.id,
      )
      setDispatchConfirmOpen(false)
      setRotaToDispatch(null)
    } finally {
      setIsDispatching(false)
    }
  }

  // Entrega: Abrir modal para confirmar que a rota inteira foi entregue
  const handleOpenDeliverWholeRoute = (rota: RotaLogisticaRecord) => {
    setRotaToDeliver(rota)
    setObservacaoEntregaRota('')
    setDeliverWholeRouteOpen(true)
  }

  // Entrega: Executar confirmação de rota entregue
  const handleConfirmDeliverWholeRoute = async () => {
    if (!rotaToDeliver) return
    const targetRotaId = rotaToDeliver.id
    setIsDeliveringWholeRoute(true)
    try {
      await confirmarEntregaRotaInteira(
        targetRotaId,
        user?.id,
        observacaoEntregaRota.trim() || undefined,
      )

      // (a) Limpar localmente o despacho ativo do estado despachosAtivosMap
      setDespachosAtivosMap((prev) => {
        const next = { ...prev }
        delete next[targetRotaId]
        return next
      })

      // (b) Reinvocar carregarMotoristasEDespachos para trazer o estado real do banco
      carregarMotoristasEDespachos()

      // (c) Chamar refreshData() do contexto para pedidos saírem de "Em Rota" para "Entregue" nos cards
      refreshData().catch((err) => {
        console.warn('Erro ao atualizar dados globais após entrega de rota:', err)
      })

      setDeliverWholeRouteOpen(false)
      setRotaToDeliver(null)
      setObservacaoEntregaRota('')
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

  // Criar nova rota
  const handleOpenCreateRoute = () => {
    setNewRouteName('')
    setCreateRouteDialogOpen(true)
  }

  const handleConfirmCreateRoute = async () => {
    const trimmed = newRouteName.trim()
    if (!trimmed) {
      toast.error('Informe um nome para a rota.')
      return
    }

    if (!currentChamada) {
      toast.error('Selecione uma Chamada específica para criar uma rota.')
      return
    }

    // Validação local no frontend: checar duplicata case-insensitive e trim na mesma Chamada
    const cleanNome = trimmed.replace(/\s+/g, ' ')
    const normalizedTarget = cleanNome.toLowerCase()
    const existeDuplicata = rotasLogisticas.some(
      (r) =>
        (r.chamada_id === currentChamada.id ||
          (r.contrato_id && chamadaContratos.some((c) => c.id === r.contrato_id))) &&
        (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTarget,
    )
    if (existeDuplicata) {
      toast.error('Já existe uma rota com este nome nesta Chamada.')
      return
    }

    setIsCreatingRoute(true)
    try {
      const created = await criarRotaLogistica({
        chamada_id: currentChamada.id,
        contrato_id: chamadaContratos[0]?.id,
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

  // Abrir modal de edição/renomeação de rota
  const handleOpenEditRoute = (rota: RotaLogisticaRecord) => {
    setRouteToEdit(rota)
    setEditRouteName(rota.nome)
    setEditRouteDialogOpen(true)
  }

  // Confirmar edição/renomeação de rota
  const handleConfirmEditRoute = async () => {
    if (!routeToEdit) return
    const trimmed = editRouteName.trim()
    if (!trimmed) {
      toast.error('Informe um nome para a rota.')
      return
    }

    // Validação local no frontend: bloquear nome duplicado na mesma Chamada/Contrato
    const normalizedTarget = trimmed.replace(/\s+/g, ' ').toLowerCase()
    const targetScopeChamada = routeToEdit.chamada_id || currentChamada?.id
    const existeDuplicata = rotasLogisticas.some((r) => {
      if (r.id === routeToEdit.id) return false
      const matchScope = targetScopeChamada
        ? r.chamada_id === targetScopeChamada
        : r.contrato_id === routeToEdit.contrato_id
      return (
        matchScope && (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTarget
      )
    })
    if (existeDuplicata) {
      toast.error('Já existe uma rota com este nome nesta Chamada.')
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

  // Excluir rota
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
      .filter((p) => (p.rota_id || (p as any).rota_logistica_id) === rota.id)
      .map((p) => p.escola_id)
    setSelectedSchoolsToAssign(paradasDaRota)
    setPastedSchoolsText('')
    setUnmatchedPastedLines([])
    setPastedMatchFeedback(null)

    setRoutingDialogOpen(true)
  }

  // Processar colagem de lista de escolas com endereço
  const handleApplyPastedSchools = () => {
    if (!currentChamada && unifiedChamadaSchools.length === 0) {
      toast.error('Nenhuma Chamada selecionada.')
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

    // Converte escolas unificadas da chamada no formato esperado pelo matcher
    const escolasParaMatching = unifiedChamadaSchools.map((u) => ({
      escolaId: u.escolaId,
      escolaNome: u.escolaNome,
      escolaEndereco: u.escolaEndereco,
    }))

    for (const line of lines) {
      const match = matchPastedSchoolLine(line, escolasParaMatching as any, schools)
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

  // Roteamento da Chamada: Salvar atribuição de escolas à rota
  // Preenche paradas_rota, atualiza pedidos pendentes automaticamente e sincroniza contrato_escolas
  const handleSaveRouting = async () => {
    if (!selectedRotaForRouting) return
    setIsSavingAssignment(true)
    try {
      const targetCId = selectedRotaForRouting.contrato_id || chamadaContratos[0]?.id || ''
      await sincronizarEscolasRotaLogistica(
        targetCId,
        selectedRotaForRouting.id,
        selectedSchoolsToAssign,
        undefined,
        selectedRotaForRouting.chamada_id || currentChamada?.id,
      )

      setRoutingDialogOpen(false)
      setSelectedRotaForRouting(null)
    } finally {
      setIsSavingAssignment(false)
    }
  }

  // Drag and Drop nativo: início do arraste da escola
  const handleDragStart = (e: React.DragEvent, escolaId: string, sourceRotaId: string) => {
    setDraggedEscolaId(escolaId)
    setDraggedSourceRotaId(sourceRotaId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify({ escolaId, sourceRotaId }))
  }

  const handleDragEnd = () => {
    setDraggedEscolaId(null)
    setDraggedSourceRotaId(null)
    setDragOverRotaId(null)
    setDragOverEscolaId(null)
  }

  // Hover sobre uma rota específica (área de drop da rota inteira ou do container)
  const handleDragOverRota = (e: React.DragEvent, targetRotaId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverRotaId !== targetRotaId) {
      setDragOverRotaId(targetRotaId)
    }
  }

  // Hover sobre uma parada específica de uma rota
  const handleDragOverParada = (e: React.DragEvent, escolaId: string, rotaId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverEscolaId !== escolaId) {
      setDragOverEscolaId(escolaId)
    }
    if (dragOverRotaId !== rotaId) {
      setDragOverRotaId(rotaId)
    }
  }

  // Drop sobre uma rota (ao soltar no card/área da rota, sem soltar em uma parada específica)
  const handleDropOnRota = async (e: React.DragEvent, targetRotaId: string) => {
    e.preventDefault()
    e.stopPropagation()

    let sourceEscolaId = draggedEscolaId
    let sourceRotaId = draggedSourceRotaId

    try {
      const dataStr = e.dataTransfer.getData('text/plain')
      if (dataStr) {
        const parsed = JSON.parse(dataStr)
        if (parsed.escolaId) sourceEscolaId = parsed.escolaId
        if (parsed.sourceRotaId) sourceRotaId = parsed.sourceRotaId
      }
    } catch {
      // Usa estados já capturados
    }

    handleDragEnd()

    if (!sourceEscolaId) return

    // Se já estiver na mesma rota e não soltou em uma parada específica, não faz nada
    if (sourceRotaId === targetRotaId) {
      return
    }

    const sch = schools.find((s) => s.id === sourceEscolaId)
    const destRota = rotasLogisticas.find((r) => r.id === targetRotaId)
    const schoolName = sch?.name || 'Escola'
    const destName = destRota?.nome || 'Rota de destino'

    setIsMovingSchool(true)
    try {
      const ok = await moverEscolaEntreRotas({
        escolaId: sourceEscolaId,
        origemRotaId: sourceRotaId || undefined,
        destinoRotaId: targetRotaId,
      })
      if (ok) {
        toast.success(`"${schoolName}" movida para a ${destName}!`)
      }
    } finally {
      setIsMovingSchool(false)
    }
  }

  // Drop sobre uma parada específica (determina posição e renumeração)
  const handleDropOnParada = async (
    e: React.DragEvent,
    targetEscolaId: string,
    targetRotaId: string,
    targetParadas: Array<{ escolaId: string; ordem: number }>,
  ) => {
    e.preventDefault()
    e.stopPropagation()

    let sourceEscolaId = draggedEscolaId
    let sourceRotaId = draggedSourceRotaId

    try {
      const dataStr = e.dataTransfer.getData('text/plain')
      if (dataStr) {
        const parsed = JSON.parse(dataStr)
        if (parsed.escolaId) sourceEscolaId = parsed.escolaId
        if (parsed.sourceRotaId) sourceRotaId = parsed.sourceRotaId
      }
    } catch {
      // Usa os estados
    }

    handleDragEnd()

    if (!sourceEscolaId || sourceEscolaId === targetEscolaId) return

    const sch = schools.find((s) => s.id === sourceEscolaId)
    const destRota = rotasLogisticas.find((r) => r.id === targetRotaId)
    const schoolName = sch?.name || 'Escola'
    const destName = destRota?.nome || 'Rota'

    // Caso 1: Mesma rota (reordenação interna das paradas)
    if (sourceRotaId === targetRotaId) {
      const sourceIndex = targetParadas.findIndex((p) => p.escolaId === sourceEscolaId)
      const targetIndex = targetParadas.findIndex((p) => p.escolaId === targetEscolaId)

      if (sourceIndex === -1 || targetIndex === -1) return

      const reordered = [...targetParadas]
      const [movedItem] = reordered.splice(sourceIndex, 1)
      reordered.splice(targetIndex, 0, movedItem)

      const payload = reordered.map((item, idx) => ({
        escola_id: item.escolaId,
        ordem: idx + 1,
      }))

      const ok = await salvarSequenciamentoParadas(targetRotaId, payload)
      if (ok) {
        // Se há um ciclo selecionado, salva a ordem no snapshot de edição do ciclo
        if (selectedCiclo?.id) {
          try {
            const paradasParaSnapshot = reordered.map((item, idx) => {
              const escolaInfo = schools.find((s) => s.id === item.escolaId)
              const contratoOrigem = escolaContratoOrigemMap.get(item.escolaId)
              return {
                escola_id: item.escolaId,
                ordem: idx + 1,
                escola_nome: escolaInfo?.name || 'Escola',
                endereco: escolaInfo?.address || '',
                contrato: contratoOrigem?.contratoNumero || '',
              }
            })

            await retencaoHistoricaService.salvarComposicaoCiclo({
              rotaId: targetRotaId,
              cicloId: selectedCiclo.id,
              chamadaId: destRota?.chamada_id || currentChamada?.id,
              rotaNome: destName,
              paradas: paradasParaSnapshot,
              observacao: 'Reordenamento manual de paradas no ciclo',
            })

            const snapsMap = await retencaoHistoricaService.getSnapshotsByCiclo(selectedCiclo.id)
            setCicloSnapshotsMap(snapsMap)
          } catch (err) {
            console.warn('Aviso não-bloqueante ao salvar snapshot de reordenação no ciclo:', err)
          }
        }
        toast.success('Sequência de paradas atualizada!')
      }
      return
    }

    // Caso 2: Movimentação entre rotas distintas soltando em posição de parada específica
    const targetIndex = targetParadas.findIndex((p) => p.escolaId === targetEscolaId)
    const targetOrdem = targetIndex !== -1 ? targetIndex + 1 : undefined

    setIsMovingSchool(true)
    try {
      const ok = await moverEscolaEntreRotas({
        escolaId: sourceEscolaId,
        origemRotaId: sourceRotaId || undefined,
        destinoRotaId: targetRotaId,
        targetOrdem,
      })
      if (ok) {
        toast.success(`"${schoolName}" movida para a ${destName} (parada #${targetOrdem || 1})!`)
      }
    } finally {
      setIsMovingSchool(false)
    }
  }

  // Acionamento mobile / fallback por botão
  const handleOpenMobileMove = (
    escolaId: string,
    escolaNome: string,
    origemRotaId: string,
    origemRotaNome: string,
  ) => {
    setSchoolToMoveMobile({ escolaId, escolaNome, origemRotaId, origemRotaNome })
    // Primeira rota diferente da atual
    const outra = filteredRotasLogisticas.find((r) => r.id !== origemRotaId)
    setTargetRotaIdMobile(outra?.id || '')
    setMobileMoveDialogOpen(true)
  }

  const handleConfirmMobileMove = async () => {
    if (!schoolToMoveMobile || !targetRotaIdMobile) return
    setIsMovingSchool(true)
    try {
      const destRota = rotasLogisticas.find((r) => r.id === targetRotaIdMobile)
      const ok = await moverEscolaEntreRotas({
        escolaId: schoolToMoveMobile.escolaId,
        origemRotaId: schoolToMoveMobile.origemRotaId,
        destinoRotaId: targetRotaIdMobile,
      })
      if (ok) {
        toast.success(
          `"${schoolToMoveMobile.escolaNome}" movida para a ${destRota?.nome || 'nova rota'}!`,
        )
        setMobileMoveDialogOpen(false)
        setSchoolToMoveMobile(null)
      }
    } finally {
      setIsMovingSchool(false)
    }
  }

  // Copiar link da rota no Google Maps
  const handleCopyGoogleMapsRoute = async (
    rotaNome: string,
    paradas: Array<{
      escolaId: string
      nome: string
      endereco: string
      alunos?: number
      ordem: number
      contratoNumero?: string
      latitude?: string | number | null
      longitude?: string | number | null
    }>,
  ) => {
    if (!paradas || paradas.length === 0) {
      toast.error('Nenhuma parada cadastrada nesta rota.')
      return
    }

    const validWaypoints: string[] = []
    let semCoordsCount = 0

    // Manter estritamente a ordem atual das paradas (sem reordenar / renumerar)
    for (const p of paradas) {
      const coords = extrairCoordenadas(p.latitude, p.longitude)
      if (coords) {
        // Normalizar com ponto decimal e sem espaços
        const latStr = coords.latitude.toString().replace(',', '.')
        const lngStr = coords.longitude.toString().replace(',', '.')
        validWaypoints.push(`${latStr},${lngStr}`)
      } else {
        semCoordsCount++
      }
    }

    if (validWaypoints.length === 0) {
      toast.error('Nenhuma escola desta rota possui coordenadas geográficas cadastradas.')
      return
    }

    const mapsUrl = `https://www.google.com/maps/dir/${validWaypoints.join('/')}`

    // Copiar com fallback resiliente
    let copied = false
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(mapsUrl)
        copied = true
      }
    } catch {
      // Ignora erro nativo e tenta fallback
    }

    if (!copied) {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = mapsUrl
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        textarea.style.top = '-9999px'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        copied = document.execCommand('copy')
        document.body.removeChild(textarea)
      } catch {
        copied = false
      }
    }

    if (!copied) {
      toast.error('Não foi possível copiar o link para a área de transferência.')
      return
    }

    if (semCoordsCount > 0) {
      const total = paradas.length
      const comCoord = validWaypoints.length
      toast.warning(
        `Copiado com ${comCoord} de ${total} paradas — ${semCoordsCount} escola(s) sem coordenadas`,
      )
    } else {
      toast.success('Link da rota copiado!')
    }
  }

  // Otimização de Rota: Calcular e abrir diálogo de sugestão
  const handleOpenOptimizationDialog = (
    rota: RotaLogisticaRecord,
    paradas: Array<{
      escolaId: string
      nome: string
      endereco: string
      alunos?: number
      ordem: number
      contratoNumero?: string
      latitude?: string | number | null
      longitude?: string | number | null
    }>,
  ) => {
    const paradasParaOtimizar: ParadaOtimizavel[] = paradas.map((p) => {
      const coords = extrairCoordenadas(p.latitude, p.longitude)
      return {
        escolaId: p.escolaId,
        nome: p.nome,
        endereco: p.endereco,
        alunos: p.alunos,
        ordem: p.ordem,
        contratoNumero: p.contratoNumero,
        latitude: coords ? coords.latitude : null,
        longitude: coords ? coords.longitude : null,
      }
    })

    const depositoAtivo = resolverDepositoCentral(config)
    const resultado = otimizarSequenciaParadas(paradasParaOtimizar, depositoAtivo)

    if (!resultado.podeOtimizar && resultado.motivoNaoOtimizavel) {
      toast.error(resultado.motivoNaoOtimizavel)
      return
    }

    setOptimizingRota(rota)
    setOptimizationOriginalParadas(paradasParaOtimizar)
    setOptimizationResult(resultado)
    setOptimizationDialogOpen(true)
  }

  // Otimização de Rota: Aplicar sugestão aceita pelo usuário
  const handleApplyOptimization = async (
    paradasReordenadas: Array<{ escola_id: string; ordem: number }>,
  ) => {
    if (!optimizingRota) return
    setIsApplyingOptimization(true)
    try {
      const ok = await salvarSequenciamentoParadas(optimizingRota.id, paradasReordenadas)
      if (ok) {
        toast.success(
          `Rota "${optimizingRota.nome}" atualizada com sucesso com a sequência otimizada!`,
        )
        setOptimizationDialogOpen(false)
        setOptimizingRota(null)
        setOptimizationResult(null)
      }
    } finally {
      setIsApplyingOptimization(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header e Seleção de Chamada */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roteamento & Despacho</h1>
          <p className="text-muted-foreground text-sm">
            Gestão de rotas no nível da Chamada, agrupando escolas de diferentes contratos
            vinculados em uma mesma rota.
          </p>
        </div>

        {/* Filtro por Chamada + Ciclo e Ações */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary shrink-0" />
            <Select
              value={selectedChamadaId}
              onValueChange={(val) => {
                setSelectedChamadaId(val)
                // Ao trocar a chamada, auto-seleciona o ciclo ativo da nova chamada
                let novoCicloId = ''
                if (val !== 'todas') {
                  const ciclosDaNova = ciclos.filter((c) => c.chamada_id === val)
                  const ativo = ciclosDaNova.find((c) => isCicloNaoTerminal(c.status))
                  if (ativo) {
                    novoCicloId = ativo.id
                  } else if (ciclosDaNova.length > 0) {
                    novoCicloId = ciclosDaNova[0].id
                  }
                }
                setSelectedCicloId(novoCicloId)
                if (val === 'todas') {
                  setSearchParams({})
                } else if (novoCicloId) {
                  setSearchParams({ chamadaId: val, cicloId: novoCicloId })
                } else {
                  setSearchParams({ chamadaId: val })
                }
              }}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Selecione a Chamada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Chamadas</SelectItem>
                {chamadas.map((ch) => {
                  const cnts = contracts.filter((c) => c.chamada_id === ch.id)
                  return (
                    <SelectItem key={ch.id} value={ch.id}>
                      {ch.chamada} ({ch.programa || 'PNAE'}) • {cnts.length} contrato(s)
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Seletor de Ciclo sincronizado com a chamada escolhida */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            <Select
              value={selectedCicloId}
              onValueChange={(val) => {
                setSelectedCicloId(val)
                const nextParams: Record<string, string> = {}
                if (selectedChamadaId && selectedChamadaId !== 'todas') {
                  nextParams.chamadaId = selectedChamadaId
                }
                if (val) {
                  nextParams.cicloId = val
                }
                setSearchParams(nextParams)
              }}
              disabled={chamadaCiclos.length === 0}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue
                  placeholder={chamadaCiclos.length === 0 ? 'Nenhum ciclo' : 'Selecione o Ciclo'}
                />
              </SelectTrigger>
              <SelectContent>
                {chamadaCiclos.map((c) => {
                  const isAtivo = isCicloNaoTerminal(c.status)
                  const codCiclo = extractCicloCodigo(c.nome) || c.nome || 'Ciclo'
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome?.startsWith('Ciclo') ? c.nome : `Ciclo ${codCiclo}`}
                      {isAtivo ? ' ★ Ativo' : ''} ({formatFaseAmigavel(c.status)})
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => setMotoristasManagerOpen(true)}
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0 text-foreground border-border hover:bg-muted"
            title="Cadastrar e gerenciar motoristas da cooperativa"
          >
            <Users className="h-4 w-4 text-primary" /> Motoristas
          </Button>

          {selectedChamadaId !== 'todas' && (
            <Button
              onClick={handleOpenCreateRoute}
              size="sm"
              className="gap-1.5 shrink-0"
              title="Criar nova rota para esta Chamada"
            >
              <Plus className="h-4 w-4" /> Nova Rota
            </Button>
          )}
        </div>
      </div>

      {/* Painel de Escolas da Chamada sem Rota Atribuída */}
      {selectedChamadaId !== 'todas' && escolasSemRota.length > 0 && (
        <div className="p-4 rounded-lg border border-amber-500/40 bg-amber-500/10 space-y-2 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>{escolasSemRota.length} escola(s) vinculada(s) à Chamada ainda sem rota</span>
            </div>
            <Badge
              variant="outline"
              className="text-amber-700 bg-background border-amber-400 shrink-0 w-fit"
            >
              {pedidosSemRota.length} pedido(s) pendente(s) aguardando rota
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            As escolas abaixo fazem parte dos contratos desta chamada mas ainda não foram
            distribuídas em nenhuma rota. Os pedidos delas ficam como{' '}
            <strong>Pendente sem rota</strong> e{' '}
            <strong>não bloqueiam o despacho das demais rotas</strong>. Atribua-as usando o botão
            "Roteamento" em uma das rotas.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {escolasSemRota.map((esc) => (
              <Badge
                key={esc.escolaId}
                variant="secondary"
                className="text-[11px] bg-background/80 border border-amber-300 text-foreground flex items-center gap-1"
              >
                <Building2 className="h-3 w-3 text-amber-600" />
                <span>{esc.escolaNome}</span>
                {esc.escolaAlunos ? (
                  <span className="text-muted-foreground">({esc.escolaAlunos} alunos)</span>
                ) : null}
                <span className="text-[9px] font-mono px-1 py-0.2 bg-muted rounded border border-border">
                  {esc.contratoNumero}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Grid de Rotas da Cooperativa */}
      {filteredRotasLogisticas.length === 0 ? (
        <Card className="border-dashed border-2 border-primary/20 bg-primary/5">
          <CardContent className="py-12 text-center text-muted-foreground space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <RouteIcon className="h-7 w-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-lg font-bold text-foreground">Rotas da Chamada</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {currentChamada ? (
                  <>
                    A chamada <strong>{currentChamada.chamada}</strong> (
                    {currentChamada.programa || 'PNAE'}) ainda não possui rotas configuradas. Crie
                    as rotas no nível da chamada e agrupe escolas de todos os seus contratos
                    vinculados ({chamadaContratos.length} contrato(s)) em uma mesma rota.
                  </>
                ) : (
                  'Selecione uma Chamada acima para visualizar e gerenciar as rotas integradas com escolas de diferentes contratos.'
                )}
              </p>
            </div>

            {currentChamada && (
              <div className="pt-2">
                <Button onClick={handleOpenCreateRoute} className="gap-2">
                  <Plus className="h-4 w-4" /> Criar Primeira Rota
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {rotasLogisticasDetalhes.map((item) => {
            const hasPendentes = item.pedidosPendentes.length > 0
            const despAtivoRota = despachosAtivosMap[item.rota.id]
            const isDespachadoConfirmadoRota =
              Boolean(despAtivoRota) ||
              item.ultimoDespacho?.status === 'Em Rota' ||
              item.pedidosEmRota.length > 0
            const registrosRota = selectedCiclo?.id
              ? getEntregaRegistrosDaRota(item.rota.id, selectedCiclo.id)
              : []
            const compsRota = selectedCiclo?.id
              ? (comprovantesEntregasMap[item.rota.id] || []).filter(
                  (c) => c.ciclo_id === selectedCiclo.id,
                )
              : []
            const temEntregaConfirmadaPortal =
              registrosRota.some((r) => r.confirmado_em && r.confirmado_em.trim() !== '') ||
              compsRota.some(
                (c) => (c.confirmado_em && c.confirmado_em.trim() !== '') || Boolean(c.chegada_em),
              )
            const modoAutomaticoAtivo = isDespachadoConfirmadoRota && temEntregaConfirmadaPortal

            const hasEmRota =
              item.pedidosEmRota.length > 0 || item.ultimoDespacho?.status === 'Em Rota'
            const totalEmTransito = item.pedidosPendentes.length + item.pedidosEmRota.length
            const isDraggingOverThisRota =
              dragOverRotaId === item.rota.id && draggedSourceRotaId !== item.rota.id

            // Resiliência contra resíduo de despacho ativo: se todos os pedidos da rota já estão Entregue
            // (nenhum Em Rota e nenhum Pendente), a rota é considerada Entregue com precedência.
            const todosPedidosEntreguesCard =
              item.pedidosEmRota.length === 0 &&
              item.pedidosPendentes.length === 0 &&
              item.pedidosEntregues.length > 0

            const isRotaEntregueCard =
              todosPedidosEntreguesCard ||
              (!despAtivoRota &&
                item.pedidosEmRota.length === 0 &&
                item.pedidosEntregues.length > 0 &&
                item.ultimoDespacho?.status === 'Entregue')

            const isCicloTerminal =
              selectedCiclo?.status === 'fechado' || selectedCiclo?.status === 'cancelado'

            const isRotaBloqueada = isCicloTerminal || isRotaEntregueCard
            const podeEditarRota = canEditRoutes && !isRotaBloqueada

            return (
              <Card
                key={item.rota.id}
                onDragOver={podeEditarRota ? (e) => handleDragOverRota(e, item.rota.id) : undefined}
                onDrop={podeEditarRota ? (e) => handleDropOnRota(e, item.rota.id) : undefined}
                className={`flex flex-col border-t-4 border-t-primary shadow-sm hover:shadow-md transition-all ${
                  isDraggingOverThisRota && podeEditarRota
                    ? 'ring-2 ring-primary ring-offset-2 bg-primary/[0.04] border-primary scale-[1.008]'
                    : ''
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg flex items-center gap-2 text-foreground font-bold">
                          <Truck className="h-5 w-5 text-primary" /> {item.rota.nome}
                        </CardTitle>
                        {(() => {
                          if (isRotaEntregueCard) {
                            return (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Rota Entregue
                              </Badge>
                            )
                          }

                          if (isDespachadoConfirmadoRota) {
                            return (
                              <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-[10px] animate-pulse">
                                Em Rota
                              </Badge>
                            )
                          }

                          return (
                            <Badge variant="outline" className="text-muted-foreground text-[10px]">
                              Aguardando Despacho
                            </Badge>
                          )
                        })()}
                      </div>
                      <CardDescription className="text-xs mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span>
                          Chamada: <strong className="text-foreground">{item.chamadaNome}</strong>
                        </span>
                        <span>
                          • Modalidade: <span className="capitalize">{item.modalidade}</span>
                        </span>
                        {/* Contrato ref legado removido: a rota pertence à Chamada e cada parada possui seu badge de contrato de origem */}
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
                      {podeEditarRota && (
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
                      )}
                      {podeEditarRota && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleOpenRouting(item.rota)}
                          title="Atribuir escolas a esta rota"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                          Roteamento ({item.paradasOrdenadas.length} escolas)
                        </Button>
                      )}
                      {/* Opção para renomear rota */}
                      {podeEditarRota && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Renomear rota"
                          onClick={() => handleOpenEditRoute(item.rota)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {/* Opção para excluir rota vazia */}
                      {podeEditarRota && item.pedidosEmRota.length === 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Excluir rota"
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
                        {totalEmTransito === 0 ? '0 itens' : `${item.volumeTotal} itens`}
                      </p>
                    </div>
                  </div>
                  {/* Ações de Despacho e Entrega por Rota Inteira */}
                  {(() => {
                    const chamadaRotaId = item.rota.chamada_id || currentChamada?.id
                    const cicloReferencia =
                      selectedCiclo ||
                      (chamadaRotaId ? getCicloAtivo(ciclos, chamadaRotaId) : null) ||
                      (currentChamada?.id ? getCicloAtivo(ciclos, currentChamada.id) : null) ||
                      activeCiclo
                    const faseCiclo = cicloReferencia?.status
                    const isFaseElegivel = isFaseElegivelParaDespacho(faseCiclo)
                    const faseNorm = (faseCiclo || 'coletando').trim().toLowerCase()
                    const isFaseColeta = faseNorm === 'coletando' || faseNorm === 'correcao'
                    const faseAmigavel = formatFaseAmigavel(faseCiclo)
                    const despAtivo = despachosAtivosMap[item.rota.id]

                    // Resiliência: se todos os pedidos já estão Entregue, Rota Entregue vence com precedência
                    const todosPedidosEntregues =
                      item.pedidosEmRota.length === 0 &&
                      item.pedidosPendentes.length === 0 &&
                      item.pedidosEntregues.length > 0

                    const isRotaEntregue =
                      todosPedidosEntregues ||
                      (!despAtivo &&
                        item.pedidosEmRota.length === 0 &&
                        item.pedidosEntregues.length > 0 &&
                        item.ultimoDespacho?.status === 'Entregue')

                    const isDespachadoConfirmado =
                      !isRotaEntregue &&
                      (Boolean(despAtivo) ||
                        item.ultimoDespacho?.status === 'Em Rota' ||
                        item.pedidosEmRota.length > 0)
                    const hasPedidosAtivos = totalEmTransito > 0
                    const hasParadas = item.paradasOrdenadas.length > 0

                    let textoStatusControle = 'Rota aguardando despacho da central'
                    if (item.ultimoDespacho) {
                      textoStatusControle = `Último despacho: ${new Date(item.ultimoDespacho.data_despacho).toLocaleDateString('pt-BR')} (${item.ultimoDespacho.status})`
                    } else if (isFaseColeta || !isFaseElegivel) {
                      textoStatusControle = `Coleta em andamento — despacho liberado após encerramento da coleta da chamada (${faseAmigavel})`
                    } else if (!hasParadas) {
                      textoStatusControle =
                        'Rota sem paradas gravadas — monte o roteamento antes de despachar'
                    } else if (!hasPedidosAtivos) {
                      textoStatusControle = 'Rota sem pedidos ativos para entrega'
                    }

                    // Validação do botão "Despachar Rota" (Estágio 1)
                    let despachoBotaoDesabilitado = false
                    let despachoBotaoTooltip =
                      'Despachar rota para o motorista com link e mensagem pronta de WhatsApp'

                    if (!isFaseElegivel) {
                      despachoBotaoDesabilitado = true
                      despachoBotaoTooltip = `Despacho liberado após o encerramento da coleta da chamada (fase atual: ${faseAmigavel})`
                    } else if (!hasParadas) {
                      despachoBotaoDesabilitado = true
                      despachoBotaoTooltip =
                        'Monte o roteamento da rota antes de despachar (nenhuma parada definida)'
                    } else if (!hasPedidosAtivos) {
                      despachoBotaoDesabilitado = true
                      despachoBotaoTooltip =
                        'Rota não possui pedidos ativos para entrega (volume zero)'
                    }

                    // Verificação de modo de posicionamento do caminhão:
                    // Se a rota está "Em Rota" (hasEmRota) COM pelo menos um registro confirmado -> modo AUTOMÁTICO
                    // Exceção: rota despachada mas SEM nenhum registro confirmado -> modo MANUAL preservado
                    const registrosRota = selectedCiclo?.id
                      ? getEntregaRegistrosDaRota(item.rota.id, selectedCiclo.id)
                      : []
                    const rotaRegsEfetivosCalculo =
                      registrosRota.length > 0
                        ? registrosRota
                        : selectedCiclo?.id
                          ? (registrosEntregasMap[item.rota.id] || []).filter(
                              (r) => r.ciclo_id === selectedCiclo.id,
                            )
                          : []
                    const rotaCompsEfetivosCalculo = selectedCiclo?.id
                      ? (comprovantesEntregasMap[item.rota.id] || []).filter(
                          (c) => c.ciclo_id === selectedCiclo.id,
                        )
                      : []
                    const temEntregaConfirmadaPortal =
                      rotaRegsEfetivosCalculo.some(
                        (r) => r.confirmado_em && r.confirmado_em.trim() !== '',
                      ) ||
                      rotaCompsEfetivosCalculo.some(
                        (c) =>
                          (c.confirmado_em && c.confirmado_em.trim() !== '') ||
                          Boolean(c.chegada_em),
                      )
                    const modoAutomaticoAtivo = hasEmRota && temEntregaConfirmadaPortal

                    return (
                      <div className="flex items-center justify-between p-2.5 rounded-lg border bg-primary/5 gap-2">
                        <div className="text-xs">
                          <span className="font-semibold text-primary block">
                            Controle de Despacho & Entrega:
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {textoStatusControle}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isRotaEntregue ? (
                            /* ESTÁGIO 3 — Rota Entregue / Concluída: informativo estático sem botão de despacho */
                            <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 p-2.5 flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <div className="text-left">
                                <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                                  Rota Entregue · Concluída
                                </p>
                                <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                                  Todas as entregas foram confirmadas pela central.
                                </p>
                              </div>
                            </div>
                          ) : !isDespachadoConfirmado ? (
                            /* ESTÁGIO 1 — NÃO despachado: botão "Despachar Rota" visível APENAS quando a fase permitir despacho (sem botão nem placeholder durante coleta de pedidos) */
                            isFaseElegivel ? (
                              <Button
                                size="sm"
                                disabled={despachoBotaoDesabilitado}
                                className="h-8 text-xs gap-1.5 font-bold disabled:opacity-50 bg-primary hover:bg-primary/90 text-primary-foreground"
                                onClick={() => {
                                  setSelectedRotaForDriverModal(item.rota)
                                  setDespachoMotoristaOpen(true)
                                }}
                                title={despachoBotaoTooltip}
                              >
                                <Truck className="h-3.5 w-3.5" />
                                <span>Despachar Rota</span>
                              </Button>
                            ) : null
                          ) : (
                            /* ESTÁGIO 2 — despachado confirmado: Botão "Reenviar Link Motorista" + Botão "Rota Entregue" */
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs gap-1.5 font-bold border-amber-400 text-amber-900 dark:text-amber-200 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40"
                                onClick={() => {
                                  setSelectedRotaForDriverModal(item.rota)
                                  setDespachoMotoristaOpen(true)
                                }}
                                title="Rota despachada: ver link, copiar mensagem ou redisparar (renovar token)"
                              >
                                <Share2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                <span>Reenviar Link Motorista</span>
                              </Button>

                              <Button
                                size="sm"
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-semibold"
                                onClick={() => handleOpenDeliverWholeRoute(item.rota)}
                                title="Confirma o retorno do veículo: marca TODOS os pedidos Em Rota como Entregue"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Rota Entregue
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Controle de Posição do Caminhão: Modo Automático vs Modo Manual */}
                  {modoAutomaticoAtivo ? (
                    <div className="p-2.5 rounded-lg border bg-emerald-500/10 border-emerald-300 dark:border-emerald-800 text-xs flex items-center justify-between gap-2 text-emerald-900 dark:text-emerald-200">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0 animate-pulse">📡</span>
                        <span className="font-medium truncate">
                          Posição acompanhada automaticamente pelas entregas do portal
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-400 shrink-0"
                      >
                        Tempo Real
                      </Badge>
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg border bg-amber-500/10 border-amber-300 dark:border-amber-900/60 w-full flex flex-col gap-1.5">
                      {/* Linha 1: Título com ícone, spinner e botões Anterior / Próxima / Limpar */}
                      <div className="flex items-center justify-between gap-2 w-full flex-wrap">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900 dark:text-amber-200 min-w-0">
                          <span className="text-sm">🚚</span>
                          <span className="truncate">Posição Atual da Entrega (Pino Manual)</span>
                          {updatingTruckRotaId === item.rota.id && (
                            <Loader2 className="h-3 w-3 animate-spin text-amber-700 dark:text-amber-300 shrink-0" />
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-auto">
                          {/* Botão Anterior */}
                          {(() => {
                            const currentEscolaId = item.rota.caminhao_escola_id
                            const currentIndex = item.paradasOrdenadas.findIndex(
                              (p) => p.escolaId === currentEscolaId,
                            )
                            const hasPrev = currentIndex > 0
                            const prevParada = hasPrev
                              ? item.paradasOrdenadas[currentIndex - 1]
                              : null

                            return (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={
                                  !canEditRoutes ||
                                  !hasPrev ||
                                  item.paradasOrdenadas.length === 0 ||
                                  updatingTruckRotaId === item.rota.id
                                }
                                onClick={() => {
                                  if (prevParada) {
                                    handleChangeCaminhaoPosicao(
                                      item.rota.id,
                                      prevParada.escolaId,
                                      item.paradasOrdenadas,
                                    )
                                  }
                                }}
                                className="h-7 px-2 text-xs bg-background"
                                title={
                                  prevParada
                                    ? `Voltar caminhão para a Parada #${prevParada.ordem} (${prevParada.nome})`
                                    : 'Sem parada anterior'
                                }
                              >
                                ◀ Anterior
                              </Button>
                            )
                          })()}

                          {/* Botão Próxima */}
                          {(() => {
                            const currentEscolaId = item.rota.caminhao_escola_id
                            const currentIndex = item.paradasOrdenadas.findIndex(
                              (p) => p.escolaId === currentEscolaId,
                            )
                            const hasNext =
                              currentIndex >= 0 && currentIndex < item.paradasOrdenadas.length - 1
                            const canStart = !currentEscolaId && item.paradasOrdenadas.length > 0
                            const nextParada = canStart
                              ? item.paradasOrdenadas[0]
                              : hasNext
                                ? item.paradasOrdenadas[currentIndex + 1]
                                : null

                            return (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={
                                  !canEditRoutes ||
                                  (!hasNext && !canStart) ||
                                  item.paradasOrdenadas.length === 0 ||
                                  updatingTruckRotaId === item.rota.id
                                }
                                onClick={() => {
                                  if (nextParada) {
                                    handleChangeCaminhaoPosicao(
                                      item.rota.id,
                                      nextParada.escolaId,
                                      item.paradasOrdenadas,
                                    )
                                  }
                                }}
                                className="h-7 px-2 text-xs bg-background"
                                title={
                                  nextParada
                                    ? `Avançar caminhão para a Parada #${nextParada.ordem} (${nextParada.nome})`
                                    : 'Já está na última parada'
                                }
                              >
                                Próxima ▶
                              </Button>
                            )
                          })()}

                          {/* Botão Limpar / Nenhuma */}
                          {item.rota.caminhao_escola_id && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!canEditRoutes || updatingTruckRotaId === item.rota.id}
                              onClick={() =>
                                handleChangeCaminhaoPosicao(
                                  item.rota.id,
                                  'nenhuma',
                                  item.paradasOrdenadas,
                                )
                              }
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                              title="Remover o pino do caminhão desta rota (Nenhuma)"
                            >
                              Nenhuma
                            </Button>
                          )}
                        </div>
                      </div>
                      {/* Linha 2: Seletor de paradas ocupando toda a largura horizontal da linha */}
                      <div className="w-full">
                        <Select
                          value={item.rota.caminhao_escola_id || 'nenhuma'}
                          disabled={
                            !canEditRoutes ||
                            item.paradasOrdenadas.length === 0 ||
                            updatingTruckRotaId === item.rota.id
                          }
                          onValueChange={(val) =>
                            handleChangeCaminhaoPosicao(item.rota.id, val, item.paradasOrdenadas)
                          }
                        >
                          <SelectTrigger className="h-8 w-full text-xs bg-background">
                            <SelectValue placeholder="Selecione a parada atual do caminhão..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nenhuma">
                              <span className="text-muted-foreground">
                                ⚪ Nenhuma parada selecionada (Sem pino no mapa)
                              </span>
                            </SelectItem>
                            {item.paradasOrdenadas.map((p) => (
                              <SelectItem key={p.escolaId} value={p.escolaId}>
                                <span className="font-semibold">Parada #{p.ordem}:</span>{' '}
                                <span>{p.nome}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Linha 3: Texto de apoio / instrução conciso ocupando toda a largura */}
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 w-full truncate sm:whitespace-normal">
                        Indique manualmente em qual parada o caminhão está agora. O mapa exibirá o
                        marcador de caminhão sobre ela.
                      </p>
                    </div>
                  )}

                  {/* Lista de Paradas com Sequenciamento Drag-and-Drop */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <ArrowUpDown className="h-3.5 w-3.5" /> Sequência de Paradas
                        </h4>
                        <span className="text-[10px] text-muted-foreground">
                          ({item.paradasOrdenadas.length} escola(s) atendida(s))
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Seletor de visualização Lista / Mapa / Ambos */}
                        <div className="inline-flex items-center rounded-md border bg-muted/30 p-0.5 text-xs">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`h-6 px-2 text-[11px] gap-1 rounded-xs ${
                              (routeViewModeMap[item.rota.id] || 'ambos') === 'ambos'
                                ? 'bg-background shadow-xs text-foreground font-semibold'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                            onClick={() =>
                              setRouteViewModeMap((prev) => ({ ...prev, [item.rota.id]: 'ambos' }))
                            }
                            title="Exibir lista de paradas e mapa lado a lado"
                          >
                            Ambos
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`h-6 px-2 text-[11px] gap-1 rounded-xs ${
                              routeViewModeMap[item.rota.id] === 'lista'
                                ? 'bg-background shadow-xs text-foreground font-semibold'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                            onClick={() =>
                              setRouteViewModeMap((prev) => ({ ...prev, [item.rota.id]: 'lista' }))
                            }
                            title="Exibir somente lista de paradas"
                          >
                            <ListOrdered className="h-3 w-3" />
                            Lista
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`h-6 px-2 text-[11px] gap-1 rounded-xs ${
                              routeViewModeMap[item.rota.id] === 'mapa'
                                ? 'bg-background shadow-xs text-foreground font-semibold'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                            onClick={() =>
                              setRouteViewModeMap((prev) => ({ ...prev, [item.rota.id]: 'mapa' }))
                            }
                            title="Exibir mapa da rota em destaque"
                          >
                            <MapPin className="h-3 w-3 text-primary" />
                            Mapa
                          </Button>
                        </div>

                        {/* Botão Copiar Rota (Google Maps) */}
                        {item.paradasOrdenadas.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5 text-foreground border-border hover:bg-muted"
                            title="Copiar link das paradas ordenadas no Google Maps"
                            onClick={() =>
                              handleCopyGoogleMapsRoute(item.rota.nome, item.paradasOrdenadas)
                            }
                          >
                            <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Copiar rota (Google Maps)</span>
                          </Button>
                        )}

                        {/* Botão de Sugestão de Rota Otimizada */}
                        {item.paradasOrdenadas.length > 0 &&
                          (() => {
                            const paradas = item.paradasOrdenadas
                            const menosDe3 = paradas.length < 3
                            const temAlgumaCoord = paradas.some(
                              (p) => extrairCoordenadas(p.latitude, p.longitude) !== null,
                            )
                            const desabilitado = menosDe3 || !temAlgumaCoord

                            let tooltipText =
                              'Sugerir ordem ótima de visita por coordenadas geográficas (vizinho mais próximo + 2-opt)'
                            if (menosDe3) {
                              tooltipText =
                                'A otimização de rota faz sentido a partir de 3 paradas.'
                            } else if (!temAlgumaCoord) {
                              tooltipText =
                                'Nenhuma escola desta rota possui coordenadas geográficas cadastradas.'
                            }

                            const buttonNode = (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={desabilitado || !podeEditarRota}
                                className="h-7 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/5 hover:border-primary"
                                onClick={() => handleOpenOptimizationDialog(item.rota, paradas)}
                              >
                                <Navigation className="h-3.5 w-3.5" />
                                <span>Sugerir rota otimizada</span>
                              </Button>
                            )

                            if (desabilitado) {
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        tabIndex={0}
                                        className="inline-block cursor-not-allowed"
                                      >
                                        {buttonNode}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs max-w-xs">
                                      {tooltipText}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )
                            }

                            if (!podeEditarRota) {
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        tabIndex={0}
                                        className="inline-block cursor-not-allowed"
                                      >
                                        {buttonNode}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs max-w-xs">
                                      Rota bloqueada para edição (ciclo fechado/cancelado ou rota
                                      entregue).
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )
                            }

                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>{buttonNode}</TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs max-w-xs">
                                    {tooltipText}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )
                          })()}
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground mb-2">
                      Arraste uma escola para reordenar dentro da rota ou{' '}
                      <strong>solte em outra rota</strong> para transferi-la.
                    </p>

                    {/* Destaque visual quando arrastando de outra rota para cá */}
                    {isDraggingOverThisRota && (
                      <div className="p-3 mb-2 rounded-lg border-2 border-dashed border-primary bg-primary/10 text-center text-xs font-semibold text-primary animate-pulse flex items-center justify-center gap-2">
                        <Sparkles className="h-4 w-4" /> Solte aqui para mover a escola para a{' '}
                        {item.rota.nome}
                      </div>
                    )}

                    {item.paradasOrdenadas.length === 0 ? (
                      <div
                        onDragOver={
                          podeEditarRota ? (e) => handleDragOverRota(e, item.rota.id) : undefined
                        }
                        onDrop={
                          podeEditarRota ? (e) => handleDropOnRota(e, item.rota.id) : undefined
                        }
                        className={`py-6 text-center text-muted-foreground border border-dashed rounded-lg text-xs transition-colors ${
                          isDraggingOverThisRota && podeEditarRota
                            ? 'border-primary bg-primary/15'
                            : ''
                        }`}
                      >
                        Nenhuma escola vinculada a esta rota.
                        {podeEditarRota && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Você pode arrastar uma escola de outra rota e soltá-la aqui.
                          </p>
                        )}
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={!podeEditarRota}
                            onClick={() => handleOpenRouting(item.rota)}
                          >
                            Atribuir Escolas
                          </Button>
                        </div>
                      </div>
                    ) : (
                      (() => {
                        const viewMode = routeViewModeMap[item.rota.id] || 'ambos'
                        const depositoConfig = resolverDepositoCentral(config)

                        // Derivar registros de entregas da rota reativamente via contexto global (respeitando o ciclo selecionado)
                        const rotaRegsContexto = selectedCiclo?.id
                          ? getEntregaRegistrosDaRota(item.rota.id, selectedCiclo.id)
                          : []
                        const rotaRegsEfetivos =
                          rotaRegsContexto.length > 0
                            ? rotaRegsContexto
                            : selectedCiclo?.id
                              ? (registrosEntregasMap[item.rota.id] || []).filter(
                                  (r) => r.ciclo_id === selectedCiclo.id,
                                )
                              : []
                        // Comprovantes permanentes (entrega_comprovantes) da rota no ciclo selecionado
                        const rotaCompsEfetivos = selectedCiclo?.id
                          ? (comprovantesEntregasMap[item.rota.id] || []).filter(
                              (c) => c.ciclo_id === selectedCiclo.id,
                            )
                          : []

                        // Mapa de escolaId -> { confirmado_em } para escolas com entrega confirmada (entrega_registros OU entrega_comprovantes)
                        const entregasConfirmadasMap = new Map<
                          string,
                          { confirmado_em?: string | null }
                        >()
                        rotaRegsEfetivos.forEach((rg) => {
                          if (rg.escola_id && rg.confirmado_em) {
                            entregasConfirmadasMap.set(rg.escola_id, {
                              confirmado_em: rg.confirmado_em,
                            })
                          }
                        })
                        rotaCompsEfetivos.forEach((comp) => {
                          if (comp.escola_id && (comp.confirmado_em || comp.chegada_em)) {
                            if (!entregasConfirmadasMap.has(comp.escola_id)) {
                              entregasConfirmadasMap.set(comp.escola_id, {
                                confirmado_em: comp.confirmado_em || comp.chegada_em || null,
                              })
                            }
                          }
                        })

                        // Identificar a última entrega confirmada na ordem das paradas (para posicionar o caminhão)
                        let ultimaEscolaEntregueId: string | null = null
                        if (hasEmRota) {
                          // Percorre as paradas na ordem inversa para encontrar a parada mais avançada já entregue
                          for (let i = item.paradasOrdenadas.length - 1; i >= 0; i--) {
                            const pId = item.paradasOrdenadas[i].escolaId
                            if (entregasConfirmadasMap.has(pId)) {
                              ultimaEscolaEntregueId = pId
                              break
                            }
                          }
                        }

                        // Renderizador da Lista de Paradas reordenável
                        const renderParadasList = (
                          <div
                            className={`space-y-2 overflow-y-auto pr-1 ${
                              viewMode === 'ambos' ? 'max-h-[390px]' : 'max-h-[460px]'
                            }`}
                            onDragOver={
                              podeEditarRota
                                ? (e) => handleDragOverRota(e, item.rota.id)
                                : undefined
                            }
                            onDrop={
                              podeEditarRota ? (e) => handleDropOnRota(e, item.rota.id) : undefined
                            }
                          >
                            {item.paradasOrdenadas.map((parada) => {
                              const isOver = dragOverEscolaId === parada.escolaId
                              const isBeingDragged = draggedEscolaId === parada.escolaId
                              const isTruckHere = modoAutomaticoAtivo
                                ? ultimaEscolaEntregueId === parada.escolaId
                                : item.rota.caminhao_escola_id === parada.escolaId

                              // Checar se a parada já foi entregue no ciclo selecionado (registro OU comprovante)
                              const regParada = rotaRegsEfetivos.find(
                                (rg) =>
                                  rg.escola_id === parada.escolaId && Boolean(rg.confirmado_em),
                              )
                              const compParada = rotaCompsEfetivos.find(
                                (c) =>
                                  c.escola_id === parada.escolaId &&
                                  Boolean(c.confirmado_em || c.chegada_em),
                              )
                              const isParadaEntregue = Boolean(regParada || compParada)

                              const handleAbrirDetalhesParada = () => {
                                if (!isParadaEntregue) return
                                const pedEntregue = parada.pedidos.find(
                                  (p) => p.status === 'Entregue',
                                )
                                const conferenteNome =
                                  pedEntregue?.entreguePorNome || pedEntregue?.entregue_por || null
                                const motoristaDoDespacho =
                                  despachosAtivosMap[item.rota.id]?.expand?.motorista_id?.nome ||
                                  (despachosAtivosMap[item.rota.id] as any)?.motorista_nome ||
                                  motoristasList.find(
                                    (m) => m.id === despachosAtivosMap[item.rota.id]?.motorista_id,
                                  )?.nome
                                setSelectedDeliveryDetails({
                                  registro: regParada || null,
                                  comprovante: compParada || null,
                                  escolaNome: parada.nome,
                                  escolaEndereco: parada.endereco,
                                  contratoNumero: parada.contratoNumero,
                                  motoristaNome: motoristaDoDespacho,
                                  ordem: parada.ordem,
                                  conferenteNome,
                                })
                                setDeliveryDetailsOpen(true)
                              }

                              return (
                                <div
                                  key={parada.escolaId}
                                  draggable={podeEditarRota}
                                  onDragStart={
                                    podeEditarRota
                                      ? (e) => handleDragStart(e, parada.escolaId, item.rota.id)
                                      : undefined
                                  }
                                  onDragEnd={podeEditarRota ? handleDragEnd : undefined}
                                  onDragOver={
                                    podeEditarRota
                                      ? (e) =>
                                          handleDragOverParada(e, parada.escolaId, item.rota.id)
                                      : undefined
                                  }
                                  onDrop={
                                    podeEditarRota
                                      ? (e) =>
                                          handleDropOnParada(
                                            e,
                                            parada.escolaId,
                                            item.rota.id,
                                            item.paradasOrdenadas.map((p) => ({
                                              escolaId: p.escolaId,
                                              ordem: p.ordem,
                                            })),
                                          )
                                      : undefined
                                  }
                                  onClick={handleAbrirDetalhesParada}
                                  className={`p-2.5 rounded-lg border text-xs space-y-2 shadow-xs transition-all select-none ${
                                    podeEditarRota
                                      ? 'cursor-grab active:cursor-grabbing'
                                      : 'cursor-default'
                                  } ${
                                    isBeingDragged
                                      ? 'opacity-40 border-dashed border-primary scale-[0.98] bg-card'
                                      : isOver && podeEditarRota
                                        ? 'border-primary border-2 bg-primary/10 shadow-sm'
                                        : isTruckHere
                                          ? 'border-amber-500/80 bg-amber-500/10 dark:bg-amber-950/20 shadow-sm ring-1 ring-amber-400'
                                          : isParadaEntregue
                                            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 hover:shadow-xs'
                                            : 'bg-card hover:border-primary/50 hover:shadow-xs'
                                  }`}
                                >
                                  {' '}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <GripVertical className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                                      <span
                                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                                          isTruckHere
                                            ? 'bg-amber-600 text-white ring-2 ring-amber-300'
                                            : 'bg-primary text-primary-foreground'
                                        }`}
                                        title={`Parada #${parada.ordem} na ${item.rota.nome}`}
                                      >
                                        {parada.ordem}
                                      </span>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <p className="font-semibold text-foreground truncate">
                                            {parada.nome}
                                          </p>
                                          {isTruckHere && (
                                            <Badge
                                              className="bg-amber-600 hover:bg-amber-600 text-white text-[10px] px-1.5 py-0 gap-1 font-semibold animate-pulse shrink-0"
                                              title="Caminhão de entrega está nesta parada agora"
                                            >
                                              <span>🚚</span>
                                              <span>Entrega aqui agora</span>
                                            </Badge>
                                          )}
                                          {parada.contratoNumero && (
                                            <Badge
                                              variant="outline"
                                              className="text-[9px] px-1 py-0 border-primary/30 text-primary font-mono shrink-0"
                                              title={`Escola vinculada ao Contrato ${parada.contratoNumero}`}
                                            >
                                              {parada.contratoNumero}
                                            </Badge>
                                          )}

                                          {/* Status de entrega pelo motorista ou secretária */}
                                          {(() => {
                                            // Derivação reativa ao ciclo selecionado (reaproveitando regParada e compParada já apurados)
                                            if (!regParada && !compParada) return null

                                            const timestampEntrega =
                                              regParada?.confirmado_em ||
                                              compParada?.confirmado_em ||
                                              compParada?.chegada_em
                                            const horaEnt = timestampEntrega
                                              ? new Date(timestampEntrega).toLocaleTimeString(
                                                  'pt-BR',
                                                  {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                  },
                                                )
                                              : null

                                            const assinaturaDisponivel =
                                              regParada?.assinatura ||
                                              compParada?.assinatura ||
                                              null
                                            const fotoDisponivel =
                                              regParada?.foto || compParada?.foto || null

                                            return (
                                              <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    const pedEntregue = parada.pedidos.find(
                                                      (p) => p.status === 'Entregue',
                                                    )
                                                    const conferenteNome =
                                                      pedEntregue?.entreguePorNome ||
                                                      pedEntregue?.entregue_por ||
                                                      null
                                                    const motoristaDoDespacho =
                                                      despachosAtivosMap[item.rota.id]?.expand
                                                        ?.motorista_id?.nome ||
                                                      (despachosAtivosMap[item.rota.id] as any)
                                                        ?.motorista_nome ||
                                                      motoristasList.find(
                                                        (m) =>
                                                          m.id ===
                                                          despachosAtivosMap[item.rota.id]
                                                            ?.motorista_id,
                                                      )?.nome
                                                    setSelectedDeliveryDetails({
                                                      registro: regParada || null,
                                                      comprovante: compParada || null,
                                                      escolaNome: parada.nome,
                                                      escolaEndereco: parada.endereco,
                                                      contratoNumero: parada.contratoNumero,
                                                      motoristaNome: motoristaDoDespacho,
                                                      ordem: parada.ordem,
                                                      conferenteNome,
                                                    })
                                                    setDeliveryDetailsOpen(true)
                                                  }}
                                                  className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] px-2 py-0.5 rounded-full font-semibold cursor-pointer transition shadow-2xs focus:outline-hidden"
                                                  title="Clique para ver os Dados da Entrega completos"
                                                >
                                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                                  <span>
                                                    {horaEnt ? `Entregue ${horaEnt}` : 'Entregue'}
                                                  </span>
                                                </button>
                                                {assinaturaDisponivel && (
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      setVisualizandoAssinaturaUrl(
                                                        assinaturaDisponivel,
                                                      )
                                                    }}
                                                    className="h-5 px-1.5 text-[9px] border-emerald-400 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50"
                                                    title="Ver assinatura do recebedor"
                                                  >
                                                    Assinatura
                                                  </Button>
                                                )}
                                                {fotoDisponivel && (
                                                  <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      setVisualizandoFotoUrl(fotoDisponivel)
                                                    }}
                                                    className="h-5 px-1.5 text-[9px] border-blue-400 text-blue-800 dark:text-blue-300 hover:bg-blue-50 gap-0.5"
                                                    title="Ver foto do material entregue"
                                                  >
                                                    <span>📷</span> Foto
                                                  </Button>
                                                )}
                                              </div>
                                            )
                                          })()}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground truncate">
                                          {parada.endereco || 'Endereço não informado'}
                                        </p>
                                        {(() => {
                                          const regObs = rotaRegsEfetivos.find(
                                            (rg) => rg.escola_id === parada.escolaId,
                                          )
                                          const compObs = rotaCompsEfetivos.find(
                                            (c) => c.escola_id === parada.escolaId,
                                          )
                                          const observacaoEfetiva =
                                            regObs?.observacao || compObs?.observacao
                                          if (observacaoEfetiva) {
                                            return (
                                              <p className="text-[9px] text-slate-600 dark:text-slate-400 italic truncate mt-0.5">
                                                Obs: {observacaoEfetiva}
                                              </p>
                                            )
                                          }
                                          return null
                                        })()}
                                      </div>
                                    </div>

                                    {/* Referência de Volume, Ação de marcar caminhão rápido e Ação Mobile */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {parada.alunos !== undefined && parada.alunos !== null && (
                                        <Badge
                                          variant="secondary"
                                          className="text-[10px] font-mono font-medium hidden sm:inline-flex"
                                          title="Número de alunos matriculados como referência de volume da escola"
                                        >
                                          {parada.alunos} alunos
                                        </Badge>
                                      )}
                                      {canEditRoutes && !modoAutomaticoAtivo && (
                                        <Button
                                          type="button"
                                          variant={isTruckHere ? 'default' : 'ghost'}
                                          size="sm"
                                          className={`h-6 px-1.5 text-[10px] gap-1 ${
                                            isTruckHere
                                              ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold'
                                              : 'text-muted-foreground hover:text-amber-700 dark:hover:text-amber-300'
                                          }`}
                                          title={
                                            isTruckHere
                                              ? 'Caminhão já está aqui (clique para limpar)'
                                              : `Marcar caminhão na Parada #${parada.ordem}`
                                          }
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleChangeCaminhaoPosicao(
                                              item.rota.id,
                                              isTruckHere ? 'nenhuma' : parada.escolaId,
                                              item.paradasOrdenadas,
                                            )
                                          }}
                                        >
                                          <span>🚚</span>
                                          <span className="hidden sm:inline">
                                            {isTruckHere ? 'Aqui' : 'Marcar'}
                                          </span>
                                        </Button>
                                      )}
                                      {parada.pedidos.length > 0 ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            toggleParadaPedidos(
                                              `${item.rota.id}:${parada.escolaId}`,
                                            )
                                          }}
                                          title={
                                            expandedParadasPedidos.has(
                                              `${item.rota.id}:${parada.escolaId}`,
                                            )
                                              ? 'Recolher lista de pedidos desta escola'
                                              : 'Expandir lista de pedidos desta escola'
                                          }
                                          className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border font-medium transition-colors cursor-pointer ${
                                            expandedParadasPedidos.has(
                                              `${item.rota.id}:${parada.escolaId}`,
                                            )
                                              ? 'bg-primary/10 border-primary text-primary font-semibold shadow-xs'
                                              : 'bg-background hover:bg-muted border-input text-foreground hover:border-primary/50'
                                          }`}
                                        >
                                          <span>
                                            {parada.pedidos.length}{' '}
                                            {parada.pedidos.length === 1 ? 'pedido' : 'pedidos'}
                                          </span>
                                          {expandedParadasPedidos.has(
                                            `${item.rota.id}:${parada.escolaId}`,
                                          ) ? (
                                            <ChevronDown className="h-3 w-3 shrink-0 text-primary" />
                                          ) : (
                                            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                          )}
                                        </button>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] text-muted-foreground opacity-70"
                                        >
                                          0 pedidos
                                        </Badge>
                                      )}

                                      {/* Botão de transferir rota para mobile / facilidade com clique */}
                                      {podeEditarRota && filteredRotasLogisticas.length > 1 && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-muted-foreground hover:text-primary shrink-0"
                                          title="Mover escola para outra rota"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleOpenMobileMove(
                                              parada.escolaId,
                                              parada.nome,
                                              item.rota.id,
                                              item.rota.nome,
                                            )
                                          }}
                                        >
                                          <ArrowUpDown className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                  {/* Pedidos vinculados a esta parada (exibidos apenas quando expandido pelo usuário ao clicar no número de pedidos) */}
                                  {parada.pedidos.length > 0 &&
                                    expandedParadasPedidos.has(
                                      `${item.rota.id}:${parada.escolaId}`,
                                    ) && (
                                      <div className="space-y-1.5 pl-7 border-l-2 border-primary/40 ml-2 pt-1 animate-in fade-in-50 duration-150">
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
                                                {ped.items.length} produto(s) • R${' '}
                                                {ped.total.toFixed(2)}
                                                {ped.entregue_em &&
                                                  (() => {
                                                    const horaFormatada = new Date(
                                                      ped.entregue_em,
                                                    ).toLocaleTimeString('pt-BR', {
                                                      hour: '2-digit',
                                                      minute: '2-digit',
                                                    })
                                                    const conferente =
                                                      ped.entreguePorNome || ped.entregue_por
                                                    return (
                                                      <span>
                                                        {' '}
                                                        • Entregue às {horaFormatada}
                                                        {conferente
                                                          ? ` · Conferido por: ${conferente}`
                                                          : ''}
                                                      </span>
                                                    )
                                                  })()}
                                              </p>
                                              {ped.observacao_entrega && (
                                                <p className="text-[10px] text-emerald-800 dark:text-emerald-300 font-medium italic mt-0.5">
                                                  Obs: {ped.observacao_entrega}
                                                </p>
                                              )}
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
                        )

                        // Renderizador do Mapa da Rota
                        const renderMapa = (
                          <RouteMapView
                            rotaNome={item.rota.nome}
                            paradas={item.paradasOrdenadas.map((p) => ({
                              escolaId: p.escolaId,
                              nome: p.nome,
                              endereco: p.endereco,
                              alunos: p.alunos,
                              ordem: p.ordem,
                              contratoNumero: p.contratoNumero,
                              latitude: p.latitude,
                              longitude: p.longitude,
                              pedidosCount: p.pedidos.length,
                            }))}
                            deposito={depositoConfig}
                            caminhaoEscolaId={
                              modoAutomaticoAtivo
                                ? ultimaEscolaEntregueId
                                : item.rota.caminhao_escola_id
                            }
                            isEmRota={hasEmRota}
                            height={viewMode === 'ambos' ? 380 : 420}
                            entregasConfirmadas={entregasConfirmadasMap}
                            ultimaParadaEntregueEscolaId={
                              modoAutomaticoAtivo
                                ? ultimaEscolaEntregueId
                                : item.rota.caminhao_escola_id || null
                            }
                            onEntregaClick={(escolaId) => {
                              const paradaAlvo = item.paradasOrdenadas.find(
                                (p) => p.escolaId === escolaId,
                              )
                              const regAlvo = rotaRegsEfetivos.find(
                                (rg) => rg.escola_id === escolaId && Boolean(rg.confirmado_em),
                              )
                              const compAlvo = rotaCompsEfetivos.find(
                                (c) =>
                                  c.escola_id === escolaId &&
                                  Boolean(c.confirmado_em || c.chegada_em),
                              )
                              const pedEntregue = paradaAlvo?.pedidos.find(
                                (p) => p.status === 'Entregue',
                              )
                              const conferenteNome =
                                pedEntregue?.entreguePorNome || pedEntregue?.entregue_por || null
                              const motoristaDoDespacho =
                                despachosAtivosMap[item.rota.id]?.expand?.motorista_id?.nome ||
                                (despachosAtivosMap[item.rota.id] as any)?.motorista_nome ||
                                motoristasList.find(
                                  (m) => m.id === despachosAtivosMap[item.rota.id]?.motorista_id,
                                )?.nome
                              setSelectedDeliveryDetails({
                                registro: regAlvo || null,
                                comprovante: compAlvo || null,
                                escolaNome: paradaAlvo?.nome || 'Escola',
                                escolaEndereco: paradaAlvo?.endereco,
                                contratoNumero: paradaAlvo?.contratoNumero,
                                motoristaNome: motoristaDoDespacho,
                                ordem: paradaAlvo?.ordem,
                                conferenteNome,
                              })
                              setDeliveryDetailsOpen(true)
                            }}
                          />
                        )

                        if (viewMode === 'lista') {
                          return renderParadasList
                        }

                        if (viewMode === 'mapa') {
                          return renderMapa
                        }

                        // Modo 'ambos': exibe Lista e Mapa integrados verticalmente com design limpo
                        return (
                          <div className="space-y-3">
                            {renderParadasList}
                            {renderMapa}
                          </div>
                        )
                      })()
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* MODAL 0: Criar Rota na Chamada */}
      <Dialog open={createRouteDialogOpen} onOpenChange={setCreateRouteDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> Nova Rota na Chamada
            </DialogTitle>
            <DialogDescription>
              Crie uma rota para a chamada <strong>{currentChamada?.chamada}</strong>. O nome é
              livre e agrupará escolas de todos os contratos vinculados a esta chamada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="route-name" className="font-semibold">
                Nome da Rota <span className="text-destructive">*</span>
              </Label>
              <Input
                id="route-name"
                placeholder="Ex: Rota Centro-Sul, Rota Rural 1, Setor Escolar A..."
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                Rotas criadas nesta Chamada podem conter escolas de múltiplos contratos vinculados.
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

      {/* MODAL: Renomear / Editar Rota */}
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
              <Pencil className="h-5 w-5 text-primary" /> Renomear Rota
            </DialogTitle>
            <DialogDescription>
              Altere o nome da rota. A alteração será refletida em todas as paradas e pedidos
              vinculados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="edit-route-name" className="font-semibold">
                Nome da Rota <span className="text-destructive">*</span>
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

      {/* MODAL Excluir Rota */}
      <AlertDialog
        open={Boolean(routeToDelete)}
        onOpenChange={(open) => !open && setRouteToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Excluir Rota
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover a rota <strong>{routeToDelete?.nome}</strong>? Suas paradas cadastradas
              e eventuais pedidos pendentes vinculados serão desatribuídos.
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

      {/* MODAL 1: Montagem de Roteamento por Chamada (Catálogo Unificado de Escolas) */}
      <Dialog open={routingDialogOpen} onOpenChange={setRoutingDialogOpen}>
        <DialogContent className="sm:max-w-[660px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" /> Roteamento de Escolas da Rota
            </DialogTitle>
            <DialogDescription>
              Atribua as <strong>escolas da Chamada {currentChamada?.chamada}</strong> que compõem o
              roteiro da rota <strong>{selectedRotaForRouting?.nome}</strong>. Você pode selecionar
              escolas de <strong>diferentes contratos</strong> vinculados a esta chamada em uma
              mesma rota.
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
                {chamadaContratos[0] && (
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
                )}
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
                    Estas linhas não casaram com as escolas cadastradas nesta Chamada. Você pode
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
                  <Building2 className="h-4 w-4 text-primary" /> Catálogo Unificado de Escolas da
                  Chamada
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-primary"
                    onClick={() => {
                      setSelectedSchoolsToAssign(unifiedChamadaSchools.map((e) => e.escolaId))
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
                Marque as escolas atendidas por esta rota. Escolas de contratos diferentes podem ser
                atribuídas à mesma rota. Ao salvar, as paradas serão criadas em{' '}
                <code>paradas_rota</code>.
              </p>

              <div className="rounded-lg border divide-y max-h-[300px] overflow-y-auto bg-card">
                {unifiedChamadaSchools.length > 0 ? (
                  unifiedChamadaSchools.map((esc) => {
                    const isChecked = selectedSchoolsToAssign.includes(esc.escolaId)
                    // Verificar se já está em outra rota
                    const paradaOutraRota = paradasRota.find(
                      (p) =>
                        p.escola_id === esc.escolaId &&
                        (p.rota_id || (p as any).rota_logistica_id) !== selectedRotaForRouting?.id,
                    )
                    const outraRotaId = paradaOutraRota
                      ? paradaOutraRota.rota_id || (paradaOutraRota as any).rota_logistica_id
                      : null
                    const outraRotaObj = outraRotaId
                      ? rotasLogisticas.find((r) => r.id === outraRotaId)
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
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-foreground text-sm">
                                {esc.escolaNome || 'Escola'}
                              </p>
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 font-mono text-muted-foreground border-border"
                                title={`Contrato de origem: ${esc.contratoNumero}`}
                              >
                                {esc.contratoNumero}
                              </Badge>
                            </div>
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
                        </div>
                      </label>
                    )
                  })
                ) : (
                  <div className="py-6 text-center text-muted-foreground">
                    Nenhuma escola encontrada para a chamada selecionada.
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
              <Play className="h-5 w-5 text-amber-600" /> Colocar em Rota
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
      <AlertDialog
        open={deliverWholeRouteOpen}
        onOpenChange={(open) => {
          if (!open) {
            setObservacaoEntregaRota('')
            setRotaToDeliver(null)
          }
          setDeliverWholeRouteOpen(open)
        }}
      >
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> Confirmar Retorno e Entrega da Rota Inteira
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-1 text-left">
              {(() => {
                if (!rotaToDeliver) return null
                const escolasDaRotaSet = new Set(
                  paradasRota
                    .filter((p) => (p.rota_id || (p as any).rota_logistica_id) === rotaToDeliver.id)
                    .map((p) => p.escola_id),
                )
                const pedidosAfetados = chamadaCicloOrders.filter(
                  (o) =>
                    o.status === 'Em Rota' &&
                    (escolasDaRotaSet.has(o.schoolId) ||
                      o.rotaLogisticaId === rotaToDeliver.id ||
                      o.rotaId === rotaToDeliver.id),
                )
                const totalPedidosNaRota = chamadaCicloOrders.filter(
                  (o) =>
                    escolasDaRotaSet.has(o.schoolId) ||
                    o.rotaLogisticaId === rotaToDeliver.id ||
                    o.rotaId === rotaToDeliver.id,
                ).length

                return (
                  <>
                    <p className="text-xs text-foreground/90 leading-relaxed">
                      Fechamento da rota pelo retorno offline do motorista:{' '}
                      <strong>{rotaToDeliver.nome}</strong>. Um único acionamento conclui toda a
                      rota de uma vez, sem exigir conferência entrega a entrega.
                    </p>

                    <div className="p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-emerald-900 dark:text-emerald-100 font-semibold">
                        <span>Pedidos em trânsito a finalizar:</span>
                        <Badge
                          variant="outline"
                          className="bg-emerald-600 text-white font-bold border-transparent px-2"
                        >
                          {pedidosAfetados.length} pedido(s) Em Rota
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Total cadastrado na rota (todos os status): {totalPedidosNaRota} pedido(s).
                        Apenas os{' '}
                        <strong>{pedidosAfetados.length} pedido(s) em status "Em Rota"</strong>{' '}
                        serão marcados como "Entregue".
                      </p>
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                        Responsável registrado:{' '}
                        <strong>{user?.name || user?.email || 'Usuário Atual'}</strong> (horário do
                        ato). Baixa de estoque e liberação de Atesto são executadas automaticamente.
                      </p>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <Label
                        htmlFor="obs-fechamento-rota"
                        className="text-xs font-semibold text-foreground"
                      >
                        Observação de Fechamento (opcional)
                      </Label>
                      <textarea
                        id="obs-fechamento-rota"
                        rows={3}
                        value={observacaoEntregaRota}
                        onChange={(e) => setObservacaoEntregaRota(e.target.value)}
                        placeholder="Ex.: Motorista não utilizou o portal / comprovantes em papel entregues na central / entrega concluída normalmente sem celular."
                        className="w-full p-2 rounded-md border text-xs bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Utilize este campo caso a rota tenha sido cumprida sem o aplicativo/portal
                        do motorista. A observação ficará registrada no despacho e nos pedidos
                        finalizados.
                      </p>
                    </div>
                  </>
                )
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeliveringWholeRoute}
              onClick={() => {
                setObservacaoEntregaRota('')
                setRotaToDeliver(null)
              }}
            >
              Voltar
            </AlertDialogCancel>
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
      {chamadaContratos[0] && selectedRotaForRouting && (
        <RouteSchoolBatchImportModal
          open={batchImportFileModalOpen}
          onOpenChange={setBatchImportFileModalOpen}
          targetRouteName={selectedRotaForRouting.nome}
          targetRouteId={selectedRotaForRouting.id}
          targetRouteType="logistica"
          contract={chamadaContratos[0]}
          allContracts={contracts}
          masterSchools={schools}
          paradasRota={paradasRota}
          rotasLogisticas={rotasLogisticas}
          onSuccess={async () => {
            // Recarrega todos os dados de rotas, contratos e paradas
            await refreshData()
            // Atualizar o estado local de escolas selecionadas se o modal de roteamento estiver aberto
            const paradasDaRota = paradasRota
              .filter(
                (p) => (p.rota_id || (p as any).rota_logistica_id) === selectedRotaForRouting.id,
              )
              .map((p) => p.escola_id)
            setSelectedSchoolsToAssign(paradasDaRota)
          }}
        />
      )}

      {/* Modal / Diálogo de Transferência de Escola entre Rotas (Acessível via Mobile / Clique) */}
      <Dialog
        open={mobileMoveDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSchoolToMoveMobile(null)
          }
          setMobileMoveDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> Mover Escola de Rota
            </DialogTitle>
            <DialogDescription>
              Transfira <strong>{schoolToMoveMobile?.escolaNome}</strong> da{' '}
              <strong>{schoolToMoveMobile?.origemRotaNome}</strong> para outra rota deste contrato.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="target-route-select" className="font-semibold">
                Selecione a Rota de Destino <span className="text-destructive">*</span>
              </Label>
              <Select
                value={targetRotaIdMobile}
                onValueChange={(val) => setTargetRotaIdMobile(val)}
              >
                <SelectTrigger id="target-route-select">
                  <SelectValue placeholder="Selecione a rota" />
                </SelectTrigger>
                <SelectContent>
                  {filteredRotasLogisticas
                    .filter((r) => r.id !== schoolToMoveMobile?.origemRotaId)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                A escola será posicionada no final da nova rota e os números de parada serão
                renumerados automaticamente.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isMovingSchool}
              onClick={() => {
                setMobileMoveDialogOpen(false)
                setSchoolToMoveMobile(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isMovingSchool || !targetRotaIdMobile}
              onClick={handleConfirmMobileMove}
            >
              {isMovingSchool ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Movendo...
                </>
              ) : (
                'Confirmar Mudança de Rota'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Sugestão de Otimização de Rota por Coordenadas */}
      <RouteOptimizationDialog
        open={optimizationDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setOptimizingRota(null)
            setOptimizationOriginalParadas([])
            setOptimizationResult(null)
          }
          setOptimizationDialogOpen(open)
        }}
        rotaNome={optimizingRota?.nome || 'Rota'}
        paradasOriginais={optimizationOriginalParadas}
        resultado={optimizationResult}
        onApply={handleApplyOptimization}
        isApplying={isApplyingOptimization}
      />

      {/* MODAL: Gestão de Motoristas */}
      <MotoristasManagerDialog
        open={motoristasManagerOpen}
        onOpenChange={setMotoristasManagerOpen}
        onMotoristasChanged={carregarMotoristasEDespachos}
      />

      {/* MODAL: Despacho para Motorista com Link / WhatsApp */}
      <DespachoMotoristaModal
        open={despachoMotoristaOpen}
        onOpenChange={setDespachoMotoristaOpen}
        rota={selectedRotaForDriverModal}
        ciclo={
          selectedCiclo ||
          (selectedRotaForDriverModal?.chamada_id
            ? getCicloAtivo(ciclos, selectedRotaForDriverModal.chamada_id) ||
              (currentChamada?.id ? getCicloAtivo(ciclos, currentChamada.id) : null) ||
              activeCiclo
            : currentChamada?.id
              ? getCicloAtivo(ciclos, currentChamada.id) || activeCiclo
              : activeCiclo)
        }
        chamada={
          selectedRotaForDriverModal?.chamada_id
            ? chamadas.find((ch) => ch.id === selectedRotaForDriverModal.chamada_id) ||
              currentChamada
            : currentChamada
        }
        totalEntregas={
          selectedRotaForDriverModal
            ? chamadaCicloOrders.filter(
                (o) =>
                  (o.status === 'Pendente' || o.status === 'Em Rota') &&
                  (o.rotaLogisticaId === selectedRotaForDriverModal.id ||
                    o.rotaId === selectedRotaForDriverModal.id ||
                    paradasRota
                      .filter(
                        (p) =>
                          (p.rota_id || (p as any).rota_logistica_id) ===
                          selectedRotaForDriverModal.id,
                      )
                      .some((p) => p.escola_id === o.schoolId)),
              ).length ||
              paradasRota.filter(
                (p) =>
                  (p.rota_id || (p as any).rota_logistica_id) === selectedRotaForDriverModal.id,
              ).length
            : 0
        }
        totalParadas={
          selectedRotaForDriverModal
            ? paradasRota.filter(
                (p) =>
                  (p.rota_id || (p as any).rota_logistica_id) === selectedRotaForDriverModal.id,
              ).length
            : 0
        }
        motoristas={motoristasList}
        despachoAtivo={
          selectedRotaForDriverModal
            ? despachosAtivosMap[selectedRotaForDriverModal.id] || null
            : null
        }
        onDespachoSucesso={async (novoDespacho) => {
          if (selectedRotaForDriverModal) {
            setDespachosAtivosMap((prev) => ({
              ...prev,
              [selectedRotaForDriverModal.id]: novoDespacho,
            }))
          }
          await Promise.all([carregarMotoristasEDespachos(), refreshData()])
        }}
        onGerenciarMotoristas={() => {
          setDespachoMotoristaOpen(false)
          setMotoristasManagerOpen(true)
        }}
      />

      {/* MODAL: Visualização ampliada da assinatura do recebedor */}
      <Dialog
        open={Boolean(visualizandoAssinaturaUrl)}
        onOpenChange={(open) => {
          if (!open) setVisualizandoAssinaturaUrl(null)
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-emerald-600" />
              Assinatura do Recebedor na Escola
            </DialogTitle>
            <DialogDescription className="text-xs">
              Comprovante de entrega assinado digitalmente no celular pelo recebedor.
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-white border rounded-lg flex items-center justify-center min-h-[160px]">
            {visualizandoAssinaturaUrl && (
              <img
                src={visualizandoAssinaturaUrl}
                alt="Assinatura"
                className="max-h-56 max-w-full object-contain"
              />
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVisualizandoAssinaturaUrl(null)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Visualização ampliada da foto do material entregue */}
      <Dialog
        open={Boolean(visualizandoFotoUrl)}
        onOpenChange={(open) => {
          if (!open) setVisualizandoFotoUrl(null)
        }}
      >
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Camera className="h-4 w-4 text-blue-600" />
              Foto do Material Entregue
            </DialogTitle>
            <DialogDescription className="text-xs">
              Registro fotográfico anexado pelo motorista no momento da entrega.
            </DialogDescription>
          </DialogHeader>

          <div className="p-2 bg-slate-950 border rounded-lg flex items-center justify-center min-h-[220px]">
            {visualizandoFotoUrl && (
              <img
                src={visualizandoFotoUrl}
                alt="Foto do Material Entregue"
                className="max-h-[70vh] max-w-full object-contain rounded"
              />
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVisualizandoFotoUrl(null)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Dados da Entrega (detalhes da entrega clicada na parada ou no mapa) */}
      <DeliveryDetailsDialog
        open={deliveryDetailsOpen}
        onOpenChange={setDeliveryDetailsOpen}
        data={selectedDeliveryDetails}
      />
    </div>
  )
}
