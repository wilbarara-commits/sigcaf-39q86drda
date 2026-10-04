/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // =========================================================================
    // LIMPEZA COMPLETA DE PEDIDOS E CICLOS (FASE DE TESTES)
    //
    // Solicitação do usuário:
    // "Eu limparia logo todos os pedidos e depois os ciclos."
    // Ou seja: apagar TODOS os pedidos do banco e, em seguida, apagar TODOS os ciclos.
    //
    // ESCOPO E ORDEM DE EXCLUSÃO (RESPEITANDO DEPENDÊNCIAS E INTEGRIDADE):
    // 1. atestos (caso existisse algum remanescente)
    // 2. pedido_itens (todos os itens de pedidos vinculados)
    // 3. pedidos (todos os pedidos de todos os status/origens/ciclos)
    // 4. tokens_formulario (tokens de formulário vinculados aos ciclos/pedidos de teste)
    // 5. envios_whatsapp (logs de mensagens vinculadas a ciclos)
    // 6. importacoes (histórico de planilhas de pedidos importadas em ciclos)
    // 7. despachos (registros de despacho de pedidos/rotas vinculados a ciclos)
    // 8. ciclos (todos os ciclos existentes no banco)
    //
    // CONSISTÊNCIA DE ROTAS:
    // - As rotas pertencem a chamadas (não a ciclos) e permanecem 100% intactas.
    // - Apenas o ponteiro do caminhão é resetado para o depósito central (0) e sem escola vinculada.
    //
    // PRESERVAR ESTRITAMENTE INTACTOS:
    // - chamadas e chamada_itens
    // - contratos e contrato_itens
    // - escolas e contrato_escolas
    // - produtos
    // - rotas e paradas_rota
    // - users
    // - configuracoes
    // =========================================================================

    let countAtestos = 0
    let countPedidoItens = 0
    let countPedidos = 0
    let countTokens = 0
    let countEnviosWa = 0
    let countImportacoes = 0
    let countDespachos = 0
    let countCiclos = 0

    // 1. ATESTOS: apagar com remoção física de arquivos e garantia SQL
    try {
      while (true) {
        const atestos = app.findRecordsByFilter('atestos', '', '', 500, 0)
        if (!atestos || atestos.length === 0) break
        for (const atesto of atestos) {
          try {
            app.delete(atesto)
            countAtestos++
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0114] Aviso ao iterar atestos:', err)
    }
    try {
      const colAtestos = app.findCollectionByNameOrId('atestos')
      if (colAtestos) app.truncateCollection(colAtestos)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM atestos').execute()
    } catch (e) {
      console.log('[0114] DELETE FROM atestos erro:', e)
    }

    // 2. PEDIDO_ITENS: apagar todos os itens filhos
    try {
      while (true) {
        const itens = app.findRecordsByFilter('pedido_itens', '', '', 500, 0)
        if (!itens || itens.length === 0) break
        for (const item of itens) {
          try {
            app.delete(item)
            countPedidoItens++
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0114] Aviso ao iterar pedido_itens:', err)
    }
    try {
      const colPedidoItens = app.findCollectionByNameOrId('pedido_itens')
      if (colPedidoItens) app.truncateCollection(colPedidoItens)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM pedido_itens').execute()
    } catch (e) {
      console.log('[0114] DELETE FROM pedido_itens erro:', e)
    }

    // 3. PEDIDOS: apagar todos os pedidos
    try {
      while (true) {
        const peds = app.findRecordsByFilter('pedidos', '', '', 500, 0)
        if (!peds || peds.length === 0) break
        for (const ped of peds) {
          try {
            app.delete(ped)
            countPedidos++
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0114] Aviso ao iterar pedidos:', err)
    }
    try {
      const colPedidos = app.findCollectionByNameOrId('pedidos')
      if (colPedidos) app.truncateCollection(colPedidos)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM pedidos').execute()
    } catch (e) {
      console.log('[0114] DELETE FROM pedidos erro:', e)
    }

    // 4. TOKENS_FORMULARIO: apagar tokens de teste vinculados
    try {
      while (true) {
        const tokens = app.findRecordsByFilter('tokens_formulario', '', '', 500, 0)
        if (!tokens || tokens.length === 0) break
        for (const t of tokens) {
          try {
            app.delete(t)
            countTokens++
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0114] Aviso ao iterar tokens_formulario:', err)
    }
    try {
      const colTokens = app.findCollectionByNameOrId('tokens_formulario')
      if (colTokens) app.truncateCollection(colTokens)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM tokens_formulario').execute()
    } catch (e) {
      console.log('[0114] DELETE FROM tokens_formulario erro:', e)
    }

    // 5. ENVIOS_WHATSAPP: apagar envios vinculados
    try {
      while (true) {
        const envios = app.findRecordsByFilter('envios_whatsapp', '', '', 500, 0)
        if (!envios || envios.length === 0) break
        for (const env of envios) {
          try {
            app.delete(env)
            countEnviosWa++
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0114] Aviso ao iterar envios_whatsapp:', err)
    }
    try {
      const colWa = app.findCollectionByNameOrId('envios_whatsapp')
      if (colWa) app.truncateCollection(colWa)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM envios_whatsapp').execute()
    } catch (e) {
      console.log('[0114] DELETE FROM envios_whatsapp erro:', e)
    }

    // 6. IMPORTACOES: apagar histórico de importações vinculadas aos ciclos
    try {
      while (true) {
        const imps = app.findRecordsByFilter('importacoes', '', '', 500, 0)
        if (!imps || imps.length === 0) break
        for (const imp of imps) {
          try {
            app.delete(imp)
            countImportacoes++
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0114] Aviso ao iterar importacoes:', err)
    }
    try {
      const colImport = app.findCollectionByNameOrId('importacoes')
      if (colImport) app.truncateCollection(colImport)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM importacoes').execute()
    } catch (e) {
      console.log('[0114] DELETE FROM importacoes erro:', e)
    }

    // 7. DESPACHOS: apagar registros de despachos vinculados aos ciclos
    try {
      while (true) {
        const desps = app.findRecordsByFilter('despachos', '', '', 500, 0)
        if (!desps || desps.length === 0) break
        for (const d of desps) {
          try {
            app.delete(d)
            countDespachos++
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0114] Aviso ao iterar despachos:', err)
    }
    try {
      const colDesp = app.findCollectionByNameOrId('despachos')
      if (colDesp) app.truncateCollection(colDesp)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM despachos').execute()
    } catch (e) {
      console.log('[0114] DELETE FROM despachos erro:', e)
    }

    // 8. CICLOS: apagar todos os ciclos
    try {
      while (true) {
        const ciclos = app.findRecordsByFilter('ciclos', '', '', 500, 0)
        if (!ciclos || ciclos.length === 0) break
        for (const c of ciclos) {
          try {
            app.delete(c)
            countCiclos++
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('[0114] Aviso ao iterar ciclos:', err)
    }
    try {
      const colCiclos = app.findCollectionByNameOrId('ciclos')
      if (colCiclos) app.truncateCollection(colCiclos)
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM ciclos').execute()
    } catch (e) {
      console.log('[0114] DELETE FROM ciclos erro:', e)
    }

    // 9. ESTADO CONSISTENTE PÓS-LIMPEZA DAS ROTAS:
    // Resetar ponteiros do caminhão para o depósito (ordem 0, sem escola associada)
    try {
      app
        .db()
        .newQuery(`
          UPDATE rotas 
          SET caminhao_posicao_atual = 0, caminhao_escola_id = NULL
        `)
        .execute()
    } catch (e) {
      console.log('[0114] UPDATE rotas reset caminhao erro:', e)
    }

    console.log(
      `[0114] Limpeza concluída: ${countPedidos} pedidos, ${countPedidoItens} itens de pedidos, ${countCiclos} ciclos, ${countTokens} tokens, ${countEnviosWa} envios WhatsApp, ${countImportacoes} importações e ${countDespachos} despachos apagados. Rotas resetadas para o depósito central.`,
    )
  },
  (app) => {
    // Reversão de limpeza de registros em ambiente de testes não aplicável
  },
)
