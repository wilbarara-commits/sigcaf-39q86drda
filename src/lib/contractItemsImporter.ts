import * as XLSX from 'xlsx'
import type { Product } from '@/lib/types'
import { normalizeName } from '@/lib/excelImporter'
import { parseCsvTextToMatrix } from '@/lib/schoolCsvImporter'

export interface ParsedContractItemRow {
  index: number
  rawProduct: string
  rawPrice: string
  rawQuantity: string
  nomeContrato?: string
  product?: Product
  matchedViaAlias?: string
  price: number
  quantity: number
  subtotal: number
  status: 'valid' | 'warning' | 'error'
  statusReason?: string
  warnings: string[]
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
 * Encontra o produto mais compatível no catálogo com suporte detalhado a apelidos (AKA)
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

  // 2. Match exato por apelido
  const exactAliasMatches: Array<{ product: Product; alias: string }> = []
  for (const p of catalogProducts) {
    if (!p.apelidos) continue
    const aliases = p.apelidos
      .split(/[,;]/)
      .map((a) => a.trim())
      .filter(Boolean)
    for (const a of aliases) {
      if (normalizeName(a) === normInput) {
        exactAliasMatches.push({ product: p, alias: a })
      }
    }
  }

  if (exactAliasMatches.length === 1) {
    return {
      product: exactAliasMatches[0].product,
      matchedViaAlias: exactAliasMatches[0].alias,
    }
  } else if (exactAliasMatches.length > 1) {
    // Conflito entre apelidos de mais de um produto
    const exactNameMatch = exactAliasMatches.find(
      (m) => normalizeName(m.product.name) === normInput,
    )
    if (exactNameMatch) {
      return { product: exactNameMatch.product }
    }
    return {
      product: undefined,
      isAmbiguous: true,
      candidateCount: exactAliasMatches.length,
    }
  }

  // 3. Match por inclusão (nome oficial ou apelidos)
  for (const p of catalogProducts) {
    const normP = normalizeName(p.name)
    if (normP.includes(normInput) || normInput.includes(normP)) {
      return { product: p }
    }
    if (p.apelidos) {
      const aliases = p.apelidos
        .split(/[,;]/)
        .map((a) => a.trim())
        .filter(Boolean)
      for (const a of aliases) {
        const normA = normalizeName(a)
        if (normA && (normA.includes(normInput) || normInput.includes(normA))) {
          return { product: p, matchedViaAlias: a }
        }
      }
    }
  }

  // 4. Match de tokens de palavras principais
  const tokens = normInput.split(/\s+/).filter((t) => t.length > 2)
  if (tokens.length > 0) {
    // 4a. Tokens no nome
    const tokenMatch = catalogProducts.find((p) => {
      const normP = normalizeName(p.name)
      return tokens.every((t) => normP.includes(t))
    })
    if (tokenMatch) return { product: tokenMatch }

    // 4b. Tokens no apelido
    for (const p of catalogProducts) {
      if (!p.apelidos) continue
      const aliases = p.apelidos
        .split(/[,;]/)
        .map((a) => a.trim())
        .filter(Boolean)
      for (const a of aliases) {
        const aTokens = normalizeName(a)
          .split(/\s+/)
          .filter((t) => t.length > 2)
        if (aTokens.length > 0 && aTokens.every((at) => tokens.includes(at))) {
          return { product: p, matchedViaAlias: a }
        }
        if (tokens.every((t) => normalizeName(a).includes(t))) {
          return { product: p, matchedViaAlias: a }
        }
      }
    }
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
} {
  let produtoIdx = -1
  let precoIdx = -1
  let quantidadeIdx = -1

  headerRow.forEach((col, idx) => {
    const norm = normalizeName(col)
    if (
      produtoIdx === -1 &&
      (norm.includes('produto') ||
        norm.includes('item') ||
        norm.includes('descricao') ||
        norm.includes('genero') ||
        norm.includes('alimento') ||
        norm.includes('nome'))
    ) {
      produtoIdx = idx
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

  return { produtoIdx, precoIdx, quantidadeIdx }
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

  if (hasHeader) {
    const indexes = findContractItemColumnIndexes(header)
    produtoIdx = indexes.produtoIdx
    precoIdx = indexes.precoIdx
    quantidadeIdx = indexes.quantidadeIdx
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
        price: 0,
        quantity: 0,
        subtotal: 0,
        status,
        statusReason,
        warnings,
      })
      return
    }

    const matchDetail = matchCatalogProductDetailed(rawProduct, catalogProducts)
    const matchedProduct = matchDetail.product

    if (!matchedProduct) {
      status = 'error'
      statusReason = matchDetail.isAmbiguous
        ? `Nome ambíguo: "${rawProduct}" coincide com o apelido de ${matchDetail.candidateCount} produtos diferentes`
        : `Produto "${rawProduct}" não encontrado no cadastro de produtos`
      unmatchedCount++
      errorCount++
      allRows.push({
        index: (hasHeader ? 2 : 1) + rowIdx,
        rawProduct,
        rawPrice,
        rawQuantity,
        price: 0,
        quantity: 0,
        subtotal: 0,
        status,
        statusReason,
        warnings,
      })
      return
    }

    // Preço
    let finalPrice = matchedProduct.price
    if (rawPrice) {
      const parsedPrice = parseBRLNumber(rawPrice)
      if (parsedPrice.isValid && parsedPrice.value >= 0) {
        finalPrice = parsedPrice.value
      } else {
        warnings.push(
          `Preço "${rawPrice}" não reconhecido; assumido valor do catálogo R$ ${matchedProduct.price.toFixed(2)}`,
        )
      }
    } else {
      warnings.push(
        `Preço omitido; assumido valor do catálogo R$ ${matchedProduct.price.toFixed(2)}`,
      )
    }

    // Quantidade contratada
    let finalQuantity = 0
    if (rawQuantity) {
      const parsedQty = parseBRLNumber(rawQuantity)
      if (parsedQty.isValid && parsedQty.value >= 0) {
        finalQuantity = parsedQty.value
      } else {
        warnings.push(`Quantidade "${rawQuantity}" não numérica; assumido 0`)
      }
    }

    const subtotal = finalPrice * finalQuantity

    allRows.push({
      index: (hasHeader ? 2 : 1) + rowIdx,
      rawProduct,
      rawPrice,
      rawQuantity,
      nomeContrato: rawProduct,
      product: matchedProduct,
      matchedViaAlias: matchDetail.matchedViaAlias,
      price: finalPrice,
      quantity: finalQuantity,
      subtotal,
      status: warnings.length > 0 ? 'warning' : 'valid',
      warnings,
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
