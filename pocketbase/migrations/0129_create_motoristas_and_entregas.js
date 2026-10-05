migrate(
  (app) => {
    // 1. Obter IDs das collections necessárias para relações
    const rotasColId = app.findCollectionByNameOrId('rotas').id
    const escolasColId = app.findCollectionByNameOrId('escolas').id
    let chamadasColId = ''
    try {
      chamadasColId = app.findCollectionByNameOrId('chamadas').id
    } catch (_) {}
    let ciclosColId = ''
    try {
      ciclosColId = app.findCollectionByNameOrId('ciclos').id
    } catch (_) {}

    // 2. Criar collection motoristas
    let motoristasCol
    try {
      motoristasCol = app.findCollectionByNameOrId('motoristas')
    } catch (_) {
      motoristasCol = new Collection({
        name: 'motoristas',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
        fields: [
          { name: 'nome', type: 'text', required: true },
          { name: 'telefone', type: 'text', required: false },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'observacoes', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_motoristas_ativo ON motoristas (ativo)',
          'CREATE INDEX idx_motoristas_nome ON motoristas (nome)',
        ],
      })
      app.save(motoristasCol)
    }

    const motoristasColId = app.findCollectionByNameOrId('motoristas').id

    // 3. Criar collection rota_despachos
    // rota, motorista, token, despachado_em, renovado_em, ativo (bool), ciclo_id, chamada_id
    let rotaDespachosCol
    try {
      rotaDespachosCol = app.findCollectionByNameOrId('rota_despachos')
    } catch (_) {
      const fields = [
        {
          name: 'rota_id',
          type: 'relation',
          required: true,
          collectionId: rotasColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'motorista_id',
          type: 'relation',
          required: false,
          collectionId: motoristasColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'token',
          type: 'text',
          required: true,
        },
        {
          name: 'ativo',
          type: 'bool',
          required: false,
        },
        {
          name: 'despachado_em',
          type: 'date',
          required: false,
        },
        {
          name: 'renovado_em',
          type: 'date',
          required: false,
        },
      ]

      if (ciclosColId) {
        fields.push({
          name: 'ciclo_id',
          type: 'relation',
          required: false,
          collectionId: ciclosColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (chamadasColId) {
        fields.push({
          name: 'chamada_id',
          type: 'relation',
          required: false,
          collectionId: chamadasColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      fields.push(
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      )

      rotaDespachosCol = new Collection({
        name: 'rota_despachos',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '@request.auth.id != ""',
        fields: fields,
        indexes: [],
      })
      app.save(rotaDespachosCol)
    }

    // 4. Criar collection entrega_registros
    // rota_id, escola_id, motorista_id, rota_despacho_id, chegada_em, confirmado_em, assinatura (editor/text com dataURL), observacao, status_sync
    let entregaRegistrosCol
    try {
      entregaRegistrosCol = app.findCollectionByNameOrId('entrega_registros')
    } catch (_) {
      const despachosColId = app.findCollectionByNameOrId('rota_despachos').id

      entregaRegistrosCol = new Collection({
        name: 'entrega_registros',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '@request.auth.id != ""',
        fields: [
          {
            name: 'rota_id',
            type: 'relation',
            required: true,
            collectionId: rotasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'escola_id',
            type: 'relation',
            required: true,
            collectionId: escolasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'motorista_id',
            type: 'relation',
            required: false,
            collectionId: motoristasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'despacho_id',
            type: 'relation',
            required: false,
            collectionId: despachosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'chegada_em',
            type: 'date',
            required: false,
          },
          {
            name: 'confirmado_em',
            type: 'date',
            required: false,
          },
          {
            name: 'assinatura',
            type: 'editor',
            required: false,
          },
          {
            name: 'observacao',
            type: 'text',
            required: false,
          },
          {
            name: 'status_sync',
            type: 'text',
            required: false,
          },
          {
            name: 'client_uid',
            type: 'text',
            required: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_entrega_reg_rota ON entrega_registros (rota_id)',
          'CREATE INDEX idx_entrega_reg_escola ON entrega_registros (escola_id)',
          'CREATE INDEX idx_entrega_reg_despacho ON entrega_registros (despacho_id)',
          'CREATE INDEX idx_entrega_reg_client_uid ON entrega_registros (client_uid)',
        ],
      })
      app.save(entregaRegistrosCol)
    }
  },
  (app) => {
    try {
      const entregaRegistrosCol = app.findCollectionByNameOrId('entrega_registros')
      app.delete(entregaRegistrosCol)
    } catch (_) {}
    try {
      const rotaDespachosCol = app.findCollectionByNameOrId('rota_despachos')
      app.delete(rotaDespachosCol)
    } catch (_) {}
    try {
      const motoristasCol = app.findCollectionByNameOrId('motoristas')
      app.delete(motoristasCol)
    } catch (_) {}
  },
)
