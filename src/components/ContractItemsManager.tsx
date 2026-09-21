import { useState, useMemo, useRef } from 'react'
import type { Product } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Search,
  Plus,
  Trash2,
  ClipboardPaste,
  Check,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Package,
  Upload,
  FileSpreadsheet,
  Calculator,
  Download,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { normalizeName } from '@/lib/excelImporter'
import {
  matchCatalogProduct,
  matchCatalogProductDetailed,
  parseBRLNumber,
  parseContractItemsFile,
  type ContractItemsFileParseResult,
  type ParsedContractItemRow,
} from '@/lib/contractItemsImporter'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

export interface ContractItemForm {
  id?: string
  productId: string
  price: number
  quantity?: number // quantidade contratada (opcional)
  nomeContrato?: string
  apelidos?: string
}

interface ContractItemsManagerProps {
  items: ContractItemForm[]
  onChange: (items: ContractItemForm[]) => void
  catalogProducts: Product[]
  onTotalCalculadoChange?: (total: number, hasQuantities: boolean) => void
}

export function ContractItemsManager({
  items,
  onChange,
  catalogProducts,
  onTotalCalculadoChange,
}: ContractItemsManagerProps) {
  // Modal de Seleção em Lote do Catálogo
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchSearchQuery, setBatchSearchQuery] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())

  // Modal de Colar em Massa
  const [pasteModalOpen, setPasteModalOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pastePreview, setPastePreview] = useState<{
    matched: Array<{
      product: Product
      matchedViaAlias?: string
      price: number
      quantity: number
      subtotal: number
      originalLine: string
    }>
    unmatched: string[]
  } | null>(null)

  // Modal de Importação de Arquivo (CSV / XLSX)
  const [fileModalOpen, setFileModalOpen] = useState(false)
  const [fileParseResult, setFileParseResult] = useState<ContractItemsFileParseResult | null>(null)
  const [isParsingFile, setIsParsingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Confirmação de exclusão individual
  const [itemToDeleteIndex, setItemToDeleteIndex] = useState<number | null>(null)

  // Map rápido de produtos do catálogo por ID
  const productById = useMemo(() => {
    const map = new Map<string, Product>()
    for (const p of catalogProducts) {
      map.set(p.id, p)
    }
    return map
  }, [catalogProducts])

  // IDs já inclusos no contrato
  const includedProductIds = useMemo(() => {
    return new Set(items.map((it) => it.productId))
  }, [items])

  // Cálculo do total contratado e verificação se há quantidades informadas
  const { totalContratadoCalculado, totalItensComQtd, totalItensConfigurados } = useMemo(() => {
    let total = 0
    let comQtd = 0
    for (const it of items) {
      const q =
        it.quantity !== undefined && it.quantity !== null && it.quantity > 0 ? it.quantity : 0
      if (q > 0) {
        total += (it.price || 0) * q
        comQtd++
      }
    }
    return {
      totalContratadoCalculado: total,
      totalItensComQtd: comQtd,
      totalItensConfigurados: items.length,
    }
  }, [items])

  // Notificar pai sobre o total recalculado quando houver quantidades
  // Notificação suave para manter sincronia
  useMemo(() => {
    if (onTotalCalculadoChange) {
      onTotalCalculadoChange(totalContratadoCalculado, totalItensComQtd > 0)
    }
  }, [totalContratadoCalculado, totalItensComQtd, onTotalCalculadoChange])

  // Produtos disponíveis para seleção em lote (com filtro de busca)
  const filteredCatalogForBatch = useMemo(() => {
    const q = batchSearchQuery.trim().toLowerCase()
    return catalogProducts.filter((p) => {
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.unit && p.unit.toLowerCase().includes(q))
      )
    })
  }, [catalogProducts, batchSearchQuery])

  // Abertura do modal de lote
  const handleOpenBatchModal = () => {
    setBatchSearchQuery('')
    setSelectedProductIds(new Set())
    setBatchModalOpen(true)
  }

  const handleToggleSelectProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  const handleSelectAllVisible = () => {
    const availableVisible = filteredCatalogForBatch.filter((p) => !includedProductIds.has(p.id))
    const allSelected = availableVisible.every((p) => selectedProductIds.has(p.id))

    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const p of availableVisible) {
          next.delete(p.id)
        }
      } else {
        for (const p of availableVisible) {
          next.add(p.id)
        }
      }
      return next
    })
  }

  const handleConfirmBatchAdd = () => {
    if (selectedProductIds.size === 0) {
      toast.warning('Selecione pelo menos um produto.')
      return
    }

    const newItems: ContractItemForm[] = []
    let addedCount = 0

    for (const prodId of selectedProductIds) {
      if (!includedProductIds.has(prodId)) {
        const prod = productById.get(prodId)
        newItems.push({
          productId: prodId,
          price: prod?.price || 0,
          quantity: 0,
          nomeContrato: prod?.name || '',
          apelidos: '',
        })
        addedCount++
      }
    }

    onChange([...items, ...newItems])
    toast.success(`${addedCount} produto(s) adicionado(s) ao contrato!`)
    setBatchModalOpen(false)
  }

  // Edição inline de preço
  const handlePriceChange = (index: number, newPrice: number) => {
    const updated = items.map((it, idx) => {
      if (idx !== index) return it
      return {
        ...it,
        price: isNaN(newPrice) ? 0 : Math.max(0, newPrice),
      }
    })
    onChange(updated)
  }

  // Edição inline de quantidade contratada
  const handleQuantityChange = (index: number, newQuantity: number) => {
    const updated = items.map((it, idx) => {
      if (idx !== index) return it
      return {
        ...it,
        quantity: isNaN(newQuantity) ? 0 : Math.max(0, newQuantity),
      }
    })
    onChange(updated)
  }

  // Edição inline de Nome no Contrato
  const handleNomeContratoChange = (index: number, newNome: string) => {
    const updated = items.map((it, idx) => {
      if (idx !== index) return it
      return {
        ...it,
        nomeContrato: newNome,
      }
    })
    onChange(updated)
  }

  // Edição inline de Apelidos / AKAs no Contrato
  const handleApelidosChange = (index: number, newApelidos: string) => {
    const updated = items.map((it, idx) => {
      if (idx !== index) return it
      return {
        ...it,
        apelidos: newApelidos,
      }
    })
    onChange(updated)
  }

  // Restaurar preço original do catálogo
  const handleResetToCatalogPrice = (index: number) => {
    const it = items[index]
    const prod = productById.get(it.productId)
    if (!prod) return
    handlePriceChange(index, prod.price)
    toast.info(`Preço redefinido para o valor do catálogo (R$ ${prod.price.toFixed(2)})`)
  }

  // Exclusão de item com confirmação
  const handleConfirmRemoveItem = () => {
    if (itemToDeleteIndex === null) return
    const removed = items[itemToDeleteIndex]
    const prod = productById.get(removed.productId)
    const updated = items.filter((_, idx) => idx !== itemToDeleteIndex)
    onChange(updated)
    toast.success(`"${prod?.name || 'Item'}" removido do contrato.`)
    setItemToDeleteIndex(null)
  }

  // Limpar todos os itens
  const handleClearAll = () => {
    if (items.length === 0) return
    if (window.confirm('Deseja remover todos os produtos deste contrato?')) {
      onChange([])
      toast.info('Lista de produtos do contrato esvaziada.')
    }
  }

  // Processamento de Colar em Massa (colunas: produto, preço, quantidade)
  const handleProcessPaste = () => {
    const lines = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length === 0) {
      toast.warning('Cole ao menos uma linha para analisar.')
      return
    }

    const matched: Array<{
      product: Product
      matchedViaAlias?: string
      price: number
      quantity: number
      subtotal: number
      originalLine: string
    }> = []
    const unmatched: string[] = []

    for (const line of lines) {
      // Formatos suportados: tab (Excel), ponto e vírgula (;), vírgula (,), ou traço (-)
      let sep = ';'
      if (line.includes('\t')) sep = '\t'
      else if (line.includes(';')) sep = ';'
      else if (line.includes(' - ')) sep = ' - '
      else if (line.includes(',')) {
        // Cuidado com números com vírgula: se tiver múltiplos campos separados por vírgula
        const parts = line.split(',')
        if (parts.length >= 2) {
          sep = ','
        }
      }

      const rawParts = line.split(sep).map((p) => p.trim())

      let namePart = ''
      let pricePart = ''
      let qtyPart = ''

      if (rawParts.length >= 3) {
        // 3 colunas: Produto, Preço, Quantidade (ou Produto, Quantidade, Preço)
        namePart = rawParts[0]
        const p1 = parseBRLNumber(rawParts[1])
        const p2 = parseBRLNumber(rawParts[2])

        // Tentar discernir preço e quantidade: geralmente preço tem casas decimais ou moeda
        // Mas o padrão pedido é "produto, preço, quantidade"
        pricePart = rawParts[1]
        qtyPart = rawParts[2]
      } else if (rawParts.length === 2) {
        namePart = rawParts[0]
        pricePart = rawParts[1]
      } else {
        namePart = line.trim()
      }

      // Normaliza e faz matching contra o catálogo
      const matchDetail = matchCatalogProductDetailed(namePart, catalogProducts)
      const found = matchDetail.product

      if (!found) {
        unmatched.push(line)
        continue
      }

      // Preço
      let price = found.price
      if (pricePart) {
        const parsed = parseBRLNumber(pricePart)
        if (parsed.isValid && parsed.value >= 0) {
          price = parsed.value
        }
      }

      // Quantidade
      let quantity = 0
      if (qtyPart) {
        const parsedQ = parseBRLNumber(qtyPart)
        if (parsedQ.isValid && parsedQ.value >= 0) {
          quantity = parsedQ.value
        }
      }

      const subtotal = price * quantity

      matched.push({
        product: found,
        matchedViaAlias: matchDetail.matchedViaAlias,
        price,
        quantity,
        subtotal,
        originalLine: line,
      })
    }

    setPastePreview({ matched, unmatched })
  }

  const handleApplyPastedItems = () => {
    if (!pastePreview || pastePreview.matched.length === 0) return

    // Mesclar: se já existe o produto, atualiza o preço e quantidade; se não existe, adiciona
    const currentMap = new Map<string, ContractItemForm>()
    for (const it of items) {
      currentMap.set(it.productId, { ...it })
    }

    let addedCount = 0
    let updatedCount = 0

    for (const match of pastePreview.matched) {
      if (currentMap.has(match.product.id)) {
        const existing = currentMap.get(match.product.id)!
        existing.price = match.price
        if (match.quantity > 0) {
          existing.quantity = match.quantity
        }
        if (!existing.nomeContrato) {
          existing.nomeContrato = match.product.name
        }
        updatedCount++
      } else {
        currentMap.set(match.product.id, {
          productId: match.product.id,
          price: match.price,
          quantity: match.quantity,
          nomeContrato: match.product.name,
          apelidos: '',
        })
        addedCount++
      }
    }

    onChange(Array.from(currentMap.values()))
    toast.success(`Itens aplicados: ${addedCount} adicionado(s), ${updatedCount} atualizado(s)!`)
    setPasteModalOpen(false)
    setPasteText('')
    setPastePreview(null)
  }

  // Upload e Parse de Planilha/CSV
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsParsingFile(true)
    try {
      const res = await parseContractItemsFile(file, catalogProducts)
      setFileParseResult(res)
    } catch (err: any) {
      console.error('Erro ao processar arquivo:', err)
      toast.error(err?.message || 'Falha ao ler planilha/CSV.')
      setFileParseResult(null)
    } finally {
      setIsParsingFile(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleApplyFileItems = () => {
    if (!fileParseResult || fileParseResult.validRows.length === 0) return

    const currentMap = new Map<string, ContractItemForm>()
    for (const it of items) {
      currentMap.set(it.productId, { ...it })
    }

    let addedCount = 0
    let updatedCount = 0

    for (const row of fileParseResult.validRows) {
      if (!row.product) continue
      const importedNomeContrato = row.nomeContrato || row.rawProduct || row.product.name
      if (currentMap.has(row.product.id)) {
        const existing = currentMap.get(row.product.id)!
        existing.price = row.price
        existing.quantity = row.quantity
        if (importedNomeContrato) {
          existing.nomeContrato = importedNomeContrato
        }
        updatedCount++
      } else {
        currentMap.set(row.product.id, {
          productId: row.product.id,
          price: row.price,
          quantity: row.quantity,
          nomeContrato: importedNomeContrato,
          apelidos: '',
        })
        addedCount++
      }
    }

    onChange(Array.from(currentMap.values()))
    toast.success(
      `Planilha importada com sucesso: ${addedCount} produto(s) adicionado(s), ${updatedCount} atualizado(s)!`,
    )
    setFileModalOpen(false)
    setFileParseResult(null)
  }

  const handleDownloadTemplate = () => {
    const wsData = [
      ['Produto', 'Preço Unitário (R$)', 'Quantidade Contratada'],
      ['Alface Crespa', '3,50', '1200'],
      ['Banana Prata', '5,20', '3500'],
      ['Cenoura', '4,80', '2000'],
      ['Feijão Carioca', '8,50', '1500'],
      ['Tomate Longa Vida', '6,90', '1800'],
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    XLSX.utils.book_append_sheet(wb, ws, 'Itens do Contrato')
    XLSX.writeFile(wb, 'modelo_itens_contrato.xlsx')
    toast.success('Modelo de planilha baixado!')
  }

  return (
    <div className="space-y-3 pt-1">
      {/* Barra de Ações Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b">
        <div>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Package className="h-4 w-4 text-primary" />
              Produtos, Preços e Quantidades Contratadas ({items.length})
            </Label>
            {totalItensComQtd > 0 ? (
              <Badge
                variant="secondary"
                className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-300"
              >
                Total calculado pelos itens
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Sem quantidades (Total informado diretamente)
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Informe preço e quantidade contratada de cada item para cálculo automático do valor
            total, ou use importação em massa.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              setFileParseResult(null)
              setFileModalOpen(true)
            }}
          >
            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
            Importar Planilha / CSV
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              setPasteText('')
              setPastePreview(null)
              setPasteModalOpen(true)
            }}
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-muted-foreground" />
            Colar em Massa
          </Button>

          <Button
            type="button"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleOpenBatchModal}
          >
            <Plus className="h-3.5 w-3.5" />
            Selecionar Produtos
          </Button>
        </div>
      </div>

      {/* Dica explicativa sobre o modo */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary shrink-0" />
          <span>
            {totalItensComQtd > 0 ? (
              <>
                <strong className="text-foreground">
                  {totalItensComQtd} de {items.length} produto(s)
                </strong>{' '}
                têm quantidade contratada. O valor total do contrato é a{' '}
                <strong>soma (preço × quantidade)</strong>.
              </>
            ) : (
              <>
                Nenhum produto possui quantidade contratada informada. O contrato opera no modo de{' '}
                <strong>Total informado diretamente</strong> na aba Dados Gerais.
              </>
            )}
          </span>
        </div>
      </div>

      {/* Tabela de Edição Inline de Itens */}
      {items.length === 0 ? (
        <div className="py-10 text-center border rounded-lg bg-muted/10 space-y-3">
          <Package className="h-8 w-8 text-muted-foreground/50 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Nenhum produto associado a este contrato
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Clique em <strong>"Selecionar Produtos"</strong> para marcar itens do catálogo, ou
              utilize <strong>"Importar Planilha / CSV"</strong> para carregar produto, preço e
              quantidade contratada de uma vez.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleOpenBatchModal}
            >
              <Plus className="h-3.5 w-3.5" />
              Abrir Catálogo de Produtos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                setFileParseResult(null)
                setFileModalOpen(true)
              }}
            >
              <Upload className="h-3.5 w-3.5" />
              Carregar Planilha (.xlsx/.csv)
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-md border max-h-[380px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-muted/30 sticky top-0 z-10 backdrop-blur-xs">
                <TableRow className="text-xs">
                  <TableHead className="w-[32%]">Nome no Contrato & AKA</TableHead>
                  <TableHead className="w-[18%]">Produto Mestre / Catálogo</TableHead>
                  <TableHead className="w-[8%] text-center">Unidade</TableHead>
                  <TableHead className="w-[16%]">Preço Unit. (R$)</TableHead>
                  <TableHead className="w-[14%]">Qtd. Contratada</TableHead>
                  <TableHead className="w-[8%] text-right">Subtotal</TableHead>
                  <TableHead className="w-[4%] text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => {
                  const prod = productById.get(item.productId)
                  const catalogPrice = prod?.price ?? 0
                  const isDiff = Math.abs(item.price - catalogPrice) > 0.009 && catalogPrice > 0
                  const qty =
                    item.quantity !== undefined && item.quantity !== null ? item.quantity : 0
                  const subtotal = item.price * qty

                  const nomeContratoEfetivo =
                    item.nomeContrato !== undefined ? item.nomeContrato : prod?.name || ''
                  const isNomeDiferente = Boolean(
                    nomeContratoEfetivo &&
                    prod?.name &&
                    nomeContratoEfetivo.trim().toLowerCase() !== prod.name.trim().toLowerCase(),
                  )

                  return (
                    <TableRow key={item.productId || index} className="text-xs hover:bg-muted/10">
                      {/* Nome no Contrato e AKAs no contrato */}
                      <TableCell className="py-2">
                        <div className="space-y-1.5 max-w-[280px]">
                          <div>
                            <Input
                              value={nomeContratoEfetivo}
                              onChange={(e) => handleNomeContratoChange(index, e.target.value)}
                              placeholder={prod?.name || 'Nome no contrato'}
                              className="h-7 text-xs font-semibold text-foreground"
                              title="Nome oficial do produto no contrato (usado na importação de pedidos e atestos)"
                            />
                          </div>
                          <div>
                            <Input
                              value={item.apelidos || ''}
                              onChange={(e) => handleApelidosChange(index, e.target.value)}
                              placeholder="Nomes Alternativos (AKA no Contrato - vírgulas)"
                              className="h-6 text-[11px] text-muted-foreground"
                              title="Nomes alternativos do produto na planilha da secretaria para este contrato (separados por vírgula)"
                            />
                          </div>
                        </div>
                      </TableCell>

                      {/* Produto mestre */}
                      <TableCell className="py-2">
                        <div className="flex flex-col">
                          <span
                            className={`text-xs ${
                              isNomeDiferente
                                ? 'text-muted-foreground line-clamp-1 italic'
                                : 'font-medium text-foreground'
                            }`}
                            title={`Produto Mestre: ${prod?.name || 'Não encontrado'}`}
                          >
                            {prod?.name || 'Produto não encontrado'}
                          </span>
                          {isNomeDiferente && (
                            <span className="text-[10px] text-muted-foreground/70">(mestre)</span>
                          )}
                          <div className="flex items-center gap-1 mt-0.5">
                            {prod?.category && (
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 px-1 font-normal text-muted-foreground"
                              >
                                {prod.category}
                              </Badge>
                            )}
                            {prod?.disponibilidade && prod.disponibilidade !== 'normal' && (
                              <Badge
                                className={`text-[9px] py-0 px-1 font-normal ${
                                  prod.disponibilidade === 'abundancia'
                                    ? 'bg-emerald-600'
                                    : 'bg-amber-600'
                                }`}
                              >
                                {prod.disponibilidade === 'abundancia' ? 'Safra alta' : 'Escassez'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Unidade */}
                      <TableCell className="text-center font-mono py-2 text-muted-foreground">
                        {prod?.unit || 'Kg'}
                      </TableCell>

                      {/* Preço editável inline */}
                      <TableCell className="py-2">
                        <div className="space-y-1">
                          <div className="relative max-w-[120px]">
                            <span className="absolute left-2 top-1.5 text-[11px] text-muted-foreground pointer-events-none font-medium">
                              R$
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.price ?? ''}
                              onChange={(e) =>
                                handlePriceChange(index, parseFloat(e.target.value) || 0)
                              }
                              className={`h-7 pl-7 pr-2 text-xs font-mono font-medium ${
                                isDiff
                                  ? 'border-amber-500/70 bg-amber-50/40 dark:bg-amber-950/20 focus-visible:ring-amber-500'
                                  : ''
                              }`}
                            />
                          </div>

                          {/* Destaque visual quando difere do catálogo */}
                          {isDiff && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                              <span>catálogo: R$ {catalogPrice.toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => handleResetToCatalogPrice(index)}
                                title="Restaurar preço do catálogo"
                                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 underline text-[9px] ml-1"
                              >
                                <RotateCcw className="h-2.5 w-2.5" />
                                restaurar
                              </button>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Quantidade contratada inline */}
                      <TableCell className="py-2">
                        <div className="relative max-w-[110px]">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0 (opcional)"
                            value={
                              item.quantity === undefined ||
                              item.quantity === null ||
                              item.quantity === 0
                                ? ''
                                : item.quantity
                            }
                            onChange={(e) => {
                              const val =
                                e.target.value.trim() === '' ? 0 : parseFloat(e.target.value)
                              handleQuantityChange(index, isNaN(val) ? 0 : val)
                            }}
                            className={`h-7 px-2 text-xs font-mono font-medium ${
                              qty > 0
                                ? 'border-primary/50 bg-primary/5 font-semibold text-primary'
                                : 'text-muted-foreground'
                            }`}
                          />
                        </div>
                      </TableCell>

                      {/* Subtotal */}
                      <TableCell className="text-right py-2 font-mono font-semibold">
                        {qty > 0 ? (
                          <span className="text-foreground">
                            R${' '}
                            {subtotal.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60 text-[11px]">—</span>
                        )}
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="text-right py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Remover produto do contrato"
                          onClick={() => setItemToDeleteIndex(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Rodapé com Valor Total Contratado Recalculado em Tempo Real */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Produtos cadastrados: <strong className="text-foreground">{items.length}</strong>
                </span>
                <span className="text-muted-foreground/50">•</span>
                <span className="text-xs text-muted-foreground">
                  Com quantidade: <strong className="text-emerald-700">{totalItensComQtd}</strong>
                </span>
              </div>
              {items.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="h-6 text-[11px] text-destructive hover:bg-destructive/10 px-2"
                >
                  Limpar lista
                </Button>
              )}
            </div>

            <div className="flex items-baseline justify-between sm:justify-end gap-3 text-right">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Valor Total Contratado:
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-primary">
                R${' '}
                {totalContratadoCalculado.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: SELEÇÃO EM LOTE COM CHECKBOX E BUSCA */}
      <Dialog open={batchModalOpen} onOpenChange={setBatchModalOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Selecionar Produtos do Catálogo
            </DialogTitle>
            <DialogDescription>
              Marque os produtos que deseja incluir no contrato. Os preços virão pré-preenchidos com
              o valor cadastrado e poderão ser ajustados junto com as quantidades contratadas.
            </DialogDescription>
          </DialogHeader>

          {/* Campo de Busca no Catálogo */}
          <div className="shrink-0 space-y-2 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, categoria ou unidade..."
                value={batchSearchQuery}
                onChange={(e) => setBatchSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>
                <strong>{selectedProductIds.size}</strong> novo(s) produto(s) selecionado(s)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAllVisible}
                className="h-6 text-[11px] p-0 text-primary hover:underline"
              >
                Marcar / Desmarcar todos visíveis
              </Button>
            </div>
          </div>

          {/* Lista com Checkboxes */}
          <div className="flex-1 min-h-[200px] max-h-[45vh] overflow-y-auto border rounded-md divide-y divide-border overscroll-contain">
            {filteredCatalogForBatch.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhum produto encontrado no catálogo.
              </div>
            ) : (
              filteredCatalogForBatch.map((p) => {
                const isAlreadyInContract = includedProductIds.has(p.id)
                const isSelected = selectedProductIds.has(p.id)

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (!isAlreadyInContract) {
                        handleToggleSelectProduct(p.id)
                      }
                    }}
                    className={`flex items-center justify-between p-2.5 text-xs transition-colors cursor-pointer select-none ${
                      isAlreadyInContract
                        ? 'bg-muted/40 opacity-60 cursor-not-allowed'
                        : isSelected
                          ? 'bg-primary/10 border-l-2 border-l-primary'
                          : 'hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isAlreadyInContract || isSelected}
                        disabled={isAlreadyInContract}
                        onChange={() => {
                          if (!isAlreadyInContract) {
                            handleToggleSelectProduct(p.id)
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground truncate">{p.name}</span>
                          {p.category && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 font-normal text-muted-foreground shrink-0"
                            >
                              {p.category}
                            </Badge>
                          )}
                          {isAlreadyInContract && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] py-0 px-1 shrink-0 text-muted-foreground"
                            >
                              Já no contrato
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Unidade: {p.unit} • Estoque: {p.stock}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      <span className="font-mono font-medium text-foreground block">
                        R$ {p.price.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">preço base</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t mt-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBatchModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmBatchAdd}
              disabled={selectedProductIds.size === 0}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Adicionar {selectedProductIds.size} selecionado(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: COLAR EM MASSA (PRODUTO, PREÇO, QUANTIDADE) */}
      <Dialog open={pasteModalOpen} onOpenChange={setPasteModalOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="h-5 w-5 text-primary" />
              Colar Produtos, Preços e Quantidades
            </DialogTitle>
            <DialogDescription>
              Copie células do Excel e cole abaixo. Aceita as colunas:{' '}
              <strong>Produto [tab] Preço [tab] Quantidade</strong> ou{' '}
              <strong>Produto; Preço; Quantidade</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="paste-area" className="text-xs font-semibold">
                  Conteúdo copiado (uma linha por item):
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  Ex: Banana Prata; 5,50; 1200
                </span>
              </div>
              <Textarea
                id="paste-area"
                rows={5}
                placeholder={`Banana Prata; 5,50; 1200\nMaçã Nacional; 8,20; 800\nCenoura; 4,00; 2500\nTomate; 6,50`}
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value)
                  setPastePreview(null)
                }}
                className="text-xs font-mono"
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleProcessPaste}
                disabled={!pasteText.trim()}
                className="h-8 text-xs gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Processar e Analisar
              </Button>
            </div>

            {/* Preview do Matching */}
            {pastePreview && (
              <div className="space-y-2 border rounded-lg p-3 bg-muted/20 text-xs">
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <Check className="h-4 w-4" />
                    {pastePreview.matched.length} produto(s) identificado(s)
                  </span>
                  {pastePreview.unmatched.length > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      {pastePreview.unmatched.length} não localizado(s)
                    </span>
                  )}
                </div>

                {/* Lista de itens identificados */}
                {pastePreview.matched.length > 0 && (
                  <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1 overscroll-contain">
                    {pastePreview.matched.map((m, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-1.5 rounded bg-card border text-[11px]"
                      >
                        <div className="truncate mr-2">
                          <span className="font-semibold">{m.product.name}</span>
                          <span className="text-muted-foreground ml-1">({m.product.unit})</span>
                          {m.matchedViaAlias && (
                            <span className="text-[10px] text-primary block">
                              ✓ Casado via apelido "{m.matchedViaAlias}"
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 font-mono shrink-0">
                          <span className="text-muted-foreground">R$ {m.price.toFixed(2)}</span>
                          <span>×</span>
                          <span className="text-primary font-semibold">
                            {m.quantity} {m.product.unit}
                          </span>
                          <span>=</span>
                          <span className="font-bold text-foreground">
                            R$ {m.subtotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Linhas não encontradas */}
                {pastePreview.unmatched.length > 0 && (
                  <div className="pt-2 border-t border-border space-y-1">
                    <p className="text-[10px] text-muted-foreground font-semibold">
                      Não encontrados no catálogo de produtos (serão ignorados):
                    </p>
                    <div className="max-h-[80px] overflow-y-auto space-y-0.5 overscroll-contain">
                      {pastePreview.unmatched.map((line, i) => (
                        <p key={i} className="text-[10px] text-amber-600 truncate font-mono">
                          • {line}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t mt-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPasteModalOpen(false)
                setPastePreview(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApplyPastedItems}
              disabled={!pastePreview || pastePreview.matched.length === 0}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Aplicar {pastePreview?.matched.length || 0} produto(s) ao Contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: IMPORTAÇÃO EM MASSA VIA PLANILHA / CSV */}
      <Dialog open={fileModalOpen} onOpenChange={setFileModalOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Importação em Massa de Itens do Contrato (Excel / CSV)
            </DialogTitle>
            <DialogDescription>
              Faça upload de uma planilha (.xlsx ou .csv) contendo os produtos, preços e quantidades
              contratadas. O sistema valida os itens contra o catálogo cadastrado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2 flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Upload Area */}
            <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-lg border-2 border-dashed bg-muted/20 hover:bg-muted/30 transition-colors">
              <div className="space-y-1 text-center sm:text-left">
                <p className="text-xs font-semibold text-foreground">
                  Selecione seu arquivo de planilha (.xlsx, .xls ou .csv)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Colunas esperadas: <strong>Produto</strong>, <strong>Preço Unitário</strong> e{' '}
                  <strong>Quantidade Contratada</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="h-8 text-xs gap-1"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar Modelo
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="contract-items-file-upload"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsingFile}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {isParsingFile ? 'Lendo arquivo...' : 'Escolher Arquivo'}
                </Button>
              </div>
            </div>

            {/* Resultado e Preview do Parse */}
            {fileParseResult && (
              <div className="space-y-3 flex-1 min-h-0 flex flex-col">
                <div className="shrink-0 flex items-center justify-between p-3 rounded-lg bg-card border text-xs">
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <FileSpreadsheet className="h-4 w-4 text-primary" />
                      {fileParseResult.fileName}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {fileParseResult.totalRows} linha(s) encontrada(s) •{' '}
                      <strong className="text-emerald-700">
                        {fileParseResult.validRows.length} itens válidos
                      </strong>
                      {fileParseResult.unmatchedCount > 0 && (
                        <>
                          {' '}
                          •{' '}
                          <strong className="text-destructive">
                            {fileParseResult.unmatchedCount} não cadastrado(s)
                          </strong>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                      Total da Planilha:
                    </span>
                    <span className="font-mono font-bold text-sm text-primary">
                      R${' '}
                      {fileParseResult.totalCalculado.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>

                {/* Tabela de Preview com scroll nativo e sticky header */}
                <div className="flex-1 min-h-[180px] max-h-[45vh] overflow-y-auto overflow-x-auto border rounded-lg bg-card shadow-inner overscroll-contain">
                  <Table className="border-collapse">
                    <TableHeader className="bg-muted sticky top-0 z-20 text-xs shadow-xs">
                      <TableRow>
                        <TableHead className="w-[8%] bg-muted font-semibold">Linha</TableHead>
                        <TableHead className="w-[36%] bg-muted font-semibold">
                          Produto Identificado
                        </TableHead>
                        <TableHead className="w-[18%] text-right bg-muted font-semibold">
                          Preço
                        </TableHead>
                        <TableHead className="w-[18%] text-right bg-muted font-semibold">
                          Qtd. Contratada
                        </TableHead>
                        <TableHead className="w-[20%] text-right bg-muted font-semibold">
                          Subtotal
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fileParseResult.allRows.map((r) => (
                        <TableRow key={r.index} className="text-xs">
                          <TableCell className="font-mono text-muted-foreground">
                            {r.index}
                          </TableCell>
                          <TableCell>
                            {r.product ? (
                              <div className="flex flex-col">
                                <span className="font-semibold text-foreground">
                                  {r.rawProduct !== r.product.name ? (
                                    <>
                                      {r.rawProduct} →{' '}
                                      <span className="text-primary">{r.product.name}</span>
                                    </>
                                  ) : (
                                    r.product.name
                                  )}
                                </span>
                                {r.matchedViaAlias && (
                                  <span className="text-[10px] text-primary/90 font-medium">
                                    ✓ Casado via apelido "{r.matchedViaAlias}"
                                  </span>
                                )}
                                {r.warnings.length > 0 && (
                                  <span className="text-[10px] text-amber-600">
                                    {r.warnings[0]}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col text-destructive">
                                <span className="font-semibold line-through">{r.rawProduct}</span>
                                <span className="text-[10px]">{r.statusReason}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            R$ {r.price.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-primary">
                            {r.quantity} {r.product?.unit || ''}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            R$ {r.subtotal.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {fileParseResult.unmatchedCount > 0 && (
                  <div className="shrink-0 flex items-start gap-2 p-2.5 rounded bg-amber-500/10 border border-amber-300 text-amber-800 text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Atenção para produtos não cadastrados</p>
                      <p className="text-[11px] text-amber-700">
                        {fileParseResult.unmatchedCount} produto(s) não foram localizados no
                        catálogo mestre de produtos. Apenas os produtos já cadastrados serão
                        importados.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t mt-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFileModalOpen(false)
                setFileParseResult(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApplyFileItems}
              disabled={!fileParseResult || fileParseResult.validRows.length === 0}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Confirmar Importação de {fileParseResult?.validRows.length || 0} produto(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAÇÃO DE EXCLUSÃO INDIVIDUAL */}
      <AlertDialog
        open={itemToDeleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setItemToDeleteIndex(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover produto do contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              {itemToDeleteIndex !== null && items[itemToDeleteIndex] && (
                <>
                  Deseja remover{' '}
                  <strong>
                    {productById.get(items[itemToDeleteIndex].productId)?.name || 'este produto'}
                  </strong>{' '}
                  da lista de itens acordados deste contrato?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemoveItem}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
