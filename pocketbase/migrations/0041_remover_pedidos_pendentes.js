migrate(
  (app) => {
    // =========================================================================
    // MIGRAÇÃO 0041: REMOÇÃO DOS PEDIDOS PENDENTES MANTENDO O RESTO
    // Solicitação do usuário: "Remover os pedidos pendentes mantendo o resto."
    //
    // ESCOPO:
    // 1. Excluir os registros da collection `atestos` eventualmente vinculados
    //    a pedidos cujo status seja 'Pendente' (case-insensitive);
    // 2. Excluir TODOS os registros em `pedido_itens` cujo `pedido_id` corresponda
    //    a pedidos com status 'Pendente' / 'pendente';
    // 3. Excluir TODOS os registros da collection `pedidos` cujo status seja 'Pendente' / 'pendente';
    // 4. Limpeza adicional de segurança contra itens de pedido órfãos;
    //
    // PRESERVAR ESTRITAMENTE:
    // - Pedidos com status 'Entregue' (20 pedidos confirmados), 'Em Rota', 'Cancelado';
    // - Atestos emitidos de pedidos 'Entregue';
    // - Todas as escolas (escolas), produtos (produtos), contratos (contratos),
    //   itens de contrato (contrato_itens), vínculos (contrato_escolas),
    //   rotas de planilha (rotas), rotas logísticas (rotas_logisticas), paradas (paradas_rota),
    //   ciclos (ciclos), configurações (configuracoes), usuários (users), despachos e importações.
    // =========================================================================

    // 1. Apagar atestos eventualmente vinculados a pedidos com status Pendente
    // Executado com app.delete para remover arquivos físicos caso existam
    try {
      while (true) {
        const atestosPendentes = app.findRecordsByFilter(
          'atestos',
          'pedido_id.status = "Pendente" || pedido_id.status = "pendente"',
          '',
          500,
          0,
        )
        if (!atestosPendentes || atestosPendentes.length === 0) break
        for (const atesto of atestosPendentes) {
          try {
            app.delete(atesto)
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0041] Verificação atestos via SDK:', err)
    }

    try {
      app
        .db()
        .newQuery(
          "DELETE FROM atestos WHERE pedido_id IN (SELECT id FROM pedidos WHERE LOWER(TRIM(status)) = 'pendente')",
        )
        .execute()
    } catch (err) {
      console.log('[0041] SQL DELETE atestos pendentes:', err)
    }

    // 2. Apagar itens de pedido vinculados aos pedidos pendentes
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM pedido_itens WHERE pedido_id IN (SELECT id FROM pedidos WHERE LOWER(TRIM(status)) = 'pendente')",
        )
        .execute()
    } catch (err) {
      console.log('[0041] SQL DELETE pedido_itens pendentes:', err)
    }

    // 3. Apagar os pedidos com status Pendente
    try {
      app.db().newQuery("DELETE FROM pedidos WHERE LOWER(TRIM(status)) = 'pendente'").execute()
    } catch (err) {
      console.log('[0041] SQL DELETE pedidos pendentes:', err)
    }

    // 4. Limpeza adicional de garantia via PocketBase SDK
    try {
      while (true) {
        const pendentes = app.findRecordsByFilter(
          'pedidos',
          'status = "Pendente" || status = "pendente"',
          '',
          500,
          0,
        )
        if (!pendentes || pendentes.length === 0) break
        for (const ped of pendentes) {
          try {
            const itens = app.findRecordsByFilter(
              'pedido_itens',
              `pedido_id = "${ped.id}"`,
              '',
              500,
              0,
            )
            if (itens && itens.length > 0) {
              for (const item of itens) {
                try {
                  app.delete(item)
                } catch (_) {}
              }
            }
          } catch (_) {}
          try {
            app.delete(ped)
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0041] Verificação SDK pedidos pendentes:', err)
    }

    // 5. Garantir que não sobrem itens de pedidos órfãos
    try {
      app
        .db()
        .newQuery('DELETE FROM pedido_itens WHERE pedido_id NOT IN (SELECT id FROM pedidos)')
        .execute()
    } catch (err) {
      console.log('[0041] SQL DELETE pedido_itens órfãos:', err)
    }
  },
  (app) => {
    // Reversão de limpeza de dados não é aplicável
  },
)
