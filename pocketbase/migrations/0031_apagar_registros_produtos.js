migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA DA TABELA DE PRODUTOS (POCKETBASE / SKIP CLOUD)
    // Solicitação: "Apagar a tabela de produtos."
    //
    // ESCOPO:
    // - Esvaziar a collection 'produtos' (apagar todos os registros de produtos)
    // - NÃO derrubar o schema/collection em si, que permanece intacto com seus
    //   campos atuais (nome, unidade, categoria como texto livre, apelidos,
    //   disponibilidade, estoque, preco_unitario).
    //
    // PRESERVAR:
    // - Usuários (admin MASTER, secretária)
    // - Configurações da cooperativa (COOPONKAN, inclusive logotipo)
    // - Ciclo ativo ("Ciclo 01/2026 - Teste Operacional", status 'coletando')
    // - Escolas, contratos, itens de contrato, rotas, pedidos, atestos etc.
    // =========================================================================

    const colProdutos = app.findCollectionByNameOrId('produtos')

    // 1. Tentar truncate direto se suportado pela API PocketBase
    try {
      app.truncateCollection(colProdutos)
    } catch (_) {
      // Fallback: exclusão paginada em lote via Records API
      try {
        while (true) {
          const records = app.findRecordsByFilter('produtos', '', '', 500, 0)
          if (!records || records.length === 0) break
          for (const rec of records) {
            app.delete(rec)
          }
        }
      } catch (_) {}
    }

    // 2. Garantir com delete em raw SQL como camada final de segurança
    try {
      app.db().newQuery('DELETE FROM produtos').execute()
    } catch (_) {}
  },
  (app) => {
    // Reversão de limpeza de registros não é aplicável
  },
)
