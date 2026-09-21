migrate(
  (app) => {
    // =========================================================================
    // PARTE 1 — LIMPEZA DE DADOS (POCKETBASE / SKIP CLOUD)
    // Solicitação do usuário:
    // "Desvincular as escolas do contrato e apagar cadastro mestre de escolas
    //  preservando só os produtos e o contrato. Apagar as rotas do contrato."
    //
    // ESCOPO:
    // 1. Apagar todos os registros de `contrato_escolas` (vínculos escola↔contrato)
    // 2. Apagar todos os registros da collection `escolas` (cadastro mestre)
    // 3. Apagar as ROTAS DO CONTRATO (`rotas` de planilha vinculadas a contratos)
    //
    // PRESERVAR OBRIGATORIAMENTE:
    // - `produtos` (catálogo de produtos)
    // - `contratos` e seus `contrato_itens`
    // - `users` (usuários e perfis)
    // - `configuracoes` (COOPONKAN e logotipo)
    // - `ciclos` ("Ciclo 01/2026 - Teste Operacional")
    // - `rotas_logisticas`, `paradas_rota`, `despachos` e schemas de todas as coleções
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

    // 1. Apagar primeiro contrato_escolas (possui foreign keys para escolas e rotas)
    clearCollection('contrato_escolas')

    // 2. Apagar cadastro mestre de escolas
    clearCollection('escolas')

    // 3. Apagar as rotas de planilha cadastradas nos contratos
    clearCollection('rotas')
  },
  (app) => {
    // Reversão de limpeza de registros não é aplicável
  },
)
