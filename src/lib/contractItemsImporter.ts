import * as XLSX from 'xlsx'
import type { Product } from '@/lib/types'
import { normalizeName } from '@/lib/excelImporter'
import { parseCsvTextToMatrix } from '@/lib/schoolCsvImporter'

export interface ParsedContractItemRow {
  index: number
  rawProduct: string
  rawPrice: string
  rawQuantity: string
  rawUnidade?: string
  nomeContrato?: string
  apelidos?: string
  product?: Product
  matchedViaAlias?: string
  price: number
  quantity: number
  subtotal: number
  status: 'valid' | 'warning' | 'error' | 'ignored'
  statusReason?: string
  warnings: string[]
  isUnmatched?: boolean
  resolutionType?: 'linked' | 'created'
}

export interface ContractItemsFileParseResult {
  fileName: string
  totalRows: number
  validRows: ParsedContractItemRow[]
  allRows: ParsedContractItemRow[]
  totalCalculado: number
  unmatchedCount: number
  errorCount: number
}

import { parsePtBrNumber } from '@/lib/numberParser'

/**
 * Converte valor numérico com suporte a formato brasileiro (1.234,56 ou 1234,56 ou 1234.56 ou R$ ...)
 * Reutiliza o analisador centralizado parsePtBrNumber.
 */
export function parseBRLNumber(val: any): { value: number; isValid: boolean } {
  if (val === undefined || val === null || val === '') {
    return { value: 0, isValid: false }
  }
  const result = parsePtBrNumber(val)
  return {
    value: result.value,
    isValid: result.isValid && !result.isEmpty,
  }
}

/**
 * Encontra o produto mais compatível no catálogo mestre.
 * Produtos mestre não possuem apelidos (apelidos residem exclusivamente em contrato_itens).
 */
export function matchCatalogProductDetailed(
  rawName: string,
  catalogProducts: Product[],
): {
  product: Product | undefined
  matchedViaAlias?: string
  isAmbiguous?: boolean
  candidateCount?: number
} {
  if (!rawName) return { product: undefined }
  const normInput = normalizeName(rawName)
  if (!normInput) return { product: undefined }

  // 1. Match exato normalizado pelo nome oficial
  const exact = catalogProducts.find((p) => normalizeName(p.name) === normInput)
  if (exact) return { product: exact }

  // 2. Match por inclusão no nome oficial
  for (const p of catalogProducts) {
    const normP = normalizeName(p.name)
    if (normP.includes(normInput) || normInput.includes(normP)) {
      return { product: p }
    }
  }

  // 3. Match de tokens de palavras principais no nome oficial
  const tokens = normInput.split(/\s+/).filter((t) => t.length > 2)
  if (tokens.length > 0) {
    const tokenMatch = catalogProducts.find((p) => {
      const normP = normalizeName(p.name)
      return tokens.every((t) => normP.includes(t))
    })
    if (tokenMatch) return { product: tokenMatch }
  }

  return { product: undefined }
}

/**
 * Encontra o produto mais compatível no catálogo (compatibilidade com chamadas simples)
 */
export function matchCatalogProduct(
  rawName: string,
  catalogProducts: Product[],
): Product | undefined {
  return matchCatalogProductDetailed(rawName, catalogProducts).product
}

/**
 * Detecta os índices de coluna em um cabeçalho
 */
function findContractItemColumnIndexes(headerRow: string[]): {
  produtoIdx: number
  precoIdx: number
  quantidadeIdx: number
  unidadeIdx: number
} {
  let produtoIdx = -1
  let precoIdx = -1
  let quantidadeIdx = -1
  let unidadeIdx = -1

  headerRow.forEach((col, idx) => {
    const norm = normalizeName(col)
    if (
      unidadeIdx === -1 &&
      (norm === 'unidade' ||
        norm === 'un' ||
        norm === 'und' ||
        norm.includes('unidade de medida') ||
        norm === 'medida')
    ) {
      unidadeIdx = idx
    } else if (
      precoIdx === -1 &&
      (norm.includes('preco') ||
        norm.includes('unitario') ||
        norm.includes('valor') ||
        norm === 'r$')
    ) {
      precoIdx = idx
    } else if (
      quantidadeIdx === -1 &&
      (norm.includes('quantidade') ||
        norm.includes('qtd') ||
        norm.includes('quant') ||
        norm.includes('cota') ||
        norm.includes('volume'))
    ) {
      quantidadeIdx = idx
    } else if (
      produtoIdx === -1 &&
      (norm.includes('produto') ||
        norm.includes('item') ||
        norm.includes('descricao') ||
        norm.includes('genero') ||
        norm.includes('alimento') ||
        norm.includes('nome'))
    ) {
      produtoIdx = idx
    }
  })

  // Se não encontrou cabeçalhos explícitos mas tem colunas suficientes, assume padrão 0=produto, 1=preço ou quantidade
  if (produtoIdx === -1) produtoIdx = 0
  if (precoIdx === -1) {
    precoIdx = headerRow.length > 1 ? 1 : -1
  }
  if (quantidadeIdx === -1) {
    quantidadeIdx = headerRow.length > 2 ? 2 : -1
  }

  return { produtoIdx, precoIdx, quantidadeIdx, unidadeIdx }
}

/**
 * Faz o parse de arquivo CSV ou XLSX com itens do contrato (produto + preço + quantidade contratada)
 */
export async function parseContractItemsFile(
  file: File,
  catalogProducts: Product[],
): Promise<ContractItemsFileParseResult> {
  let rawMatrix: string[][] = []

  const isExcel =
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'

  if (isExcel) {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      throw new Error('Arquivo de planilha não contém nenhuma aba.')
    }
    const worksheet = workbook.Sheets[firstSheetName]
    const sheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
    rawMatrix = sheetData.map((row) => row.map((cell) => String(cell ?? '').trim()))
  } else {
    const text = await file.text()
    rawMatrix = parseCsvTextToMatrix(text)
  }

  if (rawMatrix.length === 0) {
    throw new Error('O arquivo selecionado está vazio.')
  }

  const header = rawMatrix[0]
  // Detecta se a primeira linha é cabeçalho ou já são dados
  const firstColNorm = normalizeName(header[0] || '')
  const hasHeader =
    firstColNorm.includes('produto') ||
    firstColNorm.includes('item') ||
    firstColNorm.includes('descricao') ||
    firstColNorm.includes('nome')

  let dataRows: string[][]
  let produtoIdx = 0
  let precoIdx = 1
  let quantidadeIdx = 2
  let unidadeIdx = -1

  if (hasHeader) {
    const indexes = findContractItemColumnIndexes(header)
    produtoIdx = indexes.produtoIdx
    precoIdx = indexes.precoIdx
    quantidadeIdx = indexes.quantidadeIdx
    unidadeIdx = indexes.unidadeIdx
    dataRows = rawMatrix.slice(1)
  } else {
    dataRows = rawMatrix
  }

  const allRows: ParsedContractItemRow[] = []
  let unmatchedCount = 0
  let errorCount = 0

  dataRows.forEach((row, rowIdx) => {
    // Ignorar linhas em branco
    if (row.every((c) => !c || c.trim() === '')) return

    const rawProduct = row[produtoIdx] !== undefined ? String(row[produtoIdx]).trim() : ''
    const rawPrice =
      precoIdx >= 0 && row[precoIdx] !== undefined ? String(row[precoIdx]).trim() : ''
    const rawQuantity =
      quantidadeIdx >= 0 && row[quantidadeIdx] !== undefined
        ? String(row[quantidadeIdx]).trim()
        : ''
    const rawUnidade =
      unidadeIdx >= 0 && row[unidadeIdx] !== undefined ? String(row[unidadeIdx]).trim() : undefined

    const warnings: string[] = []
    let status: ParsedContractItemRow['status'] = 'valid'
    let statusReason: string | undefined

    if (!rawProduct) {
      status = 'error'
      statusReason = 'Nome do produto não informado nesta linha'
      errorCount++
      allRows.push({
        index: (hasHeader ? 2 : 1) + rowIdx,
        rawProduct,
        rawPrice,
        rawQuantity,
        rawUnidade,
        price: 0,
        quantity: 0,
        subtotal: 0,
        status,
        statusReason,
        warnings,
      })
      return
    }

    // Preço e quantidade podem ser analisados mesmo sem match imediato
    let parsedPriceVal = 0
    let hasPrice = false
    if (rawPrice) {
      const parsedPrice = parseBRLNumber(rawPrice)
      if (parsedPrice.isValid && parsedPrice.value >= 0) {
        parsedPriceVal = parsedPrice.value
        hasPrice = true
      }
    }

    let parsedQuantityVal = 0
    if (rawQuantity) {
      const parsedQty = parseBRLNumber(rawQuantity)
      if (parsedQty.isValid && parsedQty.value >= 0) {
        parsedQuantityVal = parsedQty.value
      } else {
        warnings.push(`Quantidade "${rawQuantity}" não numérica; assumido 0`)
      }
    }

    const matchDetail = matchCatalogProductDetailed(rawProduct, catalogProducts)
    const matchedProduct = matchDetail.product

    if (!matchedProduct) {
      status = 'warning'
      statusReason = matchDetail.isAmbiguous
        ? `Nome ambíguo: "${rawProduct}" coincide com o apelido de ${matchDetail.candidateCount} produtos diferentes`
        : `Produto sem correspondência na tabela de produtos cadastrados`
      unmatchedCount++
      const subtotal = parsedPriceVal * parsedQuantityVal
      allRows.push({
        index: (hasHeader ? 2 : 1) + rowIdx,
        rawProduct,
        rawPrice,
        rawQuantity,
        rawUnidade,
        nomeContrato: rawProduct,
        apelidos: rawProduct,
        price: parsedPriceVal,
        quantity: parsedQuantityVal,
        subtotal,
        status,
        statusReason,
        warnings,
        isUnmatched: true,
      })
      return
    }

    // Preço
    let finalPrice = matchedProduct.price || 0
    if (hasPrice) {
      finalPrice = parsedPriceVal
    } else if (rawPrice) {
      warnings.push(
        `Preço "${rawPrice}" não reconhecido; assumido valor do catálogo R$ ${(matchedProduct.price ?? 0).toFixed(2)}`,
      )
    } else {
      warnings.push(
        `Preço omitido; assumido valor do catálogo R$ ${(matchedProduct.price ?? 0).toFixed(2)}`,
      )
    }

    const subtotal = finalPrice * parsedQuantityVal

    allRows.push({
      index: (hasHeader ? 2 : 1) + rowIdx,
      rawProduct,
      rawPrice,
      rawQuantity,
      rawUnidade,
      nomeContrato: rawProduct,
      apelidos: rawProduct !== matchedProduct.name ? rawProduct : '',
      product: matchedProduct,
      matchedViaAlias: matchDetail.matchedViaAlias,
      price: finalPrice,
      quantity: parsedQuantityVal,
      subtotal,
      status: warnings.length > 0 ? 'warning' : 'valid',
      warnings,
      isUnmatched: false,
    })
  })

  const validRows = allRows.filter((r) => r.status === 'valid' || r.status === 'warning')
  const totalCalculado = validRows.reduce((acc, r) => acc + r.subtotal, 0)

  return {
    fileName: file.name,
    totalRows: allRows.length,
    validRows,
    allRows,
    totalCalculado,
    unmatchedCount,
    errorCount,
  }
}
