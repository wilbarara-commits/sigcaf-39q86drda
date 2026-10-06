/**
 * Utilitários para formatação e validação de CPF (Cadastro de Pessoas Físicas)
 */

/**
 * Remove todos os caracteres não numéricos de uma string
 */
export function limparCPF(cpf: string): string {
  return (cpf || '').replace(/\D/g, '')
}

/**
 * Aplica máscara de CPF progressiva: 000.000.000-00
 */
export function formatarCPF(valor: string): string {
  const apenasDigitos = limparCPF(valor).slice(0, 11)
  if (apenasDigitos.length <= 3) {
    return apenasDigitos
  }
  if (apenasDigitos.length <= 6) {
    return `${apenasDigitos.slice(0, 3)}.${apenasDigitos.slice(3)}`
  }
  if (apenasDigitos.length <= 9) {
    return `${apenasDigitos.slice(0, 3)}.${apenasDigitos.slice(3, 6)}.${apenasDigitos.slice(6)}`
  }
  return `${apenasDigitos.slice(0, 3)}.${apenasDigitos.slice(3, 6)}.${apenasDigitos.slice(6, 9)}-${apenasDigitos.slice(9, 11)}`
}

/**
 * Validação dos dígitos verificadores do CPF de acordo com as regras oficiais da Receita Federal.
 * Retorna true se vazio/nulo (já que quando opcional deve ser checado antes se está preenchido,
 * ou pode-se usar explicitamente validarCPF se preenchido).
 */
export function validarDigitosCPF(cpf: string): boolean {
  const digitos = limparCPF(cpf)
  if (digitos.length !== 11) return false

  // Rejeita sequências de dígitos iguais conhecidas (ex: 000.000.000-00, 111.111.111-11, etc.)
  if (/^(\d)\1{10}$/.test(digitos)) return false

  // Cálculo do 1º dígito verificador
  let soma = 0
  for (let i = 0; i < 9; i++) {
    soma += parseInt(digitos.charAt(i), 10) * (10 - i)
  }
  let resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(digitos.charAt(9), 10)) return false

  // Cálculo do 2º dígito verificador
  soma = 0
  for (let i = 0; i < 10; i++) {
    soma += parseInt(digitos.charAt(i), 10) * (11 - i)
  }
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(digitos.charAt(10), 10)) return false

  return true
}
