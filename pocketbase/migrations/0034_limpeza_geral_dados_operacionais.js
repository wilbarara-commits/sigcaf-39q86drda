migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA GERAL DE DADOS OPERACIONAIS DO BANCO (POCKETBASE / SKIP CLOUD)
    // Solicitação do usuário: "Limpar arquivos" -> "Preserva só ciclo, configurações e usuários."
    //
    // ESCOPO DESTA LIMPEZA — apagar os REGISTROS (não schemas) de TODAS as coleções
    // operacionais do banco:
    // 1. atestos (e seus arquivos vinculados a pedidos)
    // 2. pedido_itens
    // 3. despachos
    // 4. paradas_rota
    // 5. pedidos
    // 6. importacoes
    // 7. envios_whatsapp
    // 8. contrato_escolas
    // 9. contrato_itens
    // 10. rotas_logisticas
    // 11. rotas
    // 12. contratos
    // 13. escolas
    // 14. produtos
    //
    // PRESERVAR ESTRITAMENTE:
    // 1. ciclos — exatamente o ciclo ativo "Ciclo 01/2026 - Teste Operacional" (status coletando)
    // 2. configuracoes — o registro singleton COOPONKAN com logotipo preservado no storage
    // 3. users — os 2 usuários (admin@coop.local MASTER e secretaria@coop.local SECRETARIA)
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

    // 14. produtos
    clearCollection('produtos')

    // 15. Preservar ciclo ativo ("Ciclo 01/2026 - Teste Operacional", status 'coletando', snapshot limpo)
    try {
      const todosCiclos = app.findRecordsByFilter('ciclos', '', '-created', 100, 0)
      let cicloAtivoMantido = null

      for (const c of todosCiclos) {
        const st = c.get('status')
        if ((st === 'coletando' || st === 'correcao') && !cicloAtivoMantido) {
          cicloAtivoMantido = c
          c.set('snapshot', {})
          app.save(c)
        } else if (cicloAtivoMantido) {
          try {
            app.delete(c)
          } catch (_) {}
        }
      }

      // Se nenhum estava com status coletando/correcao, mas há ciclos existentes
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
        // Se a coleção estiver vazia, recriar o ciclo padrão
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

    // 16. Assegurar integridade de 'configuracoes' (COOPONKAN) e 'users' (sem remoção)
    // O logotipo em storage permanece intacto referenciado pela collection configuracoes.
  },
  (app) => {
    // Reversão de limpeza de registros operacionais não é aplicável
  },
)
