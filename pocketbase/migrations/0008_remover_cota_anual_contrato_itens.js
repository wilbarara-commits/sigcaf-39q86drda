migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('contrato_itens')

    if (col.fields.getByName('cota_anual')) {
      col.fields.removeByName('cota_anual')
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('contrato_itens')

    if (!col.fields.getByName('cota_anual')) {
      col.fields.add(
        new NumberField({
          name: 'cota_anual',
          required: false,
          onlyInt: false,
          min: 0,
        }),
      )
    }

    app.save(col)
  },
)
