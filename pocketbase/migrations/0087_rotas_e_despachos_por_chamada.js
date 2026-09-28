migrate(
  (app) => {
    const chamadasCol = app.findCollectionByNameOrId('chamadas')
    const rotasCol = app.findCollectionByNameOrId('rotas')
    const despachosCol = app.findCollectionByNameOrId('despachos')

    // 1. Tornar contrato_id em rotas opcional (required: false) para permitir rotas vinculadas diretamente à chamada
    const rotasContratoField = rotasCol.fields.getByName('contrato_id')
    if (rotasContratoField) {
      rotasContratoField.required = false
    }

    // 2. Adicionar o campo relation 'chamada_id' em 'rotas' apontando para 'chamadas'
    if (!rotasCol.fields.getByName('chamada_id')) {
      rotasCol.fields.add(
        new RelationField({
          name: 'chamada_id',
          type: 'relation',
          collectionId: chamadasCol.id,
          required: false,
          maxSelect: 1,
        }),
      )
    }
    app.save(rotasCol)

    // 3. Atualizar índices de rotas
    try {
      const rotasColFresh = app.findCollectionByNameOrId('rotas')
      rotasColFresh.addIndex('idx_rotas_chamada', false, 'chamada_id', '')
      app.save(rotasColFresh)
    } catch (err) {
      console.log('[0087] Aviso ao criar índice idx_rotas_chamada:', err)
    }

    // 4. Preencher chamada_id para todas as rotas existentes a partir do contrato_id
    const rotasExistentes = app.findRecordsByFilter('rotas', '', 'created', 1000, 0)
    for (const rota of rotasExistentes) {
      const currentChamadaId = rota.getString('chamada_id')
      if (!currentChamadaId) {
        const contratoId = rota.getString('contrato_id')
        if (contratoId) {
          try {
            const contratoRec = app.findRecordById('contratos', contratoId)
            const cChamadaId = contratoRec.getString('chamada_id')
            if (cChamadaId) {
              rota.set('chamada_id', cChamadaId)
              app.save(rota)
            }
          } catch (e) {
            console.log(`[0087] Contrato ${contratoId} não encontrado para rota ${rota.id}:`, e)
          }
        }
      }
    }

    // 5. Adicionar chamada_id e tornar contrato_id opcional em 'despachos'
    const despachosContratoField = despachosCol.fields.getByName('contrato_id')
    if (despachosContratoField) {
      despachosContratoField.required = false
    }

    if (!despachosCol.fields.getByName('chamada_id')) {
      despachosCol.fields.add(
        new RelationField({
          name: 'chamada_id',
          type: 'relation',
          collectionId: chamadasCol.id,
          required: false,
          maxSelect: 1,
        }),
      )
    }
    app.save(despachosCol)

    // 6. Atualizar índices de despachos
    try {
      const despachosColFresh = app.findCollectionByNameOrId('despachos')
      despachosColFresh.addIndex('idx_despachos_chamada', false, 'chamada_id', '')
      app.save(despachosColFresh)
    } catch (err) {
      console.log('[0087] Aviso ao criar índice idx_despachos_chamada:', err)
    }

    // 7. Preencher chamada_id para todos os despachos existentes
    const despachosExistentes = app.findRecordsByFilter('despachos', '', 'created', 1000, 0)
    for (const desp of despachosExistentes) {
      const currentChamadaId = desp.getString('chamada_id')
      if (!currentChamadaId) {
        const contratoId = desp.getString('contrato_id')
        if (contratoId) {
          try {
            const contratoRec = app.findRecordById('contratos', contratoId)
            const cChamadaId = contratoRec.getString('chamada_id')
            if (cChamadaId) {
              desp.set('chamada_id', cChamadaId)
              app.save(desp)
            }
          } catch (e) {
            console.log(`[0087] Contrato ${contratoId} não encontrado para despacho ${desp.id}:`, e)
          }
        }
      }
    }
  },
  (app) => {
    try {
      const despachosCol = app.findCollectionByNameOrId('despachos')
      despachosCol.removeIndex('idx_despachos_chamada')
      despachosCol.fields.removeByName('chamada_id')
      app.save(despachosCol)
    } catch (_) {}

    try {
      const rotasCol = app.findCollectionByNameOrId('rotas')
      rotasCol.removeIndex('idx_rotas_chamada')
      rotasCol.fields.removeByName('chamada_id')
      app.save(rotasCol)
    } catch (_) {}
  },
)
