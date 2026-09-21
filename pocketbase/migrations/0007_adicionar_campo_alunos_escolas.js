migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')

    if (!col.fields.getByName('alunos')) {
      col.fields.add(
        new NumberField({
          name: 'alunos',
          required: false,
          onlyInt: true,
          min: 0,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('escolas')
    col.fields.removeByName('alunos')
    app.save(col)
  },
)
