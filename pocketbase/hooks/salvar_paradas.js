// Hook para salvar sequenciamento de paradas da rota em transação única
// POST /backend/v1/rotas-logisticas/salvar-paradas
// Body: { rota_logistica_id: string, paradas: Array<{ escola_id: string, ordem: number }> }

routerAdd('POST', '/backend/v1/rotas-logisticas/salvar-paradas', (e) => {
  const body = e.requestInfo().body || {}
  const rotaLogisticaId = body.rota_logistica_id
  const paradas = body.paradas || []

  if (!rotaLogisticaId) {
    throw new BadRequestError('rota_logistica_id é obrigatório')
  }

  const savedParadas = []

  $app.runInTransaction((txApp) => {
    const paradasCol = txApp.findCollectionByNameOrId('paradas_rota')

    for (let i = 0; i < paradas.length; i++) {
      const p = paradas[i]
      const escolaId = p.escola_id
      const ordem = p.ordem || i + 1

      // Verificar se já existe parada desta escola na rota
      const existing = txApp.findRecordsByFilter(
        'paradas_rota',
        'rota_logistica_id = {:rotaId} && escola_id = {:escId}',
        'created',
        1,
        0,
        { rotaId: rotaLogisticaId, escId: escolaId },
      )

      let record = null
      if (existing.length > 0) {
        record = existing[0]
        record.set('ordem', ordem)
      } else {
        record = new Record(paradasCol)
        record.set('rota_logistica_id', rotaLogisticaId)
        record.set('escola_id', escolaId)
        record.set('ordem', ordem)
      }

      txApp.save(record)
      savedParadas.push(record.publicExport())
    }
  })

  return e.json(200, {
    success: true,
    paradas: savedParadas,
  })
})
