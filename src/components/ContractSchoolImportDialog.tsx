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
  ClipboardPaste,
  ShieldAlert,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import {
  parseContractSchoolsMatrix,
  type ContractSchoolParseResult,
  type ParsedContractSchoolRow,
} from '@/lib/contractSchoolCsvImporter'
import { escolasService } from '@/services/escolas'
import { contratosService } from '@/services/contratos'
import type { School, Contract } from '@/lib/types'
import * as XLSX from 'xlsx'

export interface ImportedSchoolLinkResult {
  escolaId: string
  escolaNome: string
  rotaPlanilha?: string
  rotaId?: string
}

interface ContractSchoolImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractId?: string
  contractRotas?: Array<{ id?: string; nome: string; ordem?: number }>
  masterSchools: School[]
  allContracts: Contract[]
  currentLinkedSchoolIds: Set<string>
  /**
   * Callback ao confirmar importação com sucesso.
   * Recebe os vínculos a adicionar/atualizar no form do contrato
   */
  onSuccess: (links: ImportedSchoolLinkResult[]) => Promise<void> | void
}

export function ContractSchoolImportDialog({
  open,
  onOpenChange,
  contractId,
  contractRotas,
  masterSchools,
  allContracts,
  currentLinkedSchoolIds,
  onSuccess,
}: ContractSchoolImportDialogProps) {
  const fileInputId = useId()
  const [sourceMode, setSourceMode] = useState<'upload' | 'paste'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')

  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)

  const [parseResult, setParseResult] = useState<ContractSchoolParseResult | null>(null)
  const [filterTab, setFilterTab] = useState<
    'all' | 'processable' | 'created' | 'updated' | 'conflicts' | 'errors'
  >('all')

  const [importSummary, setImportSummary] = useState<{
    created: number
    updated: number
    linked: number
    conflictsIgnored: number
    errors: number
    failedSchoolErrors: Array<{ nome: string; motivo: string }>
    isDirectPersistence: boolean
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const runParse = async (input: File | string, fileName?: string) => {
    setIsParsing(true)
    setImportSummary(null)

    try {
      const res = await parseContractSchoolsMatrix({
        fileOrText: input,
        fileName,
        contractRotas,
        currentContractId: contractId,
        currentContractSchoolIds: currentLinkedSchoolIds,
        masterSchools,
        allContracts,
      })

      setParseResult(res)

      if (res.processableRows.length > 0) {
        toast.info(`${res.processableRows.length} escola(s) elegíveis para vinculação ao contrato.`)
      } else {
        toast.warning('Nenhuma escola elegível para importação identificada no arquivo.')
      }

      if (res.conflictOtherContractRows.length > 0) {
        toast.warning(
          `${res.conflictOtherContractRows.length} escola(s) vinculada(s) a outro contrato foram bloqueadas e não serão vinculadas.`,
        )
      }
    } catch (err: any) {
      console.error('Erro na análise das escolas:', err)
      toast.error(err?.message || 'Falha ao processar arquivo/texto.')
      setParseResult(null)
    } finally {
      setIsParsing(false)
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
    setParseResult(null)
    setImportSummary(null)
    setSaveProgress(0)
    setFilterTab('all')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDownloadModel = () => {
    const wsData = [
      ['Nome da Escola', 'Tipo', 'Nº Alunos', 'Telefone / WhatsApp', 'E-mail', 'Endereço'],
      [
        'CMEI MARIA TEREZA PRIES DE ABREU',
        'CMEI',
        '125',
        '(21) 98765-4321',
        'cmei.maria@educacao.gov.br',
        'Rua das Palmeiras, 120 - Centro',
      ],
      [
        'CC LAR VOVÔ MIGUEL',
        'CRECHE',
        '47',
        '(21) 99887-1122',
        'creche.miguel@educacao.gov.br',
        'Av. Brasil, 450 - Bairro Novo',
      ],
      [
        'EM ALICE SALDANHA',
        'FUNDAMENTAL',
        '171',
        '(21) 97766-3344',
        'em.alice@educacao.gov.br',
        'Rua São Pedro, 80',
      ],
      [
        'CE ROSE DALMASO (CEDAL)',
        'INTEGRAL',
        '275',
        '(21) 96655-2211',
        'cedal@educacao.gov.br',
        'Estrada Geral, km 5',
      ],
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Escolas')
    XLSX.writeFile(wb, 'modelo_importacao_escolas_contrato.xlsx')
  }

  // Executa a confirmação da importação
  const handleConfirmImport = async () => {
    if (!parseResult || parseResult.processableRows.length === 0) return

    setIsSaving(true)
    setSaveProgress(0)

    try {
      const processable = parseResult.processableRows
      let createdCount = 0
      let updatedCount = 0
      const linksToForm: ImportedSchoolLinkResult[] = []
      const failedSchoolErrors: Array<{ nome: string; motivo: string }> = []

      // Processar em lote com progresso
      for (let i = 0; i < processable.length; i++) {
        const row = processable[i]

        try {
          let escolaId = row.existingSchoolId
          let escolaNome = row.existingSchoolName || row.nome

          if (row.status === 'create_and_link') {
            // 1. Criar escola no cadastro mestre global
            // Rota no contrato não é atribuída (rotas pertencem à chamada)
            const created = await escolasService.create({
              nome: row.nome,
              tipo: row.tipo || undefined,
              alunos: row.alunos,
              telefone: row.telefone || '',
              email: row.email || undefined,
              endereco: row.endereco || '',
              rota: '',
            })
            createdCount++
            escolaId = created.id
            escolaNome = created.nome
          } else if (
            (row.status === 'update_and_link' || row.status === 'update_current_link') &&
            row.existingSchoolId
          ) {
            // 2. Atualizar dados no cadastro mestre global (se houver campos a atualizar)
            const updatePayload: Record<string, any> = {}

            if (row.presentColumns.tipo && row.tipo) {
              updatePayload.tipo = row.tipo
            }
            if (row.presentColumns.alunos && row.alunos !== undefined) {
              updatePayload.alunos = row.alunos
            }
            if (row.presentColumns.telefone && row.telefone) {
              updatePayload.telefone = row.telefone
            }
            if (row.presentColumns.email && row.email) {
              updatePayload.email = row.email
            }
            if (row.presentColumns.endereco && row.endereco) {
              updatePayload.endereco = row.endereco
            }

            if (Object.keys(updatePayload).length > 0) {
              await escolasService.update(row.existingSchoolId, updatePayload)
            }
            updatedCount++
          }

          // Se contractId existir (edição de contrato existente no banco):
          // Persistência direta do vínculo em contrato_escolas (sem exigência de rota)
          if (contractId && escolaId) {
            await contratosService.linkEscola({
              contrato_id: contractId,
              escola_id: escolaId,
            })
          }

          if (escolaId) {
            linksToForm.push({
              escolaId,
              escolaNome,
            })
          }
        } catch (subErr: any) {
          const errMsg = subErr?.message || 'Falha ao gravar escola ou criar vínculo no banco.'
          console.error(`Erro ao salvar escola [${row.nome}]:`, subErr)
          failedSchoolErrors.push({
            nome: row.nome,
            motivo: errMsg,
          })
        }

        setSaveProgress(Math.round(((i + 1) / processable.length) * 100))
      }

      const totalErrors =
        parseResult.errorRows.length +
        parseResult.duplicateFileRows.length +
        failedSchoolErrors.length

      setImportSummary({
        created: createdCount,
        updated: updatedCount,
        linked: linksToForm.length,
        conflictsIgnored: parseResult.conflictOtherContractRows.length,
        errors: totalErrors,
        failedSchoolErrors,
        isDirectPersistence: Boolean(contractId),
      })

      // Chamar o callback para aplicar ao contrato (atualiza formulário / contexto pai)
      await onSuccess(linksToForm)

      if (failedSchoolErrors.length === 0) {
        if (contractId) {
          toast.success(
            `Importação concluída e salva no banco: ${linksToForm.length} escola(s) vinculada(s) (${createdCount} nova(s), ${updatedCount} atualizada(s)).`,
          )
        } else {
          toast.info(
            `${linksToForm.length} escola(s) preparadas para o contrato. Clique em "Cadastrar Contrato" para gravar os vínculos.`,
          )
        }
      } else if (linksToForm.length > 0) {
        toast.warning(
          `Importação parcial: ${linksToForm.length} escola(s) processada(s), mas ${failedSchoolErrors.length} apresentaram erro. Verifique o resumo abaixo.`,
        )
      } else {
        toast.error(
          `Falha na importação: nenhuma escola pôde ser vinculada. Consulte as ${failedSchoolErrors.length} falhas reportadas.`,
        )
      }
    } catch (err: any) {
      console.error('Erro ao confirmar importação:', err)
      toast.error('Ocorreu um erro ao gravar as escolas e vínculos.')
    } finally {
      setIsSaving(false)
    }
  }

  // Filtragem dos itens no preview
  const displayRows =
    parseResult?.allRows.filter((row) => {
      if (filterTab === 'processable')
        return (
          row.status === 'create_and_link' ||
          row.status === 'update_and_link' ||
          row.status === 'update_current_link'
        )
      if (filterTab === 'created') return row.status === 'create_and_link'
      if (filterTab === 'updated')
        return row.status === 'update_and_link' || row.status === 'update_current_link'
      if (filterTab === 'conflicts') return row.status === 'conflict_other_contract'
      if (filterTab === 'errors') return row.status === 'error' || row.status === 'duplicate_file'
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
            Importar Escolas para o Contrato (CSV / Planilha)
          </DialogTitle>
          <DialogDescription>
            Importe uma relação de escolas vinculadas a este contrato. Escolas novas serão
            cadastradas no mestre global e as já existentes serão vinculadas diretamente (rotas
            pertencem às chamadas).
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
                      ? 'Analisando arquivo e validando contratos...'
                      : 'Arraste seu arquivo CSV ou Excel aqui'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Colunas aceitas: <strong>Nome da Escola</strong>, <strong>Tipo</strong>,{' '}
                    <strong>Alunos</strong>, <strong>Telefone</strong>, <strong>E-mail</strong>,{' '}
                    <strong>Endereço</strong>
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
                  placeholder={`Cole as linhas do Excel ou CSV aqui...\nExemplo:\nEM ALICE SALDANHA\tFUNDAMENTAL\t171\t(21) 98765-4321\nalice@educacao.gov.br\tRua São Pedro, 80\nCMEI SEBASTIÃO BRANCO\tCMEI\t375`}
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

        {/* RESUMO PÓS-IMPORTAÇÃO */}
        {importSummary && (
          <div className="p-6 bg-muted/40 rounded-xl space-y-4 my-2 border border-border">
            {importSummary.failedSchoolErrors.length === 0 ? (
              <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-7 w-7 shrink-0" />
                <div>
                  <h3 className="font-semibold text-lg">
                    {importSummary.isDirectPersistence
                      ? 'Vínculo e Atualização Gravados no Banco'
                      : 'Escolas Preparadas para o Novo Contrato'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {importSummary.isDirectPersistence
                      ? 'As escolas foram integradas e vinculadas diretamente ao contrato.'
                      : 'As escolas foram preparadas no formulário. Atenção: os vínculos só serão persistidos ao clicar em "Cadastrar Contrato".'}
                  </p>
                </div>
              </div>
            ) : importSummary.linked > 0 ? (
              <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-7 w-7 shrink-0" />
                <div>
                  <h3 className="font-semibold text-lg">
                    Importação Concluída com Alertas e Falhas
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Parte das escolas foi processada, mas {importSummary.failedSchoolErrors.length}{' '}
                    apresentaram erro durante a gravação.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-destructive">
                <XCircle className="h-7 w-7 shrink-0" />
                <div>
                  <h3 className="font-semibold text-lg">Falha na Gravação dos Vínculos</h3>
                  <p className="text-sm text-muted-foreground">
                    Nenhuma escola pôde ser vinculada devido a erros de gravação.
                  </p>
                </div>
              </div>
            )}

            {!importSummary.isDirectPersistence && (
              <div className="p-3 bg-blue-500/10 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-900 dark:text-blue-200">
                <strong>Aviso:</strong> Como este contrato é novo e ainda não foi criado no banco,
                as escolas foram adicionadas à lista do contrato. Para persistir os vínculos,
                complete o formulário e clique no botão <strong>"Cadastrar Contrato"</strong>.
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Novas no Mestre</span>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {importSummary.created}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Atualizadas</span>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {importSummary.updated}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">
                  {importSummary.isDirectPersistence ? 'Gravadas no Banco' : 'No Formulário'}
                </span>
                <p className="text-2xl font-bold text-primary">{importSummary.linked}</p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Outro Contrato</span>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {importSummary.conflictsIgnored}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Erros / Falhas</span>
                <p
                  className={`text-2xl font-bold ${importSummary.errors > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {importSummary.errors}
                </p>
              </div>
            </div>

            {/* Lista detalhada de falhas na gravação */}
            {importSummary.failedSchoolErrors.length > 0 && (
              <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg space-y-2">
                <h4 className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" />
                  Falhas registradas durante a persistência (
                  {importSummary.failedSchoolErrors.length})
                </h4>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {importSummary.failedSchoolErrors.map((f, fIdx) => (
                    <div
                      key={fIdx}
                      className="text-[11px] text-destructive/90 flex items-start gap-1"
                    >
                      <span className="font-mono">•</span>
                      <span>
                        <strong>{f.nome}:</strong> {f.motivo}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PREVIEW DA IMPORTAÇÃO COM MÉTRICAS E FILTROS */}
        {parseResult && !importSummary && (
          <div className="flex-1 min-h-0 flex flex-col space-y-3">
            {/* Aviso de bloqueio se houver conflitos com outro contrato */}
            {parseResult.conflictOtherContractRows.length > 0 && (
              <div className="shrink-0 p-3 bg-amber-500/10 border border-amber-300 dark:border-amber-800 rounded-lg flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">
                    {parseResult.conflictOtherContractRows.length} escola(s) já vinculada(s) a outro
                    contrato
                  </p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Conforme a regra operacional, uma escola não pode pertencer a mais de um
                    contrato simultaneamente. Essas linhas <strong>não serão vinculadas</strong>{' '}
                    (devem ser desvinculadas do contrato anterior primeiro). As demais linhas
                    válidas prosseguirão normalmente.
                  </p>
                </div>
              </div>
            )}

            {/* Cabeçalho de Métricas e Filtros */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-2.5 bg-muted/50 rounded-lg text-xs">
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
                  variant={filterTab === 'processable' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-primary"
                  onClick={() => setFilterTab('processable')}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Elegíveis ({parseResult.processableRows.length})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'created' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-emerald-600 dark:text-emerald-400"
                  onClick={() => setFilterTab('created')}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Novas ({parseResult.createAndLinkRows.length})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'updated' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-blue-600 dark:text-blue-400"
                  onClick={() => setFilterTab('updated')}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Existentes (
                  {parseResult.updateAndLinkRows.length + parseResult.updateCurrentLinkRows.length})
                </Button>
                {parseResult.conflictOtherContractRows.length > 0 && (
                  <Button
                    size="sm"
                    variant={filterTab === 'conflicts' ? 'default' : 'ghost'}
                    className="h-7 text-xs px-2.5 text-amber-600 dark:text-amber-400 font-semibold"
                    onClick={() => setFilterTab('conflicts')}
                  >
                    <ShieldAlert className="h-3 w-3 mr-1" />
                    Outro Contrato ({parseResult.conflictOtherContractRows.length})
                  </Button>
                )}
                {parseResult.allRows.some(
                  (r) => r.status === 'error' || r.status === 'duplicate_file',
                ) && (
                  <Button
                    size="sm"
                    variant={filterTab === 'errors' ? 'default' : 'ghost'}
                    className="h-7 text-xs px-2.5 text-destructive font-semibold"
                    onClick={() => setFilterTab('errors')}
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Pendências/Erros (
                    {
                      parseResult.allRows.filter(
                        (r) => r.status === 'error' || r.status === 'duplicate_file',
                      ).length
                    }
                    )
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2 text-muted-foreground ml-1"
                  onClick={handleReset}
                  title="Trocar dados / Recomeçar"
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
                    Criando novas escolas, atualizando dados e vinculando ao contrato...
                  </span>
                  <span className="font-semibold">{saveProgress}%</span>
                </div>
                <Progress value={saveProgress} className="h-2" />
              </div>
            )}

            {/* Tabela de Preview com scroll nativo e sticky header */}
            <div className="flex-1 min-h-[260px] max-h-[50vh] overflow-y-auto overflow-x-auto border rounded-lg bg-card shadow-inner overscroll-contain">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted text-muted-foreground uppercase sticky top-0 z-20 border-b shadow-xs">
                  <tr>
                    <th className="py-2.5 px-3 w-12 bg-muted font-semibold">#</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Escola</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Tipo</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Alunos</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Situação & Ação Prevista</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayRows.map((row: ParsedContractSchoolRow) => {
                    const isConflictOther = row.status === 'conflict_other_contract'
                    const isError = row.status === 'error'
                    const isDuplicateFile = row.status === 'duplicate_file'
                    const isCreate = row.status === 'create_and_link'
                    const isUpdateAndLink = row.status === 'update_and_link'
                    const isUpdateCurrent = row.status === 'update_current_link'

                    return (
                      <tr
                        key={row.index}
                        className={
                          isConflictOther
                            ? 'bg-amber-500/10 hover:bg-amber-500/15'
                            : isError
                              ? 'bg-destructive/10 hover:bg-destructive/15'
                              : isDuplicateFile
                                ? 'bg-amber-500/5'
                                : isCreate
                                  ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                                  : 'hover:bg-muted/40'
                        }
                      >
                        <td className="py-2 px-3 text-muted-foreground font-mono">{row.index}</td>
                        <td className="py-2 px-3 font-medium">
                          {row.nome || (
                            <span className="text-destructive italic">
                              [Nome Vazio] (bruto: "{row.rawNome}")
                            </span>
                          )}
                          {row.existingSchoolName && row.existingSchoolName !== row.nome && (
                            <span className="text-[10px] text-muted-foreground block">
                              Mestre: "{row.existingSchoolName}"
                            </span>
                          )}
                          {row.endereco && (
                            <span className="text-[10px] text-muted-foreground block truncate max-w-[280px]">
                              {row.endereco}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {row.tipo ? (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {row.tipo}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {row.alunos !== undefined ? (
                            row.alunos
                          ) : (
                            <span className="text-muted-foreground italic">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {/* CONFLITO: VINCULADA A OUTRO CONTRATO */}
                          {isConflictOther && (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                                Bloqueada: Contrato {row.otherContractNumber}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                Não será vinculada. Requer desvinculação prévia do contrato{' '}
                                <strong>{row.otherContractNumber}</strong>.
                              </span>
                            </div>
                          )}

                          {/* NOVA ESCOLA: CRIAR E VINCULAR */}
                          {isCreate && (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Criar no Mestre & Vincular
                              </span>
                              <span className="text-[10px] text-muted-foreground block">
                                Escola nova no sistema global
                              </span>
                            </div>
                          )}

                          {/* JÁ EXISTE NO MESTRE: ATUALIZAR E VINCULAR */}
                          {isUpdateAndLink && (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                                <RefreshCw className="h-3 w-3 shrink-0" />
                                Atualizar Mestre & Vincular
                              </span>
                              {row.fieldChanges.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {row.fieldChanges.map((ch, cIdx) => (
                                    <span
                                      key={cIdx}
                                      className="inline-flex items-center gap-1 bg-blue-100/70 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200 px-1.5 py-0.5 rounded text-[10px]"
                                    >
                                      <strong>{ch.label}:</strong>
                                      <span className="line-through text-muted-foreground">
                                        {ch.oldValue}
                                      </span>
                                      <ArrowRight className="h-2.5 w-2.5" />
                                      <span className="font-semibold">{ch.newValue}</span>
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

                          {/* JÁ VINCULADA A ESTE CONTRATO: ATUALIZAR DADOS */}
                          {isUpdateCurrent && (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium">
                                <RefreshCw className="h-3 w-3 shrink-0" />
                                Já Vinculada (Atualizar Dados)
                              </span>
                              {row.fieldChanges.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {row.fieldChanges.map((ch, cIdx) => (
                                    <span
                                      key={cIdx}
                                      className="inline-flex items-center gap-1 bg-purple-100/70 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 px-1.5 py-0.5 rounded text-[10px]"
                                    >
                                      <strong>{ch.label}:</strong> {ch.newValue}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* DUPLICADA NO ARQUIVO */}
                          {isDuplicateFile && (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              <span title={row.statusReason}>Duplicada na planilha</span>
                            </span>
                          )}

                          {/* ERRO DE DADOS */}
                          {isError && (
                            <span className="inline-flex items-center gap-1 text-destructive font-medium">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              <span>{row.statusReason || 'Linha inválida'}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {displayRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                        Nenhuma linha encontrada neste filtro.
                      </td>
                    </tr>
                  )}
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
                  disabled={isSaving || parseResult.processableRows.length === 0}
                  className="bg-primary text-primary-foreground gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gravando e Vinculando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Confirmar Importação de {parseResult.processableRows.length} escola(s) para o
                      Contrato
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
