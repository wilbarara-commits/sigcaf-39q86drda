import { normalizeName } from '@/lib/excelImporter'
import { parseCsvTextToMatrix } from '@/lib/schoolCsvImporter'
import type { Product } from '@/lib/types'
import * as XLSX from 'xlsx'

export type ProdutoDisponibilidade = 'normal' | 'escassez' | 'abundancia'

export const DEFAULT_PRODUCT_UNIT = 'kg'
export const DEFAULT_PRODUCT_CATEGORY = 'Geral'
export const BASE_PRODUCT_CATEGORIES = [
  'Hortaliças',
  'Legumes',
  'Frutas',
  'Grãos',
  'Tubérculos',
  'Polpas e Sucos',
  'Laticínios',
  'Panifícios',
  'Outros',
]

export function areCategoriesEqual(catA?: string | null, catB?: string | null): boolean {
  if (!catA && !catB) return true
  if (!catA || !catB) return false
  return catA.trim().toLowerCase() === catB.trim().toLowerCase()
}

export interface ProductFieldChange {
  field: 'unidade' | 'disponibilidade'
  label: string
  oldValue: string
  newValue: string
}

export interface ParsedCsvProductRow {
  index: number // 1-based, considerando cabeçalho na linha 1
  rawNome: string
  rawUnidade: string
  rawDisponibilidade: string

  // Campos mapeados e normalizados finais (com defaults aplicados para novos ou preservados para existentes)
  nome: string
  unidade: string
  disponibilidade: ProdutoDisponibilidade

  // Qual colunas vieram presentes/preenchidas na linha
  presentColumns: {
    unidade: boolean
    disponibilidade: boolean
  }

  // Se existente no banco
  existingProductId?: string
  existingProductName?: string
  matchedViaAlias?: string
  isAmbiguous?: boolean
  fieldChanges: ProductFieldChange[]

  // Status de validação e destino
  // - 'create': Novo produto com defaults aplicados onde estiver em branco
  // - 'update': Produto existente com atualização seletiva das colunas informadas
  // - 'duplicate_file': Linha repetida no próprio arquivo/texto colado
  // - 'error': Nome inválido ou em branco
  status: 'create' | 'update' | 'duplicate_file' | 'error'
  statusReason?: string
  warnings: string[]
}

export interface ProductCsvParseResult {
  fileName: string
  totalRows: number
  createdRows: ParsedCsvProductRow[]
  updatedRows: ParsedCsvProductRow[]
  processableRows: ParsedCsvProductRow[]
  duplicateFileRows: ParsedCsvProductRow[]
  errorRows: ParsedCsvProductRow[]
  allRows: ParsedCsvProductRow[]
}

/**
 * Limpa a unidade informada preservando estritamente o case original e sem transformações:
 * se o arquivo traz "kg", grava "kg"; se traz "Dúzia", grava "Dúzia"; se traz "dz", grava "dz".
 * Apenas aplica trim dos espaços nas bordas.
 */
export function normalizeProdutoUnidade(rawUnidade: string): {
  unidade: string
  isRecognized: boolean
} {
  const trimmed = rawUnidade ? rawUnidade.trim() : ''
  return {
    unidade: trimmed,
    isRecognized: Boolean(trimmed),
  }
}

/**
 * Remove sufixos comuns de plural em português ('es', 's') para termos individuais,
 * preservando palavras curtas (<= 3 caracteres) para evitar falsos positivos.
 */
export function stripPortuguesePluralWord(word: string): string {
  if (word.length <= 3) return word
  if (word.length > 4 && word.endsWith('es')) {
    const base = word.slice(0, -2)
    if (/[rzln]$/.test(base)) {
      return base
    }
    return word.slice(0, -1)
  }
  if (word.endsWith('s')) {
    return word.slice(0, -1)
  }
  return word
}

/**
 * Normaliza um nome de produto para forma despluralizada (termo a termo).
 */
export function dePluralizeName(normName: string): string {
  if (!normName) return ''
  return normName.split(/\s+/).filter(Boolean).map(stripPortuguesePluralWord).join(' ')
}

/**
 * Normaliza a disponibilidade:
 * 'normal' | 'escassez' | 'abundancia'
 */
export function normalizeDisponibilidade(val: string): {
  disponibilidade: ProdutoDisponibilidade
  isSpecified: boolean
} {
  const trimmed = val ? val.trim() : ''
  if (!trimmed) {
    return { disponibilidade: 'normal', isSpecified: false }
  }
  const norm = normalizeName(trimmed)
  if (norm.includes('escassez') || norm.includes('falta') || norm.includes('baixo')) {
    return { disponibilidade: 'escassez', isSpecified: true }
  }
  if (
    norm.includes('abundancia') ||
    norm.includes('alta') ||
    norm.includes('excesso') ||
    norm.includes('safra')
  ) {
    return { disponibilidade: 'abundancia', isSpecified: true }
  }
  return { disponibilidade: 'normal', isSpecified: true }
}

/**
 * Mapeia cabeçalhos para os índices correspondentes das colunas:
 * nome, unidade, disponibilidade
 */
function findColumnIndexes(headerRow: string[]): {
  nomeIdx: number
  unidadeIdx: number
  disponibilidadeIdx: number
} {
  let nomeIdx = -1
  let unidadeIdx = -1
  let disponibilidadeIdx = -1

  headerRow.forEach((col, idx) => {
    const norm = normalizeName(col)

    if (
      nomeIdx === -1 &&
      (norm === 'nome' ||
        norm.includes('produto') ||
        norm.includes('item') ||
        norm.includes('descricao'))
    ) {
      nomeIdx = idx
    } else if (
      unidadeIdx === -1 &&
      (norm === 'unidade' || norm === 'un' || norm.includes('medida') || norm === 'und')
    ) {
      unidadeIdx = idx
    } else if (
      disponibilidadeIdx === -1 &&
      (norm === 'disponibilidade' ||
        norm.includes('disp') ||
        norm.includes('safra') ||
        norm.includes('status'))
    ) {
      disponibilidadeIdx = idx
    }
  })

  // Se não achou por nome flexível e tiver posições padrão
  if (nomeIdx === -1 && headerRow.length >= 1) nomeIdx = 0
  if (unidadeIdx === -1 && headerRow.length >= 2) unidadeIdx = 1
  if (disponibilidadeIdx === -1 && headerRow.length >= 3) disponibilidadeIdx = 2

  return {
    nomeIdx,
    unidadeIdx,
    disponibilidadeIdx,
  }
}

export interface ParseProductsOptions {
  fileOrText: File | string
  fileName?: string
  existingProducts: Product[]
}

/**
 * Executa o parsing e validação de produtos a partir de arquivo CSV/XLSX ou texto colado.
 */
export async function parseProductsInput(
  options: ParseProductsOptions,
): Promise<ProductCsvParseResult> {
  const { fileOrText, fileName = 'dados_colados', existingProducts } = options

  let rawMatrix: string[][] = []

  if (typeof fileOrText === 'string') {
    rawMatrix = parseCsvTextToMatrix(fileOrText)
  } else {
    const isExcel =
      fileOrText.name.endsWith('.xlsx') ||
      fileOrText.name.endsWith('.xls') ||
      fileOrText.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      fileOrText.type === 'application/vnd.ms-excel'

    if (isExcel) {
      const buffer = await fileOrText.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      if (!firstSheetName) {
        throw new Error('Arquivo de planilha não contém nenhuma aba.')
      }
      const worksheet = workbook.Sheets[firstSheetName]
      const sheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
      rawMatrix = sheetData.map((row) => row.map((cell) => String(cell ?? '').trim()))
    } else {
      const text = await fileOrText.text()
      rawMatrix = parseCsvTextToMatrix(text)
    }
  }

  if (rawMatrix.length === 0) {
    throw new Error('Nenhum dado encontrado para importar.')
  }

  const header = rawMatrix[0]
  const { nomeIdx, unidadeIdx, disponibilidadeIdx } = findColumnIndexes(header)

  const dataRows = rawMatrix.slice(1)
  if (dataRows.length === 0) {
    throw new Error('O arquivo contém apenas a linha de cabeçalho, sem dados de produtos.')
  }

  // Mapear produtos cadastrados existentes no banco por nome normalizado
  const masterByNorm = new Map<string, Product>()
  const masterByDePlural = new Map<string, Product>()
  const masterByAlias = new Map<string, Array<{ product: Product; alias: string }>>()
  const masterByAliasDePlural = new Map<string, Array<{ product: Product; alias: string }>>()

  for (const p of existingProducts) {
    const n = normalizeName(p.name)
    if (n) {
      if (!masterByNorm.has(n)) {
        masterByNorm.set(n, p)
      }
      const deplural = dePluralizeName(n)
      if (deplural && !masterByDePlural.has(deplural)) {
        masterByDePlural.set(deplural, p)
      }
    }

    if (p.apelidos) {
      const aliases = p.apelidos
        .split(/[,;]/)
        .map((a) => a.trim())
        .filter(Boolean)
      for (const a of aliases) {
        const aNorm = normalizeName(a)
        if (aNorm) {
          const list = masterByAlias.get(aNorm) || []
          list.push({ product: p, alias: a })
          masterByAlias.set(aNorm, list)

          const aDeplural = dePluralizeName(aNorm)
          if (aDeplural) {
            const depList = masterByAliasDePlural.get(aDeplural) || []
            depList.push({ product: p, alias: a })
            masterByAliasDePlural.set(aDeplural, depList)
          }
        }
      }
    }
  }

  // Rastrear duplicidades dentro do próprio arquivo/colagem
  const seenInFile = new Map<string, number>()
  const allRows: ParsedCsvProductRow[] = []

  dataRows.forEach((row, rowIdx) => {
    // Ignorar linhas totalmente vazias
    if (row.every((c) => !c || c.trim() === '')) return

    const rawNome = nomeIdx !== -1 && row[nomeIdx] !== undefined ? String(row[nomeIdx]).trim() : ''
    const rawUnidade =
      unidadeIdx !== -1 && row[unidadeIdx] !== undefined ? String(row[unidadeIdx]).trim() : ''
    const rawDisponibilidade =
      disponibilidadeIdx !== -1 && row[disponibilidadeIdx] !== undefined
        ? String(row[disponibilidadeIdx]).trim()
        : ''

    const warnings: string[] = []
    const fieldChanges: ProductFieldChange[] = []

    // 1. Validação do Nome
    if (!rawNome) {
      allRows.push({
        index: rowIdx + 2,
        rawNome,
        rawUnidade,
        rawDisponibilidade,
        nome: '',
        unidade: DEFAULT_PRODUCT_UNIT,
        disponibilidade: 'normal',
        presentColumns: {
          unidade: false,
          disponibilidade: false,
        },
        fieldChanges: [],
        status: 'error',
        statusReason: 'Nome do produto em branco ou inválido na linha.',
        warnings,
      })
      return
    }

    const normNome = normalizeName(rawNome)

    // 2. Duplicidade dentro do mesmo arquivo
    if (seenInFile.has(normNome)) {
      allRows.push({
        index: rowIdx + 2,
        rawNome,
        rawUnidade,
        rawDisponibilidade,
        nome: rawNome,
        unidade: rawUnidade ? rawUnidade.trim() : DEFAULT_PRODUCT_UNIT,
        disponibilidade: 'normal',
        presentColumns: {
          unidade: Boolean(rawUnidade),
          disponibilidade: Boolean(rawDisponibilidade),
        },
        fieldChanges: [],
        status: 'duplicate_file',
        statusReason: `Duplicado no próprio arquivo (já apareceu na linha ${seenInFile.get(normNome)}).`,
        warnings,
      })
      return
    } else {
      seenInFile.set(normNome, rowIdx + 2)
    }

    // Identificar se o produto já existe no banco de dados
    let existingMaster = masterByNorm.get(normNome)
    let matchedViaAlias: string | undefined
    let isAmbiguous = false

    if (!existingMaster) {
      const aliasMatches = masterByAlias.get(normNome)
      if (aliasMatches && aliasMatches.length > 0) {
        if (aliasMatches.length === 1) {
          existingMaster = aliasMatches[0].product
          matchedViaAlias = aliasMatches[0].alias
        } else {
          const exactNameInConflict = aliasMatches.find(
            (m) => normalizeName(m.product.name) === normNome,
          )
          if (exactNameInConflict) {
            existingMaster = exactNameInConflict.product
          } else {
            isAmbiguous = true
            warnings.push(
              `Nome ambíguo: "${rawNome}" coincide com o apelido de ${aliasMatches.length} produtos diferentes (${aliasMatches.map((m) => m.product.name).join(', ')}). Será criado como novo produto.`,
            )
          }
        }
      }
    }

    if (!existingMaster && !isAmbiguous) {
      const depluralInput = dePluralizeName(normNome)
      if (depluralInput) {
        existingMaster = masterByDePlural.get(depluralInput)
        if (!existingMaster) {
          const aliasDepMatches = masterByAliasDePlural.get(depluralInput)
          if (aliasDepMatches && aliasDepMatches.length === 1) {
            existingMaster = aliasDepMatches[0].product
            matchedViaAlias = aliasDepMatches[0].alias
          }
        }
      }
    }
    const isExisting = Boolean(existingMaster)

    const hasRawUnidade = Boolean(rawUnidade)
    const hasRawDisponibilidade = Boolean(rawDisponibilidade)

    const presentColumns = {
      unidade: hasRawUnidade,
      disponibilidade: hasRawDisponibilidade,
    }

    // Unidade
    let finalUnidade = DEFAULT_PRODUCT_UNIT
    if (hasRawUnidade) {
      const trimmedUnit = rawUnidade.trim()
      finalUnidade =
        trimmedUnit ||
        (isExisting ? existingMaster!.unit || DEFAULT_PRODUCT_UNIT : DEFAULT_PRODUCT_UNIT)
    } else {
      if (isExisting) {
        finalUnidade = existingMaster!.unit || DEFAULT_PRODUCT_UNIT
      } else {
        finalUnidade = DEFAULT_PRODUCT_UNIT
      }
    }

    // Disponibilidade
    let finalDisponibilidade: ProdutoDisponibilidade = 'normal'
    if (hasRawDisponibilidade) {
      const normDisp = normalizeDisponibilidade(rawDisponibilidade)
      finalDisponibilidade = normDisp.disponibilidade
    } else {
      if (isExisting) {
        finalDisponibilidade = existingMaster!.disponibilidade || 'normal'
      } else {
        finalDisponibilidade = 'normal'
      }
    }

    // Se existente, calcular fieldChanges
    if (isExisting && existingMaster) {
      if (hasRawUnidade && finalUnidade !== existingMaster.unit) {
        fieldChanges.push({
          field: 'unidade',
          label: 'Unidade',
          oldValue: existingMaster.unit || '(vazio)',
          newValue: finalUnidade,
        })
      }
      if (hasRawDisponibilidade && finalDisponibilidade !== existingMaster.disponibilidade) {
        fieldChanges.push({
          field: 'disponibilidade',
          label: 'Disponibilidade',
          oldValue: existingMaster.disponibilidade || 'normal',
          newValue: finalDisponibilidade,
        })
      }
    }

    const status: ParsedCsvProductRow['status'] = isExisting ? 'update' : 'create'
    let statusReason: string

    if (isExisting) {
      const aliasNote = matchedViaAlias ? ` (via apelido "${matchedViaAlias}")` : ''
      if (fieldChanges.length > 0) {
        const changedNames = fieldChanges.map((f) => f.label).join(', ')
        statusReason = `Produto existente${aliasNote}; atualizará: ${changedNames}.`
      } else {
        statusReason = `Produto existente${aliasNote}; dados no arquivo idênticos aos já cadastrados.`
      }
    } else if (isAmbiguous) {
      statusReason =
        'Nome ambíguo com múltiplos produtos cadastrados; será criado como novo produto.'
    } else {
      const defaultsApplied: string[] = []
      if (!hasRawUnidade) defaultsApplied.push(`unidade "${DEFAULT_PRODUCT_UNIT}"`)
      if (!hasRawDisponibilidade) defaultsApplied.push('disponibilidade "Normal"')

      if (defaultsApplied.length > 0) {
        statusReason = `Novo produto com defaults aplicados (${defaultsApplied.join(', ')}).`
      } else {
        statusReason = 'Novo produto pronto para cadastro.'
      }
    }

    allRows.push({
      index: rowIdx + 2,
      rawNome,
      rawUnidade,
      rawDisponibilidade,
      nome: rawNome,
      unidade: finalUnidade,
      disponibilidade: finalDisponibilidade,
      presentColumns,
      existingProductId: existingMaster?.id,
      existingProductName: existingMaster?.name,
      matchedViaAlias,
      isAmbiguous,
      fieldChanges,
      status,
      statusReason,
      warnings,
    })
  })

  const createdRows = allRows.filter((r) => r.status === 'create')
  const updatedRows = allRows.filter((r) => r.status === 'update')
  const processableRows = allRows.filter((r) => r.status === 'create' || r.status === 'update')
  const duplicateFileRows = allRows.filter((r) => r.status === 'duplicate_file')
  const errorRows = allRows.filter((r) => r.status === 'error')

  return {
    fileName: typeof fileOrText === 'string' ? fileName : fileOrText.name,
    totalRows: allRows.length,
    createdRows,
    updatedRows,
    processableRows,
    duplicateFileRows,
    errorRows,
    allRows,
  }
}

/**
 * Função de conveniência mantida para compatibilidade direta com chamadas legadas
 */
export async function parseProductsFile(
  file: File,
  existingMasterProducts: Array<{ id: string; name: string } | Product>,
): Promise<ProductCsvParseResult> {
  const fullProducts: Product[] = existingMasterProducts.map((p) => {
    return {
      id: p.id,
      name: (p as any).name || (p as any).nome || '',
      unit: (p as any).unit || DEFAULT_PRODUCT_UNIT,
      disponibilidade: (p as any).disponibilidade || 'normal',
    }
  })

  return parseProductsInput({
    fileOrText: file,
    fileName: file.name,
    existingProducts: fullProducts,
  })
}
