/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const cicloId = '9dd8a9m6didi2of'

    // 1. Remover eventuais dependentes vinculados ao ciclo 40/2026:
    // tokens_formulario, despachos, envios_whatsapp, importacoes, ciclo_contratos
    app
      .db()
      .newQuery('DELETE FROM tokens_formulario WHERE ciclo_id = {:cicloId}')
      .bind({ cicloId })
      .execute()

    app
      .db()
      .newQuery('DELETE FROM despachos WHERE ciclo_id = {:cicloId}')
      .bind({ cicloId })
      .execute()

    app
      .db()
      .newQuery('DELETE FROM envios_whatsapp WHERE ciclo_id = {:cicloId}')
      .bind({ cicloId })
      .execute()

    app
      .db()
      .newQuery('DELETE FROM importacoes WHERE ciclo_id = {:cicloId}')
      .bind({ cicloId })
      .execute()

    app
      .db()
      .newQuery('DELETE FROM ciclo_contratos WHERE ciclo_id = {:cicloId}')
      .bind({ cicloId })
      .execute()

    // 2. Remover o registro do ciclo 40/2026 da collection ciclos
    app.db().newQuery('DELETE FROM ciclos WHERE id = {:cicloId}').bind({ cicloId }).execute()
  },
  (app) => {
    // Reverter: recriar o ciclo 40/2026 caso necessário
    const cicloId = '9dd8a9m6didi2of'
    try {
      const ciclosCol = app.findCollectionByNameOrId('ciclos')
      const cicloRecord = new Record(ciclosCol)
      cicloRecord.set('id', cicloId)
      cicloRecord.set('nome', 'Ciclo 40/2026')
      cicloRecord.set('status', 'coletando')
      cicloRecord.set('data_inicio', '2026-10-07 00:00:00.000Z')
      cicloRecord.set('data_fim', '2026-10-13 23:59:59.999Z')
      cicloRecord.set(
        'snapshot',
        JSON.stringify({
          despacho_previsto_segunda: '2026-10-12T12:00:00.000Z',
          regra_semanal: 'quarta_a_terca',
        }),
      )
      app.save(cicloRecord)
    } catch (_) {}
  },
)
