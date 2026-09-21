import type { Product, OrderItem, PedidoValidacao } from '@/lib/types'

export interface OrderValidationInput {
  items: OrderItem[]
  allProducts: Product[]
  cicloStatus: 'coletando' | 'correcao' | 'fechado'
  itensEmFaltaOriginal?: string[] // IDs de produtos com escassez no ciclo
}

/**
 * Valida o pedido conforme a regra de negócio:
 * - Inválido se vazio
 * - Inválido se na fase 'correcao' não compensar item em falta (se pediu item em escassez, precisa ter substituto abundante)
 */
export function validateOrder(params: OrderValidationInput): PedidoValidacao {
  const { items, allProducts, cicloStatus } = params

  const validItems = items.filter((it) => it.quantity > 0)

  if (validItems.length === 0) {
    return {
      status: 'invalido',
      motivo: 'Um pedido deve conter pelo menos 1 item com quantidade maior que zero.',
      detalhes: ['O pedido está vazio ou não possui itens com quantidade válida.'],
    }
  }
  const detalhes: string[] = []

  // Se fase correcao: verificar se itens em escassez foram compensados por itens em abundância
  if (cicloStatus === 'correcao') {
    const produtosEscassez = allProducts.filter((p) => p.disponibilidade === 'escassez')
    const produtosAbundancia = allProducts.filter((p) => p.disponibilidade === 'abundancia')

    // Se o pedido pede itens em escassez mas não inclui nenhum item em abundância para compensar
    const pedeEscassez = validItems.filter((i) =>
      produtosEscassez.some((pe) => pe.id === i.productId),
    )
    const pedeAbundancia = validItems.filter((i) =>
      produtosAbundancia.some((pa) => pa.id === i.productId),
    )

    if (pedeEscassez.length > 0 && pedeAbundancia.length === 0 && produtosAbundancia.length > 0) {
      detalhes.push(
        'Fase de correção: foram solicitados produtos em escassez sem incluir itens compensatórios em abundância.',
      )
      return {
        status: 'invalido',
        motivo:
          'Na fase de correção, pedidos com itens em escassez devem compensar com itens em abundância.',
        detalhes,
      }
    }
  }

  return {
    status: 'validado',
    motivo: 'Pedido atende a todos os critérios de validação.',
    detalhes: ['Validação aprovada com sucesso.'],
  }
}
