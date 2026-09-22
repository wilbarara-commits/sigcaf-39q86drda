/**
 * Utilitários para cálculo de Ciclos do SIGCAF segundo a regra semanal Quarta-Feira -> Terça-Feira:
 *
 * REGRA DO CICLO SEMANAL:
 * 1. A semana do ciclo começa na QUARTA-FEIRA às 00:00:00 e termina na TERÇA-FEIRA seguinte às 23:59:59.
 * 2. O DESPACHO (colocação em rota) ocorre sempre na SEGUNDA-FEIRA contida nessa semana do ciclo
 *    (ou seja, 5 dias após a quarta-feira de abertura e 1 dia antes da terça-feira de encerramento).
 * 3. Convenção de Semana 1 do ano:
 *    - A semana 01 do ano é a semana Quarta->Terça que contém a primeira Quarta-feira do ano
 *      (isto é, o primeiro ciclo cujo início cai no ano correspondente, a partir da primeira quarta do ano).
 *    - De forma equivalente: para qualquer data informada, recua-se para a Quarta-feira de início da sua semana.
 *      O ano do ciclo é o ano dessa Quarta-feira. A primeira quarta-feira desse ano é o Ciclo 01.
 *      O número da semana é: Math.floor((quartaDaSemana - primeiraQuartaDoAno) / 7 dias) + 1.
 * 4. Exemplo prático para 2026:
 *    - Primeira quarta-feira de 2026: 07/01/2026 -> Ciclo 01/2026 (07/01 a 13/01, despacho seg 12/01).
 *    - Setembro de 2026:
 *      Ciclo Operacional Semanal (16/09/2026 a 22/09/2026):
 *      Quarta-feira de início = 16/09/2026.
 *      Semanas decorridas desde 07/01/2026 = (16/09/2026 - 07/01/2026) / 7 dias = 252 dias / 7 = 36 semanas.
 *      Número do ciclo = 36 + 1 = 37 -> Ciclo 37/2026.
 *      Despacho previsto: Segunda-feira 21/09/2026.
 *      Terça-feira de encerramento: 22/09/2026.
 */

export interface CicloSemanalInfo {
  ano: number
  numeroSemana: number
  codigoCiclo: string // ex: "37/2026"
  nomeCicloPadrao: string // ex: "Ciclo 37/2026"
  quartaInicio: Date
  tercaFim: Date
  segundaDespacho: Date
  dataInicioIso: string
  dataFimIso: string
  dataDespachoIso: string
}

/**
 * Extrai o código reduzido do ciclo (ex: "37/2026") a partir de qualquer formato de nome
 * como "Ciclo 37/2026", "Ciclo 37/2026 - Teste Operacional" ou "37/2026".
 * Mantém compatibilidade com o formato esperado no rodapé do atesto: "37/2026 - ROTA A - 7".
 */
export function extractCicloCodigo(nomeOuCodigo?: string): string {
  if (!nomeOuCodigo) return ''
  const trimmed = nomeOuCodigo.trim()
  const match = trimmed.match(/(\d{1,2}\/\d{4})/)
  if (match) {
    return match[1]
  }
  return trimmed
}

/**
 * Converte com segurança uma string ISO (ex: "2026-09-16 00:00:00.000Z" ou "2026-09-16T00:00:00.000Z")
 * ou objeto Date para um Date local sem distorção por fuso horário quando apenas a data civil importa.
 */
function parseDateSegura(referencia: Date | string): Date {
  if (referencia instanceof Date) {
    return new Date(referencia.getTime())
  }
  const str = String(referencia).trim()
  // Se for no formato YYYY-MM-DD...
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const ano = parseInt(match[1], 10)
    const mes = parseInt(match[2], 10) - 1
    const dia = parseInt(match[3], 10)
    return new Date(ano, mes, dia, 12, 0, 0, 0)
  }
  return new Date(referencia)
}

/**
 * Retorna a primeira Quarta-feira do ano especificado (às 00:00:00 local).
 */
export function getPrimeiraQuartaDoAno(ano: number): Date {
  const data = new Date(ano, 0, 1, 12, 0, 0, 0)
  // getDay(): 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab
  // Quantos dias faltam para a primeira quarta (dia 3)?
  const diaSemana = data.getDay()
  const diasAteQuarta = (3 - diaSemana + 7) % 7
  data.setDate(data.getDate() + diasAteQuarta)
  data.setHours(0, 0, 0, 0)
  return data
}

/**
 * Dado um instante ou string de data, calcula as datas de início (quarta), fim (terça),
 * despacho (segunda) e número de semana sob a convenção Quarta -> Terça.
 */
export function calcularCicloSemanal(referencia: Date | string = new Date()): CicloSemanalInfo {
  const d = parseDateSegura(referencia)

  // Normalizar para data local (ano, mês, dia) sem ruído de horário
  const anoRef = d.getFullYear()
  const mesRef = d.getMonth()
  const diaRef = d.getDate()
  const dataLocal = new Date(anoRef, mesRef, diaRef, 12, 0, 0, 0)

  // Encontrar a quarta-feira em que este ciclo começou.
  // Se hoje for Quarta (3): recuo = 0
  // Quinta (4): recuo = 1
  // Sexta (5): recuo = 2
  // Sábado (6): recuo = 3
  // Domingo (0): recuo = 4
  // Segunda (1): recuo = 5
  // Terça (2): recuo = 6
  const diaSemana = dataLocal.getDay()
  const diasDesdeQuarta = (diaSemana - 3 + 7) % 7

  const quartaInicio = new Date(anoRef, mesRef, diaRef - diasDesdeQuarta, 0, 0, 0, 0)
  const anoCiclo = quartaInicio.getFullYear()

  // Primeira quarta-feira do ano do ciclo
  const primeiraQuarta = getPrimeiraQuartaDoAno(anoCiclo)

  // Diferença em dias usando UTC para evitar saltos de horário de verão / fuso
  const utcQuarta = Date.UTC(
    quartaInicio.getFullYear(),
    quartaInicio.getMonth(),
    quartaInicio.getDate(),
  )
  const utcPrimeira = Date.UTC(
    primeiraQuarta.getFullYear(),
    primeiraQuarta.getMonth(),
    primeiraQuarta.getDate(),
  )
  const diffDias = Math.round((utcQuarta - utcPrimeira) / (1000 * 60 * 60 * 24))
  const numeroSemana = Math.floor(diffDias / 7) + 1

  // Terça-feira final (quarta + 6 dias)
  const tercaFim = new Date(
    quartaInicio.getFullYear(),
    quartaInicio.getMonth(),
    quartaInicio.getDate() + 6,
    23,
    59,
    59,
    999,
  )

  // Segunda-feira de despacho (quarta + 5 dias)
  const segundaDespacho = new Date(
    quartaInicio.getFullYear(),
    quartaInicio.getMonth(),
    quartaInicio.getDate() + 5,
    12,
    0,
    0,
    0,
  )

  const numFormatado = String(numeroSemana).padStart(2, '0')
  const codigoCiclo = `${numFormatado}/${anoCiclo}`
  const nomeCicloPadrao = `Ciclo ${codigoCiclo}`

  return {
    ano: anoCiclo,
    numeroSemana,
    codigoCiclo,
    nomeCicloPadrao,
    quartaInicio,
    tercaFim,
    segundaDespacho,
    dataInicioIso: quartaInicio.toISOString(),
    dataFimIso: tercaFim.toISOString(),
    dataDespachoIso: segundaDespacho.toISOString(),
  }
}

/**
 * A partir da data de início de um ciclo (ou da data de referência), retorna
 * a data prevista de despacho (segunda-feira da semana do ciclo).
 */
export function getDespachoPrevistoCiclo(dataInicio: Date | string): Date {
  const d = parseDateSegura(dataInicio)
  const info = calcularCicloSemanal(d)
  return info.segundaDespacho
}

/**
 * Formata a data de despacho para exibição amigável nas telas, ex.: "Seg, 21/09" ou "Segunda-feira, 21/09/2026"
 */
export function formatDespachoAmigavel(
  dataDespacho: Date | string,
  extenso: boolean = false,
): string {
  const d = parseDateSegura(dataDespacho)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const ano = d.getFullYear()

  if (extenso) {
    return `Segunda-feira, ${dia}/${mes}/${ano}`
  }
  return `Seg, ${dia}/${mes}`
}

/**
 * Formata o intervalo quarta -> terça para exibição amigável, ex.: "16/09 a 22/09/2026"
 */
export function formatIntervaloCiclo(dataInicio: Date | string, dataFim: Date | string): string {
  const ini = parseDateSegura(dataInicio)
  const fim = parseDateSegura(dataFim)

  const dIni = String(ini.getDate()).padStart(2, '0')
  const mIni = String(ini.getMonth() + 1).padStart(2, '0')

  const dFim = String(fim.getDate()).padStart(2, '0')
  const mFim = String(fim.getMonth() + 1).padStart(2, '0')
  const aFim = fim.getFullYear()

  return `${dIni}/${mIni} a ${dFim}/${mFim}/${aFim}`
}

/**
 * Fases terminais de um contrato/ciclo: "fechado" e "cancelado".
 * Qualquer outro texto é considerado não-terminal (coletando, correcao, coletado, etc.).
 */
export function isCicloTerminal(status?: string): boolean {
  if (!status) return false
  const s = status.trim().toLowerCase()
  return s === 'fechado' || s === 'cancelado'
}

/**
 * Retorna se a fase é não-terminal (coletando, correcao, coletado ou qualquer status futuro)
 */
export function isCicloNaoTerminal(status?: string): boolean {
  return !isCicloTerminal(status)
}

export interface CicloContratoRef {
  id?: string
  ciclo_id: string
  contrato_id: string
  fase: string
  motivo_cancelamento?: string
  data_cancelamento?: string
}

/**
 * Formata o nome amigável da fase (ex.: coletando -> Coletando, correcao -> Correção)
 */
export function formatFaseAmigavel(fase?: string): string {
  if (!fase) return 'Coletando'
  const f = fase.trim().toLowerCase()
  if (f === 'coletando') return 'Coletando'
  if (f === 'correcao') return 'Correção'
  if (f === 'coletado') return 'Coletado'
  if (f === 'fechado') return 'Fechado'
  if (f === 'cancelado') return 'Cancelado'
  return fase.charAt(0).toUpperCase() + fase.slice(1)
}

/**
 * Deriva o status consolidado de um ciclo com base nas fases dos seus contratos.
 * - Se não houver vínculos: usa ciclo.status (fallback de compatibilidade) ou 'coletando'
 * - Se todos os contratos estiverem fechados: 'fechado'
 * - Se todos os contratos estiverem cancelados: 'cancelado'
 * - Se houver contratos em fases distintas ou não-terminais: retorna a fase predominante / resumo
 */
export function derivarStatusCiclo(
  cicloId: string,
  cicloContratos: CicloContratoRef[],
  fallbackStatus?: string,
): string {
  const vinculados = cicloContratos.filter((cc) => cc.ciclo_id === cicloId)
  if (vinculados.length === 0) {
    return fallbackStatus || 'coletando'
  }

  const todasFases = vinculados.map((cc) => (cc.fase || 'coletando').toLowerCase())
  const todosFechados = todasFases.every((f) => f === 'fechado')
  if (todosFechados) return 'fechado'

  const todosCancelados = todasFases.every((f) => f === 'cancelado')
  if (todosCancelados) return 'cancelado'

  // Se houver algum em Coletando
  if (todasFases.some((f) => f === 'coletando')) return 'coletando'
  // Se houver algum em Correção
  if (todasFases.some((f) => f === 'correcao')) return 'correcao'
  // Se houver algum em Coletado
  if (todasFases.some((f) => f === 'coletado')) return 'coletado'

  return fallbackStatus || 'coletando'
}

/**
 * Gera um resumo textual derivado das fases dos contratos de um ciclo.
 * Exemplo: "3 contratos em Correção, 1 Coletado, 1 Cancelado" ou "Todos em Coletando"
 */
export function gerarResumoFasesCiclo(
  cicloId: string,
  cicloContratos: CicloContratoRef[],
  contratosMap?: Map<string, { numero?: string }>,
): string {
  const vinculados = cicloContratos.filter((cc) => cc.ciclo_id === cicloId)
  if (vinculados.length === 0) {
    return 'Sem contratos vinculados'
  }

  if (vinculados.length === 1) {
    const cName = contratosMap?.get(vinculados[0].contrato_id)?.numero
    const prefix = cName ? `${cName}: ` : ''
    return `${prefix}${formatFaseAmigavel(vinculados[0].fase)}`
  }

  // Agrupar por fase amigável
  const counts: Record<string, number> = {}
  for (const cc of vinculados) {
    const nomeFase = formatFaseAmigavel(cc.fase)
    counts[nomeFase] = (counts[nomeFase] || 0) + 1
  }

  const parts = Object.entries(counts).map(([fase, qtd]) => {
    return `${qtd} ${qtd === 1 ? 'contrato' : 'contratos'} em ${fase}`
  })

  return parts.join(', ')
}

/**
 * Verifica se um ciclo tem pelo menos um contrato em fase não-terminal.
 */
export function hasContratoNaoTerminal(
  cicloId: string,
  cicloContratos: CicloContratoRef[],
  fallbackStatus?: string,
): boolean {
  const vinculados = cicloContratos.filter((cc) => cc.ciclo_id === cicloId)
  if (vinculados.length === 0) {
    return isCicloNaoTerminal(fallbackStatus)
  }
  return vinculados.some((cc) => isCicloNaoTerminal(cc.fase))
}

/**
 * Identifica o ciclo ativo entre uma lista de ciclos segundo a nova regra:
 * Ciclo ATIVO = o mais recente ciclo com PELO MENOS UM contrato em fase não-terminal. Sempre no máximo 1.
 */
export function getCicloAtivo(
  ciclos: Array<{ id: string; status?: string; created?: string; data_inicio?: string }>,
  cicloContratos?: CicloContratoRef[],
): any | null {
  // Ordenar ciclos por mais recente primeiro
  const ordenados = [...ciclos].sort((a, b) => {
    const tA = new Date(a.created || a.data_inicio || 0).getTime()
    const tB = new Date(b.created || b.data_inicio || 0).getTime()
    return tB - tA
  })

  if (!cicloContratos || cicloContratos.length === 0) {
    const naoTerminais = ordenados.filter((c) => isCicloNaoTerminal(c.status))
    return naoTerminais[0] || null
  }

  for (const c of ordenados) {
    if (hasContratoNaoTerminal(c.id, cicloContratos, c.status)) {
      return c
    }
  }

  return null
}

/**
 * Calcula os dias de atraso de fechamento previsto para um ciclo não-terminal.
 * A data prevista de fechamento é a terça-feira de fim (às 23:59:59).
 * Se hoje > terça-feira de fechamento, retorna a diferença em dias (número inteiro >= 0).
 */
export function calcularDiasAtrasoFechamento(
  dataFim: Date | string,
  dataRef: Date = new Date(),
): number {
  const fim = parseDateSegura(dataFim)
  fim.setHours(23, 59, 59, 999)

  const diffMs = dataRef.getTime() - fim.getTime()
  if (diffMs <= 0) return 0

  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Calcula os parâmetros padrão para abertura de um novo ciclo:
 * Início = quarta-feira corrente se hoje for quarta-feira, senão a próxima quarta-feira.
 * Fim = terça-feira seguinte (+6 dias).
 * Despacho = segunda-feira seguinte (+5 dias).
 */
export function calcularProximoCicloParaAbertura(dataRef: Date = new Date()): CicloSemanalInfo {
  const d = new Date(dataRef.getFullYear(), dataRef.getMonth(), dataRef.getDate(), 12, 0, 0, 0)
  const diaSemana = d.getDay() // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab

  let diasAteQuarta = 0
  if (diaSemana === 3) {
    diasAteQuarta = 0
  } else {
    diasAteQuarta = (3 - diaSemana + 7) % 7
  }

  const dataAlvoQuarta = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + diasAteQuarta,
    12,
    0,
    0,
    0,
  )
  return calcularCicloSemanal(dataAlvoQuarta)
}
