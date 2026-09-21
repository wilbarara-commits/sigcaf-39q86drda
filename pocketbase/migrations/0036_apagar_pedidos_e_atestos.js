migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA OPERACIONAL: APAGAR TODOS OS REGISTROS DE PEDIDOS E ATESTOS
    //
    // Escopo exato:
    // 1. Apagar TODOS os registros de atestos (incluindo arquivos físicos via app.delete(rec))
    // 2. Apagar TODOS os registros de pedido_itens
    // 3. Apagar TODOS os registros de pedidos
    //
    // PRESERVAR ESTRITAMENTE:
    // - Usuários (users)
    // - Ciclo ativo ("Ciclo 01/2026 - Teste Operacional", coletando)
    // - Configurações (COOPONKAN, logotipo)
    // - Escolas (escolas)
    // - Produtos (produtos)
    // - Contratos (contratos)
    // - Itens de contrato (contrato_itens)
    // - Vínculos escola <-> contrato (contrato_escolas)
    // - Rotas da planilha (rotas)
    // - Rotas logísticas (rotas_logisticas), paradas (paradas_rota), despachos (despachos)
    // - Importações (importacoes)
    // - Envios de WhatsApp (envios_whatsapp)
    //
    // NENHUM SCHEMA, ÍNDICE OU REGRA DE ACESSO É ALTERADO.
    // =========================================================================

    // Ordem estrita de exclusão:
    // 1. Atestos: iterar com app.delete(rec) para que o PocketBase limpe os arquivos físicos do storage
    try {
      while (true) {
        const atestos = app.findRecordsByFilter('atestos', '', '', 500, 0)
        if (!atestos || atestos.length === 0) break
        for (const atesto of atestos) {
          app.delete(atesto)
        }
      }
    } catch (err) {
      console.log('Aviso ao apagar registros de atestos:', err)
    }

    // Garantir limpeza total da collection atestos
    try {
      const colAtestos = app.findCollectionByNameOrId('atestos')
      app.truncateCollection(colAtestos)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM atestos').execute()
    } catch (_) {}

    // 2. Itens de pedido (pedido_itens)
    try {
      const colPedidoItens = app.findCollectionByNameOrId('pedido_itens')
      app.truncateCollection(colPedidoItens)
    } catch (_) {
      try {
        while (true) {
          const itens = app.findRecordsByFilter('pedido_itens', '', '', 500, 0)
          if (!itens || itens.length === 0) break
          for (const item of itens) {
            app.delete(item)
          }
        }
      } catch (_) {}
    }
    try {
      app.db().newQuery('DELETE FROM pedido_itens').execute()
    } catch (_) {}

    // 3. Pedidos (pedidos)
    try {
      const colPedidos = app.findCollectionByNameOrId('pedidos')
      app.truncateCollection(colPedidos)
    } catch (_) {
      try {
        while (true) {
          const pedidos = app.findRecordsByFilter('pedidos', '', '', 500, 0)
          if (!pedidos || pedidos.length === 0) break
          for (const ped of pedidos) {
            app.delete(ped)
          }
        }
      } catch (_) {}
    }
    try {
      app.db().newQuery('DELETE FROM pedidos').execute()
    } catch (_) {}
  },
  (app) => {
    // Reversão de limpeza de registros não é aplicável
  },
)
