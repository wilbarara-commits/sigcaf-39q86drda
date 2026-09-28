migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ciclos')
    const statusField = col.fields.getByName('status')
    if (statusField) {
      statusField.values = ['coletando', 'correcao', 'fechado', 'cancelado']
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('ciclos')
    const statusField = col.fields.getByName('status')
    if (statusField) {
      statusField.values = ['coletando', 'correcao', 'fechado']
      app.save(col)
    }
  },
)
