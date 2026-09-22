import type { Product, OrderItem, PedidoValidacao } from '@/lib/types'

export interface OrderValidationInput {
  items: OrderItem[]
  allProducts: Product[]
  cicloStatus: string
  itensEmFaltaOriginal?: string[]
}

/**
 * Valida o pedido conforme a regra de negócio:
 * - Inválido se vazio
 */
export function validateOrder(params: OrderValidationInput): PedidoValidacao {
  const { items } = params

  const validItems = items.filter((it) => it.quantity > 0)

  if (validItems.length === 0) {
    return {
      status: 'invalido',
      motivo: 'Um pedido deve conter pelo menos 1 item com quantidade maior que zero.',
      detalhes: ['O pedido está vazio ou não possui itens com quantidade válida.'],
    }
  }

  return {
    status: 'validado',
    motivo: 'Pedido atende a todos os critérios de validação.',
    detalhes: ['Validação aprovada com sucesso.'],
  }
}
