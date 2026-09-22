migrate(
  (app) => {
    // 1. Criar a coleção ciclo_contratos
    const ciclosCol = app.findCollectionByNameOrId('ciclos')
    const contratosCol = app.findCollectionByNameOrId('contratos')

    const collection = new Collection({
      name: 'ciclo_contratos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'ciclo_id',
          type: 'relation',
          required: true,
          collectionId: ciclosCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'contrato_id',
          type: 'relation',
          required: true,
          collectionId: contratosCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'fase',
          type: 'text',
          required: true,
        },
        {
          name: 'motivo_cancelamento',
          type: 'text',
          required: false,
        },
        {
          name: 'data_cancelamento',
          type: 'date',
          required: false,
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_ciclo_contratos_unique ON ciclo_contratos (ciclo_id, contrato_id)',
        'CREATE INDEX idx_ciclo_contratos_ciclo ON ciclo_contratos (ciclo_id)',
        'CREATE INDEX idx_ciclo_contratos_contrato ON ciclo_contratos (contrato_id)',
      ],
    })

    app.save(collection)

    // 2. Migração dos dados existentes:
    // Para cada ciclo existente, identificar os contratos com pedidos ou contratos ativos
    // e herdar a fase atual do ciclo.
    const ciclos = app.findRecordsByFilter('ciclos', '1=1', 'created', 1000, 0)
    const contratos = app.findRecordsByFilter('contratos', '1=1', 'created', 1000, 0)

    for (const ciclo of ciclos) {
      const cicloFase = ciclo.getString('status') || 'coletando'
      const motivoCancel = ciclo.getString('motivo_cancelamento')
      const dataCancel = ciclo.getString('data_cancelamento')

      // Identificar contratos associados via pedidos
      // pedidos tem escola_id; contrato_escolas tem escola_id + contrato_id
      // ou importacoes tem ciclo_id + contrato_id
      const contratosParaVincular = new Set()

      try {
        const importacoes = app.findRecordsByFilter(
          'importacoes',
          "ciclo_id = '" + ciclo.id + "'",
          'created',
          100,
          0,
        )
        for (const imp of importacoes) {
          const cId = imp.getString('contrato_id')
          if (cId) contratosParaVincular.add(cId)
        }
      } catch (_) {}

      try {
        const pedidos = app.findRecordsByFilter(
          'pedidos',
          "ciclo_id = '" + ciclo.id + "'",
          'created',
          500,
          0,
        )
        for (const p of pedidos) {
          const escolaId = p.getString('escola_id')
          if (escolaId) {
            try {
              const ce = app.findRecordsByFilter(
                'contrato_escolas',
                "escola_id = '" + escolaId + "'",
                'created',
                10,
                0,
              )
              for (const item of ce) {
                const cId = item.getString('contrato_id')
                if (cId) contratosParaVincular.add(cId)
              }
            } catch (_) {}
          }
        }
      } catch (_) {}

      // Se nenhum contrato tiver sido vinculado por pedidos ou importações (ex: novo ciclo sem pedidos ainda),
      // vincula todos os contratos com status 'Ativo'
      if (contratosParaVincular.size === 0) {
        for (const c of contratos) {
          if (c.getString('status') === 'Ativo') {
            contratosParaVincular.add(c.id)
          }
        }
      }

      // Se ainda assim não houver, vincula todos os contratos
      if (contratosParaVincular.size === 0) {
        for (const c of contratos) {
          contratosParaVincular.add(c.id)
        }
      }

      // Criar os registros ciclo_contratos
      for (const contratoId of contratosParaVincular) {
        const rec = new Record(collection)
        rec.set('ciclo_id', ciclo.id)
        rec.set('contrato_id', contratoId)
        rec.set('fase', cicloFase)
        if (motivoCancel) rec.set('motivo_cancelamento', motivoCancel)
        if (dataCancel) rec.set('data_cancelamento', dataCancel)
        app.save(rec)
      }
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('ciclo_contratos')
    app.delete(collection)
  },
)
