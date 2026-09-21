import pb from '@/lib/pocketbase/client'
import type { ProdutoRecord } from '@/lib/types'

export const produtosService = {
  async getAll(): Promise<ProdutoRecord[]> {
    return await pb.collection('produtos').getFullList<ProdutoRecord>({
      sort: 'nome',
    })
  },

  async getById(id: string): Promise<ProdutoRecord> {
    return await pb.collection('produtos').getOne<ProdutoRecord>(id)
  },

  async create(data: Partial<ProdutoRecord>): Promise<ProdutoRecord> {
    return await pb.collection('produtos').create<ProdutoRecord>({
      ...data,
      disponibilidade: data.disponibilidade || 'normal',
    })
  },

  async createBatch(
    items: Array<Partial<ProdutoRecord>>,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<{ created: number; errors: Array<{ index: number; nome: string; error: string }> }> {
    let created = 0
    const errors: Array<{ index: number; nome: string; error: string }> = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const nomeStr = item.nome || `Item ${i + 1}`
      try {
        await pb.collection('produtos').create<ProdutoRecord>({
          ...item,
          disponibilidade: item.disponibilidade || 'normal',
        })
        created++
      } catch (err: any) {
        console.error(`Erro ao salvar produto [${nomeStr}]:`, err)
        const msg = err?.response?.message || err?.message || 'Falha ao salvar produto'
        errors.push({ index: i, nome: nomeStr, error: msg })
      }
      onProgress?.(i + 1, items.length)
    }

    return { created, errors }
  },

  /**
   * Executa importação com atualização seletiva para produtos existentes
   * e criação com defaults para novos produtos.
   */
  async importBatch(
    items: Array<{
      status: 'create' | 'update'
      id?: string
      nome: string
      data: Partial<ProdutoRecord>
    }>,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<{
    created: number
    updated: number
    errors: Array<{ index: number; nome: string; error: string }>
  }> {
    let created = 0
    let updated = 0
    const errors: Array<{ index: number; nome: string; error: string }> = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const nomeStr = item.nome || `Item ${i + 1}`
      try {
        if (item.status === 'create') {
          await pb.collection('produtos').create<ProdutoRecord>({
            ...item.data,
            nome: item.nome,
            disponibilidade: item.data.disponibilidade || 'normal',
          })
          created++
        } else if (item.status === 'update' && item.id) {
          // Atualização seletiva: envia apenas os campos fornecidos
          await pb.collection('produtos').update<ProdutoRecord>(item.id, item.data)
          updated++
        }
      } catch (err: any) {
        console.error(`Erro ao importar produto [${nomeStr}]:`, err)
        const msg = err?.response?.message || err?.message || 'Falha ao salvar produto'
        errors.push({ index: i, nome: nomeStr, error: msg })
      }
      onProgress?.(i + 1, items.length)
    }

    return { created, updated, errors }
  },

  async findByNameNormalized(nome: string): Promise<ProdutoRecord | null> {
    const all = await this.getAll()
    const norm = (str: string) =>
      str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const target = norm(nome)
    if (!target) return null

    // 1. Match pelo nome oficial
    const exactName = all.find((p) => norm(p.nome) === target)
    if (exactName) return exactName

    // 2. Match por apelidos
    for (const p of all) {
      if (!p.apelidos) continue
      const aliases = p.apelidos
        .split(/[,;]/)
        .map((a) => norm(a))
        .filter(Boolean)
      if (aliases.includes(target)) {
        return p
      }
    }

    return null
  },

  async update(id: string, data: Partial<ProdutoRecord>): Promise<ProdutoRecord> {
    return await pb.collection('produtos').update<ProdutoRecord>(id, data)
  },

  async decrementarEstoque(produtoId: string, quantidade: number): Promise<ProdutoRecord> {
    const atual = await pb.collection('produtos').getOne<ProdutoRecord>(produtoId)
    const novoEstoque = Math.max(0, (Number(atual.estoque) || 0) - quantidade)
    return await pb.collection('produtos').update<ProdutoRecord>(produtoId, {
      estoque: novoEstoque,
    })
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('produtos').delete(id)
  },
}
