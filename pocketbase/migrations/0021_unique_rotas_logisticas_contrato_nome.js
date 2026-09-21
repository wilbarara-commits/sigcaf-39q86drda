migrate(
  (app) => {
    // 1. Deduplicar caso exista qualquer registro duplicado na collection rotas_logisticas
    // (Apenas por precaução extrema, embora a collection esteja limpa)
    try {
      app
        .db()
        .newQuery(`
        DELETE FROM rotas_logisticas
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM rotas_logisticas
          GROUP BY contrato_id, LOWER(TRIM(nome))
        )
      `)
        .execute()
    } catch (err) {
      console.log('Aviso ao deduplicar rotas_logisticas:', err)
    }

    // 2. Adicionar índice único na collection rotas_logisticas
    const rotasLogCol = app.findCollectionByNameOrId('rotas_logisticas')
    rotasLogCol.addIndex('idx_rotas_log_contrato_nome_unique', true, 'contrato_id, nome', '')
    app.save(rotasLogCol)
  },
  (app) => {
    try {
      const rotasLogCol = app.findCollectionByNameOrId('rotas_logisticas')
      rotasLogCol.removeIndex('idx_rotas_log_contrato_nome_unique')
      app.save(rotasLogCol)
    } catch (_) {}
  },
)
