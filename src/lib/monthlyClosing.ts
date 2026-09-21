export interface MonthlyClosingStatus {
  isClosingPeriod: boolean
  closingMonthName: string
  referenceYear: number
  referenceMonthIndex: number // 0-11
  startDateStr: string
  endDateStr: string
  message: string
}

/**
 * Determina se a data atual está no período de fechamento contábil mensal:
 * - A partir do dia 25 (últimos dias do mês corrente): fechamento do mês atual
 * - Até o dia 5 (primeiros dias do mês seguinte): fechamento consolidado do mês anterior
 * Fora dessa janela, o botão fica desabilitado com mensagem explicativa.
 */
export function getMonthlyClosingStatus(date: Date = new Date()): MonthlyClosingStatus {
  const currentDay = date.getDate()
  const currentMonth = date.getMonth() // 0-indexed
  const currentYear = date.getFullYear()

  const MONTH_NAMES = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ]

  // Caso 1: Primeiros dias do mês (dia 1 a 5) -> Fechamento referente ao mês anterior
  if (currentDay <= 5) {
    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1)
    const refYear = prevMonthDate.getFullYear()
    const refMonthIdx = prevMonthDate.getMonth()
    const lastDayOfPrevMonth = new Date(refYear, refMonthIdx + 1, 0).getDate()

    const pad = (n: number) => String(n).padStart(2, '0')
    const startDateStr = `${refYear}-${pad(refMonthIdx + 1)}-01`
    const endDateStr = `${refYear}-${pad(refMonthIdx + 1)}-${pad(lastDayOfPrevMonth)}`

    return {
      isClosingPeriod: true,
      closingMonthName: `${MONTH_NAMES[refMonthIdx]} de ${refYear}`,
      referenceYear: refYear,
      referenceMonthIndex: refMonthIdx,
      startDateStr,
      endDateStr,
      message: `Período de fechamento ativo: consolidando o mês de ${MONTH_NAMES[refMonthIdx]}/${refYear} (disponível até dia 05).`,
    }
  }

  // Caso 2: A partir do dia 25 até o fim do mês corrente -> Fechamento do mês atual
  if (currentDay >= 25) {
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    const pad = (n: number) => String(n).padStart(2, '0')
    const startDateStr = `${currentYear}-${pad(currentMonth + 1)}-01`
    const endDateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(lastDayOfMonth)}`

    return {
      isClosingPeriod: true,
      closingMonthName: `${MONTH_NAMES[currentMonth]} de ${currentYear}`,
      referenceYear: currentYear,
      referenceMonthIndex: currentMonth,
      startDateStr,
      endDateStr,
      message: `Período de fechamento ativo: consolidando o mês de ${MONTH_NAMES[currentMonth]}/${currentYear} (dias 25 ao fim do mês).`,
    }
  }

  // Caso 3: Meio do mês (dias 6 a 24) -> Fora do período de fechamento
  return {
    isClosingPeriod: false,
    closingMonthName: `${MONTH_NAMES[currentMonth]} de ${currentYear}`,
    referenceYear: currentYear,
    referenceMonthIndex: currentMonth,
    startDateStr: '',
    endDateStr: '',
    message: `O botão de Relatório Mensal é manual (sob demanda) e fica ativo exclusivamente na janela de fechamento contábil (a partir do dia 25 e até o dia 05 do mês seguinte). Hoje é dia ${currentDay}.`,
  }
}
