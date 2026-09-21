migrate(
  (app) => {
    const produtosCol = app.findCollectionByNameOrId('produtos')
    const essencialField = produtosCol.fields.getByName('essencial')
    if (essencialField) {
      produtosCol.fields.removeByName('essencial')
      app.save(produtosCol)
    }
  },
  (app) => {
    const produtosCol = app.findCollectionByNameOrId('produtos')
    if (!produtosCol.fields.getByName('essencial')) {
      produtosCol.fields.add(
        new BoolField({
          name: 'essencial',
          required: false,
        }),
      )
      app.save(produtosCol)
    }
  },
)
