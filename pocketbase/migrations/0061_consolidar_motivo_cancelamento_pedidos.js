migrate(
  (app) => {
    // 1. Resincronizar dados por segurança: se motivo_cancelamento estiver vazio e cancelamento_motivo não, copiar
    app
      .db()
      .newQuery(
        `UPDATE pedidos 
         SET motivo_cancelamento = cancelamento_motivo 
         WHERE (motivo_cancelamento IS NULL OR motivo_cancelamento = '') 
           AND (cancelamento_motivo IS NOT NULL AND cancelamento_motivo != '')`,
      )
      .execute()

    // 2. Remover o campo cancelamento_motivo da collection pedidos
    const pedidosCol = app.findCollectionByNameOrId('pedidos')
    if (pedidosCol.fields.getByName('cancelamento_motivo')) {
      pedidosCol.fields.removeByName('cancelamento_motivo')
      app.save(pedidosCol)
    }
  },
  (app) => {
    const pedidosCol = app.findCollectionByNameOrId('pedidos')
    if (!pedidosCol.fields.getByName('cancelamento_motivo')) {
      pedidosCol.fields.add(
        new TextField({
          name: 'cancelamento_motivo',
          required: false,
        }),
      )
      app.save(pedidosCol)

      // Se reverter, espelhar o valor de motivo_cancelamento de volta para cancelamento_motivo
      app
        .db()
        .newQuery(
          `UPDATE pedidos 
           SET cancelamento_motivo = motivo_cancelamento 
           WHERE motivo_cancelamento IS NOT NULL AND motivo_cancelamento != ''`,
        )
        .execute()
    }
  },
)
