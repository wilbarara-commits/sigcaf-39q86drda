import * as XLSX from 'xlsx'
import pb from '@/lib/pocketbase/client'
import { normalizeName, stripParentheses, extractParenthesesContent } from '@/lib/excelImporter'
import { normalizeEscolaTipo, findColumnIndexes } from '@/lib/schoolCsvImporter'
import { parsePtBrNumber } from '@/lib/numberParser'
import {
  Contract,
  ContractSchoolLink,
  School,
  ParadaRotaRecord,
  RotaLogisticaRecord,
} from '@/lib/types'
import { escolasService } from '@/services/escolas'
import { contratosService } from '@/services/contratos'
import { rotasLogisticasService } from '@/services/rotas-logisticas'

export interface RawParsedSchoolRow {
  index: number
  nome: string
  tipo?: string
  alunos?: number
  endereco?: string
  telefone?: string
  email?: string
  bairro?: string
  contato?: string
  rawLine?: string
}

export interface RouteSchoolBatchItem {
  index: number
  nome: string
  tipo?: string
  alunos?: number
  endereco?: string
  telefone?: string
  email?: string
  bairro?: string
  contato?: string
  // Estado no mestre
  isExistingMaster: boolean
  masterSchoolId?: string
  masterSchoolName?: string
  // Estado de exclusividade / alocação
  isBlocked: boolean
  blockReason?: string
  currentAllocatedRoute?: string
  currentAllocatedContract?: string
  // Status de execução
  action: 'create_and_link' | 'update_and_link' | 'link_only' | 'blocked'
}

export type RouteType = 'planilha' | 'logistica'

export interface RouteSchoolBatchAnalysis {
  fileName: string
  targetRouteType?: RouteType
  totalFound: number
  toCreate: number
  toUpdate: number
  toLinkOnly: number
  blockedCount: number
  items: RouteSchoolBatchItem[]
  blockedItems: RouteSchoolBatchItem[]
}

export interface RouteSchoolImportResult {
  totalProcessed: number
  createdCount: number
  updatedCount: number
  linkedCount: number
  blockedCount: number
  blockedList: Array<{ nome: string; motivo: string }>
  newlyLinkedSchoolIds: string[]
}

/**
 * Normaliza delimitadores comuns em texto puro ou linhas do Word/CSV bruto:
 * vírgula, ponto-e-vírgula, tabulação ou hífen isolado
 */
export function parseDelimitedTextLine(line: string): {
  nome: string
  endereco?: string
  tipo?: string
  alunos?: number
} {
  const trimmed = (line || '').trim()
  if (!trimmed) return { nome: '' }

  // 1. Tentar tabulação
  if (trimmed.includes('\t')) {
    const parts = trimmed
      .split('\t')
      .map((p) => p.trim())
      .filter(Boolean)
    return {
      nome: parts[0] || '',
      endereco: parts[1] || undefined,
    }
  }

  // 2. Tentar ponto-e-vírgula
  if (trimmed.includes(';')) {
    const parts = trimmed
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
    return {
      nome: parts[0] || '',
      endereco: parts[1] || undefined,
    }
  }

  // 3. Tentar " - " (hífen com espaços ao redor)
  if (/\s+-\s+/.test(trimmed)) {
    const parts = trimmed
      .split(/\s+-\s+/)
      .map((p) => p.trim())
      .filter(Boolean)
    return {
      nome: parts[0] || '',
      endereco: parts[1] || undefined,
    }
  }

  // 4. Tentar vírgula caso haja mais de um segmento
  if (trimmed.includes(',')) {
    const parts = trimmed
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 1) {
      return {
        nome: parts[0] || '',
        endereco: parts.slice(1).join(', ').trim() || undefined,
      }
    }
  }

  // Linha única representando apenas o nome da escola
  return { nome: trimmed }
}

/**
 * Converte documento Word (.docx) ou PDF via hook de backend $documents.toMarkdown
 */
export async function extractDocxOrDocumentText(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('arquivo', file)

  const res = await fetch(`${pb.baseUrl}/backend/v1/documentos/extrair-texto`, {
    method: 'POST',
    body: formData,
    headers: pb.authStore.token ? { Authorization: pb.authStore.token } : {},
  })

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}))
    throw new Error(errJson.message || `Erro ao ler documento Word (${res.status}).`)
  }

  const data = await res.json()
  return data.markdown || ''
}

/**
 * Faz o parsing de Markdown gerado do Word (.docx)
 * Suporta tabelas em Markdown (| col1 | col2 |) e parágrafos de texto (uma linha por escola)
 */
export function parseMarkdownToSchoolRows(markdown: string): RawParsedSchoolRow[] {
  const lines = markdown
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  // Verificar se há linhas de tabela markdown
  const tableLines = lines.filter((l) => l.startsWith('|') && l.endsWith('|'))

  if (tableLines.length >= 2) {
    // Processar tabela Markdown
    const matrix: string[][] = []
    for (const tl of tableLines) {
      // Ignorar linhas separadoras como |---|---|
      if (/^\|[\s\-:|]+\|$/.test(tl)) continue
      const cells = tl
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
      if (cells.some((c) => c.length > 0)) {
        matrix.push(cells)
      }
    }

    if (matrix.length > 0) {
      // Analisar se a primeira linha parece cabeçalho
      const header = matrix[0]
      const {
        nomeIdx,
        enderecoIdx,
        tipoIdx,
        alunosIdx,
        telefoneIdx,
        emailIdx,
        bairroIdx,
        contatoIdx,
      } = findColumnIndexes(header)

      const hasRecognizedHeader =
        nomeIdx !== -1 || enderecoIdx !== -1 || tipoIdx !== -1 || alunosIdx !== -1

      if (hasRecognizedHeader) {
        const rows: RawParsedSchoolRow[] = []
        const dataRows = matrix.slice(1)
        const finalNomeCol = nomeIdx !== -1 ? nomeIdx : 0

        dataRows.forEach((r, idx) => {
          const rawNome = r[finalNomeCol] || ''
          if (!rawNome.trim()) return

          const rawAlunos = alunosIdx !== -1 ? r[alunosIdx] : undefined
          let parsedAlunos: number | undefined
          if (rawAlunos) {
            const p = parsePtBrNumber(rawAlunos)
            if (p.isValid && p.value >= 0) parsedAlunos = Math.round(p.value)
          }

          rows.push({
            index: idx + 1,
            nome: rawNome.trim(),
            tipo: tipoIdx !== -1 ? normalizeEscolaTipo(r[tipoIdx]) : undefined,
            alunos: parsedAlunos,
            endereco: enderecoIdx !== -1 ? r[enderecoIdx]?.trim() || undefined : undefined,
            telefone: telefoneIdx !== -1 ? r[telefoneIdx]?.trim() || undefined : undefined,
            email: emailIdx !== -1 ? r[emailIdx]?.trim() || undefined : undefined,
            bairro: bairroIdx !== -1 ? r[bairroIdx]?.trim() || undefined : undefined,
            contato: contatoIdx !== -1 ? r[contatoIdx]?.trim() || undefined : undefined,
          })
        })

        if (rows.length > 0) return rows
      } else {
        // Tabela sem cabeçalho reconhecido: a coluna com mais texto ou primeira coluna vira nome
        const rows: RawParsedSchoolRow[] = []
        matrix.forEach((r, idx) => {
          const nomeCol = r[0] || ''
          const endCol = r[1] || undefined
          if (nomeCol.trim()) {
            rows.push({
              index: idx + 1,
              nome: nomeCol.trim(),
              endereco: endCol?.trim() || undefined,
            })
          }
        })
        if (rows.length > 0) return rows
      }
    }
  }

  // Caso não seja tabela Markdown: parágrafos / linhas de texto
  const rows: RawParsedSchoolRow[] = []
  let idxCounter = 1
  for (const line of lines) {
    // Pular linhas de títulos em Markdown (#, ##) se parecerem cabeçalho genérico
    const cleanLine = line.replace(/^[#*>\s-]+/, '').trim()
    if (!cleanLine) continue

    const parsed = parseDelimitedTextLine(cleanLine)
    if (parsed.nome) {
      rows.push({
        index: idxCounter++,
        nome: parsed.nome,
        endereco: parsed.endereco,
        rawLine: line,
      })
    }
  }

  return rows
}

/**
 * Lê matriz de células a partir de arquivo Excel (.xlsx, .xls)
 */
export async function parseExcelToMatrix(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('O arquivo Excel não contém nenhuma aba de dados.')
  }
  const worksheet = workbook.Sheets[firstSheetName]
  const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
  return data.map((row) => row.map((cell) => String(cell ?? '').trim()))
}

/**
 * Lê matriz de linhas a partir de arquivo de texto simples (.txt) ou CSV (.csv)
 */
export async function parseTextOrCsvToMatrix(file: File): Promise<string[][]> {
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []

  // Detectar separador predominante na primeira linha não vazia
  const sample = lines[0]
  let delimiter = ','
  const tabs = (sample.match(/\t/g) || []).length
  const semicolons = (sample.match(/;/g) || []).length
  const commas = (sample.match(/,/g) || []).length

  if (tabs > semicolons && tabs > commas) {
    delimiter = '\t'
  } else if (semicolons >= commas && semicolons > 0) {
    delimiter = ';'
  } else if (commas > 0) {
    delimiter = ','
  } else if (/\s+-\s+/.test(sample)) {
    delimiter = ' - '
  }

  return lines.map((line) => {
    if (delimiter === ' - ') {
      return line.split(/\s+-\s+/).map((c) => c.trim())
    }
    return line.split(delimiter).map((c) => c.trim())
  })
}

/**
 * Extrai RawParsedSchoolRow de qualquer matriz com ou sem cabeçalho
 */
export function parseMatrixToSchoolRows(matrix: string[][]): RawParsedSchoolRow[] {
  if (matrix.length === 0) return []

  const header = matrix[0] || []
  const { nomeIdx, enderecoIdx, tipoIdx, alunosIdx, telefoneIdx, emailIdx, bairroIdx, contatoIdx } =
    findColumnIndexes(header)

  const hasRecognizedHeader =
    nomeIdx !== -1 || enderecoIdx !== -1 || tipoIdx !== -1 || alunosIdx !== -1 || telefoneIdx !== -1

  if (hasRecognizedHeader) {
    // Com cabeçalho reconhecido
    const finalNomeIdx = nomeIdx !== -1 ? nomeIdx : 0
    const dataRows = matrix.slice(1)
    const rows: RawParsedSchoolRow[] = []

    dataRows.forEach((r, idx) => {
      const rawNome = r[finalNomeIdx] || ''
      if (!rawNome.trim()) return

      const rawAlunos = alunosIdx !== -1 ? r[alunosIdx] : undefined
      let parsedAlunos: number | undefined
      if (rawAlunos) {
        const p = parsePtBrNumber(rawAlunos)
        if (p.isValid && p.value >= 0) parsedAlunos = Math.round(p.value)
      }

      rows.push({
        index: idx + 1,
        nome: rawNome.trim(),
        tipo: tipoIdx !== -1 ? normalizeEscolaTipo(r[tipoIdx]) : undefined,
        alunos: parsedAlunos,
        endereco: enderecoIdx !== -1 ? r[enderecoIdx]?.trim() || undefined : undefined,
        telefone: telefoneIdx !== -1 ? r[telefoneIdx]?.trim() || undefined : undefined,
        email: emailIdx !== -1 ? r[emailIdx]?.trim() || undefined : undefined,
        bairro: bairroIdx !== -1 ? r[bairroIdx]?.trim() || undefined : undefined,
        contato: contatoIdx !== -1 ? r[contatoIdx]?.trim() || undefined : undefined,
      })
    })

    return rows
  }

  // Sem cabeçalho reconhecido:
  // Primeira coluna (ou coluna com mais texto) é o nome da escola; segunda coluna é endereço se houver
  const rows: RawParsedSchoolRow[] = []
  matrix.forEach((r, idx) => {
    // Encontrar coluna com mais texto entre as 2 primeiras
    let nome = (r[0] || '').trim()
    let endereco = (r[1] || '').trim() || undefined

    if (!nome && endereco) {
      nome = endereco
      endereco = undefined
    }

    if (nome) {
      // Se tiver traço ou ponto-e-vírgula dentro do próprio campo nome, tenta split secundário
      const sub = parseDelimitedTextLine(nome)
      if (sub.endereco && !endereco) {
        nome = sub.nome
        endereco = sub.endereco
      }

      rows.push({
        index: idx + 1,
        nome,
        endereco,
      })
    }
  })

  return rows
}

/**
 * Carrega e processa qualquer arquivo (.xlsx, .xls, .docx, .csv, .txt)
 */
export async function parseUploadedRouteSchoolsFile(file: File): Promise<RawParsedSchoolRow[]> {
  const nameLower = file.name.toLowerCase()

  if (nameLower.endsWith('.docx')) {
    const markdown = await extractDocxOrDocumentText(file)
    return parseMarkdownToSchoolRows(markdown)
  }

  if (nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls')) {
    const matrix = await parseExcelToMatrix(file)
    return parseMatrixToSchoolRows(matrix)
  }

  // CSV ou TXT
  const matrix = await parseTextOrCsvToMatrix(file)
  return parseMatrixToSchoolRows(matrix)
}

/**
 * Analisa a lista de escolas brutas contra:
 * 1. Cadastro Mestre global (normalização de nomes)
 * 2. Regra de EXCLUSIVIDADE de rota (bloquear se já estiver em outra rota)
 * 3. Rotas já vinculadas na rota de destino
 */
export function analyzeRouteSchoolsBatch(options: {
  fileName: string
  parsedRows: RawParsedSchoolRow[]
  targetRouteName: string
  targetRouteId?: string
  targetRouteType?: RouteType
  targetContract: Contract
  allContracts: Contract[]
  masterSchools: School[]
  paradasRota?: ParadaRotaRecord[]
  rotasLogisticas?: RotaLogisticaRecord[]
}): RouteSchoolBatchAnalysis {
  const {
    fileName,
    parsedRows,
    targetRouteName,
    targetRouteId,
    targetRouteType = 'planilha',
    targetContract,
    allContracts,
    masterSchools,
    paradasRota = [],
    rotasLogisticas = [],
  } = options

  // Construir mapa de alocação de rotas para todas as escolas dependendo do tipo da rota
  // escolaId -> { rotaNome, contratoNumero, isCurrentContract, isTargetRoute }
  const allocationMap = new Map<
    string,
    {
      contratoId?: string
      contratoNumero?: string
      isCurrentContract: boolean
      rotaNome: string
      isTargetRoute: boolean
    }
  >()

  const normTargetRoute = targetRouteName.trim().toLowerCase()

  if (targetRouteType === 'logistica') {
    // 1. CHECAGEM EXCLUSIVA PARA ROTAS LOGÍSTICAS:
    // Uma escola PODE estar em uma rota da planilha (ex: "ROTA A") E simultaneamente na rota logística (ex: "CENTRO").
    // Ela só é bloqueada se JÁ pertencer a OUTRA rota logística diferente da de destino!
    // A fonte de verdade das rotas logísticas é a collection `paradas_rota` (ou `contrato_escolas.rota_logistica_id`).

    // Mapear paradas_rota existentes
    const rotasLogById = new Map<string, RotaLogisticaRecord>()
    for (const rl of rotasLogisticas) {
      rotasLogById.set(rl.id, rl)
    }

    // Mapa de contratos por ID para formatar mensagens amigáveis
    const contractsById = new Map<string, Contract>()
    for (const c of allContracts) {
      contractsById.set(c.id, c)
    }

    for (const p of paradasRota) {
      const rotaLogObj = rotasLogById.get(p.rota_logistica_id) || p.expand?.rota_logistica_id
      const rlNome = (rotaLogObj?.nome || '').trim()
      const isTarget =
        p.rota_logistica_id === targetRouteId ||
        (normTargetRoute.length > 0 && rlNome.toLowerCase() === normTargetRoute)

      const rlContratoId = rotaLogObj?.contrato_id
      const contractObj = rlContratoId ? contractsById.get(rlContratoId) : undefined
      const isCur = rlContratoId ? rlContratoId === targetContract.id : true

      if (!allocationMap.has(p.escola_id) || isCur) {
        allocationMap.set(p.escola_id, {
          contratoId: rlContratoId,
          contratoNumero: contractObj?.numero || targetContract.numero,
          isCurrentContract: isCur,
          rotaNome: rlNome || 'Outra Rota Logística',
          isTargetRoute: isTarget,
        })
      }
    }

    // Também verificar se em contrato_escolas há rota_logistica_id preenchido não mapeado em paradasRota
    for (const c of allContracts) {
      const isCur = c.id === targetContract.id
      for (const e of c.escolas) {
        if (e.rotaLogisticaId && !allocationMap.has(e.escolaId)) {
          const rotaLogObj = rotasLogById.get(e.rotaLogisticaId)
          const rlNome = (e.rotaLogisticaNome || rotaLogObj?.nome || '').trim()
          const isTarget =
            e.rotaLogisticaId === targetRouteId ||
            (normTargetRoute.length > 0 && rlNome.toLowerCase() === normTargetRoute)

          allocationMap.set(e.escolaId, {
            contratoId: c.id,
            contratoNumero: c.numero,
            isCurrentContract: isCur,
            rotaNome: rlNome || 'Outra Rota Logística',
            isTargetRoute: isTarget,
          })
        }
      }
    }
  } else {
    // 2. CHECAGEM PARA ROTAS DA PLANILHA (ContractRouteSchoolEditorDialog):
    // Mantém a exclusividade original: escola só entra em uma rota da planilha se não estiver em outra rota de planilha.
    for (const c of allContracts) {
      const isCur = c.id === targetContract.id
      for (const e of c.escolas) {
        const rNome = (e.rotaPlanilha || e.rotaNome || '').trim()
        if (rNome && rNome !== 'Sem Rota') {
          const isTarget = isCur && rNome.toLowerCase() === normTargetRoute
          // Prioriza o contrato atual
          if (!allocationMap.has(e.escolaId) || isCur) {
            allocationMap.set(e.escolaId, {
              contratoId: c.id,
              contratoNumero: c.numero,
              isCurrentContract: isCur,
              rotaNome: rNome,
              isTargetRoute: isTarget,
            })
          }
        }
      }
    }
  }

  // Mapa de escolas mestre por nome normalizado
  const masterByNorm = new Map<string, School>()
  for (const s of masterSchools) {
    const n = normalizeName(s.name)
    if (n && !masterByNorm.has(n)) {
      masterByNorm.set(n, s)
    }
  }

  const items: RouteSchoolBatchItem[] = []
  const blockedItems: RouteSchoolBatchItem[] = []
  const seenInBatch = new Set<string>()

  let toCreate = 0
  let toUpdate = 0
  let toLinkOnly = 0
  let blockedCount = 0

  for (const row of parsedRows) {
    const rawNome = row.nome.trim()
    if (!rawNome) continue

    const norm = normalizeName(rawNome)
    if (!norm) continue

    // Evitar duplicidade dentro do próprio arquivo analisado
    if (seenInBatch.has(norm)) continue
    seenInBatch.add(norm)

    // 1. Verificar se existe no cadastro mestre
    let master = masterByNorm.get(norm)
    if (!master) {
      // Fallback sem parênteses
      const normNoParen = normalizeName(stripParentheses(rawNome))
      if (normNoParen) {
        master = Array.from(masterByNorm.values()).find(
          (m) => normalizeName(stripParentheses(m.name)) === normNoParen,
        )
      }
    }

    const isExistingMaster = Boolean(master)
    const masterSchoolId = master?.id
    const masterSchoolName = master?.name

    // 2. Verificar REGRA DE EXCLUSIVIDADE se já estiver no mestre
    let isBlocked = false
    let blockReason: string | undefined
    let currentAllocatedRoute: string | undefined
    let currentAllocatedContract: string | undefined

    if (masterSchoolId) {
      const alloc = allocationMap.get(masterSchoolId)
      if (alloc) {
        currentAllocatedRoute = alloc.rotaNome
        currentAllocatedContract = alloc.contratoNumero

        if (alloc.isTargetRoute) {
          // Já está alocada exatamente nesta rota de destino
          // Não bloqueia com erro impeditivo, mas trata como link já existente
        } else {
          // Bloqueio de exclusividade estrito: alocada a OUTRA rota/aba
          isBlocked = true
          const prefixoTipo = targetRouteType === 'logistica' ? 'rota logística' : 'aba'
          if (alloc.isCurrentContract) {
            blockReason = `Já alocada na ${prefixoTipo} "${alloc.rotaNome}" deste contrato.`
          } else if (alloc.contratoNumero) {
            blockReason = `Já alocada na ${prefixoTipo} "${alloc.rotaNome}" do Contrato ${alloc.contratoNumero}.`
          } else {
            blockReason = `Já alocada na ${prefixoTipo} "${alloc.rotaNome}".`
          }
        }
      }
    }

    let action: RouteSchoolBatchItem['action'] = 'create_and_link'
    if (isBlocked) {
      action = 'blocked'
      blockedCount++
    } else if (isExistingMaster) {
      // Já existe no mestre: se houver campos complementares (endereço, telefone, etc.), atualiza
      const hasComplementaryData = Boolean(
        row.endereco ||
        row.telefone ||
        row.email ||
        row.bairro ||
        row.contato ||
        row.tipo ||
        row.alunos,
      )
      if (hasComplementaryData) {
        action = 'update_and_link'
        toUpdate++
      } else {
        action = 'link_only'
        toLinkOnly++
      }
    } else {
      action = 'create_and_link'
      toCreate++
    }

    const item: RouteSchoolBatchItem = {
      index: row.index,
      nome: rawNome,
      tipo: row.tipo,
      alunos: row.alunos,
      endereco: row.endereco,
      telefone: row.telefone,
      email: row.email,
      bairro: row.bairro,
      contato: row.contato,
      isExistingMaster,
      masterSchoolId,
      masterSchoolName,
      isBlocked,
      blockReason,
      currentAllocatedRoute,
      currentAllocatedContract,
      action,
    }

    items.push(item)
    if (isBlocked) {
      blockedItems.push(item)
    }
  }

  return {
    fileName,
    targetRouteType,
    totalFound: items.length,
    toCreate,
    toUpdate,
    toLinkOnly,
    blockedCount,
    items,
    blockedItems,
  }
}

/**
 * Executa a gravação em lote no banco:
 * 1. Cria novas escolas no mestre (SEM rota global)
 * 2. Atualiza escolas existentes no mestre (apenas campos preenchidos, preservando vazios)
 * 3. Cria vínculo em contrato_escolas na rota de destino
 * 4. Pula escolas bloqueadas por exclusividade
 */
export async function executeRouteSchoolsBatchImport(options: {
  analysis: RouteSchoolBatchAnalysis
  targetRouteName: string
  targetRouteId?: string
  targetRouteType?: RouteType
  targetContractId: string
  currentParadasRota?: ParadaRotaRecord[]
  onProgress?: (processed: number, total: number) => void
}): Promise<RouteSchoolImportResult> {
  const {
    analysis,
    targetRouteName,
    targetRouteId,
    targetRouteType = analysis.targetRouteType || 'planilha',
    targetContractId,
    currentParadasRota = [],
    onProgress,
  } = options

  let createdCount = 0
  let updatedCount = 0
  let linkedCount = 0
  const blockedList: Array<{ nome: string; motivo: string }> = []
  const newlyLinkedSchoolIds: string[] = []

  const eligibleItems = analysis.items.filter((item) => !item.isBlocked)

  // Registrar bloqueados no relatório final
  analysis.blockedItems.forEach((b) => {
    blockedList.push({
      nome: b.nome,
      motivo:
        b.blockReason ||
        (targetRouteType === 'planilha'
          ? 'Bloqueada por já estar alocada em outra aba.'
          : 'Bloqueada por já estar alocada em outra rota.'),
    })
  })

  for (let i = 0; i < eligibleItems.length; i++) {
    const item = eligibleItems[i]
    let schoolId = item.masterSchoolId

    try {
      if (item.action === 'create_and_link' || !schoolId) {
        // 1. Criar no cadastro mestre SEM rota (rota vive no vínculo)
        const created = await escolasService.create({
          nome: item.nome.trim(),
          endereco: item.endereco || '',
          telefone: item.telefone || '',
          email: item.email || '',
          bairro: item.bairro || '',
          contato: item.contato || '',
          tipo: (item.tipo as any) || '',
          alunos: item.alunos || 0,
          rota: '', // obrigatório: sem rota no cadastro mestre
        })
        schoolId = created.id
        createdCount++
      } else if (item.action === 'update_and_link' && schoolId) {
        // 2. Atualizar seletivamente dados existentes no cadastro mestre
        const updatePayload: Record<string, any> = {}
        if (item.endereco) updatePayload.endereco = item.endereco
        if (item.telefone) updatePayload.telefone = item.telefone
        if (item.email) updatePayload.email = item.email
        if (item.bairro) updatePayload.bairro = item.bairro
        if (item.contato) updatePayload.contato = item.contato
        if (item.tipo) updatePayload.tipo = item.tipo
        if (item.alunos !== undefined) updatePayload.alunos = item.alunos

        if (Object.keys(updatePayload).length > 0) {
          await pb.collection('escolas').update(schoolId, updatePayload)
          updatedCount++
        }
      }

      // 3. Vincular escola à rota
      if (schoolId) {
        if (targetRouteType === 'logistica') {
          // Vínculo para ROTA LOGÍSTICA:
          // A) Garante que o vínculo contrato_escolas exista e seta rota_logistica_id
          // SEM alterar o campo rota/rota_id da planilha se ele já existir!
          await contratosService.updateEscolaRotaLogisticaByContratoEscola(
            targetContractId,
            schoolId,
            targetRouteId || '',
          )

          // B) Se tiver targetRouteId, adiciona em paradas_rota
          if (targetRouteId) {
            // Determinar próxima ordem
            const nextOrdem =
              currentParadasRota.filter((p) => p.rota_logistica_id === targetRouteId).length +
              newlyLinkedSchoolIds.length +
              1

            await rotasLogisticasService.salvarParada({
              rota_logistica_id: targetRouteId,
              escola_id: schoolId,
              ordem: nextOrdem,
            })
          }
        } else {
          // Vínculo para ROTA DA PLANILHA DO CONTRATO:
          await contratosService.linkEscola({
            contrato_id: targetContractId,
            escola_id: schoolId,
            rota_id: targetRouteId || undefined,
            rota: targetRouteName,
          })
        }
        linkedCount++
        newlyLinkedSchoolIds.push(schoolId)
      }
    } catch (err: any) {
      console.error(`Erro ao importar escola da rota "${item.nome}":`, err)
      blockedList.push({
        nome: item.nome,
        motivo: err?.message || 'Falha ao salvar no banco.',
      })
    }

    onProgress?.(i + 1, eligibleItems.length)
  }

  return {
    totalProcessed: analysis.totalFound,
    createdCount,
    updatedCount,
    linkedCount,
    blockedCount: analysis.blockedCount + (blockedList.length - analysis.blockedCount),
    blockedList,
    newlyLinkedSchoolIds,
  }
}
