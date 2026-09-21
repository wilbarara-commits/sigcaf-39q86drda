migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')

    if (!col.fields.getByName('bairro')) {
      col.fields.add(
        new TextField({
          name: 'bairro',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('contato')) {
      col.fields.add(
        new TextField({
          name: 'contato',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')
    col.fields.removeByName('bairro')
    col.fields.removeByName('contato')
    app.save(col)
  },
)
