// Hook para criação de pedidos com itens em transação atômica única ou lote
// POST /backend/v1/pedidos/batch-create
// Body: { pedidos: Array<{ numero, escola_id, ciclo_id, origem, rota_id, rota_logistica_id, validacao, data_prevista, status, itens: [...] }> }

routerAdd('POST', '/backend/v1/pedidos/batch-create', (e) => {
  const body = e.requestInfo().body || {}
  const pedidosInput = body.pedidos || []

  if (!pedidosInput || !Array.isArray(pedidosInput) || pedidosInput.length === 0) {
    throw new BadRequestError('Nenhum pedido fornecido para criação em lote.')
  }

  const createdOrders = []

  $app.runInTransaction((txApp) => {
    const pedidosCol = txApp.findCollectionByNameOrId('pedidos')
    const itensCol = txApp.findCollectionByNameOrId('pedido_itens')

    for (let i = 0; i < pedidosInput.length; i++) {
      const pData = pedidosInput[i]
      const validItens = (pData.itens || []).filter((it) => {
        return (
          it &&
          it.produto_id &&
          typeof it.quantidade === 'number' &&
          !isNaN(it.quantidade) &&
          it.quantidade > 0
        )
      })

      // Regra: se não há itens válidos > 0, não cria pedido vazio
      if (validItens.length === 0) {
        continue
      }

      const pRecord = new Record(pedidosCol)
      pRecord.set('numero', pData.numero || 'IMP-' + $security.randomString(6).toUpperCase())
      pRecord.set('escola_id', pData.escola_id)
      if (pData.ciclo_id) pRecord.set('ciclo_id', pData.ciclo_id)
      pRecord.set('origem', pData.origem || 'excel')
      if (pData.rota_id) pRecord.set('rota_id', pData.rota_id)
      if (pData.rota_logistica_id) pRecord.set('rota_logistica_id', pData.rota_logistica_id)
      if (pData.validacao) pRecord.set('validacao', pData.validacao)
      pRecord.set('data_prevista', pData.data_prevista || new Date().toISOString())
      pRecord.set('status', pData.status || 'Pendente')

      txApp.save(pRecord)

      // Criar itens do pedido dentro da mesma transação
      for (let j = 0; j < validItens.length; j++) {
        const item = validItens[j]
        const itRecord = new Record(itensCol)
        itRecord.set('pedido_id', pRecord.id)
        itRecord.set('produto_id', item.produto_id)
        itRecord.set('quantidade', item.quantidade)
        itRecord.set(
          'preco_unitario',
          typeof item.preco_unitario === 'number' ? item.preco_unitario : 0,
        )

        txApp.save(itRecord)
      }

      createdOrders.push({
        id: pRecord.id,
        numero: pRecord.getString('numero'),
        escola_id: pRecord.getString('escola_id'),
        itens_count: validItens.length,
      })
    }
  })

  return e.json(200, {
    success: true,
    totalCreated: createdOrders.length,
    pedidos: createdOrders,
  })
})
