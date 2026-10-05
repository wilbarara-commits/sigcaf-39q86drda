/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Atualizar o campo 'status' da collection 'ciclos' para incluir 'coleta_encerrada'
    const col = app.findCollectionByNameOrId('ciclos')
    const statusField = col.fields.getByName('status')
    if (statusField) {
      statusField.values = ['coletando', 'correcao', 'coleta_encerrada', 'fechado', 'cancelado']
      statusField.maxSelect = 1
      app.save(col)
      console.log(
        '[0127] Campo status da collection ciclos atualizado para incluir coleta_encerrada',
      )
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('ciclos')
    const statusField = col.fields.getByName('status')
    if (statusField) {
      statusField.values = ['coletando', 'correcao', 'fechado', 'cancelado']
      statusField.maxSelect = 1
      app.save(col)
    }
  },
)
