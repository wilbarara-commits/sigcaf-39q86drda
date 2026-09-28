migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('contrato_itens')

    if (!col.fields.getByName('quantidade_contratada')) {
      col.fields.add(
        new NumberField({
          name: 'quantidade_contratada',
          required: false,
          onlyInt: false,
          min: 0,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('contrato_itens')

    if (col.fields.getByName('quantidade_contratada')) {
      col.fields.removeByName('quantidade_contratada')
    }

    app.save(col)
  },
)
