migrate(
  (app) => {
    const contratosCol = app.findCollectionByNameOrId('contratos')

    // 1. Adicionar campo tipo_importacao (SelectField: 'unica', 'fracionada')
    if (!contratosCol.fields.getByName('tipo_importacao')) {
      contratosCol.fields.add(
        new SelectField({
          name: 'tipo_importacao',
          required: false,
          values: ['unica', 'fracionada'],
          maxSelect: 1,
        }),
      )
    }

    // 2. Adicionar campo abas_planilha (TextField: nomes separados por ponto e vírgula)
    if (!contratosCol.fields.getByName('abas_planilha')) {
      contratosCol.fields.add(
        new TextField({
          name: 'abas_planilha',
          required: false,
        }),
      )
    }

    app.save(contratosCol)
  },
  (app) => {
    const contratosCol = app.findCollectionByNameOrId('contratos')

    if (contratosCol.fields.getByName('tipo_importacao')) {
      contratosCol.fields.removeByName('tipo_importacao')
    }

    if (contratosCol.fields.getByName('abas_planilha')) {
      contratosCol.fields.removeByName('abas_planilha')
    }

    app.save(contratosCol)
  },
)
