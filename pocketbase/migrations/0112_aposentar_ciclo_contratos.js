/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Garantir que qualquer ciclo sem chamada_id seja preenchido a partir dos contratos/rotas/chamadas
    const ciclosSemChamada = app.findRecordsByFilter(
      'ciclos',
      'chamada_id = "" || chamada_id = null',
      '',
      100,
    )
    for (const ciclo of ciclosSemChamada) {
      let chamadaId = ''

      // Tenta derivar de rotas daquele ciclo se existirem
      try {
        const rotas = app.findRecordsByFilter('rotas', `contrato_id != ""`, '-created', 1)
        if (rotas.length > 0) {
          chamadaId = rotas[0].getString('chamada_id')
        }
      } catch (_) {}

      // Fallback: se ainda vazio, tenta pegar a primeira chamada ativa
      if (!chamadaId) {
        try {
          const chamadas = app.findRecordsByFilter('chamadas', 'status = "Ativo"', 'created', 1)
          if (chamadas.length > 0) {
            chamadaId = chamadas[0].id
          }
        } catch (_) {}
      }

      if (chamadaId) {
        ciclo.set('chamada_id', chamadaId)
        app.save(ciclo)
        console.log(`[0112] Ciclo ${ciclo.id} atualizado com chamada_id = ${chamadaId}`)
      }
    }

    // 2. Apagar todos os registros da collection legada ciclo_contratos (se a collection existir)
    let cicloContratosCol = null
    try {
      cicloContratosCol = app.findCollectionByNameOrId('ciclo_contratos')
    } catch (_) {
      cicloContratosCol = null
    }

    if (cicloContratosCol) {
      try {
        const records = app.findRecordsByFilter('ciclo_contratos', 'id != ""', '', 500)
        for (const rec of records) {
          app.delete(rec)
        }
        console.log(`[0112] Registros legados de ciclo_contratos apagados: ${records.length}`)
      } catch (err) {
        console.log('[0112] Aviso ao apagar registros de ciclo_contratos:', err)
      }

      // 3. Remover a collection ciclo_contratos do schema
      try {
        app.delete(cicloContratosCol)
        console.log('[0112] Collection ciclo_contratos removida com sucesso.')
      } catch (err) {
        console.error('[0112] Erro ao deletar collection ciclo_contratos:', err)
        throw err
      }
    } else {
      console.log('[0112] Collection ciclo_contratos já não existe.')
    }
  },
  (app) => {
    // Reversão opcional (não estritamente necessária, pois a tabela era obsoleta)
    try {
      const existing = app.findCollectionByNameOrId('ciclo_contratos')
      if (existing) return
    } catch (_) {}

    const collection = new Collection({
      name: 'ciclo_contratos',
      type: 'base',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      fields: [
        {
          name: 'ciclo_id',
          type: 'relation',
          required: true,
          collectionId: 'pbc_3752102242',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'contrato_id',
          type: 'relation',
          required: true,
          collectionId: 'pbc_3710136708',
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'fase',
          type: 'text',
          required: false,
        },
      ],
    })

    app.save(collection)
  },
)
