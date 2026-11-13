/**
 * 0148 — Cadastro de fornecedores por produto + distribuição de compra.
 *
 * Cria:
 * - fornecedores_produto: vínculo fornecedor ↔ produto (busca e exclusão no
 *   cartão "Comprar" da Consolidação para Compras).
 * - compra_distribuicao: linha gravada por fornecedor participante na
 *   distribuição da compra de um produto em um ciclo (cartão "Comprar" da
 *   /consolidacao-simples), com índice único ciclo+fornecedor+produto.
 *
 * Idempotente: só cria quando a coleção ainda não existe.
 */

migrate(
  (app) => {
    // --- fornecedores_produto -------------------------------------------------
    let col
    try {
      col = app.findCollectionByNameOrId('fornecedores_produto')
    } catch (_) {
      col = new Collection({
        name: 'fornecedores_produto',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
        fields: [
          {
            name: 'fornecedor_id',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('fornecedores').id,
            cascadeDelete: true,
          },
          {
            name: 'produto_id',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('produtos').id,
            cascadeDelete: true,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_fornecedores_produto_unico ON fornecedores_produto (fornecedor_id, produto_id)',
          'CREATE INDEX idx_fornecedores_produto_produto ON fornecedores_produto (produto_id)',
        ],
      })
      app.save(col)
    }

    // --- compra_distribuicao --------------------------------------------------
    let dist
    try {
      dist = app.findCollectionByNameOrId('compra_distribuicao')
    } catch (_) {
      dist = new Collection({
        name: 'compra_distribuicao',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
        fields: [
          {
            name: 'ciclo_id',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('ciclos').id,
            cascadeDelete: true,
          },
          { name: 'data_entrega', type: 'date', required: false },
          {
            name: 'fornecedor_id',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('fornecedores').id,
            cascadeDelete: true,
          },
          {
            name: 'produto_id',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('produtos').id,
            cascadeDelete: true,
          },
          { name: 'quantidade', type: 'number', required: true },
          { name: 'unidade', type: 'text', required: false },
          {
            name: 'modo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['igual', 'percentual'],
          },
          { name: 'percentual', type: 'number', required: false },
          {
            name: 'criado_por',
            type: 'relation',
            required: false,
            maxSelect: 1,
            collectionId: '_pb_users_auth_',
            onDelete: 'SetNull',
          },
          {
            name: 'chamada_id',
            type: 'relation',
            required: false,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('chamadas').id,
            cascadeDelete: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_compra_distribuicao_unico ON compra_distribuicao (ciclo_id, fornecedor_id, produto_id)',
          'CREATE INDEX idx_compra_distribuicao_ciclo ON compra_distribuicao (ciclo_id)',
          'CREATE INDEX idx_compra_distribuicao_produto ON compra_distribuicao (produto_id)',
          'CREATE INDEX idx_compra_distribuicao_fornecedor ON compra_distribuicao (fornecedor_id)',
        ],
      })
      app.save(dist)
    }
  },
  (app) => {
    for (const name of ['compra_distribuicao', 'fornecedores_produto']) {
      try {
        const c = app.findCollectionByNameOrId(name)
        app.delete(c)
      } catch (_) {}
    }
  },
)
