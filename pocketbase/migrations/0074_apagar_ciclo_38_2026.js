migrate(
  (app) => {
    // 1. Remover vínculos do ciclo 38/2026 em ciclo_contratos
    app
      .db()
      .newQuery(
        'DELETE FROM ciclo_contratos WHERE ciclo_id = {:cicloId} OR id = {:contratoVinculoId}',
      )
      .bind({
        cicloId: 'xi8qyujlwy7nway',
        contratoVinculoId: 'pokihojk6tmkzy4',
      })
      .execute()

    // 2. Remover o ciclo 38/2026 da collection ciclos
    app
      .db()
      .newQuery('DELETE FROM ciclos WHERE id = {:cicloId}')
      .bind({
        cicloId: 'xi8qyujlwy7nway',
      })
      .execute()
  },
  (app) => {
    // Reverter: recriar o ciclo 38/2026 e o vínculo ciclo_contratos caso seja feito rollback
    const ciclosCol = app.findCollectionByNameOrId('ciclos')
    const cicloRecord = new Record(ciclosCol)
    cicloRecord.set('id', 'xi8qyujlwy7nway')
    cicloRecord.set('nome', 'Ciclo 38/2026')
    cicloRecord.set('status', 'coletando')
    cicloRecord.set('data_inicio', '2026-09-23 00:00:00.000Z')
    cicloRecord.set('data_fim', '2026-09-29 23:59:59.999Z')
    cicloRecord.set(
      'snapshot',
      JSON.stringify({
        despacho_previsto_segunda: '2026-09-28T12:00:00.000Z',
        regra_semanal: 'quarta_a_terca',
      }),
    )
    app.save(cicloRecord)

    const cicloContratosCol = app.findCollectionByNameOrId('ciclo_contratos')
    const ccRecord = new Record(cicloContratosCol)
    ccRecord.set('id', 'pokihojk6tmkzy4')
    ccRecord.set('ciclo_id', 'xi8qyujlwy7nway')
    ccRecord.set('contrato_id', 'x68esa2svgerhk4')
    ccRecord.set('fase', 'coletando')
    app.save(ccRecord)
  },
)
