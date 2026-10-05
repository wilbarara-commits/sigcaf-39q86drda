migrate(
  (app) => {
    // 0130: Garantir regras de API públicas na collection paradas_rota para acesso no Portal do Motorista
    try {
      const col = app.findCollectionByNameOrId('paradas_rota')
      col.listRule = ''
      col.viewRule = ''
      app.save(col)
    } catch (err) {
      console.warn('Erro ao atualizar regras da collection paradas_rota:', err)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('paradas_rota')
      col.listRule = '@request.auth.id != ""'
      col.viewRule = '@request.auth.id != ""'
      app.save(col)
    } catch (_) {}
  },
)
