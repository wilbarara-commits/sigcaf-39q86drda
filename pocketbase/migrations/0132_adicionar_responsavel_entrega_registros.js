migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('entrega_registros')
    if (!col.fields.getByName('responsavel_nome')) {
      col.fields.add(
        new TextField({
          name: 'responsavel_nome',
          required: false,
        }),
      )
    }
    if (!col.fields.getByName('responsavel_cpf')) {
      col.fields.add(
        new TextField({
          name: 'responsavel_cpf',
          required: false,
        }),
      )
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('entrega_registros')
    const nomeField = col.fields.getByName('responsavel_nome')
    if (nomeField) {
      col.fields.remove(nomeField)
    }
    const cpfField = col.fields.getByName('responsavel_cpf')
    if (cpfField) {
      col.fields.remove(cpfField)
    }
    app.save(col)
  },
)
