import { useState, useRef, useId, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Upload,
  FileSpreadsheet,
  ClipboardPaste,
  Check,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Building2,
  ShieldAlert,
  ArrowRight,
  Layers,
  Sparkles,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { useApp } from '@/context/app-context'
import type { ChamadaRecord, School } from '@/lib/types'
import {
  parseContractBatchMatrix,
  type ContractBatchParseResult,
  type ContractBatchGroup,
  type ContractBatchImportRow,
} from '@/lib/contractBatchImporter'
import { contratosService } from '@/services/contratos'

interface ContractBatchImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => Promise<void>
  initialChamadaId?: string
}

interface ImportFinalSummary {
  contratosCriados: number
  contratosAtualizados: number
  vinculosCriados: number
  vinculosIgnorados: number
  errosCount: number
  detalhesErros: Array<{ contrato: string; escola: string; motivo: string }>
}

export function ContractBatchImportDialog({
  open,
  onOpenChange,
  onSuccess,
  initialChamadaId,
}: ContractBatchImportDialogProps) {
  const { chamadas, schools, contracts, refreshData } = useApp()

  const [selectedChamadaId, setSelectedChamadaId] = useState<string>(initialChamadaId || '')
  const [sourceMode, setSourceMode] = useState<'upload' | 'paste'>('upload')
  const [pastedText, setPastedText] = useState('')
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [parseResult, setParseResult] = useState<ContractBatchParseResult | null>(null)
  const [filterTab, setFilterTab] = useState<'all' | 'problems' | 'new' | 'existing'>('all')

  // Estado de execução da gravação
  const [isSaving, setIsSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)
  const [currentSavingItem, setCurrentSavingItem] = useState<string>('')
  const [importSummary, setImportSummary] = useState<ImportFinalSummary | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputId = useId()

  const selectedChamada = useMemo(
    () => chamadas.find((c) => c.id === selectedChamadaId) || null,
    [chamadas, selectedChamadaId],
  )

  // Escolas ativas ordenadas por nome para os seletores manuais
  const sortedSchools = useMemo(() => {
    return [...schools].sort((a, b) => a.name.localeCompare(b.name))
  }, [schools])

  const handleReset = () => {
    setParseResult(null)
    setPastedText('')
    setSelectedFileName(null)
    setImportSummary(null)
    setSaveProgress(0)
    setCurrentSavingItem('')
    setFilterTab('all')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleChamadaChange = (chId: string) => {
    setSelectedChamadaId(chId)
    // Se já havia um parse, reseta para reprocessar contra a nova chamada
    if (parseResult) {
      handleReset()
      toast.info('Chamada alterada. Selecione ou cole o arquivo novamente para revalidar.')
    }
  }

  // Processa o arquivo ou texto
  const processInput = async (fileOrText: File | string, fileName?: string) => {
    if (!selectedChamada) {
      toast.error('Selecione primeiro a Chamada Pública obrigatória antes de carregar os dados.')
      return
    }

    setIsParsing(true)
    try {
      const result = await parseContractBatchMatrix({
        fileOrText,
        fileName:
          fileName || (typeof fileOrText === 'string' ? 'dados_colados.txt' : fileOrText.name),
        selectedChamada,
        masterSchools: schools,
        allContracts: contracts,
      })
      setParseResult(result)
      if (typeof fileOrText !== 'string') {
        setSelectedFileName(fileOrText.name)
      } else {
        setSelectedFileName('Texto colado da área de transferência')
      }

      if (result.summary.problemRows > 0) {
        toast.warning(
          `Análise concluída com pendências: ${result.summary.problemRows} linha(s) requerem atenção. Verifique os seletores de escola antes de confirmar.`,
        )
      } else {
        toast.success(
          `Arquivo analisado com sucesso! ${result.summary.totalRows} linha(s) prontas para importação em ${result.groups.length} contrato(s).`,
        )
      }
    } catch (err: any) {
      console.error('Erro ao analisar dados:', err)
      toast.error(err?.message || 'Falha ao processar o arquivo/texto de contratos.')
      setParseResult(null)
    } finally {
      setIsParsing(false)
    }
  }

  const handleFileSelect = (file: File) => {
    processInput(file, file.name)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processInput(e.dataTransfer.files[0], e.dataTransfer.files[0].name)
    }
  }

  const handleProcessPasted = () => {
    if (!pastedText.trim()) {
      toast.warning('Cole os dados no campo de texto antes de prosseguir.')
      return
    }
    processInput(pastedText, 'dados_colados.txt')
  }

  // Download do modelo oficial de planilha
  const handleDownloadModel = () => {
    const wb = XLSX.utils.book_new()
    const headers = [
      'Contrato',
      'Nome da Escola',
      'Código INEP',
      'Valor Total',
      'Data de Início',
      'Data de Fim',
    ]
    const sampleRows = [
      ['C-2026-02-01', 'CE ALCINDO GUANABARA', '', '', '', ''],
      ['C-2026-02-02', 'CIA JOSE FRANCISCO LIPPI', '', '', '', ''],
      ['C-2026-02-03', 'CE FANY NISKIER', '', '', '', ''],
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows])

    // Larguras das colunas
    ws['!cols'] = [
      { wch: 18 }, // Contrato
      { wch: 42 }, // Nome da Escola
      { wch: 14 }, // Código INEP
      { wch: 14 }, // Valor Total
      { wch: 14 }, // Data de Início
      { wch: 14 }, // Data de Fim
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Contratos_Escolas')
    XLSX.writeFile(wb, 'modelo_importacao_contratos_sigcaf.xlsx')
    toast.success('Modelo de planilha baixado com sucesso!')
  }

  // Resolução manual de escola para uma linha individual
  const handleManualSchoolSelect = (rowIndex: number, newSchoolId: string) => {
    if (!parseResult) return
    const schoolObj = schools.find((s) => s.id === newSchoolId)
    if (!schoolObj) return

    setParseResult((prev) => {
      if (!prev) return null

      // Clona e atualiza a linha
      const updatedRows = prev.allRows.map((row) => {
        if (row.rowIndex === rowIndex) {
          return {
            ...row,
            matchedSchoolId: schoolObj.id,
            matchedSchoolName: schoolObj.name,
            matchType: 'manual' as const,
            matchScore: 1.0,
            status: 'valid' as const,
            statusReason: 'Escola selecionada manualmente pelo usuário.',
          }
        }
        return row
      })

      // Recompila os grupos e contadores
      const groupMap = new Map<string, ContractBatchImportRow[]>()
      for (const row of updatedRows) {
        const key = row.codigoContrato || `_SEM_CODIGO_${row.rowIndex}`
        if (!groupMap.has(key)) groupMap.set(key, [])
        groupMap.get(key)!.push(row)
      }

      let validRows = 0
      let problemRows = 0
      const uniqueMatched = new Set<string>()

      const groups: ContractBatchGroup[] = prev.groups.map((group) => {
        const gRows = groupMap.get(group.codigoContrato) || group.rows
        let hasErrors = false
        for (const r of gRows) {
          if (r.status === 'valid') {
            validRows++
            if (r.matchedSchoolId) uniqueMatched.add(r.matchedSchoolId)
          } else {
            hasErrors = true
            problemRows++
          }
        }
        return {
          ...group,
          rows: gRows,
          hasErrors,
        }
      })

      return {
        ...prev,
        allRows: updatedRows,
        groups,
        summary: {
          ...prev.summary,
          validRows,
          problemRows,
          uniqueSchoolsCount: uniqueMatched.size,
        },
      }
    })

    toast.success(`Escola vinculada: ${schoolObj.name}`)
  }

  // Confirmação e persistência no banco
  const handleConfirmImport = async () => {
    if (!parseResult || !selectedChamada) return

    // Checar se há linhas com problema
    const problemLines = parseResult.allRows.filter((r) => r.status !== 'valid')
    if (problemLines.length > 0) {
      toast.error(
        `Existem ${problemLines.length} linha(s) com pendências (código vazio, escola não encontrada ou conflito). Corrija-as antes de confirmar.`,
      )
      return
    }

    setIsSaving(true)
    setSaveProgress(0)

    let criados = 0
    let atualizados = 0
    let vinculosCriados = 0
    let vinculosIgnorados = 0
    const detalhesErros: Array<{ contrato: string; escola: string; motivo: string }> = []

    try {
      const groupsToSave = parseResult.groups
      const totalGroups = groupsToSave.length

      for (let gIdx = 0; gIdx < totalGroups; gIdx++) {
        const group = groupsToSave[gIdx]
        setCurrentSavingItem(`Processando contrato ${group.codigoContrato}...`)

        let contratoId = group.existingContractId

        try {
          if (!group.isExistingContract || !contratoId) {
            // Criação de NOVO contrato
            // Herda programa e modalidade da Chamada
            const novoContrato = await contratosService.create({
              numero: group.codigoContrato,
              chamada_id: selectedChamada.id,
              numero_chamada: selectedChamada.chamada,
              tipo: selectedChamada.programa || 'PNAE',
              modalidade_pedido: selectedChamada.modalidade || 'individualizado',
              valor_total: group.valorTotal !== undefined ? group.valorTotal : 0,
              status: 'Ativo',
            })
            contratoId = novoContrato.id
            criados++
          } else {
            // Contrato EXISTENTE que ganhará novas escolas
            // Atualiza valor total se houver valor informado na planilha e o contrato atual tiver 0
            if (group.valorTotal !== undefined && group.valorTotal > 0) {
              await contratosService.update(contratoId, {
                valor_total: group.valorTotal,
              })
            }
            atualizados++
          }

          // Persistência dos vínculos contrato x escola (idempotente)
          if (contratoId) {
            // Carrega vínculos atuais deste contrato para evitar duplicatas
            const currentLinks = await contratosService.getEscolas(contratoId)
            const existingSchoolIds = new Set(
              currentLinks.filter((l) => !l.encerrado_em).map((l) => l.escola_id),
            )

            // Vínculos únicos para esta planilha neste contrato
            const targetSchoolIds = new Set<string>()
            for (const row of group.rows) {
              if (row.matchedSchoolId) {
                targetSchoolIds.add(row.matchedSchoolId)
              }
            }

            for (const escolaId of targetSchoolIds) {
              if (existingSchoolIds.has(escolaId)) {
                vinculosIgnorados++
                continue
              }

              try {
                await contratosService.linkEscola({
                  contrato_id: contratoId,
                  escola_id: escolaId,
                  coleta_por: 'padrao',
                })
                vinculosCriados++
              } catch (linkErr: any) {
                console.error(
                  `Erro ao vincular escola ${escolaId} ao contrato ${group.codigoContrato}:`,
                  linkErr,
                )
                const sch = schools.find((s) => s.id === escolaId)
                detalhesErros.push({
                  contrato: group.codigoContrato,
                  escola: sch?.name || escolaId,
                  motivo: linkErr?.message || 'Falha ao criar vínculo contrato_escolas.',
                })
              }
            }
          }
        } catch (contractErr: any) {
          console.error(`Erro ao salvar contrato ${group.codigoContrato}:`, contractErr)
          detalhesErros.push({
            contrato: group.codigoContrato,
            escola: 'Todos os vínculos',
            motivo: contractErr?.message || 'Falha ao criar/atualizar o contrato no banco.',
          })
        }

        setSaveProgress(Math.round(((gIdx + 1) / totalGroups) * 100))
      }

      setImportSummary({
        contratosCriados: criados,
        contratosAtualizados: atualizados,
        vinculosCriados,
        vinculosIgnorados,
        errosCount: detalhesErros.length,
        detalhesErros,
      })

      // Atualiza os dados do app context
      await refreshData()
      await onSuccess()

      if (detalhesErros.length === 0) {
        toast.success(
          `Carga em massa finalizada! ${criados} contrato(s) criado(s), ${atualizados} atualizado(s) e ${vinculosCriados} vínculo(s) persistido(s).`,
        )
      } else {
        toast.warning(
          `Carga finalizada com ${detalhesErros.length} erro(s). Consulte o resumo de importação.`,
        )
      }
    } catch (err: any) {
      console.error('Erro global na gravação da importação:', err)
      toast.error('Ocorreu uma falha inesperada durante a gravação.')
    } finally {
      setIsSaving(false)
      setCurrentSavingItem('')
    }
  }

  // Filtro de grupos no preview
  const filteredGroups = useMemo(() => {
    if (!parseResult) return []
    return parseResult.groups.filter((g) => {
      if (filterTab === 'problems') return g.hasErrors
      if (filterTab === 'new') return !g.isExistingContract && !g.hasErrors
      if (filterTab === 'existing') return g.isExistingContract && !g.hasErrors
      return true
    })
  }, [parseResult, filterTab])

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isSaving) {
          onOpenChange(v)
          if (!v) handleReset()
        }
      }}
    >
      <DialogContent className="max-w-[96vw] sm:max-w-4xl lg:max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 border-b pb-3">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Contratos em Massa (XLSX / CSV / Colar)
          </DialogTitle>
          <DialogDescription>
            Carga de contratos e escolas vinculadas para a Chamada selecionada. Uma linha por
            vínculo contrato×escola (códigos repetidos acrescentam escolas ao mesmo contrato).
          </DialogDescription>
        </DialogHeader>

        {/* PASSO 1: SELETOR OBRIGATÓRIO DE CHAMADA PÚBLICA */}
        <div className="shrink-0 bg-muted/30 p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 flex-1">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              Chamada Pública Vinculada <span className="text-destructive">*</span>
            </label>
            <p className="text-[11px] text-muted-foreground">
              Todos os contratos desta carga nascerão vinculados a esta chamada e herdarão seu
              Programa, Modalidade e Dependência.
            </p>
          </div>
          <div className="w-full sm:w-80">
            <Select
              value={selectedChamadaId}
              onValueChange={handleChamadaChange}
              disabled={isSaving || isParsing}
            >
              <SelectTrigger
                className={`h-9 text-xs ${!selectedChamadaId ? 'border-destructive text-destructive' : 'font-medium'}`}
              >
                <SelectValue placeholder="Selecione a Chamada Pública..." />
              </SelectTrigger>
              <SelectContent>
                {chamadas.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">
                    Nenhuma chamada cadastrada no sistema.
                  </div>
                ) : (
                  chamadas.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id} className="text-xs">
                      {ch.chamada} {ch.programa ? `(${ch.programa})` : ''} - {ch.status}
                      {ch.dependencia_administrativa ? ` • ${ch.dependencia_administrativa}` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* SELEÇÃO DO MÉTODO DE ENTRADA OU VISUALIZAÇÃO DOS DADOS */}
        {!parseResult && !importSummary && (
          <div className="space-y-3 flex-1 flex flex-col min-h-0 overflow-y-auto pt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex rounded-lg border bg-muted p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSourceMode('upload')}
                  className={`px-3 py-1 rounded font-medium transition-colors ${
                    sourceMode === 'upload'
                      ? 'bg-background shadow-xs text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5 inline mr-1.5" />
                  Arquivo (.xlsx ou .csv)
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('paste')}
                  className={`px-3 py-1 rounded font-medium transition-colors ${
                    sourceMode === 'paste'
                      ? 'bg-background shadow-xs text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ClipboardPaste className="h-3.5 w-3.5 inline mr-1.5" />
                  Colar Dados
                </button>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 text-muted-foreground"
                onClick={handleDownloadModel}
              >
                <Download className="h-3.5 w-3.5" /> Baixar Modelo XLSX
              </Button>
            </div>

            {sourceMode === 'upload' ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className={`flex-1 border-2 border-dashed rounded-xl p-8 text-center transition-colors flex flex-col items-center justify-center gap-3 min-h-[220px] ${
                  !selectedChamadaId
                    ? 'border-border/60 bg-muted/10 opacity-70 cursor-not-allowed'
                    : 'border-border hover:border-primary/60 bg-card'
                }`}
              >
                <div className="p-3 bg-primary/10 text-primary rounded-full">
                  {isParsing ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <Upload className="h-7 w-7" />
                  )}
                </div>

                <div className="space-y-1 max-w-md">
                  <p className="font-semibold text-sm">
                    {isParsing
                      ? 'Analisando planilha e casando escolas...'
                      : selectedChamadaId
                        ? 'Arraste sua planilha Excel (.xlsx) ou CSV aqui'
                        : 'Selecione a Chamada acima para habilitar o envio'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Colunas essenciais: <strong>Contrato</strong> e <strong>Nome da Escola</strong>{' '}
                    (uma linha por escola vinculada). Código INEP, Valor Total e Datas são
                    opcionais.
                  </p>
                </div>

                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0])
                    }
                  }}
                  disabled={isParsing || !selectedChamadaId}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isParsing || !selectedChamadaId}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2"
                >
                  Selecionar Arquivo no Computador
                </Button>
              </div>
            ) : (
              <div className="space-y-2 flex-1 flex flex-col">
                <Textarea
                  placeholder={`Cole aqui as linhas copiadas do Excel (separadas por tabulação) ou CSV (separador ; ou vírgula).\n\nExemplo:\nContrato\tNome da Escola\nC-2026-02-01\tCE ALCINDO GUANABARA\nC-2026-02-02\tCIA JOSE FRANCISCO LIPPI\nC-2026-02-03\tCE FANY NISKIER`}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  disabled={isParsing || !selectedChamadaId}
                  className="flex-1 min-h-[220px] text-xs font-mono resize-none"
                />
                <div className="flex justify-between items-center pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    Suporta colunas separadas por tabulação, ponto-e-vírgula ou vírgula.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleProcessPasted}
                    disabled={isParsing || !selectedChamadaId || !pastedText.trim()}
                    className="gap-1.5"
                  >
                    {isParsing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" /> Analisar e Validar Dados
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PRÉ-VISUALIZAÇÃO COM AGRUPAMENTO POR CONTRATO */}
        {parseResult && !importSummary && (
          <div className="flex-1 min-h-0 flex flex-col space-y-3 pt-1">
            {/* Barra de métricas e filtros */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 shrink-0">
              <div
                onClick={() => setFilterTab('all')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  filterTab === 'all'
                    ? 'bg-primary/5 border-primary shadow-xs'
                    : 'bg-card hover:bg-muted/40'
                }`}
              >
                <span className="text-[10px] text-muted-foreground block font-medium">
                  Total de Linhas
                </span>
                <p className="text-xl font-bold text-foreground">{parseResult.summary.totalRows}</p>
                <span className="text-[10px] text-muted-foreground">
                  {parseResult.groups.length} contrato(s)
                </span>
              </div>

              <div
                onClick={() => setFilterTab('new')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  filterTab === 'new'
                    ? 'bg-emerald-500/10 border-emerald-500 shadow-xs'
                    : 'bg-card hover:bg-muted/40'
                }`}
              >
                <span className="text-[10px] text-muted-foreground block font-medium">
                  Contratos Novos
                </span>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {parseResult.summary.newContractsCount}
                </p>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                  serão criados
                </span>
              </div>

              <div
                onClick={() => setFilterTab('existing')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  filterTab === 'existing'
                    ? 'bg-blue-500/10 border-blue-500 shadow-xs'
                    : 'bg-card hover:bg-muted/40'
                }`}
              >
                <span className="text-[10px] text-muted-foreground block font-medium">
                  Existentes (Acréscimo)
                </span>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {parseResult.summary.existingContractsCount}
                </p>
                <span className="text-[10px] text-blue-700 dark:text-blue-400">
                  receberão escolas
                </span>
              </div>

              <div
                onClick={() => setFilterTab('problems')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  filterTab === 'problems'
                    ? 'bg-amber-500/10 border-amber-500 shadow-xs'
                    : 'bg-card hover:bg-muted/40'
                }`}
              >
                <span className="text-[10px] text-muted-foreground block font-medium">
                  Linhas com Problema
                </span>
                <p
                  className={`text-xl font-bold ${
                    parseResult.summary.problemRows > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground'
                  }`}
                >
                  {parseResult.summary.problemRows}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {parseResult.summary.problemRows > 0 ? 'requerem ajuste' : 'nenhuma'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg border bg-card">
                <span className="text-[10px] text-muted-foreground block font-medium">
                  Escolas Casadas
                </span>
                <p className="text-xl font-bold text-foreground">
                  {parseResult.summary.uniqueSchoolsCount}
                </p>
                <span className="text-[10px] text-muted-foreground">únicas no mestre</span>
              </div>
            </div>

            {/* Aviso se houver divergência de valor total informada nas linhas repetidas */}
            {parseResult.groups.some((g) => g.hasDivergentValorTotal) && (
              <div className="shrink-0 p-2.5 bg-amber-500/10 border border-amber-300 dark:border-amber-800 rounded-md text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Foram encontradas linhas com valores totais divergentes para o mesmo contrato.
                  Conforme a regra do sistema, o primeiro valor válido foi selecionado para
                  gravação.
                </span>
              </div>
            )}

            {/* Lista dos Grupos de Contrato */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
              {filteredGroups.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground border rounded-lg bg-muted/20">
                  Nenhum contrato corresponde ao filtro selecionado.
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <div
                    key={group.codigoContrato}
                    className={`rounded-lg border p-3 transition-colors ${
                      group.hasErrors
                        ? 'border-amber-400 dark:border-amber-700 bg-amber-500/5'
                        : group.isExistingContract
                          ? 'border-blue-300 dark:border-blue-900 bg-blue-500/5'
                          : 'border-border bg-card'
                    }`}
                  >
                    {/* Cabeçalho do Grupo de Contrato */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b mb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base text-foreground font-mono">
                          {group.codigoContrato}
                        </span>

                        {group.isExistingContract ? (
                          <Badge
                            variant="secondary"
                            className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 gap-1 text-[11px]"
                          >
                            <RefreshCw className="h-3 w-3" /> Contrato Existente (
                            {group.existingSchoolCount} escola(s) prévias)
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 gap-1 text-[11px]"
                          >
                            <Sparkles className="h-3 w-3" /> Contrato Novo
                          </Badge>
                        )}

                        {group.hasErrors && (
                          <Badge variant="destructive" className="gap-1 text-[11px]">
                            <AlertCircle className="h-3 w-3" /> Requer Ajuste
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {group.valorTotal !== undefined && (
                          <span>
                            Valor:{' '}
                            <strong className="text-foreground">
                              R${' '}
                              {group.valorTotal.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                              })}
                            </strong>
                          </span>
                        )}
                        <span>
                          Total de Vínculos:{' '}
                          <strong className="text-foreground">{group.rows.length} escola(s)</strong>
                        </span>
                      </div>
                    </div>

                    {/* Tabela de Linhas do Contrato */}
                    <div className="rounded border bg-background overflow-hidden">
                      <Table className="text-xs">
                        <TableHeader className="bg-muted/40">
                          <TableRow className="h-8">
                            <TableHead className="w-12 text-center">Linha</TableHead>
                            <TableHead>Escola na Planilha</TableHead>
                            <TableHead>INEP</TableHead>
                            <TableHead className="w-[320px]">
                              Escola Correspondente no Mestre
                            </TableHead>
                            <TableHead className="w-32">Status / Casamento</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.rows.map((row) => (
                            <TableRow
                              key={row.rowIndex}
                              className={`h-9 ${
                                row.status !== 'valid' ? 'bg-amber-500/10 dark:bg-amber-950/20' : ''
                              }`}
                            >
                              <TableCell className="text-center font-mono text-muted-foreground text-[11px]">
                                {row.rowIndex}
                              </TableCell>
                              <TableCell className="font-medium text-foreground">
                                {row.nomeEscola || (
                                  <span className="text-destructive italic font-normal">
                                    [Não informado]
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-muted-foreground text-[11px]">
                                {row.codigoInep || '—'}
                              </TableCell>
                              <TableCell>
                                {row.status === 'valid' ? (
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="truncate font-semibold text-foreground">
                                      {row.matchedSchoolName}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <Select
                                      value={row.matchedSchoolId || ''}
                                      onValueChange={(val) =>
                                        handleManualSchoolSelect(row.rowIndex, val)
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-xs border-amber-400 dark:border-amber-700 bg-background">
                                        <SelectValue placeholder="Selecione manualmente a escola..." />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-56">
                                        {sortedSchools.map((s) => (
                                          <SelectItem key={s.id} value={s.id} className="text-xs">
                                            {s.name}{' '}
                                            {s.codigo_inep ? `(INEP: ${s.codigo_inep})` : ''}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {row.statusReason && (
                                      <span className="text-[10px] text-amber-700 dark:text-amber-400 block leading-tight">
                                        {row.statusReason}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {row.status === 'valid' ? (
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] gap-1 ${
                                      row.matchType === 'inep'
                                        ? 'border-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300'
                                        : row.matchType === 'manual'
                                          ? 'border-purple-400 text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300'
                                          : 'border-emerald-400 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    }`}
                                  >
                                    <Check className="h-3 w-3" />
                                    {row.matchType === 'inep'
                                      ? 'Casado por INEP'
                                      : row.matchType === 'manual'
                                        ? 'Manual'
                                        : 'Casado por Nome'}
                                  </Badge>
                                ) : row.status === 'conflict_other_contract' ? (
                                  <Badge variant="destructive" className="text-[10px] gap-1">
                                    <ShieldAlert className="h-3 w-3" /> Conflito Contrato
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] gap-1"
                                  >
                                    <AlertCircle className="h-3 w-3" /> Pendente
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* RESUMO FINAL PÓS-IMPORTAÇÃO */}
        {importSummary && (
          <div className="p-6 bg-muted/30 rounded-xl space-y-4 my-2 border">
            <div className="flex items-center gap-3">
              {importSummary.errosCount === 0 ? (
                <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-full">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
              ) : (
                <div className="p-2 bg-amber-500/10 text-amber-600 rounded-full">
                  <AlertCircle className="h-8 w-8" />
                </div>
              )}
              <div>
                <h3 className="font-bold text-lg text-foreground">
                  {importSummary.errosCount === 0
                    ? 'Importação Concluída com Sucesso!'
                    : 'Importação Concluída com Alertas'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Todos os contratos válidos e vínculos foram integrados à Chamada pública{' '}
                  <strong className="text-foreground">{selectedChamada?.chamada}</strong>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-card p-3 rounded-lg border">
                <span className="text-xs text-muted-foreground">Contratos Criados</span>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {importSummary.contratosCriados}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border">
                <span className="text-xs text-muted-foreground">Contratos Atualizados</span>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {importSummary.contratosAtualizados}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border">
                <span className="text-xs text-muted-foreground">Vínculos Escola×Contrato</span>
                <p className="text-2xl font-bold text-primary">{importSummary.vinculosCriados}</p>
              </div>
              <div className="bg-card p-3 rounded-lg border">
                <span className="text-xs text-muted-foreground">Falhas / Erros</span>
                <p
                  className={`text-2xl font-bold ${
                    importSummary.errosCount > 0 ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {importSummary.errosCount}
                </p>
              </div>
            </div>

            {importSummary.detalhesErros.length > 0 && (
              <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg space-y-2">
                <h4 className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" /> Detalhes dos erros encontrados:
                </h4>
                <div className="max-h-36 overflow-y-auto space-y-1 text-xs">
                  {importSummary.detalhesErros.map((item, i) => (
                    <div key={i} className="text-destructive/90">
                      • <strong>{item.contrato}:</strong> {item.escola} — {item.motivo}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BARRA DE PROGRESSO DE GRAVAÇÃO */}
        {isSaving && (
          <div className="space-y-2 p-4 bg-muted/40 rounded-lg border">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Gravando no banco de
                dados...
              </span>
              <span className="font-mono font-bold text-primary">{saveProgress}%</span>
            </div>
            <Progress value={saveProgress} className="h-2" />
            <p className="text-[11px] text-muted-foreground truncate">{currentSavingItem}</p>
          </div>
        )}

        {/* RODAPÉ COM AÇÕES */}
        <DialogFooter className="shrink-0 border-t pt-3 flex flex-row items-center justify-between gap-2">
          {importSummary ? (
            <div className="w-full flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  handleReset()
                }}
              >
                Concluir e Fechar
              </Button>
            </div>
          ) : parseResult ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving}
                onClick={handleReset}
              >
                Voltar / Carregar Outro
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => {
                    onOpenChange(false)
                    handleReset()
                  }}
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving || parseResult.summary.problemRows > 0}
                  onClick={handleConfirmImport}
                  className="gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Gravando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> Confirmar e Gravar {parseResult.groups.length}{' '}
                      Contrato(s)
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
