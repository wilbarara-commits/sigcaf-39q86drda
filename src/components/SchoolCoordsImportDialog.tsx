import { useState, useRef, useId, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Upload,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check,
  RefreshCw,
  ClipboardPaste,
  HelpCircle,
  ArrowRight,
  FilterX,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  parseFileToMatrix,
  processCoordsMatrix,
  type ParsedCoordRow,
  type CoordsImportResult,
} from '@/lib/schoolCoordsMatcher'
import { parseCsvTextToMatrix } from '@/lib/schoolCsvImporter'
import { escolasService } from '@/services/escolas'
import type { School } from '@/lib/types'

interface SchoolCoordsImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schools: School[]
  onSuccess: () => Promise<void>
}

export function SchoolCoordsImportDialog({
  open,
  onOpenChange,
  schools,
  onSuccess,
}: SchoolCoordsImportDialogProps) {
  const fileInputId = useId()
  const [sourceMode, setSourceMode] = useState<'upload' | 'paste'>('upload')
  const [pastedText, setPastedText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)

  // Resultado do parsing e edições locais (casamento manual)
  const [parseResult, setParseResult] = useState<CoordsImportResult | null>(null)
  const [rows, setRows] = useState<ParsedCoordRow[]>([])

  // Filtros da tabela de pré-visualização
  const [filterStatus, setFilterStatus] = useState<'all' | 'auto' | 'manual' | 'unmatched'>('all')
  const [searchFilter, setSearchFilter] = useState('')

  // Resumo pós-gravação
  const [summary, setSummary] = useState<{
    updated: number
    unmatched: number
    errors: number
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleReset = () => {
    setPastedText('')
    setParseResult(null)
    setRows([])
    setSummary(null)
    setSaveProgress(0)
    setFilterStatus('all')
    setSearchFilter('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Executa o processamento do arquivo
  const handleFileSelect = async (file: File) => {
    setIsParsing(true)
    setSummary(null)
    try {
      const matrix = await parseFileToMatrix(file)
      const res = processCoordsMatrix(matrix, file.name, schools)
      setParseResult(res)
      setRows(res.rows)
      toast.info(
        `${res.totalRows} linha(s) lidas: ${res.matchedAutoCount} casada(s) automaticamente, ${res.unmatchedCount} pendente(s) de casamento.`,
      )
    } catch (err: any) {
      console.error('Erro ao analisar arquivo:', err)
      toast.error(err.message || 'Falha ao analisar arquivo de coordenadas.')
      setParseResult(null)
    } finally {
      setIsParsing(false)
    }
  }

  // Executa o processamento do texto colado
  const handleProcessPasted = () => {
    if (!pastedText.trim()) {
      toast.warning('Cole os dados no campo de texto antes de analisar.')
      return
    }
    setIsParsing(true)
    setSummary(null)
    try {
      const matrix = parseCsvTextToMatrix(pastedText)
      const res = processCoordsMatrix(matrix, 'dados_colados.txt', schools)
      setParseResult(res)
      setRows(res.rows)
      toast.info(
        `${res.totalRows} linha(s) lidas: ${res.matchedAutoCount} casada(s) automaticamente, ${res.unmatchedCount} pendente(s).`,
      )
    } catch (err: any) {
      console.error('Erro ao processar texto colado:', err)
      toast.error(err.message || 'Falha ao analisar dados colados.')
      setParseResult(null)
    } finally {
      setIsParsing(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  // Altera casamento manual de uma linha específica
  const handleManualMatchChange = (rowIndex: number, selectedSchoolId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.index !== rowIndex) return r

        if (selectedSchoolId === '__none__') {
          return {
            ...r,
            matchedSchoolId: undefined,
            matchedSchoolName: undefined,
            matchType: 'none',
            status: 'unmatched',
          }
        }

        const sch = schools.find((s) => s.id === selectedSchoolId)
        if (!sch) return r

        return {
          ...r,
          matchedSchoolId: sch.id,
          matchedSchoolName: sch.name,
          matchType: 'manual',
          status: 'matched_manual',
        }
      }),
    )
  }

  // Grava as alterações no banco de dados
  const handleConfirmSave = async () => {
    const matchedRows = rows.filter((r) => r.matchedSchoolId)
    if (matchedRows.length === 0) {
      toast.warning('Nenhuma escola casada para atualizar no banco.')
      return
    }

    setIsSaving(true)
    setSaveProgress(0)

    try {
      const payload = matchedRows.map((r) => ({
        escolaId: r.matchedSchoolId!,
        cep: r.cep || undefined,
        latitude: r.latitude || undefined,
        longitude: r.longitude || undefined,
      }))

      const { updated, errors } = await escolasService.updateCoordsBatch(
        payload,
        (processed, total) => {
          setSaveProgress(Math.round((processed / total) * 100))
        },
      )

      const unmatchedTotal = rows.length - matchedRows.length

      setSummary({
        updated,
        unmatched: unmatchedTotal,
        errors: errors.length,
      })

      if (updated > 0) {
        toast.success(`Coordenadas atualizadas com sucesso: ${updated} escola(s) atualizada(s)!`)
        await onSuccess()
      } else {
        toast.error('Nenhuma coordenada pôde ser atualizada.')
      }
    } catch (err: any) {
      console.error('Erro ao gravar coordenadas em lote:', err)
      toast.error('Ocorreu um erro ao gravar as coordenadas no banco de dados.')
    } finally {
      setIsSaving(false)
    }
  }

  // Métricas do preview
  const autoMatchedCount = useMemo(
    () => rows.filter((r) => r.status === 'matched_auto').length,
    [rows],
  )
  const manualMatchedCount = useMemo(
    () => rows.filter((r) => r.status === 'matched_manual').length,
    [rows],
  )
  const totalMatchedCount = autoMatchedCount + manualMatchedCount
  const unmatchedCount = useMemo(() => rows.filter((r) => !r.matchedSchoolId).length, [rows])

  // Linhas filtradas
  const displayRows = useMemo(() => {
    return rows.filter((r) => {
      // Filtro por status
      if (filterStatus === 'auto' && r.status !== 'matched_auto') return false
      if (filterStatus === 'manual' && r.status !== 'matched_manual') return false
      if (filterStatus === 'unmatched' && r.matchedSchoolId) return false

      // Busca textual
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase()
        const matchRaw = r.rawEscola.toLowerCase().includes(query)
        const matchDb = r.matchedSchoolName?.toLowerCase().includes(query)
        const matchCep = r.cep.includes(query)
        return matchRaw || matchDb || matchCep
      }

      return true
    })
  }, [rows, filterStatus, searchFilter])

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
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Importar Coordenadas & CEP (XLSX / CSV)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Importe dados geográficos de uma planilha para atualizar{' '}
            <strong>exclusivamente CEP, Latitude e Longitude</strong> das escolas no cadastro
            mestre. Nomes, endereços e demais dados cadastrais não serão alterados.
          </DialogDescription>
        </DialogHeader>

        {/* MODO DE ENTRADA: UPLOAD OU COLAR */}
        {!parseResult && !summary && (
          <div className="space-y-3 flex-1 flex flex-col min-h-0 overflow-y-auto pt-2">
            <div className="flex items-center justify-between">
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
                  Colar da Planilha
                </button>
              </div>

              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5" />
                <span>Colunas detectadas por cabeçalho (Escola, CEP, Latitude, Longitude)</span>
              </div>
            </div>

            {sourceMode === 'upload' ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex-1 border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/60 transition-colors flex flex-col items-center justify-center gap-3 min-h-[220px]"
              >
                <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full">
                  {isParsing ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <Upload className="h-7 w-7" />
                  )}
                </div>

                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    {isParsing
                      ? 'Lendo planilha e realizando casamento de escolas...'
                      : 'Arraste a planilha de escolas (.xlsx ou .csv) aqui'}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Aba sugerida: <strong>"Escolas"</strong>. As coordenadas são automaticamente
                    normalizadas para ponto decimal e vinculadas às escolas existentes no banco.
                  </p>
                </div>

                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .csv, .xls, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0])
                    }
                  }}
                  disabled={isParsing}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isParsing}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1"
                >
                  Selecionar Arquivo XLSX / CSV
                </Button>
              </div>
            ) : (
              <div className="space-y-2 flex-1 flex flex-col">
                <Textarea
                  placeholder={`Cole as linhas da planilha com cabeçalho aqui...\nExemplo:\nEscola\tCEP\tLatitude\tLongitude\nCMEIA Mariana Martuchelli\t25995-630\t-22.22293373\t-42.74465013\nCM Profª Alayde Ferreira da Silva\t25990-110\t-22.37182850\t-42.87150070`}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="flex-1 min-h-[200px] text-xs font-mono resize-none"
                />
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">
                    Suporta colunas separadas por tabulação (Excel), vírgula ou ponto-e-vírgula.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleProcessPasted}
                    disabled={isParsing || !pastedText.trim()}
                    className="gap-1.5"
                  >
                    {isParsing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" /> Analisar Linhas
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RESUMO PÓS-IMPORTAÇÃO (SUCESSO) */}
        {summary && (
          <div className="p-6 bg-muted/40 rounded-xl space-y-4 my-2 border border-border">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-7 w-7 shrink-0" />
              <div>
                <h3 className="font-semibold text-lg">Gravação Concluída</h3>
                <p className="text-sm text-muted-foreground">
                  As coordenadas geográficas e CEPs foram atualizados com sucesso no banco de dados.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Escolas Atualizadas</span>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {summary.updated}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Não Casadas (Ignoradas)</span>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {summary.unmatched}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Erros na Gravação</span>
                <p className="text-2xl font-bold text-destructive">{summary.errors}</p>
              </div>
            </div>
          </div>
        )}

        {/* PRÉ-VISUALIZAÇÃO ANTES DE GRAVAR */}
        {parseResult && !summary && (
          <div className="flex-1 min-h-0 flex flex-col space-y-3 pt-1">
            {/* Cards de Métricas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-card p-2.5 rounded-lg border">
                <span className="text-[11px] text-muted-foreground">Total de Linhas</span>
                <p className="text-lg font-bold">{rows.length}</p>
              </div>
              <div className="bg-card p-2.5 rounded-lg border">
                <span className="text-[11px] text-muted-foreground">Casadas Automaticamente</span>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {autoMatchedCount}
                </p>
              </div>
              <div className="bg-card p-2.5 rounded-lg border">
                <span className="text-[11px] text-muted-foreground">Casamento Manual</span>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {manualMatchedCount}
                </p>
              </div>
              <div className="bg-card p-2.5 rounded-lg border">
                <span className="text-[11px] text-muted-foreground">
                  Não Encontradas / Pendentes
                </span>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {unmatchedCount}
                </p>
              </div>
            </div>

            {/* Barra de Filtros e Busca */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/50 rounded-lg text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant={filterStatus === 'all' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5"
                  onClick={() => setFilterStatus('all')}
                >
                  Todas ({rows.length})
                </Button>
                <Button
                  size="sm"
                  variant={filterStatus === 'auto' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-emerald-600 dark:text-emerald-400"
                  onClick={() => setFilterStatus('auto')}
                >
                  Casadas Automáticas ({autoMatchedCount})
                </Button>
                {manualMatchedCount > 0 && (
                  <Button
                    size="sm"
                    variant={filterStatus === 'manual' ? 'default' : 'ghost'}
                    className="h-7 text-xs px-2.5 text-blue-600 dark:text-blue-400"
                    onClick={() => setFilterStatus('manual')}
                  >
                    Casadas Manuais ({manualMatchedCount})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={filterStatus === 'unmatched' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-amber-600 dark:text-amber-400"
                  onClick={() => setFilterStatus('unmatched')}
                >
                  Não Encontradas ({unmatchedCount})
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-2 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar por nome ou CEP..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="h-7 w-[180px] pl-7 text-xs"
                  />
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2 text-muted-foreground"
                  onClick={handleReset}
                  title="Trocar arquivo / Recomeçar"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Trocar
                </Button>
              </div>
            </div>

            {/* Barra de Progresso de Gravação */}
            {isSaving && (
              <div className="shrink-0 space-y-1.5 p-3 bg-card border rounded-lg">
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                    Atualizando coordenadas no banco de dados...
                  </span>
                  <span className="font-semibold">{saveProgress}%</span>
                </div>
                <Progress value={saveProgress} className="h-2" />
              </div>
            )}

            {/* Tabela de Preview */}
            <div className="flex-1 min-h-[260px] max-h-[48vh] overflow-y-auto overflow-x-auto border rounded-lg bg-card shadow-inner overscroll-contain">
              <table className="w-full text-xs text-left border-collapse min-w-[760px]">
                <thead className="bg-muted text-muted-foreground uppercase sticky top-0 z-20 border-b shadow-xs">
                  <tr>
                    <th className="py-2.5 px-3 w-8 bg-muted font-semibold">#</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold min-w-[190px]">
                      Escola na Planilha
                    </th>
                    <th className="py-2.5 px-3 bg-muted font-semibold min-w-[210px]">
                      Escola no Cadastro Mestre
                    </th>
                    <th className="py-2.5 px-3 bg-muted font-semibold w-24">CEP</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold w-28">Latitude</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold w-28">Longitude</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold w-28">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayRows.map((row) => {
                    const isAuto = row.status === 'matched_auto'
                    const isManual = row.status === 'matched_manual'
                    const isUnmatched = !row.matchedSchoolId

                    return (
                      <tr
                        key={row.index}
                        className={
                          isUnmatched
                            ? 'bg-amber-500/5 hover:bg-amber-500/10'
                            : isManual
                              ? 'bg-blue-500/5 hover:bg-blue-500/10'
                              : 'hover:bg-muted/40'
                        }
                      >
                        <td className="py-2 px-3 text-muted-foreground font-mono">{row.index}</td>

                        {/* Escola Planilha */}
                        <td className="py-2 px-3 font-medium">
                          <span title={row.rawEscola} className="block truncate max-w-[200px]">
                            {row.rawEscola}
                          </span>
                        </td>

                        {/* Seletor / Escola Banco */}
                        <td className="py-1.5 px-3">
                          <Select
                            value={row.matchedSchoolId || '__none__'}
                            onValueChange={(val) => handleManualMatchChange(row.index, val)}
                          >
                            <SelectTrigger className="h-7 text-xs bg-background">
                              <SelectValue placeholder="Selecione a escola correspondente..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-[250px]">
                              <SelectItem value="__none__" className="text-muted-foreground italic">
                                — Não casar / Ignorar esta linha —
                              </SelectItem>
                              {schools.map((sch) => (
                                <SelectItem key={sch.id} value={sch.id} className="text-xs">
                                  {sch.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isManual && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 block pt-0.5">
                              Casamento manual selecionado
                            </span>
                          )}
                        </td>

                        {/* CEP */}
                        <td className="py-2 px-3 font-mono">
                          {row.cep ? (
                            <span>{row.cep}</span>
                          ) : (
                            <span className="text-muted-foreground/50 italic">—</span>
                          )}
                        </td>

                        {/* Latitude */}
                        <td className="py-2 px-3 font-mono text-emerald-700 dark:text-emerald-400">
                          {row.latitude || (
                            <span className="text-muted-foreground/50 italic font-sans">—</span>
                          )}
                        </td>

                        {/* Longitude */}
                        <td className="py-2 px-3 font-mono text-emerald-700 dark:text-emerald-400">
                          {row.longitude || (
                            <span className="text-muted-foreground/50 italic font-sans">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-2 px-3">
                          {isAuto && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-emerald-700 dark:text-emerald-300 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                              Automático
                            </Badge>
                          )}
                          {isManual && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-blue-700 dark:text-blue-300 border-blue-300 bg-blue-50 dark:bg-blue-950/40"
                            >
                              Manual
                            </Badge>
                          )}
                          {isUnmatched && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-700 dark:text-amber-300 border-amber-300 bg-amber-50 dark:bg-amber-950/40"
                            >
                              <AlertCircle className="h-2.5 w-2.5 mr-1" />
                              Não casada
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}

                  {displayRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground text-xs">
                        Nenhuma linha encontrada para o filtro atual.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-[11px] text-muted-foreground flex items-center justify-between px-1">
              <span>
                Linhas casadas para atualização:{' '}
                <strong className="text-foreground">{totalMatchedCount}</strong> de{' '}
                <strong>{rows.length}</strong>
              </span>
              <span>Apenas os campos CEP, latitude e longitude serão gravados.</span>
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 gap-2 sm:gap-0 pt-2 border-t mt-auto">
          {summary ? (
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false)
                handleReset()
              }}
            >
              Concluir
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  handleReset()
                }}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              {parseResult && (
                <Button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={isSaving || totalMatchedCount === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gravando Coordenadas...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Confirmar e Gravar ({totalMatchedCount} escola(s))
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
