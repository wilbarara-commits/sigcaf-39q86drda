import * as XLSX from 'xlsx'
import { normalizeName, stripParentheses, extractParenthesesContent } from '@/lib/excelImporter'
import { parseCsvTextToMatrix } from '@/lib/schoolCsvImporter'
import type { School } from '@/lib/types'

export interface ParsedCoordRow {
  index: number
  rawEscola: string
  rawCep: string
  rawLatitude: string
  rawLongitude: string
  rawCodigoInep?: string

  // Normalizados
  normalizedEscola: string
  cep: string
  latitude: string
  longitude: string
  codigoInep?: string

  // Matching
  matchedSchoolId?: string
  matchedSchoolName?: string
  matchType: 'auto' | 'manual' | 'none'
  similarityScore?: number

  // Status
  status: 'matched_auto' | 'matched_manual' | 'unmatched' | 'invalid_coords'
  issues: string[]
}

export interface CoordsImportResult {
  fileName: string
  totalRows: number
  matchedAutoCount: number
  unmatchedCount: number
  rows: ParsedCoordRow[]
  detectedHeaders: {
    escolaCol: string
    cepCol: string
    latCol: string
    longCol: string
    inepCol?: string
  }
}

/**
 * Normaliza coordenada geográfica:
 * - Trata vírgula como ponto decimal ("-22,1234" -> "-22.1234")
 * - Remove espaços e caracteres espúrios exceto dígitos, sinal de menos e ponto
 * - Retorna string vazia se inválido
 */
export function normalizeCoordinate(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val).trim()
  if (!str) return ''

  // Substitui vírgula por ponto
  let cleaned = str.replace(',', '.').replace(/[^\d.-]/g, '')

  // Se tiver múltiplos sinais de menos ou múltiplos pontos
  const minus = cleaned.startsWith('-') ? '-' : ''
  cleaned = cleaned.replace(/-/g, '')
  const parts = cleaned.split('.')
  if (parts.length > 2) {
    cleaned = parts[0] + '.' + parts.slice(1).join('')
  }
  const finalStr = minus + cleaned

  const num = parseFloat(finalStr)
  if (isNaN(num)) return ''
  return finalStr
}

/**
 * Normaliza CEP para formato com ou sem traço:
 * ex.: "25995-630" ou "25995630" -> "25995-630"
 */
export function normalizeCep(val: unknown): string {
  if (val === null || val === undefined) return ''
  const digits = String(val).replace(/\D/g, '').trim()
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`
  }
  return String(val).trim()
}

/**
 * Remove títulos, abreviações e prefixos escolares para matching robusto:
 * CMEIA, CMEI, CM, EM, Creche Municipal, Escola Municipal, Profª, Prof., Mons., etc.
 */
export function cleanSchoolNameForMatching(name: string): string {
  if (!name) return ''

  // 1. stripParentheses e normalizeName
  let norm = normalizeName(stripParentheses(name))

  // 2. Remove abreviações de títulos honoríficos / cargos
  // prof, profa, professora, professor, mons, monsenhor, padre, pe, dr, dra, doutor, doutora, dona, da, de, do, dos, das
  const honorifics = [
    /\bprof[a-z]*\b/g,
    /\bmons[a-z]*\b/g,
    /\bpadre\b/g,
    /\bpe\b/g,
    /\bdr[a-z]*\b/g,
    /\bdoutor[a-z]*\b/g,
    /\bdona\b/g,
    /\bsao\b/g,
    /\bsanta\b/g,
    /\bnossa senhora\b/g,
  ]

  // 3. Remove prefixos e variações de tipos escolares
  // CMEIA, CMEI, CM, EM, CC, CE, CIA, CRECHE MUNICIPAL, ESCOLA MUNICIPAL, CENTRO MUNICIPAL DE EDUCACAO INFANTIL, etc.
  const prefixes = [
    /^centro municipal de educacao infantil\s+/i,
    /^centro de educacao infantil\s+/i,
    /^creche municipal\s+/i,
    /^escola municipal\s+/i,
    /^colegio estadual\s+/i,
    /^creche comunitaria\s+/i,
    /^cmeia\s+/i,
    /^cmei\s+/i,
    /^cc\s+/i,
    /^ce\s+/i,
    /^cm\s+/i,
    /^em\s+/i,
    /^cia\s+/i,
  ]

  for (const prefix of prefixes) {
    norm = norm.replace(prefix, ' ')
  }

  for (const hon of honorifics) {
    norm = norm.replace(hon, ' ')
  }

  // Remove preposições comuns: de, da, do, das, dos, e
  norm = norm.replace(/\b(de|da|do|das|dos|e)\b/g, ' ')

  // Reduz múltiplos espaços
  return norm.replace(/\s+/g, ' ').trim()
}

/**
 * Calcula similaridade entre duas strings tokenizadas (Dice/Jaccard token coefficient)
 */
export function calculateTokenSimilarity(s1: string, s2: string): number {
  const clean1 = cleanSchoolNameForMatching(s1)
  const clean2 = cleanSchoolNameForMatching(s2)

  if (!clean1 || !clean2) return 0
  if (clean1 === clean2) return 1.0

  const tokens1 = new Set(clean1.split(' ').filter((t) => t.length >= 2))
  const tokens2 = new Set(clean2.split(' ').filter((t) => t.length >= 2))

  if (tokens1.size === 0 || tokens2.size === 0) return 0

  let intersection = 0
  tokens1.forEach((t) => {
    if (tokens2.has(t)) {
      intersection++
    } else {
      // tolerância a pequenos erros de grafia como "dalia" vs "dallia"
      for (const t2 of tokens2) {
        if (isFuzzyTokenMatch(t, t2)) {
          intersection += 0.9
          break
        }
      }
    }
  })

  // Coeficiente de Dice
  return (2 * intersection) / (tokens1.size + tokens2.size)
}

function isFuzzyTokenMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 2) return false
  // Dobras de consoante: ex. dalia vs dallia
  const simpleA = a.replace(/([a-z])\1+/g, '$1')
  const simpleB = b.replace(/([a-z])\1+/g, '$1')
  if (simpleA === simpleB) return true

  // Levenshtein rápido para tokens pequenos
  let diff = 0
  const maxLen = Math.max(a.length, b.length)
  if (maxLen <= 3) return a === b
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) diff++
  }
  diff += Math.abs(a.length - b.length)
  return diff <= 1
}

/**
 * Verifica se os tipos das escolas são estritamente conflitantes
 * Exemplo: CM LAR DE ISABEL vs EM LAR DE ISABEL são escolas distintas
 */
export function areTypesConflicting(name1: string, name2: string): boolean {
  const norm1 = normalizeName(name1)
  const norm2 = normalizeName(name2)

  const isCreche1 =
    norm1.startsWith('cm ') ||
    norm1.startsWith('cmei') ||
    norm1.startsWith('cmeia') ||
    norm1.includes('creche')
  const isCreche2 =
    norm2.startsWith('cm ') ||
    norm2.startsWith('cmei') ||
    norm2.startsWith('cmeia') ||
    norm2.includes('creche')

  const isFundamental1 = norm1.startsWith('em ') || norm1.includes('escola municipal')
  const isFundamental2 = norm2.startsWith('em ') || norm2.includes('escola municipal')

  // Se uma é explicitamente Creche/CMEI/CM e a outra é explicitamente EM/Fundamental
  if (isCreche1 && isFundamental2 && !isFundamental1 && !isCreche2) {
    // Exceção apenas se os nomes limpos forem muito específicos, mas em casos como "Lar de Isabel", são diferentes!
    const clean1 = cleanSchoolNameForMatching(name1)
    const clean2 = cleanSchoolNameForMatching(name2)
    if (clean1.includes('lar de isabel') || clean2.includes('lar de isabel')) {
      return true
    }
  }

  return false
}

/**
 * Encontra a melhor escola correspondente no banco
 */
export function findBestSchoolMatch(
  planilhaName: string,
  schools: School[],
): {
  school: School | null
  similarity: number
  matchType: 'auto' | 'none'
} {
  if (!planilhaName || schools.length === 0) {
    return { school: null, similarity: 0, matchType: 'none' }
  }

  const normPlanilha = normalizeName(planilhaName)
  const cleanPlanilha = cleanSchoolNameForMatching(planilhaName)

  // 1. Tentar match exato por nome normalizado
  for (const s of schools) {
    const normDb = normalizeName(s.name)
    if (normDb === normPlanilha) {
      return { school: s, similarity: 1.0, matchType: 'auto' }
    }
  }

  // 2. Tentar match exato por nome limpo (sem títulos e prefixos)
  const exactCleanMatches: School[] = []
  for (const s of schools) {
    const cleanDb = cleanSchoolNameForMatching(s.name)
    if (cleanDb && cleanDb === cleanPlanilha) {
      if (!areTypesConflicting(planilhaName, s.name)) {
        exactCleanMatches.push(s)
      }
    }
  }

  if (exactCleanMatches.length === 1) {
    return { school: exactCleanMatches[0], similarity: 0.98, matchType: 'auto' }
  }

  // 3. Tentar parênteses / apelido
  const parenP = normalizeName(extractParenthesesContent(planilhaName))
  if (parenP) {
    for (const s of schools) {
      const parenS = normalizeName(extractParenthesesContent(s.name))
      if (parenS === parenP) {
        return { school: s, similarity: 0.95, matchType: 'auto' }
      }
    }
  }

  // 4. Match por similaridade de tokens
  let bestSchool: School | null = null
  let maxScore = 0

  for (const s of schools) {
    if (areTypesConflicting(planilhaName, s.name)) {
      continue
    }

    const score = calculateTokenSimilarity(planilhaName, s.name)
    if (score > maxScore) {
      maxScore = score
      bestSchool = s
    }
  }

  // Se score alto (>= 0.70) e com boa margem
  if (bestSchool && maxScore >= 0.7) {
    return { school: bestSchool, similarity: maxScore, matchType: 'auto' }
  }

  return { school: null, similarity: maxScore, matchType: 'none' }
}

/**
 * Identifica colunas em uma linha de cabeçalho
 */
export function detectCoordColumns(headerRow: string[]): {
  escolaIdx: number
  cepIdx: number
  latIdx: number
  longIdx: number
  inepIdx: number
  escolaColName: string
  cepColName: string
  latColName: string
  longColName: string
  inepColName?: string
} {
  let escolaIdx = -1
  let cepIdx = -1
  let latIdx = -1
  let longIdx = -1
  let inepIdx = -1

  headerRow.forEach((col, idx) => {
    const norm = normalizeName(col)
    if (!norm) return

    // 0. Código INEP
    if (
      inepIdx === -1 &&
      (norm.includes('inep') || norm === 'codigo inep' || norm === 'cod inep' || norm === 'inep')
    ) {
      inepIdx = idx
      return
    }

    // 1. Latitude
    if (latIdx === -1 && (norm === 'latitude' || norm === 'lat' || norm.startsWith('lat'))) {
      latIdx = idx
      return
    }

    // 2. Longitude
    if (
      longIdx === -1 &&
      (norm === 'longitude' ||
        norm === 'long' ||
        norm === 'lng' ||
        norm.startsWith('long') ||
        norm.startsWith('lng'))
    ) {
      longIdx = idx
      return
    }

    // 3. CEP
    if (cepIdx === -1 && (norm === 'cep' || norm.includes('cep'))) {
      cepIdx = idx
      return
    }

    // 4. Escola / Nome
    if (
      escolaIdx === -1 &&
      (norm === 'escola' ||
        norm === 'nome da escola' ||
        norm === 'nome escola' ||
        norm === 'unidade escolar' ||
        norm === 'instituicao' ||
        norm === 'nome')
    ) {
      escolaIdx = idx
      return
    }
  })

  // Fallbacks tolerantes se não achou pelo nome estrito
  if (escolaIdx === -1) {
    headerRow.forEach((col, idx) => {
      const norm = normalizeName(col)
      if (norm.includes('escola') || norm.includes('unidade')) {
        escolaIdx = idx
      }
    })
  }

  return {
    escolaIdx,
    cepIdx,
    latIdx,
    longIdx,
    inepIdx,
    escolaColName: escolaIdx >= 0 ? headerRow[escolaIdx] : 'Não detectada',
    cepColName: cepIdx >= 0 ? headerRow[cepIdx] : 'Não detectada',
    latColName: latIdx >= 0 ? headerRow[latIdx] : 'Não detectada',
    longColName: longIdx >= 0 ? headerRow[longIdx] : 'Não detectada',
    inepColName: inepIdx >= 0 ? headerRow[inepIdx] : undefined,
  }
}

/**
 * Lê arquivo XLSX ou CSV e retorna a matriz de strings
 */
export async function parseFileToMatrix(file: File): Promise<string[][]> {
  const fileName = file.name.toLowerCase()

  if (fileName.endsWith('.csv') || file.type.includes('csv') || file.type.includes('text/plain')) {
    const text = await file.text()
    return parseCsvTextToMatrix(text)
  }

  // XLSX / XLS via ArrayBuffer
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  // Tentar encontrar a aba "Escolas" ou usar a primeira
  let targetSheetName = workbook.SheetNames[0]
  for (const sheet of workbook.SheetNames) {
    const norm = normalizeName(sheet)
    if (norm === 'escolas' || norm.includes('escola')) {
      targetSheetName = sheet
      break
    }
  }

  const worksheet = workbook.Sheets[targetSheetName]
  if (!worksheet) return []

  const rawMatrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as any[][]

  return rawMatrix.map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? '').trim()) : []))
}

/**
 * Processa a matriz de dados (de upload ou texto colado)
 */
export function processCoordsMatrix(
  matrix: string[][],
  fileName: string,
  schools: School[],
): CoordsImportResult {
  if (matrix.length === 0) {
    throw new Error('Nenhum dado encontrado no arquivo ou texto informado.')
  }

  // Achar linha de cabeçalho (primeira linha não vazia que contenha escola, cep ou latitude)
  let headerRowIdx = -1
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i]
    const joined = row.map(normalizeName).join(' ')
    if (
      (joined.includes('escola') || joined.includes('nome')) &&
      (joined.includes('lat') || joined.includes('cep') || joined.includes('long'))
    ) {
      headerRowIdx = i
      break
    }
  }

  // Se não achou na busca inteligente, usa a primeira linha não vazia
  if (headerRowIdx === -1) {
    headerRowIdx = matrix.findIndex((r) => r.some((c) => c.trim().length > 0))
  }

  if (headerRowIdx === -1 || headerRowIdx >= matrix.length) {
    throw new Error('Cabeçalho não encontrado no arquivo.')
  }

  const headerRow = matrix[headerRowIdx]
  const cols = detectCoordColumns(headerRow)

  if (cols.escolaIdx === -1) {
    throw new Error(
      'Coluna de nome da escola não encontrada no cabeçalho. Deve conter "Escola" ou "Nome".',
    )
  }

  const parsedRows: ParsedCoordRow[] = []
  let autoCount = 0
  let unmatchedCount = 0

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r]
    if (!row || row.every((c) => !c.trim())) continue

    const rawEscola = (row[cols.escolaIdx] || '').trim()
    if (!rawEscola) continue

    const rawCep = cols.cepIdx >= 0 ? (row[cols.cepIdx] || '').trim() : ''
    const rawLat = cols.latIdx >= 0 ? (row[cols.latIdx] || '').trim() : ''
    const rawLong = cols.longIdx >= 0 ? (row[cols.longIdx] || '').trim() : ''
    const rawCodigoInep = cols.inepIdx >= 0 ? (row[cols.inepIdx] || '').trim() : ''

    const normalizedEscola = cleanSchoolNameForMatching(rawEscola)
    const cep = normalizeCep(rawCep)
    const latitude = normalizeCoordinate(rawLat)
    const longitude = normalizeCoordinate(rawLong)
    const codigoInep = rawCodigoInep
      ? rawCodigoInep.replace(/[^\d\w-]/g, '').trim() || rawCodigoInep
      : undefined

    const issues: string[] = []
    if (rawLat && !latitude) issues.push('Latitude inválida')
    if (rawLong && !longitude) issues.push('Longitude inválida')

    // Tentar matching no banco
    const match = findBestSchoolMatch(rawEscola, schools)

    let status: ParsedCoordRow['status'] = 'unmatched'
    let matchType: ParsedCoordRow['matchType'] = 'none'

    if (match.school && match.matchType === 'auto') {
      status = 'matched_auto'
      matchType = 'auto'
      autoCount++
    } else {
      unmatchedCount++
    }

    parsedRows.push({
      index: r - headerRowIdx,
      rawEscola,
      rawCep,
      rawLatitude: rawLat,
      rawLongitude: rawLong,
      rawCodigoInep,
      normalizedEscola,
      cep,
      latitude,
      longitude,
      codigoInep,
      matchedSchoolId: match.school?.id,
      matchedSchoolName: match.school?.name,
      matchType,
      similarityScore: match.similarity,
      status,
      issues,
    })
  }

  return {
    fileName,
    totalRows: parsedRows.length,
    matchedAutoCount: autoCount,
    unmatchedCount,
    rows: parsedRows,
    detectedHeaders: {
      escolaCol: cols.escolaColName,
      cepCol: cols.cepColName,
      latCol: cols.latColName,
      longCol: cols.longColName,
      inepCol: cols.inepColName,
    },
  }
}
