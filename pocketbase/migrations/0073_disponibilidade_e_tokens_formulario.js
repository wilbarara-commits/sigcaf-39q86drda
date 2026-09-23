migrate(
  (app) => {
    // 1. Atualizar disponibilidade da collection produtos (normal, abundante, escassez, indisponivel)
    const produtosCol = app.findCollectionByNameOrId('produtos')
    const dispField = produtosCol.fields.getByName('disponibilidade')
    if (dispField) {
      dispField.values = ['normal', 'abundante', 'escassez', 'indisponivel']
      dispField.maxSelect = 1
    } else {
      produtosCol.fields.add(
        new SelectField({
          name: 'disponibilidade',
          required: false,
          values: ['normal', 'abundante', 'escassez', 'indisponivel'],
          maxSelect: 1,
        }),
      )
    }
    app.save(produtosCol)

    // Preencher produtos sem disponibilidade como 'normal'
    app
      .db()
      .newQuery(
        "UPDATE produtos SET disponibilidade = 'normal' WHERE disponibilidade IS NULL OR disponibilidade = ''",
      )
      .execute()

    // 2. Atualizar campo origem da collection pedidos para incluir 'formulario'
    const pedidosCol = app.findCollectionByNameOrId('pedidos')
    const origemField = pedidosCol.fields.getByName('origem')
    if (origemField) {
      origemField.values = ['excel', 'whatsapp', 'manual', 'formulario']
      origemField.maxSelect = 1
      app.save(pedidosCol)
    }

    // 3. Criar collection tokens_formulario
    // id, escola_id → escolas, contrato_id → contratos, ciclo_id → ciclos, token [string único], ativo [bool], criado_em, expira_em
    const escolasColId = app.findCollectionByNameOrId('escolas').id
    const contratosColId = app.findCollectionByNameOrId('contratos').id
    const ciclosColId = app.findCollectionByNameOrId('ciclos').id

    let tokensCol
    try {
      tokensCol = app.findCollectionByNameOrId('tokens_formulario')
    } catch (_) {
      tokensCol = new Collection({
        name: 'tokens_formulario',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          {
            name: 'escola_id',
            type: 'relation',
            required: true,
            collectionId: escolasColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'contrato_id',
            type: 'relation',
            required: true,
            collectionId: contratosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'ciclo_id',
            type: 'relation',
            required: true,
            collectionId: ciclosColId,
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
            name: 'criado_em',
            type: 'date',
            required: false,
          },
          {
            name: 'expira_em',
            type: 'date',
            required: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_tokens_form_token ON tokens_formulario (token)',
          'CREATE INDEX idx_tokens_form_escola_ciclo ON tokens_formulario (escola_id, ciclo_id)',
          'CREATE INDEX idx_tokens_form_ciclo ON tokens_formulario (ciclo_id)',
        ],
      })
      app.save(tokensCol)
    }
  },
  (app) => {
    try {
      const tokensCol = app.findCollectionByNameOrId('tokens_formulario')
      app.delete(tokensCol)
    } catch (_) {}

    try {
      const produtosCol = app.findCollectionByNameOrId('produtos')
      const dispField = produtosCol.fields.getByName('disponibilidade')
      if (dispField) {
        dispField.values = ['normal', 'escassez', 'abundancia']
        app.save(produtosCol)
      }
    } catch (_) {}

    try {
      const pedidosCol = app.findCollectionByNameOrId('pedidos')
      const origemField = pedidosCol.fields.getByName('origem')
      if (origemField) {
        origemField.values = ['excel', 'whatsapp', 'manual']
        app.save(pedidosCol)
      }
    } catch (_) {}
  },
)
