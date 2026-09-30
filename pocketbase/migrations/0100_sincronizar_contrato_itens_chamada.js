/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Sincronizar contrato_itens de cada contrato com os itens da chamada vinculada
    // 1. Manter quantidades_contratadas por produto_id
    // 2. Criar contrato_itens que faltarem para produtos da chamada (quantidade vazia/0)
    // 3. Remover registros de produtos que não pertencem à chamada
    // 4. Limpar/ignorar preço e nomes duplicados em contrato_itens (preço e nomes vêm de chamada_itens)
    try {
      const contratos = app.findRecordsByFilter('contratos', '1=1', 'created', 0)
      const contratoItensCol = app.findCollectionByNameOrId('contrato_itens')

      for (const contrato of contratos) {
        const contratoId = contrato.id
        const chamadaId = contrato.getString('chamada_id')
        if (!chamadaId) continue

        // Buscar chamada_itens desta chamada
        const chamadaItens = app.findRecordsByFilter(
          'chamada_itens',
          `chamada_id = '${chamadaId}'`,
          'created',
          0,
        )

        // Mapear produtos válidos na chamada
        const produtosNaChamada = new Map() // produto_id -> chamada_item
        for (const ci of chamadaItens) {
          const pid = ci.getString('produto_id')
          if (pid) {
            produtosNaChamada.set(pid, ci)
          }
        }

        // Buscar itens atuais do contrato
        const itensAtuais = app.findRecordsByFilter(
          'contrato_itens',
          `contrato_id = '${contratoId}'`,
          'created',
          0,
        )

        const produtosExistentesNoContrato = new Set()

        for (const item of itensAtuais) {
          const pid = item.getString('produto_id')
          if (!pid || !produtosNaChamada.has(pid)) {
            // Produto não pertence à chamada do contrato -> remover
            try {
              app.delete(item)
            } catch (delErr) {
              console.log('Erro ao remover contrato_item órfão:', delErr)
            }
          } else {
            produtosExistentesNoContrato.add(pid)
          }
        }

        // Criar contrato_itens para produtos da chamada que ainda não existem no contrato
        for (const [pid, chamadaItem] of produtosNaChamada.entries()) {
          if (!produtosExistentesNoContrato.has(pid)) {
            const novoItem = new Record(contratoItensCol)
            novoItem.set('contrato_id', contratoId)
            novoItem.set('produto_id', pid)
            novoItem.set('quantidade_contratada', 0)
            novoItem.set('preco', chamadaItem.getFloat('preco') || 0)
            novoItem.set('nome_contrato', chamadaItem.getString('produto') || '')
            novoItem.set('apelidos', chamadaItem.getString('aka') || '')
            app.save(novoItem)
          }
        }
      }
    } catch (err) {
      console.log('Erro na migracao 0100_sincronizar_contrato_itens_chamada:', err)
      throw err
    }
  },
  (app) => {
    // Reverter não destrutivo (dados preservados)
  },
)
