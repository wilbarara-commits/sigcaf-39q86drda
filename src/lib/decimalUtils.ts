/**
 * Utilitários para formatação e validação de quantidades decimais no SIGCAF.
 *
 * REGRAS DO DOMÍNIO:
 * 1. O separador decimal deve ser a vírgula (pt-BR).
 * 2. Apresentação sempre com exatamente UMA casa decimal (ex.: 5,0 / 2,5 / 0,5 / 10,0).
 * 3. Só aceitar partes decimais ,0 ou ,5 — ou seja, quantidades em múltiplos de 0,5 (0,5 / 1,0 / 1,5 / 2,0 ...).
 * 4. Qualquer outra parte decimal (ex.: 2,3 ou 2,75) é rejeitada ao digitar e validar.
 * 5. Armazenamento numérico padrão compatível com banco de dados (ex.: 2.5, 5.0).
 */

/**
 * Converte um valor numérico (ou string numérica) para exibição pt-BR sempre com uma casa decimal e vírgula.
 * Ex.: 5 -> "5,0" | 2.5 -> "2,5" | 0 -> "0,0" | 0.5 -> "0,5"
 */
export function formatQuantityOneDecimal(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0,0'
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'))
  if (isNaN(num)) return '0,0'
  return num.toFixed(1).replace('.', ',')
}

export interface ValidationStepHalfResult {
  isValid: boolean
  numericValue: number
  error: string | null
}

/**
 * Valida se uma string digitada representa uma quantidade válida em múltiplos de 0,5:
 * - Deve ser maior que 0
 * - Só pode ter parte decimal 0 ou 5 (ex: ,0 ou ,5)
 */
export function validateQuantityStepHalf(valStr: string): ValidationStepHalfResult {
  const trimmed = valStr.trim()
  if (!trimmed) {
    return { isValid: false, numericValue: 0, error: null }
  }

  // Tolerância para ponto substituindo por vírgula
  const normalized = trimmed.replace('.', ',')

  // Rejeitar caracteres não numéricos ou mais de uma vírgula
  if (!/^\d+(?:,\d+)?$/.test(normalized)) {
    return {
      isValid: false,
      numericValue: 0,
      error: 'Utilize apenas números e vírgula (ex: 5,0 ou 2,5)',
    }
  }

  const [inteiroStr, decimalStr] = normalized.split(',')
  const inteiro = parseInt(inteiroStr, 10)

  if (isNaN(inteiro)) {
    return {
      isValid: false,
      numericValue: 0,
      error: 'Valor inválido',
    }
  }

  // Se houver parte decimal informada
  if (decimalStr !== undefined && decimalStr !== '') {
    // Só é aceita se for exatamente "0" ou "5"
    if (decimalStr !== '0' && decimalStr !== '5') {
      return {
        isValid: false,
        numericValue: 0,
        error: 'Permitido apenas decimal ,0 ou ,5 (ex: 2,0 ou 2,5)',
      }
    }
  }

  const numVal = parseFloat(normalized.replace(',', '.'))
  if (isNaN(numVal) || numVal <= 0) {
    return {
      isValid: false,
      numericValue: 0,
      error: 'A quantidade deve ser maior que zero',
    }
  }

  // Garantir que seja múltiplo de 0.5
  const isMultiple = Math.round(numVal * 2) === numVal * 2
  if (!isMultiple) {
    return {
      isValid: false,
      numericValue: 0,
      error: 'Apenas múltiplos de 0,5 são aceitos (ex: 1,0 ou 1,5)',
    }
  }

  return {
    isValid: true,
    numericValue: numVal,
    error: null,
  }
}

/**
 * Normaliza o valor enquanto o usuário digita:
 * - Converte ponto em vírgula
 * - Remove caracteres inválidos (mantém apenas dígitos e vírgula)
 * - Impede mais de uma vírgula
 * - Limita a no máximo 1 casa decimal
 */
export function normalizeDecimalTyping(rawInput: string): string {
  if (!rawInput) return ''

  // Substitui ponto por vírgula
  let val = rawInput.replace(/\./g, ',')

  // Permite apenas dígitos e vírgula
  val = val.replace(/[^\d,]/g, '')

  // No máximo uma vírgula
  const parts = val.split(',')
  if (parts.length > 2) {
    val = parts[0] + ',' + parts.slice(1).join('')
  }

  // No máximo 1 dígito na parte decimal
  const currentParts = val.split(',')
  if (currentParts.length === 2 && currentParts[1].length > 1) {
    val = currentParts[0] + ',' + currentParts[1].slice(0, 1)
  }

  return val
}

/**
 * Formata o valor ao sair do campo (onBlur):
 * Se estiver vazio, mantém vazio.
 * Se tiver valor inteiro (ex: "5"), completa para "5,0".
 * Se tiver valor terminado em vírgula (ex: "5,"), completa para "5,0".
 * Se tiver começado com vírgula (ex: ",5"), completa para "0,5".
 * Se tiver decimal válido ("0" ou "5"), mantém formatado.
 * Se tiver decimal inválido, mantém para a validação acusar o erro visual.
 */
export function formatQuantityOnBlur(val: string): string {
  const trimmed = val.trim()
  if (!trimmed) return ''

  let normalized = trimmed.replace(/\./g, ',')

  // Caso: ",5" -> "0,5"
  if (normalized.startsWith(',')) {
    normalized = '0' + normalized
  }

  // Caso: "5," -> "5,0"
  if (normalized.endsWith(',')) {
    normalized = normalized + '0'
  }

  // Se não tem vírgula, adicionar ",0"
  if (!normalized.includes(',')) {
    const intVal = parseInt(normalized, 10)
    if (!isNaN(intVal)) {
      return `${intVal},0`
    }
  }

  return normalized
}
