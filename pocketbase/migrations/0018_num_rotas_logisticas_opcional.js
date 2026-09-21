migrate(
  (app) => {
    const contratosCol = app.findCollectionByNameOrId('contratos')
    const f = contratosCol.fields.getByName('num_rotas_logisticas')
    if (f) {
      f.required = false
      f.min = null
      app.save(contratosCol)
    }
  },
  (app) => {
    // Revert opcional
    try {
      const contratosCol = app.findCollectionByNameOrId('contratos')
      const f = contratosCol.fields.getByName('num_rotas_logisticas')
      if (f) {
        f.required = false
        app.save(contratosCol)
      }
    } catch (_) {}
  },
)
