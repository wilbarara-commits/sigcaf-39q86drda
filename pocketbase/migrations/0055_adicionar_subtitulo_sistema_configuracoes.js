migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('configuracoes')
    if (!col.fields.getByName('subtitulo_sistema')) {
      col.fields.add(
        new TextField({
          name: 'subtitulo_sistema',
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('configuracoes')
    const field = col.fields.getByName('subtitulo_sistema')
    if (field) {
      col.fields.remove(field)
      app.save(col)
    }
  },
)
