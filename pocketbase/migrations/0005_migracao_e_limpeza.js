migrate(
  (app) => {
    // =========================================================================
    // 1. GARANTIR MIGRAÇÃO DE VÍNCULOS RESTANTES (escola_id / instituicao_id)
    // =========================================================================
    // Garante que qualquer vínculo de escola remanescente nos contratos esteja
    // devidamente inserido em contrato_escolas (com rota_id nulo quando não houver).
    const contratosCol = app.findCollectionByNameOrId('contratos')
    const contratoEscolasCol = app.findCollectionByNameOrId('contrato_escolas')

    const hasEscolaId = !!contratosCol.fields.getByName('escola_id')
    const hasInstituicaoId = !!contratosCol.fields.getByName('instituicao_id')

    if (hasEscolaId || hasInstituicaoId) {
      const fieldName = hasEscolaId ? 'escola_id' : 'instituicao_id'
      const contratos = app.findRecordsByFilter('contratos', '', 'created', 1000, 0)
      for (const c of contratos) {
        const escolaId = c.getString(fieldName)
        if (escolaId) {
          const ceExists = app.findRecordsByFilter(
            'contrato_escolas',
            `contrato_id = "${c.id}" && escola_id = "${escolaId}"`,
            '',
            1,
            0,
          )
          if (ceExists.length === 0) {
            const ce = new Record(contratoEscolasCol)
            ce.set('contrato_id', c.id)
            ce.set('escola_id', escolaId)
            ce.set('rota_id', null)
            app.save(ce)
          }
        }
      }
    }

    // =========================================================================
    // 2. APAGAR TODOS OS REGISTROS DE EXEMPLO DAS TABELAS ESPECIFICADAS
    // =========================================================================
    // Ordem estrita respeitando chaves estrangeiras:
    // 1. pedido_itens (depende de pedidos e produtos)
    // 2. pedidos (depende de ciclos, escolas, rotas)
    // 3. atestos (depende de pedidos)
    // 4. contrato_itens (depende de contratos e produtos)
    // 5. contrato_escolas (depende de contratos, escolas, rotas)
    // 6. rotas (depende de contratos)
    // 7. contratos
    // 8. escolas
    // 9. produtos
    // 10. importacoes (depende de ciclos, contratos, users)
    // 11. envios_whatsapp (depende de ciclos, escolas)
    // 12. ciclos
    //
    // ATENÇÃO: Usuários (users / _pb_users_auth_) são MANTIDOS intactos!
    const collectionsToClean = [
      'pedido_itens',
      'pedidos',
      'atestos',
      'contrato_itens',
      'contrato_escolas',
      'rotas',
      'contratos',
      'escolas',
      'produtos',
      'importacoes',
      'envios_whatsapp',
      'ciclos',
    ]

    for (const name of collectionsToClean) {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.truncateCollection(col)
      } catch (err) {
        try {
          const records = app.findRecordsByFilter(name, '', 'created', 1000, 0)
          for (const rec of records) {
            app.delete(rec)
          }
        } catch (_) {}
      }
    }

    // =========================================================================
    // 3. CRIAR EXATAMENTE 1 CICLO NOVO ATIVO DE TESTE
    // =========================================================================
    // Status 'coletando' (ativo de teste), nome claro e datas da semana corrente
    const ciclosCol = app.findCollectionByNameOrId('ciclos')

    const now = new Date()
    const inicio = new Date(now)
    inicio.setUTCHours(0, 0, 0, 0)

    const fim = new Date(now)
    fim.setUTCDate(fim.getUTCDate() + 7)
    fim.setUTCHours(23, 59, 59, 999)

    const cicloTeste = new Record(ciclosCol)
    cicloTeste.set('nome', 'Ciclo de Teste')
    cicloTeste.set('data_inicio', inicio.toISOString())
    cicloTeste.set('data_fim', fim.toISOString())
    cicloTeste.set('status', 'coletando')
    cicloTeste.set('snapshot', {})
    app.save(cicloTeste)
  },
  (app) => {
    // Reverter: remover o ciclo de teste criado
    try {
      const ciclos = app.findRecordsByFilter('ciclos', 'nome = "Ciclo de Teste"', '', 10, 0)
      for (const c of ciclos) {
        app.delete(c)
      }
    } catch (_) {}
  },
)
