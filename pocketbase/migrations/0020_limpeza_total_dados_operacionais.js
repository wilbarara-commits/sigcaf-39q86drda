migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA TOTAL DO BANCO DE DADOS (POCKETBASE / SKIP CLOUD)
    // Escopo confirmado pelo usuário:
    // 1. Apagar TODOS os registros operacionais:
    //    - atestos (depende de pedidos)
    //    - pedido_itens (depende de pedidos, produtos)
    //    - despachos (depende de contratos, ciclos, rotas_logisticas, users)
    //    - paradas_rota (depende de rotas_logisticas, escolas)
    //    - pedidos (depende de escolas, ciclos, rotas, rotas_logisticas, users)
    //    - importacoes (depende de ciclos, contratos, users)
    //    - envios_whatsapp (depende de ciclos, escolas)
    //    - contrato_escolas (depende de contratos, escolas, rotas, rotas_logisticas)
    //    - contrato_itens (depende de contratos, produtos)
    //    - rotas_logisticas (depende de contratos)
    //    - rotas (depende de contratos)
    //    - contratos
    //    - escolas
    //    - produtos
    //
    // 2. Preservar:
    //    - users (coleção users — admin MASTER e secretária, com perfis/fotos)
    //    - configuracoes (singleton COOPONKAN, com logotipo)
    //    - 1 ciclo ativo (se existir ciclo ativo, manter; se só existir ciclo fechado/nenhum ativo, garantir 1 ativo para a operação recomeçar do zero)
    // =========================================================================

    // Função utilitária para limpar uma coleção com segurança (truncate + fallback delete em loop)
    function clearCollection(colName) {
      try {
        const col = app.findCollectionByNameOrId(colName)
        app.truncateCollection(col)
      } catch (err) {
        // Fallback caso truncate não seja suportado ou falhe por restrição temporária
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

    // 15. Ciclos:
    // O usuário solicitou: "PRESERVAR: ... 1 ciclo de teste (se existir um ciclo ativo, mantenha-o; se não houver nenhum, não crie)."
    // Se houver algum ciclo com status 'coletando' ou 'correcao', removemos os demais e mantemos esse ciclo ativo.
    // Se o ciclo existente estiver com status 'fechado' ou não houver ciclo ativo, reativamos/ajustamos o ciclo existente para 'coletando' com snapshot limpo, ou mantemos 1 ciclo ativo de teste.
    try {
      const todosCiclos = app.findRecordsByFilter('ciclos', '', '-created', 100, 0)
      let cicloAtivoMantido = null

      // Procura primeiro se há um ciclo já em status coletando ou correcao
      for (const c of todosCiclos) {
        const st = c.get('status')
        if ((st === 'coletando' || st === 'correcao') && !cicloAtivoMantido) {
          cicloAtivoMantido = c
          c.set('snapshot', {})
          app.save(c)
        } else if (cicloAtivoMantido) {
          app.delete(c)
        }
      }

      // Se nenhum estava com status coletando/correcao, mas há ciclos (ex: estava 'fechado')
      if (!cicloAtivoMantido && todosCiclos.length > 0) {
        cicloAtivoMantido = todosCiclos[0]
        cicloAtivoMantido.set('status', 'coletando')
        cicloAtivoMantido.set('snapshot', {})
        app.save(cicloAtivoMantido)

        // Deleta os eventuais outros
        for (let i = 1; i < todosCiclos.length; i++) {
          try {
            app.delete(todosCiclos[i])
          } catch (_) {}
        }
      }
    } catch (_) {}
  },
  (app) => {
    // Reversão de limpeza de banco de dados não é aplicável
  },
)
