import pb from '@/lib/pocketbase/client'
import type { EscolaRecord } from '@/lib/types'

export const escolasService = {
  async getAll(): Promise<EscolaRecord[]> {
    return await pb.collection('escolas').getFullList<EscolaRecord>({
      sort: 'nome',
    })
  },

  async getById(id: string): Promise<EscolaRecord> {
    return await pb.collection('escolas').getOne<EscolaRecord>(id)
  },

  async create(data: Omit<EscolaRecord, 'id' | 'created' | 'updated'>): Promise<EscolaRecord> {
    return await pb.collection('escolas').create<EscolaRecord>(data)
  },

  async createBatch(
    items: Array<Omit<EscolaRecord, 'id' | 'created' | 'updated'>>,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<{ created: number; errors: Array<{ index: number; nome: string; error: string }> }> {
    let created = 0
    const errors: Array<{ index: number; nome: string; error: string }> = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      try {
        await pb.collection('escolas').create<EscolaRecord>(item)
        created++
      } catch (err: any) {
        console.error(`Erro ao salvar escola [${item.nome}]:`, err)
        const msg = err?.response?.message || err?.message || 'Falha ao salvar'
        errors.push({ index: i, nome: item.nome, error: msg })
      }
      onProgress?.(i + 1, items.length)
    }

    return { created, errors }
  },

  async importBatch(
    items: Array<{
      action: 'create' | 'update'
      id?: string
      nome: string
      tipo?: string
      rota?: string
      alunos?: number
      endereco?: string
      telefone?: string
      email?: string
      bairro?: string
      contato?: string
      // Colunas que estavam presentes no arquivo
      presentColumns?: {
        tipo?: boolean
        rota?: boolean
        alunos?: boolean
        endereco?: boolean
        telefone?: boolean
        email?: boolean
        bairro?: boolean
        contato?: boolean
      }
    }>,
    mode: 'keep' | 'clear' | 'merge' | 'overwrite', // 'keep'/'merge' = mantém anterior quando em branco; 'clear'/'overwrite' = limpa campo no banco
    onProgress?: (processed: number, total: number) => void,
  ): Promise<{
    created: number
    updated: number
    errors: Array<{ index: number; nome: string; error: string }>
  }> {
    let created = 0
    let updated = 0
    const errors: Array<{ index: number; nome: string; error: string }> = []
    const isClearMode = mode === 'clear' || mode === 'overwrite'

    // Cache local dos registros existentes para garantir deduplicação estrita em tempo de execução
    const existingList = await this.getAll()
    const norm = (str: string) =>
      str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const existingMap = new Map<string, EscolaRecord>()
    for (const esc of existingList) {
      const k = norm(esc.nome)
      if (k && !existingMap.has(k)) {
        existingMap.set(k, esc)
      }
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      try {
        const itemNorm = norm(item.nome)
        const alreadyInDb = existingMap.get(itemNorm)

        // REGRA 4: NUNCA criar nome duplicado no cadastro mestre.
        // Se a ação for 'create' mas já existir escola com o mesmo nome normalizado,
        // converte para 'update' da escola existente.
        const effectiveAction: 'create' | 'update' =
          item.action === 'create' && !alreadyInDb ? 'create' : 'update'
        const targetId = item.id || alreadyInDb?.id

        if (effectiveAction === 'create') {
          const payload: any = {
            nome: item.nome.trim(),
            tipo: item.tipo || '',
            rota: '',
            endereco: item.endereco || '',
            telefone: item.telefone || '',
            email: item.email || '',
            bairro: item.bairro || '',
            contato: item.contato || '',
          }
          if (item.alunos !== undefined) {
            payload.alunos = item.alunos
          }
          const createdRec = await pb.collection('escolas').create<EscolaRecord>(payload)
          existingMap.set(itemNorm, createdRec)
          created++
        } else if (effectiveAction === 'update' && targetId) {
          const payload: any = {}

          // REGRA 1 & 2: Colunas presentes no cabeçalho são importadas.
          // Colunas AUSENTES no cabeçalho NÃO SÃO AFETADAS (não limpas, não alteradas).
          // Para colunas PRESENTES no cabeçalho:
          //  - Se preenchida: grava o novo valor
          //  - Se em branco:
          //      * 'clear': substitui por vazio/null
          //      * 'keep': mantém o valor anterior (não inclui no payload)
          if (item.presentColumns?.tipo) {
            if (item.tipo) {
              payload.tipo = item.tipo
            } else if (isClearMode) {
              payload.tipo = ''
            }
          }

          // Nota: a rota não é atualizada nem limpa pelo cadastro mestre (Regra 2)

          if (item.presentColumns?.alunos) {
            if (item.alunos !== undefined && item.alunos !== null) {
              payload.alunos = item.alunos
            } else if (isClearMode) {
              payload.alunos = null
            }
          }

          if (item.presentColumns?.endereco) {
            if (item.endereco && item.endereco.trim()) {
              payload.endereco = item.endereco.trim()
            } else if (isClearMode) {
              payload.endereco = ''
            }
          }

          if (item.presentColumns?.telefone) {
            if (item.telefone && item.telefone.trim()) {
              payload.telefone = item.telefone.trim()
            } else if (isClearMode) {
              payload.telefone = ''
            }
          }

          if (item.presentColumns?.email) {
            if (item.email && item.email.trim()) {
              payload.email = item.email.trim()
            } else if (isClearMode) {
              payload.email = ''
            }
          }

          if (item.presentColumns?.bairro) {
            if (item.bairro && item.bairro.trim()) {
              payload.bairro = item.bairro.trim()
            } else if (isClearMode) {
              payload.bairro = ''
            }
          }

          if (item.presentColumns?.contato) {
            if (item.contato && item.contato.trim()) {
              payload.contato = item.contato.trim()
            } else if (isClearMode) {
              payload.contato = ''
            }
          }

          // Se tiver pelo menos um campo para alterar, faz o update
          if (Object.keys(payload).length > 0) {
            const updatedRec = await pb
              .collection('escolas')
              .update<EscolaRecord>(targetId, payload)
            existingMap.set(itemNorm, updatedRec)
          }
          updated++
        }
      } catch (err: any) {
        console.error(`Erro ao processar escola [${item.nome}]:`, err)
        const msg = err?.response?.message || err?.message || 'Falha ao processar'
        errors.push({ index: i, nome: item.nome, error: msg })
      }
      onProgress?.(i + 1, items.length)
    }

    return { created, updated, errors }
  },

  async update(id: string, data: Partial<EscolaRecord>): Promise<EscolaRecord> {
    return await pb.collection('escolas').update<EscolaRecord>(id, data)
  },

  async findByNameNormalized(nome: string): Promise<EscolaRecord | null> {
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
    return all.find((e) => norm(e.nome) === target) || null
  },

  async delete(id: string): Promise<boolean> {
    return await pb.collection('escolas').delete(id)
  },

  async checkDependencies(id: string): Promise<{ contractsCount: number; ordersCount: number }> {
    const [contractEscolas, orders] = await Promise.all([
      pb.collection('contrato_escolas').getList(1, 1, { filter: `escola_id = "${id}"` }),
      pb.collection('pedidos').getList(1, 1, { filter: `escola_id = "${id}"` }),
    ])
    return {
      contractsCount: contractEscolas.totalItems,
      ordersCount: orders.totalItems,
    }
  },
}
