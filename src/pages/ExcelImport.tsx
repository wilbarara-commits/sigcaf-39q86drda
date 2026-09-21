import { useState, useRef, useMemo, useEffect } from 'react'
import { useApp } from '@/context/app-context'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldAlert,
  Info,
  Calendar,
  Layers,
  History,
  FileCheck,
  Link2,
  PlusCircle,
  ExternalLink,
  Building2,
  Sparkles,
  Route,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import {
  parseSecretaryExcel,
  normalizeName,
  type ParsedExcelResult,
  type ParsedSchoolOrder,
} from '@/lib/excelImporter'
import { rotasService } from '@/services/rotas'
import { pedidosService } from '@/services/pedidos'
import { contratosService } from '@/services/contratos'
import { escolasService } from '@/services/escolas'
import { importacoesService } from '@/services/whatsapp-import'
import type { ImportacaoRecord, EscolaTipo } from '@/lib/types'

export default function ExcelImport() {
  const {
    contracts,
    schools,
    products,
    contractItems,
    activeCiclo,
    rotas,
    paradasRota,
    refreshData,
  } = useApp()
  const { user } = useAuth()

  // Filtrar contratos com modalidade centralizada
  const centralContracts = useMemo(
    () => contracts.filter((c) => c.modalidade_pedido === 'centralizado'),
    [contracts],
  )

  const [selectedContractId, setSelectedContractId] = useState<string>(
    centralContracts[0]?.id || '',
  )
  const [fileName, setFileName] = useState('')
  const [rawWorkbook, setRawWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [parsedData, setParsedData] = useState<ParsedExcelResult | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [historyList, setHistoryList] = useState<ImportacaoRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Diálogo para resolver pendência "Vincular ao contrato" (pré-preenchido)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [pendingLinkOrder, setPendingLinkOrder] = useState<ParsedSchoolOrder | null>(null)
  const [linkRotaNome, setLinkRotaNome] = useState('')
  const [isLinking, setIsLinking] = useState(false)

  // Diálogo para resolver pendência "Cadastrar escola" (não cria automaticamente)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [pendingCreateOrder, setPendingCreateOrder] = useState<ParsedSchoolOrder | null>(null)
  const [newSchoolName, setNewSchoolName] = useState('')
  const [newSchoolAddress, setNewSchoolAddress] = useState('')
  const [newSchoolContact, setNewSchoolContact] = useState('')
  const [newSchoolEmail, setNewSchoolEmail] = useState('')
  const [newSchoolTipo, setNewSchoolTipo] = useState<EscolaTipo | ''>('')
  const [newSchoolRota, setNewSchoolRota] = useState('')
  const [isCreatingSchool, setIsCreatingSchool] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === selectedContractId),
    [contracts, selectedContractId],
  )

  // Itens contratados do contrato selecionado
  const selectedContractItems = useMemo(() => {
    if (!selectedContractId) return []
    return contractItems.filter((ci) => ci.contrato_id === selectedContractId)
  }, [contractItems, selectedContractId])

  // Subtotais por aba de rota para a prévia da importação
  interface RouteSubtotal {
    sheetName: string
    isIgnored: boolean
    schoolsCount: number
    totalWeight: number
    validItemsCount: number
    estimatedValue: number
    contractRotaMatched?: string
  }

  const routeSubtotals = useMemo<RouteSubtotal[]>(() => {
    if (!parsedData) return []

    // Mapear métricas por rota ativa importada
    const subtotalsMap = new Map<
      string,
      {
        schoolsCount: number
        totalWeight: number
        validItemsCount: number
        estimatedValue: number
        contractRotaMatched?: string
      }
    >()

    // Inicializar para todas as rotas lidas na ordem em que foram encontradas
    for (const r of parsedData.routesFound) {
      subtotalsMap.set(r, {
        schoolsCount: 0,
        totalWeight: 0,
        validItemsCount: 0,
        estimatedValue: 0,
      })
    }

    // Acumular dados dos pedidos por aba/rota
    for (const order of parsedData.orders) {
      const entry = subtotalsMap.get(order.routeRaw) || {
        schoolsCount: 0,
        totalWeight: 0,
        validItemsCount: 0,
        estimatedValue: 0,
      }

      entry.schoolsCount += 1
      entry.estimatedValue += order.totalCalculated || 0
      if (order.sheetMatchedContractRota) {
        entry.contractRotaMatched = order.sheetMatchedContractRota
      }

      for (const it of order.items) {
        if (it.quantity > 0) {
          entry.validItemsCount += 1
          entry.totalWeight += it.quantity
        }
      }

      subtotalsMap.set(order.routeRaw, entry)
    }

    const list: RouteSubtotal[] = parsedData.routesFound.map((sheetName) => {
      const stats = subtotalsMap.get(sheetName) || {
        schoolsCount: 0,
        totalWeight: 0,
        validItemsCount: 0,
        estimatedValue: 0,
      }
      return {
        sheetName,
        isIgnored: false,
        schoolsCount: stats.schoolsCount,
        totalWeight: Math.round(stats.totalWeight * 100) / 100,
        validItemsCount: stats.validItemsCount,
        estimatedValue: Math.round(stats.estimatedValue * 100) / 100,
        contractRotaMatched: stats.contractRotaMatched,
      }
    })

    // Adicionar as abas ignoradas como linhas informativas
    if (parsedData.ignoredUnmatchedSheets && parsedData.ignoredUnmatchedSheets.length > 0) {
      for (const ignoredSheet of parsedData.ignoredUnmatchedSheets) {
        list.push({
          sheetName: ignoredSheet,
          isIgnored: true,
          schoolsCount: 0,
          totalWeight: 0,
          validItemsCount: 0,
          estimatedValue: 0,
        })
      }
    }

    return list
  }, [parsedData])

  // Carregar histórico de importações
  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const records = await importacoesService.getAll()
      setHistoryList(records)
    } catch (err) {
      console.error('Erro ao carregar histórico:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  // Processar arquivo .xlsx selecionado
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!selectedContract) {
      toast.error('Selecione primeiro o contrato com modalidade centralizada.')
      return
    }

    setFileName(file.name)
    setIsParsing(true)
    setParsedData(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      setRawWorkbook(workbook)

      const contractRotas = rotas.filter((r) => r.contrato_id === selectedContract.id)
      const currentContractItems = contractItems.filter(
        (ci) => ci.contrato_id === selectedContract.id,
      )
      const result = parseSecretaryExcel(
        workbook,
        schools,
        selectedContract.escolas,
        products,
        contractRotas,
        currentContractItems,
        selectedContract.numero,
      )

      setParsedData(result)
      if (result.anomalies.length > 0) {
        toast.warning(
          `Planilha lida com ${result.anomalies.length} anomalia(s) de duplicidade detectadas!`,
        )
      } else if (result.pendingIssuesCount > 0) {
        toast.info(
          `Planilha processada com ${result.pendingIssuesCount} pendência(s) de escola para resolver.`,
        )
      } else {
        toast.success(
          `Planilha processada com sucesso! ${result.orders.length} pedidos prontos para importação.`,
        )
      }
    } catch (err: any) {
      console.error('Erro ao processar planilha:', err)
      toast.error('Falha ao ler o arquivo Excel. Verifique se o formato é .xlsx válido.')
    } finally {
      setIsParsing(false)
    }
  }

  // Gerar planilha de exemplo/template
  const handleDownloadSample = () => {
    try {
      const wb = XLSX.utils.book_new()

      // Criar ROTA A de exemplo com a estrutura esperada
      const rotaAData: any[][] = [
        ['PREFEITURA MUNICIPAL - SECRETARIA DE EDUCAÇÃO'],
        ['PROGRAMA NACIONAL DE ALIMENTAÇÃO ESCOLAR - PNAE'],
        ['CRONOGRAMA DE ENTREGA - SEMANA ATIVA'],
        ['ROTA A - ZONA URBANA'],
        [],
        ['TIPO', 'DESCRIÇÃO', 'UNIDADE', 'CMEI', 'FUNDAMENTAL', 'INTEGRAL'],
        [
          'COD',
          'NOME DA ESCOLA',
          '',
          'E.M. João da Silva',
          'E.E. Maria Antonieta',
          'Creche Pingo de Gente',
        ],
        ['', 'Nº ALUNOS / DIAS', '', '150 alunos (5d)', '220 alunos (5d)', '80 alunos (5d)'],
        ['ITEM', 'DESCRIÇÃO DO PRODUTO', 'UNID', 'QTD (KG)', 'QTD (KG)', 'QTD (KG)'],
      ]

      // Linhas de produtos (10 a 34)
      for (const p of products.slice(0, 15)) {
        rotaAData.push(['01', p.name, p.unit, 15, 20, 10])
      }
      rotaAData.push(['TOTAL', 'TOTAL GERAL', 'KG', 150, 200, 100])

      const wsA = XLSX.utils.aoa_to_sheet(rotaAData)
      XLSX.utils.book_append_sheet(wb, wsA, 'ROTA A')

      // Aba TOTAL para demonstrar a regra de ignorar
      const wsTotal = XLSX.utils.aoa_to_sheet([['CONSOLIDADO GERAL DE TODAS AS ROTAS']])
      XLSX.utils.book_append_sheet(wb, wsTotal, 'TOTAL')

      XLSX.writeFile(wb, 'modelo_planilha_secretaria_centralizada.xlsx')
      toast.success('Modelo de planilha gerado e baixado!')
    } catch (err) {
      console.error('Erro ao gerar modelo:', err)
    }
  }

  // Re-analisar planilha em memória após vincular ou cadastrar escola
  const reparseWorkbook = (
    currentSchools: typeof schools,
    currentLinks: typeof selectedContract.escolas,
  ) => {
    if (!rawWorkbook || !selectedContract) return
    const contractRotas = rotas.filter((r) => r.contrato_id === selectedContract.id)
    const currentContractItems = contractItems.filter(
      (ci) => ci.contrato_id === selectedContract.id,
    )
    const result = parseSecretaryExcel(
      rawWorkbook,
      currentSchools,
      currentLinks,
      products,
      contractRotas,
      currentContractItems,
      selectedContract.numero,
    )
    setParsedData(result)
  }

  // Abrir diálogo "Vincular ao Contrato" com dados pré-preenchidos
  const handleOpenLinkDialog = (order: ParsedSchoolOrder) => {
    setPendingLinkOrder(order)
    setLinkRotaNome(order.prefilledLink?.rotaSugerida || order.routeRaw)
    setLinkDialogOpen(true)
  }

  // Confirmar vínculo pré-preenchido
  const handleConfirmLinkSchool = async () => {
    if (!pendingLinkOrder || !pendingLinkOrder.prefilledLink || !selectedContract) return
    setIsLinking(true)
    try {
      // 1. Garantir que a rota existe no contrato
      const rotaRec = await rotasService.findOrCreate(selectedContract.id, linkRotaNome)

      // 2. Criar vínculo em contrato_escolas
      await contratosService.linkEscola({
        contrato_id: selectedContract.id,
        escola_id: pendingLinkOrder.prefilledLink.escolaId,
        rota_id: rotaRec.id,
      })

      toast.success(
        `Escola "${pendingLinkOrder.prefilledLink.escolaNome}" vinculada ao contrato com a rota ${linkRotaNome}!`,
      )
      setLinkDialogOpen(false)

      await refreshData()

      // Atualizar localmente a prévia
      if (rawWorkbook) {
        // Criar lista de links atualizada
        const updatedLinks = [
          ...selectedContract.escolas,
          {
            id: 'temp-' + Date.now(),
            contratoId: selectedContract.id,
            escolaId: pendingLinkOrder.prefilledLink.escolaId,
            rotaId: rotaRec.id,
            escolaNome: pendingLinkOrder.prefilledLink.escolaNome,
            rotaNome: linkRotaNome,
          },
        ]
        reparseWorkbook(schools, updatedLinks)
      }
    } catch (err: any) {
      console.error('Erro ao vincular escola ao contrato:', err)
      toast.error('Falha ao vincular escola ao contrato.')
    } finally {
      setIsLinking(false)
    }
  }

  // Abrir diálogo "Cadastrar Escola" no cadastro mestre
  const handleOpenCreateSchoolDialog = (order: ParsedSchoolOrder) => {
    setPendingCreateOrder(order)
    setNewSchoolName(order.schoolNameRaw)
    setNewSchoolAddress('')
    setNewSchoolContact('')
    setNewSchoolEmail('')
    setNewSchoolTipo('')
    setNewSchoolRota(order.routeRaw)
    setCreateDialogOpen(true)
  }

  // Confirmar criação no cadastro mestre e vinculo ao contrato
  const handleConfirmCreateSchool = async () => {
    if (!pendingCreateOrder || !selectedContract) return
    const trimmedName = newSchoolName.trim()
    if (!trimmedName) {
      toast.error('Informe o nome da escola.')
      return
    }

    setIsCreatingSchool(true)
    try {
      // Checar se já existe nome normalizado no cadastro mestre
      const normInput = normalizeName(trimmedName)
      const existing = schools.find((s) => normalizeName(s.name) === normInput)

      let schoolId: string
      let schoolNameResult: string

      if (existing) {
        schoolId = existing.id
        schoolNameResult = existing.name
        toast.info(`Escola já existia no cadastro mestre como "${existing.name}". Reutilizada!`)
      } else {
        const created = await escolasService.create({
          nome: trimmedName,
          endereco: newSchoolAddress.trim(),
          telefone: newSchoolContact.trim(),
          email: newSchoolEmail.trim() || undefined,
          tipo: newSchoolTipo || undefined,
          rota: '',
        })
        schoolId = created.id
        schoolNameResult = created.nome
        toast.success(`Escola "${trimmedName}" cadastrada no cadastro mestre global!`)
      }

      // Criar a rota no contrato se necessário
      const rotaRec = await rotasService.findOrCreate(
        selectedContract.id,
        newSchoolRota.trim() || pendingCreateOrder.routeRaw,
      )

      // Vincular ao contrato
      await contratosService.linkEscola({
        contrato_id: selectedContract.id,
        escola_id: schoolId,
        rota_id: rotaRec.id,
      })

      toast.success(`Escola vinculada ao contrato com a rota ${rotaRec.nome}!`)
      setCreateDialogOpen(false)

      await refreshData()

      // Reparse
      if (rawWorkbook) {
        const updatedSchools = [
          ...schools,
          {
            id: schoolId,
            name: schoolNameResult,
            address: newSchoolAddress,
            contact: newSchoolContact,
            route: '',
            email: newSchoolEmail,
            tipo: newSchoolTipo,
          },
        ]
        const updatedLinks = [
          ...selectedContract.escolas,
          {
            id: 'temp-' + Date.now(),
            contratoId: selectedContract.id,
            escolaId: schoolId,
            rotaId: rotaRec.id,
            escolaNome: schoolNameResult,
            rotaNome: rotaRec.nome,
          },
        ]
        reparseWorkbook(updatedSchools, updatedLinks)
      }
    } catch (err: any) {
      console.error('Erro ao cadastrar e vincular escola:', err)
      toast.error('Falha ao cadastrar escola.')
    } finally {
      setIsCreatingSchool(false)
    }
  }

  // Confirmar Importação e Gravar Pedidos no Banco
  const handleConfirmImport = async () => {
    if (!parsedData || !selectedContract) return

    // Validar se existem pedidos prontos sem pendências impeditivas:
    // Deve ter escola cadastrada, vinculada ao contrato, sem anomalia de duplicidade em outras abas,
    // e conter pelo menos 1 item com quantidade > 0.
    const validOrders = parsedData.orders.filter(
      (o) =>
        o.schoolId &&
        o.isLinkedToContract &&
        !o.isDuplicateInOtherSheets &&
        !o.isSheetUnmatchedInContract &&
        o.items.length > 0 &&
        o.items.every((it) => Boolean(it.productId)),
    )

    if (validOrders.length === 0) {
      toast.error('Nenhum pedido válido encontrado para importação neste contrato.')
      return
    }

    setIsImporting(true)

    try {
      const now = new Date().toISOString()
      let okCount = 0
      let errorCount = 0
      const errorLog: any[] = []

      // Mapear rotas: identificar a rota no contrato ou criar
      const routeMap = new Map<string, string>() // sheetName -> rotaId

      for (const sheetName of parsedData.routesFound) {
        const rotaRec = await rotasService.findOrCreate(selectedContract.id, sheetName)
        routeMap.set(sheetName, rotaRec.id)
      }

      // Preparar payload de pedidos para criação atômica e em lote seguro
      const pedidosPayload = validOrders.map((o) => {
        const rotaId = routeMap.get(o.routeRaw)
        const orderNum = `IMP-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 900 + 100)}`

        // Herdar rota logística da escola caso a escola já tenha sido roteada (paradas_rota)
        let rotaLogisticaHerdadaId: string | undefined
        if (o.schoolId) {
          const paradaExistente = paradasRota.find((p) => p.escola_id === o.schoolId)
          if (paradaExistente) {
            rotaLogisticaHerdadaId = paradaExistente.rota_logistica_id
          }
        }

        const validOrderItems = o.items
          .filter((it) => it.productId && it.quantity > 0)
          .map((it) => ({
            produto_id: it.productId || '',
            quantidade: it.quantity,
            preco_unitario: it.price,
          }))

        const validationDetails = [`${validOrderItems.length} itens recebidos da secretaria`]

        return {
          numero: orderNum,
          escola_id: o.schoolId!,
          ciclo_id: activeCiclo?.id,
          origem: 'excel' as const,
          rota_id: rotaId,
          rota_logistica_id: rotaLogisticaHerdadaId,
          validacao: {
            status: 'validado' as const,
            motivo: `Importado de planilha centralizada (${o.routeRaw})`,
            detalhes: validationDetails,
          },
          data_prevista: now,
          status: 'Pendente' as const,
          itens: validOrderItems,
        }
      })

      // Executar a criação via serviço com lote atômico transacional
      const batchResult = await pedidosService.createBatch(pedidosPayload)
      okCount = batchResult.totalCreated
      errorCount = validOrders.length - okCount

      if (errorCount > 0) {
        errorLog.push({
          escola: 'Geral',
          erro: `${errorCount} pedido(s) não puderam ser gravados.`,
        })
      }

      // Registrar o histórico na collection 'importacoes'
      const auditLog = [...errorLog]
      if (parsedData.ignoredUnmatchedSheets && parsedData.ignoredUnmatchedSheets.length > 0) {
        auditLog.push({
          tipo: 'info',
          observacao: `Abas ignoradas (sem rota cadastrada correspondente): ${parsedData.ignoredUnmatchedSheets.join(', ')}`,
        })
      }

      await importacoesService.create({
        ciclo_id: activeCiclo?.id || '',
        contrato_id: selectedContract.id,
        arquivo: fileName || 'planilha_secretaria.xlsx',
        data: now,
        usuario_id: user?.id,
        linhas_total: parsedData.orders.length,
        linhas_ok: okCount,
        linhas_erro: errorCount + (parsedData.orders.length - validOrders.length),
        erros: auditLog.length > 0 ? auditLog : undefined,
      })

      toast.success(
        `Importação concluída! ${okCount} pedidos criados com sucesso com origem = excel.`,
      )
      setParsedData(null)
      setFileName('')
      await refreshData()
      await loadHistory()
    } catch (err: any) {
      console.error('Erro geral na importação:', err)
      toast.error('Falha ao concluir a importação no banco.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importação de Pedidos (Planilha)</h1>
          <p className="text-muted-foreground">
            Carga de pedidos consolidados da Secretaria de Educação para contratos com modalidade
            centralizada.
          </p>
        </div>

        <Button variant="outline" onClick={handleDownloadSample} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Baixar Modelo Exemplo (.xlsx)
        </Button>
      </div>

      {/* Seleção de Contrato Centralizado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> Contrato Centralizado de Destino
          </CardTitle>
          <CardDescription>
            Apenas contratos com <code>modalidade_pedido = centralizado</code> recebem pedidos por
            importação de planilha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {centralContracts.length === 0 ? (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-sm">
              <AlertTriangle className="h-5 w-5 inline mr-2 text-amber-600" />
              Nenhum contrato com modalidade "centralizado" encontrado. Ajuste a modalidade na tela
              de Contratos para habilitar a importação.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div>
                <Label htmlFor="contrato-select" className="text-xs font-semibold">
                  Selecione o Contrato Centralizado
                </Label>
                <Select
                  value={selectedContractId}
                  onValueChange={(val) => {
                    setSelectedContractId(val)
                    setParsedData(null)
                  }}
                >
                  <SelectTrigger id="contrato-select" className="mt-1">
                    <SelectValue placeholder="Selecione o Contrato" />
                  </SelectTrigger>
                  <SelectContent>
                    {centralContracts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.numero} — {c.tipo || 'PNAE'} ({c.escolas.length} escolas vinculadas)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedContract && (
                <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Modalidade:</span>
                    <Badge variant="outline" className="font-mono text-[10px] capitalize">
                      {selectedContract.modalidade_pedido}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Escolas Vinculadas:</span>
                    <span className="font-semibold text-primary">
                      {selectedContract.escolas.length} escolas
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ciclo Ativo Vinculado:</span>
                    <span className="font-semibold text-foreground">
                      {activeCiclo?.nome || 'Sem ciclo ativo'} ({activeCiclo?.status || '-'})
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Área de Upload e Drag-and-Drop */}
      {selectedContract && (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload className="h-7 w-7" />
            </div>

            <div>
              <h3 className="text-base font-semibold">
                Faça o upload da planilha da Secretaria (.xlsx)
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                O motor irá processar as abas da planilha (ROTA A, ROTA B, ROTA C...), transpor as
                colunas de escola e casar os nomes com tolerância inteligente.
              </p>
            </div>

            <div className="flex justify-center gap-3">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="gap-2"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Processando Planilha...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4" /> Selecionar Arquivo
                  </>
                )}
              </Button>
            </div>

            {fileName && (
              <p className="text-xs font-mono text-muted-foreground">
                Arquivo selecionado: <strong>{fileName}</strong>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preview dos Dados Extraídos antes de Confirmar */}
      {parsedData && (
        <div className="space-y-4 animate-fade-in">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-primary" /> Prévia da Importação
                  </CardTitle>
                  <CardDescription>
                    Revise as abas, escolas, quantidades e solucione eventuais pendências antes de
                    gravar.
                  </CardDescription>{' '}
                </div>
                <Button
                  onClick={handleConfirmImport}
                  disabled={isImporting || parsedData.orders.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Gravando no Banco...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Confirmar e Criar Pedidos
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Cards de Resumo da Leitura */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-muted/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Abas da Planilha</p>
                    <p className="text-xl font-bold text-primary">
                      {parsedData.routesFound.length}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {parsedData.routesFound.join(', ')}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Escolas com Pedido</p>
                    <p className="text-xl font-bold text-primary">{parsedData.orders.length}</p>
                    <p className="text-[10px] text-muted-foreground">pedidos a gerar</p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Volume Total (Kg/Un)</p>
                    <p className="text-xl font-bold text-primary">
                      {parsedData.totalWeight.toLocaleString('pt-BR')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {parsedData.totalItemsCount} itens válidos
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Pendências Bloqueantes</p>
                    <p
                      className={`text-xl font-bold ${
                        parsedData.pendingIssuesCount > 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {parsedData.pendingIssuesCount}
                    </p>
                    <p className="text-[10px] text-muted-foreground">pedidos retidos</p>
                  </CardContent>
                </Card>
              </div>

              {/* Seção de Subtotais por Aba da Planilha */}
              {routeSubtotals.length > 0 && (
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Route className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold text-foreground">
                        Subtotais por Aba da Planilha
                      </h4>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Conferência rápida por aba antes de confirmar a importação
                    </span>
                  </div>

                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="font-semibold text-xs">Aba</TableHead>
                          <TableHead className="font-semibold text-xs text-center">
                            Escolas com Pedido
                          </TableHead>
                          <TableHead className="font-semibold text-xs text-center">
                            Volume (Kg/Un)
                          </TableHead>
                          <TableHead className="font-semibold text-xs text-center">
                            Itens Válidos
                          </TableHead>
                          <TableHead className="font-semibold text-xs text-right">
                            Valor Estimado
                          </TableHead>
                          <TableHead className="font-semibold text-xs text-center">
                            Status
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {routeSubtotals.map((row) => {
                          if (row.isIgnored) {
                            return (
                              <TableRow
                                key={`subtotal-${row.sheetName}`}
                                className="bg-muted/20 opacity-70"
                              >
                                <TableCell className="text-xs font-mono">
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">{row.sheetName}</span>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] border-muted-foreground/30 text-muted-foreground"
                                    >
                                      Ignorada
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="text-center text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="text-center text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="text-right text-xs text-muted-foreground">
                                  —
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] text-muted-foreground font-normal"
                                  >
                                    Sem aba no contrato
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            )
                          }

                          return (
                            <TableRow key={`subtotal-${row.sheetName}`}>
                              <TableCell className="text-xs font-semibold text-primary">
                                <div className="flex flex-col">
                                  <span>{row.sheetName}</span>
                                  {row.contractRotaMatched &&
                                    row.contractRotaMatched !== row.sheetName && (
                                      <span className="text-[10px] text-muted-foreground font-normal">
                                        Aba no contrato: {row.contractRotaMatched}
                                      </span>
                                    )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center text-xs font-semibold">
                                {row.schoolsCount}{' '}
                                <span className="text-[10px] text-muted-foreground font-normal">
                                  {row.schoolsCount === 1 ? 'escola' : 'escolas'}
                                </span>
                              </TableCell>
                              <TableCell className="text-center text-xs font-mono font-bold text-foreground">
                                {row.totalWeight.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell className="text-center text-xs text-muted-foreground">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-background font-normal"
                                >
                                  {row.validItemsCount} itens
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono text-muted-foreground">
                                R${' '}
                                {row.estimatedValue.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge className="bg-emerald-600 text-[10px]">
                                  Pronta para importar
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Informação neutra e discreta sobre abas ignoradas (sem rota cadastrada correspondente) */}
              {parsedData.ignoredUnmatchedSheets &&
                parsedData.ignoredUnmatchedSheets.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/60 border border-border text-muted-foreground text-xs flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">
                        {parsedData.ignoredUnmatchedSheets.length}{' '}
                        {parsedData.ignoredUnmatchedSheets.length === 1
                          ? 'aba ignorada'
                          : 'abas ignoradas'}{' '}
                        (sem aba cadastrada correspondente neste contrato):{' '}
                        <span className="font-mono text-foreground">
                          {parsedData.ignoredUnmatchedSheets.join(', ')}
                        </span>
                      </p>
                      <p className="text-[11px]">
                        Estas abas foram puladas automaticamente, não foram lidas e não geram
                        pedidos nem erros. Caso deseje importar alguma delas, cadastre a aba
                        correspondente nas configurações do contrato.
                      </p>
                    </div>
                  </div>
                )}

              {/* Alertas de Anomalias de Duplicidade entre Abas Distintas */}
              {parsedData.anomalies.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                  <p className="font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                    <ShieldAlert className="h-4 w-4" /> Alertas Detectados na Planilha:
                  </p>
                  {parsedData.anomalies.map((anom, idx) => (
                    <p key={idx} className="pl-5">
                      • {anom}
                    </p>
                  ))}
                </div>
              )}

              {/* Tabela de Preview dos Pedidos */}
              <div className="rounded-md border max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aba</TableHead>
                      <TableHead>Escola na Planilha</TableHead>
                      <TableHead>Vínculo no Contrato</TableHead>
                      <TableHead>Itens / Demanda</TableHead>
                      <TableHead className="text-right">Valor Estimado</TableHead>
                      <TableHead>Status / Pendência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.orders.map((po, idx) => {
                      const hasBlockingIssues =
                        po.matchStatus !== 'ok' ||
                        !po.isLinkedToContract ||
                        po.isDuplicateInOtherSheets ||
                        po.isSheetUnmatchedInContract ||
                        po.items.length === 0 ||
                        po.items.some((it) => !it.productId)

                      return (
                        <TableRow key={idx} className={hasBlockingIssues ? 'bg-amber-500/5' : ''}>
                          <TableCell className="font-semibold text-xs text-primary">
                            <div className="flex flex-col gap-0.5">
                              <span>{po.routeRaw}</span>
                              {po.sheetMatchedContractRota && (
                                <span className="text-[10px] text-emerald-600 font-normal">
                                  ✓ Aba: {po.sheetMatchedContractRota}
                                </span>
                              )}
                            </div>
                          </TableCell>{' '}
                          <TableCell className="font-medium text-xs">
                            <div className="flex flex-col gap-1">
                              <span>{po.schoolNameRaw}</span>
                              {po.mergedColumnsCount && po.mergedColumnsCount > 1 && (
                                <Badge
                                  variant="secondary"
                                  className="w-fit text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 font-normal border border-sky-300"
                                >
                                  {po.mergedColumnsCount} colunas somadas
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {po.isLinkedToContract ? (
                              <span className="text-emerald-600 flex items-center gap-1 font-medium">
                                <CheckCircle2 className="h-3.5 w-3.5" /> {po.schoolNameMatched}
                              </span>
                            ) : po.matchStatus === 'needs_link' ? (
                              <div className="space-y-1">
                                <span className="text-amber-600 flex items-center gap-1 font-medium">
                                  <Building2 className="h-3.5 w-3.5" /> {po.schoolNameMatched}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-amber-700 border-amber-400 bg-amber-50 dark:bg-amber-950/40"
                                >
                                  No cadastro mestre (não vinculada)
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-rose-600 flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" /> Não cadastrada no mestre
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span
                              className="text-muted-foreground"
                              title={po.items
                                .map((i) => {
                                  const aliasInfo = i.matchedViaAlias
                                    ? ` [via apelido "${i.matchedViaAlias}"]`
                                    : ''
                                  return `${i.quantity}x ${i.productNameMatched || i.productNameRaw}${aliasInfo} (R$ ${i.price.toFixed(2)})`
                                })
                                .join('\n')}
                            >
                              <div className="space-y-0.5">
                                <span>{po.items.length} produto(s) válido(s)</span>
                                {po.items.some((i) => i.matchedViaAlias) && (
                                  <span className="text-[10px] text-primary flex items-center gap-1 font-medium">
                                    ✓ {po.items.filter((i) => i.matchedViaAlias).length} via apelido
                                  </span>
                                )}
                                {po.items.some(
                                  (i) =>
                                    i.matchedViaContractItem &&
                                    i.nomeContratoMatched &&
                                    i.nomeContratoMatched !== i.productNameMatched,
                                ) && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    {
                                      po.items.filter(
                                        (i) =>
                                          i.matchedViaContractItem &&
                                          i.nomeContratoMatched &&
                                          i.nomeContratoMatched !== i.productNameMatched,
                                      ).length
                                    }{' '}
                                    casado(s) via nome no contrato
                                  </span>
                                )}
                              </div>
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            R${' '}
                            {po.totalCalculated.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell>
                            {po.isLinkedToContract ? (
                              <div className="space-y-1">
                                <Badge className="bg-emerald-600 text-[10px]">
                                  Pronto para importar
                                </Badge>
                              </div>
                            ) : po.matchStatus === 'needs_link' ? (
                              <div className="space-y-1.5">
                                <Badge
                                  variant="secondary"
                                  className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 text-[10px]"
                                >
                                  Pendência: Vincular ao contrato
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 border-amber-300 text-amber-800 hover:bg-amber-50 dark:text-amber-200 w-full"
                                  onClick={() => handleOpenLinkDialog(po)}
                                >
                                  <Link2 className="h-3 w-3" /> Vincular ao contrato
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <Badge variant="destructive" className="text-[10px]">
                                  Pendência: Cadastrar escola
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 border-rose-300 text-rose-800 hover:bg-rose-50 dark:text-rose-200 w-full"
                                  onClick={() => handleOpenCreateSchoolDialog(po)}
                                >
                                  <PlusCircle className="h-3 w-3" /> Cadastrar escola
                                </Button>
                              </div>
                            )}
                          </TableCell>{' '}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Histórico de Importações Anteriores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Histórico de Importações
          </CardTitle>
          <CardDescription>
            Registro de auditoria de planilhas carregadas no sistema CooperGestão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Ciclo</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="text-center">Total Linhas</TableHead>
                  <TableHead className="text-center">Criados com Sucesso</TableHead>
                  <TableHead className="text-center">Erros / Pendências</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingHistory ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : historyList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                      Nenhuma importação registrada até o momento.
                    </TableCell>
                  </TableRow>
                ) : (
                  historyList.map((imp) => (
                    <TableRow key={imp.id}>
                      <TableCell className="text-xs">
                        {new Date(imp.data || imp.created || '').toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-primary">
                        {imp.arquivo}
                      </TableCell>
                      <TableCell className="text-xs">
                        {imp.expand?.ciclo_id?.nome || imp.ciclo_id}
                      </TableCell>
                      <TableCell className="text-xs">
                        {imp.expand?.contrato_id?.numero || imp.contrato_id}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {imp.linhas_total}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs text-emerald-600 font-semibold">
                        {imp.linhas_ok}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs text-amber-600">
                        {imp.linhas_erro}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG DE RESOLVER PENDÊNCIA: VINCULAR AO CONTRATO (PRÉ-PREENCHIDO) */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" /> Vincular Escola ao Contrato
            </DialogTitle>
            <DialogDescription>
              A escola já existe no <strong>cadastro mestre global</strong>. Confirme o vínculo ao
              contrato <strong>{selectedContract?.numero}</strong> com a rota pré-preenchida.
            </DialogDescription>
          </DialogHeader>

          {pendingLinkOrder && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nome na Planilha:</span>
                  <span className="font-semibold text-foreground">
                    {pendingLinkOrder.schoolNameRaw}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Escola no Cadastro Mestre:</span>
                  <span className="font-semibold text-primary">
                    {pendingLinkOrder.prefilledLink?.escolaNome}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Aba da Planilha:</span>
                  <span className="font-mono text-foreground">{pendingLinkOrder.routeRaw}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="link-rota" className="text-xs">
                  Aba correspondente neste Contrato <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="link-rota"
                  value={linkRotaNome}
                  onChange={(e) => setLinkRotaNome(e.target.value)}
                  placeholder="Ex: ROTA A, ZONA SUL..."
                  className="h-8 text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Sugerida com base na aba da planilha ({pendingLinkOrder.routeRaw}).
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLinkDialogOpen(false)}
              disabled={isLinking}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmLinkSchool}
              disabled={isLinking || !linkRotaNome.trim()}
              className="gap-1.5"
            >
              {isLinking ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Vinculando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar Vínculo
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE RESOLVER PENDÊNCIA: CADASTRAR ESCOLA NO MESTRE */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" /> Cadastrar Escola no Cadastro Mestre
            </DialogTitle>
            <DialogDescription>
              A escola não existe no cadastro mestre. Preencha os dados cadastrais para registrá-la
              no sistema global e vinculá-la ao contrato <strong>{selectedContract?.numero}</strong>
              .
            </DialogDescription>
          </DialogHeader>

          {pendingCreateOrder && (
            <div className="space-y-3 pt-1 text-xs">
              <div className="space-y-1">
                <Label htmlFor="new-sch-name" className="text-xs">
                  Nome da Instituição Escolar <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="new-sch-name"
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                  placeholder="Nome oficial da escola"
                  className="h-8 text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Identificada na planilha como: <em>"{pendingCreateOrder.schoolNameRaw}"</em>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="new-sch-tipo" className="text-xs">
                    Tipo de Instituição
                  </Label>
                  <Select
                    value={newSchoolTipo || 'none'}
                    onValueChange={(val) =>
                      setNewSchoolTipo(val === 'none' ? '' : (val as EscolaTipo))
                    }
                  >
                    <SelectTrigger id="new-sch-tipo" className="h-8 text-xs">
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

                <div className="space-y-1">
                  <Label htmlFor="new-sch-rota" className="text-xs">
                    Rota no Contrato
                  </Label>
                  <Input
                    id="new-sch-rota"
                    value={newSchoolRota}
                    onChange={(e) => setNewSchoolRota(e.target.value)}
                    placeholder="Ex: ROTA A"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="new-sch-tel" className="text-xs">
                    Telefone / Contato
                  </Label>
                  <Input
                    id="new-sch-tel"
                    value={newSchoolContact}
                    onChange={(e) => setNewSchoolContact(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new-sch-email" className="text-xs">
                    E-mail
                  </Label>
                  <Input
                    id="new-sch-email"
                    type="email"
                    value={newSchoolEmail}
                    onChange={(e) => setNewSchoolEmail(e.target.value)}
                    placeholder="escola@educacao.gov.br"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="new-sch-end" className="text-xs">
                  Endereço Completo
                </Label>
                <Input
                  id="new-sch-end"
                  value={newSchoolAddress}
                  onChange={(e) => setNewSchoolAddress(e.target.value)}
                  placeholder="Rua, número, bairro..."
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isCreatingSchool}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmCreateSchool}
              disabled={isCreatingSchool || !newSchoolName.trim()}
              className="gap-1.5"
            >
              {isCreatingSchool ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cadastrando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Salvar & Vincular
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
