import type { EscolaTipo } from '@/lib/types'
import { normalizeName } from '@/lib/excelImporter'
import { parsePtBrNumber } from '@/lib/numberParser'
import { dePluralizeName } from '@/lib/productCsvImporter'
import * as XLSX from 'xlsx'

export type BlankFieldMode = 'clear' | 'keep'

export interface SchoolFieldChange {
  field: 'tipo' | 'alunos' | 'endereco' | 'telefone' | 'email' | 'bairro' | 'contato'
  label: string
  oldValue: string
  newValue: string
  isCleared?: boolean
}

export interface ParsedCsvSchoolRow {
  index: number
  rawNome: string
  rawTipo: string
  rawRota: string
  rawAlunos: string
  rawEndereco: string
  rawTelefone: string
  rawEmail: string
  rawBairro: string
  rawContato: string
  // Mapeados
  nome: string
  tipo: EscolaTipo | ''
  rota: string
  alunos?: number
  endereco?: string
  telefone?: string
  email?: string
  bairro?: string
  contato?: string
  // Dados do registro existente quando status for 'update'
  existingSchoolId?: string
  existingSchoolName?: string
  fieldChanges?: SchoolFieldChange[]
  // Indicação de quais colunas estavam presentes no arquivo/colagem
  presentColumns: {
    tipo: boolean
    alunos: boolean
    endereco: boolean
    telefone: boolean
    email: boolean
    bairro: boolean
    contato: boolean
  }
  // Contagem de células em branco em colunas reconhecidas presentes
  blankPresentFieldsCount: number
  blankPresentFieldsList: string[]
  // Validações
  status: 'valid' | 'update' | 'duplicate_master' | 'duplicate_file' | 'error'
  statusReason?: string
  warnings: string[]
}

export interface CsvParseResult {
  fileName: string
  totalRows: number
  validRows: ParsedCsvSchoolRow[]
  updateRows: ParsedCsvSchoolRow[]
  duplicateMasterCount: number
  duplicateFileCount: number
  errorCount: number
  allRows: ParsedCsvSchoolRow[]
  // Informações de colunas e campos em branco
  recognizedHeaders: {
    firstColumn: string
    isFirstColumnSchoolName: boolean
    presentColumns: {
      nome: boolean
      tipo: boolean
      alunos: boolean
      endereco: boolean
      telefone: boolean
      email: boolean
      bairro: boolean
      contato: boolean
    }
  }
  blankStats: {
    totalBlankCellsInPresentCols: number
    updateRowsWithBlankInPresentCols: number
    fieldsBlankCount: {
      tipo: number
      alunos: number
      endereco: number
      telefone: number
      email: number
      bairro: number
      contato: number
    }
  }
}

/**
 * Normaliza o tipo vindo do CSV para os 4 tipos exatos da planilha da secretaria:
 * 'CMEI' | 'CRECHE' | 'INTEGRAL' | 'FUNDAMENTAL' (ou '' se vazio/não informado)
 *
 * O valor da coluna "tipo" do arquivo deve ser gravado exatamente como vem, sem agrupar categorias.
 */
export function normalizeEscolaTipo(rawTipo: string): EscolaTipo | '' {
  if (!rawTipo) return ''
  const trimmed = rawTipo.trim().toUpperCase()

  if (trimmed === 'CMEI') return 'CMEI'
  if (trimmed === 'CRECHE') return 'CRECHE'
  if (trimmed === 'INTEGRAL') return 'INTEGRAL'
  if (trimmed === 'FUNDAMENTAL') return 'FUNDAMENTAL'

  const norm = normalizeName(rawTipo).toUpperCase()
  if (!norm) return ''

  if (norm === 'CMEI' || norm.includes('CMEI')) {
    return 'CMEI'
  }
  if (norm === 'CRECHE' || norm.includes('CRECHE')) {
    return 'CRECHE'
  }
  if (norm === 'INTEGRAL' || norm.includes('INTEGRAL')) {
    return 'INTEGRAL'
  }
  if (norm === 'FUNDAMENTAL' || norm.includes('FUNDAMENTAL')) {
    return 'FUNDAMENTAL'
  }

  return ''
}

/**
 * Parser de texto CSV com suporte a:
 * - Aspas duplas com vírgula ou newline dentro
 * - Vírgula ou ponto-e-vírgula como separador
 * - UTF-8 com BOM
 */
export function parseCsvTextToMatrix(text: string): string[][] {
  // Remover UTF-8 BOM se presente
  let clean = text
  if (clean.charCodeAt(0) === 0xfeff) {
    clean = clean.slice(1)
  }

  const lines = clean.split(/\r?\n/)
  if (lines.length === 0) return []

  // Detectar separador olhando a primeira linha não vazia
  const firstNonEmpty = lines.find((l) => l.trim().length > 0) || ''
  const semicolonCount = (firstNonEmpty.match(/;/g) || []).length
  const commaCount = (firstNonEmpty.match(/,/g) || []).length
  const delimiter = semicolonCount > commaCount ? ';' : ','

  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let insideQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]
    const nextChar = clean[i + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"'
        i++ // pula aspas escapadas
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentField.trim())
      currentField = ''
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++
      }
      currentRow.push(currentField.trim())
      // Só adiciona se houver algum conteúdo na linha
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow)
      }
      currentRow = []
      currentField = ''
    } else {
      currentField += char
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow)
    }
  }

  return rows
}

/**
 * Mapeia cabeçalhos para os campos esperados:
 * 'nome', 'tipo', 'rota', 'alunos', 'endereco', 'telefone', 'email'
 */
/**
 * Detecta se uma string se parece fortemente com número de telefone
 * Ex.: "(21) 2043-3612", "21 98765-4321", "2043-3612", "+55 21 9999-9999", "(21)20433612"
 */
export function looksLikePhoneNumber(val: string): boolean {
  if (!val) return false
  const trimmed = val.trim()
  if (!trimmed) return false

  // Se tiver letras de texto comum (ex.: "Bairro Novo", "Centro", "Rua das Flores"), não é apenas telefone
  if (/[a-zA-ZáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/.test(trimmed)) {
    return false
  }

  const digits = trimmed.replace(/\D/g, '')
  // Telefones no Brasil têm tipicamente entre 8 e 13 dígitos
  if (digits.length >= 8 && digits.length <= 13) {
    if (
      /\(\d{2}\)/.test(trimmed) ||
      /\d{4,5}[-\s]\d{4}/.test(trimmed) ||
      /^\+?\d{8,13}$/.test(digits)
    ) {
      return true
    }
  }

  return false
}

/**
 * Mapeia cabeçalhos para os campos esperados EXCLUSIVAMENTE pelo texto do cabeçalho.
 * Tolerante a acentos e maiúsculas/minúsculas.
 * NUNCA usa ordem fixa ou posicional.
 *
 * Campos esperados pelo usuário:
 * Nome da Escola | Tipo | Rota | Nº Alunos | Telefone | Bairro | Endereço | Contato | E-mail
 */
export function findColumnIndexes(headerRow: string[]): {
  nomeIdx: number
  tipoIdx: number
  rotaIdx: number
  alunosIdx: number
  enderecoIdx: number
  telefoneIdx: number
  emailIdx: number
  bairroIdx: number
  contatoIdx: number
} {
  let nomeIdx = -1
  let tipoIdx = -1
  let rotaIdx = -1
  let alunosIdx = -1
  let enderecoIdx = -1
  let telefoneIdx = -1
  let emailIdx = -1
  let bairroIdx = -1
  let contatoIdx = -1

  headerRow.forEach((col, idx) => {
    const norm = normalizeName(col)
    if (!norm) return

    // 1. Telefone: checado com prioridade sobre contato genérico
    if (
      telefoneIdx === -1 &&
      (norm === 'telefone' ||
        norm === 'tel' ||
        norm === 'fone' ||
        norm === 'celular' ||
        norm === 'whatsapp' ||
        norm === 'telefone whatsapp' ||
        norm.includes('telefone') ||
        norm.includes('celular') ||
        norm.includes('whatsapp') ||
        norm.includes('fone') ||
        norm === 'tel contato' ||
        norm === 'contato telefonico')
    ) {
      telefoneIdx = idx
      return
    }

    // 2. E-mail
    if (
      emailIdx === -1 &&
      (norm === 'email' ||
        norm === 'e mail' ||
        norm.includes('email') ||
        norm.includes('correio eletr'))
    ) {
      emailIdx = idx
      return
    }

    // 3. Bairro
    if (
      bairroIdx === -1 &&
      (norm === 'bairro' ||
        norm.includes('bairro') ||
        norm.includes('distrito') ||
        norm.includes('comunidade'))
    ) {
      bairroIdx = idx
      return
    }

    // 4. Endereço
    if (
      enderecoIdx === -1 &&
      (norm === 'endereco' ||
        norm.includes('logradouro') ||
        norm.includes('rua') ||
        norm.includes('localizac'))
    ) {
      enderecoIdx = idx
      return
    }

    // 5. Contato (responsável/gestor/diretor)
    if (
      contatoIdx === -1 &&
      (norm === 'contato' ||
        norm.includes('responsavel') ||
        norm.includes('diretor') ||
        norm.includes('gestor') ||
        norm.includes('pessoa de contato') ||
        norm === 'nome contato' ||
        norm === 'contato responsavel' ||
        norm === 'nome do contato')
    ) {
      contatoIdx = idx
      return
    }

    // 6. Nome da Escola
    if (
      nomeIdx === -1 &&
      (norm === 'nome da escola' ||
        norm === 'nome escola' ||
        norm === 'escola' ||
        norm === 'nome' ||
        norm.includes('escola') ||
        norm.includes('instituic') ||
        norm.includes('unidade escolar'))
    ) {
      nomeIdx = idx
      return
    }

    // 7. Tipo
    if (
      tipoIdx === -1 &&
      (norm === 'tipo' ||
        norm === 'tipo escola' ||
        norm.includes('categoria') ||
        norm.includes('etapa') ||
        norm.includes('modalidade'))
    ) {
      tipoIdx = idx
      return
    }

    // 8. Rota
    if (
      rotaIdx === -1 &&
      (norm === 'rota' ||
        norm === 'rota planilha' ||
        norm.includes('roteiro') ||
        norm.includes('linha'))
    ) {
      rotaIdx = idx
      return
    }

    // 9. Nº de Alunos
    if (
      alunosIdx === -1 &&
      (norm === 'alunos' ||
        norm === 'n alunos' ||
        norm === 'no alunos' ||
        norm === 'num alunos' ||
        norm === 'numero alunos' ||
        norm === 'numero de alunos' ||
        norm.includes('aluno') ||
        norm.includes('estudant') ||
        norm.includes('matricul') ||
        norm.includes('qtd'))
    ) {
      alunosIdx = idx
      return
    }
  })

  // Regra estrita: resolução EXCLUSIVAMENTE pelo texto do cabeçalho.
  // Sem fallbacks posicionais que possam deslocar colunas.
  return {
    nomeIdx,
    tipoIdx,
    rotaIdx,
    alunosIdx,
    enderecoIdx,
    telefoneIdx,
    emailIdx,
    bairroIdx,
    contatoIdx,
  }
}

export interface ExistingSchoolData {
  id: string
  nome: string
  tipo?: string
  rota?: string
  alunos?: number
  endereco?: string
  telefone?: string
  email?: string
  bairro?: string
  contato?: string
}

export interface ParseSchoolsOptions {
  fileOrText: File | string
  fileName?: string
  existingMasterSchools: ExistingSchoolData[]
  blankMode?: BlankFieldMode // 'keep' (padrão) ou 'clear'
}

/**
 * Executa o parsing e validação de escolas a partir de arquivo (.csv/.xlsx) ou texto colado.
 *
 * Regras aplicadas:
 * 1. Nome da escola é OBRIGATÓRIO (linha sem nome vira erro e não é gravada).
 * 2. Cabeçalhos flexíveis tolerantes a acentos/maiúsculas.
 * 3. Matching com escolas existentes por nome normalizado (tolerante a acentos, maiúsculas, singular/plural).
 * 4. ATUALIZAÇÃO SELETIVA: Se a célula vier em branco e a escola já existir, preserva o valor já existente.
 * 5. Detecção de fieldChanges campo a campo ("De → Para") para o preview.
 * 6. Suporte aos novos campos "bairro" e "contato".
 */
export async function parseSchoolsInput(options: ParseSchoolsOptions): Promise<CsvParseResult> {
  const { fileOrText, fileName = 'dados_colados', existingMasterSchools } = options

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

  const { blankMode = 'keep' } = options

  // Detectar cabeçalho na primeira linha
  const header = rawMatrix[0] || []
  if (header.length === 0) {
    throw new Error('Linha de cabeçalho vazia ou não encontrada.')
  }

  const {
    nomeIdx,
    tipoIdx,
    rotaIdx,
    alunosIdx,
    enderecoIdx,
    telefoneIdx,
    emailIdx,
    bairroIdx,
    contatoIdx,
  } = findColumnIndexes(header)

  // REGRA 1: "A primeira coluna é obrigatoriamente o nome da escola (se não for, rejeite com mensagem clara)"
  const firstColText = (header[0] || '').trim()
  const firstColNorm = normalizeName(firstColText)
  const isFirstColSchoolName =
    nomeIdx === 0 &&
    (firstColNorm === 'nome da escola' ||
      firstColNorm === 'nome escola' ||
      firstColNorm === 'escola' ||
      firstColNorm === 'nome' ||
      firstColNorm.includes('escola') ||
      firstColNorm.includes('instituic') ||
      firstColNorm.includes('unidade escolar'))

  if (!isFirstColSchoolName) {
    throw new Error(
      `A primeira coluna da planilha deve ser obrigatoriamente o nome da escola. A coluna encontrada foi "${firstColText || '[coluna vazia]'}". Por favor, organize a planilha para que a coluna 1 contenha o "Nome da Escola".`,
    )
  }

  const dataRows = rawMatrix.slice(1)
  if (dataRows.length === 0) {
    throw new Error('O arquivo contém apenas a linha de cabeçalho, sem dados de escolas.')
  }

  // Identificar quais colunas existem no cabeçalho (ROTA é intencionalmente ignorada no cadastro mestre)
  const presentColumns = {
    tipo: tipoIdx !== -1,
    alunos: alunosIdx !== -1,
    endereco: enderecoIdx !== -1,
    telefone: telefoneIdx !== -1,
    email: emailIdx !== -1,
    bairro: bairroIdx !== -1,
    contato: contatoIdx !== -1,
  }

  // Mapear escolas mestre existentes para normalização
  // 1. Mapa direto por normalizeName
  const masterSchoolsByNorm = new Map<string, ExistingSchoolData>()
  // 2. Mapa por despluralização (fallback)
  const masterSchoolsByDePlural = new Map<string, ExistingSchoolData>()

  for (const s of existingMasterSchools) {
    const n = normalizeName(s.nome)
    if (n) {
      if (!masterSchoolsByNorm.has(n)) {
        masterSchoolsByNorm.set(n, s)
      }
      const deplural = dePluralizeName(n)
      if (deplural && !masterSchoolsByDePlural.has(deplural)) {
        masterSchoolsByDePlural.set(deplural, s)
      }
    }
  }

  // Rastrear duplicidades dentro do próprio arquivo/colagem
  const seenInFile = new Map<string, number>() // normName -> firstRowIndex

  const allRows: ParsedCsvSchoolRow[] = []
  let duplicateMasterCount = 0
  let duplicateFileCount = 0
  let errorCount = 0

  dataRows.forEach((row, rowIdx) => {
    // Ignorar linhas totalmente vazias
    if (row.every((c) => !c || c.trim() === '')) return

    const rawNome = row[0] !== undefined ? String(row[0]).trim() : ''
    const rawTipo = tipoIdx !== -1 && row[tipoIdx] !== undefined ? String(row[tipoIdx]).trim() : ''
    const rawRota = rotaIdx !== -1 && row[rotaIdx] !== undefined ? String(row[rotaIdx]).trim() : ''
    const rawAlunos =
      alunosIdx !== -1 && row[alunosIdx] !== undefined ? String(row[alunosIdx]).trim() : ''
    const rawEndereco =
      enderecoIdx !== -1 && row[enderecoIdx] !== undefined ? String(row[enderecoIdx]).trim() : ''
    const rawTelefone =
      telefoneIdx !== -1 && row[telefoneIdx] !== undefined ? String(row[telefoneIdx]).trim() : ''
    const rawEmail =
      emailIdx !== -1 && row[emailIdx] !== undefined ? String(row[emailIdx]).trim() : ''
    const rawBairro =
      bairroIdx !== -1 && row[bairroIdx] !== undefined ? String(row[bairroIdx]).trim() : ''
    const rawContato =
      contatoIdx !== -1 && row[contatoIdx] !== undefined ? String(row[contatoIdx]).trim() : ''

    const warnings: string[] = []
    let status: ParsedCsvSchoolRow['status'] = 'valid'
    let statusReason: string | undefined

    // 1. Validação de nome OBRIGATÓRIO
    if (!rawNome) {
      status = 'error'
      statusReason = 'Nome da escola em branco ou inválido (campo obrigatório).'
      errorCount++
      allRows.push({
        index: rowIdx + 2, // 1-based considerando cabeçalho na linha 1
        rawNome,
        rawTipo,
        rawRota,
        rawAlunos,
        rawEndereco,
        rawTelefone,
        rawEmail,
        rawBairro,
        rawContato,
        nome: '',
        tipo: '',
        rota: '',
        presentColumns,
        blankPresentFieldsCount: 0,
        blankPresentFieldsList: [],
        status,
        statusReason,
        warnings,
      })
      return
    }

    const normNome = normalizeName(rawNome)

    // 2. Validação de duplicidade contra o próprio arquivo/colagem
    if (seenInFile.has(normNome)) {
      status = 'duplicate_file'
      statusReason = `Duplicada no próprio arquivo (já apareceu na linha ${seenInFile.get(normNome)}).`
      duplicateFileCount++
    } else {
      seenInFile.set(normNome, rowIdx + 2)
    }

    // 3. Mapeamento de tipo
    const mappedTipo = normalizeEscolaTipo(rawTipo)
    if (rawTipo && !mappedTipo) {
      warnings.push(
        `Tipo "${rawTipo}" não reconhecido como CMEI, CRECHE, INTEGRAL ou FUNDAMENTAL. Campo ficará vazio.`,
      )
    }

    // 4. Mapeamento de alunos
    let mappedAlunos: number | undefined
    if (rawAlunos) {
      const parsedAlunos = parsePtBrNumber(rawAlunos)
      if (!parsedAlunos.isValid || parsedAlunos.value < 0) {
        warnings.push(`Número de alunos "${rawAlunos}" não numérico.`)
      } else {
        mappedAlunos = Math.round(parsedAlunos.value)
      }
    }

    // 5. Rota: no cadastro mestre, rota NÃO é atributo do cadastro global.
    // Ignora completamente qualquer valor da coluna rota (não cria, não limpa, não atualiza).
    const mappedRota = ''

    // 6. Endereço, telefone, e-mail, bairro e contato
    const mappedEndereco = rawEndereco || undefined
    const mappedTelefone = rawTelefone || undefined
    const mappedEmail = rawEmail || undefined
    const mappedBairro = rawBairro || undefined
    const mappedContato = rawContato || undefined

    // 6.1 Detecção defensiva: se Bairro contiver valor com formato claro de telefone e Telefone estiver vazio
    if (rawBairro && looksLikePhoneNumber(rawBairro) && !rawTelefone) {
      warnings.push(
        `A coluna Bairro contém o valor "${rawBairro}", que se parece com um telefone, enquanto a coluna Telefone veio em branco. Verifique se as colunas da planilha estão invertidas.`,
      )
    }

    // 7. Verificação contra o banco mestre: se já existe, vira 'update' (upsert com preservação de branco)
    let existingSchoolId: string | undefined
    let existingSchoolName: string | undefined
    const fieldChanges: SchoolFieldChange[] = []

    if (status === 'valid') {
      let existing = masterSchoolsByNorm.get(normNome)
      if (!existing) {
        const deplural = dePluralizeName(normNome)
        if (deplural) {
          existing = masterSchoolsByDePlural.get(deplural)
        }
      }

      if (existing) {
        status = 'update'
        existingSchoolId = existing.id
        existingSchoolName = existing.nome

        // REGRA DE ATUALIZAÇÃO SELETIVA / CAMPO EM BRANCO (REGRA 2):
        // Se a coluna estiver presente no cabeçalho:
        //  - se tiver valor preenchido, atualiza se diferente do valor existente
        //  - se estiver em branco:
        //      * blankMode === 'clear' -> limpa campo no banco (se antes tinha valor)
        //      * blankMode === 'keep'  -> mantém valor anterior (não altera)

        // Tipo:
        if (presentColumns.tipo) {
          const oldT = existing.tipo || ''
          if (rawTipo) {
            const newT = mappedTipo || ''
            if (oldT !== newT) {
              fieldChanges.push({
                field: 'tipo',
                label: 'Tipo',
                oldValue: oldT || '(vazio)',
                newValue: newT || '(vazio)',
              })
            }
          } else if (blankMode === 'clear' && oldT) {
            fieldChanges.push({
              field: 'tipo',
              label: 'Tipo',
              oldValue: oldT,
              newValue: '(limpar)',
              isCleared: true,
            })
          }
        }

        // Alunos:
        if (presentColumns.alunos) {
          const oldA =
            existing.alunos !== undefined && existing.alunos !== null ? String(existing.alunos) : ''
          if (rawAlunos && mappedAlunos !== undefined) {
            const newA = String(mappedAlunos)
            if (oldA !== newA) {
              fieldChanges.push({
                field: 'alunos',
                label: 'Alunos',
                oldValue: oldA || '(vazio)',
                newValue: newA,
              })
            }
          } else if (blankMode === 'clear' && oldA) {
            fieldChanges.push({
              field: 'alunos',
              label: 'Alunos',
              oldValue: oldA,
              newValue: '(limpar)',
              isCleared: true,
            })
          }
        }

        // Endereço:
        if (presentColumns.endereco) {
          const oldEnd = existing.endereco || ''
          if (rawEndereco) {
            const newEnd = rawEndereco
            if (oldEnd !== newEnd) {
              fieldChanges.push({
                field: 'endereco',
                label: 'Endereço',
                oldValue: oldEnd || '(vazio)',
                newValue: newEnd,
              })
            }
          } else if (blankMode === 'clear' && oldEnd) {
            fieldChanges.push({
              field: 'endereco',
              label: 'Endereço',
              oldValue: oldEnd,
              newValue: '(limpar)',
              isCleared: true,
            })
          }
        }

        // Telefone:
        if (presentColumns.telefone) {
          const oldTel = existing.telefone || ''
          if (rawTelefone) {
            const newTel = rawTelefone
            if (oldTel !== newTel) {
              fieldChanges.push({
                field: 'telefone',
                label: 'Telefone',
                oldValue: oldTel || '(vazio)',
                newValue: newTel,
              })
            }
          } else if (blankMode === 'clear' && oldTel) {
            fieldChanges.push({
              field: 'telefone',
              label: 'Telefone',
              oldValue: oldTel,
              newValue: '(limpar)',
              isCleared: true,
            })
          }
        }

        // E-mail:
        if (presentColumns.email) {
          const oldMail = existing.email || ''
          if (rawEmail) {
            const newMail = rawEmail
            if (oldMail !== newMail) {
              fieldChanges.push({
                field: 'email',
                label: 'E-mail',
                oldValue: oldMail || '(vazio)',
                newValue: newMail,
              })
            }
          } else if (blankMode === 'clear' && oldMail) {
            fieldChanges.push({
              field: 'email',
              label: 'E-mail',
              oldValue: oldMail,
              newValue: '(limpar)',
              isCleared: true,
            })
          }
        }

        // Bairro:
        if (presentColumns.bairro) {
          const oldBairro = existing.bairro || ''
          if (rawBairro) {
            const newBairro = rawBairro
            if (oldBairro !== newBairro) {
              fieldChanges.push({
                field: 'bairro',
                label: 'Bairro',
                oldValue: oldBairro || '(vazio)',
                newValue: newBairro,
              })
            }
          } else if (blankMode === 'clear' && oldBairro) {
            fieldChanges.push({
              field: 'bairro',
              label: 'Bairro',
              oldValue: oldBairro,
              newValue: '(limpar)',
              isCleared: true,
            })
          }
        }

        // Contato:
        if (presentColumns.contato) {
          const oldContato = existing.contato || ''
          if (rawContato) {
            const newContato = rawContato
            if (oldContato !== newContato) {
              fieldChanges.push({
                field: 'contato',
                label: 'Contato',
                oldValue: oldContato || '(vazio)',
                newValue: newContato,
              })
            }
          } else if (blankMode === 'clear' && oldContato) {
            fieldChanges.push({
              field: 'contato',
              label: 'Contato',
              oldValue: oldContato,
              newValue: '(limpar)',
              isCleared: true,
            })
          }
        }

        if (fieldChanges.length > 0) {
          const changedNames = fieldChanges.map((f) => f.label).join(', ')
          statusReason = `Escola existente no cadastro ("${existing.nome}"); atualizará: ${changedNames}.`
        } else {
          statusReason =
            blankMode === 'clear'
              ? `Escola existente no cadastro ("${existing.nome}"); dados idênticos e sem campos a limpar.`
              : `Escola existente no cadastro ("${existing.nome}"); dados idênticos ou colunas em branco mantendo o valor gravado.`
        }
      }
    }

    // Identificar quais campos presentes nesta linha vieram em branco (rota ignorada)
    const blankPresentFieldsList: string[] = []
    if (presentColumns.tipo && !rawTipo) blankPresentFieldsList.push('Tipo')
    if (presentColumns.alunos && !rawAlunos) blankPresentFieldsList.push('Nº Alunos')
    if (presentColumns.telefone && !rawTelefone) blankPresentFieldsList.push('Telefone')
    if (presentColumns.bairro && !rawBairro) blankPresentFieldsList.push('Bairro')
    if (presentColumns.endereco && !rawEndereco) blankPresentFieldsList.push('Endereço')
    if (presentColumns.contato && !rawContato) blankPresentFieldsList.push('Contato')
    if (presentColumns.email && !rawEmail) blankPresentFieldsList.push('E-mail')

    allRows.push({
      index: rowIdx + 2,
      rawNome,
      rawTipo,
      rawRota,
      rawAlunos,
      rawEndereco,
      rawTelefone,
      rawEmail,
      rawBairro,
      rawContato,
      nome: rawNome,
      tipo: mappedTipo,
      rota: mappedRota,
      alunos: mappedAlunos,
      endereco: mappedEndereco,
      telefone: mappedTelefone,
      email: mappedEmail,
      bairro: mappedBairro,
      contato: mappedContato,
      existingSchoolId,
      existingSchoolName,
      fieldChanges,
      presentColumns,
      blankPresentFieldsCount: blankPresentFieldsList.length,
      blankPresentFieldsList,
      status,
      statusReason,
      warnings,
    })
  })

  const validRows = allRows.filter((r) => r.status === 'valid')
  const updateRows = allRows.filter((r) => r.status === 'update')

  // Estatísticas de campos em branco em colunas reconhecidas e presentes
  const fieldsBlankCount = {
    tipo: 0,
    alunos: 0,
    endereco: 0,
    telefone: 0,
    email: 0,
    bairro: 0,
    contato: 0,
  }
  let totalBlankCellsInPresentCols = 0
  let updateRowsWithBlankInPresentCols = 0

  allRows.forEach((r) => {
    if (r.status === 'error' || r.status === 'duplicate_file') return
    let rowHasBlank = false

    if (presentColumns.tipo && !r.rawTipo) {
      fieldsBlankCount.tipo++
      totalBlankCellsInPresentCols++
      rowHasBlank = true
    }
    if (presentColumns.alunos && !r.rawAlunos) {
      fieldsBlankCount.alunos++
      totalBlankCellsInPresentCols++
      rowHasBlank = true
    }
    if (presentColumns.endereco && !r.rawEndereco) {
      fieldsBlankCount.endereco++
      totalBlankCellsInPresentCols++
      rowHasBlank = true
    }
    if (presentColumns.telefone && !r.rawTelefone) {
      fieldsBlankCount.telefone++
      totalBlankCellsInPresentCols++
      rowHasBlank = true
    }
    if (presentColumns.email && !r.rawEmail) {
      fieldsBlankCount.email++
      totalBlankCellsInPresentCols++
      rowHasBlank = true
    }
    if (presentColumns.bairro && !r.rawBairro) {
      fieldsBlankCount.bairro++
      totalBlankCellsInPresentCols++
      rowHasBlank = true
    }
    if (presentColumns.contato && !r.rawContato) {
      fieldsBlankCount.contato++
      totalBlankCellsInPresentCols++
      rowHasBlank = true
    }

    if (r.status === 'update' && rowHasBlank) {
      updateRowsWithBlankInPresentCols++
    }
  })

  return {
    fileName: typeof fileOrText === 'string' ? fileName : fileOrText.name,
    totalRows: allRows.length,
    validRows,
    updateRows,
    duplicateMasterCount,
    duplicateFileCount,
    errorCount,
    allRows,
    recognizedHeaders: {
      firstColumn: firstColText,
      isFirstColumnSchoolName: isFirstColSchoolName,
      presentColumns: {
        nome: true,
        ...presentColumns,
      },
    },
    blankStats: {
      totalBlankCellsInPresentCols,
      updateRowsWithBlankInPresentCols,
      fieldsBlankCount,
    },
  }
}

/**
 * Função de compatibilidade direta com chamadas legadas de parseSchoolsFile
 */
export async function parseSchoolsFile(
  file: File,
  existingMasterSchools: ExistingSchoolData[],
): Promise<CsvParseResult> {
  return parseSchoolsInput({
    fileOrText: file,
    fileName: file.name,
    existingMasterSchools,
  })
}
