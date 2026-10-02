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
  })

  return e.json(200, {
    success: true,
    despacho: despachoRecord,
    pedidos: updatedOrders,
  })
})
