migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA: APAGAR TODOS OS PEDIDOS COM STATUS 'Pendente'
    // E SEUS RESPECTIVOS ITENS DE PEDIDO E ATESTOS VINCULADOS
    //
    // Contexto: Pedidos com status 'Pendente' gerados por importações anteriores
    // (incluindo falhas de rate limit / lotes pendentes) que precisam ser limpos.
    //
    // Passos executados de forma segura:
    // 1. Apagar registros da tabela atestos vinculados aos pedidos pendentes
    //    (utilizando app.delete() para remoção física dos arquivos anexos)
    // 2. Apagar pedido_itens vinculados aos pedidos com status Pendente
    // 3. Apagar os pedidos com status 'Pendente' (case-insensitive)
    // 4. Limpeza adicional de garantia via SDK para itens e pedidos pendentes
    // 5. Limpeza de eventuais pedido_itens órfãos
    //
    // PRESERVAR ESTRITAMENTE:
    // - Pedidos com outros status ('Em Rota', 'Entregue', 'Cancelado')
    // - Escolas (escolas)
    // - Produtos (produtos)
    // - Contratos (contratos)
    // - Itens de contrato (contrato_itens)
    // - Contrato x Escolas (contrato_escolas)
    // - Rotas (rotas)
    // - Rotas logísticas (rotas_logisticas)
    // - Paradas rota (paradas_rota)
    // - Despachos (despachos)
    // - Ciclos (ciclos)
    // - Configurações (configuracoes)
    // - Usuários (users)
    // - Importações (importacoes)
    // =========================================================================

    // 1. Apagar atestos eventualmente vinculados a pedidos com status 'Pendente'
    // Exclui com app.delete para remover arquivos físicos vinculados (arquivo e assinatura_file)
    try {
      while (true) {
        const atestosPendentes = app.findRecordsByFilter(
          'atestos',
          'pedido_id.status = "Pendente"',
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
      console.log('[0039] Aviso ao buscar atestos via filtro SDK:', err)
    }

    // SQL complementar para atestos vinculados a pedidos com status Pendente
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM atestos WHERE pedido_id IN (SELECT id FROM pedidos WHERE status = 'Pendente' OR LOWER(TRIM(status)) = 'pendente')",
        )
        .execute()
    } catch (err) {
      console.log('[0039] Aviso ao apagar atestos vinculados via subquery SQL:', err)
    }

    // 2. Apagar itens de pedido (pedido_itens) vinculados aos pedidos com status Pendente
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM pedido_itens WHERE pedido_id IN (SELECT id FROM pedidos WHERE status = 'Pendente' OR LOWER(TRIM(status)) = 'pendente')",
        )
        .execute()
    } catch (err) {
      console.log('[0039] Aviso ao apagar pedido_itens via SQL:', err)
    }

    // 3. Apagar os pedidos com status Pendente via SQL
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM pedidos WHERE status = 'Pendente' OR LOWER(TRIM(status)) = 'pendente'",
        )
        .execute()
    } catch (err) {
      console.log('[0039] Aviso ao apagar pedidos pendentes via SQL:', err)
    }

    // 4. Limpeza de garantia via PocketBase SDK caso ainda reste algum pedido pendente
    try {
      while (true) {
        const pendentes = app.findRecordsByFilter('pedidos', 'status = "Pendente"', '', 500, 0)
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
      console.log('[0039] Verificação SDK para pedidos pendentes concluída:', err)
    }

    // 5. Garantir que não sobrem itens órfãos de pedido
    try {
      app
        .db()
        .newQuery('DELETE FROM pedido_itens WHERE pedido_id NOT IN (SELECT id FROM pedidos)')
        .execute()
    } catch (err) {
      console.log('[0039] Aviso ao limpar itens órfãos:', err)
    }
  },
  (app) => {
    // Reversão de limpeza de registros não é aplicável
  },
)
