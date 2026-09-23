migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA TOTAL DE DADOS OPERACIONAIS DO SIGCAF (RESET COMPLETO DE DADOS)
    //
    // Solicitação do usuário:
    // "apagar banco de dados mantendo só usuários e configurações"
    // Reset de dados operacionais para iniciar a operação real do zero.
    //
    // ESCOPO:
    // Apagar TODOS os registros de TODAS as collections operacionais:
    //  1. tokens_formulario
    //  2. ciclo_contratos
    //  3. paradas_rota
    //  4. pedido_itens
    //  5. atestos
    //  6. envios_whatsapp
    //  7. importacoes
    //  8. despachos
    //  9. pedidos
    // 10. contrato_itens
    // 11. contrato_escolas
    // 12. rotas
    // 13. ciclos
    // 14. contratos
    // 15. escolas
    // 16. produtos
    //
    // PRESERVAR ESTRITAMENTE:
    // - users: todos os usuários intactos (contas MASTER, SECRETARIA, ADMIN etc.)
    // - configuracoes: todos os registros singleton de configurações intactos
    // - estrutura, campos, índices e regras de API das collections
    // =========================================================================

    const collectionsToClear = [
      'tokens_formulario',
      'ciclo_contratos',
      'paradas_rota',
      'pedido_itens',
      'atestos',
      'envios_whatsapp',
      'importacoes',
      'despachos',
      'pedidos',
      'contrato_itens',
      'contrato_escolas',
      'rotas',
      'ciclos',
      'contratos',
      'escolas',
      'produtos',
    ]

    function clearCollection(colName) {
      // 1. Tentar truncate se suportado pelo PocketBase
      try {
        const col = app.findCollectionByNameOrId(colName)
        if (col) {
          app.truncateCollection(col)
        }
      } catch (err) {
        // Fallback: exclusão paginada em lote via SDK
        try {
          while (true) {
            const records = app.findRecordsByFilter(colName, '', '', 500, 0)
            if (!records || records.length === 0) break
            for (const rec of records) {
              try {
                app.delete(rec)
              } catch (_) {}
            }
          }
        } catch (_) {}
      }

      // 2. Garantir com delete em raw SQL como camada final idempotente
      try {
        app.db().newQuery(`DELETE FROM ${colName}`).execute()
      } catch (err) {
        console.log(`[0078] Aviso ao executar DELETE FROM ${colName}:`, err)
      }
    }

    // Executar a limpeza na ordem estrita de dependências (filhos antes de pais)
    for (const colName of collectionsToClear) {
      clearCollection(colName)
    }

    console.log('[0078] Limpeza operacional total concluída com sucesso.')
  },
  (app) => {
    // Reversão de limpeza de banco de dados não é aplicável
  },
)
