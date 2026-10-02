/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Atualizar a coleção chamadas com os 3 campos de dia da semana do ciclo
    const chamadasCol = app.findCollectionByNameOrId('chamadas')
    if (chamadasCol) {
      const diasValores = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

      if (!chamadasCol.fields.getByName('dia_inicio_ciclo')) {
        chamadasCol.fields.add(
          new SelectField({
            name: 'dia_inicio_ciclo',
            required: false,
            maxSelect: 1,
            values: diasValores,
          }),
        )
      }

      if (!chamadasCol.fields.getByName('dia_despacho_ciclo')) {
        chamadasCol.fields.add(
          new SelectField({
            name: 'dia_despacho_ciclo',
            required: false,
            maxSelect: 1,
            values: diasValores,
          }),
        )
      }

      if (!chamadasCol.fields.getByName('dia_fim_ciclo')) {
        chamadasCol.fields.add(
          new SelectField({
            name: 'dia_fim_ciclo',
            required: false,
            maxSelect: 1,
            values: diasValores,
          }),
        )
      }

      app.save(chamadasCol)

      // Atualizar registros existentes de chamadas com os valores padrão (quarta / segunda / terca)
      try {
        app
          .db()
          .newQuery(
            `UPDATE chamadas
             SET dia_inicio_ciclo = COALESCE(NULLIF(dia_inicio_ciclo, ''), 'quarta'),
                 dia_despacho_ciclo = COALESCE(NULLIF(dia_despacho_ciclo, ''), 'segunda'),
                 dia_fim_ciclo = COALESCE(NULLIF(dia_fim_ciclo, ''), 'terca')
             WHERE dia_inicio_ciclo IS NULL OR dia_inicio_ciclo = ''`,
          )
          .execute()
      } catch (err) {
        console.log('Aviso ao atualizar valores padrão em chamadas:', err)
      }
    }

    // 2. Atualizar a coleção ciclos adicionando os campos chamada_id (relação para chamadas) e data_despacho
    const ciclosCol = app.findCollectionByNameOrId('ciclos')
    if (ciclosCol) {
      if (!ciclosCol.fields.getByName('chamada_id')) {
        ciclosCol.fields.add(
          new RelationField({
            name: 'chamada_id',
            required: false,
            collectionId: chamadasCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          }),
        )
      }

      if (!ciclosCol.fields.getByName('data_despacho')) {
        ciclosCol.fields.add(
          new DateField({
            name: 'data_despacho',
            required: false,
          }),
        )
      }

      ciclosCol.addIndex('idx_ciclos_chamada_id', false, 'chamada_id', '')
      app.save(ciclosCol)
    }
  },
  (app) => {
    const ciclosCol = app.findCollectionByNameOrId('ciclos')
    if (ciclosCol) {
      if (ciclosCol.fields.getByName('chamada_id')) {
        ciclosCol.fields.removeByName('chamada_id')
      }
      if (ciclosCol.fields.getByName('data_despacho')) {
        ciclosCol.fields.removeByName('data_despacho')
      }
      try {
        ciclosCol.removeIndex('idx_ciclos_chamada_id')
      } catch (_) {}
      app.save(ciclosCol)
    }

    const chamadasCol = app.findCollectionByNameOrId('chamadas')
    if (chamadasCol) {
      if (chamadasCol.fields.getByName('dia_inicio_ciclo')) {
        chamadasCol.fields.removeByName('dia_inicio_ciclo')
      }
      if (chamadasCol.fields.getByName('dia_despacho_ciclo')) {
        chamadasCol.fields.removeByName('dia_despacho_ciclo')
      }
      if (chamadasCol.fields.getByName('dia_fim_ciclo')) {
        chamadasCol.fields.removeByName('dia_fim_ciclo')
      }
      app.save(chamadasCol)
    }
  },
)
