migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('contrato_itens')

    if (!collection.fields.getByName('nome_contrato')) {
      collection.fields.add(
        new TextField({
          name: 'nome_contrato',
          required: false,
        }),
      )
    }

    if (!collection.fields.getByName('apelidos')) {
      collection.fields.add(
        new TextField({
          name: 'apelidos',
          required: false,
        }),
      )
    }

    app.save(collection)

    // Backfill: itens existentes recebem nome_contrato = nome do produto mestre
    app
      .db()
      .newQuery(`
      UPDATE contrato_itens
      SET nome_contrato = (
        SELECT produtos.nome FROM produtos WHERE produtos.id = contrato_itens.produto_id
      )
      WHERE (nome_contrato IS NULL OR nome_contrato = '')
        AND produto_id IS NOT NULL AND produto_id != ''
    `)
      .execute()
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('contrato_itens')
      let changed = false

      if (collection.fields.getByName('nome_contrato')) {
        collection.fields.removeByName('nome_contrato')
        changed = true
      }
      if (collection.fields.getByName('apelidos')) {
        collection.fields.removeByName('apelidos')
        changed = true
      }

      if (changed) {
        app.save(collection)
      }
    } catch (_) {}
  },
)
