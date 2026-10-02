/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA COMPLETA DE PEDIDOS E REGISTROS RELACIONADOS (FASE DE TESTES)
    //
    // Solicitação:
    // "Apagar TODOS os pedidos do sistema (banco completo), não apenas de um ciclo."
    //
    // ESCOPO DE EXCLUSÃO (ORDEM QUE RESPEITA DEPENDÊNCIAS):
    // 1. atestos (inclui deleção de arquivos físicos via app.delete)
    // 2. pedido_itens (registros de itens de todos os pedidos)
    // 3. pedidos (todos os pedidos de todas as origens, ciclos e status)
    // 4. tokens_formulario (tokens de formulário vinculados a pedidos/testes de coleta)
    // 5. envios_whatsapp (logs de envios de mensagens)
    // 6. importacoes (histórico de planilhas de pedidos importadas)
    // 7. despachos (registros de despachos de entrega de pedidos)
    //
    // ESTADO CONSISTENTE PÓS-LIMPEZA:
    // - Rotas: caminhao_posicao_atual -> 0, caminhao_escola_id -> null (posição no depósito/0, sem escola)
    //
    // PRESERVAR ESTRITAMENTE INTACTOS:
    // - users
    // - configuracoes
    // - chamadas e chamada_itens
    // - ciclos e ciclo_contratos
    // - contratos e contrato_itens
    // - escolas e contrato_escolas
    // - rotas (as definições de rotas permanecem, apenas os ponteiros do caminhão voltam ao depósito)
    // - paradas_rota (o sequenciamento de paradas nas rotas permanece intacto)
    // - produtos
    // =========================================================================

    // 1. ATESTOS: apagar iterando para remover arquivos físicos no storage do PocketBase, e depois SQL
    try {
      while (true) {
        const atestos = app.findRecordsByFilter('atestos', '', '', 500, 0)
        if (!atestos || atestos.length === 0) break
        for (const atesto of atestos) {
          try {
            app.delete(atesto)
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0110] Aviso ao iterar atestos:', err)
    }
    try {
      const colAtestos = app.findCollectionByNameOrId('atestos')
      if (colAtestos) app.truncateCollection(colAtestos)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM atestos').execute()
    } catch (e) {
      console.log('[0110] DELETE FROM atestos erro:', e)
    }

    // 2. PEDIDO_ITENS: apagar todos
    try {
      const colPedidoItens = app.findCollectionByNameOrId('pedido_itens')
      if (colPedidoItens) app.truncateCollection(colPedidoItens)
    } catch (_) {
      try {
        while (true) {
          const itens = app.findRecordsByFilter('pedido_itens', '', '', 500, 0)
          if (!itens || itens.length === 0) break
          for (const item of itens) {
            try {
              app.delete(item)
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
    try {
      app.db().newQuery('DELETE FROM pedido_itens').execute()
    } catch (e) {
      console.log('[0110] DELETE FROM pedido_itens erro:', e)
    }

    // 3. PEDIDOS: apagar todos
    try {
      const colPedidos = app.findCollectionByNameOrId('pedidos')
      if (colPedidos) app.truncateCollection(colPedidos)
    } catch (_) {
      try {
        while (true) {
          const pedidos = app.findRecordsByFilter('pedidos', '', '', 500, 0)
          if (!pedidos || pedidos.length === 0) break
          for (const ped of pedidos) {
            try {
              app.delete(ped)
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
    try {
      app.db().newQuery('DELETE FROM pedidos').execute()
    } catch (e) {
      console.log('[0110] DELETE FROM pedidos erro:', e)
    }

    // 4. TOKENS_FORMULARIO: apagar todos
    try {
      const colTokens = app.findCollectionByNameOrId('tokens_formulario')
      if (colTokens) app.truncateCollection(colTokens)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM tokens_formulario').execute()
    } catch (e) {
      console.log('[0110] DELETE FROM tokens_formulario erro:', e)
    }

    // 5. ENVIOS_WHATSAPP: apagar todos
    try {
      const colWa = app.findCollectionByNameOrId('envios_whatsapp')
      if (colWa) app.truncateCollection(colWa)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM envios_whatsapp').execute()
    } catch (e) {
      console.log('[0110] DELETE FROM envios_whatsapp erro:', e)
    }

    // 6. IMPORTACOES: apagar histórico de importações de planilhas de pedidos
    try {
      const colImport = app.findCollectionByNameOrId('importacoes')
      if (colImport) app.truncateCollection(colImport)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM importacoes').execute()
    } catch (e) {
      console.log('[0110] DELETE FROM importacoes erro:', e)
    }

    // 7. DESPACHOS: apagar registros de despacho
    try {
      const colDesp = app.findCollectionByNameOrId('despachos')
      if (colDesp) app.truncateCollection(colDesp)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM despachos').execute()
    } catch (e) {
      console.log('[0110] DELETE FROM despachos erro:', e)
    }

    // 8. ESTADO CONSISTENTE PÓS-LIMPEZA DAS ROTAS:
    // Resetar a posição dos caminhões para o depósito central (0) e desvincular escola atual
    try {
      app
        .db()
        .newQuery(`
          UPDATE rotas 
          SET caminhao_posicao_atual = 0, caminhao_escola_id = NULL
        `)
        .execute()
    } catch (e) {
      console.log('[0110] UPDATE rotas reset caminhao erro:', e)
    }

    console.log(
      '[0110] Todos os pedidos e registros filhos apagados. Rotas resetadas para o depósito central.',
    )
  },
  (app) => {
    // Reversão de limpeza de registros em ambiente de testes não aplicável
  },
)
