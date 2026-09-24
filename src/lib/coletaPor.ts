import type { ContratoEscolaRecord, ContractSchoolLink } from '@/lib/types'

export type ColetaPorTipo = 'padrao' | 'formulario' | 'planilha'
export type ColetaPorEfetivo = 'formulario' | 'planilha'

export interface ResolucaoColetaPorInput {
  coleta_por?: string | null
  encerrado_em?: string | null
  modalidade_pedido?: 'individualizado' | 'centralizado' | string | null
  status_contrato?: 'Ativo' | 'Encerrado' | 'Cancelado' | 'Pendente' | string | null
}

/**
 * Resolve o valor EFETIVO de coleta_por para um vínculo entre escola e contrato.
 *
 * Regra:
 * - Se coleta_por for 'padrao' (ou vazio/nulo), resolve pela modalidade do contrato:
 *   - 'individualizado' -> 'formulario'
 *   - 'centralizado'    -> 'planilha'
 *   - fallback          -> 'formulario'
 * - Se coleta_por for 'formulario' ou 'planilha', usa o valor explícito do vínculo (coleta mista).
 *
 * @param vinculo Objeto com coleta_por (ContratoEscolaRecord, ContractSchoolLink ou objeto parcial)
 * @param modalidadePedido Modalidade do contrato ('individualizado' | 'centralizado')
 */
export function getColetaPorEfetivo(
  vinculo?: { coleta_por?: string | null } | null,
  modalidadePedido?: string | null,
): ColetaPorEfetivo {
  const rawValor = (vinculo?.coleta_por || '').trim().toLowerCase()

  if (rawValor === 'formulario') {
    return 'formulario'
  }

  if (rawValor === 'planilha') {
    return 'planilha'
  }

  // Se coleta_por for 'padrao', nulo, vazio ou não reconhecido,
  // resolve pela modalidade do contrato:
  const mod = (modalidadePedido || '').trim().toLowerCase()
  if (mod === 'centralizado') {
    return 'planilha'
  }

  // Default para individualizado ou quando não especificado
  return 'formulario'
}

/**
 * Determina se um vínculo escola-contrato é elegível para geração de token do formulário público.
 *
 * Critérios cumulativos:
 * 1. O contrato deve estar com status 'Ativo' (contratos Encerrados/Cancelados/Pendentes não geram token).
 * 2. O vínculo NÃO pode ter encerrado_em preenchido (escola desvinculada ou vínculo encerrado não gera token).
 * 3. O coleta_por EFETIVO deve ser 'formulario' (NUNCA 'planilha').
 */
export function isVinculoElegivelParaTokenFormulario(params: {
  vinculo?: {
    coleta_por?: string | null
    encerrado_em?: string | null
  } | null
  contrato?: {
    status?: string | null
    modalidade_pedido?: string | null
    encerrado_em?: string | null
  } | null
}): boolean {
  const { vinculo, contrato } = params

  if (!vinculo || !contrato) {
    return false
  }

  // Verificação de status do contrato: somente contrato Ativo gera token
  if (contrato.status !== 'Ativo') {
    return false
  }

  // Se o contrato em si estiver encerrado
  if (contrato.encerrado_em && contrato.encerrado_em.trim() !== '') {
    return false
  }

  // Verificação de vínculo encerrado: se encerrado_em estiver preenchido, não gera token
  if (vinculo.encerrado_em && vinculo.encerrado_em.trim() !== '') {
    return false
  }

  // Verificação do coleta_por EFETIVO: deve ser 'formulario'
  const efetivo = getColetaPorEfetivo(vinculo, contrato.modalidade_pedido)
  return efetivo === 'formulario'
}
