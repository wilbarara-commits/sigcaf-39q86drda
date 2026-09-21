migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA DAS ALOCAÇÕES DE CONTRATO E ROTAS DAS ESCOLAS
    // Solicitação do usuário:
    // "Limpar as alocações de contrato e rota de planilha e rota logistica de
    // todas as escolas do cadastro mestre"
    //
    // ESCOPO:
    // 1. Apagar todos os registros da collection `contrato_escolas` (vínculos escola↔contrato,
    //    rota de planilha e rota logística vinculada)
    // 2. Apagar todas as paradas de rota logística (`paradas_rota`), preservando as
    //    definições das rotas logísticas (`rotas_logisticas`)
    // 3. Zerar o campo `rota` na collection `escolas` (garantir rota = '' em todo o cadastro)
    //
    // PRESERVAR ESTRITAMENTE:
    // - `escolas` (cadastro mestre intacto: nome, bairro, contato, alunos, tipo, etc.)
    // - `produtos` (catálogo com preços e estoque intactos)
    // - `contratos` e seus itens (`contrato_itens`)
    // - `rotas` (definições das rotas de planilha dos contratos, ex: ROTA A, ROTA B, ROTA C)
    // - `rotas_logisticas` (definições das rotas logísticas, ex: RURAL, CENTRO)
    // - `ciclos`, `configuracoes`, `users`, `despachos`
    // =========================================================================

    function clearCollection(colName) {
      try {
        const col = app.findCollectionByNameOrId(colName)
        app.truncateCollection(col)
      } catch (_) {
        try {
          while (true) {
            const records = app.findRecordsByFilter(colName, '', '', 500, 0)
            if (!records || records.length === 0) break
            for (const rec of records) {
              app.delete(rec)
            }
          }
        } catch (_) {}
      }

      try {
        app.db().newQuery(`DELETE FROM ${colName}`).execute()
      } catch (_) {}
    }

    // 1. Apagar todos os vínculos de contrato_escolas
    clearCollection('contrato_escolas')

    // 2. Apagar todas as paradas de rota logística (paradas_rota)
    clearCollection('paradas_rota')

    // 3. Zerar o campo rota na tabela de escolas para todos os registros
    try {
      app
        .db()
        .newQuery(`UPDATE escolas SET rota = '' WHERE rota IS NOT NULL AND rota != ''`)
        .execute()
    } catch (_) {
      try {
        const escolas = app.findRecordsByFilter('escolas', "rota != ''", '', 1000, 0)
        for (const esc of escolas) {
          esc.set('rota', '')
          app.save(esc)
        }
      } catch (_) {}
    }
  },
  (app) => {
    // Reversão de limpeza de registros não é aplicável
  },
)
