migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')
    const tipoField = col.fields.getByName('tipo')

    if (tipoField) {
      tipoField.values = ['CMEI', 'CRECHE', 'INTEGRAL', 'FUNDAMENTAL', 'Médio', 'Técnico']
      tipoField.required = false
      tipoField.maxSelect = 1
    } else {
      col.fields.add(
        new SelectField({
          name: 'tipo',
          required: false,
          maxSelect: 1,
          values: ['CMEI', 'CRECHE', 'INTEGRAL', 'FUNDAMENTAL', 'Médio', 'Técnico'],
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')
    const tipoField = col.fields.getByName('tipo')

    if (tipoField) {
      tipoField.values = ['CMEI', 'CRECHE', 'INTEGRAL', 'FUNDAMENTAL']
      col.save()
    }
  },
)
