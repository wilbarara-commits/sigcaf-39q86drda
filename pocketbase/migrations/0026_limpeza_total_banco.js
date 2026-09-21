migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA TOTAL DO BANCO DE DADOS (POCKETBASE / SKIP CLOUD)
    // Solicitação: "Limpar banco mantendo ciclo e configurações."
    //
    // ESCOPO — apagar TODOS os dados operacionais:
    // - Escolas (cadastro mestre)
    // - Produtos (cadastro mestre, incluindo duplicados)
    // - Contratos — com cascata de: vínculos contrato<->escolas (contrato_escolas),
    //   itens de contrato (contrato_itens), rotas da planilha (rotas)
    // - Rotas logísticas (rotas_logisticas) e suas paradas (paradas_rota)
    // - Despachos (despachos)
    // - Pedidos (pedidos) e seus itens (pedido_itens)
    // - Atestos (atestos)
    // - Importações (importacoes)
    // - Envios de WhatsApp (envios_whatsapp)
    //
    // PRESERVAR:
    // - Usuários (admin MASTER admin@coop.local e secretária secretaria@coop.local, perfis e fotos)
    // - Configurações COOPONKAN (razão social, cidade/UF, região, logotipo)
    // - O ciclo ativo ("Ciclo 01/2026 - Teste Operacional", status 'coletando')
    // =========================================================================

    function clearCollection(colName) {
      // 1. Tentar truncate direto se suportado
      try {
        const col = app.findCollectionByNameOrId(colName)
        app.truncateCollection(col)
      } catch (err) {
        // Fallback: exclusão paginada em lote
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

      // 2. Garantir com delete em raw SQL como camada final caso reste algo
      try {
        app.db().newQuery(`DELETE FROM ${colName}`).execute()
      } catch (_) {}
    }

    // Ordem estrita respeitando chaves estrangeiras:
    // 1. atestos (FK: pedidos)
    clearCollection('atestos')

    // 2. pedido_itens (FK: pedidos, produtos)
    clearCollection('pedido_itens')

    // 3. despachos (FK: contratos, ciclos, rotas_logisticas, users)
    clearCollection('despachos')

    // 4. paradas_rota (FK: rotas_logisticas, escolas)
    clearCollection('paradas_rota')

    // 5. pedidos (FK: escolas, ciclos, rotas, rotas_logisticas, users)
    clearCollection('pedidos')

    // 6. importacoes (FK: ciclos, contratos, users)
    clearCollection('importacoes')

    // 7. envios_whatsapp (FK: ciclos, escolas)
    clearCollection('envios_whatsapp')

    // 8. contrato_escolas (FK: contratos, escolas, rotas, rotas_logisticas)
    clearCollection('contrato_escolas')

    // 9. contrato_itens (FK: contratos, produtos)
    clearCollection('contrato_itens')

    // 10. rotas_logisticas (FK: contratos)
    clearCollection('rotas_logisticas')

    // 11. rotas (FK: contratos)
    clearCollection('rotas')

    // 12. contratos
    clearCollection('contratos')

    // 13. escolas
    clearCollection('escolas')

    // 14. produtos (ajusta estoque para 0 e remove todos)
    clearCollection('produtos')

    // 15. Preservar ciclo ativo: manter ciclo ativo com status 'coletando' e zerar snapshot residual
    try {
      const todosCiclos = app.findRecordsByFilter('ciclos', '', '-created', 100, 0)
      let cicloAtivoMantido = null

      for (const c of todosCiclos) {
        const st = c.get('status')
        if ((st === 'coletando' || st === 'correcao') && !cicloAtivoMantido) {
          cicloAtivoMantido = c
          c.set('snapshot', {})
          // Se o nome não tiver o texto do ciclo, mantém o nome existente
          app.save(c)
        } else if (cicloAtivoMantido) {
          // Deletar duplicatas ou outros ciclos não ativos
          try {
            app.delete(c)
          } catch (_) {}
        }
      }

      // Se nenhum estava com status coletando/correcao, mas há ciclos
      if (!cicloAtivoMantido && todosCiclos.length > 0) {
        cicloAtivoMantido = todosCiclos[0]
        cicloAtivoMantido.set('status', 'coletando')
        cicloAtivoMantido.set('snapshot', {})
        app.save(cicloAtivoMantido)
        for (let i = 1; i < todosCiclos.length; i++) {
          try {
            app.delete(todosCiclos[i])
          } catch (_) {}
        }
      } else if (!cicloAtivoMantido && todosCiclos.length === 0) {
        // Se por algum motivo estivesse vazio, garantir exatamente 1 ciclo ativo
        const ciclosCol = app.findCollectionByNameOrId('ciclos')
        const novoCiclo = new Record(ciclosCol)
        novoCiclo.set('nome', 'Ciclo 01/2026 - Teste Operacional')
        novoCiclo.set('data_inicio', '2026-01-01 00:00:00.000Z')
        novoCiclo.set('data_fim', '2026-12-31 23:59:59.999Z')
        novoCiclo.set('status', 'coletando')
        novoCiclo.set('snapshot', {})
        app.save(novoCiclo)
      }
    } catch (err) {
      console.log('Erro ao gerenciar ciclo ativo:', err)
    }
  },
  (app) => {
    // Reversão de limpeza de banco de dados não é aplicável
  },
)
