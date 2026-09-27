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
  Route,
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
} from 'lucide-react'
import { toast } from 'sonner'
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
  const [numeroChamada, setNumeroChamada] = useState('')
  const [tipo, setTipo] = useState('PNAE')
  const [modalidade, setModalidade] = useState<'individualizado' | 'centralizado'>(
    'individualizado',
  )
  const [tipoImportacao, setTipoImportacao] = useState<'unica' | 'fracionada'>('unica')
  const [planilhaTemAbas, setPlanilhaTemAbas] = useState<boolean>(false)
  const [abasPlanilhaTexto, setAbasPlanilhaTexto] = useState('')
  const [numRotasLogisticas, setNumRotasLogisticas] = useState<string>('')
  const [valorTotal, setValorTotal] = useState('')
  const [status, setStatus] = useState<'Ativo' | 'Encerrado' | 'Cancelado' | 'Pendente'>('Ativo')

  // Vínculos N:N Escolas e Rotas da Planilha no diálogo
  const [contractSchoolsForm, setContractSchoolsForm] = useState<ContractSchoolForm[]>([])
  const [contractItems, setContractItems] = useState<ContractItemForm[]>([])

  // Gestão de Rotas Logísticas da Cooperativa
  const [contractRotasLogisticas, setContractRotasLogisticas] = useState<
    ContractRotaLogisticaForm[]
  >([])
  const [newRotaLogisticaNome, setNewRotaLogisticaNome] = useState('')
  const [editRotaIndex, setEditRotaIndex] = useState<number | null>(null)
  const [editRotaNome, setEditRotaNome] = useState('')

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

  const handleOpenCreate = () => {
    setEditingContract(null)
    setNumero('')
    setNumeroChamada('')
    setTipo('PNAE')
    setModalidade('individualizado')
    setTipoImportacao('unica')
    setPlanilhaTemAbas(false)
    setAbasPlanilhaTexto('')
    setNumRotasLogisticas('')
    setValorTotal('')
    setStatus('Ativo')
    setContractSchoolsForm([])
    setContractRotas([])
    setDeletedRotaIds([])
    setContractRotasLogisticas([])
    setContractItems([])
    setDialogOpen(true)
  }

  const handleOpenEdit = async (contract: Contract) => {
    setEditingContract(contract)
    setDeletedRotaIds([])
    setNumero(contract.numero)
    setNumeroChamada(contract.numero_chamada || '')
    setTipo(contract.tipo || 'PNAE')
    setModalidade(contract.modalidade_pedido || 'individualizado')
    const tImp = contract.tipo_importacao || 'unica'
    setTipoImportacao(tImp)
    const abasText = contract.abas_planilha || ''
    setAbasPlanilhaTexto(abasText)
    setPlanilhaTemAbas(Boolean(abasText.trim()))
    setNumRotasLogisticas(
      contract.num_rotas_logisticas !== undefined && contract.num_rotas_logisticas !== null
        ? contract.num_rotas_logisticas.toString()
        : '',
    )
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

    // Rotas logísticas da cooperativa (com dedup defensivo por id e nome)
    const existingLog = rotasLogisticas.filter((r) => r.contrato_id === contract.id)
    const seenLogIds = new Set<string>()
    const seenLogNames = new Set<string>()
    const dedupedLog: Array<{ id?: string; nome: string; ordem: number; ativa: boolean }> = []

    for (const r of existingLog) {
      if (seenLogIds.has(r.id)) continue
      seenLogIds.add(r.id)
      const norm = (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()
      if (seenLogNames.has(norm)) continue
      seenLogNames.add(norm)
      dedupedLog.push({
        id: r.id,
        nome: r.nome,
        ordem: r.ordem || 1,
        ativa: r.ativa !== false,
      })
    }
    setContractRotasLogisticas(dedupedLog)

    setDialogOpen(true)
    setIsLoadingItems(true)
    try {
      const items = await contratosService.getItems(contract.id)
      const mapped = items.map((it) => ({
        id: it.id,
        productId: it.produto_id,
        price: Number(it.preco) || 0,
        quantity: it.quantidade_contratada ? Number(it.quantidade_contratada) : 0,
        nomeContrato: it.nome_contrato || it.expand?.produto_id?.nome || '',
        apelidos: it.apelidos || '',
      }))
      setContractItems(mapped)

      // Se há produtos com quantidade contratada informada > 0, sincroniza o total automaticamente
      const somaContratada = mapped.reduce((acc, it) => acc + it.price * (it.quantity || 0), 0)
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
      const items = await contratosService.getItems(contract.id)
      setViewingItems(items)
    } catch (err) {
      console.error('Erro ao buscar itens para detalhes:', err)
      setViewingItems([])
    }
  }

  const handleOpenReport = async (contract: Contract) => {
    setReportContract(contract)
    setReportDialogOpen(true)
    try {
      const items = await contratosService.getItems(contract.id)
      setViewingItems(items)
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
      toast.error('Nenhuma operação selecionada para editar aba.')
      return
    }
    setRouteEditorContract(contractToUse)
    setEditingRouteInfo(rota)
    setRouteEditorOpen(true)
  }

  // Rotas Logísticas da Cooperativa (com validação estrita do número definido no contrato)
  const handleAddRotaLogistica = () => {
    const maxPermitido = parseInt(numRotasLogisticas, 10) || 1
    if (contractRotasLogisticas.length >= maxPermitido) {
      toast.error(
        `A operação define o limite de EXATAMENTE ${maxPermitido} rota(s) logística(s). Aumente o número de rotas antes de adicionar outra.`,
      )
      return
    }

    const trimmed = newRotaLogisticaNome.trim()
    if (!trimmed) return
    const normalizedTarget = trimmed.replace(/\s+/g, ' ').toLowerCase()
    if (
      contractRotasLogisticas.some(
        (r) => (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedTarget,
      )
    ) {
      toast.error('Já existe uma rota com este nome nesta operação.')
      return
    }

    setContractRotasLogisticas((prev) => [
      ...prev,
      { nome: trimmed.replace(/\s+/g, ' '), ordem: prev.length + 1, ativa: true },
    ])
    setNewRotaLogisticaNome('')
  }

  const handleStartEditRotaLogistica = (index: number) => {
    setEditRotaIndex(index)
    setEditRotaNome(contractRotasLogisticas[index].nome)
  }

  const handleSaveEditRotaLogistica = () => {
    if (editRotaIndex === null || !contractRotasLogisticas[editRotaIndex]) return
    const cleanNome = editRotaNome.trim().replace(/\s+/g, ' ')
    if (!cleanNome) {
      toast.error('Informe o nome da rota.')
      return
    }

    const normTarget = cleanNome.toLowerCase()
    const jaExiste = contractRotasLogisticas.some(
      (r, idx) =>
        idx !== editRotaIndex && r.nome.trim().replace(/\s+/g, ' ').toLowerCase() === normTarget,
    )
    if (jaExiste) {
      toast.error('Já existe uma rota com este nome nesta operação.')
      return
    }

    const targetOldNome = contractRotasLogisticas[editRotaIndex].nome
    const targetId = contractRotasLogisticas[editRotaIndex].id

    setContractRotasLogisticas((prev) =>
      prev.map((r, idx) => (idx === editRotaIndex ? { ...r, nome: cleanNome } : r)),
    )

    setEditRotaIndex(null)
    setEditRotaNome('')
  }
  const handleRemoveRotaLogistica = (index: number) => {
    const rotaAlvo = contractRotasLogisticas[index]
    if (rotaAlvo?.id) {
      // Checar se há pedidos atribuídos a esta rota logística
      const pedidosComRota = orders.filter((o) => o.rotaLogisticaId === rotaAlvo.id)
      if (pedidosComRota.length > 0) {
        toast.error(
          `Esta rota possui ${pedidosComRota.length} pedido(s) atribuído(s). É preciso reatribuí-los antes de remover a rota.`,
        )
        return
      }
    }
    setContractRotasLogisticas((prev) => prev.filter((_, i) => i !== index))
  }

  // Validação ao alterar o campo num_rotas_logisticas
  const handleNumRotasChange = (novoValorStr: string) => {
    const novoValor = parseInt(novoValorStr, 10)
    setNumRotasLogisticas(novoValorStr)

    if (!isNaN(novoValor) && novoValor < contractRotasLogisticas.length) {
      // Verificar se as rotas excedentes (além do novo limite) têm pedidos vinculados
      const rotasExcedentes = contractRotasLogisticas.slice(novoValor)
      const excedentesComPedidos = rotasExcedentes.filter((r) => {
        if (!r.id) return false
        return orders.some((o) => o.rotaLogisticaId === r.id)
      })

      if (excedentesComPedidos.length > 0) {
        toast.warning(
          `Atenção: Existem rotas excedentes com pedidos atribuídos (${excedentesComPedidos.map((r) => r.nome).join(', ')}). É preciso reatribuí-los antes de reduzir o número de rotas.`,
        )
      }
    }
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
            `Escola já vinculada à operação ${conflitoInfo.contratoNome} — desvincule-a lá antes de vincular aqui`,
            conflitoInfo.contratoObj
              ? {
                  action: {
                    label: 'Abrir operação',
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
      toast.info('Esta escola já está vinculada à operação.')
      return
    }

    const conflitoInfo = checkEscolaConflitoAtivo(schoolId)
    if (conflitoInfo.conflito) {
      toast.error(
        `Escola já vinculada à operação ${conflitoInfo.contratoNome} — desvincule-a lá antes de vincular aqui`,
        conflitoInfo.contratoObj
          ? {
              action: {
                label: 'Abrir operação',
                onClick: () => handleOpenEdit(conflitoInfo.contratoObj!),
              },
            }
          : undefined,
      )
      return
    }

    setContractSchoolsForm((prev) => [...prev, { escolaId: schoolId, rotaId: '' }])
    toast.success('Escola vinculada à operação!')
  }

  const handleRemoveSchoolLink = (schoolId: string) => {
    setContractSchoolsForm((prev) => prev.filter((s) => s.escolaId !== schoolId))
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
            `Escola já vinculada à operação ${conflitoInfo.contratoNome} — desvincule-a lá antes de vincular aqui`,
            conflitoInfo.contratoObj
              ? {
                  action: {
                    label: 'Abrir operação',
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
      toast.error('Informe o número ou código da operação.')
      return
    }

    const rawVal = parseFloat((valorTotal || '0').replace(',', '.'))
    const val = isNaN(rawVal) ? 0 : Math.max(0, rawVal)

    // Se não informou valor total e também não há itens acordados cadastrados/importados
    if (val <= 0 && contractItems.length === 0) {
      toast.error(
        'Informe um valor total válido ou importe/adicione os itens acordados da operação.',
      )
      return
    }

    // num_rotas_logisticas é opcional: se preenchido, valida número positivo
    const parsedNumRotas = numRotasLogisticas.trim() ? parseInt(numRotasLogisticas, 10) : undefined
    if (parsedNumRotas !== undefined && (isNaN(parsedNumRotas) || parsedNumRotas < 1)) {
      toast.error('Se preenchido, o número de rotas deve ser no mínimo 1.')
      return
    }

    // Se a operação já tiver rotas no banco e tiver um limite numérico preenchido:
    if (editingContract && parsedNumRotas !== undefined) {
      const existingRotasDoContrato = rotasLogisticas.filter(
        (r) => r.contrato_id === editingContract.id,
      )
      if (existingRotasDoContrato.length > parsedNumRotas) {
        toast.error(
          `A operação já possui ${existingRotasDoContrato.length} rota(s) configurada(s). O limite não pode ser inferior a esse valor.`,
        )
        return
      }
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

      const payloadToSave = {
        numero: trimmedNum,
        numero_chamada: numeroChamada.trim() || undefined,
        tipo,
        modalidade_pedido: modalidade,
        tipo_importacao: modalidade === 'centralizado' ? tipoImportacao : undefined,
        abas_planilha:
          modalidade === 'centralizado' && tipoImportacao === 'unica' && planilhaTemAbas
            ? cleanedAbasString
            : '',
        num_rotas_logisticas: parsedNumRotas,
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

        // 1.1 Em edição, apenas atualiza/mantém rotas logísticas caso o modal tenha sido usado para renomear
        if (editingContract && contractRotasLogisticas.length > 0) {
          // Checar se há nomes duplicados internamente entre as rotas logísticas
          const seenLogNames = new Set<string>()
          for (const crl of contractRotasLogisticas) {
            const norm = (crl.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()
            if (seenLogNames.has(norm)) {
              toast.error('Já existe uma rota com este nome nesta operação.')
              setIsSubmitting(false)
              return
            }
            seenLogNames.add(norm)
          }

          for (const crl of contractRotasLogisticas) {
            if (crl.id) {
              await rotasLogisticasService.update(crl.id, {
                nome: (crl.nome || '').trim().replace(/\s+/g, ' '),
                ordem: crl.ordem,
                ativa: crl.ativa !== false,
              })
            }
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

        // 3. Sincronizar itens, preços, quantidades contratadas, nome_contrato e apelidos acordados
        const validItems = contractItems.filter((i) => i.productId && Number(i.price) >= 0)
        await contratosService.syncItems(
          contractId,
          validItems.map((it) => ({
            id: it.id,
            produto_id: it.productId,
            preco: it.price,
            quantidade_contratada: it.quantity && it.quantity > 0 ? it.quantity : undefined,
            nome_contrato: it.nomeContrato || undefined,
            apelidos: it.apelidos || undefined,
          })),
        )
      }

      toast.success(`Operação ${trimmedNum} salva com sucesso!`)
      setDialogOpen(false)
      await refreshData()
    } catch (err: any) {
      console.error('Erro ao salvar operação:', err)
      toast.error('Falha ao salvar operação no banco.')
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
      toast.success(`Operação ${contractToDelete.numero} excluída com sucesso!`)
      setDeleteDialogOpen(false)
      setContractToDelete(null)
      await refreshData()
    } catch (err: any) {
      console.error('Erro ao excluir operação:', err)
      toast.error('Falha ao excluir operação.')
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
          <h1 className="text-2xl font-bold tracking-tight">Operações & Escolas Participantes</h1>
          <p className="text-muted-foreground">
            Gestão N:N de escolas participantes, rotas, produtos contratados e modalidades de
            pedido.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Operação
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Operações Vigentes
          </CardTitle>
          <CardDescription>
            Relação completa de operações, escolas vinculadas, rotas e modalidades operacionais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operação</TableHead>
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
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando operações...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : contracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhuma operação cadastrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  contracts.map((contract) => {
                    const total = contract.totalValue || 1
                    const used = Math.max(0, contract.totalValue - contract.balance)
                    const percentage = Math.min(100, Math.max(0, (used / total) * 100))

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
                                  title="Editar operação"
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
                                      title="Encerrar operação"
                                      onClick={() => handleOpenEncerrar(contract)}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                                      title="Cancelar operação"
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
                                  title="Excluir operação"
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
        <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingContract
                ? `Editar Operação ${editingContract.numero}`
                : 'Cadastrar Nova Operação'}
            </DialogTitle>
            <DialogDescription>
              Configure os dados cadastrais, as rotas de entrega, as escolas participantes e a
              tabela de produtos com preços acordados.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <Tabs defaultValue="geral" className="w-full">
              {editingContract ? (
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="geral">Dados Gerais</TabsTrigger>
                  <TabsTrigger value="rotas">
                    Rotas (
                    {(() => {
                      const seen = new Set<string>()
                      return rotasLogisticas.filter((r) => {
                        if (r.contrato_id !== editingContract.id) return false
                        const norm = (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()
                        if (seen.has(norm)) return false
                        seen.add(norm)
                        return true
                      }).length
                    })()}
                    )
                  </TabsTrigger>
                  <TabsTrigger value="escolas">Escolas ({contractSchoolsForm.length})</TabsTrigger>
                  <TabsTrigger value="produtos">
                    Itens & Preços ({contractItems.length})
                  </TabsTrigger>
                </TabsList>
              ) : (
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="geral">Dados Gerais</TabsTrigger>
                  <TabsTrigger value="escolas">Escolas ({contractSchoolsForm.length})</TabsTrigger>
                  <TabsTrigger value="produtos">
                    Itens & Preços ({contractItems.length})
                  </TabsTrigger>
                </TabsList>
              )}

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
                    <Label htmlFor="c-chamada">Nº da Chamada Pública</Label>
                    <Input
                      id="c-chamada"
                      placeholder="Ex: 001/2026"
                      value={numeroChamada}
                      onChange={(e) => setNumeroChamada(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Exibido no Termo de Recebimento oficial (Atesto).
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="c-tipo">Tipo de Programa</Label>
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger id="c-tipo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PNAE">PNAE (Alimentação Escolar)</SelectItem>
                        <SelectItem value="PAA">PAA (Aquisição de Alimentos)</SelectItem>
                        <SelectItem value="Municipal">Municipal / Direto</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="c-modalidade">Modalidade de Pedido</Label>
                    <Select
                      value={modalidade}
                      onValueChange={(v) => {
                        const newMod = v as 'individualizado' | 'centralizado'
                        setModalidade(newMod)
                        if (newMod === 'centralizado' && !tipoImportacao) {
                          setTipoImportacao('unica')
                        }
                      }}
                    >
                      <SelectTrigger id="c-modalidade">
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
                            : 'A secretaria envia arquivos fracionados (remessas/semanas) ao longo da operação.'}
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
                        Valor Total da Operação (R$) <span className="text-destructive">*</span>
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {contractItems.some((it) => (it.quantity || 0) > 0)
                          ? 'Recalculado automaticamente pela soma dos itens (preço unitário × quantidade contratada).'
                          : 'Quando os itens não possuem quantidades contratadas, informe o valor global diretamente.'}
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
                          Total informado diretamente
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
                      placeholder="Ex: 50000.00"
                      className={`pl-9 font-mono text-sm font-semibold ${
                        contractItems.some((it) => (it.quantity || 0) > 0)
                          ? 'bg-muted/50 cursor-not-allowed border-dashed'
                          : ''
                      }`}
                      readOnly={contractItems.some((it) => (it.quantity || 0) > 0)}
                      value={valorTotal}
                      onChange={(e) => setValorTotal(e.target.value)}
                      required
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

                <div className="p-3 rounded-lg border bg-muted/40 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label
                        htmlFor="c-num-rotas"
                        className="font-semibold text-xs text-foreground"
                      >
                        Número de Rotas da Cooperativa{' '}
                        <span className="text-muted-foreground font-normal">(Opcional)</span>
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Se preenchido, define um teto máximo de rotas no despacho. Se deixado vazio,
                        não há limite de criação de rotas.
                      </p>
                    </div>
                    <div className="w-24">
                      <Input
                        id="c-num-rotas"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Ilimitado"
                        className="h-8 font-bold text-center bg-background"
                        value={numRotasLogisticas}
                        onChange={(e) => handleNumRotasChange(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Aba 2: Resumo Somente Leitura das Rotas com Atalho */}
              <TabsContent value="rotas" className="space-y-4 pt-3">
                <div className="space-y-3 p-4 rounded-lg border bg-card">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm font-bold flex items-center gap-2 text-primary">
                        <Route className="h-4 w-4" /> Rotas da Operação
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        As rotas, seus nomes, atribuição de escolas e sequenciamento de paradas são
                        configurados diretamente na tela de Roteamento & Despacho.
                        {numRotasLogisticas ? (
                          <>
                            {' '}
                            Limite definido: <strong>{numRotasLogisticas} rota(s)</strong>.
                          </>
                        ) : (
                          <>
                            {' '}
                            Limite de rotas: <strong>Ilimitado</strong>.
                          </>
                        )}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs text-primary border-primary/40 hover:bg-primary/10 shrink-0"
                      onClick={() => {
                        setDialogOpen(false)
                        navigate('/rotas')
                      }}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Configurar no Roteamento & Despacho
                    </Button>
                  </div>

                  {editingContract ? (
                    (() => {
                      const rawRoutes = rotasLogisticas.filter(
                        (r) => r.contrato_id === editingContract.id,
                      )
                      // Deduplicar defensivamente por ID e por Nome
                      const seenIds = new Set<string>()
                      const seenNames = new Set<string>()
                      const contractLogRoutes = rawRoutes.filter((r) => {
                        if (seenIds.has(r.id)) return false
                        seenIds.add(r.id)
                        const norm = (r.nome || '').trim().replace(/\s+/g, ' ').toLowerCase()
                        if (seenNames.has(norm)) return false
                        seenNames.add(norm)
                        return true
                      })

                      if (contractLogRoutes.length === 0) {
                        return (
                          <div className="py-8 text-center border rounded-lg bg-muted/20 text-xs text-muted-foreground space-y-2">
                            <p className="font-medium text-foreground">
                              Nenhuma rota configurada para esta operação ainda.
                            </p>
                            <p>
                              Você pode salvar esta operação agora sem rotas e configurá-las
                              diretamente na tela de <strong>Roteamento & Despacho</strong>.
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="text-xs gap-1 mt-2"
                              onClick={() => {
                                setDialogOpen(false)
                                navigate('/rotas')
                              }}
                            >
                              <Truck className="h-3.5 w-3.5 text-primary" /> Ir para Roteamento &
                              Despacho
                            </Button>
                          </div>
                        )
                      }

                      return (
                        <div className="space-y-2 max-h-[240px] overflow-y-auto">
                          {contractLogRoutes.map((r, idx) => {
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
                      )
                    })()
                  ) : (
                    <div className="py-8 text-center border rounded-lg bg-muted/20 text-xs text-muted-foreground space-y-2">
                      <p className="font-medium text-foreground">
                        Nova Operação: As rotas são configuradas na tela de Roteamento & Despacho.
                      </p>
                      <p>
                        Salve os dados gerais, escolas e itens agora. Ao abrir a tela de{' '}
                        <strong>Roteamento & Despacho</strong>, você poderá criar as rotas com nome
                        livre, atribuir escolas e sequenciar paradas.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Aba 3: Escolas Participantes (Cadastro Mestre Global + Vínculo com Aba da Planilha) */}
              <TabsContent value="escolas" className="space-y-4 pt-3">
                {/* Gestão das Abas da Planilha desta Operação */}
                <div className="space-y-3 p-3.5 rounded-lg border bg-muted/20">
                  <div>
                    <Label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Abas da Planilha a Importar (Nomes
                      Livres desta Operação)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Cadastre os nomes das abas da planilha desta operação (ex.: ROTA A, ROTA B,
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
                      Nenhuma aba da planilha cadastrada ainda para esta operação. Cadastre acima
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
                  <div className="flex items-center gap-2 shrink-0">
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
                    <span>Carregando itens da operação...</span>
                  </div>
                ) : (
                  <ContractItemsManager
                    items={contractItems}
                    onChange={(newItems) => {
                      setContractItems(newItems)
                      // Recalcula total se houver quantidades
                      const comQtd = newItems.filter((i) => (i.quantity || 0) > 0)
                      if (comQtd.length > 0) {
                        const totalCalc = newItems.reduce(
                          (acc, it) => acc + it.price * (it.quantity || 0),
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
                      Clique em &quot;Cadastrar Operação&quot; para gravar no banco.
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
                    'Cadastrar Operação'
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
          // Atualiza a lista do formulário mantendo integridade e a rota da planilha atribuída
          setContractSchoolsForm((prev) => {
            const map = new Map<string, string>() // escolaId -> rotaId
            for (const item of prev) {
              map.set(item.escolaId, item.rotaId)
            }
            for (const imp of importedLinks) {
              map.set(imp.escolaId, imp.rotaPlanilha)
            }
            return Array.from(map.entries()).map(([escolaId, rotaId]) => ({
              escolaId,
              rotaId,
            }))
          })

          // Garantir que a rota importada também esteja na lista local de rotas do diálogo pai
          const importedRotas = Array.from(
            new Set(importedLinks.map((l) => l.rotaPlanilha).filter(Boolean)),
          )
          setContractRotas((prev) => {
            const copy = [...prev]
            for (const rNome of importedRotas) {
              if (!copy.some((r) => r.nome.toLowerCase() === rNome.toLowerCase())) {
                const linkWithId = importedLinks.find((l) => l.rotaPlanilha === rNome && l.rotaId)
                copy.push({
                  id: linkWithId?.rotaId,
                  nome: rNome,
                  ordem: copy.length + 1,
                })
              }
            }
            return copy
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
              <BarChart3 className="h-5 w-5 text-primary" /> Relatório de Execução da Operação{' '}
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
        }}
      />

      {/* DIALOG DE EXCLUSÃO */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmar Exclusão de Operação
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente remover a operação <strong>{contractToDelete?.numero}</strong>? Isso
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
              {isDeleting ? 'Excluindo...' : 'Excluir Operação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DIALOG DE DETALHES GERAIS */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Operação {viewingContract?.numero}</DialogTitle>
            <DialogDescription>
              {viewingContract?.tipo || 'PNAE'} • Modalidade:{' '}
              {viewingContract?.modalidade_pedido || 'individualizado'}
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
                    <span>Operação Cancelada</span>
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
                    <span>Operação Encerrada</span>
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
                        Nenhuma escola vinculada à operação.
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
                      navigate('/rotas')
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
                            Todas as escolas desta operação estão atribuídas a rotas.
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
