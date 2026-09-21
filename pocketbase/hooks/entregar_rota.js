// Hook para confirmação de entrega de rota inteira em transação atômica única
// POST /backend/v1/rotas-logisticas/entregar
// Body: { rota_logistica_id: string, user_id?: string }
// Atualiza pedidos 'Em Rota' para 'Entregue', baixa estoque dos produtos, atualiza despachos ativos.

routerAdd('POST', '/backend/v1/rotas-logisticas/entregar', (e) => {
  const body = e.requestInfo().body || {}
  const rotaLogisticaId = body.rota_logistica_id
  const userId = body.user_id || ''

  if (!rotaLogisticaId) {
    throw new BadRequestError('rota_logistica_id é obrigatório')
  }

  const updatedOrders = []
  const updatedProducts = []

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
    const pedidoIds = []
    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      const pedRotaLogId = p.getString('rota_logistica_id')
      const pedEscolaId = p.getString('escola_id')

      if (pedRotaLogId === rotaLogisticaId || escolaIds.indexOf(pedEscolaId) !== -1) {
        pedidosParaEntregar.push(p)
        pedidoIds.push(p.id)
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

    // 4. Buscar pedido_itens dos pedidos para dar baixa de estoque consolidada
    const estoqueBaixas = {}
    for (let i = 0; i < pedidoIds.length; i++) {
      const pId = pedidoIds[i]
      const itens = txApp.findRecordsByFilter(
        'pedido_itens',
        'pedido_id = {:pId}',
        'created',
        0,
        0,
        { pId: pId },
      )
      for (let j = 0; j < itens.length; j++) {
        const it = itens[j]
        const prodId = it.getString('produto_id')
        const qtd = it.getFloat('quantidade') || 0
        if (prodId && qtd > 0) {
          estoqueBaixas[prodId] = (estoqueBaixas[prodId] || 0) + qtd
        }
      }
    }

    // 5. Baixar estoque dos produtos
    const prodIds = Object.keys(estoqueBaixas)
    for (let i = 0; i < prodIds.length; i++) {
      const prId = prodIds[i]
      const qtdBaixar = estoqueBaixas[prId]
      try {
        const prodRec = txApp.findRecordById('produtos', prId)
        const currentEstoque = prodRec.getFloat('estoque') || 0
        const novoEstoque = Math.max(0, currentEstoque - qtdBaixar)
        prodRec.set('estoque', novoEstoque)
        txApp.save(prodRec)
        updatedProducts.push(prodRec.publicExport())
      } catch (err) {
        // se produto não existir, ignora
      }
    }

    // 6. Atualizar status dos despachos ativos da rota para 'Entregue'
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
    produtos: updatedProducts,
  })
})
