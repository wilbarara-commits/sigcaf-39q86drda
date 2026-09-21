migrate(
  (app) => {
    const escolasCol = app.findCollectionByNameOrId('escolas')

    // 1. Remover índice idx_escolas_rota se existir
    try {
      escolasCol.removeIndex('idx_escolas_rota')
    } catch (_) {}

    // 2. Remover campo rota da coleção escolas se existir
    const rotaField = escolasCol.fields.getByName('rota')
    if (rotaField) {
      escolasCol.fields.removeByName('rota')
    }

    // 3. Remover campos contrato e aba se porventura existissem na coleção escolas
    const contratoField = escolasCol.fields.getByName('contrato')
    if (contratoField) {
      escolasCol.fields.removeByName('contrato')
    }
    const abaField = escolasCol.fields.getByName('aba')
    if (abaField) {
      escolasCol.fields.removeByName('aba')
    }
    const rotaLogisticaField = escolasCol.fields.getByName('rota_logistica')
    if (rotaLogisticaField) {
      escolasCol.fields.removeByName('rota_logistica')
    }

    app.save(escolasCol)
  },
  (app) => {
    const escolasCol = app.findCollectionByNameOrId('escolas')

    if (!escolasCol.fields.getByName('rota')) {
      escolasCol.fields.add(
        new TextField({
          name: 'rota',
          required: false,
        }),
      )
    }

    try {
      escolasCol.addIndex('idx_escolas_rota', false, 'rota', '')
    } catch (_) {}

    app.save(escolasCol)
  },
)
