import pb from '@/lib/pocketbase/client'
import type { CompraDistribuicaoRecord, FornecedorProdutoRecord } from '@/lib/types'

/**
 * Services da Consolidação para Compras:
 * - fornecedoresProdutoService: vínculo fornecedor ↔ produto (cartão "Comprar")
 * - compraDistribuicaoService: linhas gravadas da distribuição da compra
 *   (uma por fornecedor participante), sempre com ciclo_id do recorte.
 * - compraConfigService: configurações de compra por ciclo (percentual máximo
 *   da distribuição — coleção compra_config).
 */

export const PERCENTUAL_MAXIMO_PADRAO = 125

function normalizeFornecedorProduto(r: any): FornecedorProdutoRecord {
  return {
    id: r.id,
    fornecedor_id: r.fornecedor_id || '',
    produto_id: r.produto_id || '',
    expand: r.expand,
    created: r.created,
    updated: r.updated,
  }
}

/** Campo date do PocketBase volta como "2026-11-03 00:00:00.000Z" → "2026-11-03" */
export function normalizarDataISO(valor?: string): string {
  return (valor || '').slice(0, 10)
}

function normalizeCompraDistribuicao(r: any): CompraDistribuicaoRecord {
  return {
    id: r.id,
    ciclo_id: r.ciclo_id || '',
    data_entrega: r.data_entrega ? normalizarDataISO(r.data_entrega) : undefined,
    fornecedor_id: r.fornecedor_id || '',
    produto_id: r.produto_id || '',
    quantidade: Number(r.quantidade) || 0,
    unidade: r.unidade || undefined,
    modo: r.modo === 'percentual' ? 'percentual' : 'igual',
    percentual:
      r.percentual === null || r.percentual === undefined ? undefined : Number(r.percentual),
    criado_por: r.criado_por || undefined,
    chamada_id: r.chamada_id || undefined,
    expand: r.expand,
    created: r.created,
    updated: r.updated,
  }
}

export const fornecedoresProdutoService = {
  async listByProduto(produtoId: string): Promise<FornecedorProdutoRecord[]> {
    if (!produtoId) return []
    const records = await pb.collection('fornecedores_produto').getFullList({
      filter: `produto_id = "${produtoId}"`,
      sort: '-created',
    })
    return records.map(normalizeFornecedorProduto)
  },

  async listAll(): Promise<FornecedorProdutoRecord[]> {
    const records = await pb.collection('fornecedores_produto').getFullList()
    return records.map(normalizeFornecedorProduto)
  },

  async create(fornecedorId: string, produtoId: string): Promise<FornecedorProdutoRecord> {
    const created = await pb.collection('fornecedores_produto').create({
      fornecedor_id: fornecedorId,
      produto_id: produtoId,
    })
    return normalizeFornecedorProduto(created)
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('fornecedores_produto').delete(id)
  },
}

export interface SalvarDistribuicaoInput {
  cicloId: string
  dataEntrega?: string
  chamadaId?: string
  produtoId: string
  unidade?: string
  criadoPor?: string
  linhas: Array<{
    fornecedorId: string
    quantidade: number
    percentual?: number
    modo: 'igual' | 'percentual'
  }>
}

export interface CompraConfigRecord {
  id: string
  ciclo_id: string
  produto_id?: string
  percentual_maximo?: number
  criado_por?: string
  created?: string
  updated?: string
}

function normalizeCompraConfig(r: any): CompraConfigRecord {
  return {
    id: r.id,
    ciclo_id: r.ciclo_id || '',
    produto_id: r.produto_id || undefined,
    percentual_maximo:
      r.percentual_maximo === null || r.percentual_maximo === undefined
        ? undefined
        : Number(r.percentual_maximo),
    criado_por: r.criado_por || undefined,
    created: r.created,
    updated: r.updated,
  }
}

/**
 * Percentual máximo da distribuição, persistido por ciclo (+ produto):
 * 1º procura registro específico do produto; sem registro, usa o geral do
 * ciclo; sem nenhum, usa o padrão de 125%.
 */
export const compraConfigService = {
  async getPercentualMaximo(cicloId: string, produtoId?: string): Promise<number> {
    if (!cicloId) return PERCENTUAL_MAXIMO_PADRAO
    try {
      const filtros: string[] = [`ciclo_id = "${cicloId}"`]
      if (produtoId) filtros.push(`produto_id = "${produtoId}"`)
      else filtros.push(`produto_id = ""`)
      const recs = await pb
        .collection('compra_config')
        .getFullList({ filter: filtros.join(' && '), sort: '-updated' })
      const rec = recs.find((r) => Number(r.percentual_maximo) > 0)
      if (rec) return Number(rec.percentual_maximo)
    } catch {
      // sem registro / sem permissão: cai para o fallback abaixo
    }
    // Fallback: configuração geral do ciclo
    if (produtoId) {
      try {
        const recs = await pb.collection('compra_config').getFullList({
          filter: `ciclo_id = "${cicloId}" && produto_id = ""`,
        })
        const rec = recs.find((r) => Number(r.percentual_maximo) > 0)
        if (rec) return Number(rec.percentual_maximo)
      } catch {
        // ignora: usa o padrão
      }
    }
    return PERCENTUAL_MAXIMO_PADRAO
  },

  /** Grava (upsert) o percentual máximo por ciclo+produto. */
  async salvarPercentualMaximo(input: {
    cicloId: string
    produtoId?: string
    percentualMaximo: number
    criadoPor?: string
  }): Promise<void> {
    const { cicloId, produtoId, percentualMaximo, criadoPor } = input
    if (!cicloId || !(percentualMaximo > 0)) return
    const filtro = produtoId
      ? `ciclo_id = "${cicloId}" && produto_id = "${produtoId}"`
      : `ciclo_id = "${cicloId}" && produto_id = ""`
    const data: Record<string, unknown> = {
      ciclo_id: cicloId,
      percentual_maximo: percentualMaximo,
    }
    if (produtoId) data.produto_id = produtoId
    if (criadoPor) data.criado_por = criadoPor

    const recs = await pb.collection('compra_config').getFullList({ filter: filtro })
    if (recs.length > 0) {
      await pb.collection('compra_config').update(recs[0].id, data)
      return
    }
    await pb.collection('compra_config').create(data)
  },
}

export const compraDistribuicaoService = {
  async listByCiclo(cicloId: string): Promise<CompraDistribuicaoRecord[]> {
    if (!cicloId) return []
    const records = await pb
      .collection('compra_distribuicao')
      .getFullList({ filter: `ciclo_id = "${cicloId}"` })
    return records.map(normalizeCompraDistribuicao)
  },

  async listByCicloProduto(
    cicloId: string,
    produtoId: string,
  ): Promise<CompraDistribuicaoRecord[]> {
    if (!cicloId || !produtoId) return []
    const records = await pb.collection('compra_distribuicao').getFullList({
      filter: `ciclo_id = "${cicloId}" && produto_id = "${produtoId}"`,
    })
    return records.map(normalizeCompraDistribuicao)
  },

  /**
   * Regrava a distribuição do produto no ciclo: apaga as linhas existentes
   * (ciclo+produto) e grava uma linha por fornecedor participante.
   * `linhas` vazio = distribuição removida por completo → apaga tudo.
   */
  async salvarDistribuicao(input: SalvarDistribuicaoInput): Promise<CompraDistribuicaoRecord[]> {
    const { cicloId, dataEntrega, chamadaId, produtoId, unidade, criadoPor, linhas } = input

    if (!cicloId || !produtoId) {
      throw new Error('Ciclo e produto são obrigatórios para gravar a distribuição.')
    }

    // 1) Replace: apaga as linhas atuais do ciclo+produto
    const atuais = await pb.collection('compra_distribuicao').getFullList({
      filter: `ciclo_id = "${cicloId}" && produto_id = "${produtoId}"`,
    })
    for (const rec of atuais) {
      await pb.collection('compra_distribuicao').delete(rec.id)
    }

    // 2) Grava uma linha por fornecedor participante
    const gravadas: CompraDistribuicaoRecord[] = []
    for (const linha of linhas) {
      const criado = await pb.collection('compra_distribuicao').create({
        ciclo_id: cicloId,
        // Normaliza para 'yyyy-mm-dd': dataEntrega vem do Order.date cru
        // ("yyyy-mm-dd HH:mm:ss.mmmZ") e o recorte compara só o dia.
        data_entrega: dataEntrega ? normalizarDataISO(dataEntrega) : undefined,
        chamada_id: chamadaId || undefined,
        fornecedor_id: linha.fornecedorId,
        produto_id: produtoId,
        quantidade: Number(linha.quantidade) || 0,
        unidade: unidade || undefined,
        modo: linha.modo,
        percentual:
          linha.modo === 'percentual' && typeof linha.percentual === 'number'
            ? linha.percentual
            : undefined,
        criado_por: criadoPor || undefined,
      })
      gravadas.push(normalizeCompraDistribuicao(criado))
    }

    return gravadas
  },
}
