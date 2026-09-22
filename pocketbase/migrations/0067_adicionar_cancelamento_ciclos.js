migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ciclos')

    // Adicionar motivo_cancelamento (text, opcional)
    if (!col.fields.getByName('motivo_cancelamento')) {
      col.fields.add(
        new TextField({
          name: 'motivo_cancelamento',
          required: false,
        }),
      )
    }

    // Adicionar data_cancelamento (date, opcional)
    if (!col.fields.getByName('data_cancelamento')) {
      col.fields.add(
        new DateField({
          name: 'data_cancelamento',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('ciclos')
    const motivoField = col.fields.getByName('motivo_cancelamento')
    if (motivoField) {
      col.fields.remove(motivoField)
    }
    const dataField = col.fields.getByName('data_cancelamento')
    if (dataField) {
      col.fields.remove(dataField)
    }
    app.save(col)
  },
)
