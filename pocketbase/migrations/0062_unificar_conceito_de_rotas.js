migrate(
  (app) => {
    // Migration 0062: Unificar rotas e rotas_logisticas
    // 1. Garantir que a collection 'rotas' tenha os campos 'ativa' (bool)
    const rotasCol = app.findCollectionByNameOrId('rotas')
    if (!rotasCol.fields.getByName('ativa')) {
      rotasCol.fields.add(
        new BoolField({
          name: 'ativa',
          required: false,
        }),
      )
      app.save(rotasCol)
    }

    // 2. Mapeamento de rotas_logisticas -> rotas
    // Para cada rota logística existente:
    // Procurar na collection 'rotas' uma com o mesmo contrato_id e nome (tolerando case e espaços)
    // Se não existir, criar em 'rotas'.
    // Manter um mapeamento { [logId]: rotaId }
    const rotasLogRecords = app.findRecordsByFilter('rotas_logisticas', 'id != ""', 'ordem', 0, 0)
    const rotasRecords = app.findRecordsByFilter('rotas', 'id != ""', 'ordem', 0, 0)

    const norm = (s) => (s || '').toString().toLowerCase().trim().replace(/\s+/g, ' ')

    const logToRotaMap = {}

    for (let i = 0; i < rotasLogRecords.length; i++) {
      const rl = rotasLogRecords[i]
      const cId = rl.getString('contrato_id')
      const nomeLog = rl.getString('nome')
      const ordemLog = rl.getInt('ordem') || i + 1
      const ativaLog = rl.getBool('ativa')

      // Procurar em rotas existente
      let matchedRota = null
      for (let j = 0; j < rotasRecords.length; j++) {
        const r = rotasRecords[j]
        if (r.getString('contrato_id') === cId) {
          const rNome = norm(r.getString('nome'))
          const lNome = norm(nomeLog)
          // Ex: "ROTA A" vs "A" ou "A" vs "A"
          if (rNome === lNome || rNome === 'rota ' + lNome || 'rota ' + rNome === lNome) {
            matchedRota = r
            break
          }
        }
      }

      if (!matchedRota) {
        // Criar na collection 'rotas'
        const newR = new Record(rotasCol)
        newR.set('contrato_id', cId)
        newR.set('nome', nomeLog)
        newR.set('ordem', ordemLog)
        newR.set('ativa', ativaLog !== false)
        app.save(newR)
        matchedRota = newR
        rotasRecords.push(newR)
      } else {
        // Atualizar ativa se necessário
        if (matchedRota.getBool('ativa') !== (ativaLog !== false)) {
          matchedRota.set('ativa', ativaLog !== false)
          app.save(matchedRota)
        }
      }

      logToRotaMap[rl.id] = matchedRota.id
    }

    // 3. Atualizar contrato_escolas:
    // Para cada vínculo onde rota_logistica_id está preenchido, apontar rota_id para logToRotaMap[rota_logistica_id]
    // se rota_id estiver vazio ou diferente.
    const ceRecords = app.findRecordsByFilter('contrato_escolas', 'id != ""', '', 0, 0)
    for (let i = 0; i < ceRecords.length; i++) {
      const ce = ceRecords[i]
      const rotaLogId = ce.getString('rota_logistica_id')
      const currentRotaId = ce.getString('rota_id')

      if (rotaLogId && logToRotaMap[rotaLogId]) {
        const targetRotaId = logToRotaMap[rotaLogId]
        if (!currentRotaId || currentRotaId !== targetRotaId) {
          ce.set('rota_id', targetRotaId)
          app.save(ce)
        }
      }
    }

    // 4. Atualizar pedidos:
    // Para pedidos que tinham rota_logistica_id preenchido e rota_id vazio/diferente,
    // sincronizar rota_id para logToRotaMap[rota_logistica_id]
    const pedidosRecords = app.findRecordsByFilter('pedidos', 'id != ""', '', 0, 0)
    for (let i = 0; i < pedidosRecords.length; i++) {
      const p = pedidosRecords[i]
      const rotaLogId = p.getString('rota_logistica_id')
      const currentRotaId = p.getString('rota_id')

      if (rotaLogId && logToRotaMap[rotaLogId]) {
        const targetRotaId = logToRotaMap[rotaLogId]
        if (!currentRotaId) {
          p.set('rota_id', targetRotaId)
          app.save(p)
        }
      }
    }

    // 5. Atualizar paradas_rota:
    // Apontar rota_logistica_id para o id em rotas via SQL direto antes de mudar a FK se necessário
    for (const [logId, rotaId] of Object.entries(logToRotaMap)) {
      app
        .db()
        .newQuery(
          'UPDATE paradas_rota SET rota_logistica_id = {:rId} WHERE rota_logistica_id = {:logId}',
        )
        .bind({ rId: rotaId, logId: logId })
        .execute()
    }

    // 6. Atualizar despachos:
    for (const [logId, rotaId] of Object.entries(logToRotaMap)) {
      app
        .db()
        .newQuery(
          'UPDATE despachos SET rota_logistica_id = {:rId} WHERE rota_logistica_id = {:logId}',
        )
        .bind({ rId: rotaId, logId: logId })
        .execute()
    }

    // 7. Modificar a FK rota_logistica_id em paradas_rota para apontar para 'rotas'
    const paradasCol = app.findCollectionByNameOrId('paradas_rota')
    if (paradasCol.fields.getByName('rota_logistica_id')) {
      paradasCol.fields.removeByName('rota_logistica_id')
    }
    // Atualizar indexes da collection paradas_rota substituindo rota_logistica_id por rota_id
    if (Array.isArray(paradasCol.indexes)) {
      paradasCol.indexes = paradasCol.indexes
        .map((idx) => idx.replace(/rota_logistica_id/g, 'rota_id'))
        .filter((idx) => !idx.includes('rota_logistica_id'))
    }
    // Adicionar rota_id como relation para 'rotas'
    if (!paradasCol.fields.getByName('rota_id')) {
      paradasCol.fields.add(
        new RelationField({
          name: 'rota_id',
          collectionId: rotasCol.id,
          required: true,
          maxSelect: 1,
        }),
      )
    }
    app.save(paradasCol)

    // Preencher rota_id nas paradas_rota
    for (const [logId, rotaId] of Object.entries(logToRotaMap)) {
      app
        .db()
        .newQuery('UPDATE paradas_rota SET rota_id = {:rId} WHERE rota_id IS NULL OR rota_id = ""')
        .bind({ rId: rotaId })
        .execute()
    }
    // Para todas as paradas existentes, preencher rota_id baseado na escola e no contrato_escolas
    app
      .db()
      .newQuery(`
        UPDATE paradas_rota 
        SET rota_id = (
          SELECT ce.rota_id 
          FROM contrato_escolas ce 
          WHERE ce.escola_id = paradas_rota.escola_id 
            AND ce.rota_id IS NOT NULL 
            AND ce.rota_id != '' 
          LIMIT 1
        )
        WHERE rota_id IS NULL OR rota_id = ''
      `)
      .execute()

    // 8. Despachos: atualizar relação de rota para apontar para 'rotas'
    const despachosCol = app.findCollectionByNameOrId('despachos')
    if (despachosCol.fields.getByName('rota_logistica_id')) {
      despachosCol.fields.removeByName('rota_logistica_id')
    }
    if (Array.isArray(despachosCol.indexes)) {
      despachosCol.indexes = despachosCol.indexes
        .map((idx) => idx.replace(/rota_logistica_id/g, 'rota_id'))
        .filter((idx) => !idx.includes('rota_logistica_id'))
    }
    if (!despachosCol.fields.getByName('rota_id')) {
      despachosCol.fields.add(
        new RelationField({
          name: 'rota_id',
          collectionId: rotasCol.id,
          required: false,
          maxSelect: 1,
        }),
      )
    }
    app.save(despachosCol)
    // Preencher rota_id em despachos baseado nos pedidos despachados naquele ciclo/contrato
    app
      .db()
      .newQuery(`
        UPDATE despachos 
        SET rota_id = (
          SELECT p.rota_id 
          FROM pedidos p 
          WHERE p.ciclo_id = despachos.ciclo_id 
            AND p.rota_id IS NOT NULL 
            AND p.rota_id != '' 
          LIMIT 1
        )
        WHERE rota_id IS NULL OR rota_id = ''
      `)
      .execute()

    // 9. Pedidos: remover campo rota_logistica_id redundante
    const pedidosCol = app.findCollectionByNameOrId('pedidos')
    if (pedidosCol.fields.getByName('rota_logistica_id')) {
      pedidosCol.fields.removeByName('rota_logistica_id')
      app.save(pedidosCol)
    }

    // 10. REMOVER campos da tabela contrato_escolas:
    // REMOVER 'rota' (texto) e 'rota_logistica_id' (relação antiga)
    const ceCol = app.findCollectionByNameOrId('contrato_escolas')
    let ceChanged = false
    if (ceCol.fields.getByName('rota')) {
      ceCol.fields.removeByName('rota')
      ceChanged = true
    }
    if (ceCol.fields.getByName('rota_logistica_id')) {
      ceCol.fields.removeByName('rota_logistica_id')
      ceChanged = true
    }
    try {
      ceCol.removeIndex('idx_contrato_escolas_rota_log')
      ceChanged = true
    } catch (_) {}
    if (Array.isArray(ceCol.indexes)) {
      const prevLen = ceCol.indexes.length
      ceCol.indexes = ceCol.indexes.filter((idx) => !idx.includes('rota_logistica_id'))
      if (ceCol.indexes.length !== prevLen) {
        ceChanged = true
      }
    }
    // Adicionar índice para rota_id em contrato_escolas se ainda não tiver
    try {
      ceCol.addIndex('idx_contrato_escolas_rota_id', false, 'rota_id', '')
      ceChanged = true
    } catch (_) {}
    if (ceChanged) {
      app.save(ceCol)
    }

    // 11. Remover a collection rotas_logisticas agora que paradas_rota, despachos, pedidos e contrato_escolas não referenciam mais
    try {
      const rotasLogCol = app.findCollectionByNameOrId('rotas_logisticas')
      app.delete(rotasLogCol)
    } catch (e) {
      console.log('Aviso ao remover rotas_logisticas:', e)
    }
  },
  (app) => {
    // Reversão
  },
)
