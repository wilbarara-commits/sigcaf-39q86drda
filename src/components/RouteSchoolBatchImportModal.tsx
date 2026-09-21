import { useState, useRef } from 'react'
import {
  Upload,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Building2,
  Info,
  X,
} from 'lucide-react'
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
import { toast } from 'sonner'
import {
  parseUploadedRouteSchoolsFile,
  analyzeRouteSchoolsBatch,
  executeRouteSchoolsBatchImport,
  RouteSchoolBatchAnalysis,
  RouteSchoolImportResult,
} from '@/lib/routeSchoolBatchImporter'
import { Contract, School, ParadaRotaRecord, RotaLogisticaRecord } from '@/lib/types'
import { RouteType } from '@/lib/routeSchoolBatchImporter'

export interface RouteSchoolBatchImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetRouteName: string
  targetRouteId?: string
  targetRouteType?: RouteType
  contract: Contract
  allContracts: Contract[]
  masterSchools: School[]
  paradasRota?: ParadaRotaRecord[]
  rotasLogisticas?: RotaLogisticaRecord[]
  onSuccess: () => Promise<void> | void
}

export function RouteSchoolBatchImportModal({
  open,
  onOpenChange,
  targetRouteName,
  targetRouteId,
  targetRouteType = 'planilha',
  contract,
  allContracts,
  masterSchools,
  paradasRota = [],
  rotasLogisticas = [],
  onSuccess,
}: RouteSchoolBatchImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [analysis, setAnalysis] = useState<RouteSchoolBatchAnalysis | null>(null)
  const [result, setResult] = useState<RouteSchoolImportResult | null>(null)

  const handleReset = () => {
    setAnalysis(null)
    setResult(null)
    setProgress(null)
    setIsParsing(false)
    setIsExecuting(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClose = () => {
    if (isExecuting) return
    handleReset()
    onOpenChange(false)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsParsing(true)
    setAnalysis(null)
    setResult(null)

    try {
      const parsedRows = await parseUploadedRouteSchoolsFile(file)
      if (parsedRows.length === 0) {
        toast.error('Nenhuma linha de escola foi encontrada no arquivo selecionado.')
        setIsParsing(false)
        return
      }

      const analyzed = analyzeRouteSchoolsBatch({
        fileName: file.name,
        parsedRows,
        targetRouteName,
        targetRouteId,
        targetRouteType,
        targetContract: contract,
        allContracts,
        masterSchools,
        paradasRota,
        rotasLogisticas,
      })

      setAnalysis(analyzed)
    } catch (err: any) {
      console.error('Erro ao analisar arquivo de escolas:', err)
      toast.error(err?.message || 'Falha ao processar o arquivo selecionado.')
    } finally {
      setIsParsing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleConfirmImport = async () => {
    if (!analysis) return

    const eligibleCount = analysis.totalFound - analysis.blockedCount
    if (eligibleCount <= 0) {
      toast.error(
        targetRouteType === 'planilha'
          ? 'Todas as escolas do arquivo estão bloqueadas por já pertencerem a outra aba.'
          : 'Todas as escolas do arquivo estão bloqueadas por já pertencerem a outra rota.',
      )
      return
    }

    setIsExecuting(true)
    try {
      const res = await executeRouteSchoolsBatchImport({
        analysis,
        targetRouteName,
        targetRouteId,
        targetRouteType,
        targetContractId: contract.id,
        currentParadasRota: paradasRota,
        onProgress: (current, total) => setProgress({ current, total }),
      })

      setResult(res)
      toast.success(
        targetRouteType === 'planilha'
          ? `Importação concluída: ${res.linkedCount} escola(s) vinculada(s) à aba "${targetRouteName}".`
          : `Importação concluída: ${res.linkedCount} escola(s) vinculada(s) à rota "${targetRouteName}".`,
      )

      await onSuccess()
    } catch (err: any) {
      console.error('Erro ao executar importação em lote:', err)
      toast.error('Ocorreu um erro ao gravar as escolas no banco.')
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[650px] max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5 text-primary" />
              {targetRouteType === 'planilha'
                ? 'Importar Escolas da Aba via Arquivo'
                : 'Importar Escolas da Rota via Arquivo'}
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              {targetRouteName}
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            Selecione uma planilha (Excel), documento Word, CSV ou arquivo de texto para adicionar
            escolas em lote na {targetRouteType === 'planilha' ? 'aba' : 'rota'}{' '}
            <strong>"{targetRouteName}"</strong> do Contrato <strong>{contract.numero}</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Input escondido que aceita .xlsx, .xls, .docx, .csv, .txt */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.xls,.docx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,text/plain"
          className="hidden"
        />

        <div className="flex-1 space-y-3.5 overflow-y-auto pr-1 py-1 text-xs">
          {/* Se ainda não analisou nenhum arquivo */}
          {!analysis && !result && (
            <div className="space-y-4">
              <div
                onClick={() => !isParsing && fileInputRef.current?.click()}
                className={`p-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                  isParsing
                    ? 'border-primary/50 bg-primary/5 opacity-80 cursor-wait'
                    : 'border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30'
                }`}
              >
                {isParsing ? (
                  <div className="space-y-2 text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                    <p className="font-semibold text-sm text-foreground">
                      Lendo e analisando arquivo...
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Extraindo linhas, conferindo cadastro mestre e verificando exclusividade de
                      rotas.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                      <FileSpreadsheet className="h-6 w-6" />
                    </div>
                    <p className="font-semibold text-sm text-foreground mb-1">
                      Clique para selecionar o arquivo
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm mb-3">
                      Formatos aceitos: <strong>Excel (.xlsx, .xls)</strong>,{' '}
                      <strong>Word (.docx)</strong>, <strong>CSV</strong> ou{' '}
                      <strong>Texto (.txt)</strong>
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2 pointer-events-none"
                    >
                      <Upload className="h-3.5 w-3.5" /> Escolher Arquivo do Computador
                    </Button>
                  </>
                )}
              </div>

              {/* Informações sobre regras de negócio */}
              <div className="p-3 rounded-lg border bg-muted/20 space-y-1.5 text-[11px] text-muted-foreground">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-primary" /> Regras aplicadas automaticamente:
                </p>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li>
                    <strong>Excel / CSV:</strong> com cabeçalho mapeia Nome, Endereço, Tipo e
                    Alunos; sem cabeçalho, a coluna principal vira o nome da escola.
                  </li>
                  <li>
                    <strong>Word (.docx):</strong> extrai tabelas e parágrafos estruturados (cada
                    linha = uma escola).
                  </li>
                  <li>
                    <strong>Normalização e Mestre:</strong> escola existente no cadastro mestre é
                    atualizada com dados novos (nunca duplicada). Escola nova é cadastrada sem rota
                    no mestre.
                  </li>
                  <li>
                    <strong>Exclusividade estrita:</strong> escola já alocada em outra rota é{' '}
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      bloqueada
                    </span>{' '}
                    com aviso indicando em qual rota já está.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Resultado pós-análise: resumo e lista para validação */}
          {analysis && !result && (
            <div className="space-y-3">
              {/* Card de resumo */}
              <div className="p-3 rounded-lg border bg-primary/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-bold text-foreground text-sm">{analysis.fileName}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={handleReset}
                    disabled={isExecuting}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Trocar arquivo
                  </Button>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-1">
                  <div className="p-2 rounded bg-background border text-center">
                    <span className="text-[10px] text-muted-foreground block">Encontradas</span>
                    <span className="text-base font-bold text-foreground">
                      {analysis.totalFound}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-background border text-center">
                    <span className="text-[10px] text-emerald-600 block">Novas (Mestre)</span>
                    <span className="text-base font-bold text-emerald-600">
                      {analysis.toCreate}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-background border text-center">
                    <span className="text-[10px] text-blue-600 block">Existentes</span>
                    <span className="text-base font-bold text-blue-600">
                      {analysis.toUpdate + analysis.toLinkOnly}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-background border text-center">
                    <span className="text-[10px] text-amber-600 block">Bloqueadas</span>
                    <span className="text-base font-bold text-amber-600">
                      {analysis.blockedCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Alerta de escolas bloqueadas se houver */}
              {analysis.blockedCount > 0 && (
                <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      {analysis.blockedCount} escola(s) não serão incluídas por conflito de rota
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Pela regra de negócio de exclusividade, uma escola só pode pertencer a uma rota.
                    As seguintes escolas já estão alocadas:
                  </p>
                  <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                    {analysis.blockedItems.map((b) => (
                      <div
                        key={b.index}
                        className="flex items-center justify-between text-[10px] bg-background/80 p-1.5 rounded border border-amber-200 dark:border-amber-900"
                      >
                        <span className="font-semibold text-foreground truncate pr-2">
                          {b.nome}
                        </span>
                        <span className="text-amber-700 dark:text-amber-400 shrink-0 font-medium">
                          {b.blockReason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista com as escolas que serão adicionadas/vinculadas */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    Escolas aptas para inclusão{' '}
                    {targetRouteType === 'planilha' ? 'na aba' : 'na rota'} (
                    {analysis.totalFound - analysis.blockedCount})
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {targetRouteType === 'planilha' ? 'Aba de destino: ' : 'Rota de destino: '}
                    <strong>{targetRouteName}</strong>
                  </span>
                </div>

                <div className="space-y-1 max-h-[220px] overflow-y-auto border rounded-lg p-1.5 bg-card divide-y">
                  {analysis.items
                    .filter((it) => !it.isBlocked)
                    .map((it) => (
                      <div
                        key={it.index}
                        className="py-1.5 px-2 flex items-center justify-between gap-2 text-xs first:pt-1 last:pb-1"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground truncate">{it.nome}</p>
                          {it.endereco && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {it.endereco}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {it.isExistingMaster ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] bg-blue-50 text-blue-700 border-blue-200"
                            >
                              {it.action === 'update_and_link'
                                ? 'Atualiza Mestre'
                                : 'Mestre Existente'}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200"
                            >
                              Nova Escola
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[9px]">
                            {targetRouteName}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Barra de progresso de gravação */}
              {isExecuting && progress && (
                <div className="space-y-1 p-3 rounded-lg border bg-primary/5 text-center">
                  <div className="flex items-center justify-center gap-2 font-medium text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      Gravando escolas no banco: {progress.current} de {progress.total}...
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-2 transition-all duration-200"
                      style={{
                        width: `${Math.round((progress.current / progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Relatório Final Concluído */}
          {result && (
            <div className="space-y-3 py-2">
              <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                <h4 className="text-base font-bold text-foreground">
                  Importação Concluída com Sucesso!
                </h4>
                <p className="text-xs text-muted-foreground">
                  As escolas foram processadas e vinculadas{' '}
                  {targetRouteType === 'planilha' ? 'à aba ' : 'à rota '}
                  <strong>"{targetRouteName}"</strong>. Os contadores e listas foram atualizados.
                </p>

                <div className="grid grid-cols-4 gap-2 pt-2 text-left">
                  <div className="p-2 rounded bg-background border text-center">
                    <span className="text-[10px] text-muted-foreground block">Total Lido</span>
                    <span className="text-base font-bold text-foreground">
                      {result.totalProcessed}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-background border text-center">
                    <span className="text-[10px] text-emerald-600 block">Vinculadas</span>
                    <span className="text-base font-bold text-emerald-600">
                      {result.linkedCount}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-background border text-center">
                    <span className="text-[10px] text-blue-600 block">Criadas Mestre</span>
                    <span className="text-base font-bold text-blue-600">{result.createdCount}</span>
                  </div>
                  <div className="p-2 rounded bg-background border text-center">
                    <span className="text-[10px] text-amber-600 block">Bloqueadas</span>
                    <span className="text-base font-bold text-amber-600">
                      {result.blockedCount}
                    </span>
                  </div>
                </div>
              </div>

              {result.blockedList.length > 0 && (
                <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 text-xs space-y-1">
                  <span className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    Escolas não adicionadas ({result.blockedList.length}):
                  </span>
                  <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                    {result.blockedList.map((b, idx) => (
                      <div
                        key={idx}
                        className="text-[10px] text-muted-foreground flex justify-between bg-background/80 p-1 rounded"
                      >
                        <span className="font-medium text-foreground">{b.nome}</span>
                        <span className="text-amber-700 dark:text-amber-400">{b.motivo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t gap-2 sm:gap-0">
          {!result ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isExecuting || isParsing}
                onClick={handleClose}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={
                  !analysis ||
                  isExecuting ||
                  isParsing ||
                  analysis.totalFound - analysis.blockedCount === 0
                }
                onClick={handleConfirmImport}
                className="gap-2"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Importando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {analysis
                      ? `Confirmar & Adicionar (${analysis.totalFound - analysis.blockedCount} escolas)`
                      : 'Confirmar & Adicionar'}
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={handleClose} className="w-full sm:w-auto">
              Concluir e Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
