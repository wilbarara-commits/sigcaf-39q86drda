// Migration 0059: Corrige o ciclo operacional para o período 16/09 a 22/09/2026 (Ciclo 37/2026),
// despacho previsto segunda-feira 21/09/2026 e status 'fechado'.
//
// Contexto do erro corrigido:
// - Na migration 0057, a data de referência foi passada erroneamente como 23/09/2026 (semana seguinte),
//   gerando Ciclo 38/2026 (23/09 a 29/09, despacho 28/09).
// - O período real da operação é 16/09/2026 a 22/09/2026.
//   16/09/2026 é quarta-feira.
//   Diferença desde a primeira quarta-feira do ano (07/01/2026):
//   16/09/2026 - 07/01/2026 = 252 dias = 36 semanas completas.
//   Número da semana: 36 + 1 = 37 (Ciclo 37/2026).
//   Despacho previsto: segunda-feira 21/09/2026 (quarta + 5 dias).
//   Término do ciclo: terça-feira 22/09/2026 23:59:59.999.
//   Fase / status: 'fechado'.

migrate(
  (app) => {
    // 1. Atualizar registros existentes na collection 'ciclos'
    const snapshotJson = JSON.stringify({
      regra_semanal: 'quarta_a_terca',
      semana_ano: 37,
      codigo_ciclo: '37/2026',
      despacho_previsto_segunda: '2026-09-21T12:00:00.000Z',
      coleta_ate: '2026-09-21',
    })

    app
      .db()
      .newQuery(`
      UPDATE ciclos
      SET
        nome = 'Ciclo 37/2026 – Teste Operacional',
        data_inicio = '2026-09-16 00:00:00.000Z',
        data_fim = '2026-09-22 23:59:59.999Z',
        status = 'fechado',
        snapshot = {:snapshot}
    `)
      .bind({ snapshot: snapshotJson })
      .execute()

    // 2. Se por acaso a tabela estiver vazia, cria o registro do Ciclo 37/2026
    const count = app.countRecords('ciclos')
    if (count === 0) {
      const ciclosCol = app.findCollectionByNameOrId('ciclos')
      const novoCiclo = new Record(ciclosCol)
      novoCiclo.set('nome', 'Ciclo 37/2026 – Teste Operacional')
      novoCiclo.set('data_inicio', '2026-09-16 00:00:00.000Z')
      novoCiclo.set('data_fim', '2026-09-22 23:59:59.999Z')
      novoCiclo.set('status', 'fechado')
      novoCiclo.set('snapshot', {
        regra_semanal: 'quarta_a_terca',
        semana_ano: 37,
        codigo_ciclo: '37/2026',
        despacho_previsto_segunda: '2026-09-21T12:00:00.000Z',
        coleta_ate: '2026-09-21',
      })
      app.save(novoCiclo)
    }
  },
  (app) => {
    // Reverter para 38/2026 se necessário
    const snapshotJson = JSON.stringify({
      regra_semanal: 'quarta_a_terca',
      semana_ano: 38,
      codigo_ciclo: '38/2026',
      despacho_previsto_segunda: '2026-09-28T12:00:00.000Z',
      coleta_ate: '2026-09-28',
    })

    app
      .db()
      .newQuery(`
      UPDATE ciclos
      SET
        nome = 'Ciclo 38/2026 - Teste Operacional',
        data_inicio = '2026-09-23 00:00:00.000Z',
        data_fim = '2026-09-29 23:59:59.999Z',
        status = 'coletando',
        snapshot = {:snapshot}
    `)
      .bind({ snapshot: snapshotJson })
      .execute()
  },
)
