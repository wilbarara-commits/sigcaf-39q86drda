/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const chamadasCol = app.findCollectionByNameOrId('chamadas')
    const produtosCol = app.findCollectionByNameOrId('produtos')

    // 1. Criar collection chamada_itens
    let chamadaItensCol
    try {
      chamadaItensCol = app.findCollectionByNameOrId('chamada_itens')
    } catch (_) {
      chamadaItensCol = new Collection({
        name: 'chamada_itens',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          {
            name: 'chamada_id',
            type: 'relation',
            required: true,
            collectionId: chamadasCol.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            name: 'produto_id',
            type: 'relation',
            required: false,
            collectionId: produtosCol.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
          {
            name: 'produto',
            type: 'text',
            required: false,
          },
          {
            name: 'aka',
            type: 'text',
            required: false,
          },
          {
            name: 'unidade',
            type: 'text',
            required: false,
          },
          {
            name: 'preco',
            type: 'number',
            min: 0,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_chamada_itens_chamada ON chamada_itens (chamada_id)',
          'CREATE INDEX idx_chamada_itens_produto ON chamada_itens (produto)',
        ],
      })
      app.save(chamadaItensCol)
    }

    // 2. Migração de dados de contrato_itens para chamada_itens
    // Para cada contrato_itens existente, criar o item correspondente na chamada do contrato
    // agrupando por produto+aka dentro da mesma chamada.
    // Preço: usar o mais recente em caso de divergência.
    try {
      const contratos = app.findRecordsByFilter('contratos', '1=1', '-created', 0)
      const contratoChamadaMap = new Map() // contrato_id -> chamada_id
      for (const c of contratos) {
        if (c.getString('chamada_id')) {
          contratoChamadaMap.set(c.id, c.getString('chamada_id'))
        }
      }

      // Buscar todos os contrato_itens ordenados por created ASC (para que os mais recentes sobrescrevam preço)
      const cItens = app.findRecordsByFilter('contrato_itens', '1=1', 'created', 0)

      // Mapa para agrupar: chave = `${chamada_id}::${cleanProduto}::${cleanAka}`
      const agrupados = new Map()

      for (const ci of cItens) {
        const contratoId = ci.getString('contrato_id')
        const chamadaId = contratoChamadaMap.get(contratoId)
        if (!chamadaId) continue

        let produtoNome = ci.getString('nome_contrato') || ''
        const produtoId = ci.getString('produto_id')
        let unidade = 'Kg'

        if (produtoId) {
          try {
            const pRec = app.findRecordById('produtos', produtoId)
            if (!produtoNome) {
              produtoNome = pRec.getString('nome') || ''
            }
            unidade = pRec.getString('unidade') || 'Kg'
          } catch (_) {}
        }

        const aka = ci.getString('apelidos') || ''
        const preco = ci.getFloat('preco') || 0

        const key = `${chamadaId}:::${(produtoNome || '').trim().toLowerCase()}:::${(aka || '').trim().toLowerCase()}`

        agrupados.set(key, {
          chamada_id: chamadaId,
          produto_id: produtoId || '',
          produto: produtoNome.trim() || 'Produto',
          aka: aka.trim(),
          unidade: unidade || 'Kg',
          preco: preco,
        })
      }

      // Inserir os registros agrupados em chamada_itens
      for (const item of agrupados.values()) {
        const novo = new Record(chamadaItensCol)
        novo.set('chamada_id', item.chamada_id)
        if (item.produto_id) {
          novo.set('produto_id', item.produto_id)
        }
        novo.set('produto', item.produto)
        novo.set('aka', item.aka)
        novo.set('unidade', item.unidade)
        novo.set('preco', item.preco)
        app.save(novo)
      }
    } catch (err) {
      console.log('Aviso ao migrar contrato_itens para chamada_itens:', err)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('chamada_itens')
      app.delete(col)
    } catch (_) {}
  },
)
