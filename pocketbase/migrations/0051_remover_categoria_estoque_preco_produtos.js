migrate(
  (app) => {
    const produtosCol = app.findCollectionByNameOrId('produtos')

    const categoriaField = produtosCol.fields.getByName('categoria')
    if (categoriaField) {
      produtosCol.fields.removeByName('categoria')
    }

    const estoqueField = produtosCol.fields.getByName('estoque')
    if (estoqueField) {
      produtosCol.fields.removeByName('estoque')
    }

    const precoField = produtosCol.fields.getByName('preco_unitario')
    if (precoField) {
      produtosCol.fields.removeByName('preco_unitario')
    }

    app.save(produtosCol)
  },
  (app) => {
    const produtosCol = app.findCollectionByNameOrId('produtos')

    if (!produtosCol.fields.getByName('categoria')) {
      produtosCol.fields.add(
        new TextField({
          name: 'categoria',
          required: false,
        }),
      )
    }

    if (!produtosCol.fields.getByName('estoque')) {
      produtosCol.fields.add(
        new NumberField({
          name: 'estoque',
          min: 0,
        }),
      )
    }

    if (!produtosCol.fields.getByName('preco_unitario')) {
      produtosCol.fields.add(
        new NumberField({
          name: 'preco_unitario',
          min: 0,
        }),
      )
    }

    app.save(produtosCol)
  },
)
