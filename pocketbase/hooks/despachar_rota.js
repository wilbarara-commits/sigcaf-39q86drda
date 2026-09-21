// Hook para despacho de rota inteira em transação atômica única
// POST /backend/v1/rotas-logisticas/despachar
// Body: { rota_logistica_id: string, contrato_id: string, ciclo_id?: string, user_id?: string }
// Atualiza pedidos pendentes da rota para 'Em Rota' e cria registro de despacho.

routerAdd('POST', '/backend/v1/rotas-logisticas/despachar', (e) => {
  const body = e.requestInfo().body || {}
  const rotaLogisticaId = body.rota_logistica_id
  const contratoId = body.contrato_id
  const cicloId = body.ciclo_id || ''
  const userId = body.user_id || ''

  if (!rotaLogisticaId) {
    throw new BadRequestError('rota_logistica_id é obrigatório')
  }

  let despachoRecord = null
  const updatedOrders = []

  $app.runInTransaction((txApp) => {
    // 1. Identificar escolas da rota logística pelas paradas_rota
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

    // 2. Buscar pedidos pendentes da rota
    // Critérios: status = 'Pendente' E (rota_logistica_id = rotaLogisticaId OU escola_id em escolaIds)
    let pedidos = []
    if (cicloId) {
      pedidos = txApp.findRecordsByFilter(
        'pedidos',
        'status = "Pendente" && ciclo_id = {:cicloId}',
        '-created',
        0,
        0,
        { cicloId: cicloId },
      )
    } else {
      pedidos = txApp.findRecordsByFilter('pedidos', 'status = "Pendente"', '-created', 0, 0)
    }

    const pedidosParaDespachar = []
    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      const pedRotaLogId = p.getString('rota_logistica_id')
      const pedEscolaId = p.getString('escola_id')

      if (pedRotaLogId === rotaLogisticaId || escolaIds.indexOf(pedEscolaId) !== -1) {
        pedidosParaDespachar.push(p)
      }
    }

    if (pedidosParaDespachar.length === 0) {
      throw new BadRequestError('Nenhum pedido pendente encontrado para esta rota.')
    }

    const nowIso = new Date().toISOString()

    // 3. Criar registro de despacho
    const despachosCol = txApp.findCollectionByNameOrId('despachos')
    const despRec = new Record(despachosCol)
    despRec.set('contrato_id', contratoId)
    if (cicloId) despRec.set('ciclo_id', cicloId)
    despRec.set('rota_logistica_id', rotaLogisticaId)
    if (userId) despRec.set('usuario_id', userId)
    despRec.set('data_despacho', nowIso)
    despRec.set('status', 'Em Rota')
    txApp.save(despRec)
    despachoRecord = despRec.publicExport()

    // 4. Atualizar pedidos em lote para 'Em Rota'
    for (let i = 0; i < pedidosParaDespachar.length; i++) {
      const p = pedidosParaDespachar[i]
      p.set('status', 'Em Rota')
      p.set('rota_logistica_id', rotaLogisticaId)
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
