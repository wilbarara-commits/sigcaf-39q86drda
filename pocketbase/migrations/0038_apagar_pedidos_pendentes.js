migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA PONTUAL: APAGAR TODOS OS PEDIDOS COM STATUS 'Pendente'
    // E SEUS RESPECTIVOS ITENS DE PEDIDO
    //
    // Contexto: Usuário reimportou a planilha da secretaria e precisa refazer
    // a importação. Todos os pedidos pendentes atuais devem ser removidos.
    //
    // REQUISITOS:
    // 1. Localiza todos os pedidos com status = 'Pendente'
    // 2. Apaga os registros de pedido_itens vinculados a esses pedidos
    // 3. Apaga os pedidos com status = 'Pendente'
    // 4. NÃO apaga pedidos em outros status (Em Rota, Entregue, Cancelado)
    // 5. NÃO altera escolas, produtos, contratos, contrato_itens, contrato_escolas,
    //    rotas, rotas_logisticas, paradas_rota, despachos, ciclos, configuracoes,
    //    users ou importacoes.
    // =========================================================================

    // 1. Apagar itens de pedido vinculados aos pedidos com status Pendente
    // Executado diretamente via SQL DELETE seguro
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM pedido_itens WHERE pedido_id IN (SELECT id FROM pedidos WHERE status = 'Pendente' OR LOWER(TRIM(status)) = 'pendente')",
        )
        .execute()
    } catch (err) {
      console.log('[0038] Aviso ao apagar pedido_itens via subquery SQL:', err)
    }

    // 2. Apagar atestos eventualmente vinculados aos pedidos com status Pendente
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM atestos WHERE pedido_id IN (SELECT id FROM pedidos WHERE status = 'Pendente' OR LOWER(TRIM(status)) = 'pendente')",
        )
        .execute()
    } catch (err) {
      console.log('[0038] Aviso ao apagar atestos vinculados via subquery SQL:', err)
    }

    // 3. Apagar os pedidos com status Pendente
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM pedidos WHERE status = 'Pendente' OR LOWER(TRIM(status)) = 'pendente'",
        )
        .execute()
    } catch (err) {
      console.log('[0038] Aviso ao apagar pedidos via SQL:', err)
    }

    // 4. Limpeza adicional de garantia via PocketBase SDK caso algum registro persista
    try {
      while (true) {
        const pendentes = app.findRecordsByFilter('pedidos', 'status = "Pendente"', '', 500, 0)
        if (!pendentes || pendentes.length === 0) break
        for (const ped of pendentes) {
          try {
            // Apaga quaisquer itens restantes vinculados
            const itens = app.findRecordsByFilter(
              'pedido_itens',
              `pedido_id = "${ped.id}"`,
              '',
              500,
              0,
            )
            if (itens && itens.length > 0) {
              for (const item of itens) {
                app.delete(item)
              }
            }
          } catch (_) {}
          app.delete(ped)
        }
      }
    } catch (err) {
      console.log('[0038] Verificação SDK para pedidos pendentes concluída:', err)
    }

    // 5. Garantir que não sobrem itens órfãos (itens cujo pedido_id não existe em pedidos)
    try {
      app
        .db()
        .newQuery('DELETE FROM pedido_itens WHERE pedido_id NOT IN (SELECT id FROM pedidos)')
        .execute()
    } catch (_) {}
  },
  (app) => {
    // Reversão de limpeza de registros não é aplicável
  },
)
