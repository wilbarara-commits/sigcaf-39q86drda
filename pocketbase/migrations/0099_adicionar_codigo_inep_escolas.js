migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')

    if (!col.fields.getByName('codigo_inep')) {
      col.fields.add(
        new TextField({
          name: 'codigo_inep',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')
    if (col.fields.getByName('codigo_inep')) {
      col.fields.removeByName('codigo_inep')
    }
    app.save(col)
  },
)
