migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')

    if (!col.fields.getByName('email')) {
      col.fields.add(
        new EmailField({
          name: 'email',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('tipo')) {
      col.fields.add(
        new SelectField({
          name: 'tipo',
          required: false,
          maxSelect: 1,
          values: ['Municipal', 'Estadual', 'Creche / CMEI', 'Filantrópica / Conveniada', 'Outro'],
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')
    col.fields.removeByName('email')
    col.fields.removeByName('tipo')
    app.save(col)
  },
)
