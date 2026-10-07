// Endpoint customizado para despachar rota em transação única
// Executa em batch no servidor:
// 1. Identifica escolas da rota pelas paradas_rota
// 2. Busca pedidos pendentes da rota (pelo ciclo ativo se informado)
// 3. Cria registro de despacho (com chamada_id e contrato_id)
// 4. Atualiza pedidos afetados para 'Em Rota'
// Body: { rota_id?: string, rota_logistica_id?: string, chamada_id?: string, contrato_id?: string, ciclo_id?: string, user_id?: string }

routerAdd('POST', '/backend/v1/rotas-logisticas/despachar', (e) => {
  const body = e.requestInfo().body || {}
  const rotaId = body.rota_id || body.rota_logistica_id
  let chamadaId = body.chamada_id || ''
  let contratoId = body.contrato_id || ''
  const cicloId = body.ciclo_id || ''
  const userId = body.user_id || ''

  if (!rotaId) {
    throw new BadRequestError('rota_id é obrigatório')
  }

  let despachoRecord = null
  const updatedOrders = []

  $app.runInTransaction((txApp) => {
    try {
      const rotaRec = txApp.findRecordById('rotas', rotaId)
      if (!chamadaId) {
        chamadaId = rotaRec.getString('chamada_id')
      }
      if (!contratoId) {
        contratoId = rotaRec.getString('contrato_id')
      }
    } catch (_) {}

    const paradas = txApp.findRecordsByFilter(
      'paradas_rota',
      'rota_id = {:rotaId}',
      'ordem',
      0,
      0,
      { rotaId: rotaId },
    )

    const escolaIds = []
    for (let i = 0; i < paradas.length; i++) {
      escolaIds.push(paradas[i].getString('escola_id'))
    }

    // Resolução estrita do ciclo ativo: deve ser o ciclo ativo DA CHAMADA DA ROTA
    let effectiveCicloId = cicloId
    let targetChamadaNome = ''

    if (chamadaId) {
      try {
        const chRec = txApp.findRecordById('chamadas', chamadaId)
        targetChamadaNome = chRec.getString('chamada') || ''
      } catch (_) {}
    }

    // Se ciclo_id não foi fornecido, resolver o ciclo ativo da chamada da rota
    if (!effectiveCicloId) {
      if (chamadaId) {
        const ciclosDaChamada = txApp.findRecordsByFilter(
          'ciclos',
          'chamada_id = {:chId} && status != "fechado" && status != "cancelado"',
          '-created,-data_inicio',
          1,
          0,
          { chId: chamadaId },
        )
        if (ciclosDaChamada.length > 0) {
          effectiveCicloId = ciclosDaChamada[0].id
        }
      } else {
        // Fallback defensivo: se a rota não tiver chamada_id, buscar ciclo não terminal global
        const ciclosAtivos = txApp.findRecordsByFilter(
          'ciclos',
          'status != "fechado" && status != "cancelado"',
          '-created,-data_inicio',
          1,
          0,
        )
        if (ciclosAtivos.length > 0) {
          effectiveCicloId = ciclosAtivos[0].id
        }
      }
    }

    // Se a chamada da rota não possuir ciclo ativo, bloquear com mensagem clara
    if (!effectiveCicloId) {
      const chamadaIdent = targetChamadaNome ? ' "' + targetChamadaNome + '"' : ''
      throw new BadRequestError(
        'Esta rota pertence a uma chamada' +
          chamadaIdent +
          ' que não possui ciclo ativo para despacho.',
      )
    }

    let pedidos = []
    if (effectiveCicloId) {
      pedidos = txApp.findRecordsByFilter(
        'pedidos',
        'status = "Pendente" && ciclo_id = {:cicloId}',
        '-created',
        0,
        0,
        { cicloId: effectiveCicloId },
      )
    } else {
      pedidos = txApp.findRecordsByFilter('pedidos', 'status = "Pendente"', '-created', 0, 0)
    }

    const pedidosParaDespachar = []
    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      const pedRotaId = p.getString('rota_id')
      const pedEscolaId = p.getString('escola_id')

      if (pedRotaId === rotaId || escolaIds.indexOf(pedEscolaId) !== -1) {
        pedidosParaDespachar.push(p)
      }
    }

    if (pedidosParaDespachar.length === 0) {
      throw new BadRequestError(
        'Não há pedidos pendentes no ciclo ativo para as escolas desta rota.',
      )
    }

    const nowIso = new Date().toISOString()

    const despachosCol = txApp.findCollectionByNameOrId('despachos')
    const despRec = new Record(despachosCol)
    if (chamadaId) despRec.set('chamada_id', chamadaId)
    if (contratoId) despRec.set('contrato_id', contratoId)
    if (effectiveCicloId) despRec.set('ciclo_id', effectiveCicloId)
    despRec.set('rota_id', rotaId)
    if (userId) despRec.set('usuario_id', userId)
    despRec.set('data_despacho', nowIso)
    despRec.set('status', 'Em Rota')
    txApp.save(despRec)
    despachoRecord = despRec.publicExport()

    for (let i = 0; i < pedidosParaDespachar.length; i++) {
      const p = pedidosParaDespachar[i]
      p.set('status', 'Em Rota')
      p.set('rota_id', rotaId)
      txApp.save(p)
      updatedOrders.push(p.publicExport())
    }

    // Zerar campos legados de posição do caminhão na rota ao despachar
    try {
      const rotaTarget = txApp.findRecordById('rotas', rotaId)
      rotaTarget.set('caminhao_posicao_atual', 0)
      rotaTarget.set('caminhao_escola_id', '')
      txApp.save(rotaTarget)
    } catch (_) {}

    // Gravar Snapshot Histórico de Despacho (rota_snapshots)
    try {
      const rotaTarget = txApp.findRecordById('rotas', rotaId)
      const rotaNome = rotaTarget.getString('nome') || 'Rota'
      const motoristaId = body.motorista_id || ''

      // Montar lista ordenada de paradas detalhada
      const paradasList = []
      for (let pIdx = 0; pIdx < paradas.length; pIdx++) {
        const pRecord = paradas[pIdx]
        const eId = pRecord.getString('escola_id')
        let eNome = ''
        let eEndereco = ''
        try {
          const escRec = txApp.findRecordById('escolas', eId)
          eNome = escRec.getString('nome') || ''
          eEndereco = escRec.getString('endereco') || ''
        } catch (_) {}

        // Buscar contrato do vínculo se existir
        let contratoNome = ''
        try {
          const vinculos = txApp.findRecordsByFilter(
            'contrato_escolas',
            'escola_id = {:eId} && rota_id = {:rId}',
            '-created',
            1,
            0,
            { eId: eId, rId: rotaId },
          )
          if (vinculos.length > 0 && vinculos[0].getString('contrato_id')) {
            const cRec = txApp.findRecordById('contratos', vinculos[0].getString('contrato_id'))
            contratoNome = cRec.getString('numero') || cRec.getString('numero_chamada') || ''
          }
        } catch (_) {}

        paradasList.push({
          escola_id: eId,
          escola_nome: eNome,
          ordem: pRecord.getInt('ordem') || pIdx + 1,
          endereco: eEndereco,
          contrato: contratoNome,
        })
      }

      // Buscar se já existe despacho_id em rota_despachos ativo
      let rotaDespachoId = ''
      try {
        const rdList = txApp.findRecordsByFilter(
          'rota_despachos',
          'rota_id = {:rId} && ativo = true',
          '-created',
          1,
          0,
          { rId: rotaId },
        )
        if (rdList.length > 0) {
          rotaDespachoId = rdList[0].id
        }
      } catch (_) {}

      // Idempotência: verificar se já existe snapshot deste despacho
      const filterSnap = effectiveCicloId
        ? 'rota_id = {:rId} && ciclo_id = {:cId} && versao_evento = "despacho"'
        : 'rota_id = {:rId} && versao_evento = "despacho"'
      const snapParams = { rId: rotaId }
      if (effectiveCicloId) snapParams.cId = effectiveCicloId

      const snapsExistentes = txApp.findRecordsByFilter(
        'rota_snapshots',
        filterSnap,
        '-snapshot_em,-created',
        1,
        0,
        snapParams,
      )

      const snapshotsCol = txApp.findCollectionByNameOrId('rota_snapshots')
      const snapRec = snapsExistentes.length > 0 ? snapsExistentes[0] : new Record(snapshotsCol)

      snapRec.set('rota_id', rotaId)
      if (effectiveCicloId) snapRec.set('ciclo_id', effectiveCicloId)
      if (chamadaId) snapRec.set('chamada_id', chamadaId)
      if (motoristaId) snapRec.set('motorista_id', motoristaId)
      if (rotaDespachoId) snapRec.set('despacho_id', rotaDespachoId)
      snapRec.set('rota_nome', rotaNome)
      snapRec.set('versao_evento', 'despacho')
      snapRec.set('total_paradas', paradasList.length)
      snapRec.set('total_pedidos', pedidosParaDespachar.length)
      snapRec.set('paradas_snapshot', JSON.stringify(paradasList))
      snapRec.set('snapshot_em', nowIso)
      snapRec.set('observacao', 'Despacho da rota registrado automaticamente')
      txApp.save(snapRec)
    } catch (errSnap) {
      console.warn('Aviso ao registrar rota_snapshots no despacho:', errSnap)
    }
  })

  return e.json(200, {
    success: true,
    despacho: despachoRecord,
    pedidos: updatedOrders,
  })
})

routerAdd('POST', '/backend/v1/rotas/despachar', (e) => {
  const body = e.requestInfo().body || {}
  const rotaId = body.rota_id || body.rota_logistica_id
  let chamadaId = body.chamada_id || ''
  let contratoId = body.contrato_id || ''
  const cicloId = body.ciclo_id || ''
  const userId = body.user_id || ''

  if (!rotaId) {
    throw new BadRequestError('rota_id é obrigatório')
  }

  let despachoRecord = null
  const updatedOrders = []

  $app.runInTransaction((txApp) => {
    try {
      const rotaRec = txApp.findRecordById('rotas', rotaId)
      if (!chamadaId) {
        chamadaId = rotaRec.getString('chamada_id')
      }
      if (!contratoId) {
        contratoId = rotaRec.getString('contrato_id')
      }
    } catch (_) {}

    const paradas = txApp.findRecordsByFilter(
      'paradas_rota',
      'rota_id = {:rotaId}',
      'ordem',
      0,
      0,
      { rotaId: rotaId },
    )

    const escolaIds = []
    for (let i = 0; i < paradas.length; i++) {
      escolaIds.push(paradas[i].getString('escola_id'))
    }

    // Resolução estrita do ciclo ativo: deve ser o ciclo ativo DA CHAMADA DA ROTA
    let effectiveCicloId = cicloId
    let targetChamadaNome = ''

    if (chamadaId) {
      try {
        const chRec = txApp.findRecordById('chamadas', chamadaId)
        targetChamadaNome = chRec.getString('chamada') || ''
      } catch (_) {}
    }

    // Se ciclo_id não foi fornecido, resolver o ciclo ativo da chamada da rota
    if (!effectiveCicloId) {
      if (chamadaId) {
        const ciclosDaChamada = txApp.findRecordsByFilter(
          'ciclos',
          'chamada_id = {:chId} && status != "fechado" && status != "cancelado"',
          '-created,-data_inicio',
          1,
          0,
          { chId: chamadaId },
        )
        if (ciclosDaChamada.length > 0) {
          effectiveCicloId = ciclosDaChamada[0].id
        }
      } else {
        // Fallback defensivo: se a rota não tiver chamada_id, buscar ciclo não terminal global
        const ciclosAtivos = txApp.findRecordsByFilter(
          'ciclos',
          'status != "fechado" && status != "cancelado"',
          '-created,-data_inicio',
          1,
          0,
        )
        if (ciclosAtivos.length > 0) {
          effectiveCicloId = ciclosAtivos[0].id
        }
      }
    }

    // Se a chamada da rota não possuir ciclo ativo, bloquear com mensagem clara
    if (!effectiveCicloId) {
      const chamadaIdent = targetChamadaNome ? ' "' + targetChamadaNome + '"' : ''
      throw new BadRequestError(
        'Esta rota pertence a uma chamada' +
          chamadaIdent +
          ' que não possui ciclo ativo para despacho.',
      )
    }

    let pedidos = []
    if (effectiveCicloId) {
      pedidos = txApp.findRecordsByFilter(
        'pedidos',
        'status = "Pendente" && ciclo_id = {:cicloId}',
        '-created',
        0,
        0,
        { cicloId: effectiveCicloId },
      )
    } else {
      pedidos = txApp.findRecordsByFilter('pedidos', 'status = "Pendente"', '-created', 0, 0)
    }

    const pedidosParaDespachar = []
    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      const pedRotaId = p.getString('rota_id')
      const pedEscolaId = p.getString('escola_id')

      if (pedRotaId === rotaId || escolaIds.indexOf(pedEscolaId) !== -1) {
        pedidosParaDespachar.push(p)
      }
    }

    if (pedidosParaDespachar.length === 0) {
      throw new BadRequestError(
        'Não há pedidos pendentes no ciclo ativo para as escolas desta rota.',
      )
    }

    const nowIso = new Date().toISOString()

    const despachosCol = txApp.findCollectionByNameOrId('despachos')
    const despRec = new Record(despachosCol)
    if (chamadaId) despRec.set('chamada_id', chamadaId)
    if (contratoId) despRec.set('contrato_id', contratoId)
    if (effectiveCicloId) despRec.set('ciclo_id', effectiveCicloId)
    despRec.set('rota_id', rotaId)
    if (userId) despRec.set('usuario_id', userId)
    despRec.set('data_despacho', nowIso)
    despRec.set('status', 'Em Rota')
    txApp.save(despRec)
    despachoRecord = despRec.publicExport()

    for (let i = 0; i < pedidosParaDespachar.length; i++) {
      const p = pedidosParaDespachar[i]
      p.set('status', 'Em Rota')
      p.set('rota_id', rotaId)
      txApp.save(p)
      updatedOrders.push(p.publicExport())
    }

    // Zerar campos legados de posição do caminhão na rota ao despachar
    try {
      const rotaTarget = txApp.findRecordById('rotas', rotaId)
      rotaTarget.set('caminhao_posicao_atual', 0)
      rotaTarget.set('caminhao_escola_id', '')
      txApp.save(rotaTarget)
    } catch (_) {}

    // Gravar Snapshot Histórico de Despacho (rota_snapshots)
    try {
      const rotaTarget = txApp.findRecordById('rotas', rotaId)
      const rotaNome = rotaTarget.getString('nome') || 'Rota'
      const motoristaId = body.motorista_id || ''

      // Montar lista ordenada de paradas detalhada
      const paradasList = []
      for (let pIdx = 0; pIdx < paradas.length; pIdx++) {
        const pRecord = paradas[pIdx]
        const eId = pRecord.getString('escola_id')
        let eNome = ''
        let eEndereco = ''
        try {
          const escRec = txApp.findRecordById('escolas', eId)
          eNome = escRec.getString('nome') || ''
          eEndereco = escRec.getString('endereco') || ''
        } catch (_) {}

        // Buscar contrato do vínculo se existir
        let contratoNome = ''
        try {
          const vinculos = txApp.findRecordsByFilter(
            'contrato_escolas',
            'escola_id = {:eId} && rota_id = {:rId}',
            '-created',
            1,
            0,
            { eId: eId, rId: rotaId },
          )
          if (vinculos.length > 0 && vinculos[0].getString('contrato_id')) {
            const cRec = txApp.findRecordById('contratos', vinculos[0].getString('contrato_id'))
            contratoNome = cRec.getString('numero') || cRec.getString('numero_chamada') || ''
          }
        } catch (_) {}

        paradasList.push({
          escola_id: eId,
          escola_nome: eNome,
          ordem: pRecord.getInt('ordem') || pIdx + 1,
          endereco: eEndereco,
          contrato: contratoNome,
        })
      }

      // Buscar se já existe despacho_id em rota_despachos ativo
      let rotaDespachoId = ''
      try {
        const rdList = txApp.findRecordsByFilter(
          'rota_despachos',
          'rota_id = {:rId} && ativo = true',
          '-created',
          1,
          0,
          { rId: rotaId },
        )
        if (rdList.length > 0) {
          rotaDespachoId = rdList[0].id
        }
      } catch (_) {}

      // Idempotência: verificar se já existe snapshot deste despacho
      const filterSnap = effectiveCicloId
        ? 'rota_id = {:rId} && ciclo_id = {:cId} && versao_evento = "despacho"'
        : 'rota_id = {:rId} && versao_evento = "despacho"'
      const snapParams = { rId: rotaId }
      if (effectiveCicloId) snapParams.cId = effectiveCicloId

      const snapsExistentes = txApp.findRecordsByFilter(
        'rota_snapshots',
        filterSnap,
        '-snapshot_em,-created',
        1,
        0,
        snapParams,
      )

      const snapshotsCol = txApp.findCollectionByNameOrId('rota_snapshots')
      const snapRec = snapsExistentes.length > 0 ? snapsExistentes[0] : new Record(snapshotsCol)

      snapRec.set('rota_id', rotaId)
      if (effectiveCicloId) snapRec.set('ciclo_id', effectiveCicloId)
      if (chamadaId) snapRec.set('chamada_id', chamadaId)
      if (motoristaId) snapRec.set('motorista_id', motoristaId)
      if (rotaDespachoId) snapRec.set('despacho_id', rotaDespachoId)
      snapRec.set('rota_nome', rotaNome)
      snapRec.set('versao_evento', 'despacho')
      snapRec.set('total_paradas', paradasList.length)
      snapRec.set('total_pedidos', pedidosParaDespachar.length)
      snapRec.set('paradas_snapshot', JSON.stringify(paradasList))
      snapRec.set('snapshot_em', nowIso)
      snapRec.set('observacao', 'Despacho da rota registrado automaticamente')
      txApp.save(snapRec)
    } catch (errSnap) {
      console.warn('Aviso ao registrar rota_snapshots no despacho:', errSnap)
    }
  })

  return e.json(200, {
    success: true,
    despacho: despachoRecord,
    pedidos: updatedOrders,
  })
})
