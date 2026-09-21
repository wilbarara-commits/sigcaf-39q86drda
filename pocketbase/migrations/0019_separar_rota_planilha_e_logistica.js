migrate(
  (app) => {
    const contratoEscolasCol = app.findCollectionByNameOrId('contrato_escolas')
    const rotasLogCol = app.findCollectionByNameOrId('rotas_logisticas')

    // 1. Adicionar campo 'rota' (text) em contrato_escolas para a rota da planilha
    if (!contratoEscolasCol.fields.getByName('rota')) {
      contratoEscolasCol.fields.add(
        new TextField({
          name: 'rota',
          required: false,
        }),
      )
    }

    // 2. Adicionar campo 'rota_logistica_id' (relation → rotas_logisticas) em contrato_escolas
    if (!contratoEscolasCol.fields.getByName('rota_logistica_id')) {
      contratoEscolasCol.fields.add(
        new RelationField({
          name: 'rota_logistica_id',
          required: false,
          collectionId: rotasLogCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }

    app.save(contratoEscolasCol)

    // 3. Adicionar índice para rota_logistica_id
    contratoEscolasCol.addIndex('idx_contrato_escolas_rota_log', false, 'rota_logistica_id', '')
    app.save(contratoEscolasCol)

    // 4. Migrar dados existentes:
    // a) Se houver rota_id vinculado a uma rota na collection 'rotas', copiar o nome da rota para contrato_escolas.rota
    // b) Se não houver rota_id ou se o nome não for encontrado, tentar usar a rota cadastrada na escola
    // c) Se existir parada em paradas_rota para aquela escola, preencher rota_logistica_id a partir dela
    try {
      app
        .db()
        .newQuery(`
        UPDATE contrato_escolas
        SET rota = (
          SELECT COALESCE(
            (SELECT r.nome FROM rotas r WHERE r.id = contrato_escolas.rota_id),
            (SELECT e.rota FROM escolas e WHERE e.id = contrato_escolas.escola_id)
          )
        )
        WHERE (rota IS NULL OR rota = '')
      `)
        .execute()
    } catch (err) {
      console.log('Erro ao atualizar campo rota em contrato_escolas:', err)
    }

    try {
      app
        .db()
        .newQuery(`
        UPDATE contrato_escolas
        SET rota_logistica_id = (
          SELECT p.rota_logistica_id
          FROM paradas_rota p
          WHERE p.escola_id = contrato_escolas.escola_id
          LIMIT 1
        )
        WHERE (rota_logistica_id IS NULL OR rota_logistica_id = '')
      `)
        .execute()
    } catch (err) {
      console.log('Erro ao atualizar rota_logistica_id em contrato_escolas:', err)
    }
  },
  (app) => {
    try {
      const contratoEscolasCol = app.findCollectionByNameOrId('contrato_escolas')
      contratoEscolasCol.removeIndex('idx_contrato_escolas_rota_log')

      const f1 = contratoEscolasCol.fields.getByName('rota_logistica_id')
      if (f1) contratoEscolasCol.fields.removeById(f1.id)

      const f2 = contratoEscolasCol.fields.getByName('rota')
      if (f2) contratoEscolasCol.fields.removeById(f2.id)

      app.save(contratoEscolasCol)
    } catch (_) {}
  },
)
