import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/context/app-context'
import { useAuth } from '@/context/auth-context'
import type { Contract, School, ContratoItemRecord } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
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
  FileText,
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  Package,
  Loader2,
  AlertTriangle,
  Info,
  MapPin,
  School as SchoolIcon,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  Check,
  Search,
  Globe,
  Sparkles,
  Link2,
  SlidersHorizontal,
  Truck,
  FileSpreadsheet,
  Calculator,
  XCircle,
  Ban,
  Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { chamadasService } from '@/services/chamadas'
import { contratosService } from '@/services/contratos'
import { rotasService } from '@/services/rotas'
import { rotasLogisticasService } from '@/services/rotas-logisticas'
import { escolasService } from '@/services/escolas'
import { normalizeName } from '@/lib/excelImporter'
import { ContractItemsManager, type ContractItemForm } from '@/components/ContractItemsManager'
import {
  ContractSchoolImportDialog,
  type ImportedSchoolLinkResult,
} from '@/components/ContractSchoolImportDialog'
import { ContractBatchImportDialog } from '@/components/ContractBatchImportDialog'
import {
  ContractRouteSchoolEditorDialog,
  type ContractRouteInfo,
} from '@/components/ContractRouteSchoolEditorDialog'
import { EncerrarContratoDialog } from '@/components/EncerrarContratoDialog'
import { CancelarContratoDialog } from '@/components/CancelarContratoDialog'
import { DesvincularEscolaDialog } from '@/components/DesvincularEscolaDialog'

interface ContractSchoolForm {
  escolaId: string
  rotaId: string
}

interface ContractRotaLogisticaForm {
  id?: string
  nome: string
  ordem: number
  ativa?: boolean
}

export default function Contracts() {
  const navigate = useNavigate()
  const {
    contracts,
    chamadas,
    schools,
    products,
    orders,
    rotas,
    rotasLogisticas,
    paradasRota,
    contractSchools,
    isLoading,
    refreshData,
  } = useApp()
  const { isAdmin } = useAuth()

  // Diálogos principais
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [encerrarDialogOpen, setEncerrarDialogOpen] = useState(false)
  const [cancelarDialogOpen, setCancelarDialogOpen] = useState(false)
  const [desvincularEscolaDialogState, setDesvincularEscolaDialogState] = useState<{
    open: boolean
    escolaId: string
    escolaNome: string
    contratoEscolaId?: string | null
  }>({
    open: false,
    escolaId: '',
    escolaNome: '',
    contratoEscolaId: null,
  })

  // Estados de edição / criação
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null)
  const [contractToEncerrar, setContractToEncerrar] = useState<Contract | null>(null)
  const [contractToCancelar, setContractToCancelar] = useState<Contract | null>(null)
  const [viewingContract, setViewingContract] = useState<Contract | null>(null)
  const [reportContract, setReportContract] = useState<Contract | null>(null)

  // Formulário de Contrato
  const [numero, setNumero] = useState('')
  const [chamadaId, setChamadaId] = useState('')
  const [chamadaSearch, setChamadaSearch] = useState('')
  const [numeroChamada, setNumeroChamada] = useState('')
  const [tipo, setTipo] = useState('PNAE')
  const [modalidade, setModalidade] = useState<'individualizado' | 'centralizado'>(
    'individualizado',
  )
  const [tipoImportacao, setTipoImportacao] = useState<'unica' | 'fracionada'>('unica')
  const [planilhaTemAbas, setPlanilhaTemAbas] = useState<boolean>(false)
  const [abasPlanilhaTexto, setAbasPlanilhaTexto] = useState('')

  const [valorTotal, setValorTotal] = useState('')
  const [status, setStatus] = useState<'Ativo' | 'Encerrado' | 'Cancelado' | 'Pendente'>('Ativo')

  // Vínculos N:N Escolas e Rotas da Planilha no diálogo
  const [contractSchoolsForm, setContractSchoolsForm] = useState<ContractSchoolForm[]>([])
  const [contractItems, setContractItems] = useState<ContractItemForm[]>([])

  // Autocomplete e busca de escolas mestre no diálogo
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('')
  const [showQuickCreateSchool, setShowQuickCreateSchool] = useState(false)
  const [quickSchoolName, setQuickSchoolName] = useState('')
  const [quickSchoolAddress, setQuickSchoolAddress] = useState('')
  const [quickSchoolContact, setQuickSchoolContact] = useState('')
  const [quickSchoolEmail, setQuickSchoolEmail] = useState('')
  const [quickSchoolTipo, setQuickSchoolTipo] = useState('')
  const [quickSchoolRotaPlanilha, setQuickSchoolRotaPlanilha] = useState('')
  const [isCreatingQuickSchool, setIsCreatingQuickSchool] = useState(false)

  // Diálogo de Importação CSV/Planilha de Escolas para o Contrato
  const [schoolImportDialogOpen, setSchoolImportDialogOpen] = useState(false)
  // Diálogo de Importação em Massa de Contratos (XLSX / CSV / Colar)
  const [contractBatchImportDialogOpen, setContractBatchImportDialogOpen] = useState(false)

  // Diálogo de Edição de Rota (incluir/retirar escolas com regra de exclusividade)
  const [routeEditorOpen, setRouteEditorOpen] = useState(false)
  const [editingRouteInfo, setEditingRouteInfo] = useState<ContractRouteInfo | null>(null)
  const [routeEditorContract, setRouteEditorContract] = useState<Contract | null>(null)

  // Rotas da Planilha / Secretaria (referência)
  const [contractRotas, setContractRotas] = useState<
    Array<{ id?: string; nome: string; ordem: number }>
  >([])
  const [newRotaNome, setNewRotaNome] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoadingItems, setIsLoadingItems] = useState(false)
  const [viewingItems, setViewingItems] = useState<ContratoItemRecord[]>([])

  // Carrega itens da chamada selecionada preservando quantidades já digitadas por produto_id
  const loadItemsForChamada = async (
    chId: string,
    existingItems: ContractItemForm[] = [],
    contractDbItems: ContratoItemRecord[] = [],
  ) => {
    if (!chId) {
      setContractItems([])
      return
    }
    setIsLoadingItems(true)
    try {
      const chamadaItens = await chamadasService.getItems(chId).catch(() => [])

      // Monta mapa de quantidade contratada anterior por produto_id
      // Prioridade: existingItems no estado do formulário > contractDbItems vindos do banco
      const qtdByProdId = new Map<string, number | undefined>()
      const idByProdId = new Map<string, string | undefined>()

      for (const dbi of contractDbItems) {
        if (dbi.produto_id) {
          idByProdId.set(dbi.produto_id, dbi.id)
          const q = dbi.quantidade_contratada ? Number(dbi.quantidade_contratada) : undefined
          if (q !== undefined) qtdByProdId.set(dbi.produto_id, q)
        }
      }

      for (const formItem of existingItems) {
        if (formItem.productId) {
          if (formItem.id) idByProdId.set(formItem.productId, formItem.id)
          if (formItem.quantity !== undefined) {
            qtdByProdId.set(formItem.productId, formItem.quantity)
          }
        }
      }

      const mapped: ContractItemForm[] = chamadaItens.map((ci) => {
        const prod = products.find((p) => p.id === ci.produto_id)
        const effectivePrice = Number(ci.preco) || 0
        const effectiveNome = ci.produto || prod?.name || 'Produto'
        const effectiveAka = ci.aka || ''
        const effectiveUnidade = ci.unidade || prod?.unit || 'Kg'
        const preservedQtd = ci.produto_id ? qtdByProdId.get(ci.produto_id) : undefined
        const preservedId = ci.produto_id ? idByProdId.get(ci.produto_id) : undefined

        return {
          id: preservedId,
          productId: ci.produto_id,
          price: effectivePrice,
          quantity: preservedQtd,
          nomeContrato: effectiveAka || effectiveNome, // Nome no Contrato / AKA
          apelidos: effectiveAka,
          unidade: effectiveUnidade,
          produtoNome: effectiveNome,
        }
      })

      setContractItems(mapped)

      // Se há produtos com quantidade contratada informada > 0, sincroniza e sobrepõe o total automaticamente
      const somaContratada = mapped.reduce(
        (acc, it) => acc + (it.price || 0) * (it.quantity || 0),
        0,
      )
      const temQtd = mapped.some((it) => (it.quantity || 0) > 0)
      if (temQtd && somaContratada > 0) {
        setValorTotal(somaContratada.toFixed(2))
      }
    } catch (err) {
      console.error('Erro ao carregar itens da chamada:', err)
      setContractItems([])
    } finally {
      setIsLoadingItems(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingContract(null)
    setNumero('')
    setChamadaId('')
    setChamadaSearch('')
    setNumeroChamada('')
    setTipo('PNAE')
    setModalidade('individualizado')
    setTipoImportacao('unica')
    setPlanilhaTemAbas(false)
    setAbasPlanilhaTexto('')
    setValorTotal('')
    setStatus('Ativo')
    setContractSchoolsForm([])
    setContractRotas([])
    setDeletedRotaIds([])
    setContractItems([])
    setDialogOpen(true)
  }

  const handleOpenEdit = async (contract: Contract) => {
    setEditingContract(contract)
    setDeletedRotaIds([])
    setNumero(contract.numero)
    setChamadaId(contract.chamada_id || '')
    setChamadaSearch('')
    setNumeroChamada(contract.numero_chamada || '')
    setTipo(contract.tipo || 'PNAE')
    setModalidade(contract.modalidade_pedido || 'individualizado')
    const tImp = contract.tipo_importacao || 'unica'
    setTipoImportacao(tImp)
    const abasText = contract.abas_planilha || ''
    setAbasPlanilhaTexto(abasText)
    setPlanilhaTemAbas(Boolean(abasText.trim()))
    setValorTotal(contract.totalValue.toString())
    setStatus(contract.status)

    // Escolas do contrato
    setContractSchoolsForm(
      contract.escolas.map((e) => ({
        escolaId: e.escolaId,
        rotaId: e.rotaId || '',
      })),
    )

    // Rotas da planilha da secretaria (sem defaults fixos)
    const existingRotas = rotas.filter((r) => r.contrato_id === contract.id)
    setContractRotas(existingRotas.map((r) => ({ id: r.id, nome: r.nome, ordem: r.ordem || 1 })))

    setDialogOpen(true)
    setIsLoadingItems(true)
    try {
      const [dbContractItems, chamadaItens] = await Promise.all([
        contratosService.getItems(contract.id),
        contract.chamada_id
          ? chamadasService.getItems(contract.chamada_id).catch(() => [])
          : Promise.resolve([]),
      ])

      // Mapa de itens do contrato por produto_id
      const contratoItemByProdId = new Map<string, ContratoItemRecord>()
      for (const it of dbContractItems) {
        if (it.produto_id) {
          contratoItemByProdId.set(it.produto_id, it)
        }
      }

      // Exibe TODOS os itens da chamada selecionada (herdados), cruzando com contratosService.getItems
      // para preservar quantidade_contratada por produto_id
      const mapped: ContractItemForm[] = chamadaItens.map((ci) => {
        const prod = products.find((p) => p.id === ci.produto_id)
        const contratoItem = ci.produto_id ? contratoItemByProdId.get(ci.produto_id) : undefined
        const effectivePrice = Number(ci.preco) || 0
        const effectiveNome = ci.produto || prod?.name || 'Produto'
        const effectiveAka = ci.aka || ''
        const effectiveUnidade = ci.unidade || prod?.unit || 'Kg'
        const rawQtd = contratoItem?.quantidade_contratada
          ? Number(contratoItem.quantidade_contratada)
          : undefined

        return {
          id: contratoItem?.id,
          productId: ci.produto_id,
          price: effectivePrice,
          quantity: rawQtd,
          nomeContrato: effectiveAka || effectiveNome,
          apelidos: effectiveAka,
          unidade: effectiveUnidade,
          produtoNome: effectiveNome,
        }
      })
      setContractItems(mapped)

      // Se há produtos com quantidade contratada informada > 0, sincroniza o total automaticamente
      const somaContratada = mapped.reduce(
        (acc, it) => acc + (it.price || 0) * (it.quantity || 0),
        0,
      )
      const temQtd = mapped.some((it) => (it.quantity || 0) > 0)
      if (temQtd && somaContratada > 0) {
        setValorTotal(somaContratada.toFixed(2))
      }
    } catch (err) {
      console.error('Erro ao buscar itens:', err)
      setContractItems([])
    } finally {
      setIsLoadingItems(false)
    }
  }

  const handleOpenDetails = async (contract: Contract) => {
    setViewingContract(contract)
    setDetailsDialogOpen(true)
    try {
      const [items, chamadaItens] = await Promise.all([
        contratosService.getItems(contract.id),
        contract.chamada_id
          ? chamadasService.getItems(contract.chamada_id).catch(() => [])
          : Promise.resolve([]),
      ])

      const chMap = new Map<string, any>()
      for (const ci of chamadaItens) {
        if (ci.produto_id) chMap.set(ci.produto_id, ci)
        const norm = (ci.produto || '').trim().toLowerCase()
        if (norm && !chMap.has(norm)) chMap.set(norm, ci)
      }

      const merged = items.map((it) => {
        const prod = products.find((p) => p.id === it.produto_id)
        const ch =
          chMap.get(it.produto_id) ||
          (prod?.name ? chMap.get(prod.name.trim().toLowerCase()) : undefined)
        return {
          ...it,
          preco: ch?.preco !== undefined ? ch.preco : it.preco,
          apelidos: ch?.aka !== undefined ? ch.aka : it.apelidos,
          nome_contrato: ch?.produto || it.nome_contrato,
        }
      })
      setViewingItems(merged)
    } catch (err) {
      console.error('Erro ao buscar itens para detalhes:', err)
      setViewingItems([])
    }
  }

  const handleOpenReport = async (contract: Contract) => {
    setReportContract(contract)
    setReportDialogOpen(true)
    try {
      const [items, chamadaItens] = await Promise.all([
        contratosService.getItems(contract.id),
        contract.chamada_id
          ? chamadasService.getItems(contract.chamada_id).catch(() => [])
          : Promise.resolve([]),
      ])

      const chMap = new Map<string, any>()
      for (const ci of chamadaItens) {
        if (ci.produto_id) chMap.set(ci.produto_id, ci)
        const norm = (ci.produto || '').trim().toLowerCase()
        if (norm && !chMap.has(norm)) chMap.set(norm, ci)
      }

      const merged = items.map((it) => {
        const prod = products.find((p) => p.id === it.produto_id)
        const ch =
          chMap.get(it.produto_id) ||
          (prod?.name ? chMap.get(prod.name.trim().toLowerCase()) : undefined)
        return {
          ...it,
          preco: ch?.preco !== undefined ? ch.preco : it.preco,
          apelidos: ch?.aka !== undefined ? ch.aka : it.apelidos,
          nome_contrato: ch?.produto || it.nome_contrato,
        }
      })
      setViewingItems(merged)
    } catch (err) {
      console.error('Erro ao buscar itens do relatório:', err)
      setViewingItems([])
    }
  }

  // Rotas da planilha (definidas por contrato para casar com abas da planilha e alimentar o seletor das escolas)
  const [deletedRotaIds, setDeletedRotaIds] = useState<string[]>([])

  const handleAddRota = () => {
    const trimmed = newRotaNome.trim()
    if (!trimmed) return
    if (contractRotas.some((r) => r.nome.toLowerCase() === trimmed.toLowerCase())) {
      toast.warning('Esta aba da planilha já foi adicionada.')
      return
    }
    setContractRotas((prev) => [...prev, { nome: trimmed, ordem: prev.length + 1 }])
    setNewRotaNome('')
  }

  const handleRemoveRota = (index: number) => {
    const rotaAlvo = contractRotas[index]
    if (rotaAlvo?.id) {
      setDeletedRotaIds((prev) => [...prev, rotaAlvo.id!])
    }
    setContractRotas((prev) => prev.filter((_, i) => i !== index))
  }

  const handleOpenRouteEditor = (
    rota: { id?: string; nome: string; ordem?: number },
    targetContract?: Contract | null,
  ) => {
    const contractToUse = targetContract || editingContract || viewingContract
    if (!contractToUse) {
      toast.error('Nenhum contrato selecionado para editar aba.')
      return
    }
    setRouteEditorContract(contractToUse)
    setEditingRouteInfo(rota)
    setRouteEditorOpen(true)
  }

  // Helper para verificar se a escola já está vinculada a outro contrato ativo
  const checkEscolaConflitoAtivo = (schoolId: string) => {
    const currentContractId = editingContract?.id
    const linkConflito = contractSchools.find(
      (cs) =>
        cs.escola_id === schoolId &&
        (!currentContractId || cs.contrato_id !== currentContractId) &&
        !cs.encerrado_em,
    )

    if (!linkConflito) {
      return { conflito: false, contratoNome: '', contratoObj: null }
    }

    const contratoObj = contracts.find(
      (c) => c.id === linkConflito.contrato_id && c.status === 'Ativo',
    )

    if (!contratoObj) {
      return { conflito: false, contratoNome: '', contratoObj: null }
    }

    const contratoNome = contratoObj.numero || 'Ativo'
    return { conflito: true, contratoNome, contratoObj }
  }

  // Adicionar e remover escolas do contrato (sem preenchimento automático de rota — operador escolhe explicitamente)
  const handleToggleSchool = (schoolId: string) => {
    setContractSchoolsForm((prev) => {
      const exists = prev.find((s) => s.escolaId === schoolId)
      if (exists) {
        return prev.filter((s) => s.escolaId !== schoolId)
      } else {
        const conflitoInfo = checkEscolaConflitoAtivo(schoolId)
        if (conflitoInfo.conflito) {
          toast.error(
            `Escola já vinculada ao contrato ${conflitoInfo.contratoNome} — desvincule-a lá antes de vincular aqui`,
            conflitoInfo.contratoObj
              ? {
                  action: {
                    label: 'Abrir contrato',
                    onClick: () => handleOpenEdit(conflitoInfo.contratoObj!),
                  },
                }
              : undefined,
          )
          return prev
        }
        return [...prev, { escolaId: schoolId, rotaId: '' }]
      }
    })
  }

  const handleAddSchoolLink = (schoolId: string) => {
    if (contractSchoolsForm.some((s) => s.escolaId === schoolId)) {
      toast.info('Esta escola já está vinculada ao contrato.')
      return
    }

    const conflitoInfo = checkEscolaConflitoAtivo(schoolId)
    if (conflitoInfo.conflito) {
      toast.error(
        `Escola já vinculada ao contrato ${conflitoInfo.contratoNome} — desvincule-a lá antes de vincular aqui`,
        conflitoInfo.contratoObj
          ? {
              action: {
                label: 'Abrir contrato',
                onClick: () => handleOpenEdit(conflitoInfo.contratoObj!),
              },
            }
          : undefined,
      )
      return
    }

    setContractSchoolsForm((prev) => [...prev, { escolaId: schoolId, rotaId: '' }])
    toast.success('Escola vinculada ao contrato!')
  }

  const handleRemoveSchoolLink = (schoolId: string) => {
    setContractSchoolsForm((prev) => prev.filter((s) => s.escolaId !== schoolId))
  }

  // Prepara as linhas de escolas para exportação (Cadastro Mestre Global de Escolas)
  const getPreparedSchoolExportRows = () => {
    return schools.map((sch) => {
      const nome = sch.name || ''
      const cep = sch.cep || ''
      const latitude = sch.latitude || ''
      const longitude = sch.longitude || ''
      return {
        nome,
        cep,
        latitude,
        longitude,
      }
    })
  }

  // Exportação CSV do cadastro mestre de escolas com BOM UTF-8 e separador ';'
  const handleExportSchoolsCSV = () => {
    if (schools.length === 0) {
      toast.warning('Nenhuma escola cadastrada para exportar.')
      return
    }

    const preparedRows = getPreparedSchoolExportRows()
    const headers = ['Nome da Escola', 'CEP', 'Latitude', 'Longitude']

    const escapeCsvField = (field: string) => {
      const str = String(field ?? '')
      if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const lines: string[] = []
    lines.push(headers.map(escapeCsvField).join(';'))

    for (const r of preparedRows) {
      lines.push([r.nome, r.cep, r.latitude, r.longitude].map(escapeCsvField).join(';'))
    }

    const csvContent = '\uFEFF' + lines.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'escolas-vinculo.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('Planilha de escolas exportada!')
  }

  // Exportação XLSX do cadastro mestre de escolas com colunas configuradas
  const handleExportSchoolsXLSX = () => {
    if (schools.length === 0) {
      toast.warning('Nenhuma escola cadastrada para exportar.')
      return
    }

    const preparedRows = getPreparedSchoolExportRows()
    const wsData: any[][] = []

    wsData.push(['Nome da Escola', 'CEP', 'Latitude', 'Longitude'])

    for (const r of preparedRows) {
      wsData.push([r.nome, r.cep, r.latitude, r.longitude])
    }

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    ws['!cols'] = [
      { wch: 40 }, // Nome da Escola
      { wch: 14 }, // CEP
      { wch: 16 }, // Latitude
      { wch: 16 }, // Longitude
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Escolas')
    XLSX.writeFile(wb, 'escolas-vinculo.xlsx')

    toast.success('Planilha de escolas exportada!')
  }

  const handleSchoolRotaChange = (schoolId: string, rotaValue: string) => {
    setContractSchoolsForm((prev) =>
      prev.map((s) => (s.escolaId === schoolId ? { ...s, rotaId: rotaValue } : s)),
    )
  }

  // Criar escola no cadastro mestre direto do modal de contrato com normalização e checagem de duplicidade
  const handleQuickCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = quickSchoolName.trim()
    if (!trimmedName) {
      toast.error('Informe o nome da escola.')
      return
    }

    setIsCreatingQuickSchool(true)
    try {
      // 1. Checar se já existe no cadastro mestre com nome normalizado
      const normInput = normalizeName(trimmedName)
      const existing = schools.find((s) => normalizeName(s.name) === normInput)

      let targetSchoolId: string

      if (existing) {
        // REUTILIZAR a escola existente
        targetSchoolId = existing.id

        // Verificar conflito de contrato ativo antes de vincular escola existente
        const conflitoInfo = checkEscolaConflitoAtivo(targetSchoolId)
        if (conflitoInfo.conflito) {
          toast.error(
            `Escola já vinculada ao contrato ${conflitoInfo.contratoNome} — desvincule-a lá antes de vincular aqui`,
            conflitoInfo.contratoObj
              ? {
                  action: {
                    label: 'Abrir contrato',
                    onClick: () => handleOpenEdit(conflitoInfo.contratoObj!),
                  },
                }
              : undefined,
          )
          return
        }

        toast.info(
          `A escola "${existing.name}" já existia no cadastro mestre e foi reutilizada (sem duplicar).`,
        )
      } else {
        // Criar nova escola no cadastro mestre (sem rota no mestre)
        const created = await escolasService.create({
          nome: trimmedName,
          endereco: quickSchoolAddress.trim(),
          telefone: quickSchoolContact.trim(),
          email: quickSchoolEmail.trim() || undefined,
          tipo: quickSchoolTipo || undefined,
        })
        targetSchoolId = created.id
        toast.success(`Escola "${trimmedName}" cadastrada no cadastro mestre global!`)
        await refreshData()
      }

      // 2. Vincular ao formulário do contrato com a Rota (Planilha) especificada (ou vazia se não escolhida)
      const assignedRota = quickSchoolRotaPlanilha.trim()

      setContractSchoolsForm((prev) => {
        if (prev.some((s) => s.escolaId === targetSchoolId)) {
          return prev.map((s) =>
            s.escolaId === targetSchoolId ? { ...s, rotaId: assignedRota || s.rotaId } : s,
          )
        }
        return [...prev, { escolaId: targetSchoolId, rotaId: assignedRota }]
      })

      // Resetar form rápido
      setShowQuickCreateSchool(false)
      setQuickSchoolName('')
      setQuickSchoolTipo('')
      setQuickSchoolRotaPlanilha('')
      setQuickSchoolAddress('')
      setQuickSchoolContact('')
      setQuickSchoolEmail('')
    } catch (err: any) {
      console.error('Erro ao cadastrar e vincular escola:', err)
      toast.error('Falha ao registrar escola no cadastro mestre.')
    } finally {
      setIsCreatingQuickSchool(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedNum = numero.trim()
    if (!trimmedNum) {
      toast.error('Informe o número ou código do contrato.')
      return
    }

    if (!chamadaId) {
      toast.error('Selecione a Chamada Pública do contrato (campo obrigatório).')
      return
    }

    // Se houver itens com quantidades cadastradas, o valor total é recalculado e sobreposto
    const itemsComQtd = contractItems.filter((i) => (i.quantity || 0) > 0)
    let val = 0
    if (itemsComQtd.length > 0) {
      val = contractItems.reduce((acc, it) => acc + (it.price || 0) * (it.quantity || 0), 0)
    } else {
      const rawVal = parseFloat((valorTotal || '0').replace(',', '.'))
      val = isNaN(rawVal) ? 0 : Math.max(0, rawVal)
    }

    // Validação da regra da modalidade centralizada
    let cleanedAbasString = ''
    if (modalidade === 'centralizado') {
      if (tipoImportacao === 'unica' && planilhaTemAbas) {
        const trimmedAbas = abasPlanilhaTexto.trim()
        if (!trimmedAbas) {
          toast.error(
            'Ao marcar que a planilha possui abas, cadastre os nomes das abas separados por ponto e vírgula (;).',
          )
          return
        }
        // Validar e normalizar entradas separadas por ponto e vírgula
        const parts = trimmedAbas
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean)

        if (parts.length === 0) {
          toast.error('Informe pelo menos um nome de aba válido separado por ponto e vírgula (;).')
          return
        }

        // Checar se o usuário deixou ponto e vírgula duplicado gerando item vazio
        const rawTokens = trimmedAbas.split(';').map((s) => s.trim())
        if (rawTokens.some((tok) => tok === '')) {
          toast.error(
            'A lista de abas contém entradas vazias entre pontos e vírgulas. Remova pontos e vírgulas duplicados ou no final.',
          )
          return
        }

        cleanedAbasString = parts.join(';')
      }
    }

    setIsSubmitting(true)
    try {
      let contractId = editingContract?.id

      const selectedChamadaObj = chamadas.find((ch) => ch.id === chamadaId)
      const payloadToSave = {
        numero: trimmedNum,
        chamada_id: chamadaId,
        numero_chamada: numeroChamada.trim() || selectedChamadaObj?.chamada || undefined,
        tipo,
        modalidade_pedido: modalidade,
        tipo_importacao: modalidade === 'centralizado' ? tipoImportacao : undefined,
        abas_planilha:
          modalidade === 'centralizado' && tipoImportacao === 'unica' && planilhaTemAbas
            ? cleanedAbasString
            : '',
        num_rotas_logisticas: editingContract?.num_rotas_logisticas,
        valor_total: val,
        status,
      }

      if (editingContract) {
        await contratosService.update(editingContract.id, payloadToSave)
      } else {
        const created = await contratosService.create(payloadToSave)
        contractId = created.id
      }

      if (contractId) {
        // 1. Salvar / Atualizar / Remover Rotas da planilha do contrato
        const savedRotasMap = new Map<string, string>() // rotaNome -> rotaId

        for (const rId of deletedRotaIds) {
          try {
            await rotasService.delete(rId)
          } catch (err) {
            console.warn('Erro ao deletar rota da planilha:', err)
          }
        }

        for (const cr of contractRotas) {
          if (cr.id) {
            await rotasService.update(cr.id, { nome: cr.nome, ordem: cr.ordem })
            savedRotasMap.set(cr.nome, cr.id)
            savedRotasMap.set(cr.id, cr.id)
          } else {
            const newR = await rotasService.create({
              contrato_id: contractId,
              nome: cr.nome,
              ordem: cr.ordem,
            })
            savedRotasMap.set(cr.nome, newR.id)
            savedRotasMap.set(newR.id, newR.id)
          }
        }

        // 2. Salvar Vínculo N:N de Escolas e Rotas (contrato_escolas)
        const currentLinks = await contratosService.getEscolas(contractId)
        const formSchoolIds = new Set(contractSchoolsForm.map((f) => f.escolaId))

        // Remover escolas desmarcadas
        for (const cl of currentLinks) {
          if (!formSchoolIds.has(cl.escola_id)) {
            await contratosService.unlinkEscola(cl.id)
          }
        }

        // Adicionar / Atualizar escolas marcadas com sua rota da planilha (sem mexer na rota de entrega)
        for (const f of contractSchoolsForm) {
          // Resolver id da rota e nome da rota (se o form tiver o nome ou id da rota)
          let rId: string | undefined = undefined
          let rotaTexto: string | undefined = undefined

          const rawRotaVal = (f.rotaId || '').trim()
          if (rawRotaVal) {
            // 1. Se casa com chave de savedRotasMap (nome da rota ou id)
            if (savedRotasMap.has(rawRotaVal)) {
              rId = savedRotasMap.get(rawRotaVal)
              // Se a chave for nome, usa o nome; se for id, tenta achar nome
              const foundR = contractRotas.find((r) => r.id === rawRotaVal || r.nome === rawRotaVal)
              rotaTexto = foundR ? foundR.nome : rawRotaVal
            } else {
              // 2. Se contractRotas tem pelo id ou nome
              const foundR = contractRotas.find((r) => r.id === rawRotaVal || r.nome === rawRotaVal)
              if (foundR) {
                rId = foundR.id
                rotaTexto = foundR.nome
              } else if (!/^[a-z0-9]{15}$/.test(rawRotaVal)) {
                // Se não é um ID alfanumérico de 15 chars, é texto legível (ex: "ROTA A")
                rotaTexto = rawRotaVal
              }
            }
          }

          // Sanitização defensiva: se rotaTexto ainda parecer com um ID do PocketBase de 15 chars
          // e não existir como rota cadastrada em contractRotas, descarta
          if (rotaTexto && /^[a-z0-9]{15}$/.test(rotaTexto)) {
            const matchCadastrada = contractRotas.find((r) => r.id === rotaTexto)
            rotaTexto = matchCadastrada ? matchCadastrada.nome : undefined
          }

          await contratosService.linkEscola({
            contrato_id: contractId,
            escola_id: f.escolaId,
            rota_id: rId || undefined,
            rota: rotaTexto || undefined,
          })
        }

        // 3. Sincronizar itens do contrato: grava só contrato_id, produto_id e quantidade_contratada
        // Apenas itens com productId válido e quantidade_contratada informada > 0 são persistidos
        const itemsToSave = contractItems.filter(
          (i) =>
            i.productId &&
            i.quantity !== undefined &&
            i.quantity !== null &&
            !isNaN(i.quantity) &&
            i.quantity > 0,
        )
        await contratosService.syncItems(
          contractId,
          itemsToSave.map((it) => ({
            id: it.id,
            produto_id: it.productId,
            preco: it.price || 0,
            quantidade_contratada: it.quantity,
            nome_contrato: it.nomeContrato,
            apelidos: it.apelidos,
          })),
        )
      }

      toast.success(`Contrato ${trimmedNum} salvo com sucesso!`)
      setDialogOpen(false)
      await refreshData()
    } catch (err: any) {
      console.error('Erro ao salvar contrato:', err)
      toast.error('Falha ao salvar contrato no banco.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenDelete = (contract: Contract) => {
    setContractToDelete(contract)
    setDeleteDialogOpen(true)
  }

  const handleOpenEncerrar = (contract: Contract) => {
    setContractToEncerrar(contract)
    setEncerrarDialogOpen(true)
  }

  const handleOpenCancelar = (contract: Contract) => {
    setContractToCancelar(contract)
    setCancelarDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!contractToDelete) return
    setIsDeleting(true)
    try {
      await contratosService.delete(contractToDelete.id)
      toast.success(`Contrato ${contractToDelete.numero} excluído com sucesso!`)
      setDeleteDialogOpen(false)
      setContractToDelete(null)
      await refreshData()
    } catch (err: any) {
      console.error('Erro ao excluir contrato:', err)
      toast.error('Falha ao excluir contrato.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Relatório do Contrato: Métricas Globais e Detalhamento por Escola Participante
  const reportData = useMemo(() => {
    if (!reportContract) return null

    const totalContratado = reportContract.totalValue
    const participatingSchoolIds = new Set(reportContract.escolas.map((e) => e.escolaId))

    // Pedidos realizados deste contrato (apenas pedidos efetivamente Entregues compõem a execução realizada)
    const contractOrders = orders.filter(
      (o) => participatingSchoolIds.has(o.schoolId) && o.status === 'Entregue',
    )
    const totalRealizado = contractOrders.reduce((acc, o) => acc + o.total, 0)
    const percentExecucaoGlobal =
      totalContratado > 0 ? Math.min(100, (totalRealizado / totalContratado) * 100) : 0

    // Detalhamento por escola participante
    const escolasReport = reportContract.escolas.map((escolaLink) => {
      const schOrders = contractOrders.filter((o) => o.schoolId === escolaLink.escolaId)
      const schRealizadoTotal = schOrders.reduce((acc, o) => acc + o.total, 0)

      // Produtos consumidos por esta escola
      const produtosConsumo: Record<string, { realizadoQtd: number; realizadoValor: number }> = {}

      for (const ord of schOrders) {
        for (const item of ord.items) {
          if (!produtosConsumo[item.productId]) {
            produtosConsumo[item.productId] = { realizadoQtd: 0, realizadoValor: 0 }
          }
          const prev = produtosConsumo[item.productId]
          prev.realizadoQtd += item.quantity
          prev.realizadoValor += item.quantity * item.price
        }
      }

      // Detalhamento por produto acordado no contrato
      const itensDetalhados = viewingItems.map((ci) => {
        const prod = products.find((p) => p.id === ci.produto_id)

        const consumo = produtosConsumo[ci.produto_id] || {
          realizadoQtd: 0,
          realizadoValor: 0,
        }

        const cotaContratada = ci.quantidade_contratada
          ? Number(ci.quantidade_contratada)
          : undefined
        // Se cota contratada informada > 0, percentual de consumo do item sobre a cota do item
        // Caso contrário, percentual sobre o valor total da escola
        const pct =
          cotaContratada && cotaContratada > 0
            ? Math.min(100, (consumo.realizadoQtd / cotaContratada) * 100)
            : schRealizadoTotal > 0
              ? Math.min(100, (consumo.realizadoValor / schRealizadoTotal) * 100)
              : 0

        return {
          produtoId: ci.produto_id,
          produtoNome: ci.expand?.produto_id?.nome || prod?.name || 'Produto',
          unidade: ci.expand?.produto_id?.unidade || prod?.unit || 'Kg',
          preco: Number(ci.preco) || prod?.price || 0,
          cotaContratada,
          realizadoQtd: consumo.realizadoQtd,
          realizadoValor: consumo.realizadoValor,
          percentExecucao: pct,
        }
      })

      return {
        escolaId: escolaLink.escolaId,
        escolaNome: escolaLink.escolaNome || 'Escola',
        rotaNome: escolaLink.rotaNome || 'Sem Rota',
        totalRealizadoValor: schRealizadoTotal,
        itens: itensDetalhados,
      }
    })

    return {
      totalContratado,
      totalRealizado,
      percentExecucaoGlobal,
      escolasReport,
    }
  }, [reportContract, orders, viewingItems, products])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contratos & Escolas Participantes</h1>
          <p className="text-muted-foreground">
            Gestão N:N de escolas participantes, rotas, produtos contratados e modalidades de
            pedido.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setContractBatchImportDialogOpen(true)}
              className="gap-2"
              title="Importar múltiplos contratos e vínculos de escolas a partir de planilha XLSX, CSV ou colagem de texto"
            >
              <FileSpreadsheet className="h-4 w-4 text-primary" /> Importar Contratos em Massa
            </Button>
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Contrato
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Contratos Vigentes
          </CardTitle>
          <CardDescription>
            Relação completa de contratos, escolas vinculadas, rotas e modalidades operacionais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Chamada Pública</TableHead>
                  <TableHead>Programa</TableHead>
                  <TableHead>Modalidade</TableHead>
                  <TableHead>Escolas Participantes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right">Saldo Restante</TableHead>
                  <TableHead className="w-[150px]">Execução</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando contratos...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : contracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nenhum contrato cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  contracts.map((contract) => {
                    const total = contract.totalValue || 1
                    const used = Math.max(0, contract.totalValue - contract.balance)
                    const percentage = Math.min(100, Math.max(0, (used / total) * 100))
                    const chamadaEncontrada = chamadas.find((ch) => ch.id === contract.chamada_id)
                    const rotuloChamada =
                      chamadaEncontrada?.chamada ||
                      contract.chamadaNumero ||
                      contract.numero_chamada ||
                      '-'

                    return (
                      <TableRow key={contract.id}>
                        <TableCell className="font-semibold text-primary">
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(contract)}
                            className="hover:underline text-left font-bold"
                          >
                            {contract.numero}
                          </button>
                        </TableCell>
                        <TableCell>
                          {chamadaEncontrada ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge
                                variant="outline"
                                className="font-bold border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 cursor-pointer w-fit"
                                onClick={() => navigate('/chamadas')}
                                title="Abrir módulo de Chamadas"
                              >
                                {rotuloChamada}
                              </Badge>
                              <div className="flex items-center gap-1 flex-wrap">
                                {chamadaEncontrada.programa && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {chamadaEncontrada.programa}
                                  </span>
                                )}
                                {chamadaEncontrada.dependencia_administrativa && (
                                  <span className="text-[10px] text-muted-foreground">
                                    • {chamadaEncontrada.dependencia_administrativa}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono">
                              {rotuloChamada}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{contract.tipo || 'PNAE'}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge
                              variant={
                                contract.modalidade_pedido === 'centralizado'
                                  ? 'secondary'
                                  : 'default'
                              }
                              className="capitalize text-xs"
                            >
                              {contract.modalidade_pedido || 'individualizado'}
                            </Badge>
                            {contract.modalidade_pedido === 'centralizado' && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                                Imp:{' '}
                                {contract.tipo_importacao === 'fracionada' ? 'Fracionada' : 'Única'}
                                {contract.tipo_importacao !== 'fracionada' &&
                                  (contract.abas_planilha ? ' (com abas)' : ' (simples)')}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className="text-xs text-muted-foreground"
                            title={contract.escolas.map((e) => e.escolaNome).join(', ')}
                          >
                            {contract.escolas.length > 0
                              ? `${contract.escolas.length} escola(s) vinculada(s)`
                              : 'Nenhuma escola vinculada'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              contract.status === 'Ativo'
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : contract.status === 'Encerrado'
                                  ? 'bg-slate-600 text-slate-100 dark:bg-slate-700 hover:bg-slate-600 border border-slate-500/40'
                                  : contract.status === 'Cancelado'
                                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                                    : 'bg-muted text-muted-foreground border'
                            }
                          >
                            {contract.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          R${' '}
                          {contract.totalValue.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell className="text-right font-medium text-emerald-600">
                          R${' '}
                          {contract.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Progress value={percentage} className="h-2" />
                            <span className="text-[10px] text-muted-foreground text-right">
                              {percentage.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary"
                              title="Relatório de Execução"
                              onClick={() => handleOpenReport(contract)}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              title="Ver detalhes"
                              onClick={() => handleOpenDetails(contract)}
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                            {isAdmin && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  title="Editar contrato"
                                  onClick={() => handleOpenEdit(contract)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {contract.status === 'Ativo' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400"
                                      title="Encerrar contrato"
                                      onClick={() => handleOpenEncerrar(contract)}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                                      title="Cancelar contrato"
                                      onClick={() => handleOpenCancelar(contract)}
                                    >
                                      <Ban className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  title="Excluir contrato"
                                  onClick={() => handleOpenDelete(contract)}
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

      {/* DIALOG DE CADASTRO / EDIÇÃO DE CONTRATO (COM N ESCOLAS E ROTAS) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[96vw] sm:max-w-5xl md:max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingContract
                ? `Editar Contrato ${editingContract.numero}`
                : 'Cadastrar Novo Contrato'}
            </DialogTitle>
            <DialogDescription>
              Configure os dados cadastrais, as escolas participantes e a tabela de produtos com
              preços acordados.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <Tabs defaultValue="geral" className="w-full">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="geral">Dados Gerais</TabsTrigger>
                <TabsTrigger value="escolas">Escolas ({contractSchoolsForm.length})</TabsTrigger>
                <TabsTrigger value="produtos">Itens & Preços ({contractItems.length})</TabsTrigger>
              </TabsList>

              {/* Aba 1: Dados Gerais */}
              <TabsContent value="geral" className="space-y-4 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="c-num">
                      Número / Identificador <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="c-num"
                      placeholder="Ex: C-2026-05"
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="c-chamada-select">
                      Chamada Pública <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={chamadaId}
                      onValueChange={(val) => {
                        setChamadaId(val)
                        const ch = chamadas.find((c) => c.id === val)
                        if (ch) {
                          setNumeroChamada(ch.chamada)
                          if (ch.programa) setTipo(ch.programa)
                          if (ch.modalidade) setModalidade(ch.modalidade)
                        }
                        // Ao trocar chamada: recarregar itens preservando quantidades por produto_id
                        loadItemsForChamada(val, contractItems)
                      }}
                      required
                    >
                      <SelectTrigger
                        id="c-chamada-select"
                        className={!chamadaId ? 'border-destructive/60' : ''}
                      >
                        <SelectValue placeholder="Selecione a Chamada vinculada..." />
                      </SelectTrigger>
                      <SelectContent>
                        {chamadas.length === 0 ? (
                          <div className="p-2 text-xs text-muted-foreground">
                            Nenhuma chamada cadastrada. Cadastre em /chamadas.
                          </div>
                        ) : (
                          chamadas.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id}>
                              {ch.chamada} {ch.programa ? `(${ch.programa})` : ''} - {ch.status}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Vínculo obrigatório: todo contrato pertence a uma chamada pública.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="c-tipo">Tipo de Programa</Label>
                    <Input
                      id="c-tipo"
                      value={
                        tipo === 'PNAE'
                          ? 'PNAE (Alimentação Escolar)'
                          : tipo === 'PAA'
                            ? 'PAA (Aquisição de Alimentos)'
                            : tipo === 'Municipal'
                              ? 'Municipal / Direto'
                              : tipo || 'PNAE (Alimentação Escolar)'
                      }
                      readOnly
                      disabled
                      tabIndex={-1}
                      className="bg-muted cursor-not-allowed font-medium"
                      title="O Programa e a Modalidade são herdados da Chamada Pública vinculada e só podem ser alterados no módulo Chamadas (/chamadas)."
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Herdado da Chamada Pública. Altere em{' '}
                      <span className="font-semibold">/chamadas</span>.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="c-modalidade">Modalidade de Pedido</Label>
                    <Input
                      id="c-modalidade"
                      value={
                        modalidade === 'centralizado'
                          ? 'Centralizado (Consolidado por Importação de Planilha)'
                          : 'Individualizado (Pedido por Escola via WhatsApp/Manual)'
                      }
                      readOnly
                      disabled
                      tabIndex={-1}
                      className="bg-muted cursor-not-allowed font-medium"
                      title="O Programa e a Modalidade são herdados da Chamada Pública vinculada e só podem ser alterados no módulo Chamadas (/chamadas)."
                    />
                    <p className="text-[10px] text-muted-foreground">
                      O Programa e a Modalidade são herdados da Chamada Pública vinculada e só podem
                      ser alterados no módulo Chamadas (/chamadas).
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="c-status">Status</Label>
                    <Select
                      value={status}
                      onValueChange={(v) =>
                        setStatus(v as 'Ativo' | 'Encerrado' | 'Cancelado' | 'Pendente')
                      }
                    >
                      <SelectTrigger id="c-status">
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

                {/* Regras específicas para Modalidade Centralizada */}
                {modalidade === 'centralizado' && (
                  <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-4">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">
                          Configurações de Importação Centralizada
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Defina se a planilha da secretaria é importada de forma única ou
                          fracionada.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="c-tipo-importacao">Tipo de Importação</Label>
                        <Select
                          value={tipoImportacao}
                          onValueChange={(v) => setTipoImportacao(v as 'unica' | 'fracionada')}
                        >
                          <SelectTrigger id="c-tipo-importacao" className="bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unica">
                              Única (Planilha consolidada única)
                            </SelectItem>
                            <SelectItem value="fracionada">
                              Fracionada (Múltiplas planilhas por ciclo/período)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          {tipoImportacao === 'unica'
                            ? 'A secretaria envia um arquivo unificado contendo o pedido.'
                            : 'A secretaria envia arquivos fracionados (remessas/semanas) ao longo do contrato.'}
                        </p>
                      </div>

                      {tipoImportacao === 'unica' && (
                        <div className="space-y-2">
                          <Label htmlFor="c-tem-abas">Estrutura da Planilha Única</Label>
                          <Select
                            value={planilhaTemAbas ? 'com_abas' : 'sem_abas'}
                            onValueChange={(v) => {
                              const hasTabs = v === 'com_abas'
                              setPlanilhaTemAbas(hasTabs)
                              if (!hasTabs) {
                                setAbasPlanilhaTexto('')
                              }
                            }}
                          >
                            <SelectTrigger id="c-tem-abas" className="bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sem_abas">
                                Planilha Simples (sem abas / aba única)
                              </SelectItem>
                              <SelectItem value="com_abas">
                                Planilha com Abas (múltiplas abas por rota/setor)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-[11px] text-muted-foreground">
                            {planilhaTemAbas
                              ? 'O arquivo possui várias abas (ex: abas por rota ou escola).'
                              : 'Arquivo simples em folha única contendo os pedidos.'}
                          </p>
                        </div>
                      )}
                    </div>

                    {tipoImportacao === 'unica' && planilhaTemAbas && (
                      <div className="space-y-2 pt-1 border-t border-primary/20">
                        <Label htmlFor="c-abas-input" className="flex items-center justify-between">
                          <span>
                            Nomes das Abas da Planilha <span className="text-destructive">*</span>
                          </span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            Separados por ponto e vírgula (;)
                          </span>
                        </Label>
                        <Input
                          id="c-abas-input"
                          placeholder="Ex: ROTA A; ROTA B; ROTA C; ZONA RURAL"
                          className="bg-background font-mono text-xs"
                          value={abasPlanilhaTexto}
                          onChange={(e) => setAbasPlanilhaTexto(e.target.value)}
                          required={tipoImportacao === 'unica' && planilhaTemAbas}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Cadastre os nomes exatos das abas presentes no arquivo Excel, separados
                          por ponto e vírgula (;). Exemplo:{' '}
                          <code className="text-primary font-semibold">
                            ROTA 01;ROTA 02;ROTA 03
                          </code>
                          .
                        </p>
                        {abasPlanilhaTexto.trim() && (
                          <div className="flex flex-wrap gap-1 pt-1.5">
                            <span className="text-[10px] font-medium text-muted-foreground self-center mr-1">
                              Abas cadastradas:
                            </span>
                            {abasPlanilhaTexto
                              .split(';')
                              .map((tab) => tab.trim())
                              .filter(Boolean)
                              .map((tab, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="text-[10px] bg-background border"
                                >
                                  {tab}
                                </Badge>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Valor Total do Contrato: calculado automaticamente vs informado diretamente */}
                <div className="space-y-2 p-3.5 rounded-lg border bg-muted/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Label
                        htmlFor="c-total"
                        className="font-semibold text-foreground flex items-center gap-2"
                      >
                        <DollarSign className="h-4 w-4 text-primary" />
                        Valor Total do Contrato (R$){' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          (opcional na criação)
                        </span>
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {contractItems.some((it) => (it.quantity || 0) > 0)
                          ? 'Recalculado automaticamente pela soma dos itens (preço unitário × quantidade contratada). O valor anterior é sobreposto.'
                          : 'Opcional na criação. Pode ser 0 ou deixado em branco; se quantidades forem informadas posteriormente nos itens, o valor total será recalculado e sobreposto.'}
                      </p>
                    </div>

                    <div>
                      {contractItems.some((it) => (it.quantity || 0) > 0) ? (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/10 text-emerald-700 border-emerald-300 font-medium"
                        >
                          Total calculado pelos itens
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground font-medium">
                          Total manual / inicial (0 ou vazio permitido)
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="relative pt-1">
                    <DollarSign className="absolute left-2.5 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="c-total"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00 (opcional na criação)"
                      className={`pl-9 font-mono text-sm font-semibold ${
                        contractItems.some((it) => (it.quantity || 0) > 0)
                          ? 'bg-muted/50 cursor-not-allowed border-dashed'
                          : ''
                      }`}
                      readOnly={contractItems.some((it) => (it.quantity || 0) > 0)}
                      value={valorTotal}
                      onChange={(e) => setValorTotal(e.target.value)}
                    />
                  </div>

                  {contractItems.some((it) => (it.quantity || 0) > 0) && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Calculator className="h-3.5 w-3.5 text-primary shrink-0" />
                      Para alterar o valor total, altere as quantidades ou preços na aba{' '}
                      <strong>Itens & Preços</strong>.
                    </p>
                  )}
                </div>
              </TabsContent>

              {/* Aba 2: Escolas Participantes (Cadastro Mestre Global + Vínculo com Aba da Planilha) */}
              <TabsContent value="escolas" className="space-y-4 pt-3">
                {/* Gestão das Abas da Planilha deste Contrato */}
                <div className="space-y-3 p-3.5 rounded-lg border bg-muted/20">
                  <div>
                    <Label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Abas da Planilha a Importar (Nomes
                      Livres deste Contrato)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Cadastre os nomes das abas da planilha deste contrato (ex.: ROTA A, ROTA B,
                      ZONA SUL, CIRCUITO 1...). Esses nomes serão casados na importação Excel e
                      atribuídos às escolas participantes abaixo.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome livre da aba da planilha (ex.: ROTA A, ZONA NORTE...)"
                      value={newRotaNome}
                      onChange={(e) => setNewRotaNome(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddRota()
                        }
                      }}
                      className="h-8 text-xs bg-background"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddRota}
                      className="h-8 gap-1 text-xs shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5 text-primary" /> Adicionar Aba
                    </Button>
                  </div>

                  {contractRotas.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">
                      Nenhuma aba da planilha cadastrada ainda para este contrato. Cadastre acima
                      para selecionar nas escolas.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto">
                      {contractRotas.map((r, idx) => {
                        const countInForm = contractSchoolsForm.filter((cs) => {
                          const val = (cs.rotaId || '').trim().toLowerCase()
                          return (
                            (r.id && val === r.id.toLowerCase()) ||
                            val === r.nome.trim().toLowerCase()
                          )
                        }).length

                        return (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="pl-2.5 pr-1 py-1 text-xs font-medium flex items-center gap-1.5 bg-background border hover:border-primary/50 transition-colors"
                          >
                            <span className="font-semibold">{r.nome}</span>
                            <span className="text-[10px] text-muted-foreground px-1 py-0.2 rounded bg-muted/60">
                              {countInForm} esc.
                            </span>
                            {editingContract && (
                              <button
                                type="button"
                                className="rounded-full hover:bg-primary/20 text-primary p-0.5 transition-colors ml-0.5"
                                title="Editar escolas desta aba"
                                onClick={() => handleOpenRouteEditor(r, editingContract)}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive p-0.5 transition-colors"
                              title="Remover aba da planilha"
                              onClick={() => handleRemoveRota(idx)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-t pt-3">
                  <div>
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <Globe className="h-4 w-4 text-primary" /> Vínculo de Escolas (Cadastro Mestre
                      Global)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Busque no cadastro mestre global para vincular ao contrato com a Aba da
                      Planilha correspondente, ou cadastre uma nova escola sem duplicar.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={schools.length === 0}
                                  className="h-8 text-xs gap-1.5 bg-background shadow-xs hover:border-primary/50 text-foreground"
                                >
                                  <Download className="h-3.5 w-3.5 text-primary" />
                                  Exportar
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-xs">
                                <DropdownMenuItem onClick={handleExportSchoolsCSV}>
                                  CSV (.csv)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportSchoolsXLSX}>
                                  Excel (.xlsx)
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TooltipTrigger>
                        {schools.length === 0 && (
                          <TooltipContent>
                            <p className="text-xs">
                              Nenhuma escola cadastrada no momento para exportar
                            </p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 bg-background shadow-xs hover:border-primary/50 text-foreground"
                      onClick={() => setSchoolImportDialogOpen(true)}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                      Importar CSV / Planilha
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs shrink-0 gap-1.5"
                      onClick={() => setShowQuickCreateSchool(!showQuickCreateSchool)}
                    >
                      <Plus className="h-3.5 w-3.5 text-primary" />
                      {showQuickCreateSchool ? 'Ocultar Cadastro' : 'Cadastrar Nova Escola'}
                    </Button>
                  </div>
                </div>

                {/* Painel de Cadastro Rápido de Escola Nova no Mestre */}
                {showQuickCreateSchool && (
                  <div className="p-3 rounded-lg border bg-primary/5 border-primary/30 space-y-3 animate-fade-in text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-primary flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" /> Nova Escola no Cadastro Mestre Global
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Duplicações são prevenidas automaticamente por nome normalizado.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="qk-nome" className="text-[11px]">
                          Nome da Instituição <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="qk-nome"
                          placeholder="Ex: E.M. Darcy Ribeiro"
                          className="h-8 text-xs"
                          value={quickSchoolName}
                          onChange={(e) => setQuickSchoolName(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="qk-tipo" className="text-[11px]">
                          Tipo de Instituição
                        </Label>
                        <Select
                          value={quickSchoolTipo || 'none'}
                          onValueChange={(val) => setQuickSchoolTipo(val === 'none' ? '' : val)}
                        >
                          <SelectTrigger id="qk-tipo" className="h-8 text-xs">
                            <SelectValue placeholder="Selecione tipo (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum (Vazio)</SelectItem>
                            <SelectItem value="CMEI">CMEI</SelectItem>
                            <SelectItem value="CRECHE">CRECHE</SelectItem>
                            <SelectItem value="INTEGRAL">INTEGRAL</SelectItem>
                            <SelectItem value="FUNDAMENTAL">FUNDAMENTAL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="qk-rota" className="text-[11px]">
                          Aba da Planilha no Vínculo do Contrato
                        </Label>
                        <Select
                          value={quickSchoolRotaPlanilha || ''}
                          onValueChange={setQuickSchoolRotaPlanilha}
                        >
                          <SelectTrigger id="qk-rota" className="h-8 text-xs">
                            <SelectValue placeholder="Selecione aba da planilha (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            {contractRotas.length === 0 ? (
                              <SelectItem value="none" disabled>
                                Nenhuma aba cadastrada no contrato
                              </SelectItem>
                            ) : (
                              contractRotas.map((cr, i) => (
                                <SelectItem key={i} value={cr.nome}>
                                  {cr.nome}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="qk-tel" className="text-[11px]">
                          Telefone
                        </Label>
                        <Input
                          id="qk-tel"
                          placeholder="(11) 98765-4321"
                          className="h-8 text-xs"
                          value={quickSchoolContact}
                          onChange={(e) => setQuickSchoolContact(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="qk-email" className="text-[11px]">
                          E-mail
                        </Label>
                        <Input
                          id="qk-email"
                          type="email"
                          placeholder="escola@educacao.gov.br"
                          className="h-8 text-xs"
                          value={quickSchoolEmail}
                          onChange={(e) => setQuickSchoolEmail(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="qk-end" className="text-[11px]">
                          Endereço
                        </Label>
                        <Input
                          id="qk-end"
                          placeholder="Rua, número, bairro..."
                          className="h-8 text-xs"
                          value={quickSchoolAddress}
                          onChange={(e) => setQuickSchoolAddress(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowQuickCreateSchool(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        disabled={isCreatingQuickSchool || !quickSchoolName.trim()}
                        onClick={handleQuickCreateSchool}
                      >
                        {isCreatingQuickSchool ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Salvar & Vincular
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Campo de Autocomplete / Busca no Cadastro Mestre */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar escolas no cadastro mestre global por nome, tipo ou rota..."
                    className="pl-8 h-8 text-xs bg-card"
                    value={schoolSearchQuery}
                    onChange={(e) => setSchoolSearchQuery(e.target.value)}
                  />
                </div>

                {/* Resumo de Vínculos Atuais */}
                <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
                  <span>
                    <strong>{contractSchoolsForm.length}</strong> escola(s) vinculada(s) a este
                    contrato
                  </span>
                  {schoolSearchQuery && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] p-0 text-muted-foreground"
                      onClick={() => setSchoolSearchQuery('')}
                    >
                      Limpar filtro
                    </Button>
                  )}
                </div>

                {/* Lista de Escolas com Autocomplete e Seleção */}
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {schools
                    .filter((sch) => {
                      if (!schoolSearchQuery) return true
                      const q = schoolSearchQuery.toLowerCase()
                      return (
                        sch.name.toLowerCase().includes(q) ||
                        (sch.tipo && sch.tipo.toLowerCase().includes(q)) ||
                        sch.route.toLowerCase().includes(q) ||
                        sch.address.toLowerCase().includes(q)
                      )
                    })
                    .sort((a, b) => {
                      // Colocar vinculadas no topo
                      const aLinked = contractSchoolsForm.some((s) => s.escolaId === a.id)
                      const bLinked = contractSchoolsForm.some((s) => s.escolaId === b.id)
                      if (aLinked && !bLinked) return -1
                      if (!aLinked && bLinked) return 1
                      return a.name.localeCompare(b.name)
                    })
                    .map((sch) => {
                      const isSelected = contractSchoolsForm.some((s) => s.escolaId === sch.id)
                      const assignedLink = contractSchoolsForm.find((s) => s.escolaId === sch.id)

                      return (
                        <div
                          key={sch.id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border text-xs transition-colors ${
                            isSelected
                              ? 'bg-primary/5 border-primary/40 shadow-xs'
                              : 'bg-muted/10 border-border opacity-75 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  // Se já estava selecionada, desmarcar é desvincular -> abre o diálogo
                                  const existingCe = editingContract
                                    ? contractSchools.find(
                                        (cs) =>
                                          cs.contrato_id === editingContract.id &&
                                          cs.escola_id === sch.id &&
                                          !cs.encerrado_em,
                                      )
                                    : null

                                  setDesvincularEscolaDialogState({
                                    open: true,
                                    escolaId: sch.id,
                                    escolaNome: sch.name,
                                    contratoEscolaId: existingCe?.id || null,
                                  })
                                } else {
                                  handleToggleSchool(sch.id)
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-semibold text-foreground truncate">{sch.name}</p>
                                {sch.tipo && (
                                  <Badge variant="outline" className="text-[9px] py-0 px-1">
                                    {sch.tipo}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {sch.address || 'Endereço não informado'}
                              </p>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                              <div className="w-48">
                                <Label className="text-[9px] text-muted-foreground block mb-0.5">
                                  Aba da Planilha
                                </Label>
                                <Select
                                  value={assignedLink?.rotaId || ''}
                                  onValueChange={(val) =>
                                    handleSchoolRotaChange(sch.id, val === 'none' ? '' : val)
                                  }
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="Selecione a aba da planilha..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">
                                      <em>Sem aba atribuída</em>
                                    </SelectItem>
                                    {contractRotas.map((cr, i) => (
                                      <SelectItem key={i} value={cr.nome}>
                                        {cr.nome}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0 mt-3"
                                title="Desvincular"
                                onClick={() => {
                                  // Localiza o vínculo persistido caso seja edição de contrato existente
                                  const existingCe = editingContract
                                    ? contractSchools.find(
                                        (cs) =>
                                          cs.contrato_id === editingContract.id &&
                                          cs.escola_id === sch.id &&
                                          !cs.encerrado_em,
                                      )
                                    : null

                                  setDesvincularEscolaDialogState({
                                    open: true,
                                    escolaId: sch.id,
                                    escolaNome: sch.name,
                                    contratoEscolaId: existingCe?.id || null,
                                  })
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}

                  {schools.length === 0 && (
                    <div className="py-6 text-center text-muted-foreground text-xs">
                      Nenhuma escola cadastrada no cadastro mestre global. Cadastre pelo botão
                      acima.
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Aba 4: Produtos e Preços Acordados */}
              <TabsContent value="produtos" className="pt-2">
                {isLoadingItems ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span>Carregando itens do contrato...</span>
                  </div>
                ) : (
                  <ContractItemsManager
                    items={contractItems}
                    onChange={(newItems) => {
                      setContractItems(newItems)
                      // Recalcula total se houver quantidades e sobrepõe qualquer valor anterior
                      const comQtd = newItems.filter((i) => (i.quantity || 0) > 0)
                      if (comQtd.length > 0) {
                        const totalCalc = newItems.reduce(
                          (acc, it) => acc + (it.price || 0) * (it.quantity || 0),
                          0,
                        )
                        setValorTotal(totalCalc.toFixed(2))
                      }
                    }}
                    catalogProducts={products}
                    onTotalCalculadoChange={(total, hasQuantities) => {
                      if (hasQuantities) {
                        setValorTotal(total.toFixed(2))
                      }
                    }}
                    contractId={editingContract?.id}
                    contractNumber={numero || editingContract?.numero}
                    chamadaId={chamadaId || editingContract?.chamada_id}
                  />
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="pt-4 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                {!editingContract && contractItems.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      {contractItems.length} item(ns) importado(s) pendente(s) de confirmação.
                      Clique em &quot;Cadastrar Contrato&quot; para gravar no banco.
                    </span>
                  </span>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
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
                  ) : editingContract ? (
                    'Salvar Alterações'
                  ) : (
                    'Cadastrar Contrato'
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO DE IMPORTAÇÃO EM MASSA DE CONTRATOS (XLSX / CSV / COLAR) */}
      <ContractBatchImportDialog
        open={contractBatchImportDialogOpen}
        onOpenChange={setContractBatchImportDialogOpen}
        onSuccess={async () => {
          await refreshData()
        }}
      />

      {/* DIÁLOGO DE IMPORTAÇÃO DE ESCOLAS CSV / PLANILHA PARA O CONTRATO */}
      <ContractSchoolImportDialog
        open={schoolImportDialogOpen}
        onOpenChange={setSchoolImportDialogOpen}
        contractId={editingContract?.id}
        contractRotas={contractRotas}
        masterSchools={schools}
        allContracts={contracts}
        currentLinkedSchoolIds={new Set(contractSchoolsForm.map((s) => s.escolaId))}
        onSuccess={async (importedLinks: ImportedSchoolLinkResult[]) => {
          // Atualiza a lista de escolas do formulário
          setContractSchoolsForm((prev) => {
            const map = new Map<string, string>() // escolaId -> rotaId (opcional/legado)
            for (const item of prev) {
              map.set(item.escolaId, item.rotaId || '')
            }
            for (const imp of importedLinks) {
              map.set(imp.escolaId, imp.rotaPlanilha || map.get(imp.escolaId) || '')
            }
            return Array.from(map.entries()).map(([escolaId, rotaId]) => ({
              escolaId,
              rotaId,
            }))
          })

          // Atualizar o contexto global de escolas, contratos e vínculos
          await refreshData()
        }}
      />

      {/* DIALOG DE EDIÇÃO DE ROTAS DO CONTRATO (INCLUIR/RETIRAR ESCOLAS) */}
      <ContractRouteSchoolEditorDialog
        open={routeEditorOpen}
        onOpenChange={setRouteEditorOpen}
        contract={routeEditorContract}
        route={editingRouteInfo}
        allContracts={contracts}
        masterSchools={schools}
        onSuccess={async () => {
          await refreshData()
          // Atualiza também viewingContract se estiver aberto
          if (viewingContract) {
            const fresh = contracts.find((c) => c.id === viewingContract.id)
            if (fresh) {
              setViewingContract(fresh)
            }
          }
          if (editingContract) {
            const fresh = contracts.find((c) => c.id === editingContract.id)
            if (fresh) {
              setEditingContract(fresh)
              setContractSchoolsForm(
                fresh.escolas.map((e) => ({
                  escolaId: e.escolaId,
                  rotaId: e.rotaId || e.rotaPlanilha || '',
                })),
              )
            }
          }
        }}
      />

      {/* DIALOG DE RELATÓRIO DE EXECUÇÃO DO CONTRATO */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Relatório de Execução do Contrato{' '}
              {reportContract?.numero}
            </DialogTitle>
            <DialogDescription>
              Acompanhamento de entregas, valores realizados e produtos fornecidos por escola
              participante.
            </DialogDescription>
          </DialogHeader>

          {reportData && (
            <div className="space-y-4 pt-2">
              {/* Cards Globais de Execução */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Contratado</p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      R${' '}
                      {reportData.totalContratado.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-emerald-500/10 border-emerald-500/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Realizado</p>
                    <p className="text-xl font-bold text-emerald-600 mt-1">
                      R${' '}
                      {reportData.totalRealizado.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-blue-500/10 border-blue-500/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">% Execução Global</p>
                    <p className="text-xl font-bold text-blue-600 mt-1">
                      {reportData.percentExecucaoGlobal.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabela de Execução por Escola Participante */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold">Execução por Escola Participante</h4>
                {reportData.escolasReport.map((esc) => (
                  <Card key={esc.escolaId} className="border">
                    <CardHeader className="py-3 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm font-bold text-primary">
                            {esc.escolaNome}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Rota: {esc.rotaNome}
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Valor Realizado</p>
                          <p className="text-sm font-bold text-foreground">
                            R${' '}
                            {esc.totalRealizadoValor.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead>Produto</TableHead>
                            <TableHead className="text-right">Preço Unitário</TableHead>
                            <TableHead className="text-right">Cota Contratada</TableHead>
                            <TableHead className="text-right">Qtd. Realizada</TableHead>
                            <TableHead className="text-right">Valor Realizado</TableHead>
                            <TableHead className="w-[90px] text-right">% Item</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {esc.itens.map((it) => (
                            <TableRow key={it.produtoId} className="text-xs">
                              <TableCell className="font-medium">{it.produtoNome}</TableCell>
                              <TableCell className="text-right font-mono">
                                R$ {(it.preco || 0).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                {it.cotaContratada && it.cotaContratada > 0 ? (
                                  <span className="font-semibold text-foreground">
                                    {it.cotaContratada} {it.unidade}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/60">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-primary font-semibold">
                                {it.realizadoQtd} {it.unidade}
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">
                                R$ {it.realizadoValor.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-[11px]">
                                {it.cotaContratada && it.cotaContratada > 0 ? (
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] py-0 px-1 font-mono ${
                                      it.percentExecucao >= 100
                                        ? 'text-emerald-700 border-emerald-300 bg-emerald-50'
                                        : 'text-primary border-primary/30'
                                    }`}
                                  >
                                    {it.percentExecucao.toFixed(0)}%
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">
                                    {it.percentExecucao.toFixed(0)}%
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG DE ENCERRAMENTO DE CONTRATO */}
      <EncerrarContratoDialog
        open={encerrarDialogOpen}
        onOpenChange={setEncerrarDialogOpen}
        contract={contractToEncerrar}
        onSuccess={() => setContractToEncerrar(null)}
      />

      {/* DIALOG DE CANCELAMENTO DE CONTRATO */}
      <CancelarContratoDialog
        open={cancelarDialogOpen}
        onOpenChange={setCancelarDialogOpen}
        contract={contractToCancelar}
        onSuccess={() => setContractToCancelar(null)}
      />

      {/* DIALOG DE DESVINCULAÇÃO DE ESCOLA */}
      <DesvincularEscolaDialog
        open={desvincularEscolaDialogState.open}
        onOpenChange={(open) => setDesvincularEscolaDialogState((prev) => ({ ...prev, open }))}
        contractId={editingContract?.id || null}
        contratoEscolaId={desvincularEscolaDialogState.contratoEscolaId}
        chamadaId={chamadaId || editingContract?.chamada_id || null}
        escolaId={desvincularEscolaDialogState.escolaId}
        escolaNome={desvincularEscolaDialogState.escolaNome}
        onRemoveDraft={() => {
          handleRemoveSchoolLink(desvincularEscolaDialogState.escolaId)
        }}
        onSuccess={async () => {
          // Remove do estado local do formulário para atualizar a UI imediatamente
          setContractSchoolsForm((prev) =>
            prev.filter((s) => s.escolaId !== desvincularEscolaDialogState.escolaId),
          )
          await refreshData()
          if (editingContract) {
            setEditingContract((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                escolas: prev.escolas.filter(
                  (e) => e.escolaId !== desvincularEscolaDialogState.escolaId,
                ),
              }
            })
          }
          if (viewingContract) {
            setViewingContract((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                escolas: prev.escolas.filter(
                  (e) => e.escolaId !== desvincularEscolaDialogState.escolaId,
                ),
              }
            })
          }
        }}
      />

      {/* DIALOG DE EXCLUSÃO */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar Exclusão de Contrato
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente remover o contrato <strong>{contractToDelete?.numero}</strong>? Isso
              removerá os vínculos de escolas, rotas e itens acordados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDelete()
              }}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir Contrato'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DIALOG DE DETALHES GERAIS */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Contrato {viewingContract?.numero}</DialogTitle>
            <DialogDescription>
              {viewingContract?.tipo || 'PNAE'}
              {viewingContract?.chamadaDependenciaAdministrativa && (
                <> • Dep. Administrativa: {viewingContract.chamadaDependenciaAdministrativa}</>
              )}{' '}
              • Modalidade: {viewingContract?.modalidade_pedido || 'individualizado'}
              {viewingContract?.modalidade_pedido === 'centralizado' && (
                <>
                  {' '}
                  • Importação:{' '}
                  {viewingContract?.tipo_importacao === 'fracionada'
                    ? 'Fracionada'
                    : `Única ${viewingContract?.abas_planilha ? '(com abas)' : '(simples)'}`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {viewingContract && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded border bg-muted/20">
                  <p className="text-muted-foreground">Valor Total</p>
                  <p className="text-base font-bold text-foreground">
                    R$ {viewingContract.totalValue.toFixed(2)}
                  </p>
                </div>
                <div className="p-3 rounded border bg-muted/20">
                  <p className="text-muted-foreground">Saldo Restante</p>
                  <p className="text-base font-bold text-emerald-600">
                    R$ {viewingContract.balance.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Informações sobre Status Encerrado / Cancelado */}
              {viewingContract.status === 'Cancelado' && (
                <div className="p-3 rounded-lg border border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Ban className="h-4 w-4 text-amber-600" />
                    <span>Contrato Cancelado</span>
                  </div>
                  {viewingContract.motivo_cancelamento && (
                    <p className="text-[11px] leading-relaxed pt-0.5">
                      <strong>Motivo:</strong> {viewingContract.motivo_cancelamento}
                    </p>
                  )}
                  {viewingContract.encerrado_em && (
                    <p className="text-[10px] text-muted-foreground dark:text-amber-300/70">
                      Cancelado em:{' '}
                      {new Date(viewingContract.encerrado_em).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
              )}

              {viewingContract.status === 'Encerrado' && viewingContract.encerrado_em && (
                <div className="p-3 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <XCircle className="h-4 w-4 text-slate-600" />
                    <span>Contrato Encerrado</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Encerrado em:{' '}
                    {new Date(viewingContract.encerrado_em).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              )}

              {/* Seção: Configuração da Importação (se modalidade centralizada) */}
              {viewingContract.modalidade_pedido === 'centralizado' && (
                <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <FileSpreadsheet className="h-4 w-4 text-primary" /> Regra de Importação
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {viewingContract.tipo_importacao === 'fracionada'
                        ? 'Importação Fracionada'
                        : 'Importação Única'}
                    </Badge>
                  </div>
                  {viewingContract.tipo_importacao !== 'fracionada' && (
                    <div className="text-[11px] text-muted-foreground space-y-1">
                      <p>
                        Estrutura:{' '}
                        <strong className="text-foreground">
                          {viewingContract.abas_planilha ? 'Planilha com abas' : 'Planilha simples'}
                        </strong>
                      </p>
                      {viewingContract.abas_planilha && (
                        <div>
                          <p className="mb-1 font-medium text-foreground">Abas cadastradas:</p>
                          <div className="flex flex-wrap gap-1">
                            {viewingContract.abas_planilha
                              .split(';')
                              .map((tab) => tab.trim())
                              .filter(Boolean)
                              .map((tab, idx) => (
                                <Badge
                                  key={idx}
                                  variant="outline"
                                  className="text-[10px] bg-background font-mono"
                                >
                                  {tab}
                                </Badge>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Seção 1: Escolas por Aba da Planilha */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                    <FileSpreadsheet className="h-4 w-4 text-primary" /> Escolas por Aba da Planilha
                  </h4>
                  <Badge variant="outline" className="text-[10px]">
                    Referência da Secretaria ({viewingContract.escolas.length} escolas)
                  </Badge>
                </div>
                {(() => {
                  // Agrupar escolas por aba da planilha
                  const agrupadoPorPlanilha = new Map<string, typeof viewingContract.escolas>()
                  for (const esc of viewingContract.escolas) {
                    const rNome = esc.rotaPlanilha || esc.rotaNome || 'Sem Rota'
                    const list = agrupadoPorPlanilha.get(rNome) || []
                    list.push(esc)
                    agrupadoPorPlanilha.set(rNome, list)
                  }

                  if (agrupadoPorPlanilha.size === 0) {
                    return (
                      <div className="p-2.5 rounded bg-muted/20 border text-muted-foreground text-center text-xs">
                        Nenhuma escola vinculada ao contrato.
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-2">
                      {Array.from(agrupadoPorPlanilha.entries()).map(
                        ([rotaNome, escolasNaRota]) => (
                          <div
                            key={rotaNome}
                            className="p-2.5 rounded bg-muted/20 border space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="text-foreground">Aba: {rotaNome}</span>
                              <div className="flex items-center gap-1.5">
                                <Badge variant="secondary" className="text-[10px]">
                                  {escolasNaRota.length} escola(s)
                                </Badge>
                                {rotaNome !== 'Sem Rota' && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[11px] gap-1 text-primary border-primary/40 hover:bg-primary/10"
                                    onClick={() => {
                                      const rotaObj = rotas.find(
                                        (r) =>
                                          r.contrato_id === viewingContract.id &&
                                          r.nome.toLowerCase() === rotaNome.toLowerCase(),
                                      )
                                      handleOpenRouteEditor(
                                        {
                                          id: rotaObj?.id,
                                          nome: rotaNome,
                                          ordem: rotaObj?.ordem || 1,
                                        },
                                        viewingContract,
                                      )
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" /> Editar Aba
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {escolasNaRota.map((e) => (
                                <Badge
                                  key={e.id}
                                  variant="outline"
                                  className="text-[10px] bg-background font-normal"
                                >
                                  {e.escolaNome}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Seção 2: Escolas por Rota da Cooperativa */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                    <Truck className="h-4 w-4 text-amber-600" /> Escolas por Rota
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-primary gap-1"
                    onClick={() => {
                      setDetailsDialogOpen(false)
                      const params = new URLSearchParams()
                      if (viewingContract.chamada_id) {
                        params.set('chamadaId', viewingContract.chamada_id)
                      } else if (viewingContract.id) {
                        params.set('contratoId', viewingContract.id)
                      }
                      navigate(`/rotas${params.toString() ? `?${params.toString()}` : ''}`)
                    }}
                  >
                    <SlidersHorizontal className="h-3 w-3" /> Configurar no Roteamento & Despacho
                  </Button>
                </div>
                {(() => {
                  const rawLogRoutes = rotasLogisticas.filter(
                    (r) => r.contrato_id === viewingContract.id,
                  )
                  const seenIds = new Set<string>()
                  const seenNames = new Set<string>()
                  const logRoutes = rawLogRoutes.filter((r) => {
                    if (seenIds.has(r.id)) return false
                    seenIds.add(r.id)
                    const norm = (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()
                    if (seenNames.has(norm)) return false
                    seenNames.add(norm)
                    return true
                  })
                  // Identificar escolas sem rota logística neste contrato
                  const escolasSemRotaLogistica = viewingContract.escolas.filter((e) => {
                    const parada = paradasRota.find((p) => p.escola_id === e.escolaId)
                    return !parada && !e.rotaLogisticaId
                  })

                  return (
                    <div className="space-y-2">
                      {logRoutes.map((r) => {
                        // Paradas desta rota
                        const paradas = paradasRota
                          .filter((p) => (p.rota_id || (p as any).rota_logistica_id) === r.id)
                          .sort((a, b) => a.ordem - b.ordem)
                        const count = paradas.length

                        return (
                          <div
                            key={r.id}
                            className="p-2.5 rounded bg-amber-500/5 border border-amber-200/50 space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="text-foreground flex items-center gap-1">
                                <Truck className="h-3 w-3 text-amber-600" /> Rota {r.nome}
                              </span>
                              <Badge
                                variant="secondary"
                                className="text-[10px] bg-amber-100 text-amber-800"
                              >
                                {count} parada(s)
                              </Badge>
                            </div>
                            {count > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {paradas.map((p) => {
                                  const escObj = viewingContract.escolas.find(
                                    (e) => e.escolaId === p.escola_id,
                                  )
                                  const nomeEsc =
                                    escObj?.escolaNome ||
                                    schools.find((s) => s.id === p.escola_id)?.name ||
                                    'Escola'
                                  return (
                                    <Badge
                                      key={p.id}
                                      variant="outline"
                                      className="text-[10px] bg-background font-normal"
                                    >
                                      {p.ordem}ª {nomeEsc}
                                    </Badge>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Entrada explícita: Sem rota */}
                      <div className="p-2.5 rounded bg-muted/20 border space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-muted-foreground flex items-center gap-1">
                            Sem rota atribuída
                          </span>
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {escolasSemRotaLogistica.length} escola(s)
                          </Badge>
                        </div>
                        {escolasSemRotaLogistica.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {escolasSemRotaLogistica.map((e) => (
                              <Badge
                                key={e.id}
                                variant="outline"
                                className="text-[10px] bg-background text-muted-foreground font-normal"
                              >
                                {e.escolaNome} (Ref: {e.rotaPlanilha || e.rotaNome || 'Sem Rota'})
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-emerald-600">
                            Todas as escolas deste contrato estão atribuídas a rotas.
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="font-semibold text-sm">Itens e Preços Acordados</h4>
                  <Badge variant="outline" className="text-[10px]">
                    {viewingItems.length} produto(s)
                  </Badge>
                </div>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                  {viewingItems.map((it) => {
                    const qtd = it.quantidade_contratada ? Number(it.quantidade_contratada) : 0
                    const preco = Number(it.preco) || 0
                    const subtotal = preco * qtd
                    const unidade = it.expand?.produto_id?.unidade || 'Kg'

                    return (
                      <div
                        key={it.id}
                        className="flex items-center justify-between p-2 rounded bg-muted/20 border text-xs"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {it.expand?.produto_id?.nome || 'Produto'}
                          </span>
                          {qtd > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              Cota contratada:{' '}
                              <strong className="text-primary">
                                {qtd} {unidade}
                              </strong>
                            </span>
                          )}
                        </div>

                        <div className="text-right font-mono">
                          <span className="text-foreground">
                            R$ {preco.toFixed(2)}{' '}
                            <span className="text-muted-foreground text-[10px]">/{unidade}</span>
                          </span>
                          {qtd > 0 && (
                            <div className="text-[11px] font-semibold text-primary">
                              Total: R${' '}
                              {subtotal.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
