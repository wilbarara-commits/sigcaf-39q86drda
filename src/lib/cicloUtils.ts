/**
 * Utilitários para cálculo de Ciclos do SIGCAF por chamada e regra de dias:
 *
 * REGRA DO CICLO POR CHAMADA:
 * 1. Cada ciclo pertence a uma Chamada. O ciclo cobre apenas os contratos dessa chamada.
 * 2. Unicidade: no máximo 1 ciclo ativo por chamada.
 * 3. O número do ciclo É a semana do ano (ISO).
 * 4. A chamada configura 3 dias da semana: primeiro dia (início), dia de despacho/entrega, último dia (fim).
 * 5. Padrão sugerido/default: quarta -> segunda -> terça.
 */

/**
 * Normaliza um identificador de dia da semana para o número de 0 a 6 (0 = domingo, ..., 6 = sábado).
 */
export function normalizarDiaSemanaNum(dia?: string | number): number {
  if (typeof dia === 'number') {
    return ((dia % 7) + 7) % 7
  }
  if (!dia) return 3 // default quarta
  const d = String(dia).trim().toLowerCase()
  if (d in DIA_SEMANA_MAP) {
    return DIA_SEMANA_MAP[d]
  }
  const n = parseInt(d, 10)
  if (!isNaN(n)) return ((n % 7) + 7) % 7
  return 3
}

/**
 * Retorna a data (segunda-feira) que inicia a semana ISO 1 do ano especificado.
 * Semana ISO 1 é a semana que contém a primeira quinta-feira do ano (ou 4 de janeiro).
 */
export function getInicioSemanaISO1(ano: number): Date {
  const jan4 = new Date(Date.UTC(ano, 0, 4, 12, 0, 0, 0))
  const day = jan4.getUTCDay() // 0=Dom, 1=Seg, ..., 6=Sab
  const isoDay = day === 0 ? 7 : day // 1=Seg..7=Dom
  // Subtrair (isoDay - 1) dias para chegar na segunda-feira
  const segSemana1 = new Date(Date.UTC(ano, 0, 4 - (isoDay - 1), 0, 0, 0, 0))
  return segSemana1
}

/**
 * Obtém a segunda-feira de início da semana ISO especificada para o ano fornecido.
 */
export function getInicioSemanaISO(ano: number, semana: number): Date {
  const segSemana1 = getInicioSemanaISO1(ano)
  const msPorSemana = 7 * 24 * 60 * 60 * 1000
  return new Date(segSemana1.getTime() + (semana - 1) * msPorSemana)
}

/**
 * Calcula as 3 datas do ciclo a partir do número da semana do ano (ISO) e da regra de dias da chamada.
 *
 * A semana do ciclo é a semana do ano informada cujo primeiro dia (ex: quarta) cai nela:
 * - Localiza o primeiro dia que cai na semana ISO informada (segunda..domingo).
 * - data_inicio: esse primeiro dia.
 * - data_fim: 6 dias após o início (mesmo dia da semana 'último dia').
 * - data_despacho: o dia de despacho/entrega localizado dentro da janela início..fim (offset de 0 a 6 dias).
 */
export function calcularDatasCicloPorSemana(
  numeroSemana: number,
  ano: number,
  regra?: RegraDiasChamada,
): {
  dataInicio: Date
  dataFim: Date
  dataDespacho: Date
  dataInicioIso: string
  dataFimIso: string
  dataDespachoIso: string
  codigoCiclo: string
  nomeCicloPadrao: string
} {
  const diaInicioNum = normalizarDiaSemanaNum(regra?.diaInicio ?? 'quarta')
  const diaDespachoNum = normalizarDiaSemanaNum(regra?.diaDespacho ?? 'segunda')
  const diaFimNum = normalizarDiaSemanaNum(regra?.diaFim ?? 'terca')

  // Segunda-feira (UTC) da semana ISO especificada
  const segIso = getInicioSemanaISO(ano, numeroSemana)

  // Encontrar o primeiro dia da semana do ciclo dentro da semana ISO (segunda=1..domingo=7)
  // segIso tem getUTCDay() === 1 (Segunda)
  // Offset da segunda-feira até o diaInicioNum (0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab):
  // Se diaInicioNum = 1 (Seg): offset 0
  // Se diaInicioNum = 3 (Qua): offset 2
  // Se diaInicioNum = 0 (Dom): offset 6
  const isoDayInicio = diaInicioNum === 0 ? 7 : diaInicioNum
  const offsetInicioDias = isoDayInicio - 1

  const dataInicio = new Date(segIso.getTime() + offsetInicioDias * 24 * 60 * 60 * 1000)

  // Fim: 6 dias após o início (fecha o ciclo de 7 dias civis, ex.: qua -> ter)
  // Observação: se diaFimNum for especificado, calcula a distância cíclica positiva de início até fim.
  let diffFim = (diaFimNum - diaInicioNum + 7) % 7
  if (diffFim === 0) diffFim = 6 // se for o mesmo dia, a janela é de 6 dias
  const dataFim = new Date(
    Date.UTC(
      dataInicio.getUTCFullYear(),
      dataInicio.getUTCMonth(),
      dataInicio.getUTCDate() + diffFim,
      23,
      59,
      59,
      999,
    ),
  )

  // Despacho: dia da semana dentro da janela [início, fim]
  const diffDespacho = (diaDespachoNum - diaInicioNum + 7) % 7
  const dataDespacho = new Date(
    Date.UTC(
      dataInicio.getUTCFullYear(),
      dataInicio.getUTCMonth(),
      dataInicio.getUTCDate() + diffDespacho,
      12,
      0,
      0,
      0,
    ),
  )

  const numFormatado = String(numeroSemana).padStart(2, '0')
  const codigoCiclo = `${numFormatado}/${ano}`
  const nomeCicloPadrao = `Ciclo ${codigoCiclo}`

  return {
    dataInicio,
    dataFim,
    dataDespacho,
    dataInicioIso: dataInicio.toISOString(),
    dataFimIso: dataFim.toISOString(),
    dataDespachoIso: dataDespacho.toISOString(),
    codigoCiclo,
    nomeCicloPadrao,
  }
}

/**
 * Valida o ajuste manual das datas de um ciclo:
 * 1. A semana do ciclo permanece a âncora: início, despacho e fim devem pertencer à mesma semana do ciclo
 *    (dentro da janela de tolerância de 7 dias a partir da âncora original da semana).
 * 2. A ordem deve se manter: início <= despacho/entrega <= último dia (entrega pode ser no último dia).
 */
export function validarAjusteManualDatasCiclo(
  dataInicioStr: string,
  dataDespachoStr: string,
  dataFimStr: string,
  semanaOriginal?: { inicioRef: string; fimRef: string },
): { valido: boolean; erro?: string } {
  if (!dataInicioStr || !dataDespachoStr || !dataFimStr) {
    return { valido: false, erro: 'Todas as datas do período operacional são obrigatórias.' }
  }

  const dIni = parseDateSegura(dataInicioStr)
  const dDesp = parseDateSegura(dataDespachoStr)
  const dFim = parseDateSegura(dataFimStr)

  // Comparação pura de dia civil YYYY-MM-DD
  const sIni = dataInicioStr.split('T')[0]
  const sDesp = dataDespachoStr.split('T')[0]
  const sFim = dataFimStr.split('T')[0]

  if (sIni > sDesp) {
    return {
      valido: false,
      erro: 'A data de início do ciclo não pode ser posterior à data de despacho/entrega.',
    }
  }

  if (sDesp > sFim) {
    return {
      valido: false,
      erro: 'A data de despacho/entrega não pode ser posterior ao último dia do ciclo.',
    }
  }

  // Verificar se o intervalo não ultrapassou os limites da semana (máximo 8 dias civis de abertura a fechamento)
  const diffDiasTotal = Math.round((dFim.getTime() - dIni.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDiasTotal < 0) {
    return {
      valido: false,
      erro: 'A data de encerramento deve ser igual ou posterior à de início.',
    }
  }
  if (diffDiasTotal > 10) {
    return {
      valido: false,
      erro: 'O período do ciclo não pode exceder os limites da semana operacional correspondente.',
    }
  }

  if (semanaOriginal?.inicioRef && semanaOriginal?.fimRef) {
    const dIniRef = parseDateSegura(semanaOriginal.inicioRef)
    const dFimRef = parseDateSegura(semanaOriginal.fimRef)
    // Cada data só pode ser movida dentro da semana a que pertence (tolerância de +-3 dias em relação à âncora)
    const diffIniRef = Math.abs(
      Math.round((dIni.getTime() - dIniRef.getTime()) / (1000 * 60 * 60 * 24)),
    )
    const diffFimRef = Math.abs(
      Math.round((dFim.getTime() - dFimRef.getTime()) / (1000 * 60 * 60 * 24)),
    )
    if (diffIniRef > 6 || diffFimRef > 6) {
      return {
        valido: false,
        erro: 'As datas só podem ser ajustadas dentro da semana operacional do ciclo.',
      }
    }
  }

  return { valido: true }
}

/**
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

import type { DiaSemana, ChamadaRecord } from '@/lib/types'

export interface RegraDiasChamada {
  diaInicio?: DiaSemana | string
  diaDespacho?: DiaSemana | string
  diaFim?: DiaSemana | string
}

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

export const DIA_SEMANA_MAP: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
}

export const NUM_PARA_DIA_SEMANA: Record<number, DiaSemana> = {
  0: 'domingo',
  1: 'segunda',
  2: 'terca',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sabado',
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
  // getUTCDay(): 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab
  const data = new Date(Date.UTC(ano, 0, 1, 0, 0, 0, 0))
  const diaSemana = data.getUTCDay()
  const diasAteQuarta = (3 - diaSemana + 7) % 7
  data.setUTCDate(data.getUTCDate() + diasAteQuarta)
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
    primeiraQuarta.getUTCFullYear(),
    primeiraQuarta.getUTCMonth(),
    primeiraQuarta.getUTCDate(),
  )
  const diffDias = Math.round((utcQuarta - utcPrimeira) / (1000 * 60 * 60 * 24))
  const numeroSemana = Math.floor(diffDias / 7) + 1

  // Usar UTC consistente para evitar discrepância entre data local e UTC
  const uAno = quartaInicio.getFullYear()
  const uMes = quartaInicio.getMonth()
  const uDia = quartaInicio.getDate()

  const quartaInicioUtc = new Date(Date.UTC(uAno, uMes, uDia, 0, 0, 0, 0))

  // Terça-feira final (quarta + 6 dias às 23:59:59.999 UTC)
  const tercaFim = new Date(Date.UTC(uAno, uMes, uDia + 6, 23, 59, 59, 999))

  // Segunda-feira de despacho (quarta + 5 dias às 12:00:00 UTC)
  const segundaDespacho = new Date(Date.UTC(uAno, uMes, uDia + 5, 12, 0, 0, 0))

  const numFormatado = String(numeroSemana).padStart(2, '0')
  const codigoCiclo = `${numFormatado}/${anoCiclo}`
  const nomeCicloPadrao = `Ciclo ${codigoCiclo}`

  return {
    ano: anoCiclo,
    numeroSemana,
    codigoCiclo,
    nomeCicloPadrao,
    quartaInicio: quartaInicioUtc,
    tercaFim,
    segundaDespacho,
    dataInicioIso: quartaInicioUtc.toISOString(),
    dataFimIso: tercaFim.toISOString(),
    dataDespachoIso: segundaDespacho.toISOString(),
  }
}

/**
 * A partir da data de início de um ciclo (ou da data de referência), retorna
 * a data prevista de despacho (segunda-feira da semana do ciclo).
 */
export function getDespachoPrevistoCiclo(
  dataInicio: Date | string,
  regra?: RegraDiasChamada,
): Date {
  const d = parseDateSegura(dataInicio)
  if (regra?.diaDespacho) {
    const diaInicioNum = normalizarDiaSemanaNum(regra.diaInicio ?? d.getUTCDay())
    const diaDespachoNum = normalizarDiaSemanaNum(regra.diaDespacho)
    const diffDespacho = (diaDespachoNum - diaInicioNum + 7) % 7
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffDespacho, 12, 0, 0, 0),
    )
  }
  const info = calcularCicloSemanal(d)
  return info.segundaDespacho
}

/**
 * Retorna a data de despacho/entrega efetiva de um ciclo,
 * respeitando com prioridade:
 * 1. O campo explícito data_despacho no ciclo;
 * 2. O snapshot com despacho_previsto gravado;
 * 3. A data_inicio combinada com a regra de dias gravada no snapshot ou padrão.
 */
export function getDespachoEfetivoCiclo(
  ciclo?: {
    data_inicio?: string
    data_fim?: string
    data_despacho?: string
    snapshot?:
      | {
          despacho_previsto_segunda?: string
          regra_dias?: RegraDiasChamada
        }
      | any
  } | null,
): Date {
  if (!ciclo) return new Date()

  // 1. Se houver campo explícito data_despacho no ciclo
  if (ciclo.data_despacho) {
    return parseDateSegura(ciclo.data_despacho)
  }

  // 2. Se houver snapshot com data de despacho gravada
  if (ciclo.snapshot?.despacho_previsto_segunda) {
    return parseDateSegura(ciclo.snapshot.despacho_previsto_segunda)
  }

  // 3. Se houver data de início
  if (ciclo.data_inicio) {
    const regra = ciclo.snapshot?.regra_dias
    return getDespachoPrevistoCiclo(ciclo.data_inicio, regra)
  }

  // 4. Se houver data de fim (fallback: véspera)
  if (ciclo.data_fim) {
    const fim = parseDateSegura(ciclo.data_fim)
    return new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() - 1, 12, 0, 0, 0)
  }

  return new Date()
}

const DIAS_SEMANA_NOMES_COMPLETOS: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
}

const DIAS_SEMANA_ABREVIADOS: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
}

/**
 * Formata a data de despacho/entrega para exibição amigável nas telas,
 * respeitando o dia da semana real da data (ex.: "Ter, 06/10" ou "Terça-feira, 06/10/2026",
 * "Seg, 21/09" ou "Segunda-feira, 21/09/2026").
 */
export function formatDespachoAmigavel(
  dataDespacho: Date | string,
  extenso: boolean = false,
): string {
  const d = parseDateSegura(dataDespacho)
  const diaNum = d.getDay()
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const ano = d.getFullYear()

  if (extenso) {
    const nomeSemana = DIAS_SEMANA_NOMES_COMPLETOS[diaNum] || 'Segunda-feira'
    return `${nomeSemana}, ${dia}/${mes}/${ano}`
  }
  const abrevSemana = DIAS_SEMANA_ABREVIADOS[diaNum] || 'Seg'
  return `${abrevSemana}, ${dia}/${mes}`
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

/**
 * Formata o nome amigável da fase (ex.: coletando -> Coletando, correcao -> Correção, coleta_encerrada -> Coleta Encerrada)
 * Normaliza 'coleta_encerrada', 'coletado' e 'coleta encerrada' para exibir "Coleta Encerrada".
 */
export function formatFaseAmigavel(fase?: string): string {
  if (!fase) return 'Coletando'
  const f = fase.trim().toLowerCase()
  if (f === 'coletando') return 'Coletando'
  if (f === 'correcao') return 'Correção'
  if (f === 'coletado' || f === 'coleta_encerrada' || f === 'coleta encerrada') {
    return 'Coleta Encerrada'
  }
  if (f === 'fechado') return 'Fechado'
  if (f === 'cancelado') return 'Cancelado'
  return fase.charAt(0).toUpperCase() + fase.slice(1)
}

/**
 * Retorna o status de um ciclo a partir do seu campo status próprio.
 * Mantém assinatura retrocompatível aceitando parâmetros legados:
 * derivarStatusCiclo(status) OU derivarStatusCiclo(cicloId, cicloContratos, status)
 */
export function derivarStatusCiclo(arg1?: string, arg2?: any, arg3?: string): string {
  const statusRaw = typeof arg3 === 'string' ? arg3 : typeof arg1 === 'string' ? arg1 : 'coletando'
  const fb = (statusRaw || 'coletando').toLowerCase()
  if (fb === 'coletado' || fb === 'coleta_encerrada' || fb === 'coleta encerrada') {
    return 'coleta_encerrada'
  }
  return fb
}

/**
 * Resumo textual da fase do ciclo (aposentado o controle individual por contrato).
 * A fase agora é única do próprio ciclo.
 * Assinatura compatível com código legado:
 * gerarResumoFasesCiclo(cicloIdOrStatus, ...args)
 */
export function gerarResumoFasesCiclo(
  cicloOuId?: string | { status?: string } | null,
  _arg2?: any,
  _arg3?: any,
): string {
  let statusRaw = 'coletando'
  if (typeof cicloOuId === 'object' && cicloOuId !== null) {
    statusRaw = cicloOuId.status || 'coletando'
  } else if (typeof cicloOuId === 'string') {
    // Se for string de status ou id
    statusRaw = cicloOuId
  }
  const statusDerivado = derivarStatusCiclo(statusRaw)
  return formatFaseAmigavel(statusDerivado)
}

/**
 * Identifica o ciclo ativo entre uma lista de ciclos:
 * Ciclo ATIVO = o mais recente ciclo com status não-terminal (coletando, correcao ou coleta_encerrada)
 * da chamada especificada (ou geral). No máximo 1 por chamada.
 */
export function getCicloAtivo(
  ciclos: Array<{
    id: string
    status?: string
    created?: string
    data_inicio?: string
    chamada_id?: string
  }>,
  chamadaId?: string,
): any | null {
  let lista = [...ciclos]
  if (chamadaId) {
    lista = lista.filter((c) => c.chamada_id === chamadaId)
  }

  // Ordenar ciclos por mais recente primeiro
  const ordenados = lista.sort((a, b) => {
    const tA = new Date(a.created || a.data_inicio || 0).getTime()
    const tB = new Date(b.created || b.data_inicio || 0).getTime()
    return tB - tA
  })

  const naoTerminais = ordenados.filter((c) => isCicloNaoTerminal(c.status))
  return naoTerminais[0] || null
}

/**
 * Retorna os ciclos ativos de todas as chamadas (no máximo 1 por chamada).
 */
export function getCiclosAtivosPorChamada(
  ciclos: Array<{
    id: string
    status?: string
    created?: string
    data_inicio?: string
    chamada_id?: string
  }>,
): Record<string, any> {
  const porChamada: Record<string, any> = {}
  const chamadasIds = Array.from(
    new Set(ciclos.map((c) => c.chamada_id).filter(Boolean) as string[]),
  )

  for (const chId of chamadasIds) {
    const ativo = getCicloAtivo(ciclos, chId)
    if (ativo) {
      porChamada[chId] = ativo
    }
  }
  return porChamada
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
 * Interface simples para ciclos existentes passados para cálculo do próximo ciclo.
 */
export interface CicloExistenteReferencia {
  id?: string
  nome: string
  data_inicio?: string
  data_fim?: string
  created?: string
}

/**
 * Extrai número do ciclo e ano de uma string de nome como "Ciclo 38/2026" ou "38/2026"
 */
export function parseNumeroEAnoCiclo(
  nomeOuCodigo?: string,
): { numero: number; ano: number } | null {
  if (!nomeOuCodigo) return null
  const match = nomeOuCodigo.match(/(\d{1,2})\/(\d{4})/)
  if (match) {
    return {
      numero: parseInt(match[1], 10),
      ano: parseInt(match[2], 10),
    }
  }
  return null
}

/**
 * Calcula a sugestão do PRÓXIMO ciclo para abertura:
 * - Se houver ciclos existentes: sugere SEMPRE o próximo ciclo após o mais recente:
 *   nº = nº do mais recente + 1
 *   início = quarta seguinte à quarta de abertura do ciclo mais recente (+7 dias da quarta de início do mais recente)
 *   fim = início + 6 dias (terça)
 *   despacho previsto = início + 5 dias (segunda)
 * - Exceção semanal corrente: se hoje for quarta-feira e NÃO existir ciclo aberto para a semana corrente,
 *   pré-preenche a quarta de hoje.
 * - Fallback se não houver ciclos existentes: calcula a partir da data de referência (hoje).
 */
/**
 * Verifica se já existe um ciclo cadastrado com o mesmo número e ano informados.
 * Compara tanto códigos exatos (ex.: "41/2026") quanto o parsing de número e ano de nomes ("Ciclo 41/2026").
 */
export function isCicloNumeroAnoDuplicado(
  numero: number | string,
  ano: number | string,
  ciclosExistentes: Array<CicloExistenteReferencia & { chamada_id?: string }> = [],
  ignoreCicloId?: string,
  chamadaId?: string,
): boolean {
  const numInt = typeof numero === 'number' ? numero : parseInt(String(numero).trim(), 10)
  const anoInt = typeof ano === 'number' ? ano : parseInt(String(ano).trim(), 10)
  if (isNaN(numInt) || isNaN(anoInt)) return false

  return ciclosExistentes.some((c) => {
    if (ignoreCicloId && c.id === ignoreCicloId) return false
    // Se foi passada uma chamadaId, a duplicidade só ocorre DENTRO da mesma chamada
    if (chamadaId && c.chamada_id && c.chamada_id !== chamadaId) {
      return false
    }

    const parsed = parseNumeroEAnoCiclo(c.nome)
    if (parsed) {
      return parsed.numero === numInt && parsed.ano === anoInt
    }
    // Fallback: verificar se o nome contém o código numérico "XX/AAAA"
    const cod = extractCicloCodigo(c.nome)
    const codMatch = cod.match(/^(\d{1,3})\/(\d{4})$/)
    if (codMatch) {
      return parseInt(codMatch[1], 10) === numInt && parseInt(codMatch[2], 10) === anoInt
    }
    return false
  })
}

export function sugerirProximoCiclo(
  ciclosExistentes: Array<CicloExistenteReferencia & { chamada_id?: string }> = [],
  dataRef: Date = new Date(),
  chamadaId?: string,
  regraChamada?: RegraDiasChamada,
): CicloSemanalInfo {
  const dHoje = new Date(dataRef.getFullYear(), dataRef.getMonth(), dataRef.getDate(), 12, 0, 0, 0)

  // Filtrar ciclos da chamada se especificada
  const listaFiltrada = chamadaId
    ? ciclosExistentes.filter((c) => c.chamada_id === chamadaId)
    : ciclosExistentes

  // Ordenar ciclos existentes pelo mais recente
  const ordenados = [...listaFiltrada].sort((a, b) => {
    const parsedA = parseNumeroEAnoCiclo(a.nome)
    const parsedB = parseNumeroEAnoCiclo(b.nome)
    if (parsedA && parsedB) {
      if (parsedA.ano !== parsedB.ano) return parsedB.ano - parsedA.ano
      if (parsedA.numero !== parsedB.numero) return parsedB.numero - parsedA.numero
    }
    const tA = new Date(a.data_inicio || a.created || 0).getTime()
    const tB = new Date(b.data_inicio || b.created || 0).getTime()
    return tB - tA
  })

  const maisRecente = ordenados[0]

  // Se hoje for quarta e não existir ciclo aberto para a semana corrente, pré-preencher a quarta de hoje:
  const isHojeQuarta = dHoje.getDay() === 3
  if (isHojeQuarta) {
    const hojeIso = `${dHoje.getFullYear()}-${String(dHoje.getMonth() + 1).padStart(2, '0')}-${String(dHoje.getDate()).padStart(2, '0')}`
    const existeCicloSemanaCorrente = ciclosExistentes.some((c) => {
      if (!c.data_inicio) return false
      const inicioData = c.data_inicio.split('T')[0]
      return inicioData === hojeIso
    })

    if (!existeCicloSemanaCorrente) {
      const cicloHoje = calcularCicloSemanal(dHoje)
      // Ajustar número se o ciclo mais recente tiver número conhecido no mesmo ano
      if (maisRecente) {
        const parsed = parseNumeroEAnoCiclo(maisRecente.nome)
        if (parsed && parsed.ano === cicloHoje.ano && parsed.numero >= cicloHoje.numeroSemana) {
          const proxNum = parsed.numero + 1
          const numFmt = String(proxNum).padStart(2, '0')
          const cod = `${numFmt}/${cicloHoje.ano}`
          return {
            ...cicloHoje,
            numeroSemana: proxNum,
            codigoCiclo: cod,
            nomeCicloPadrao: `Ciclo ${cod}`,
          }
        }
      }
      return cicloHoje
    }
  }

  // Se houver ciclo mais recente:
  if (maisRecente) {
    const parsed = parseNumeroEAnoCiclo(maisRecente.nome)
    const anoAtualCiclo = parsed?.ano || dHoje.getFullYear()
    const proxNumero = parsed && parsed.ano === anoAtualCiclo ? parsed.numero + 1 : 1

    // Se temos a regra da chamada, calculamos exatamente pelas regras e semana
    if (regraChamada) {
      const calc = calcularDatasCicloPorSemana(proxNumero, anoAtualCiclo, regraChamada)
      return {
        ano: anoAtualCiclo,
        numeroSemana: proxNumero,
        codigoCiclo: calc.codigoCiclo,
        nomeCicloPadrao: calc.nomeCicloPadrao,
        quartaInicio: calc.dataInicio,
        tercaFim: calc.dataFim,
        segundaDespacho: calc.dataDespacho,
        dataInicioIso: calc.dataInicioIso,
        dataFimIso: calc.dataFimIso,
        dataDespachoIso: calc.dataDespachoIso,
      }
    }

    let quartaBase: Date

    if (maisRecente.data_inicio) {
      const parsedData = parseDateSegura(maisRecente.data_inicio)
      // Encontrar a quarta-feira daquela data
      const diaSemana = parsedData.getDay()
      const diasDesdeQuarta = (diaSemana - 3 + 7) % 7
      quartaBase = new Date(
        parsedData.getFullYear(),
        parsedData.getMonth(),
        parsedData.getDate() - diasDesdeQuarta,
        0,
        0,
        0,
        0,
      )
    } else {
      quartaBase = getPrimeiraQuartaDoAno(parsed?.ano || dHoje.getFullYear())
    }

    // Quarta seguinte: +7 dias da quarta de início do ciclo mais recente
    const anoQuarta = quartaBase.getFullYear()
    const mesQuarta = quartaBase.getMonth()
    const diaQuarta = quartaBase.getDate()

    const proxQuarta = new Date(Date.UTC(anoQuarta, mesQuarta, diaQuarta + 7, 0, 0, 0, 0))

    const anoProx = proxQuarta.getUTCFullYear()
    const proxNumFallback = parsed && parsed.ano === anoProx ? parsed.numero + 1 : 1
    const numFmt = String(proxNumFallback).padStart(2, '0')
    const codigoCiclo = `${numFmt}/${anoProx}`
    const nomeCicloPadrao = `Ciclo ${codigoCiclo}`

    // Fim = terça-feira seguinte (início + 6 dias às 23:59:59.999 UTC)
    const tercaFim = new Date(
      Date.UTC(
        proxQuarta.getUTCFullYear(),
        proxQuarta.getUTCMonth(),
        proxQuarta.getUTCDate() + 6,
        23,
        59,
        59,
        999,
      ),
    )

    // Despacho = segunda-feira seguinte (início + 5 dias às 12:00:00 UTC)
    const segundaDespacho = new Date(
      Date.UTC(
        proxQuarta.getUTCFullYear(),
        proxQuarta.getUTCMonth(),
        proxQuarta.getUTCDate() + 5,
        12,
        0,
        0,
        0,
      ),
    )

    return {
      ano: anoProx,
      numeroSemana: proxNumFallback,
      codigoCiclo,
      nomeCicloPadrao,
      quartaInicio: proxQuarta,
      tercaFim,
      segundaDespacho,
      dataInicioIso: proxQuarta.toISOString(),
      dataFimIso: tercaFim.toISOString(),
      dataDespachoIso: segundaDespacho.toISOString(),
    }
  }

  // Fallback quando não há nenhum ciclo no banco:
  // Se houver regra de chamada, usa calcularDatasCicloPorSemana para a semana ISO de hoje
  if (regraChamada) {
    const jan4 = new Date(Date.UTC(dHoje.getFullYear(), 0, 4, 12, 0, 0, 0))
    const dIso = dHoje.getDay() === 0 ? 7 : dHoje.getDay()
    const segSemana1 = getInicioSemanaISO1(dHoje.getFullYear())
    const diffMs = dHoje.getTime() - segSemana1.getTime()
    const semNum = Math.max(1, Math.min(53, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1))
    const calc = calcularDatasCicloPorSemana(semNum, dHoje.getFullYear(), regraChamada)
    return {
      ano: dHoje.getFullYear(),
      numeroSemana: semNum,
      codigoCiclo: calc.codigoCiclo,
      nomeCicloPadrao: calc.nomeCicloPadrao,
      quartaInicio: calc.dataInicio,
      tercaFim: calc.dataFim,
      segundaDespacho: calc.dataDespacho,
      dataInicioIso: calc.dataInicioIso,
      dataFimIso: calc.dataFimIso,
      dataDespachoIso: calc.dataDespachoIso,
    }
  }

  return calcularProximoCicloParaAbertura(dataRef)
}

/**
 * Mantido para retrocompatibilidade: calcula os parâmetros padrão com base em uma data.
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
