import { useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  Package,
  Plus,
  Trash2,
  Upload,
  Download,
  Search,
  Sparkles,
  ClipboardPaste,
  Check,
  RotateCcw,
  AlertTriangle,
  Calculator,
  FileSpreadsheet,
  Link as LinkIcon,
  PlusCircle,
  EyeOff,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatQuantityOneDecimal } from '@/lib/decimalUtils'
import { normalizeName } from '@/lib/excelImporter'
import {
  parseContractItemsFile,
  ParsedContractItemRow,
  ContractItemsFileParseResult,
  matchCatalogProductDetailed,
  parseBRLNumber,
} from '@/lib/contractItemsImporter'
import { DEFAULT_PRODUCT_UNIT } from '@/lib/productCsvImporter'
import { chamadasService } from '@/services/chamadas'
import { produtosService } from '@/services/produtos'
import { useApp } from '@/context/app-context'
import { toast } from 'sonner'
import type { Product, DisponibilidadeProduto } from '@/lib/types'

export interface ChamadaItemForm {
  id?: string
  productId?: string
  produto: string
  aka?: string
  unidade: string
  preco: number
  // Quantidade agregada (calculada a partir da soma dos contratos da chamada)
  quantidadeAgregada?: number
}

interface ChamadaItemsManagerProps {
  chamadaId?: string
  chamadaNumero?: string
  items: ChamadaItemForm[]
  onChange: (items: ChamadaItemForm[]) => void
  catalogProducts: Product[]
}

export function ChamadaItemsManager({
  chamadaId,
  chamadaNumero,
  items,
  onChange,
  catalogProducts,
}: ChamadaItemsManagerProps) {
  const { refreshData } = useApp()

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
  const [isSubmittingImport, setIsSubmittingImport] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [localAddedProducts, setLocalAddedProducts] = useState<Product[]>([])

  // Modal de Resolução de Linha Sem Correspondência (Definir AKA)
  const [resolveModalOpen, setResolveModalOpen] = useState(false)
  const [resolvingRow, setResolvingRow] = useState<ParsedContractItemRow | null>(null)
  const [resolutionMode, setResolutionMode] = useState<'link' | 'create'>('link')
  const [selectedLinkProductId, setSelectedLinkProductId] = useState<string>('')
  const [linkSearchTerm, setLinkSearchTerm] = useState('')
  const [akaValue, setAkaValue] = useState('')
  const [newProductName, setNewProductName] = useState('')
  const [newProductUnit, setNewProductUnit] = useState(DEFAULT_PRODUCT_UNIT)
  const [newProductDisp, setNewProductDisp] = useState<DisponibilidadeProduto>('normal')
  const [newProductInitialPrice, setNewProductInitialPrice] = useState<number | string>('')

  // Confirmação de exclusão individual
  const [itemToDeleteIndex, setItemToDeleteIndex] = useState<number | null>(null)

  // Catálogo combinado: produtos do app-context + produtos recém-criados localmente
  const allAvailableProducts = useMemo(() => {
    const combined = [...(catalogProducts || [])]
    for (const lp of localAddedProducts) {
      if (!combined.some((p) => p.id === lp.id)) {
        combined.push(lp)
      }
    }
    return combined
  }, [catalogProducts, localAddedProducts])

  // Map de produtos do catálogo por ID
  const productById = useMemo(() => {
    const map = new Map<string, Product>()
    for (const p of allAvailableProducts) {
      map.set(p.id, p)
    }
    return map
  }, [allAvailableProducts])

  // IDs e nomes já inclusos
  const includedKeys = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      if (it.productId) set.add(it.productId)
      if (it.produto) set.add(it.produto.trim().toLowerCase())
    }
    return set
  }, [items])

  // Totais calculados
  const { totalChamadaCalculado, totalItensComQtd } = useMemo(() => {
    let total = 0
    let comQtd = 0
    for (const it of items) {
      const q =
        it.quantidadeAgregada !== undefined &&
        it.quantidadeAgregada !== null &&
        it.quantidadeAgregada > 0
          ? it.quantidadeAgregada
          : 0
      if (q > 0) {
        total += (it.preco || 0) * q
        comQtd++
      }
    }
    return {
      totalChamadaCalculado: total,
      totalItensComQtd: comQtd,
    }
  }, [items])

  // Produtos disponíveis para seleção em lote
  const filteredCatalogForBatch = useMemo(() => {
    const q = batchSearchQuery.trim().toLowerCase()
    return allAvailableProducts.filter((p) => {
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.unit && p.unit.toLowerCase().includes(q))
    })
  }, [allAvailableProducts, batchSearchQuery])

  const handleOpenBatchModal = () => {
    setBatchSearchQuery('')
    setSelectedProductIds(new Set())
    setBatchModalOpen(true)
  }

  const handleToggleSelectProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const handleSelectAllVisible = () => {
    const availableVisible = filteredCatalogForBatch.filter(
      (p) => !includedKeys.has(p.id) && !includedKeys.has(p.name.trim().toLowerCase()),
    )
    const allSelected = availableVisible.every((p) => selectedProductIds.has(p.id))

    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const p of availableVisible) next.delete(p.id)
      } else {
        for (const p of availableVisible) next.add(p.id)
      }
      return next
    })
  }

  const handleConfirmBatchAdd = () => {
    if (selectedProductIds.size === 0) {
      toast.warning('Selecione pelo menos um produto.')
      return
    }

    const newItems: ChamadaItemForm[] = []
    let addedCount = 0

    for (const prodId of selectedProductIds) {
      const prod = productById.get(prodId)
      if (prod && !includedKeys.has(prod.id) && !includedKeys.has(prod.name.trim().toLowerCase())) {
        newItems.push({
          productId: prod.id,
          produto: prod.name,
          aka: '',
          unidade: prod.unit || 'Kg',
          preco: prod.price || 0,
          quantidadeAgregada: undefined,
        })
        addedCount++
      }
    }

    onChange([...items, ...newItems])
    toast.success(`${addedCount} produto(s) adicionado(s) à chamada!`)
    setBatchModalOpen(false)
  }

  // Edição inline de preço
  const handlePriceChange = (index: number, newPrice: number) => {
    const updated = items.map((it, idx) => {
      if (idx !== index) return it
      return {
        ...it,
        preco: isNaN(newPrice) ? 0 : Math.max(0, newPrice),
      }
    })
    onChange(updated)
  }

  // Edição inline de Produto (nome)
  const handleProdutoChange = (index: number, newProduto: string) => {
    const updated = items.map((it, idx) => {
      if (idx !== index) return it
      return {
        ...it,
        produto: newProduto,
      }
    })
    onChange(updated)
  }

  // Edição inline de AKA/Apelido
  const handleAkaChange = (index: number, newAka: string) => {
    const updated = items.map((it, idx) => {
      if (idx !== index) return it
      return {
        ...it,
        aka: newAka,
      }
    })
    onChange(updated)
  }

  // Edição inline de Unidade
  const handleUnidadeChange = (index: number, newUnidade: string) => {
    const updated = items.map((it, idx) => {
      if (idx !== index) return it
      return {
        ...it,
        unidade: newUnidade,
      }
    })
    onChange(updated)
  }

  // Restaurar preço original do catálogo mestre
  const handleResetToCatalogPrice = (index: number) => {
    const it = items[index]
    const prod = it.productId ? productById.get(it.productId) : undefined
    if (!prod || prod.price === undefined || prod.price === null || prod.price <= 0) {
      toast.warning('Este produto não possui preço base cadastrado no catálogo mestre.')
      return
    }
    handlePriceChange(index, prod.price)
    toast.info(`Preço redefinido para o catálogo (R$ ${prod.price.toFixed(2)})`)
  }

  // Exclusão individual
  const handleConfirmRemoveItem = () => {
    if (itemToDeleteIndex === null) return
    const removed = items[itemToDeleteIndex]
    const updated = items.filter((_, idx) => idx !== itemToDeleteIndex)
    onChange(updated)
    toast.success(`"${removed.produto || 'Item'}" removido da chamada.`)
    setItemToDeleteIndex(null)
  }

  // Limpar todos
  const handleClearAll = () => {
    if (items.length === 0) return
    if (window.confirm('Deseja remover todos os produtos desta chamada?')) {
      onChange([])
      toast.info('Lista de produtos da chamada esvaziada.')
    }
  }

  // Colar em Massa
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
      let sep = ';'
      if (line.includes('\t')) sep = '\t'
      else if (line.includes(';')) sep = ';'
      else if (line.includes(' - ')) sep = ' - '
      else if (line.includes(',')) {
        const parts = line.split(',')
        if (parts.length >= 2) sep = ','
      }

      const rawParts = line.split(sep).map((p) => p.trim())
      let namePart = ''
      let pricePart = ''
      let qtyPart = ''

      if (rawParts.length >= 3) {
        namePart = rawParts[0]
        pricePart = rawParts[1]
        qtyPart = rawParts[2]
      } else if (rawParts.length === 2) {
        namePart = rawParts[0]
        pricePart = rawParts[1]
      } else {
        namePart = line.trim()
      }

      const matchDetail = matchCatalogProductDetailed(namePart, allAvailableProducts)
      const found = matchDetail.product

      if (!found) {
        unmatched.push(line)
        continue
      }

      let price = found.price || 0
      if (pricePart) {
        const parsed = parseBRLNumber(pricePart)
        if (parsed.isValid && parsed.value >= 0) price = parsed.value
      }

      let quantity = 0
      if (qtyPart) {
        const parsedQ = parseBRLNumber(qtyPart)
        if (parsedQ.isValid && parsedQ.value >= 0) quantity = parsedQ.value
      }

      matched.push({
        product: found,
        matchedViaAlias: matchDetail.matchedViaAlias,
        price,
        quantity,
        subtotal: price * quantity,
        originalLine: line,
      })
    }

    setPastePreview({ matched, unmatched })
  }

  const handleApplyPastedItems = async () => {
    if (!pastePreview || pastePreview.matched.length === 0) return

    const currentMap = new Map<string, ChamadaItemForm>()
    for (const it of items) {
      const key = (it.produto || '').trim().toLowerCase()
      currentMap.set(key, { ...it })
    }

    let addedCount = 0
    let updatedCount = 0

    for (const match of pastePreview.matched) {
      const key = match.product.name.trim().toLowerCase()
      if (currentMap.has(key)) {
        const existing = currentMap.get(key)!
        existing.preco = match.price
        if (match.matchedViaAlias && !existing.aka) {
          existing.aka = match.matchedViaAlias
        }
        updatedCount++
      } else {
        currentMap.set(key, {
          productId: match.product.id,
          produto: match.product.name,
          aka: match.matchedViaAlias || '',
          unidade: match.product.unit || 'Kg',
          preco: match.price,
          quantidadeAgregada: undefined,
        })
        addedCount++
      }
    }

    const finalList = Array.from(currentMap.values())
    onChange(finalList)

    if (chamadaId) {
      setIsSubmittingImport(true)
      try {
        await chamadasService.syncItems(
          chamadaId,
          finalList.map((it) => ({
            id: it.id,
            produto_id: it.productId,
            produto: it.produto,
            aka: it.aka || '',
            unidade: it.unidade || 'Kg',
            preco: it.preco,
          })),
        )
        await refreshData()
        toast.success(
          `Itens sincronizados com a chamada: ${addedCount} adicionado(s), ${updatedCount} atualizado(s)!`,
        )
      } catch (err) {
        console.error('Erro ao persistir itens da chamada:', err)
        toast.error('Falha ao gravar itens da chamada.')
      } finally {
        setIsSubmittingImport(false)
      }
    } else {
      toast.success(`Itens aplicados: ${addedCount} adicionado(s), ${updatedCount} atualizado(s)!`)
    }

    setPasteModalOpen(false)
    setPasteText('')
    setPastePreview(null)
  }

  // Importação por Planilha / CSV
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsParsingFile(true)
    try {
      // Cria referências temporárias para match
      const existingRefs = items.map((i) => ({
        productId: i.productId || '',
        nomeContrato: i.produto,
        apelidos: i.aka,
        price: i.preco,
      }))
      const res = await parseContractItemsFile(file, allAvailableProducts, existingRefs)
      setFileParseResult(res)
    } catch (err: any) {
      console.error('Erro ao processar arquivo:', err)
      toast.error(err?.message || 'Falha ao ler planilha/CSV.')
      setFileParseResult(null)
    } finally {
      setIsParsingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Resolução de AKA para linha não identificada
  const handleOpenResolveAka = (row: ParsedContractItemRow) => {
    setResolvingRow(row)
    setResolutionMode('link')
    setSelectedLinkProductId('')
    setLinkSearchTerm('')
    setAkaValue(row.rawProduct || '')
    setNewProductName(row.rawProduct || '')
    setNewProductUnit(row.rawUnidade || DEFAULT_PRODUCT_UNIT)
    setNewProductDisp('normal')
    setNewProductInitialPrice(row.price !== undefined && row.price !== null ? row.price : '')
    setResolveModalOpen(true)
  }

  const handleIgnoreRow = (rowIndex: number) => {
    if (!fileParseResult) return
    const updatedAllRows = fileParseResult.allRows.map((r) => {
      if (r.index !== rowIndex) return r
      return {
        ...r,
        status: 'ignored' as const,
        statusReason: 'Linha ignorada pelo usuário',
      }
    })
    const validRows = updatedAllRows.filter((r) => r.status === 'valid' || r.status === 'warning')
    const remainingUnmatched = updatedAllRows.filter(
      (r) => r.isUnmatched && r.status !== 'valid' && r.status !== 'ignored',
    ).length
    const remainingErrors = updatedAllRows.filter(
      (r) =>
        (r.status === 'error' || (r.isUnmatched && r.status !== 'valid')) && r.status !== 'ignored',
    ).length

    setFileParseResult({
      ...fileParseResult,
      allRows: updatedAllRows,
      validRows,
      unmatchedCount: remainingUnmatched,
      errorCount: remainingErrors,
    })
    toast.info('Linha ignorada da importação.')
  }

  const handleConfirmResolveRow = async () => {
    if (!resolvingRow || !fileParseResult) return

    try {
      let resolvedProduct: Product | undefined

      if (resolutionMode === 'link') {
        if (!selectedLinkProductId) {
          toast.warning('Selecione um produto mestre do catálogo.')
          return
        }
        resolvedProduct = allAvailableProducts.find((p) => p.id === selectedLinkProductId)
      } else {
        const cleanName = newProductName.trim()
        if (!cleanName) {
          toast.warning('Informe o nome do novo produto.')
          return
        }
        const createdRecord = await produtosService.create({
          nome: cleanName,
          unidade: newProductUnit || DEFAULT_PRODUCT_UNIT,
          categoria: '',
          disponibilidade: newProductDisp,
          preco_unitario: Number(newProductInitialPrice) || 0,
        })
        const newProd: Product = {
          id: createdRecord.id,
          name: createdRecord.nome,
          unit: createdRecord.unidade,
          category: createdRecord.categoria || '',
          disponibilidade: (createdRecord.disponibilidade as any) || 'normal',
          price: createdRecord.preco_unitario || 0,
        }
        setLocalAddedProducts((prev) => [...prev, newProd])
        resolvedProduct = newProd
        toast.success(`Produto mestre "${newProd.name}" cadastrado!`)
      }

      if (!resolvedProduct) return

      const cleanAka = akaValue.trim()
      const updatedAllRows = fileParseResult.allRows.map((r) => {
        if (r.index !== resolvingRow.index) return r
        return {
          ...r,
          status: 'valid' as const,
          product: resolvedProduct,
          productId: resolvedProduct.id,
          productName: resolvedProduct.name,
          apelidos: cleanAka,
          isUnmatched: false,
          isResolved: true,
        }
      })

      const validRows = updatedAllRows.filter((r) => r.status === 'valid' || r.status === 'warning')
      const remainingUnmatched = updatedAllRows.filter(
        (r) => r.isUnmatched && r.status !== 'valid' && r.status !== 'ignored',
      ).length
      const remainingErrors = updatedAllRows.filter(
        (r) =>
          (r.status === 'error' || (r.isUnmatched && r.status !== 'valid')) &&
          r.status !== 'ignored',
      ).length

      setFileParseResult({
        ...fileParseResult,
        allRows: updatedAllRows,
        validRows,
        unmatchedCount: remainingUnmatched,
        errorCount: remainingErrors,
      })

      setResolveModalOpen(false)
      setResolvingRow(null)
      toast.success(`Linha #${resolvingRow.index} resolvida!`)
    } catch (err) {
      console.error('Erro ao resolver AKA da linha:', err)
      toast.error('Falha ao processar resolução.')
    }
  }

  const handleApplyFileItems = async () => {
    if (!fileParseResult || fileParseResult.validRows.length === 0) return

    const currentMap = new Map<string, ChamadaItemForm>()
    for (const it of items) {
      const key = (it.produto || '').trim().toLowerCase()
      currentMap.set(key, { ...it })
    }

    let addedCount = 0
    let updatedCount = 0

    for (const r of fileParseResult.validRows) {
      const prodName = r.product?.name || r.rawProduct
      const key = prodName.trim().toLowerCase()
      const aka = r.apelidos || ''
      const unidade = r.product?.unit || r.rawUnidade || 'Kg'
      const preco = r.price || 0

      if (currentMap.has(key)) {
        const existing = currentMap.get(key)!
        existing.preco = preco
        if (aka) existing.aka = aka
        if (unidade) existing.unidade = unidade
        updatedCount++
      } else {
        currentMap.set(key, {
          productId: r.productId || r.product?.id,
          produto: prodName,
          aka,
          unidade,
          preco,
          quantidadeAgregada: undefined,
        })
        addedCount++
      }
    }

    const finalList = Array.from(currentMap.values())
    onChange(finalList)

    if (chamadaId) {
      setIsSubmittingImport(true)
      try {
        await chamadasService.syncItems(
          chamadaId,
          finalList.map((it) => ({
            id: it.id,
            produto_id: it.productId,
            produto: it.produto,
            aka: it.aka || '',
            unidade: it.unidade || 'Kg',
            preco: it.preco,
          })),
        )
        await refreshData()
        toast.success(
          `Planilha importada e salva na chamada: ${addedCount} adicionado(s), ${updatedCount} atualizado(s)!`,
        )
      } catch (err) {
        console.error('Erro ao persistir itens importados na chamada:', err)
        toast.error('Falha ao gravar itens da chamada.')
      } finally {
        setIsSubmittingImport(false)
      }
    } else {
      toast.success(
        `Planilha importada com sucesso: ${addedCount} adicionado(s), ${updatedCount} atualizado(s)!`,
      )
    }

    if (localAddedProducts.length > 0) {
      refreshData().catch(() => {})
      setLocalAddedProducts([])
    }
    setFileModalOpen(false)
    setFileParseResult(null)
  }

  // Nome base do arquivo para exportação
  const getExportBaseFilename = () => {
    const rawNum = chamadaNumero ? String(chamadaNumero).trim() : ''
    const safeNum = rawNum ? rawNum.replace(/[/\\?%*:|"<>]/g, '-') : 'sem-numero'
    return `itens-chamada-${safeNum}`
  }

  // Prepara linhas para exportação
  const getPreparedExportRows = () => {
    return items.map((item) => {
      const rawPrice = item.preco || 0
      const rawQty =
        item.quantidadeAgregada !== undefined &&
        item.quantidadeAgregada !== null &&
        item.quantidadeAgregada > 0
          ? item.quantidadeAgregada
          : 0
      const rawTotal = rawQty * rawPrice

      const precoFormatado = rawPrice.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      const qtdFormatada =
        item.quantidadeAgregada !== undefined && item.quantidadeAgregada !== null
          ? formatQuantityOneDecimal(rawQty)
          : ''
      const totalFormatado = rawTotal.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

      return {
        produto: item.produto,
        aka: item.aka || '',
        unidade: item.unidade || 'Kg',
        rawQty,
        qtdFormatada,
        rawPrice,
        precoFormatado,
        rawTotal,
        totalFormatado,
      }
    })
  }

  // Exportação CSV
  const handleExportCSV = () => {
    if (items.length === 0) {
      toast.warning('Nenhum item para exportar.')
      return
    }

    const preparedRows = getPreparedExportRows()
    const headers = [
      'Produto',
      'AKA/Apelido na Planilha',
      'Unidade',
      'Quantidade da Chamada',
      'Preço Unitário (R$)',
      'Valor Total (R$)',
    ]

    const escapeCsvField = (field: string) => {
      if (field.includes(';') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`
      }
      return field
    }

    const lines: string[] = []
    lines.push(headers.map(escapeCsvField).join(';'))

    for (const r of preparedRows) {
      lines.push(
        [r.produto, r.aka, r.unidade, r.qtdFormatada, r.precoFormatado, r.totalFormatado]
          .map(escapeCsvField)
          .join(';'),
      )
    }

    const csvContent = '\uFEFF' + lines.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${getExportBaseFilename()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('Planilha de itens da chamada exportada!')
  }

  // Exportação Excel
  const handleExportXLSX = () => {
    if (items.length === 0) {
      toast.warning('Nenhum item para exportar.')
      return
    }

    const preparedRows = getPreparedExportRows()
    const wsData: any[][] = []

    wsData.push([
      'Produto',
      'AKA/Apelido na Planilha',
      'Unidade',
      'Quantidade da Chamada',
      'Preço Unitário (R$)',
      'Valor Total (R$)',
    ])

    for (const r of preparedRows) {
      wsData.push([r.produto, r.aka, r.unidade, r.qtdFormatada, r.precoFormatado, r.totalFormatado])
    }

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    ws['!cols'] = [
      { wch: 32 }, // Produto
      { wch: 24 }, // AKA
      { wch: 10 }, // Unidade
      { wch: 22 }, // Qtd Chamada
      { wch: 20 }, // Preço
      { wch: 20 }, // Total
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Itens da Chamada')
    XLSX.writeFile(wb, `${getExportBaseFilename()}.xlsx`)
    toast.success('Planilha de itens da chamada exportada!')
  }

  return (
    <div className="space-y-3 pt-1">
      {/* Barra Superior de Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b">
        <div>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Package className="h-4 w-4 text-primary" />
              Produtos, Preços e Quantidades da Chamada ({items.length})
            </Label>
            {totalItensComQtd > 0 ? (
              <Badge
                variant="secondary"
                className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-300"
              >
                Quantidades somadas dos contratos
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Quantidades dos contratos em branco
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cadastre os produtos, seus apelidos (AKA) e preços unitários oficiais desta chamada. A
            quantidade é a soma automática dos contratos vinculados.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {items.length === 0 ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 opacity-60 cursor-not-allowed"
                      disabled
                    >
                      <Download className="h-3.5 w-3.5 text-muted-foreground" />
                      Exportar CSV
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Nenhum item cadastrado para exportar
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-foreground hover:text-primary hover:border-primary/50"
                  title="Exportar itens da chamada"
                >
                  <Download className="h-3.5 w-3.5 text-primary" />
                  Exportar CSV
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={handleExportCSV}
                  className="text-xs cursor-pointer gap-2"
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  Exportar como CSV (.csv)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExportXLSX}
                  className="text-xs cursor-pointer gap-2"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  Exportar como Excel (.xlsx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setFileModalOpen(true)}
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

      {/* Tabela de Itens */}
      {items.length === 0 ? (
        <div className="py-10 text-center border rounded-lg bg-muted/10 space-y-3">
          <Package className="h-8 w-8 text-muted-foreground/50 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Nenhum produto associado a esta chamada pública
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Clique em <strong>"Selecionar Produtos"</strong> para marcar itens do catálogo ou use{' '}
              <strong>"Importar Planilha / CSV"</strong> para carregar os produtos, AKAs e preços de
              uma vez.
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
              onClick={() => setFileModalOpen(true)}
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
                  <TableHead className="w-[30%]">Produto</TableHead>
                  <TableHead className="w-[24%]">AKA/Apelido na Planilha</TableHead>
                  <TableHead className="w-[10%] text-center">Unidade</TableHead>
                  <TableHead className="w-[14%]">Preço Unit. (R$)</TableHead>
                  <TableHead className="w-[12%] text-right">Qtd. Chamada</TableHead>
                  <TableHead className="w-[10%] text-right">Valor Total</TableHead>
                  <TableHead className="w-[4%] text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => {
                  const prod = item.productId ? productById.get(item.productId) : undefined
                  const catalogPrice = prod?.price ?? 0
                  const isDiff =
                    catalogPrice > 0 && Math.abs((item.preco || 0) - catalogPrice) > 0.009
                  const qty =
                    item.quantidadeAgregada !== undefined &&
                    item.quantidadeAgregada !== null &&
                    item.quantidadeAgregada > 0
                      ? item.quantidadeAgregada
                      : 0
                  const subtotal = (item.preco || 0) * qty

                  return (
                    <TableRow
                      key={item.id || item.productId || index}
                      className="text-xs hover:bg-muted/10"
                    >
                      {/* Produto */}
                      <TableCell className="py-2">
                        <Input
                          value={item.produto}
                          onChange={(e) => handleProdutoChange(index, e.target.value)}
                          placeholder="Nome do produto na chamada"
                          className="h-7 text-xs font-semibold text-foreground"
                          title="Nome do produto na chamada pública"
                        />
                      </TableCell>

                      {/* AKA/Apelido */}
                      <TableCell className="py-2">
                        <Input
                          value={item.aka || ''}
                          onChange={(e) => handleAkaChange(index, e.target.value)}
                          placeholder="AKA na planilha (ex: BANANA, MAÇÃ)"
                          className="h-7 text-xs font-mono text-muted-foreground"
                          title="Apelido na planilha da secretaria para cruzamento automático"
                        />
                      </TableCell>

                      {/* Unidade */}
                      <TableCell className="py-2 text-center">
                        <Input
                          value={item.unidade || 'Kg'}
                          onChange={(e) => handleUnidadeChange(index, e.target.value)}
                          placeholder="Kg"
                          className="h-7 text-xs text-center font-mono w-16 mx-auto"
                        />
                      </TableCell>

                      {/* Preço Unitário */}
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
                              value={item.preco ?? ''}
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

                          {isDiff && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                              <span>catálogo: R$ {catalogPrice.toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => handleResetToCatalogPrice(index)}
                                title="Restaurar preço base do catálogo"
                                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 underline text-[9px] ml-1"
                              >
                                <RotateCcw className="h-2.5 w-2.5" />
                                restaurar
                              </button>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Quantidade da Chamada (somente leitura - soma dos contratos) */}
                      <TableCell className="py-2 text-right">
                        {item.quantidadeAgregada !== undefined &&
                        item.quantidadeAgregada !== null &&
                        item.quantidadeAgregada > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-mono font-bold text-primary text-xs">
                              {formatQuantityOneDecimal(item.quantidadeAgregada)}
                            </span>
                            <span className="text-[9px] text-muted-foreground">soma contratos</span>
                          </div>
                        ) : (
                          <span
                            className="text-muted-foreground/50 font-mono text-xs italic"
                            title="Nenhum contrato informou quantidade para este produto ainda"
                          >
                            em branco
                          </span>
                        )}
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
                          title="Remover produto da chamada"
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

          {/* Rodapé com Totais */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Produtos cadastrados: <strong className="text-foreground">{items.length}</strong>
                </span>
                <span className="text-muted-foreground/50">•</span>
                <span className="text-xs text-muted-foreground">
                  Com quantidade somada:{' '}
                  <strong className="text-emerald-700">{totalItensComQtd}</strong>
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
                Valor Total da Chamada:
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-primary">
                R${' '}
                {totalChamadaCalculado.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: SELEÇÃO EM LOTE */}
      <Dialog open={batchModalOpen} onOpenChange={setBatchModalOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Selecionar Produtos do Catálogo
            </DialogTitle>
            <DialogDescription>
              Marque os produtos que deseja incluir nesta chamada pública. Preços e nomes virão
              preenchidos e poderão ser ajustados.
            </DialogDescription>
          </DialogHeader>

          <div className="shrink-0 space-y-2 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou unidade..."
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

          <div className="flex-1 min-h-[200px] max-h-[45vh] overflow-y-auto border rounded-md divide-y divide-border overscroll-contain">
            {filteredCatalogForBatch.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhum produto encontrado no catálogo.
              </div>
            ) : (
              filteredCatalogForBatch.map((p) => {
                const isAlready =
                  includedKeys.has(p.id) || includedKeys.has(p.name.trim().toLowerCase())
                const isSelected = selectedProductIds.has(p.id)

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (!isAlready) handleToggleSelectProduct(p.id)
                    }}
                    className={`flex items-center justify-between p-2.5 text-xs transition-colors cursor-pointer select-none ${
                      isAlready
                        ? 'bg-muted/40 opacity-60 cursor-not-allowed'
                        : isSelected
                          ? 'bg-primary/10 border-l-2 border-l-primary'
                          : 'hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isAlready || isSelected}
                        disabled={isAlready}
                        onChange={() => {
                          if (!isAlready) handleToggleSelectProduct(p.id)
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground truncate">{p.name}</span>
                          {isAlready && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] py-0 px-1 shrink-0 text-muted-foreground"
                            >
                              Já na chamada
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Unidade: {p.unit}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      {p.price !== undefined && p.price !== null && p.price > 0 ? (
                        <span className="font-mono font-medium text-foreground block">
                          R$ {p.price.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic block">
                          Preço a definir
                        </span>
                      )}
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

      {/* MODAL 2: COLAR EM MASSA */}
      <Dialog open={pasteModalOpen} onOpenChange={setPasteModalOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="h-5 w-5 text-primary" />
              Colar Produtos e Preços da Chamada
            </DialogTitle>
            <DialogDescription>
              Copie linhas do Excel e cole abaixo. Formato aceito:{' '}
              <strong>Produto [tab] Preço</strong> ou <strong>Produto; Preço</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label htmlFor="paste-area-ch" className="text-xs font-semibold">
                Conteúdo copiado (uma linha por item):
              </Label>
              <Textarea
                id="paste-area-ch"
                rows={5}
                placeholder={`Banana Prata; 5,50\nMaçã Nacional; 8,20\nCenoura; 4,00\nTomate; 6,50`}
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

                {pastePreview.matched.length > 0 && (
                  <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1">
                    {pastePreview.matched.map((m, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-1.5 rounded bg-card border text-[11px]"
                      >
                        <div className="truncate mr-2">
                          <span className="font-semibold">{m.product.name}</span>
                          <span className="text-muted-foreground ml-1">({m.product.unit})</span>
                        </div>
                        <div className="font-mono text-xs">R$ {m.price.toFixed(2)}</div>
                      </div>
                    ))}
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
              onClick={() => setPasteModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApplyPastedItems}
              disabled={!pastePreview || pastePreview.matched.length === 0 || isSubmittingImport}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Aplicar {pastePreview?.matched.length || 0} produto(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: IMPORTAR PLANILHA / CSV */}
      <Dialog open={fileModalOpen} onOpenChange={setFileModalOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Importar Planilha de Itens da Chamada
            </DialogTitle>
            <DialogDescription>
              Carregue uma planilha (.xlsx ou .csv) contendo Produto, AKA/Apelido e Preço Unitário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 flex-1 min-h-0 overflow-y-auto">
            <div className="p-4 rounded-lg border border-dashed text-center space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload-ch"
              />
              <label
                htmlFor="file-upload-ch"
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Upload className="h-4 w-4" />
                Selecionar Arquivo (.xlsx / .csv)
              </label>
              <p className="text-[11px] text-muted-foreground">
                Colunas esperadas: <strong>Produto</strong>, <strong>Preço Unitário</strong> (e
                opcionalmente AKA/Apelido e Unidade).
              </p>
            </div>

            {isParsingFile && (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Processando planilha...
              </div>
            )}

            {fileParseResult && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-emerald-600">
                    {fileParseResult.validRows.length} linha(s) pronta(s) para importar
                  </span>
                  {fileParseResult.unmatchedCount > 0 && (
                    <span className="font-semibold text-amber-600">
                      {fileParseResult.unmatchedCount} pendência(s) de AKA
                    </span>
                  )}
                </div>

                <div className="max-h-[220px] overflow-y-auto border rounded divide-y text-xs">
                  {fileParseResult.allRows.map((r) => {
                    const isPendingUnmatched =
                      r.isUnmatched && r.status !== 'valid' && r.status !== 'ignored'
                    const isIgnored = r.status === 'ignored'

                    return (
                      <div
                        key={r.index}
                        className={`p-2 flex items-center justify-between ${
                          isIgnored ? 'opacity-50 bg-muted/20' : ''
                        }`}
                      >
                        <div className="truncate mr-2">
                          <span className="font-semibold">{r.rawProduct}</span>
                          <span className="text-muted-foreground ml-1">
                            (R$ {r.price.toFixed(2)})
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isPendingUnmatched ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                className="h-6 text-[10px] px-2 gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={() => handleOpenResolveAka(r)}
                              >
                                <Sparkles className="h-3 w-3" /> Definir AKA
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] px-1 text-muted-foreground"
                                onClick={() => handleIgnoreRow(r.index)}
                              >
                                <EyeOff className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <span className="text-emerald-600 font-bold">✓</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
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
              disabled={
                !fileParseResult ||
                fileParseResult.validRows.length === 0 ||
                fileParseResult.unmatchedCount > 0 ||
                isSubmittingImport
              }
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Confirmar Importação de {fileParseResult?.validRows.length || 0} produto(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: DEFINIR AKA */}
      <Dialog
        open={resolveModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setResolveModalOpen(false)
            setResolvingRow(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col p-6">
          <DialogHeader className="shrink-0 space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-amber-600" />
              Definir AKA da Chamada para o Produto
            </DialogTitle>
            <DialogDescription className="text-xs">
              Associe a linha da planilha a um produto mestre ou crie um novo produto no cadastro.
            </DialogDescription>
          </DialogHeader>

          {resolvingRow && (
            <div className="space-y-4 py-2 flex-1 overflow-y-auto">
              <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">
                  Linha #{resolvingRow.index} da Planilha
                </span>
                <div className="font-semibold text-sm text-foreground">
                  {resolvingRow.rawProduct}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="aka-input-ch" className="text-xs font-semibold">
                  Apelido na Planilha (AKA)
                </Label>
                <Input
                  id="aka-input-ch"
                  value={akaValue}
                  onChange={(e) => setAkaValue(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-2 pt-1 border-t">
                <Label className="text-xs font-semibold">Como deseja resolver este produto?</Label>
                <RadioGroup
                  value={resolutionMode}
                  onValueChange={(val) => setResolutionMode(val as 'link' | 'create')}
                  className="grid grid-cols-2 gap-2"
                >
                  <label
                    htmlFor="mode-link-ch"
                    className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${
                      resolutionMode === 'link'
                        ? 'border-primary bg-primary/5 shadow-xs'
                        : 'border-muted hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-medium text-xs">
                        <LinkIcon className="h-3.5 w-3.5 text-primary" />
                        Vincular a Existente
                      </div>
                      <RadioGroupItem value="link" id="mode-link-ch" />
                    </div>
                  </label>

                  <label
                    htmlFor="mode-create-ch"
                    className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-colors ${
                      resolutionMode === 'create'
                        ? 'border-primary bg-primary/5 shadow-xs'
                        : 'border-muted hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-medium text-xs">
                        <PlusCircle className="h-3.5 w-3.5 text-primary" />
                        Criar Novo Produto
                      </div>
                      <RadioGroupItem value="create" id="mode-create-ch" />
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {resolutionMode === 'link' ? (
                <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                  <Label className="text-xs font-semibold">Buscar Produto Mestre</Label>
                  <Input
                    placeholder="Filtrar por nome do produto..."
                    value={linkSearchTerm}
                    onChange={(e) => setLinkSearchTerm(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <div className="max-h-[140px] overflow-y-auto border rounded bg-card divide-y text-xs">
                    {allAvailableProducts
                      .filter((p) =>
                        normalizeName(p.name).includes(normalizeName(linkSearchTerm.trim())),
                      )
                      .slice(0, 30)
                      .map((p) => {
                        const isSelected = selectedLinkProductId === p.id
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedLinkProductId(p.id)}
                            className={`p-2 cursor-pointer flex items-center justify-between hover:bg-muted/50 ${
                              isSelected ? 'bg-primary/10 font-semibold' : ''
                            }`}
                          >
                            <span>{p.name}</span>
                            {isSelected && <Check className="h-4 w-4 text-primary" />}
                          </div>
                        )
                      })}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                  <Label className="text-xs font-semibold">Nome Oficial do Produto</Label>
                  <Input
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="shrink-0 pt-3 border-t mt-auto flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setResolveModalOpen(false)
                setResolvingRow(null)
              }}
            >
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleConfirmResolveRow}>
              Confirmar AKA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAÇÃO DE EXCLUSÃO DE ITEM */}
      <Dialog
        open={itemToDeleteIndex !== null}
        onOpenChange={(open) => !open && setItemToDeleteIndex(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Remover produto da chamada?</DialogTitle>
            <DialogDescription className="text-xs">
              Tem certeza que deseja remover este item da lista desta chamada?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItemToDeleteIndex(null)}
            >
              Cancelar
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={handleConfirmRemoveItem}>
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
