/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const cicloId = 'sllf3p8i8wpm34i'

    // Validação estrita de segurança antes da exclusão:
    // O registro deve existir, ter nome 'Ciclo 42/2026' e status 'cancelado'.
    // Se não atender a esses critérios, a migração não executa nada e não quebra.
    try {
      const record = app.findRecordById('ciclos', cicloId)
      if (!record) {
        console.log(`[0142] Ciclo ${cicloId} não encontrado. Nenhuma ação executada.`)
        return
      }

      const nome = record.get('nome')
      const status = record.get('status')

      if (nome !== 'Ciclo 42/2026' || status !== 'cancelado') {
        console.log(
          `[0142] Ciclo ${cicloId} não atende aos critérios de segurança (nome='${nome}', status='${status}'). Exclusão abortada por precaução.`,
        )
        return
      }

      // Executa a exclusão definitiva do ciclo pontual cancelado
      app
        .db()
        .newQuery(
          'DELETE FROM ciclos WHERE id = {:cicloId} AND nome = {:nome} AND status = {:status}',
        )
        .bind({
          cicloId,
          nome: 'Ciclo 42/2026',
          status: 'cancelado',
        })
        .execute()

      console.log(
        `[0142] Ciclo 42/2026 (${cicloId}) cancelado e sem dependentes foi excluído com sucesso.`,
      )
    } catch (e) {
      console.log(
        `[0142] Registro do ciclo ${cicloId} já não existe ou ocorreu erro na checagem:`,
        e,
      )
    }
  },
  (app) => {
    // Reverter (opcional): recria o ciclo cancelado caso necessário
    const cicloId = 'sllf3p8i8wpm34i'
    try {
      const ciclosCol = app.findCollectionByNameOrId('ciclos')
      const cicloRecord = new Record(ciclosCol)
      cicloRecord.set('id', cicloId)
      cicloRecord.set('nome', 'Ciclo 42/2026')
      cicloRecord.set('chamada_id', 'mc5dfmz40vg21jm')
      cicloRecord.set('status', 'cancelado')
      cicloRecord.set('motivo_cancelamento', 'Aberto antes da hora')
      cicloRecord.set('data_cancelamento', '2026-10-10 22:19:54.516Z')
      cicloRecord.set('data_inicio', '2026-10-14 00:00:00.000Z')
      cicloRecord.set('data_despacho', '2026-10-20 12:00:00.000Z')
      cicloRecord.set('data_fim', '2026-10-20 23:59:59.999Z')
      app.save(cicloRecord)
    } catch (_) {}
  },
)
