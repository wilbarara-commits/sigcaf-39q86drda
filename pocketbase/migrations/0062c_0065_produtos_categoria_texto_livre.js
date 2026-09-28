migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')

    // Na versão PocketBase v0.36, alterar a propriedade .type de um SelectField existente
    // para 'text' não converte a classe de campo subjacente.
    // É necessário remover o campo antigo e adicionar um novo TextField com o mesmo nome.
    // O SQLite preserva os dados da coluna 'categoria' da tabela produtos intactos.
    const categoriaField = col.fields.getByName('categoria')
    if (categoriaField) {
      col.fields.removeById(categoriaField.id)
    }

    col.fields.add(
      new TextField({
        name: 'categoria',
        required: false,
      }),
    )

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('produtos')
    const categoriaField = col.fields.getByName('categoria')
    if (categoriaField) {
      col.fields.removeById(categoriaField.id)
    }
    col.fields.add(
      new SelectField({
        name: 'categoria',
        required: false,
        values: [
          'Hortaliças',
          'Frutas',
          'Grãos',
          'Legumes',
          'Folhosas',
          'Ovos',
          'Tubérculos',
          'Outros',
        ],
        maxSelect: 1,
      }),
    )
    app.save(col)
  },
)
