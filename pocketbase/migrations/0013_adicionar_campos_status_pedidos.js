migrate(
  (app) => {
    const pedidosCol = app.findCollectionByNameOrId('pedidos')

    // 1. Campo entregue_em (date)
    if (!pedidosCol.fields.getByName('entregue_em')) {
      pedidosCol.fields.add(
        new DateField({
          name: 'entregue_em',
          required: false,
        }),
      )
    }

    // 2. Campo entregue_por (relation -> users)
    if (!pedidosCol.fields.getByName('entregue_por')) {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      pedidosCol.fields.add(
        new RelationField({
          name: 'entregue_por',
          required: false,
          collectionId: usersCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }

    // 3. Campo cancelamento_motivo (text)
    if (!pedidosCol.fields.getByName('cancelamento_motivo')) {
      pedidosCol.fields.add(
        new TextField({
          name: 'cancelamento_motivo',
          required: false,
        }),
      )
    }

    app.save(pedidosCol)
  },
  (app) => {
    const pedidosCol = app.findCollectionByNameOrId('pedidos')
    const f1 = pedidosCol.fields.getByName('entregue_em')
    if (f1) pedidosCol.fields.removeById(f1.id)
    const f2 = pedidosCol.fields.getByName('entregue_por')
    if (f2) pedidosCol.fields.removeById(f2.id)
    const f3 = pedidosCol.fields.getByName('cancelamento_motivo')
    if (f3) pedidosCol.fields.removeById(f3.id)
    app.save(pedidosCol)
  },
)
