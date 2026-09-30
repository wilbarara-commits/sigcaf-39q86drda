import { useState, useMemo, useRef, useCallback } from 'react'
import type { Product, DisponibilidadeProduto } from '@/lib/types'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
  Link as LinkIcon,
  PlusCircle,
  EyeOff,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { normalizeName } from '@/lib/excelImporter'
import {
  matchCatalogProduct,
  matchCatalogProductDetailed,
  parseBRLNumber,
  parseContractIntegerQuantity,
  parseContractItemsFile,
  type ContractItemsFileParseResult,
  type ParsedContractItemRow,
} from '@/lib/contractItemsImporter'
import { produtosService } from '@/services/produtos'
import { contratosService } from '@/services/contratos'
import { DEFAULT_PRODUCT_UNIT } from '@/lib/productCsvImporter'
import { formatPriceTwoDecimals, formatQuantityOneDecimal } from '@/lib/decimalUtils'
import { useApp } from '@/context/app-context'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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
  contractId?: string
  contractNumber?: string
  chamadaId?: string
}

export function ContractItemsManager({
  items,
  onChange,
  catalogProducts,
  onTotalCalculadoChange,
  contractId,
  contractNumber,
  chamadaId,
}: ContractItemsManagerProps) {
  const { chamadaItems } = useApp()
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

  const { refreshData } = useApp()

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

  // Lista filtrada para o modal de resolução (busca de produto para vincular)
  const filteredLinkProducts = useMemo(() => {
    if (!allAvailableProducts) return []
    const term = normalizeName(linkSearchTerm.trim())
    if (!term) return allAvailableProducts.slice(0, 50)
    return allAvailableProducts
      .filter((p) => {
        const norm = normalizeName(p.name)
        return norm.includes(term)
      })
      .slice(0, 50)
  }, [allAvailableProducts, linkSearchTerm])

  // Map rápido de produtos do catálogo por ID
  const productById = useMemo(() => {
    const map = new Map<string, Product>()
    for (const p of allAvailableProducts) {
      map.set(p.id, p)
    }
    return map
  }, [allAvailableProducts])

  // Itens da chamada correspondente (para espelhar AKA e Preço)
  const itensDestaChamada = useMemo(() => {
    if (!chamadaId || !chamadaItems) return []
    return chamadaItems.filter((ci) => ci.chamada_id === chamadaId)
  }, [chamadaId, chamadaItems])

  // Map de itens da chamada por produto_id ou por nome
  const chamadaItemByProductId = useMemo(() => {
    const map = new Map<string, (typeof itensDestaChamada)[0]>()
    for (const ci of itensDestaChamada) {
      if (ci.produto_id) {
        map.set(ci.produto_id, ci)
      }
      const normNome = (ci.produto || '').trim().toLowerCase()
      if (normNome && !map.has(normNome)) {
        map.set(normNome, ci)
      }
    }
    return map
  }, [itensDestaChamada])

  // Helper para obter o preço soberano da chamada para um produto (com fallback para o catálogo mestre)
  const getSovereignPrice = useCallback(
    (product: Product): number => {
      const ci =
        chamadaItemByProductId.get(product.id) ||
        (product.name ? chamadaItemByProductId.get(product.name.trim().toLowerCase()) : undefined)
      if (ci?.preco !== undefined && ci.preco !== null && ci.preco >= 0) {
        return ci.preco
      }
      return product.price || 0
    },
    [chamadaItemByProductId],
  )

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
    return allAvailableProducts.filter((p) => {
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.unit && p.unit.toLowerCase().includes(q))
    })
  }, [allAvailableProducts, batchSearchQuery])

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
        const ci =
          chamadaItemByProductId.get(prodId) ||
          (prod?.name ? chamadaItemByProductId.get(prod.name.trim().toLowerCase()) : undefined)
        const effectivePrice = ci?.preco !== undefined ? ci.preco : prod?.price || 0
        const effectiveAka = ci?.aka || ''

        newItems.push({
          productId: prodId,
          price: effectivePrice,
          quantity: undefined,
          nomeContrato: ci?.produto || prod?.name || '',
          apelidos: effectiveAka,
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

  // Edição inline de quantidade contratada (podendo ficar em branco/indefinida)
  const handleQuantityChange = (index: number, newQuantity: number | undefined) => {
    const updated = items.map((it, idx) => {
      if (idx !== index) return it
      return {
        ...it,
        quantity:
          newQuantity === undefined || isNaN(newQuantity) ? undefined : Math.max(0, newQuantity),
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

  // Restaurar preço da chamada (ou catálogo)
  const handleResetToCatalogPrice = (index: number) => {
    const it = items[index]
    const prod = productById.get(it.productId)
    const ci =
      chamadaItemByProductId.get(it.productId) ||
      (prod?.name ? chamadaItemByProductId.get(prod.name.trim().toLowerCase()) : undefined)
    const targetPrice = ci?.preco !== undefined ? ci.preco : prod?.price

    if (targetPrice === undefined || targetPrice === null || targetPrice < 0) {
      toast.warning('Este produto não possui preço na chamada nem no catálogo.')
      return
    }
    handlePriceChange(index, targetPrice)
    toast.info(`Preço redefinido para o valor da chamada (R$ ${targetPrice.toFixed(2)})`)
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
      let qtyPart = ''

      if (rawParts.length >= 3) {
        // Colunas esperadas: Produto, [Preço descartado], Quantidade
        // Se a segunda coluna for a quantidade e a terceira preço, ou padrão Produto, Preço, Quantidade:
        // Pelo padrão: coluna 0 = Produto, coluna 2 = Quantidade
        namePart = rawParts[0]
        qtyPart = rawParts[2]
      } else if (rawParts.length === 2) {
        // Se 2 colunas: pode ser Produto + Quantidade (ou Produto + Preço)
        namePart = rawParts[0]
        qtyPart = rawParts[1]
      } else {
        namePart = line.trim()
      }

      // Normaliza e faz matching contra o catálogo
      const matchDetail = matchCatalogProductDetailed(namePart, allAvailableProducts)
      const found = matchDetail.product

      if (!found) {
        unmatched.push(line)
        continue
      }

      // MUDANÇA v0.0.109: Preço é estritamente soberano da chamada (chamada_itens.preco)
      // Qualquer preço vindo da colagem/arquivo é ignorado.
      const price = getSovereignPrice(found)

      // Quantidade: capturar apenas como inteiro >= 0 (descartar vírgula/ponto — regra v0.0.108/v0.0.109; vazio = não contratado / 0)
      let quantity = 0
      if (qtyPart) {
        const parsedQ = parseContractIntegerQuantity(qtyPart)
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

  const handleApplyPastedItems = async () => {
    if (!pastePreview || pastePreview.matched.length === 0) return

    // Mesclar: preço vem SEMPRE da chamada (soberano). Apenas quantidade e identificadores são aplicados.
    const currentMap = new Map<string, ContractItemForm>()
    for (const it of items) {
      currentMap.set(it.productId, { ...it })
    }

    let addedCount = 0
    let updatedCount = 0

    for (const match of pastePreview.matched) {
      const sovereignPrice = getSovereignPrice(match.product)

      if (currentMap.has(match.product.id)) {
        const existing = currentMap.get(match.product.id)!
        existing.price = sovereignPrice // Mantém o preço soberano da chamada
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
          price: sovereignPrice, // Mantém o preço soberano da chamada
          quantity: match.quantity > 0 ? match.quantity : undefined,
          nomeContrato: match.product.name,
          apelidos: '',
        })
        addedCount++
      }
    }

    const finalItemsList = Array.from(currentMap.values())
    onChange(finalItemsList)

    if (contractId) {
      setIsSubmittingImport(true)
      try {
        const validItems = finalItemsList.filter((i) => i.productId && Number(i.price) >= 0)
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
        // Se houver quantidades nos itens, recalcula e sobrepõe o valor_total do contrato
        const itemsComQtd = finalItemsList.filter((i) => (i.quantity || 0) > 0)
        if (itemsComQtd.length > 0) {
          const totalRecalculado = finalItemsList.reduce(
            (acc, it) => acc + (it.price || 0) * (it.quantity || 0),
            0,
          )
          await contratosService.update(contractId, { valor_total: totalRecalculado })
        }
        await refreshData()
        toast.success(
          `Itens colados e salvos no contrato com sucesso: ${addedCount} adicionado(s), ${updatedCount} atualizado(s)!`,
        )
      } catch (err: any) {
        console.error('Erro ao salvar itens colados no contrato:', err)
        toast.error('Falha ao gravar itens no banco de dados.')
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

  // Upload e Parse de Planilha/CSV
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsParsingFile(true)
    try {
      const parsedRes = await parseContractItemsFile(file, allAvailableProducts, items)

      // MUDANÇA v0.0.109: Forçar o preço soberano da chamada em todas as linhas válidas/resolvidas
      const normalizedAllRows = parsedRes.allRows.map((r) => {
        if (!r.product) return r
        const sovereignPrice = getSovereignPrice(r.product)
        const subtotal = sovereignPrice * r.quantity
        return {
          ...r,
          price: sovereignPrice,
          subtotal,
        }
      })

      const validRows = normalizedAllRows.filter(
        (r) => r.status === 'valid' || r.status === 'warning',
      )
      const totalCalculado = validRows.reduce((acc, r) => acc + r.subtotal, 0)

      setFileParseResult({
        ...parsedRes,
        allRows: normalizedAllRows,
        validRows,
        totalCalculado,
      })
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

  // Abertura do Modal de Resolução de AKA para uma linha sem correspondência
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

  // Ação de ignorar linha explicitamente
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
    const totalCalculado = validRows.reduce((acc, r) => acc + r.subtotal, 0)
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
      totalCalculado,
      unmatchedCount: remainingUnmatched,
      errorCount: remainingErrors,
    })

    toast.info('Linha ignorada da importação.')
  }

  // Restaurar linha ignorada
  const handleRestoreRow = (rowIndex: number) => {
    if (!fileParseResult) return

    const updatedAllRows = fileParseResult.allRows.map((r) => {
      if (r.index !== rowIndex) return r
      return {
        ...r,
        status: 'warning' as const,
        statusReason: 'Produto sem correspondência na tabela de produtos cadastrados',
      }
    })

    const validRows = updatedAllRows.filter((r) => r.status === 'valid' || r.status === 'warning')
    const totalCalculado = validRows.reduce((acc, r) => acc + r.subtotal, 0)
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
      totalCalculado,
      unmatchedCount: remainingUnmatched,
      errorCount: remainingErrors,
    })
  }

  // Confirmar Resolução de AKA (Opção A: Vincular existente / Opção B: Criar mestre)
  const handleConfirmResolution = async () => {
    if (!resolvingRow || !fileParseResult) return

    const trimmedAka = akaValue.trim() || resolvingRow.rawProduct

    if (resolutionMode === 'link') {
      if (!selectedLinkProductId) {
        toast.error('Selecione o produto mestre para vincular.')
        return
      }

      const linkedProduct = productById.get(selectedLinkProductId)
      if (!linkedProduct) {
        toast.error('Produto selecionado não encontrado no catálogo.')
        return
      }

      // Atualiza a linha no resultado da planilha
      // MUDANÇA v0.0.109: Preço soberano da chamada para o produto vinculado
      const sovereignPrice = getSovereignPrice(linkedProduct)
      const subtotal = sovereignPrice * resolvingRow.quantity

      const updatedAllRows = fileParseResult.allRows.map((r) => {
        if (r.index !== resolvingRow.index) return r
        return {
          ...r,
          product: linkedProduct,
          nomeContrato: resolvingRow.rawProduct,
          apelidos: trimmedAka,
          price: sovereignPrice,
          subtotal,
          status: 'valid' as const,
          statusReason: `Vinculado a "${linkedProduct.name}" com AKA "${trimmedAka}"`,
          isUnmatched: false,
          resolutionType: 'linked' as const,
          warnings: [],
        }
      })

      const validRows = updatedAllRows.filter((r) => r.status === 'valid' || r.status === 'warning')
      const totalCalculado = validRows.reduce((acc, r) => acc + r.subtotal, 0)
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
        totalCalculado,
        unmatchedCount: remainingUnmatched,
        errorCount: remainingErrors,
      })

      toast.success(
        `Item "${resolvingRow.rawProduct}" vinculado a "${linkedProduct.name}" com AKA registrado!`,
      )
      setResolveModalOpen(false)
      setResolvingRow(null)
    } else {
      // Criação de novo produto no catálogo mestre
      const trimmedNome = newProductName.trim()
      if (!trimmedNome) {
        toast.error('Informe o nome do novo produto mestre.')
        return
      }

      setIsSubmittingImport(true)
      try {
        const parsedInitialPrice =
          typeof newProductInitialPrice === 'number'
            ? newProductInitialPrice
            : parseBRLNumber(newProductInitialPrice).value || 0

        const createdRecord = await produtosService.create({
          nome: trimmedNome,
          unidade: newProductUnit.trim() || DEFAULT_PRODUCT_UNIT,
          disponibilidade: newProductDisp,
          preco_unitario: parsedInitialPrice >= 0 ? parsedInitialPrice : 0,
        })

        // Converte para Product do UI model
        const newProductUi: Product = {
          id: createdRecord.id,
          name: createdRecord.nome,
          unit: createdRecord.unidade,
          disponibilidade: createdRecord.disponibilidade,
          category: createdRecord.categoria,
          price: createdRecord.preco_unitario || 0,
        }

        // Sincroniza o produto novo localmente na lista sem disparar refreshData()
        setLocalAddedProducts((prev) => {
          if (prev.some((p) => p.id === newProductUi.id)) return prev
          return [...prev, newProductUi]
        })

        // Atualiza a linha com o novo produto criado
        // MUDANÇA v0.0.109: Preço soberano da chamada para o produto recém-criado
        const sovereignPrice = getSovereignPrice(newProductUi)
        const subtotal = sovereignPrice * resolvingRow.quantity

        const updatedAllRows = fileParseResult.allRows.map((r) => {
          if (r.index !== resolvingRow.index) return r
          return {
            ...r,
            product: newProductUi,
            nomeContrato: resolvingRow.rawProduct,
            apelidos: trimmedAka,
            price: sovereignPrice,
            subtotal,
            status: 'valid' as const,
            statusReason: `Novo produto mestre criado: "${newProductUi.name}"`,
            isUnmatched: false,
            resolutionType: 'created' as const,
            warnings: [],
          }
        })

        const validRows = updatedAllRows.filter(
          (r) => r.status === 'valid' || r.status === 'warning',
        )
        const totalCalculado = validRows.reduce((acc, r) => acc + r.subtotal, 0)
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
          totalCalculado,
          unmatchedCount: remainingUnmatched,
          errorCount: remainingErrors,
        })

        toast.success(
          `Produto mestre "${newProductUi.name}" criado e associado à linha da planilha!`,
        )
        setResolveModalOpen(false)
        setResolvingRow(null)
      } catch (err: any) {
        console.error('Erro ao criar produto mestre:', err)
        toast.error(err?.message || 'Falha ao criar novo produto na tabela mestre.')
      } finally {
        setIsSubmittingImport(false)
      }
    }
  }

  const handleApplyFileItems = async () => {
    if (!fileParseResult) return

    // Verifica se ainda existem pendências bloqueantes (linhas sem correspondência não resolvidas nem ignoradas)
    const pendingUnmatched = fileParseResult.allRows.filter(
      (r) => r.isUnmatched && r.status !== 'valid' && r.status !== 'ignored',
    )
    if (pendingUnmatched.length > 0) {
      toast.warning(
        `Existem ${pendingUnmatched.length} linha(s) sem correspondência na tabela de produtos. Defina o AKA (vincular/criar) ou opte por ignorar a linha antes de prosseguir.`,
      )
      return
    }

    const currentMap = new Map<string, ContractItemForm>()
    for (const it of items) {
      currentMap.set(it.productId, { ...it })
    }

    let addedCount = 0
    let updatedCount = 0

    for (const row of fileParseResult.validRows) {
      if (!row.product || row.status === 'ignored') continue
      const importedNomeContrato = row.nomeContrato || row.rawProduct || row.product.name
      const importedApelido =
        row.apelidos || (row.rawProduct !== row.product.name ? row.rawProduct : '')
      // MUDANÇA v0.0.109: Preço da chamada é estritamente soberano, ignorando o preço da planilha
      const sovereignPrice = getSovereignPrice(row.product)

      if (currentMap.has(row.product.id)) {
        const existing = currentMap.get(row.product.id)!
        existing.price = sovereignPrice
        existing.quantity = row.quantity > 0 ? row.quantity : undefined
        if (importedNomeContrato) {
          existing.nomeContrato = importedNomeContrato
        }
        if (importedApelido) {
          // Acrescenta ou define apelido
          if (!existing.apelidos) {
            existing.apelidos = importedApelido
          } else if (!existing.apelidos.toLowerCase().includes(importedApelido.toLowerCase())) {
            existing.apelidos = `${existing.apelidos}, ${importedApelido}`
          }
        }
        updatedCount++
      } else {
        currentMap.set(row.product.id, {
          productId: row.product.id,
          price: sovereignPrice,
          quantity: row.quantity > 0 ? row.quantity : undefined,
          nomeContrato: importedNomeContrato,
          apelidos: importedApelido,
        })
        addedCount++
      }
    }

    const finalItemsList = Array.from(currentMap.values())
    onChange(finalItemsList)

    // Se o contrato já existir (contractId fornecido), persiste diretamente em contrato_itens
    if (contractId) {
      setIsSubmittingImport(true)
      try {
        const validItems = finalItemsList.filter((i) => i.productId && Number(i.price) >= 0)
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
        // Se houver quantidades nos itens, recalcula e sobrepõe o valor_total do contrato
        const itemsComQtd = finalItemsList.filter((i) => (i.quantity || 0) > 0)
        if (itemsComQtd.length > 0) {
          const totalRecalculado = finalItemsList.reduce(
            (acc, it) => acc + (it.price || 0) * (it.quantity || 0),
            0,
          )
          await contratosService.update(contractId, { valor_total: totalRecalculado })
        }
        await refreshData()
        toast.success(
          `Planilha importada e gravada no contrato com sucesso: ${addedCount} produto(s) adicionado(s), ${updatedCount} atualizado(s)!`,
        )
      } catch (err: any) {
        console.error('Erro ao persistir itens do contrato importados:', err)
        toast.error('Falha ao salvar itens importados no banco de dados.')
      } finally {
        setIsSubmittingImport(false)
      }
    } else {
      toast.success(
        `Planilha importada com sucesso: ${addedCount} produto(s) adicionado(s), ${updatedCount} atualizado(s)!`,
      )
    }

    // Sincronização global acontece na confirmação da importação se produtos foram criados
    if (localAddedProducts.length > 0) {
      refreshData().catch(() => {})
      setLocalAddedProducts([])
    }
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

  // Prepara os dados brutos e formatados para exportação (CSV / XLSX)
  const getPreparedExportRows = () => {
    return items.map((item) => {
      const prod = productById.get(item.productId)
      const nomeContrato =
        item.nomeContrato && item.nomeContrato.trim().length > 0
          ? item.nomeContrato.trim()
          : prod?.name || ''
      const aka = item.apelidos?.trim() || ''
      const unidade = prod?.unit || 'Kg'
      const rawPrice = item.price || 0
      const rawQty =
        item.quantity !== undefined && item.quantity !== null && item.quantity > 0
          ? item.quantity
          : 0
      const rawTotal = rawQty * rawPrice

      const precoFormatado = rawPrice.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      const qtdFormatada = formatQuantityOneDecimal(rawQty)
      const totalFormatado = rawTotal.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

      return {
        nomeContrato,
        aka,
        unidade,
        rawQty,
        qtdFormatada,
        rawPrice,
        precoFormatado,
        rawTotal,
        totalFormatado,
      }
    })
  }

  const getExportBaseFilename = () => {
    const rawNum = contractNumber ? String(contractNumber).trim() : ''
    const safeNum = rawNum ? rawNum.replace(/[/\\?%*:|"<>]/g, '-') : 'sem-numero'
    return `itens-contrato-${safeNum}`
  }

  // Exportação CSV client-side com BOM UTF-8 e separador ';'
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
      'Quantidade Contratada',
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
      const rowFields = [
        r.nomeContrato,
        r.aka,
        r.unidade,
        r.qtdFormatada,
        r.precoFormatado,
        r.totalFormatado,
      ]
      lines.push(rowFields.map(escapeCsvField).join(';'))
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

    toast.success('Planilha de itens exportada!')
  }

  // Exportação XLSX compatível com o padrão de relatórios do projeto
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
      'Quantidade Contratada',
      'Preço Unitário (R$)',
      'Valor Total (R$)',
    ])

    for (const r of preparedRows) {
      wsData.push([
        r.nomeContrato,
        r.aka,
        r.unidade,
        r.qtdFormatada,
        r.precoFormatado,
        r.totalFormatado,
      ])
    }

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    ws['!cols'] = [
      { wch: 32 }, // Produto
      { wch: 24 }, // AKA
      { wch: 10 }, // Unidade
      { wch: 22 }, // Qtd Contratada
      { wch: 20 }, // Preço
      { wch: 20 }, // Total
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Itens Contratados')
    XLSX.writeFile(wb, `${getExportBaseFilename()}.xlsx`)

    toast.success('Planilha de itens exportada!')
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
          {/* Botão de Exportação de Planilha / CSV */}
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
                  title="Exportar planilha de itens do contrato"
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
            onClick={() => {
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
                  <TableHead className="min-w-[240px] w-[30%]">Nome no Contrato & AKA</TableHead>
                  <TableHead className="min-w-[170px] w-[20%]">Produto Mestre / Catálogo</TableHead>
                  <TableHead className="w-[70px] text-center">Unidade</TableHead>
                  <TableHead className="min-w-[140px] w-[15%] text-right">
                    Preço Unit. (R$)
                  </TableHead>
                  <TableHead className="min-w-[130px] w-[15%] text-right">
                    Qtd. Contratada
                  </TableHead>
                  <TableHead className="min-w-[120px] w-[15%] text-right">Subtotal</TableHead>
                  <TableHead className="w-[45px] text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => {
                  const prod = productById.get(item.productId)
                  const qty =
                    item.quantity !== undefined && item.quantity !== null ? item.quantity : 0
                  const subtotal = (item.price || 0) * qty

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
                        </div>
                      </TableCell>

                      {/* Unidade */}
                      <TableCell className="text-center font-mono py-2 text-muted-foreground">
                        {prod?.unit || 'Kg'}
                      </TableCell>

                      {/* Preço Unitário (somente leitura) */}
                      <TableCell className="py-2 text-right font-mono font-medium text-foreground">
                        <div className="w-full max-w-[135px] ml-auto text-right">
                          R$ {formatPriceTwoDecimals(item.price)}
                        </div>
                      </TableCell>

                      {/* Quantidade contratada inline (em branco aceita, somente inteiros) */}
                      <TableCell className="py-2 text-right">
                        <div className="w-full max-w-[135px] ml-auto">
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="em branco"
                            value={
                              item.quantity === undefined || item.quantity === null
                                ? ''
                                : item.quantity.toString()
                            }
                            onChange={(e) => {
                              const raw = e.target.value
                              if (raw.trim() === '') {
                                handleQuantityChange(index, undefined)
                                return
                              }
                              const cleaned = raw.replace(/\D/g, '')
                              if (!cleaned) {
                                handleQuantityChange(index, undefined)
                                return
                              }
                              const parsed = parseInt(cleaned, 10)
                              handleQuantityChange(index, isNaN(parsed) ? undefined : parsed)
                            }}
                            onBlur={(e) => {
                              const raw = e.target.value.trim()
                              if (!raw) {
                                handleQuantityChange(index, undefined)
                                return
                              }
                              const cleaned = raw.replace(/\D/g, '')
                              if (!cleaned) {
                                handleQuantityChange(index, undefined)
                                return
                              }
                              const parsed = parseInt(cleaned, 10)
                              if (isNaN(parsed) || parsed < 0) {
                                handleQuantityChange(index, undefined)
                              } else {
                                handleQuantityChange(index, parsed)
                              }
                            }}
                            className={`h-7 px-2 text-xs font-mono text-right font-medium ${
                              qty > 0
                                ? 'border-primary/50 bg-primary/5 font-semibold text-primary'
                                : 'text-muted-foreground placeholder:italic'
                            }`}
                            title="Quantidade para este contrato (deixe em branco se não contratar este item)"
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
                          Unidade: {p.unit}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      {p.price !== undefined && p.price !== null && p.price > 0 ? (
                        <>
                          <span className="font-mono font-medium text-foreground block">
                            R$ {p.price.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">preço base</span>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic block">
                          Preço a definir no contrato
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

      {/* MODAL 2: COLAR EM MASSA (PRODUTO, PREÇO, QUANTIDADE) */}
      <Dialog open={pasteModalOpen} onOpenChange={setPasteModalOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="h-5 w-5 text-primary" />
              Colar Produtos e Quantidades
            </DialogTitle>
            <DialogDescription>
              Copie células do Excel e cole abaixo. Aceita as colunas:{' '}
              <strong>Produto [tab] Quantidade</strong> ou <strong>Produto; Quantidade</strong> (ou
              formato legado com coluna de preço). Preços herdados da chamada; valores do arquivo
              são ignorados.
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
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground bg-muted/40 px-2 py-1 rounded">
                      <span className="font-medium">Produto Identificado</span>
                      <span className="font-medium">
                        Preço da Chamada (Soberano) × Qtd = Subtotal
                      </span>
                    </div>
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
                          <div className="flex items-center gap-2 font-mono shrink-0 text-right">
                            <span
                              className="text-muted-foreground"
                              title="Preço da Chamada (Soberano)"
                            >
                              R${' '}
                              {m.price.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                            <span className="text-muted-foreground">×</span>
                            <span className="text-primary font-semibold">
                              {m.quantity} {m.product.unit}
                            </span>
                            <span className="text-muted-foreground">=</span>
                            <span className="font-bold text-foreground">
                              R${' '}
                              {m.subtotal.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t text-[11px]">
                      <p className="text-[10px] text-muted-foreground italic">
                        Preços herdados da chamada; valores do arquivo são ignorados.
                      </p>
                      <div className="font-mono text-xs">
                        <span className="text-muted-foreground mr-1">Total:</span>
                        <strong className="text-primary font-bold">
                          R${' '}
                          {pastePreview.matched
                            .reduce((acc, m) => acc + m.subtotal, 0)
                            .toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                        </strong>
                      </div>
                    </div>
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
              disabled={!pastePreview || pastePreview.matched.length === 0 || isSubmittingImport}
              className="gap-1.5"
            >
              {isSubmittingImport ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Salvando no Contrato...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Aplicar {pastePreview?.matched.length || 0} produto(s) ao Contrato
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: IMPORTAÇÃO EM MASSA VIA PLANILHA / CSV */}
      <Dialog
        open={fileModalOpen}
        onOpenChange={(open) => {
          // Ignorar fechamento enquanto o modal de resolução de AKA estiver aberto
          if (!open && resolveModalOpen) return
          setFileModalOpen(open)
          if (!open) {
            // Sincroniza se produtos foram criados durante a sessão ao fechar o modal
            if (localAddedProducts.length > 0) {
              refreshData().catch(() => {})
              setLocalAddedProducts([])
            }
          }
        }}
      >
        <DialogContent
          className="sm:max-w-[700px] max-h-[85vh] flex flex-col overflow-hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Importação em Massa de Itens do Contrato (Excel / CSV)
            </DialogTitle>
            <DialogDescription>
              Faça upload de uma planilha (.xlsx ou .csv) contendo os produtos e quantidades
              contratadas. O sistema valida os itens contra o catálogo cadastrado. Preços herdados
              da chamada; valores do arquivo são ignorados.
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
                  Colunas esperadas: <strong>Produto</strong> e{' '}
                  <strong>Quantidade Contratada</strong> (coluna de preço opcional e ignorada).
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
                      Total do Contrato:
                    </span>
                    <span className="font-mono font-bold text-sm text-primary">
                      R${' '}
                      {fileParseResult.totalCalculado.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-[9px] text-muted-foreground block">
                      Preços herdados da chamada; valores do arquivo são ignorados.
                    </span>
                  </div>
                </div>

                {/* Tabela de Preview com scroll nativo e sticky header */}
                <div className="flex-1 min-h-[180px] max-h-[45vh] overflow-y-auto overflow-x-auto border rounded-lg bg-card shadow-inner overscroll-contain">
                  <Table className="border-collapse">
                    <TableHeader className="bg-muted sticky top-0 z-20 text-xs shadow-xs">
                      <TableRow>
                        <TableHead className="w-[5%] bg-muted font-semibold">Linha</TableHead>
                        <TableHead className="w-[28%] bg-muted font-semibold">
                          Produto da Planilha & Correspondência
                        </TableHead>
                        <TableHead className="w-[17%] bg-muted font-semibold">
                          Status & AKA no Contrato
                        </TableHead>
                        <TableHead className="w-[18%] text-right bg-muted font-semibold">
                          Preço da Chamada (Soberano)
                        </TableHead>
                        <TableHead className="w-[11%] text-right bg-muted font-semibold">
                          Qtd. Contratada
                        </TableHead>
                        <TableHead className="w-[11%] text-right bg-muted font-semibold">
                          Subtotal
                        </TableHead>
                        <TableHead className="w-[10%] text-right bg-muted font-semibold">
                          Ações
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fileParseResult.allRows.map((r) => {
                        const isIgnored = r.status === 'ignored'
                        const isResolved =
                          (r.resolutionType === 'linked' || r.resolutionType === 'created') &&
                          r.status === 'valid'
                        const isPendingUnmatched = Boolean(
                          r.isUnmatched && r.status !== 'valid' && !isIgnored,
                        )

                        return (
                          <TableRow
                            key={r.index}
                            className={`text-xs ${
                              isPendingUnmatched
                                ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-300/40'
                                : isIgnored
                                  ? 'opacity-50 bg-muted/20'
                                  : isResolved
                                    ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                                    : 'hover:bg-muted/10'
                            }`}
                          >
                            <TableCell className="font-mono text-muted-foreground">
                              {r.index}
                            </TableCell>

                            {/* Produto da Planilha */}
                            <TableCell>
                              {r.product ? (
                                <div className="flex flex-col">
                                  <span className="font-semibold text-foreground">
                                    {r.rawProduct !== r.product.name ? (
                                      <>
                                        {r.rawProduct} →{' '}
                                        <span className="text-primary font-bold">
                                          {r.product.name}
                                        </span>
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

                                  {isResolved && (
                                    <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                                      <CheckCircle2 className="h-3 w-3" />
                                      {r.resolutionType === 'linked'
                                        ? `Resolvido: vinculado a ${r.product.name}`
                                        : `Resolvido: novo produto mestre criado`}
                                    </span>
                                  )}

                                  {r.warnings.length > 0 && !isResolved && (
                                    <span className="text-[10px] text-amber-600">
                                      {r.warnings[0]}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="font-semibold text-foreground">
                                    {r.rawProduct || '—'}
                                  </span>
                                  <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1 mt-0.5">
                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                    {r.statusReason || 'Sem correspondência na tabela de produtos'}
                                  </span>
                                </div>
                              )}
                            </TableCell>

                            {/* Status & AKA no Contrato */}
                            <TableCell>
                              {isIgnored ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-muted-foreground border-dashed"
                                >
                                  Ignorado
                                </Badge>
                              ) : isPendingUnmatched ? (
                                <div className="space-y-1">
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-amber-500/15 text-amber-800 border-amber-300 font-medium"
                                  >
                                    Pendente de AKA
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground block">
                                    Nome planilha: <em>{r.rawProduct}</em>
                                  </span>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-300"
                                  >
                                    Pronto para importar
                                  </Badge>
                                  {r.apelidos && (
                                    <span
                                      className="text-[10px] text-muted-foreground block truncate max-w-[170px]"
                                      title={`AKA: ${r.apelidos}`}
                                    >
                                      AKA: <strong>{r.apelidos}</strong>
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>

                            {/* Preço da Chamada (Soberano) - somente leitura, formato R$ 0,00 à direita */}
                            <TableCell className="text-right font-mono text-muted-foreground">
                              R${' '}
                              {r.price.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>

                            {/* Quantidade */}
                            <TableCell className="text-right font-mono font-semibold text-primary">
                              {r.quantity} {r.product?.unit || r.rawUnidade || ''}
                            </TableCell>

                            {/* Subtotal = quantidade × preço da chamada */}
                            <TableCell className="text-right font-mono font-bold">
                              R${' '}
                              {r.subtotal.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>

                            {/* Ações por linha */}
                            <TableCell className="text-right">
                              {isIgnored ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleRestoreRow(r.index)}
                                  title="Restaurar esta linha para a lista de importação"
                                >
                                  Restaurar
                                </Button>
                              ) : isPendingUnmatched ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 text-[11px] px-2 gap-1 bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs"
                                    onClick={() => handleOpenResolveAka(r)}
                                    title="Definir AKA: associar a produto mestre existente ou criar novo"
                                  >
                                    <Sparkles className="h-3 w-3" />
                                    Definir AKA
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[11px] px-1.5 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleIgnoreRow(r.index)}
                                    title="Ignorar esta linha e não importar"
                                  >
                                    <EyeOff className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : isResolved ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[11px] px-2 gap-1 text-emerald-800 border-emerald-300 hover:bg-emerald-50"
                                  onClick={() => handleOpenResolveAka(r)}
                                  title="Alterar definição de AKA desta linha"
                                >
                                  Editar AKA
                                </Button>
                              ) : (
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  ✓
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {fileParseResult.unmatchedCount > 0 && (
                  <div className="shrink-0 flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-300 text-amber-900 text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
                    <div className="space-y-1">
                      <p className="font-semibold text-amber-950">
                        {fileParseResult.unmatchedCount} linha(s) sem correspondência na tabela de
                        produtos
                      </p>
                      <p className="text-[11px] text-amber-800">
                        Para cada produto não encontrado, clique em <strong>"Definir AKA"</strong>{' '}
                        para associá-lo a um item existente do catálogo mestre ou cadastrá-lo como
                        um novo produto na hora. Se preferir não incluir a linha, clique no ícone
                        para ignorar.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t mt-auto flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {fileParseResult && fileParseResult.unmatchedCount > 0 && (
                <span className="text-amber-700 font-medium">
                  {fileParseResult.unmatchedCount} pendência(s) precisam ser resolvidas ou ignoradas
                  para importar.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFileModalOpen(false)
                  setFileParseResult(null)
                  if (localAddedProducts.length > 0) {
                    refreshData().catch(() => {})
                    setLocalAddedProducts([])
                  }
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
                {isSubmittingImport ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Salvando no Contrato...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Confirmar Importação de {fileParseResult?.validRows.length || 0} produto(s)
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE RESOLUÇÃO DE AKA PARA LINHAS SEM CORRESPONDÊNCIA */}
      <Dialog
        open={resolveModalOpen}
        onOpenChange={(open) => {
          if (!open && !isSubmittingImport) {
            setResolveModalOpen(false)
            setResolvingRow(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col p-6">
          <DialogHeader className="shrink-0 space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-amber-600" />
              Definir AKA no Contrato para o Produto
            </DialogTitle>
            <DialogDescription className="text-xs">
              Resolva a linha da planilha associando-a a um produto mestre existente ou criando o
              produto no cadastro.
            </DialogDescription>
          </DialogHeader>

          {resolvingRow && (
            <div className="space-y-4 py-2 flex-1 overflow-y-auto">
              {/* Resumo da linha vinda da planilha */}
              <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground uppercase text-[10px] font-semibold">
                    Linha #{resolvingRow.index} da Planilha
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    Qtd: {resolvingRow.quantity} {resolvingRow.rawUnidade || 'un'} • Preço: R${' '}
                    {resolvingRow.price.toFixed(2)}
                  </Badge>
                </div>
                <div className="font-semibold text-sm text-foreground">
                  {resolvingRow.rawProduct}
                </div>
              </div>

              {/* Campo do AKA (Apelido no Contrato) */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="aka-input"
                  className="text-xs font-semibold flex items-center justify-between"
                >
                  <span>Apelido no Contrato (AKA)</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Fica salvo no item do contrato
                  </span>
                </Label>
                <Input
                  id="aka-input"
                  value={akaValue}
                  onChange={(e) => setAkaValue(e.target.value)}
                  placeholder="Nome vindo da planilha"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Sugerido como o próprio nome da planilha. Será usado para reconhecer este produto
                  em importações de pedidos/atestos para este contrato.
                </p>
              </div>

              {/* Seleção do modo de resolução */}
              <div className="space-y-2 pt-1 border-t">
                <Label className="text-xs font-semibold">Como deseja resolver este produto?</Label>
                <RadioGroup
                  value={resolutionMode}
                  onValueChange={(val) => setResolutionMode(val as 'link' | 'create')}
                  className="grid grid-cols-2 gap-2"
                >
                  <label
                    htmlFor="mode-link"
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
                      <RadioGroupItem value="link" id="mode-link" />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Associa a um produto já cadastrado no catálogo mestre.
                    </span>
                  </label>

                  <label
                    htmlFor="mode-create"
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
                      <RadioGroupItem value="create" id="mode-create" />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Cadastra o produto na tabela mestre na hora.
                    </span>
                  </label>
                </RadioGroup>
              </div>

              {/* Opção A: Vincular a Produto Existente */}
              {resolutionMode === 'link' && (
                <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                  <Label className="text-xs font-semibold">Buscar Produto Mestre do Catálogo</Label>
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                    <Input
                      placeholder="Filtrar por nome do produto..."
                      value={linkSearchTerm}
                      onChange={(e) => setLinkSearchTerm(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>

                  <div className="max-h-[160px] overflow-y-auto border rounded bg-card divide-y text-xs mt-2">
                    {filteredLinkProducts.length === 0 ? (
                      <div className="p-3 text-center text-muted-foreground text-xs">
                        Nenhum produto cadastrado encontrado com esse termo.
                      </div>
                    ) : (
                      filteredLinkProducts.map((p) => {
                        const isSelected = selectedLinkProductId === p.id
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedLinkProductId(p.id)}
                            className={`p-2 cursor-pointer flex items-center justify-between hover:bg-muted/50 transition-colors ${
                              isSelected ? 'bg-primary/10 font-semibold' : ''
                            }`}
                          >
                            <div className="flex flex-col">
                              <span className="text-foreground">{p.name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                Unidade: {p.unit || 'Kg'} • Preço padrão: R${' '}
                                {(p.price || 0).toFixed(2)}
                              </span>
                            </div>
                            {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Opção B: Criar Novo Produto na Tabela Mestre */}
              {resolutionMode === 'create' && (
                <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-product-name" className="text-xs font-semibold">
                      Nome Oficial do Produto Mestre
                    </Label>
                    <Input
                      id="new-product-name"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      placeholder="Ex: Arroz Integral"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-product-unit" className="text-xs font-semibold">
                        Unidade de Medida
                      </Label>
                      <Input
                        id="new-product-unit"
                        value={newProductUnit}
                        onChange={(e) => setNewProductUnit(e.target.value)}
                        placeholder="Kg, Un, Maco, etc."
                        className="h-8 text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="new-product-price" className="text-xs font-semibold">
                        Preço Unitário Inicial (R$)
                      </Label>
                      <Input
                        id="new-product-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={newProductInitialPrice}
                        onChange={(e) => setNewProductInitialPrice(e.target.value)}
                        placeholder="0.00"
                        className="h-8 text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Disponibilidade</Label>
                      <select
                        value={newProductDisp}
                        onChange={(e) =>
                          setNewProductDisp(e.target.value as DisponibilidadeProduto)
                        }
                        className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="normal">Normal</option>
                        <option value="abundante">Abundante</option>
                        <option value="escassez">Escassez</option>
                        <option value="indisponivel">Indisponível</option>
                      </select>
                    </div>
                  </div>
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
              disabled={isSubmittingImport}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmResolution}
              disabled={isSubmittingImport}
              className="gap-1.5 bg-primary"
            >
              {isSubmittingImport ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Salvar Resolução
                </>
              )}
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
