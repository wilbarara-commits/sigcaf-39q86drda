migrate(
  (app) => {
    // 1. produtos (nome, categoria, unidade, estoque, preco_unitario)
    const produtos = new Collection({
      name: 'produtos',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        { name: 'nome', type: 'text', required: true },
        {
          name: 'categoria',
          type: 'select',
          required: true,
          values: ['Hortaliças', 'Frutas', 'Grãos', 'Legumes', 'Outros'],
          maxSelect: 1,
        },
        { name: 'unidade', type: 'text', required: true },
        { name: 'estoque', type: 'number', min: 0 },
        { name: 'preco_unitario', type: 'number', min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_produtos_nome ON produtos (nome)'],
    })
    app.save(produtos)

    // 2. escolas (nome, endereco, telefone, rota)
    const escolas = new Collection({
      name: 'escolas',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'endereco', type: 'text' },
        { name: 'telefone', type: 'text' },
        { name: 'rota', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_escolas_nome ON escolas (nome)',
        'CREATE INDEX idx_escolas_rota ON escolas (rota)',
      ],
    })
    app.save(escolas)

    // 3. contratos (numero, tipo, instituicao_id, valor_total, status)
    const escolasCol = app.findCollectionByNameOrId('escolas')
    const contratos = new Collection({
      name: 'contratos',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        { name: 'numero', type: 'text', required: true },
        { name: 'tipo', type: 'text' }, // ex: PNAE, PAA
        {
          name: 'instituicao_id',
          type: 'relation',
          required: true,
          collectionId: escolasCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'valor_total', type: 'number', min: 0 },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Ativo', 'Encerrado', 'Pendente'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_contratos_instituicao ON contratos (instituicao_id)'],
    })
    app.save(contratos)

    // 4. contrato_itens (contrato_id, produto_id, preco)
    const contratosCol = app.findCollectionByNameOrId('contratos')
    const produtosCol = app.findCollectionByNameOrId('produtos')
    const contratoItens = new Collection({
      name: 'contrato_itens',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        {
          name: 'contrato_id',
          type: 'relation',
          required: true,
          collectionId: contratosCol.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'produto_id',
          type: 'relation',
          required: true,
          collectionId: produtosCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'preco', type: 'number', min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_contrato_itens_contrato ON contrato_itens (contrato_id)'],
    })
    app.save(contratoItens)

    // 5. pedidos (numero, escola_id, data_prevista, status)
    const pedidos = new Collection({
      name: 'pedidos',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        { name: 'numero', type: 'text', required: true },
        {
          name: 'escola_id',
          type: 'relation',
          required: true,
          collectionId: escolasCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'data_prevista', type: 'date' },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Pendente', 'Em Rota', 'Entregue', 'Cancelado'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pedidos_escola ON pedidos (escola_id)',
        'CREATE INDEX idx_pedidos_status ON pedidos (status)',
      ],
    })
    app.save(pedidos)

    // 6. pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
    const pedidosCol = app.findCollectionByNameOrId('pedidos')
    const pedidoItens = new Collection({
      name: 'pedido_itens',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        {
          name: 'pedido_id',
          type: 'relation',
          required: true,
          collectionId: pedidosCol.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'produto_id',
          type: 'relation',
          required: true,
          collectionId: produtosCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'quantidade', type: 'number', min: 0 },
        { name: 'preco_unitario', type: 'number', min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_pedido_itens_pedido ON pedido_itens (pedido_id)'],
    })
    app.save(pedidoItens)

    // 7. atestos (numero, pedido_id, data_emissao, status, assinatura_file)
    const atestos = new Collection({
      name: 'atestos',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        { name: 'numero', type: 'text', required: true },
        {
          name: 'pedido_id',
          type: 'relation',
          required: true,
          collectionId: pedidosCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'data_emissao', type: 'date' },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Pendente Assinatura', 'Confirmado', 'Arquivado'],
          maxSelect: 1,
        },
        {
          name: 'assinatura_file',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_atestos_pedido ON atestos (pedido_id)',
        'CREATE INDEX idx_atestos_status ON atestos (status)',
      ],
    })
    app.save(atestos)
  },
  (app) => {
    const toDelete = [
      'atestos',
      'pedido_itens',
      'pedidos',
      'contrato_itens',
      'contratos',
      'escolas',
      'produtos',
    ]
    for (const name of toDelete) {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    }
  },
)
