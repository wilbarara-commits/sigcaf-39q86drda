migrate(
  (app) => {
    const rotasCol = app.findCollectionByNameOrId('rotas')

    // Adiciona campo 'caminhao_escola_id' (relation opcional para escolas)
    // Permite que a posição manual persista mesmo se a rota for reordenada
    if (!rotasCol.fields.getByName('caminhao_escola_id')) {
      const escolasCol = app.findCollectionByNameOrId('escolas')
      rotasCol.fields.add(
        new RelationField({
          name: 'caminhao_escola_id',
          type: 'relation',
          collectionId: escolasCol.id,
          required: false,
          maxSelect: 1,
        }),
      )
    }

    // Adiciona também 'caminhao_posicao_atual' (número opcional da parada 1..N) para tolerância/conveniência
    if (!rotasCol.fields.getByName('caminhao_posicao_atual')) {
      rotasCol.fields.add(
        new NumberField({
          name: 'caminhao_posicao_atual',
          type: 'number',
          required: false,
          min: 1,
          onlyInt: true,
        }),
      )
    }

    app.save(rotasCol)
  },
  (app) => {
    try {
      const rotasCol = app.findCollectionByNameOrId('rotas')
      rotasCol.fields.removeByName('caminhao_escola_id')
      rotasCol.fields.removeByName('caminhao_posicao_atual')
      app.save(rotasCol)
    } catch (_) {}
  },
)
