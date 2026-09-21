migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA DA TABELA DE ESCOLAS (POCKETBASE / SKIP CLOUD)
    // Solicitação: "Apagar TODOS os registros da tabela (collection) escolas
    // no banco ao vivo, preservando o schema e todo o resto do banco."
    //
    // ESCOPO:
    // - Esvaziar a collection 'escolas' (apagar todos os registros de escolas)
    // - NÃO alterar o schema da collection (campos 'nome', 'endereco', 'telefone',
    //   'rota', 'email', 'tipo', 'alunos', 'bairro', 'contato', índices e regras
    //   de acesso devem permanecer exatamente intactos).
    //
    // PRESERVAR INTEGRALMENTE:
    // - 'users' (admin MASTER e secretária com fotos e perfis)
    // - 'configuracoes' (COOPONKAN com logotipo)
    // - 'ciclos' (ciclo ativo 'Ciclo 01/2026 - Teste Operacional', status 'coletando')
    // - 'produtos' (catálogo de produtos)
    // - 'contratos', 'contrato_itens', 'contrato_escolas', 'rotas',
    //   'rotas_logisticas' e demais coleções.
    // =========================================================================

    const colEscolas = app.findCollectionByNameOrId('escolas')

    // 1. Tentar truncate direto se suportado pela API PocketBase
    try {
      app.truncateCollection(colEscolas)
    } catch (_) {
      // Fallback: exclusão paginada em lote via Records API
      try {
        while (true) {
          const records = app.findRecordsByFilter('escolas', '', '', 500, 0)
          if (!records || records.length === 0) break
          for (const rec of records) {
            app.delete(rec)
          }
        }
      } catch (_) {}
    }

    // 2. Garantir com delete em raw SQL como camada final de segurança
    try {
      app.db().newQuery('DELETE FROM escolas').execute()
    } catch (_) {}
  },
  (app) => {
    // Reversão de limpeza de registros não é aplicável
  },
)
