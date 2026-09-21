migrate(
  (app) => {
    const produtosCol = app.findCollectionByNameOrId('produtos')

    const dispField = produtosCol.fields.getByName('disponibilidade')
    if (dispField) {
      produtosCol.fields.removeByName('disponibilidade')
    }

    app.save(produtosCol)
  },
  (app) => {
    const produtosCol = app.findCollectionByNameOrId('produtos')

    if (!produtosCol.fields.getByName('disponibilidade')) {
      produtosCol.fields.add(
        new SelectField({
          name: 'disponibilidade',
          required: false,
          values: ['normal', 'escassez', 'abundancia'],
          maxSelect: 1,
        }),
      )
    }

    app.save(produtosCol)
  },
)
