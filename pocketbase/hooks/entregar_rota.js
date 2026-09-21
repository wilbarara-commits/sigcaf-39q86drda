// Hook para confirmação de entrega de rota inteira em transação atômica única
// POST /backend/v1/rotas-logisticas/entregar
// Body: { rota_logistica_id: string, user_id?: string }
// Atualiza pedidos 'Em Rota' para 'Entregue' e atualiza despachos ativos.

routerAdd('POST', '/backend/v1/rotas-logisticas/entregar', (e) => {
  const body = e.requestInfo().body || {}
  const rotaLogisticaId = body.rota_logistica_id
  const userId = body.user_id || ''

  if (!rotaLogisticaId) {
    throw new BadRequestError('rota_logistica_id é obrigatório')
  }

  const updatedOrders = []

  $app.runInTransaction((txApp) => {
    // 1. Identificar escolas da rota logística
    const paradas = txApp.findRecordsByFilter(
      'paradas_rota',
      'rota_logistica_id = {:rotaId}',
      'ordem',
      0,
      0,
      { rotaId: rotaLogisticaId },
    )

    const escolaIds = []
    for (let i = 0; i < paradas.length; i++) {
      escolaIds.push(paradas[i].getString('escola_id'))
    }

    // 2. Pedidos com status 'Em Rota'
    const pedidos = txApp.findRecordsByFilter('pedidos', 'status = "Em Rota"', '-created', 0, 0)

    const pedidosParaEntregar = []
    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      const pedRotaLogId = p.getString('rota_logistica_id')
      const pedEscolaId = p.getString('escola_id')

      if (pedRotaLogId === rotaLogisticaId || escolaIds.indexOf(pedEscolaId) !== -1) {
        pedidosParaEntregar.push(p)
      }
    }

    if (pedidosParaEntregar.length === 0) {
      throw new BadRequestError('Nenhum pedido "Em Rota" encontrado para esta rota.')
    }

    const nowIso = new Date().toISOString()

    // 3. Atualizar cada pedido para 'Entregue'
    for (let i = 0; i < pedidosParaEntregar.length; i++) {
      const p = pedidosParaEntregar[i]
      p.set('status', 'Entregue')
      p.set('entregue_em', nowIso)
      if (userId) {
        p.set('entregue_por', userId)
      }
      txApp.save(p)
      updatedOrders.push(p.publicExport())
    }

    // 4. Atualizar status dos despachos ativos da rota para 'Entregue'
    const despachosAtivos = txApp.findRecordsByFilter(
      'despachos',
      'rota_logistica_id = {:rId} && status = "Em Rota"',
      '-data_despacho',
      0,
      0,
      { rId: rotaLogisticaId },
    )
    for (let i = 0; i < despachosAtivos.length; i++) {
      const d = despachosAtivos[i]
      d.set('status', 'Entregue')
      txApp.save(d)
    }
  })

  return e.json(200, {
    success: true,
    pedidos: updatedOrders,
    produtos: [],
  })
})
