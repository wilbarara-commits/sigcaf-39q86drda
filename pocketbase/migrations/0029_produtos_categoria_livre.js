migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    const categoriaField = col.fields.getByName('categoria')

    if (categoriaField) {
      if (typeof categoriaField.values !== 'undefined') {
        // Expandir opções prévias do select caso o schema seja inspecionado como select
        categoriaField.values = [
          'Hortaliças',
          'Frutas',
          'Grãos',
          'Legumes',
          'Folhosas',
          'Ovos',
          'Tubérculos',
          'Outros',
        ]
      }
      // Transformar o campo categoria em texto livre para aceitar qualquer categoria definida pelo usuário
      categoriaField.type = 'text'
      categoriaField.required = false
    } else {
      col.fields.add(
        new TextField({
          name: 'categoria',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    const categoriaField = col.fields.getByName('categoria')
    if (categoriaField) {
      categoriaField.type = 'select'
      categoriaField.required = true
      categoriaField.values = ['Hortaliças', 'Frutas', 'Grãos', 'Legumes', 'Outros']
      categoriaField.maxSelect = 1
      app.save(col)
    }
  },
)
