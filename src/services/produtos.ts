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
    const { disponibilidade: _disp, ...payload } = data
    return await pb.collection('produtos').create<ProdutoRecord>(payload)
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
      const { disponibilidade: _disp, ...payload } = item
      try {
        await pb.collection('produtos').create<ProdutoRecord>(payload)
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
      const { disponibilidade: _disp, ...cleanData } = item.data
      try {
        if (item.status === 'create') {
          await pb.collection('produtos').create<ProdutoRecord>({
            ...cleanData,
            nome: item.nome,
          })
          created++
        } else if (item.status === 'update' && item.id) {
          // Atualização seletiva: envia apenas os campos fornecidos
          await pb.collection('produtos').update<ProdutoRecord>(item.id, cleanData)
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
    const { disponibilidade: _disp, ...payload } = data
    return await pb.collection('produtos').update<ProdutoRecord>(id, payload)
  },

  async decrementarEstoque(_produtoId: string, _quantidade: number): Promise<void> {
    // Estoque foi removido do módulo de produtos — mantido como no-op seguro para retrocompatibilidade
    return
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('produtos').delete(id)
  },
}
