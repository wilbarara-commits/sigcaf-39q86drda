migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')

    if (!col.fields.getByName('cep')) {
      col.fields.add(
        new TextField({
          name: 'cep',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('latitude')) {
      col.fields.add(
        new TextField({
          name: 'latitude',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('longitude')) {
      col.fields.add(
        new TextField({
          name: 'longitude',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')
    if (col.fields.getByName('cep')) {
      col.fields.removeByName('cep')
    }
    if (col.fields.getByName('latitude')) {
      col.fields.removeByName('latitude')
    }
    if (col.fields.getByName('longitude')) {
      col.fields.removeByName('longitude')
    }
    app.save(col)
  },
)
