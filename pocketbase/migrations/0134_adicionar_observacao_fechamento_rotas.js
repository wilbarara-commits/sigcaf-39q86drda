migrate(
  (app) => {
    // 1. Adicionar campo 'observacao' (text) na collection 'despachos'
    const despachosCol = app.findCollectionByNameOrId('despachos')
    if (!despachosCol.fields.getByName('observacao')) {
      despachosCol.fields.add(
        new TextField({
          name: 'observacao',
          required: false,
        }),
      )
      app.save(despachosCol)
    }

    // 2. Adicionar campo 'observacao_entrega' (text) na collection 'pedidos'
    const pedidosCol = app.findCollectionByNameOrId('pedidos')
    if (!pedidosCol.fields.getByName('observacao_entrega')) {
      pedidosCol.fields.add(
        new TextField({
          name: 'observacao_entrega',
          required: false,
        }),
      )
      app.save(pedidosCol)
    }

    // 3. Adicionar campo 'observacao' (text) na collection 'rota_despachos' caso não exista
    const rotaDespachosCol = app.findCollectionByNameOrId('rota_despachos')
    if (!rotaDespachosCol.fields.getByName('observacao')) {
      rotaDespachosCol.fields.add(
        new TextField({
          name: 'observacao',
          required: false,
        }),
      )
      app.save(rotaDespachosCol)
    }
  },
  (app) => {
    try {
      const despachosCol = app.findCollectionByNameOrId('despachos')
      if (despachosCol.fields.getByName('observacao')) {
        despachosCol.fields.removeByName('observacao')
        app.save(despachosCol)
      }
    } catch (_) {}

    try {
      const pedidosCol = app.findCollectionByNameOrId('pedidos')
      if (pedidosCol.fields.getByName('observacao_entrega')) {
        pedidosCol.fields.removeByName('observacao_entrega')
        app.save(pedidosCol)
      }
    } catch (_) {}

    try {
      const rotaDespachosCol = app.findCollectionByNameOrId('rota_despachos')
      if (rotaDespachosCol.fields.getByName('observacao')) {
        rotaDespachosCol.fields.removeByName('observacao')
        app.save(rotaDespachosCol)
      }
    } catch (_) {}
  },
)
