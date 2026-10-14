/**
 * Utilitários para formatação e validação de CPF e CNPJ (identidade do fornecedor)
 */
import { limparCPF, formatarCPF, validarDigitosCPF } from './cpfUtils'

export { limparCPF, formatarCPF, validarDigitosCPF }

/**
 * Remove caracteres não numéricos
 */
export function limparDocumento(valor: string): string {
  return (valor || '').replace(/\D/g, '')
}

/**
 * Validação de CNPJ (14 dígitos)
 */
export function validarDigitosCNPJ(cnpj: string): boolean {
  const digitos = limparDocumento(cnpj)
  if (digitos.length !== 14) return false

  // Rejeita sequências de dígitos iguais (ex: 00000000000000, 11111111111111, etc.)
  if (/^(\d)\1{13}$/.test(digitos)) return false

  // 1º dígito verificador
  let tamanho = digitos.length - 2
  let numeros = digitos.substring(0, tamanho)
  const digitosVerificadores = digitos.substring(tamanho)
  let soma = 0
  let pos = tamanho - 7
  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i), 10) * pos--
    if (pos < 2) pos = 9
  }
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11)
  if (resultado !== parseInt(digitosVerificadores.charAt(0), 10)) return false

  // 2º dígito verificador
  tamanho = tamanho + 1
  numeros = digitos.substring(0, tamanho)
  soma = 0
  pos = tamanho - 7
  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i), 10) * pos--
    if (pos < 2) pos = 9
  }
  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11)
  if (resultado !== parseInt(digitosVerificadores.charAt(1), 10)) return false

  return true
}

/**
 * Validação combinada: aceita CPF (11 dígitos) ou CNPJ (14 dígitos)
 * Retorna true se válido. Se vazio, retorna true (campo opcional no modelo).
 */
export function validarDocumentoIdentidade(valor: string): boolean {
  const limpo = limparDocumento(valor)
  if (!limpo) return true
  if (limpo.length === 11) return validarDigitosCPF(limpo)
  if (limpo.length === 14) return validarDigitosCNPJ(limpo)
  return false
}

/**
 * Formata CPF ou CNPJ progressivamente conforme o tamanho
 */
export function formatarDocumentoIdentidade(valor: string): string {
  const limpo = limparDocumento(valor).slice(0, 14)
  if (limpo.length <= 11) {
    return formatarCPF(limpo)
  }
  // CNPJ: 00.000.000/0000-00
  if (limpo.length <= 12) {
    return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8)}`
  }
  return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12, 14)}`
}

/**
 * Formata WhatsApp / Telefone celular brasileiro: (XX) XXXXX-XXXX
 */
export function formatarWhatsApp(valor: string): string {
  const limpo = limparDocumento(valor).slice(0, 11)
  if (!limpo) return ''
  if (limpo.length <= 2) {
    return `(${limpo}`
  }
  if (limpo.length <= 6) {
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2)}`
  }
  if (limpo.length <= 10) {
    // Telefone fixo (8 dígitos): (XX) XXXX-XXXX
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`
  }
  // Celular (9 dígitos): (XX) XXXXX-XXXX
  return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`
}

/**
 * Formata CEP: 00000-000
 */
export function formatarCEP(valor: string): string {
  const limpo = limparDocumento(valor).slice(0, 8)
  if (limpo.length <= 5) return limpo
  return `${limpo.slice(0, 5)}-${limpo.slice(5)}`
}
