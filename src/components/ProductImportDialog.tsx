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
import { Textarea } from '@/components/ui/textarea'
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Filter,
  Check,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  ClipboardPaste,
  Download,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  parseProductsInput,
  type ProductCsvParseResult,
  type ParsedCsvProductRow,
} from '@/lib/productCsvImporter'
import { produtosService } from '@/services/produtos'
import type { Product, ProdutoRecord } from '@/lib/types'

interface ProductImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  onSuccess: () => Promise<void>
}

export function ProductImportDialog({
  open,
  onOpenChange,
  products,
  onSuccess,
}: ProductImportDialogProps) {
  const fileInputId = useId()
  const [sourceMode, setSourceMode] = useState<'upload' | 'paste'>('upload')
  const [pastedText, setPastedText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)
  const [parseResult, setParseResult] = useState<ProductCsvParseResult | null>(null)
  const [filterTab, setFilterTab] = useState<'all' | 'processable' | 'create' | 'update' | 'error'>(
    'all',
  )
  const [importSummary, setImportSummary] = useState<{
    created: number
    updated: number
    duplicatesIgnored: number
    errors: number
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile)
    setImportSummary(null)
    setIsParsing(true)
    try {
      const result = await parseProductsInput({
        fileOrText: selectedFile,
        fileName: selectedFile.name,
        existingProducts: products,
      })
      setParseResult(result)
      if (result.processableRows.length > 0) {
        toast.info(
          `${result.processableRows.length} produto(s) pronto(s) para importação (${result.createdRows.length} novo(s), ${result.updatedRows.length} existente(s) a atualizar).`,
        )
      } else {
        toast.warning(
          'Nenhum produto válido detectado. Verifique os avisos ou erros na tabela abaixo.',
        )
      }
    } catch (err: any) {
      console.error('Erro ao analisar arquivo:', err)
      toast.error(err.message || 'Erro ao processar o arquivo.')
      setParseResult(null)
    } finally {
      setIsParsing(false)
    }
  }

  const handleProcessPastedText = async () => {
    if (!pastedText.trim()) {
      toast.error('Cole o conteúdo da planilha antes de continuar.')
      return
    }

    setImportSummary(null)
    setIsParsing(true)
    try {
      const result = await parseProductsInput({
        fileOrText: pastedText,
        fileName: 'dados_colados',
        existingProducts: products,
      })
      setParseResult(result)
      if (result.processableRows.length > 0) {
        toast.info(
          `${result.processableRows.length} produto(s) pronto(s) para importação (${result.createdRows.length} novo(s), ${result.updatedRows.length} existente(s) a atualizar).`,
        )
      } else {
        toast.warning(
          'Nenhum produto válido detectado. Verifique os avisos ou erros na tabela abaixo.',
        )
      }
    } catch (err: any) {
      console.error('Erro ao analisar texto colado:', err)
      toast.error(err.message || 'Erro ao processar os dados colados.')
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
    const csvContent =
      'nome,categoria,unidade,estoque,preco_unitario,disponibilidade\n' +
      'Alface Crespa,Hortaliças,kg,"1.250","8,50",Normal\n' +
      'Banana Prata,Frutas,kg,"850","6,00",Normal\n' +
      'Feijão Carioca,Grãos,kg,"500","12,50",Escassez\n' +
      'Cenoura,Legumes,kg,"400","4,80",Abundância\n' +
      'Couve Manteiga,,,"250",,\n'

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'modelo_importacao_produtos.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleConfirmImport = async () => {
    if (!parseResult || parseResult.processableRows.length === 0) return

    setIsSaving(true)
    setSaveProgress(0)

    try {
      // Montar batch payload respeitando as regras de atualização seletiva
      const batchPayload = parseResult.processableRows.map((r) => {
        if (r.status === 'create') {
          // Produto NOVO: colunas preenchidas usam o valor da linha; colunas em branco usam os defaults
          const createData: Partial<ProdutoRecord> = {
            nome: r.nome,
            categoria: r.categoria,
            unidade: r.unidade,
            estoque: r.estoque,
            preco_unitario: r.preco_unitario,
            disponibilidade: r.disponibilidade,
          }
          return {
            status: 'create' as const,
            nome: r.nome,
            data: createData,
          }
        } else {
          // Produto EXISTENTE: apenas colunas presentes/preenchidas são enviadas
          // Colunas em branco não sobrescrevem os dados existentes
          const updateData: Partial<ProdutoRecord> = {}
          if (r.presentColumns.categoria) updateData.categoria = r.categoria
          if (r.presentColumns.unidade) updateData.unidade = r.unidade
          if (r.presentColumns.estoque) updateData.estoque = r.estoque
          if (r.presentColumns.preco) updateData.preco_unitario = r.preco_unitario
          if (r.presentColumns.disponibilidade) updateData.disponibilidade = r.disponibilidade

          return {
            status: 'update' as const,
            id: r.existingProductId,
            nome: r.nome,
            data: updateData,
          }
        }
      })

      const { created, updated, errors } = await produtosService.importBatch(
        batchPayload,
        (processed, total) => {
          setSaveProgress(Math.round((processed / total) * 100))
        },
      )

      const totalDuplicates = parseResult.duplicateFileRows.length
      const totalErrors = errors.length + parseResult.errorRows.length

      setImportSummary({
        created,
        updated,
        duplicatesIgnored: totalDuplicates,
        errors: totalErrors,
      })

      const totalSuccess = created + updated
      if (totalSuccess > 0) {
        toast.success(
          `Importação concluída: ${totalSuccess} produto(s) processado(s) (${created} novo(s), ${updated} atualizado(s))!`,
        )
        await onSuccess()
      } else {
        toast.error('Nenhum produto pôde ser gravado ou atualizado.')
      }
    } catch (err: any) {
      console.error('Erro durante a gravação em lote de produtos:', err)
      toast.error('Ocorreu um erro ao gravar os produtos no banco de dados.')
    } finally {
      setIsSaving(false)
    }
  }

  // Filtragem dos itens no preview
  const displayRows =
    parseResult?.allRows.filter((row) => {
      if (filterTab === 'processable') return row.status === 'create' || row.status === 'update'
      if (filterTab === 'create') return row.status === 'create'
      if (filterTab === 'update') return row.status === 'update'
      if (filterTab === 'error') return row.status === 'error' || row.status === 'duplicate_file'
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
            Importar / Atualizar Produtos (CSV / Planilha / Colar)
          </DialogTitle>
          <DialogDescription>
            Importe listas de produtos com números em formato brasileiro (ex.:{' '}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">1.250,50</code> ou{' '}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">12,5</code>). Produtos
            existentes são atualizados seletivamente sem sobrescrever campos em branco; novos
            produtos recebem os defaults automáticos.
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
                      ? 'Analisando arquivo e comparando com o catálogo...'
                      : 'Arraste seu arquivo CSV ou Excel aqui'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Colunas aceitas:{' '}
                    <strong>
                      nome, categoria, unidade, estoque, preco_unitario, disponibilidade
                    </strong>
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
                  placeholder={`Cole as linhas do Excel ou CSV aqui...\nExemplo:\nAlface Crespa\tHortaliças\tkg\t1.250\t8,50\tNormal\nBanana Prata\tFrutas\tkg\t850\t6,00\tNormal\nCenoura\t\t\t400\t4,50\t`}
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
                  O catálogo de produtos foi atualizado com sucesso no banco de dados.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Novos Criados</span>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {importSummary.created}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Existentes Atualizados</span>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {importSummary.updated}
                </p>
              </div>
              <div className="bg-card p-3 rounded-lg border border-border">
                <span className="text-xs text-muted-foreground">Duplicados no Arquivo</span>
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
                  variant={filterTab === 'processable' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-emerald-600 dark:text-emerald-400"
                  onClick={() => setFilterTab('processable')}
                >
                  <Check className="h-3 w-3 mr-1" />A Gravar ({parseResult.processableRows.length})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'create' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-emerald-600 dark:text-emerald-400"
                  onClick={() => setFilterTab('create')}
                >
                  Novos ({parseResult.createdRows.length})
                </Button>
                <Button
                  size="sm"
                  variant={filterTab === 'update' ? 'default' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-blue-600 dark:text-blue-400"
                  onClick={() => setFilterTab('update')}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Existentes ({parseResult.updatedRows.length})
                </Button>
                {(parseResult.errorRows.length > 0 || parseResult.duplicateFileRows.length > 0) && (
                  <Button
                    size="sm"
                    variant={filterTab === 'error' ? 'default' : 'ghost'}
                    className="h-7 text-xs px-2.5 text-destructive"
                    onClick={() => setFilterTab('error')}
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Erros / Duplicados (
                    {parseResult.errorRows.length + parseResult.duplicateFileRows.length})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2 text-muted-foreground ml-1"
                  onClick={handleReset}
                  title="Recomeçar"
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
                    Gravando e atualizando produtos no banco de dados...
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
                    <th className="py-2.5 px-3 bg-muted font-semibold">Produto</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Categoria</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Unidade</th>
                    <th className="py-2.5 px-3 text-right bg-muted font-semibold">Estoque</th>
                    <th className="py-2.5 px-3 text-right bg-muted font-semibold">Preço</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Disponibilidade</th>
                    <th className="py-2.5 px-3 bg-muted font-semibold">Ação / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayRows.map((row: ParsedCsvProductRow) => {
                    const isError = row.status === 'error'
                    const isDuplicate = row.status === 'duplicate_file'
                    const isCreate = row.status === 'create'
                    const isUpdate = row.status === 'update'

                    const dispBadge =
                      row.disponibilidade === 'abundancia' ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px]">
                          Abundância
                        </Badge>
                      ) : row.disponibilidade === 'escassez' ? (
                        <Badge className="bg-amber-600 hover:bg-amber-700 text-[10px]">
                          Escassez
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Normal
                        </Badge>
                      )

                    return (
                      <tr
                        key={row.index}
                        className={
                          isError
                            ? 'bg-destructive/10'
                            : isDuplicate
                              ? 'bg-amber-500/10'
                              : isCreate
                                ? 'hover:bg-emerald-500/5'
                                : 'hover:bg-blue-500/5'
                        }
                      >
                        <td className="py-2 px-3 text-muted-foreground font-mono">{row.index}</td>
                        <td className="py-2 px-3 font-medium">
                          {row.nome || (
                            <span className="text-destructive italic">
                              [Nome Vazio] (bruto: "{row.rawNome}")
                            </span>
                          )}
                          {row.matchedViaAlias && (
                            <span className="text-[10px] text-primary font-normal flex items-center gap-1 mt-0.5">
                              <Sparkles className="h-3 w-3 shrink-0" />
                              Casou via apelido: <strong>{row.matchedViaAlias}</strong> →{' '}
                              {row.existingProductName}
                            </span>
                          )}
                          {!row.matchedViaAlias &&
                            row.existingProductName &&
                            row.existingProductName !== row.nome && (
                              <span className="text-[10px] text-muted-foreground block">
                                Mestre: "{row.existingProductName}"
                              </span>
                            )}
                          {row.warnings.length > 0 && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span>{row.warnings.join(' ')}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isUpdate && row.fieldChanges.some((fc) => fc.field === 'categoria') ? (
                            <div className="flex flex-col gap-0.5">
                              {(() => {
                                const catChange = row.fieldChanges.find(
                                  (fc) => fc.field === 'categoria',
                                )!
                                return (
                                  <div className="flex items-center gap-1">
                                    <span className="line-through text-muted-foreground text-[10px]">
                                      {catChange.oldValue}
                                    </span>
                                    <ArrowRight className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" />
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] font-semibold bg-blue-100/80 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-700"
                                    >
                                      {catChange.newValue}
                                    </Badge>
                                  </div>
                                )
                              })()}
                            </div>
                          ) : (
                            <>
                              <Badge variant="secondary" className="text-[10px] font-normal">
                                {row.categoria}
                              </Badge>
                              {!row.presentColumns.categoria && isCreate && (
                                <span className="text-[9px] text-muted-foreground block italic">
                                  (default)
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {row.unidade}
                          {!row.presentColumns.unidade && isCreate && (
                            <span className="text-[9px] text-muted-foreground block italic">
                              (default)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {row.estoque.toLocaleString('pt-BR')}
                          {!row.presentColumns.estoque && isCreate && (
                            <span className="text-[9px] text-muted-foreground block italic">
                              (default 0)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium">
                          R${' '}
                          {row.preco_unitario.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          {!row.presentColumns.preco && isCreate && (
                            <span className="text-[9px] text-muted-foreground block italic">
                              (default 0)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {dispBadge}
                          {!row.presentColumns.disponibilidade && isCreate && (
                            <span className="text-[9px] text-muted-foreground block italic">
                              (default Normal)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {/* PRODUTO NOVO COM DEFAULTS */}
                          {isCreate && (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                Novo Produto
                              </span>
                              <span className="text-[10px] text-muted-foreground block">
                                {row.statusReason}
                              </span>
                            </div>
                          )}

                          {/* PRODUTO EXISTENTE COM ATUALIZAÇÃO SELETIVA */}
                          {isUpdate && (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                                <RefreshCw className="h-3 w-3 shrink-0" />
                                Existente (Atualização Seletiva)
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
                                  Valores no arquivo idênticos aos gravados (preservados).
                                </span>
                              )}
                            </div>
                          )}

                          {/* DUPLICADO NO ARQUIVO */}
                          {isDuplicate && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              <span title={row.statusReason}>Duplicado no arquivo</span>
                            </span>
                          )}

                          {/* ERRO */}
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
                      <td colSpan={8} className="py-8 text-center text-muted-foreground text-xs">
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
                      Gravando e Atualizando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Confirmar Importação de {parseResult.processableRows.length} Produto(s)
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
