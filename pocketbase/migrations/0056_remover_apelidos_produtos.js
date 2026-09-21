// Migration para remover o campo `apelidos` da coleção `produtos`.
// Nova regra de negócio: apelidos passam a existir APENAS nos itens de contrato (contrato_itens.apelidos).
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('produtos')
    if (collection.fields.getByName('apelidos')) {
      collection.fields.removeByName('apelidos')
      app.save(collection)
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('produtos')
    if (!collection.fields.getByName('apelidos')) {
      collection.fields.addAt(
        collection.fields.length,
        new Field({
          name: 'apelidos',
          type: 'text',
          required: false,
        }),
      )
      app.save(collection)
    }
  },
)
