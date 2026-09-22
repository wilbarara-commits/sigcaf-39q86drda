migrate(
  (app) => {
    // 1. Atualizar registros de ciclo_contratos com fase 'coletado' (qualquer capitalização) para 'coleta_encerrada'
    app
      .db()
      .newQuery(
        "UPDATE ciclo_contratos SET fase = 'coleta_encerrada' WHERE LOWER(TRIM(fase)) = 'coletado'",
      )
      .execute()

    // 2. Corrigir o Ciclo 38/2026: fim 30/09 (quarta) -> 29/09 (terça)
    // NÃO mexer no Ciclo 37/2026 (16->22/09, já correto)
    app
      .db()
      .newQuery(
        "UPDATE ciclos SET data_fim = '2026-09-29 23:59:59.999Z' WHERE nome LIKE '%38/2026%' AND data_fim LIKE '2026-09-30%'",
      )
      .execute()
  },
  (app) => {
    // Reverter ciclo_contratos para 'coletado'
    app
      .db()
      .newQuery("UPDATE ciclo_contratos SET fase = 'coletado' WHERE fase = 'coleta_encerrada'")
      .execute()

    // Reverter ciclo 38/2026 para 2026-09-30
    app
      .db()
      .newQuery(
        "UPDATE ciclos SET data_fim = '2026-09-30 23:59:59.999Z' WHERE nome LIKE '%38/2026%'",
      )
      .execute()
  },
)
