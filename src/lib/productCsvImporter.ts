import { normalizeName } from '@/lib/excelImporter'
import { parseCsvTextToMatrix } from '@/lib/schoolCsvImporter'
import { parsePtBrNumber } from '@/lib/numberParser'
import type { Product } from '@/lib/types'
import * as XLSX from 'xlsx'

export type ProdutoCategoria = string
export type ProdutoDisponibilidade = 'normal' | 'escassez' | 'abundancia'

export const DEFAULT_PRODUCT_UNIT = 'kg'
export const DEFAULT_PRODUCT_CATEGORY = 'Hortaliças'

export const BASE_PRODUCT_CATEGORIES = [
  'Hortaliças',
  'Frutas',
  'Grãos',
  'Legumes',
  'Folhosas',
  'Ovos',
  'Tubérculos',
  'Outros',
] as const

export interface ProductFieldChange {
  field: 'categoria' | 'unidade' | 'estoque' | 'preco_unitario' | 'disponibilidade'
  label: string
  oldValue: string
  newValue: string
}

export interface ParsedCsvProductRow {
  index: number // 1-based, considerando cabeçalho na linha 1
  rawNome: string
  rawCategoria: string
  rawUnidade: string
  rawEstoque: string
  rawPreco: string
  rawDisponibilidade: string

  // Campos mapeados e normalizados finais (com defaults aplicados para novos ou preservados para existentes)
  nome: string
  categoria: ProdutoCategoria
  unidade: string
  estoque: number
  preco_unitario: number
  disponibilidade: ProdutoDisponibilidade

  // Qual colunas vieram presentes/preenchidas na linha
  presentColumns: {
    categoria: boolean
    unidade: boolean
    estoque: boolean
    preco: boolean
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
 * Normaliza e preserva a categoria informada na planilha:
 * - O texto da planilha é aceito e gravado preservando rigorosamente o case (apenas trim das bordas).
 *   Ex.: "folhosas" grava "folhosas", "Folhosas" grava "Folhosas", "tuberculos" grava "tuberculos".
 * - NENHUMA categoria válida informada no arquivo é remapeada para "Outras".
 * - A comparação para igualdade/consolidação é tolerante a acentos e maiúsculas:
 *   "tuberculos" = "Tubérculos" = "TUBERCULOS".
 */
export function normalizeProdutoCategoria(rawCategoria: string): {
  categoria: string
  isExactOrMapped: boolean
} {
  const trimmed = rawCategoria ? rawCategoria.trim() : ''
  if (!trimmed) {
    return { categoria: '', isExactOrMapped: false }
  }

  return {
    categoria: trimmed,
    isExactOrMapped: true,
  }
}

/**
 * Compara duas categorias de produto com tolerância total a acentos, maiúsculas e espaços extras.
 * Ex: "tuberculos" == "Tubérculos" == "TUBERCULOS" -> true
 */
export function areCategoriesEqual(catA?: string | null, catB?: string | null): boolean {
  if (!catA && !catB) return true
  if (!catA || !catB) return false
  return normalizeName(catA.trim()) === normalizeName(catB.trim())
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
 * preservando palavras curtas (<= 3 caracteres) para evitar falsos positivos
 * (ex: 'gas' -> não mexer, 'mes' -> não mexer).
 * Ex: "ovos caipiras" -> "ovo caipira", "laranjas" -> "laranja", "tomates" -> "tomate".
 */
export function stripPortuguesePluralWord(word: string): string {
  if (word.length <= 3) return word
  // 'es' no final de palavras com > 4 letras (ex: 'limoes' -> cuidado com nasal, mas 'abacates' termina em 's')
  // No português geral: 'es' após 'r'/'z'/'l'/'s' (ex: colheres -> colher, flores -> flor)
  if (word.length > 4 && word.endsWith('es')) {
    const base = word.slice(0, -2)
    // Se a base termina em consoante típica de plural em -es (r, z, l, n):
    if (/[rzln]$/.test(base)) {
      return base
    }
    // Caso termine em vogal + 's' como 'tomates' -> tira apenas 's' -> 'tomate'
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
 * Normaliza o campo essencial (booleano) mantido para compatibilidade se invocado externamente
 */
export function parseEssencialField(val: string): boolean {
  if (!val) return false
  const s = normalizeName(val)
  return s === 'true' || s === 'sim' || s === 's' || s === '1' || s === 'verdadeiro' || s === 'v'
}

/**
 * Normaliza a disponibilidade:
 * 'normal' | 'escassez' | 'abundancia'
 * Tolerante a acentuação e maiúsculas. Se em branco ou desconhecido retorna null / normal.
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
  if (norm.includes('normal') || norm.includes('regular') || norm.includes('medio')) {
    return { disponibilidade: 'normal', isSpecified: true }
  }
  return { disponibilidade: 'normal', isSpecified: true }
}

/**
 * Converte string de preço ou número em float numérico no formato pt-BR.
 * Documentada a heurística no módulo numberParser.
 */
export function parseNumberField(val: string): {
  value: number
  isValid: boolean
  isEmpty: boolean
} {
  const res = parsePtBrNumber(val)
  return {
    value: res.value,
    isValid: res.isValid,
    isEmpty: res.isEmpty,
  }
}

/**
 * Mapeia cabeçalhos para os índices correspondentes das colunas:
 * nome, categoria, unidade, estoque, preco_unitario, disponibilidade
 */
function findColumnIndexes(headerRow: string[]): {
  nomeIdx: number
  categoriaIdx: number
  unidadeIdx: number
  estoqueIdx: number
  precoIdx: number
  disponibilidadeIdx: number
} {
  let nomeIdx = -1
  let categoriaIdx = -1
  let unidadeIdx = -1
  let estoqueIdx = -1
  let precoIdx = -1
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
      categoriaIdx === -1 &&
      (norm === 'categoria' ||
        norm.includes('cat') ||
        norm.includes('grupo') ||
        norm.includes('tipo'))
    ) {
      categoriaIdx = idx
    } else if (
      unidadeIdx === -1 &&
      (norm === 'unidade' || norm === 'un' || norm.includes('medida') || norm === 'und')
    ) {
      unidadeIdx = idx
    } else if (
      estoqueIdx === -1 &&
      (norm === 'estoque' ||
        norm.includes('qtd') ||
        norm.includes('quantidade') ||
        norm === 'saldo')
    ) {
      estoqueIdx = idx
    } else if (
      precoIdx === -1 &&
      (norm === 'preco' ||
        norm === 'preco unitario' ||
        norm.includes('preco') ||
        norm.includes('valor') ||
        norm.includes('custo'))
    ) {
      precoIdx = idx
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
  // [nome, categoria, unidade, estoque, preco_unitario, disponibilidade]
  if (nomeIdx === -1 && headerRow.length >= 1) nomeIdx = 0
  if (categoriaIdx === -1 && headerRow.length >= 2) categoriaIdx = 1
  if (unidadeIdx === -1 && headerRow.length >= 3) unidadeIdx = 2
  if (estoqueIdx === -1 && headerRow.length >= 4) estoqueIdx = 3
  if (precoIdx === -1 && headerRow.length >= 5) precoIdx = 4
  if (disponibilidadeIdx === -1 && headerRow.length >= 6) disponibilidadeIdx = 5

  return {
    nomeIdx,
    categoriaIdx,
    unidadeIdx,
    estoqueIdx,
    precoIdx,
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
 *
 * Aplica rigorosamente:
 * REGRA 1 — NÚMEROS EM FORMATO BRASILEIRO (pt-BR):
 * - Decimais com vírgula, milhares com ponto ("1.250,50" -> 1250.50, "12,5" -> 12.5, "R$ 8,00" -> 8.00, "1.250" -> 1250)
 * - Valores inválidos viram avisos/pendências na linha sem quebrar a importação.
 *
 * REGRA 2 — IMPORTAÇÃO DE LISTA DE PRODUTOS COM ATUALIZAÇÃO SELETIVA:
 * - Matching por nome normalizado (tolerante a acentos e maiúsculas).
 * - PRODUTO EXISTENTE: cada coluna presente e não em branco na linha atualiza o respectivo campo;
 *   coluna em branco mantém o valor gravado no registro existente.
 *   Gera fieldChanges para o preview detalhado.
 * - PRODUTO NOVO: colunas preenchidas usam o valor da linha; colunas em branco assumem os defaults:
 *   categoria "Hortaliças", disponibilidade "normal" (Normal), estoque 0, unidade "kg", preço unitário 0.
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
  const { nomeIdx, categoriaIdx, unidadeIdx, estoqueIdx, precoIdx, disponibilidadeIdx } =
    findColumnIndexes(header)

  const dataRows = rawMatrix.slice(1)
  if (dataRows.length === 0) {
    throw new Error('O arquivo contém apenas a linha de cabeçalho, sem dados de produtos.')
  }

  // Mapear produtos cadastrados existentes no banco por nome normalizado
  // 1. Mapa com match exato normalizado (prioritário)
  const masterByNorm = new Map<string, Product>()
  // 2. Mapa secundário com despluralização (fallback para tolerância singular/plural)
  const masterByDePlural = new Map<string, Product>()
  // 3. Mapa de apelidos normalizados (aliasNorm -> list of { product, aliasOriginal })
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
    const rawCategoria =
      categoriaIdx !== -1 && row[categoriaIdx] !== undefined ? String(row[categoriaIdx]).trim() : ''
    const rawUnidade =
      unidadeIdx !== -1 && row[unidadeIdx] !== undefined ? String(row[unidadeIdx]).trim() : ''
    const rawEstoque =
      estoqueIdx !== -1 && row[estoqueIdx] !== undefined ? String(row[estoqueIdx]).trim() : ''
    const rawPreco =
      precoIdx !== -1 && row[precoIdx] !== undefined ? String(row[precoIdx]).trim() : ''
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
        rawCategoria,
        rawUnidade,
        rawEstoque,
        rawPreco,
        rawDisponibilidade,
        nome: '',
        categoria: DEFAULT_PRODUCT_CATEGORY,
        unidade: DEFAULT_PRODUCT_UNIT,
        estoque: 0,
        preco_unitario: 0,
        disponibilidade: 'normal',
        presentColumns: {
          categoria: false,
          unidade: false,
          estoque: false,
          preco: false,
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
        rawCategoria,
        rawUnidade,
        rawEstoque,
        rawPreco,
        rawDisponibilidade,
        nome: rawNome,
        categoria: rawCategoria ? rawCategoria.trim() : DEFAULT_PRODUCT_CATEGORY,
        unidade: rawUnidade ? rawUnidade.trim() : DEFAULT_PRODUCT_UNIT,
        estoque: 0,
        preco_unitario: 0,
        disponibilidade: 'normal',
        presentColumns: {
          categoria: Boolean(rawCategoria),
          unidade: Boolean(rawUnidade),
          estoque: Boolean(rawEstoque),
          preco: Boolean(rawPreco),
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
    // Ordem de resolução:
    // 1. Match exato normalizado pelo nome oficial
    // 2. Match por apelido exato (com detecção de ambiguidade se mapear para múltiplos produtos)
    // 3. Fallback despluralizado pelo nome oficial
    // 4. Fallback despluralizado por apelido
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
          // Conflito entre apelidos de produtos distintos
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

    // Indicar se cada coluna veio preenchida na linha
    const hasRawCategoria = Boolean(rawCategoria)
    const hasRawUnidade = Boolean(rawUnidade)
    const hasRawEstoque = Boolean(rawEstoque)
    const hasRawPreco = Boolean(rawPreco)
    const hasRawDisponibilidade = Boolean(rawDisponibilidade)

    const presentColumns = {
      categoria: hasRawCategoria,
      unidade: hasRawUnidade,
      estoque: hasRawEstoque,
      preco: hasRawPreco,
      disponibilidade: hasRawDisponibilidade,
    }

    // --- Parse individual dos campos ---

    // A. Categoria
    let finalCategoria: string = DEFAULT_PRODUCT_CATEGORY
    if (hasRawCategoria) {
      const { categoria: mapped } = normalizeProdutoCategoria(rawCategoria)
      if (mapped) {
        finalCategoria = mapped
      } else {
        finalCategoria = isExisting
          ? existingMaster!.category || DEFAULT_PRODUCT_CATEGORY
          : DEFAULT_PRODUCT_CATEGORY
      }
    } else {
      // Em branco:
      // se existente -> mantém existente
      // se novo -> default: 'Hortaliças'
      if (isExisting) {
        finalCategoria = existingMaster!.category || DEFAULT_PRODUCT_CATEGORY
      } else {
        finalCategoria = DEFAULT_PRODUCT_CATEGORY
      }
    }

    // B. Unidade (preservando rigorosamente o case original do arquivo, apenas com trim)
    let finalUnidade = DEFAULT_PRODUCT_UNIT
    if (hasRawUnidade) {
      const trimmedUnit = rawUnidade.trim()
      finalUnidade =
        trimmedUnit ||
        (isExisting ? existingMaster!.unit || DEFAULT_PRODUCT_UNIT : DEFAULT_PRODUCT_UNIT)
    } else {
      // Em branco:
      // se existente -> mantém existente
      // se novo -> default 'kg'
      if (isExisting) {
        finalUnidade = existingMaster!.unit || DEFAULT_PRODUCT_UNIT
      } else {
        finalUnidade = DEFAULT_PRODUCT_UNIT
      }
    }

    // C. Estoque (número pt-BR)
    let finalEstoque = 0
    if (hasRawEstoque) {
      const parsedEstoque = parsePtBrNumber(rawEstoque)
      if (!parsedEstoque.isValid) {
        warnings.push(`Estoque "${rawEstoque}" inválido/ilegível; mantido sem alteração.`)
        finalEstoque = isExisting ? existingMaster!.stock : 0
      } else {
        finalEstoque = parsedEstoque.value
      }
    } else {
      // Em branco: se existente -> mantém; se novo -> default 0
      if (isExisting) {
        finalEstoque = existingMaster!.stock
      } else {
        finalEstoque = 0
      }
    }

    // D. Preço unitário (número pt-BR)
    let finalPreco = 0
    if (hasRawPreco) {
      const parsedPreco = parsePtBrNumber(rawPreco)
      if (!parsedPreco.isValid) {
        warnings.push(`Preço unitário "${rawPreco}" inválido/ilegível; mantido sem alteração.`)
        finalPreco = isExisting ? existingMaster!.price : 0
      } else {
        finalPreco = parsedPreco.value
      }
    } else {
      // Em branco: se existente -> mantém; se novo -> default 0
      if (isExisting) {
        finalPreco = existingMaster!.price
      } else {
        finalPreco = 0
      }
    }

    // E. Disponibilidade
    let finalDisponibilidade: ProdutoDisponibilidade = 'normal'
    if (hasRawDisponibilidade) {
      const normDisp = normalizeDisponibilidade(rawDisponibilidade)
      finalDisponibilidade = normDisp.disponibilidade
    } else {
      // Em branco: se existente -> mantém; se novo -> default 'normal' (Normal)
      if (isExisting) {
        finalDisponibilidade = existingMaster!.disponibilidade || 'normal'
      } else {
        finalDisponibilidade = 'normal'
      }
    }

    // Se existente, calcular fieldChanges campo a campo
    if (isExisting && existingMaster) {
      if (hasRawCategoria && !areCategoriesEqual(finalCategoria, existingMaster.category)) {
        fieldChanges.push({
          field: 'categoria',
          label: 'Categoria',
          oldValue: existingMaster.category || '(vazio)',
          newValue: finalCategoria,
        })
      }
      // Para o cálculo de mudanças no preview e atualização, detecta se o valor mudou
      // Se a coluna veio presente e seu valor difere do valor gravado
      if (hasRawUnidade && finalUnidade !== existingMaster.unit) {
        fieldChanges.push({
          field: 'unidade',
          label: 'Unidade',
          oldValue: existingMaster.unit || '(vazio)',
          newValue: finalUnidade,
        })
      }
      if (hasRawEstoque && finalEstoque !== existingMaster.stock) {
        fieldChanges.push({
          field: 'estoque',
          label: 'Estoque',
          oldValue: String(existingMaster.stock),
          newValue: String(finalEstoque),
        })
      }
      if (hasRawPreco && finalPreco !== existingMaster.price) {
        fieldChanges.push({
          field: 'preco_unitario',
          label: 'Preço',
          oldValue: `R$ ${existingMaster.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          newValue: `R$ ${finalPreco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
      if (!hasRawCategoria) defaultsApplied.push(`categoria "${DEFAULT_PRODUCT_CATEGORY}"`)
      if (!hasRawUnidade) defaultsApplied.push(`unidade "${DEFAULT_PRODUCT_UNIT}"`)
      if (!hasRawEstoque) defaultsApplied.push('estoque 0')
      if (!hasRawPreco) defaultsApplied.push('preço R$ 0,00')
      if (!hasRawDisponibilidade) defaultsApplied.push('disponibilidade "Normal"')

      if (defaultsApplied.length > 0) {
        statusReason = `Novo produto com defaults aplicados (${defaultsApplied.join(', ')}).`
      } else {
        statusReason = 'Novo produto com todas as colunas preenchidas.'
      }
    }

    allRows.push({
      index: rowIdx + 2,
      rawNome,
      rawCategoria,
      rawUnidade,
      rawEstoque,
      rawPreco,
      rawDisponibilidade,
      nome: rawNome,
      categoria: finalCategoria,
      unidade: finalUnidade,
      estoque: finalEstoque,
      preco_unitario: finalPreco,
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
    if ('category' in p) {
      return p as Product
    }
    return {
      id: p.id,
      name: (p as any).name || (p as any).nome || '',
      category: 'Hortaliças',
      stock: 0,
      unit: DEFAULT_PRODUCT_UNIT,
      price: 0,
      disponibilidade: 'normal',
    }
  })

  return parseProductsInput({
    fileOrText: file,
    fileName: file.name,
    existingProducts: fullProducts,
  })
}
