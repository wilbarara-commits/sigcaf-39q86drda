migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ciclos')
    const statusField = col.fields.getByName('status')
    if (statusField) {
      statusField.values = ['coletando', 'correcao', 'fechado', 'cancelado']
      statusField.maxSelect = 1
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('ciclos')
    const statusField = col.fields.getByName('status')
    if (statusField) {
      statusField.values = ['coletando', 'correcao', 'fechado']
      statusField.maxSelect = 1
      app.save(col)
    }
  },
)
