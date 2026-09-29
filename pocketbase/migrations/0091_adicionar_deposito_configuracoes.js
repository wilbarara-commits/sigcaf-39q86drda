migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('configuracoes')

    if (!col.fields.getByName('deposito_nome')) {
      col.fields.add(
        new TextField({
          name: 'deposito_nome',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('deposito_latitude')) {
      col.fields.add(
        new TextField({
          name: 'deposito_latitude',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('deposito_longitude')) {
      col.fields.add(
        new TextField({
          name: 'deposito_longitude',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('configuracoes')

    if (col.fields.getByName('deposito_nome')) {
      col.fields.removeByName('deposito_nome')
    }
    if (col.fields.getByName('deposito_latitude')) {
      col.fields.removeByName('deposito_latitude')
    }
    if (col.fields.getByName('deposito_longitude')) {
      col.fields.removeByName('deposito_longitude')
    }

    app.save(col)
  },
)
