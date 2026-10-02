import * as XLSX from 'xlsx'
import { normalizeName, stripParentheses } from '@/lib/excelImporter'
import {
  cleanSchoolNameForMatching,
  calculateTokenSimilarity,
  areTypesConflicting,
} from '@/lib/schoolCoordsMatcher'
import { parseCsvTextToMatrix } from '@/lib/schoolCsvImporter'
import { parsePtBrNumber } from '@/lib/numberParser'
import type { School, Contract, ChamadaRecord } from '@/lib/types'

/**
 * Normaliza o código do contrato (remove espaços espúrios, ex: "C-2026-02 -01" -> "C-2026-02-01")
 */
export function normalizeContractCode(raw: string): string {
  if (!raw) return ''
  let s = String(raw).trim()
  // Trata espaços em volta de traços e barras (ex: "C-2026-02 - 01" -> "C-2026-02-01", "C - 2026 / 02" -> "C-2026/02")
  s = s.replace(/\s*-\s*/g, '-').replace(/\s*\/\s*/g, '/')
  // Colapsa múltiplos espaços internos restantes
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export interface ContractBatchImportRow {
  rowIndex: number // 1-based no arquivo
  rawContrato: string
  rawEscola: string
  rawInep?: string
  rawValorTotal?: string
  rawInicio?: string
  rawFim?: string

  // Dados processados
  codigoContrato: string
  nomeEscola: string
  codigoInep?: string
  valorTotal?: number
  dataInicio?: string
  dataFim?: string

  // Casamento com Escola
  matchedSchoolId?: string
  matchedSchoolName?: string
  matchType: 'inep' | 'exact' | 'clean' | 'fuzzy' | 'manual' | 'none'
  matchScore: number

  // Status de validação da linha
  status:
    | 'valid'
    | 'ambiguous'
    | 'unmatched_school'
    | 'empty_code'
    | 'empty_school'
    | 'conflict_other_contract'
  statusReason?: string
  conflictContractNumber?: string
  conflictContractId?: string
}

export interface ContractBatchGroup {
  codigoContrato: string
  isExistingContract: boolean
  existingContractId?: string
  existingSchoolCount: number
  valorTotal?: number
  hasDivergentValorTotal: boolean
  divergentValues?: number[]
  dataInicio?: string
  dataFim?: string
  rows: ContractBatchImportRow[]
  // Status consolidado do contrato
  hasErrors: boolean
  newSchoolsCount: number
  alreadyLinkedCount: number
}

export interface ContractBatchParseResult {
  fileName: string
  totalLines: number
  detectedColumns: {
    contratoCol?: string
    escolaCol?: string
    inepCol?: string
    valorCol?: string
    inicioCol?: string
    fimCol?: string
  }
  groups: ContractBatchGroup[]
  allRows: ContractBatchImportRow[]
  // Contadores
  summary: {
    totalRows: number
    validRows: number
    problemRows: number
    newContractsCount: number
    existingContractsCount: number
    uniqueSchoolsCount: number
  }
}

/**
 * Normaliza datas aceitando formatos dd/mm/aaaa, aaaa-mm-dd ou número serial do Excel
 */
export function normalizeDateInput(val: any): string | undefined {
  if (val === undefined || val === null || val === '') return undefined
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? undefined : val.toISOString().split('T')[0]
  }
  const s = String(val).trim()
  if (!s) return undefined

  // Serial Excel se for puramente numérico > 20000
  if (/^\d{5}$/.test(s)) {
    const num = Number(s)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(excelEpoch.getTime() + num * 86400000)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  }

  // dd/mm/aaaa
  const brMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (brMatch) {
    const d = brMatch[1].padStart(2, '0')
    const m = brMatch[2].padStart(2, '0')
    const y = brMatch[3]
    return `${y}-${m}-${d}`
  }

  // aaaa-mm-dd
  const isoMatch = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/)
  if (isoMatch) {
    const y = isoMatch[1]
    const m = isoMatch[2].padStart(2, '0')
    const d = isoMatch[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return undefined
}

/**
 * Detecta os índices de coluna com cabeçalhos tolerantes:
 * - Contrato: "Contrato", "Cód. Contrato", "Nº Contrato", "Código do Contrato", "Cod Contrato"
 * - Escola: "Nome da Escola", "Escola", "Instituição", "Unidade Escolar", "Nome Escola"
 * - INEP: "INEP", "Cód INEP", "Código INEP", "Cod INEP"
 * - Valor Total: "Valor Total", "Valor", "Total", "Valor Contrato"
 * - Início: "Data de Início", "Início", "Data Inicio", "Inicio"
 * - Fim: "Data de Fim", "Fim", "Data Fim", "Término", "Termino"
 * - ROTA: Rota é detectada para ser estritamente ignorada conforme regra 0.0.110
 */
export function detectContractBatchColumns(headerRow: string[]): {
  contratoIdx: number
  escolaIdx: number
  inepIdx: number
  valorIdx: number
  inicioIdx: number
  fimIdx: number
  rotaIdx: number
  colNames: {
    contratoCol?: string
    escolaCol?: string
    inepCol?: string
    valorCol?: string
    inicioCol?: string
    fimCol?: string
  }
} {
  let contratoIdx = -1
  let escolaIdx = -1
  let inepIdx = -1
  let valorIdx = -1
  let inicioIdx = -1
  let fimIdx = -1
  let rotaIdx = -1

  headerRow.forEach((col, idx) => {
    const norm = normalizeName(col)
    if (!norm) return

    // INEP (checar antes de escola / contrato)
    if (
      inepIdx === -1 &&
      (norm.includes('inep') || norm === 'cod inep' || norm === 'codigo inep')
    ) {
      inepIdx = idx
      return
    }

    // Contrato
    if (
      contratoIdx === -1 &&
      (norm === 'contrato' ||
        norm === 'cod contrato' ||
        norm === 'codigo contrato' ||
        norm === 'codigo do contrato' ||
        norm === 'num contrato' ||
        norm === 'numero contrato' ||
        norm === 'n contrato' ||
        norm.startsWith('contrato') ||
        norm.includes('contrato'))
    ) {
      contratoIdx = idx
      return
    }

    // Rota (para ignorar explicitamente)
    if (
      rotaIdx === -1 &&
      (norm === 'rota' ||
        norm === 'rotas' ||
        norm.startsWith('rota ') ||
        norm.includes('itinerario'))
    ) {
      rotaIdx = idx
      return
    }

    // Valor Total
    if (
      valorIdx === -1 &&
      (norm.includes('valor total') ||
        norm === 'valor' ||
        norm === 'total' ||
        norm.includes('valor contrato') ||
        norm === 'vlr total')
    ) {
      valorIdx = idx
      return
    }

    // Data de Início
    if (
      inicioIdx === -1 &&
      (norm.includes('inicio') || norm.includes('data inicio') || norm.includes('dt inicio'))
    ) {
      inicioIdx = idx
      return
    }

    // Data de Fim
    if (
      fimIdx === -1 &&
      (norm.includes('fim') ||
        norm.includes('termino') ||
        norm.includes('data fim') ||
        norm.includes('dt fim'))
    ) {
      fimIdx = idx
      return
    }

    // Nome da Escola
    if (
      escolaIdx === -1 &&
      (norm === 'nome da escola' ||
        norm === 'escola' ||
        norm === 'instituicao' ||
        norm === 'unidade escolar' ||
        norm === 'nome escola' ||
        norm === 'escolas' ||
        norm.includes('escola') ||
        norm.includes('unidade'))
    ) {
      escolaIdx = idx
      return
    }
  })

  // Fallbacks posicionais caso não haja cabeçalho explícito
  if (contratoIdx === -1 && headerRow.length >= 2) {
    contratoIdx = 0
  }
  if (escolaIdx === -1 && headerRow.length >= 2) {
    escolaIdx = contratoIdx === 0 ? 1 : 0
  }

  return {
    contratoIdx,
    escolaIdx,
    inepIdx,
    valorIdx,
    inicioIdx,
    fimIdx,
    rotaIdx,
    colNames: {
      contratoCol: contratoIdx >= 0 ? headerRow[contratoIdx] : undefined,
      escolaCol: escolaIdx >= 0 ? headerRow[escolaIdx] : undefined,
      inepCol: inepIdx >= 0 ? headerRow[inepIdx] : undefined,
      valorCol: valorIdx >= 0 ? headerRow[valorIdx] : undefined,
      inicioCol: inicioIdx >= 0 ? headerRow[inicioIdx] : undefined,
      fimCol: fimIdx >= 0 ? headerRow[fimIdx] : undefined,
    },
  }
}

/**
 * Localiza a melhor correspondência de escola por INEP (se presente) ou por nome inteligente
 */
export function matchSchoolSmart(
  schoolNameRaw: string,
  inepRaw: string | undefined,
  masterSchools: School[],
): {
  school: School | null
  matchType: ContractBatchImportRow['matchType']
  score: number
  isAmbiguous?: boolean
} {
  // 1. Tentar casamento por Código INEP se informado
  if (inepRaw) {
    const cleanInep = inepRaw.replace(/\D/g, '').trim()
    if (cleanInep) {
      const byInep = masterSchools.find((s) => {
        if (!s.codigo_inep) return false
        return s.codigo_inep.replace(/\D/g, '').trim() === cleanInep
      })
      if (byInep) {
        return { school: byInep, matchType: 'inep', score: 1.0 }
      }
    }
  }

  const rawName = (schoolNameRaw || '').trim()
  if (!rawName) {
    return { school: null, matchType: 'none', score: 0 }
  }

  const normTarget = normalizeName(rawName)
  const normTargetNoParen = normalizeName(stripParentheses(rawName))
  const cleanTarget = cleanSchoolNameForMatching(rawName)

  // 2. Match exato pelo nome normalizado
  for (const s of masterSchools) {
    const normS = normalizeName(s.name)
    if (normS && normS === normTarget) {
      return { school: s, matchType: 'exact', score: 1.0 }
    }
  }

  // 3. Match sem parênteses (ex: CEDAL, CEROM)
  if (normTargetNoParen) {
    for (const s of masterSchools) {
      const normSNoParen = normalizeName(stripParentheses(s.name))
      if (normSNoParen && normSNoParen === normTargetNoParen) {
        return { school: s, matchType: 'exact', score: 0.99 }
      }
    }
  }

  // 4. Match por nome limpo (removendo títulos: Profª, Mons, Padre, CE, EM, CIA, Creche, etc.)
  if (cleanTarget) {
    const cleanMatches = masterSchools.filter((s) => {
      const cS = cleanSchoolNameForMatching(s.name)
      if (cS && cS === cleanTarget) {
        return !areTypesConflicting(rawName, s.name)
      }
      return false
    })

    if (cleanMatches.length === 1) {
      return { school: cleanMatches[0], matchType: 'clean', score: 0.95 }
    } else if (cleanMatches.length > 1) {
      // Ambiguidade detectada
      return { school: null, matchType: 'none', score: 0.95, isAmbiguous: true }
    }
  }

  // 5. Similaridade fuzzy por tokens
  let bestSchool: School | null = null
  let maxScore = 0
  let closeMatchesCount = 0

  for (const s of masterSchools) {
    if (areTypesConflicting(rawName, s.name)) continue
    const sim = calculateTokenSimilarity(rawName, s.name)
    if (sim > maxScore) {
      maxScore = sim
      bestSchool = s
      closeMatchesCount = 1
    } else if (Math.abs(sim - maxScore) < 0.05 && sim >= 0.75) {
      closeMatchesCount++
    }
  }

  // Aceitar se tiver score alto e sem ambiguidade próxima
  if (bestSchool && maxScore >= 0.72) {
    if (closeMatchesCount > 1) {
      return { school: null, matchType: 'none', score: maxScore, isAmbiguous: true }
    }
    return { school: bestSchool, matchType: 'fuzzy', score: maxScore }
  }

  return { school: null, matchType: 'none', score: maxScore }
}

export interface ParseContractBatchOptions {
  fileOrText: File | string
  fileName?: string
  selectedChamada: ChamadaRecord
  masterSchools: School[]
  allContracts: Contract[]
}

/**
 * Lê arquivo XLSX, CSV ou string colada e retorna matriz de strings
 */
export async function parseContractBatchFileToMatrix(
  fileOrText: File | string,
): Promise<string[][]> {
  if (typeof fileOrText === 'string') {
    return parseCsvTextToMatrix(fileOrText)
  }

  const isExcel =
    fileOrText.name.endsWith('.xlsx') ||
    fileOrText.name.endsWith('.xls') ||
    fileOrText.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileOrText.type === 'application/vnd.ms-excel'

  if (isExcel) {
    const buffer = await fileOrText.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return []
    const ws = workbook.Sheets[sheetName]
    const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    return rawData.map((row) =>
      Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()) : [],
    )
  }

  const text = await fileOrText.text()
  return parseCsvTextToMatrix(text)
}

/**
 * Analisa e agrupa as linhas da planilha de importação em massa de contratos
 */
export async function parseContractBatchMatrix(
  options: ParseContractBatchOptions,
): Promise<ContractBatchParseResult> {
  const {
    fileOrText,
    fileName = 'dados_importados.xlsx',
    selectedChamada,
    masterSchools,
    allContracts,
  } = options

  const matrix = await parseContractBatchFileToMatrix(fileOrText)

  if (matrix.length === 0) {
    throw new Error('Nenhum dado encontrado no arquivo ou texto informado.')
  }

  // Detectar linha de cabeçalho (primeira linha não vazia que contenha termos de contrato ou escola)
  let headerIdx = -1
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i]
    if (!row || row.every((c) => !c || c.trim() === '')) continue
    const joined = row.map(normalizeName).join(' ')
    if (joined.includes('contrato') || joined.includes('escola') || joined.includes('instituic')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) {
    // Se a primeira linha não parecer cabeçalho, assume header na linha 0 se tiver colunas
    headerIdx = 0
  }

  const headerRow = matrix[headerIdx]
  const { contratoIdx, escolaIdx, inepIdx, valorIdx, inicioIdx, fimIdx, colNames } =
    detectContractBatchColumns(headerRow)

  if (contratoIdx === -1 || escolaIdx === -1) {
    throw new Error(
      'Não foi possível identificar as colunas obrigatórias "Contrato" e "Nome da Escola" no cabeçalho.',
    )
  }

  const dataRows = matrix.slice(headerIdx + 1)
  if (dataRows.length === 0) {
    throw new Error('O arquivo contém apenas o cabeçalho, sem linhas de dados para importar.')
  }

  // Mapa de contratos existentes no sistema vinculados a esta chamada
  // Chave: número de contrato normalizado (ex: "C-2026-02-01")
  const existingChamadaContracts = new Map<string, Contract>()
  for (const c of allContracts) {
    if (c.chamada_id === selectedChamada.id) {
      existingChamadaContracts.set(normalizeContractCode(c.numero), c)
    }
  }

  // Mapa de contratos ativos globais para verificação de regra R25 (escola só pode estar em 1 contrato ativo por vez)
  // escolaId -> contrato ativo
  const activeContractsBySchoolId = new Map<string, Contract>()
  for (const c of allContracts) {
    if (c.status === 'Ativo') {
      for (const esc of c.escolas) {
        if (esc.escolaId && !esc.encerrado_em) {
          activeContractsBySchoolId.set(esc.escolaId, c)
        }
      }
    }
  }

  const allRows: ContractBatchImportRow[] = []

  // Processamento linha a linha
  dataRows.forEach((row, idx) => {
    // Pula linhas totalmente em branco
    if (!row || row.every((c) => !c || String(c).trim() === '')) return

    const rawContrato = row[contratoIdx] !== undefined ? String(row[contratoIdx]).trim() : ''
    const rawEscola = row[escolaIdx] !== undefined ? String(row[escolaIdx]).trim() : ''
    const rawInep =
      inepIdx >= 0 && row[inepIdx] !== undefined ? String(row[inepIdx]).trim() : undefined
    const rawValor =
      valorIdx >= 0 && row[valorIdx] !== undefined ? String(row[valorIdx]).trim() : undefined
    const rawInicio =
      inicioIdx >= 0 && row[inicioIdx] !== undefined ? String(row[inicioIdx]).trim() : undefined
    const rawFim = fimIdx >= 0 && row[fimIdx] !== undefined ? String(row[fimIdx]).trim() : undefined

    const codigoContrato = normalizeContractCode(rawContrato)
    const nomeEscola = rawEscola.trim()
    const codigoInep = rawInep ? rawInep.replace(/\D/g, '').trim() : undefined
    const parsedValor = rawValor ? parsePtBrNumber(rawValor) : undefined
    const valorTotal =
      parsedValor?.isValid && (parsedValor.value ?? 0) >= 0 ? parsedValor.value : undefined
    const dataInicio = normalizeDateInput(rawInicio)
    const dataFim = normalizeDateInput(rawFim)

    let status: ContractBatchImportRow['status'] = 'valid'
    let statusReason: string | undefined
    let matchedSchoolId: string | undefined
    let matchedSchoolName: string | undefined
    let matchType: ContractBatchImportRow['matchType'] = 'none'
    let matchScore = 0
    let conflictContractNumber: string | undefined
    let conflictContractId: string | undefined

    if (!codigoContrato) {
      status = 'empty_code'
      statusReason = 'Código do contrato em branco nesta linha.'
    } else if (!nomeEscola) {
      status = 'empty_school'
      statusReason = 'Nome da escola em branco nesta linha.'
    } else {
      // Casamento inteligente com o cadastro mestre de escolas
      const matchRes = matchSchoolSmart(nomeEscola, codigoInep, masterSchools)
      matchType = matchRes.matchType
      matchScore = matchRes.score

      if (matchRes.isAmbiguous) {
        status = 'ambiguous'
        statusReason =
          'Nome da escola ambíguo com múltiplas unidades do cadastro mestre. Selecione manualmente.'
      } else if (!matchRes.school) {
        status = 'unmatched_school'
        statusReason = 'Escola não encontrada no cadastro mestre. Selecione manualmente na lista.'
      } else {
        matchedSchoolId = matchRes.school.id
        matchedSchoolName = matchRes.school.name

        // Verificar regra R25 de unicidade de vínculo ativo
        const activeContract = activeContractsBySchoolId.get(matchRes.school.id)
        if (activeContract) {
          // Se já está vinculado a um contrato DIFERENTE do que estamos importando
          const targetIsThis =
            existingChamadaContracts.has(codigoContrato) &&
            existingChamadaContracts.get(codigoContrato)?.id === activeContract.id

          if (!targetIsThis) {
            status = 'conflict_other_contract'
            statusReason = `Escola já vinculada ao contrato ativo ${activeContract.numero}. Desvincule lá antes.`
            conflictContractNumber = activeContract.numero
            conflictContractId = activeContract.id
          }
        }
      }
    }

    allRows.push({
      rowIndex: headerIdx + idx + 2,
      rawContrato,
      rawEscola,
      rawInep,
      rawValorTotal: rawValor,
      rawInicio,
      rawFim,
      codigoContrato,
      nomeEscola,
      codigoInep,
      valorTotal,
      dataInicio,
      dataFim,
      matchedSchoolId,
      matchedSchoolName,
      matchType,
      matchScore,
      status,
      statusReason,
      conflictContractNumber,
      conflictContractId,
    })
  })

  // Agrupamento por código do contrato normalizado
  const groupMap = new Map<string, ContractBatchImportRow[]>()
  for (const row of allRows) {
    const key = row.codigoContrato || `_SEM_CODIGO_${row.rowIndex}`
    if (!groupMap.has(key)) {
      groupMap.set(key, [])
    }
    groupMap.get(key)!.push(row)
  }

  const groups: ContractBatchGroup[] = []
  let totalValidRows = 0
  let totalProblemRows = 0
  let newContractsCount = 0
  let existingContractsCount = 0
  const uniqueMatchedSchools = new Set<string>()

  for (const [key, rows] of groupMap.entries()) {
    const isNoCode = key.startsWith('_SEM_CODIGO_')
    const codigo = isNoCode ? 'Código Não Informado' : key
    const existing = !isNoCode ? existingChamadaContracts.get(codigo) : undefined
    const isExistingContract = Boolean(existing)

    if (isExistingContract) existingContractsCount++
    else if (!isNoCode) newContractsCount++

    // Valor Total: regra 0.0.106/requisito: uma vez por contrato na 1ª linha dele;
    // se repetidas divergentes, avisar e usar o primeiro válido
    const validValues = rows.map((r) => r.valorTotal).filter((v): v is number => v !== undefined)
    let firstValorTotal: number | undefined = validValues.length > 0 ? validValues[0] : undefined
    let hasDivergentValorTotal = false
    const uniqueValues = Array.from(new Set(validValues))
    if (uniqueValues.length > 1) {
      hasDivergentValorTotal = true
    }

    // Datas início/fim: pega o primeiro informado
    const dataInicio = rows.map((r) => r.dataInicio).find((d) => Boolean(d))
    const dataFim = rows.map((r) => r.dataFim).find((d) => Boolean(d))

    // Escolas já vinculadas no contrato existente
    const alreadyLinkedIds = new Set(
      existing ? existing.escolas.filter((e) => !e.encerrado_em).map((e) => e.escolaId) : [],
    )

    let newSchoolsCount = 0
    let alreadyLinkedCount = 0
    let hasErrors = false

    // Rastrear duplicidade da mesma escola dentro do mesmo contrato na planilha
    const seenSchoolsInThisContract = new Set<string>()

    for (const r of rows) {
      if (r.status === 'valid') {
        if (r.matchedSchoolId) {
          if (seenSchoolsInThisContract.has(r.matchedSchoolId)) {
            // Repetida para o mesmo contrato
            alreadyLinkedCount++
          } else if (alreadyLinkedIds.has(r.matchedSchoolId)) {
            alreadyLinkedCount++
            seenSchoolsInThisContract.add(r.matchedSchoolId)
          } else {
            newSchoolsCount++
            seenSchoolsInThisContract.add(r.matchedSchoolId)
          }
          uniqueMatchedSchools.add(r.matchedSchoolId)
        }
        totalValidRows++
      } else {
        hasErrors = true
        totalProblemRows++
      }
    }

    groups.push({
      codigoContrato: codigo,
      isExistingContract,
      existingContractId: existing?.id,
      existingSchoolCount: existing ? existing.escolas.length : 0,
      valorTotal: firstValorTotal,
      hasDivergentValorTotal,
      divergentValues: hasDivergentValorTotal ? uniqueValues : undefined,
      dataInicio,
      dataFim,
      rows,
      hasErrors,
      newSchoolsCount,
      alreadyLinkedCount,
    })
  }

  // Ordenar grupos: grupos com problemas primeiro, depois novos contratos, depois existentes
  groups.sort((a, b) => {
    if (a.hasErrors !== b.hasErrors) return a.hasErrors ? -1 : 1
    if (a.isExistingContract !== b.isExistingContract) return a.isExistingContract ? 1 : -1
    return a.codigoContrato.localeCompare(b.codigoContrato)
  })

  return {
    fileName,
    totalLines: allRows.length,
    detectedColumns: colNames,
    groups,
    allRows,
    summary: {
      totalRows: allRows.length,
      validRows: totalValidRows,
      problemRows: totalProblemRows,
      newContractsCount,
      existingContractsCount,
      uniqueSchoolsCount: uniqueMatchedSchools.size,
    },
  }
}
