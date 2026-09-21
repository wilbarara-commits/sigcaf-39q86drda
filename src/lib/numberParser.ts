/**
 * Utilitário de parsing de números com suporte a formatos brasileiros (pt-BR).
 *
 * REGRA pt-BR:
 * "Uma regra para a importação de dados numéricos: as casas decimais são separadas por vírgulas e os milhares por pontos."
 * Ex.:
 * - "1.250,50" -> 1250.50
 * - "12,5" -> 12.5
 * - "R$ 8,00" -> 8.00
 * - "1.250" -> 1250 (ponto seguido de exatamente 3 dígitos sem vírgula decimal é tratado como milhar pt-BR)
 * - "1.250.000" -> 1250000
 * - "1250" -> 1250
 * - "0,5" -> 0.5
 * - "0.75" -> 0.75 (caso não haja vírgula e não seja milhar pt-BR)
 *
 * HEURÍSTICA DOCUMENTADA:
 * 1. Remove símbolos de moeda (R$, $, etc.), letras de unidades (kg, un, etc. se misturadas) e espaços em branco.
 * 2. Suporta números negativos precedidos por "-".
 * 3. Se houver tanto ponto (.) quanto vírgula (,):
 *    - No padrão pt-BR, o ponto é milhar e a vírgula é decimal (ex.: "1.250,50" ou "1.250.000,00").
 *    - Remove todos os pontos e substitui a vírgula por ponto.
 * 4. Se houver APENAS vírgula (,):
 *    - Se houver múltiplas vírgulas (ex.: "1,250,000" estilo en-US ou erro de digitação), trata as primeiras como separador de milhar e a última como decimal; mas tipicamente em pt-BR é decimal único (ex.: "12,5", "8,00").
 *    - Substitui a vírgula decimal por ponto.
 * 5. Se houver APENAS ponto (.):
 *    - Se houver múltiplos pontos (ex.: "1.250.000"), trata todos como separador de milhar pt-BR -> remove todos os pontos.
 *    - Se houver apenas um ponto seguido de EXATAMENTE 3 dígitos no final (ex.: "1.250", "10.000"):
 *      no padrão pt-BR, isso representa milhar (1.250 = 1250). Remove o ponto.
 *    - Se o ponto for seguido de 1, 2 ou mais de 3 dígitos (ex.: "12.5", "0.75", "12.5042"),
 *      ou for explicitamente decimal no padrão internacional/inglês, mantém o ponto como decimal.
 * 6. Caso o valor seja inválido ou resulte em NaN/infinito, retorna isValid: false e value: 0 (sem quebrar a importação).
 */

export interface ParsedNumberResult {
  value: number
  isValid: boolean
  isEmpty: boolean
  originalString: string
}

export function parsePtBrNumber(val: unknown): ParsedNumberResult {
  if (val === undefined || val === null) {
    return { value: 0, isValid: true, isEmpty: true, originalString: '' }
  }

  if (typeof val === 'number') {
    const isValid = !isNaN(val) && isFinite(val)
    return {
      value: isValid ? val : 0,
      isValid,
      isEmpty: false,
      originalString: String(val),
    }
  }

  const rawStr = String(val).trim()
  if (rawStr === '') {
    return { value: 0, isValid: true, isEmpty: true, originalString: rawStr }
  }

  // Remove moeda (R$, $, etc.), caracteres comuns de unidade e espaços
  // Preserva dígitos, pontos, vírgulas e sinal de menos
  let cleaned = rawStr
    .replace(/[R$€£¥\s]/gi, '')
    // Se vier com sufixo de unidade como "10 kg", "5un", "12,5 l"
    .replace(/(?:kg|g|un|und|cx|pct|dz|l|ml|ton)$/i, '')
    .trim()

  if (!cleaned) {
    return { value: 0, isValid: false, isEmpty: false, originalString: rawStr }
  }

  const isNegative = cleaned.startsWith('-')
  if (isNegative) {
    cleaned = cleaned.substring(1).trim()
  }

  // Se restaram caracteres inválidos (letras ou símbolos estranhos no meio)
  if (/[^\d.,]/.test(cleaned)) {
    return { value: 0, isValid: false, isEmpty: false, originalString: rawStr }
  }

  const hasComma = cleaned.includes(',')
  const hasDot = cleaned.includes('.')

  let normalizedStr = ''

  if (hasDot && hasComma) {
    // Ambos presentes:
    // No padrão pt-BR padrão ("1.250,50"), pontos são milhares e a vírgula é decimal.
    // Mesmo se alguém digitar invertido ("1,250.50"), verificamos a última ocorrência:
    const lastDotIdx = cleaned.lastIndexOf('.')
    const lastCommaIdx = cleaned.lastIndexOf(',')

    if (lastCommaIdx > lastDotIdx) {
      // Padrão pt-BR canônico: 1.250,50 -> 1250.50
      normalizedStr = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      // Padrão internacional com vírgula de milhar: 1,250.50 -> 1250.50
      normalizedStr = cleaned.replace(/,/g, '')
    }
  } else if (hasComma) {
    // Apenas vírgula(s)
    const commaParts = cleaned.split(',')
    if (commaParts.length === 2) {
      // Ex: "12,5" ou "1250,50" -> 12.5 / 1250.50
      normalizedStr = `${commaParts[0]}.${commaParts[1]}`
    } else {
      // Múltiplas vírgulas: ex "1,000,000" -> junta milhares e usa última como decimal
      const last = commaParts.pop()!
      normalizedStr = `${commaParts.join('')}.${last}`
    }
  } else if (hasDot) {
    // Apenas ponto(s)
    const dotParts = cleaned.split('.')
    if (dotParts.length > 2) {
      // Múltiplos pontos: ex. "1.250.000" -> são milhares pt-BR
      normalizedStr = dotParts.join('')
    } else {
      // Exatamente 1 ponto: dotParts[0] . dotParts[1]
      const decimalsPart = dotParts[1]
      // Heurística pt-BR:
      // Se tiver exatamente 3 dígitos após o ponto (ex.: "1.250" ou "10.000"),
      // trata como separador de milhar brasileiro (1.250 = 1250).
      // Se tiver 1, 2 ou mais de 3 dígitos (ex.: "12.5", "0.75", "12.5000"),
      // trata como decimal.
      if (decimalsPart.length === 3) {
        normalizedStr = dotParts.join('') // Remove o ponto de milhar
      } else {
        normalizedStr = `${dotParts[0]}.${decimalsPart}`
      }
    }
  } else {
    // Apenas dígitos inteiros
    normalizedStr = cleaned
  }

  const parsed = parseFloat(normalizedStr)
  if (isNaN(parsed) || !isFinite(parsed)) {
    return { value: 0, isValid: false, isEmpty: false, originalString: rawStr }
  }

  const finalValue = isNegative ? -parsed : parsed
  return {
    value: finalValue,
    isValid: true,
    isEmpty: false,
    originalString: rawStr,
  }
}
