import { useState, useRef, useId } from 'react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Check,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Settings2,
  ClipboardPaste,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import * as XLSX from 'xlsx'
import {
  parseSchoolsInput,
  type CsvParseResult,
  type ParsedCsvSchoolRow,
  type ExistingSchoolData,
  type BlankFieldMode,
} from '@/lib/schoolCsvImporter'
import { escolasService } from '@/services/escolas'
import type { School } from '@/lib/types'

interface SchoolImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schools: School[]
  onSuccess: () => Promise<void>
}

export function SchoolImportDialog({
  open,
  onOpenChange,
  schools,
  onSuccess,
}: SchoolImportDialogProps) {
  const fileInputId = useId()
  const [sourceMode, setSourceMode] = useState<'upload' | 'paste'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null)
  const [filterTab, setFilterTab] = useState<
    'all' | 'valid' | 'update' | 'duplicate_file' | 'error'
  >('all')
  const [blankMode, setBlankMode] = useState<BlankFieldMode>('keep')
  const [importSummary, setImportSummary] = useState<{
    created: number
    updated: number
    duplicatesIgnored: number
    errors: number
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentSourceRef = useRef<{ fileOrText: File | string; fileName?: string } | null>(null)

  const runParse = async (
    fileOrText: File | string,
    fileName?: string,
    modeToUse: BlankFieldMode = blankMode,
  ) => {
    setImportSummary(null)
    setIsParsing(true)
    currentSourceRef.current = { fileOrText, fileName }
    try {
      const existing: ExistingSchoolData[] = schools.map((s) => ({
        id: s.id,
        nome: s.name,
        tipo: s.tipo,
        rota: s.route,
        alunos: s.alunos,
        endereco: s.address,
        telefone: s.contact,
        email: s.email,
        bairro: s.bairro,
        contato: s.contatoResponsavel,
      }))
      const result = await parseSchoolsInput({
        fileOrText,
        fileName,
        existingMasterSchools: existing,
        blankMode: modeToUse,
      })
      setParseResult(result)

      const totalProcessable = result.validRows.length + result.updateRows.length
      if (totalProcessable > 0) {
        toast.info(
          `${result.validRows.length} nova(s) para criar e ${result.updateRows.length} para atualizar no cadastro mestre.`,
        )
      } else {
        toast.warning(
          'Nenhuma escola elegível detectada. Verifique se as linhas contêm dados válidos.',
        )
      }
    } catch (err: any) {
      console.error('Erro ao analisar dados:', err)
      toast.error(err.message || 'Erro ao processar o arquivo/texto.')
      setParseResult(null)
    } finally {
      setIsParsing(false)
    }
  }

  const handleBlankModeChange = (newMode: BlankFieldMode) => {
    setBlankMode(newMode)
    if (currentSourceRef.current) {
      runParse(currentSourceRef.current.fileOrText, currentSourceRef.current.fileName, newMode)
    }
  }

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)
    runParse(selectedFile, selectedFile.name)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleProcessPastedText = () => {
    if (!pastedText.trim()) {
      toast.warning('Cole os dados no campo de texto antes de analisar.')
      return
    }
    runParse(pastedText, 'dados_colados.csv')
  }

  const handleReset = () => {
    setFile(null)
    setPastedText('')
    currentSourceRef.current = null
    setParseResult(null)
    setImportSummary(null)
    setSaveProgress(0)
    setBlankMode('keep')
    setFilterTab('all')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDownloadModel = () => {
    // Ordem esperada pelo usuário:
    // Nome da Escola | Tipo | Rota | Nº Alunos | Telefone | Bairro | Endereço | Contato | E-mail
    // com Bairro adjacente a Endereço e Contato adjacente a E-mail.
    const wsData = [
      [
        'Nome da Escola',
        'Tipo',
        'Rota',
        'Nº Alunos',
        'Telefone',
        'Bairro',
        'Endereço',
        'Contato',
        'E-mail',
      ],
      [
        'CMEI MARIA TEREZA PRIES DE ABREU',
        'CMEI',
        'Rota 01',
        '125',
        '(21) 98765-4321',
        'Centro',
        'Rua das Palmeiras, 120',
        'Diretora Ana',
        'cmei.maria@educacao.gov.br',
      ],
      [
        'CC LAR VOVÔ MIGUEL',
        'CRECHE',
        'Rota 02',
        '47',
        '(21) 99887-1122',
        'Bairro Novo',
        'Av. Brasil, 450',
        'Coordenadora Maria',
        'creche.miguel@educacao.gov.br',
      ],
      [
        'EM ALICE SALDANHA',
        'FUNDAMENTAL',
        'Rota 01',
        '171',
        '(21) 97766-3344',
        'São Pedro',
        'Rua São Pedro, 80',
        'Marcos Silva',
        'em.alice@educacao.gov.br',
      ],
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Escolas')
    XLSX.writeFile(wb, 'modelo_importacao_escolas.xlsx')
  }

  const handleConfirmImport = async () => {
    if (!parseResult) return
    const processableRows = parseResult.allRows.filter(
      (r) => r.status === 'valid' || r.status === 'update',
    )
    if (processableRows.length === 0) return

    setIsSaving(true)
    setSaveProgress(0)

    try {
      const payload = processableRows.map((r) => ({
        action: r.status === 'update' ? ('update' as const) : ('create' as const),
        id: r.existingSchoolId,
        nome: r.nome,
        tipo: r.tipo,
        alunos: r.alunos,
        endereco: r.endereco,
        telefone: r.telefone,
        email: r.email,
        bairro: r.bairro,
        contato: r.contato,
        presentColumns: r.presentColumns,
      }))

      const { created, updated, errors } = await escolasService.importBatch(
        payload,
        blankMode,
        (processed, total) => {
          setSaveProgress(Math.round((processed / total) * 100))
        },
      )

      const totalDuplicates = parseResult.duplicateFileCount
      const totalErrors = errors.length + parseResult.errorCount

      setImportSummary({
        created,
        updated,
        duplicatesIgnored: totalDuplicates,
        errors: totalErrors,
      })

      const totalSuccess = created + updated
      if (totalSuccess > 0) {
        toast.success(
          `Importação concluída: ${created} criada(s), ${updated} atualizada(s) no cadastro mestre!`,
        )
        await onSuccess()
      } else {
        toast.error('Nenhuma escola pôde ser gravada ou atualizada.')
      }
    } catch (err: any) {
      console.error('Erro durante a gravação/atualização em lote:', err)
      toast.error('Ocorreu um erro ao gravar as alterações no banco.')
    } finally {
      setIsSaving(false)
    }
  }

  // Total de itens a processar (novas + atualizações)
  const processableCount =
    (parseResult?.validRows.length || 0) + (parseResult?.updateRows.length || 0)

  // Filtragem dos itens no preview
  const displayRows =
    parseResult?.allRows.filter((row) => {
      if (filterTab === 'valid') return row.status === 'valid'
      if (filterTab === 'update') return row.status === 'update'
      if (filterTab === 'duplicate_file') return row.status === 'duplicate_file'
      if (filterTab === 'error') return row.status === 'error'
      return true
    }) || []

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
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar / Atualizar Escolas (CSV / Planilha / Colar)
          </DialogTitle>
          <DialogDescription>
            Importe ou cole listas de escolas. O cabeçalho na 1ª linha mapeia as colunas (Nome da
            Escola, Tipo, Rota, Nº Alunos, Telefone, Bairro, Endereço, Contato, E-mail). O nome da
            escola é obrigatório; para escolas já existentes, colunas em branco mantêm os dados já
            gravados.
          </DialogDescription>
        </DialogHeader>

        {/* SELEÇÃO DO MÉTODO: ARQUIVO OU COLAR */}
        {!parseResult && !importSummary && (
          <div className="space-y-3 flex-1 flex flex-col min-h-0 overflow-y-auto">
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
                  Arquivo (.csv ou .xlsx)
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
                className="h-7 text-xs gap-1.5 text-muted-foreground"
                onClick={handleDownloadModel}
              >
                <Download className="h-3.5 w-3.5" /> Baixar Modelo
              </Button>
            </div>

            {sourceMode === 'upload' ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex-1 border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/60 transition-colors flex flex-col items-center justify-center gap-3 min-h-[220px]"
              >
                <div className="p-3 bg-primary/10 text-primary rounded-full">
                  {isParsing ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <Upload className="h-7 w-7" />
                  )}
                </div>

                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    {isParsing
                      ? 'Analisando arquivo e checando escolas...'
                      : 'Arraste seu arquivo CSV ou Excel aqui'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Colunas aceitas: <strong>Nome da Escola</strong> (obrigatória),{' '}
                    <strong>Tipo</strong>, <strong>Nº Alunos</strong>, <strong>Telefone</strong>,{' '}
                    <strong>Bairro</strong>, <strong>Endereço</strong>, <strong>Contato</strong>,{' '}
                    <strong>E-mail</strong>.{' '}
                    <em>(Nota: rotas são geridas exclusivamente por contrato)</em>
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
                  Selecionar Arquivo do Computador
                </Button>
              </div>
            ) : (
              <div className="space-y-2 flex-1 flex flex-col">
                <Textarea
                  placeholder={`Cole as linhas do Excel ou CSV aqui (com cabeçalho na 1ª linha)...\nExemplo:\nNome da Escola\tTipo\tRota\tNº Alunos\tTelefone\tBairro\tEndereço\tContato\tE-mail\nEM ALICE SALDANHA\tFUNDAMENTAL\tRota 01\t171\t(21) 97766-3344\tSão Pedro\tRua São Pedro, 80\tMarcos Silva\tem.alice@educacao.gov.br\nCMEI MARIA TEREZA\tCMEI\tRota 01\t125\t(21) 98765-4321\tCentro\tRua das Palmeiras, 120\tDiretora Ana\tcmei.maria@educacao.gov.br`}
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
                    onClick={handleProcessPastedText}
                    disabled={isParsing || !pastedText.trim()}
                    className="gap-1.5"
                  >
                    {isParsing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" /> Analisar e Validar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RESUMO PÓS-IMPORTAÇÃO (SUCESSO) */}
        {importSummary && (
          <div className="p-6 bg-muted/40 rounded-xl space-y-4 my-2 border border-border">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-7 w-7 shrink-0" />
              <div>
                <h3 className="font-semibold text-lg">Processamento Concluído</h3>
                <p className="text-sm text-muted-foreground">
                  O cadastro mestre de escolas foi processado com sucesso.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Novas Criadas</span>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {importSummary.created}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Atualizadas (Upsert)</span>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {importSummary.updated}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Duplicadas no Arquivo</span>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {importSummary.duplicatesIgnored}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Linhas com Erro</span>
                <p className="text-2xl font-bold text-destructive">{importSummary.errors}</p>
              </div>
            </div>
          </div>
        )}

        {/* PREVIEW DA IMPORTAÇÃO */}
        {parseResult && !importSummary && (
          <div className="flex-1 min-h-0 flex flex-col space-y-3">
            {/* SELETOR VISÍVEL DE COMPORTAMENTO PARA CAMPO EM BRANCO (REGRA 2) */}
            <div className="shrink-0 p-3.5 bg-card border-2 border-primary/20 dark:border-primary/30 rounded-xl space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Settings2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Comportamento para campo em branco na planilha (opção global):</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>
                    Campos em branco na planilha:{' '}
                    <strong className="text-foreground">
                      {parseResult.blankStats.totalBlankCellsInPresentCols}
                    </strong>{' '}
                    célula(s)
                  </span>
                  {parseResult.blankStats.updateRowsWithBlankInPresentCols > 0 && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {parseResult.blankStats.updateRowsWithBlankInPresentCols} existente(s) com
                      campos em branco
                    </Badge>
                  )}
                </div>
              </div>

              <RadioGroup
                value={blankMode}
                onValueChange={(val) => handleBlankModeChange(val as BlankFieldMode)}
                className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs"
              >
                <div
                  onClick={() => handleBlankModeChange('keep')}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                    blankMode === 'keep'
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-border/70 hover:border-border hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="keep" id="mode-keep" className="mt-0.5" />
                    <Label htmlFor="mode-keep" className="cursor-pointer space-y-0.5 leading-snug">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <span>Manter valor anterior</span>
                        {blankMode === 'keep' && (
                          <Badge variant="secondary" className="text-[10px] font-normal py-0">
                            Ativo
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Campo em branco na planilha <strong>NÃO</strong> altera o valor já
                        cadastrado. Preserva os dados do cadastro mestre.
                      </p>
                    </Label>
                  </div>
                </div>

                <div
                  onClick={() => handleBlankModeChange('clear')}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                    blankMode === 'clear'
                      ? 'border-destructive/60 bg-destructive/5 shadow-xs'
                      : 'border-border/70 hover:border-border hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="clear" id="mode-clear" className="mt-0.5" />
                    <Label htmlFor="mode-clear" className="cursor-pointer space-y-0.5 leading-snug">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <span>Limpar campo no banco</span>
                        {blankMode === 'clear' && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] font-normal py-0 bg-destructive/80"
                          >
                            Ativo (limpará)
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        O valor anterior é <strong>substituído por vazio</strong> nas colunas
                        presentes que vierem em branco.
                      </p>
                    </Label>
                  </div>
                </div>
              </RadioGroup>

              {/* Informativo dinâmico da opção escolhida e contadores de criação vs atualização */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground border-t border-border/50">
                <span>
                  Modo ativo:{' '}
                  {blankMode === 'keep' ? (
                    <strong className="text-foreground">
                      Manter valores existentes (nenhum campo apagado)
                    </strong>
                  ) : (
                    <strong className="text-destructive">
                      Limpar campos em branco no banco (para colunas presentes no cabeçalho)
                    </strong>
                  )}
                </span>
                <span className="text-muted-foreground">
                  Colunas ausentes no cabeçalho não são afetadas.
                </span>
              </div>
            </div>

            {/* Header com métricas e filtros */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/50 rounded-lg text-xs">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <span className="font-medium truncate max-w-[200px]">{parseResult.fileName}</span>
                <Badge variant="outline" className="text-[11px]">
                  {parseResult.totalRows} linhas
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant={filterTab === 'all' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5"
                  onClick={() => setFilterTab('all')}
                >
                  Todas ({parseResult.totalRows})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'valid' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-emerald-600 dark:text-emerald-400"
                  onClick={() => setFilterTab('valid')}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Novas ({parseResult.validRows.length})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'update' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-blue-600 dark:text-blue-400"
                  onClick={() => setFilterTab('update')}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Atualizações ({parseResult.updateRows.length})
                </Button>
                {parseResult.duplicateFileCount > 0 && (
                  <Button
                    size="sm"
                    variant={filterTab === 'duplicate_file' ? 'default' : 'ghost'}
                    className="h-7 text-xs px-2.5 text-amber-600 dark:text-amber-400"
                    onClick={() => setFilterTab('duplicate_file')}
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Duplicadas no arquivo ({parseResult.duplicateFileCount})
                  </Button>
                )}
                {parseResult.errorCount > 0 && (
                  <Button
                    size="sm"
                    variant={filterTab === 'error' ? 'default' : 'ghost'}
                    className="h-7 text-xs px-2.5 text-destructive"
                    onClick={() => setFilterTab('error')}
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Erros ({parseResult.errorCount})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2 text-muted-foreground ml-1"
                  onClick={handleReset}
                  title="Trocar arquivo"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Barra de progresso de gravação */}
            {isSaving && (
              <div className="shrink-0 space-y-1.5 p-3 bg-card border rounded-lg">
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    Gravando e atualizando escolas no banco de dados...
                  </span>
                  <span className="font-semibold">{saveProgress}%</span>
                </div>
                <Progress value={saveProgress} className="h-2" />
              </div>
            )}

            {/* Tabela de Preview com scroll nativo e sticky header */}
            <div className="flex-1 min-h-[260px] max-h-[50vh] overflow-y-auto overflow-x-auto border rounded-lg bg-card shadow-inner overscroll-contain">
              <table className="w-full text-xs text-left border-collapse min-w-[850px]">
                <thead className="bg-muted text-muted-foreground uppercase sticky top-0 z-20 border-b shadow-xs">
                  <tr>
                    <th className="py-2.5 px-3 w-10 bg-muted font-semibold">#</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Escola</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Tipo</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Nº Alunos</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Telefone</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Bairro</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Endereço</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Contato</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">E-mail</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">
                      Ação / Alterações Previstas
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayRows.map((row: ParsedCsvSchoolRow) => {
                    const isError = row.status === 'error'
                    const isDuplicateFile = row.status === 'duplicate_file'
                    const isValid = row.status === 'valid'
                    const isUpdate = row.status === 'update'

                    return (
                      <tr
                        key={row.index}
                        className={
                          isError
                            ? 'bg-destructive/10'
                            : isDuplicateFile
                              ? 'bg-amber-500/10'
                              : isUpdate
                                ? 'bg-blue-500/5 hover:bg-blue-500/10'
                                : 'hover:bg-muted/40'
                        }
                      >
                        <td className="py-2 px-3 text-muted-foreground font-mono">{row.index}</td>
                        <td className="py-2 px-3 font-medium min-w-[160px]">
                          {row.nome || (
                            <span className="text-destructive italic">
                              [Nome Vazio] (bruto: "{row.rawNome}")
                            </span>
                          )}
                          {isUpdate &&
                            row.existingSchoolName &&
                            row.existingSchoolName !== row.nome && (
                              <span className="text-[10px] text-muted-foreground block">
                                Mestre: "{row.existingSchoolName}"
                              </span>
                            )}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {row.tipo ? (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {row.tipo}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">-</span>
                          )}
                          {row.rawTipo && row.rawTipo !== row.tipo && (
                            <span className="text-[10px] text-muted-foreground block">
                              de: {row.rawTipo}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono text-center">
                          {row.alunos !== undefined ? (
                            row.alunos
                          ) : row.rawAlunos ? (
                            <span className="text-amber-500">{row.rawAlunos} (inválido)</span>
                          ) : (
                            <span className="text-muted-foreground italic">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {row.telefone ? (
                            <span className="text-foreground font-mono text-[11px]">
                              {row.telefone}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 min-w-[110px]">
                          {row.bairro ? (
                            <span className="text-foreground">{row.bairro}</span>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">-</span>
                          )}
                        </td>
                        <td
                          className="py-2 px-3 min-w-[150px] max-w-[220px] truncate"
                          title={row.endereco}
                        >
                          {row.endereco || (
                            <span className="text-muted-foreground italic text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 min-w-[100px]">
                          {row.contato ? (
                            <span className="text-foreground">{row.contato}</span>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">-</span>
                          )}
                        </td>
                        <td
                          className="py-2 px-3 min-w-[140px] max-w-[180px] truncate"
                          title={row.email}
                        >
                          {row.email || (
                            <span className="text-muted-foreground italic text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 min-w-[180px]">
                          {' '}
                          {isValid && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Nova (Criar)
                            </span>
                          )}
                          {isUpdate && (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                                <RefreshCw className="h-3 w-3 shrink-0" />
                                Atualizar Existente
                              </span>
                              {row.fieldChanges && row.fieldChanges.length > 0 ? (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {row.fieldChanges.map((ch, cIdx) => (
                                    <span
                                      key={cIdx}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                                        ch.isCleared
                                          ? 'bg-destructive/10 text-destructive border border-destructive/20'
                                          : 'bg-blue-100/70 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200'
                                      }`}
                                    >
                                      <strong>{ch.label}:</strong>
                                      <span className="line-through text-muted-foreground">
                                        {ch.oldValue}
                                      </span>
                                      <ArrowRight className="h-2.5 w-2.5" />
                                      <span
                                        className={
                                          ch.isCleared
                                            ? 'font-semibold text-destructive'
                                            : 'font-semibold text-blue-700 dark:text-blue-300'
                                        }
                                      >
                                        {ch.newValue}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground block">
                                  Dados idênticos aos cadastrados
                                </span>
                              )}
                            </div>
                          )}
                          {isDuplicateFile && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate max-w-[200px]" title={row.statusReason}>
                                Duplicada na planilha
                              </span>
                            </span>
                          )}
                          {isError && (
                            <span className="inline-flex items-center gap-1 text-destructive font-medium">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              <span>{row.statusReason || 'Linha inválida'}</span>
                            </span>
                          )}
                          {row.warnings && row.warnings.length > 0 && (
                            <div className="space-y-0.5 pt-1">
                              {row.warnings.map((warn, wIdx) => (
                                <span
                                  key={wIdx}
                                  className="inline-flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-1 rounded border border-amber-200 dark:border-amber-800"
                                >
                                  <AlertCircle className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                                  <span>{warn}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>{' '}
                      </tr>
                    )
                  })}
                  {displayRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-muted-foreground text-xs">
                        Nenhuma linha encontrada neste filtro.
                      </td>
                    </tr>
                  )}{' '}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 gap-2 sm:gap-0 pt-2 border-t mt-auto">
          {importSummary ? (
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
                  onClick={handleConfirmImport}
                  disabled={isSaving || processableCount === 0}
                  className="bg-primary text-primary-foreground gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gravando e Atualizando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Confirmar ({parseResult.validRows.length} nova(s) +{' '}
                      {parseResult.updateRows.length} atualização(ões))
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
