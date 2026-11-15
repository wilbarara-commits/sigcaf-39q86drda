migrate(
  (app) => {
    // Coleção compra_config: configuração de COMPRA por ciclo (+ produto opcional).
    // Uso atual: percentual_maximo editável no cartão "Comprar" da
    // /consolidacao-simples (padrão 125 quando não houver registro salvo).
    const usersId = '_pb_users_auth_'
    const ciclosId = app.findCollectionByNameOrId('ciclos').id
    const produtosId = app.findCollectionByNameOrId('produtos').id

    const collection = new Collection({
      name: 'compra_config',
      type: 'base',
      // Consulta liberada (mesmo padrão de compra_distribuicao/fornecedores_produto);
      // escrita apenas para usuários autenticados.
      listRule: '',
      viewRule: '',
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'ciclo_id',
          type: 'relation',
          required: true,
          collectionId: ciclosId,
          maxSelect: 1,
        },
        // Opcional: configuração específica de um produto do ciclo. Sem produto_id =
        // configuração geral do ciclo (fallback quando não há registro do produto).
        {
          name: 'produto_id',
          type: 'relation',
          required: false,
          collectionId: produtosId,
          maxSelect: 1,
        },
        // Percentual máximo da distribuição (ex.: 125 = até 125% do total pedido).
        {
          name: 'percentual_maximo',
          type: 'number',
          required: false,
          onlyInt: false,
          min: 1,
          max: 10000,
        },
        {
          name: 'criado_por',
          type: 'relation',
          required: false,
          collectionId: usersId,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        // Um registro de produto por ciclo; um registro geral (produto vazio) por ciclo.
        'CREATE UNIQUE INDEX idx_compra_config_ciclo_produto ON compra_config (ciclo_id, produto_id)',
        'CREATE INDEX idx_compra_config_ciclo ON compra_config (ciclo_id)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('compra_config')
    app.delete(collection)
  },
)
