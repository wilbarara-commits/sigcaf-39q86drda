migrate(
  (app) => {
    const contratosCol = app.findCollectionByNameOrId('contratos')
    const pedidosCol = app.findCollectionByNameOrId('pedidos')
    const escolasCol = app.findCollectionByNameOrId('escolas')
    const ciclosCol = app.findCollectionByNameOrId('ciclos')
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Campo num_rotas_logisticas (number) em contratos
    if (!contratosCol.fields.getByName('num_rotas_logisticas')) {
      contratosCol.fields.add(
        new NumberField({
          name: 'num_rotas_logisticas',
          min: 1,
          onlyInt: true,
          required: false,
        }),
      )
      app.save(contratosCol)
    }

    // 2. Criar collection rotas_logisticas (contrato_id, nome, ordem, ativa)
    let rotasLogCol
    try {
      rotasLogCol = app.findCollectionByNameOrId('rotas_logisticas')
    } catch (_) {
      const col = new Collection({
        name: 'rotas_logisticas',
        type: 'base',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
        fields: [
          {
            name: 'contrato_id',
            type: 'relation',
            required: true,
            collectionId: contratosCol.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          { name: 'nome', type: 'text', required: true },
          { name: 'ordem', type: 'number', onlyInt: true },
          { name: 'ativa', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_rotas_log_contrato ON rotas_logisticas (contrato_id)',
          'CREATE INDEX idx_rotas_log_ordem ON rotas_logisticas (ordem)',
        ],
      })
      app.save(col)
      rotasLogCol = app.findCollectionByNameOrId('rotas_logisticas')
    }

    // 3. Adicionar rota_logistica_id, motivo_cancelamento e cancelado_em em pedidos
    if (!pedidosCol.fields.getByName('rota_logistica_id')) {
      pedidosCol.fields.add(
        new RelationField({
          name: 'rota_logistica_id',
          required: false,
          collectionId: rotasLogCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }

    if (!pedidosCol.fields.getByName('motivo_cancelamento')) {
      pedidosCol.fields.add(
        new TextField({
          name: 'motivo_cancelamento',
          required: false,
        }),
      )
    }

    if (!pedidosCol.fields.getByName('cancelado_em')) {
      pedidosCol.fields.add(
        new DateField({
          name: 'cancelado_em',
          required: false,
        }),
      )
    }

    app.save(pedidosCol)

    // 4. Criar collection paradas_rota (rota_logistica_id, escola_id, ordem)
    try {
      app.findCollectionByNameOrId('paradas_rota')
    } catch (_) {
      const col = new Collection({
        name: 'paradas_rota',
        type: 'base',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
        fields: [
          {
            name: 'rota_logistica_id',
            type: 'relation',
            required: true,
            collectionId: rotasLogCol.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            name: 'escola_id',
            type: 'relation',
            required: true,
            collectionId: escolasCol.id,
            maxSelect: 1,
            cascadeDelete: true,
          },
          { name: 'ordem', type: 'number', onlyInt: true, required: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_paradas_rota ON paradas_rota (rota_logistica_id, ordem)',
          'CREATE INDEX idx_paradas_escola ON paradas_rota (escola_id)',
        ],
      })
      app.save(col)
    }

    // 5. Criar collection despachos (contrato_id, ciclo_id, rota_logistica_id, data_despacho, usuario_id, status)
    try {
      app.findCollectionByNameOrId('despachos')
    } catch (_) {
      const col = new Collection({
        name: 'despachos',
        type: 'base',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
        fields: [
          {
            name: 'contrato_id',
            type: 'relation',
            required: true,
            collectionId: contratosCol.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
          {
            name: 'ciclo_id',
            type: 'relation',
            required: false,
            collectionId: ciclosCol.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
          {
            name: 'rota_logistica_id',
            type: 'relation',
            required: true,
            collectionId: rotasLogCol.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
          {
            name: 'data_despacho',
            type: 'date',
            required: true,
          },
          {
            name: 'usuario_id',
            type: 'relation',
            required: false,
            collectionId: usersCol.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['Em Rota', 'Entregue', 'Cancelado'],
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_despachos_rota ON despachos (rota_logistica_id)',
          'CREATE INDEX idx_despachos_contrato ON despachos (contrato_id)',
          'CREATE INDEX idx_despachos_ciclo ON despachos (ciclo_id)',
        ],
      })
      app.save(col)
    }
  },
  (app) => {
    // Revert migrations in reverse order
    try {
      const despachos = app.findCollectionByNameOrId('despachos')
      app.delete(despachos)
    } catch (_) {}

    try {
      const paradas = app.findCollectionByNameOrId('paradas_rota')
      app.delete(paradas)
    } catch (_) {}

    try {
      const pedidosCol = app.findCollectionByNameOrId('pedidos')
      const f1 = pedidosCol.fields.getByName('rota_logistica_id')
      if (f1) pedidosCol.fields.removeById(f1.id)
      const f2 = pedidosCol.fields.getByName('motivo_cancelamento')
      if (f2) pedidosCol.fields.removeById(f2.id)
      const f3 = pedidosCol.fields.getByName('cancelado_em')
      if (f3) pedidosCol.fields.removeById(f3.id)
      app.save(pedidosCol)
    } catch (_) {}

    try {
      const rotasLog = app.findCollectionByNameOrId('rotas_logisticas')
      app.delete(rotasLog)
    } catch (_) {}

    try {
      const contratosCol = app.findCollectionByNameOrId('contratos')
      const f = contratosCol.fields.getByName('num_rotas_logisticas')
      if (f) contratosCol.fields.removeById(f.id)
      app.save(contratosCol)
    } catch (_) {}
  },
)
