migrate(
  (app) => {
    // =========================================================================
    // MANUTENÇÃO DE DADOS: APAGAR PEDIDOS DO CONTRATO C-2026-02 (k1od63z34lg0ej9)
    //
    // Contexto:
    // O contrato C-2026-02 é individualizado. O único pedido vinculado a este
    // contrato é o pedido 'r5qjtfh23j313op' (numero 'FOR-37-0001'), criado via
    // formulário online pela escola 'jl987ffjs626ndv' no ciclo 37/2026.
    //
    // Ação solicitada:
    // 1. Apagar registros filhos em 'pedido_itens' vinculados a 'r5qjtfh23j313op'
    // 2. Apagar registros filhos em 'atestos' eventualmente vinculados a 'r5qjtfh23j313op'
    // 3. Apagar o registro em 'pedidos' com id 'r5qjtfh23j313op'
    //
    // Preservar intocados:
    // - O token de formulário ativo ('88z9aour9x4go57')
    // - Vínculos em contrato_escolas / rotas
    // - Pedidos e itens de outros contratos (inclusive do ciclo 37/2026 do C-2026-01)
    // =========================================================================

    const targetPedidoId = 'r5qjtfh23j313op'

    // 1. Excluir atestos vinculados se existirem
    try {
      app
        .db()
        .newQuery('DELETE FROM atestos WHERE pedido_id = {:pedidoId}')
        .bind({ pedidoId: targetPedidoId })
        .execute()
    } catch (err) {
      console.log('[0077] Erro ao apagar atestos do pedido:', err)
    }

    // 2. Excluir pedido_itens vinculados
    try {
      app
        .db()
        .newQuery('DELETE FROM pedido_itens WHERE pedido_id = {:pedidoId}')
        .bind({ pedidoId: targetPedidoId })
        .execute()
    } catch (err) {
      console.log('[0077] Erro ao apagar pedido_itens do pedido:', err)
    }

    // 3. Excluir o pedido da tabela pedidos
    try {
      app
        .db()
        .newQuery('DELETE FROM pedidos WHERE id = {:pedidoId}')
        .bind({ pedidoId: targetPedidoId })
        .execute()
    } catch (err) {
      console.log('[0077] Erro ao apagar pedido:', err)
    }

    // 4. Fallback idempotente defensivo via SDK caso ainda conste algo
    try {
      const pedidoRecord = app.findFirstRecordByData('pedidos', 'id', targetPedidoId)
      if (pedidoRecord) {
        // Apaga itens residuais se houver
        const itens = app.findRecordsByFilter(
          'pedido_itens',
          `pedido_id = "${targetPedidoId}"`,
          '',
          100,
          0,
        )
        for (const item of itens) {
          try {
            app.delete(item)
          } catch (_) {}
        }

        const atestos = app.findRecordsByFilter(
          'atestos',
          `pedido_id = "${targetPedidoId}"`,
          '',
          100,
          0,
        )
        for (const atesto of atestos) {
          try {
            app.delete(atesto)
          } catch (_) {}
        }

        app.delete(pedidoRecord)
      }
    } catch (_) {
      // Pedido já não existe, idempotente
    }
  },
  (app) => {
    // Reversão de limpeza de registros excluídos a pedido do usuário não é aplicável
  },
)
