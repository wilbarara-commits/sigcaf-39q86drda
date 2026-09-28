// Endpoint customizado para mover escola entre rotas
// Body: { escola_id: string, origem_rota_id?: string, destino_rota_id: string, target_ordem?: number }

routerAdd('POST', '/backend/v1/rotas-logisticas/mover-escola', (e) => {
  const body = e.requestInfo().body || {}
  const escolaId = body.escola_id
  const origemRotaId = body.origem_rota_id
  const destinoRotaId = body.destino_rota_id
  const targetOrdem = typeof body.target_ordem === 'number' ? body.target_ordem : null

  if (!escolaId) {
    throw new BadRequestError('escola_id é obrigatório.')
  }
  if (!destinoRotaId) {
    throw new BadRequestError('destino_rota_id é obrigatório.')
  }

  let finalParadasOrigem = []
  let finalParadasDestino = []

  $app.runInTransaction((txApp) => {
    const paradasCol = txApp.findCollectionByNameOrId('paradas_rota')

    try {
      txApp.findRecordById('rotas', destinoRotaId)
    } catch (_) {
      throw new BadRequestError('Rota de destino não encontrada: ' + destinoRotaId)
    }

    if (origemRotaId && origemRotaId === destinoRotaId) {
      const paradasMesmaRota = txApp.findRecordsByFilter(
        'paradas_rota',
        'rota_id = {:rotaId}',
        'ordem',
        0,
        0,
        { rotaId: destinoRotaId },
      )

      const currentIndex = paradasMesmaRota.findIndex((p) => p.getString('escola_id') === escolaId)

      if (currentIndex !== -1 && targetOrdem !== null) {
        const item = paradasMesmaRota.splice(currentIndex, 1)[0]
        const destIdx = Math.max(0, Math.min(paradasMesmaRota.length, targetOrdem - 1))
        paradasMesmaRota.splice(destIdx, 0, item)

        for (let i = 0; i < paradasMesmaRota.length; i++) {
          const pRec = paradasMesmaRota[i]
          const novaOrdem = i + 1
          if (pRec.getInt('ordem') !== novaOrdem) {
            pRec.set('ordem', novaOrdem)
            txApp.save(pRec)
          }
          finalParadasDestino.push(pRec.publicExport())
        }
      } else {
        for (let i = 0; i < paradasMesmaRota.length; i++) {
          finalParadasDestino.push(paradasMesmaRota[i].publicExport())
        }
      }

      return
    }

    let paradaOrigem = null
    if (origemRotaId) {
      const existing = txApp.findRecordsByFilter(
        'paradas_rota',
        'rota_id = {:origemId} && escola_id = {:escId}',
        'created',
        1,
        0,
        { origemId: origemRotaId, escId: escolaId },
      )
      if (existing.length > 0) {
        paradaOrigem = existing[0]
      }
    } else {
      const existing = txApp.findRecordsByFilter(
        'paradas_rota',
        'escola_id = {:escId}',
        'created',
        1,
        0,
        { escId: escolaId },
      )
      if (existing.length > 0) {
        paradaOrigem = existing[0]
      }
    }

    const effectiveOrigemId = paradaOrigem ? paradaOrigem.getString('rota_id') : origemRotaId

    if (paradaOrigem) {
      txApp.delete(paradaOrigem)
    }

    if (effectiveOrigemId && effectiveOrigemId !== destinoRotaId) {
      const paradasRestantesOrigem = txApp.findRecordsByFilter(
        'paradas_rota',
        'rota_id = {:origemId}',
        'ordem',
        0,
        0,
        { origemId: effectiveOrigemId },
      )
      for (let i = 0; i < paradasRestantesOrigem.length; i++) {
        const pRec = paradasRestantesOrigem[i]
        const novaOrdem = i + 1
        if (pRec.getInt('ordem') !== novaOrdem) {
          pRec.set('ordem', novaOrdem)
          txApp.save(pRec)
        }
        finalParadasOrigem.push(pRec.publicExport())
      }
    }

    const paradasDestinoAtuais = txApp.findRecordsByFilter(
      'paradas_rota',
      'rota_id = {:destinoId} && escola_id != {:escId}',
      'ordem',
      0,
      0,
      { destinoId: destinoRotaId, escId: escolaId },
    )

    const novaParadaDestino = new Record(paradasCol)
    novaParadaDestino.set('rota_id', destinoRotaId)
    novaParadaDestino.set('escola_id', escolaId)

    let insertIndex = paradasDestinoAtuais.length
    if (targetOrdem !== null && targetOrdem >= 1) {
      insertIndex = Math.max(0, Math.min(paradasDestinoAtuais.length, targetOrdem - 1))
    }

    paradasDestinoAtuais.splice(insertIndex, 0, novaParadaDestino)

    for (let i = 0; i < paradasDestinoAtuais.length; i++) {
      const pRec = paradasDestinoAtuais[i]
      const novaOrdem = i + 1
      pRec.set('ordem', novaOrdem)
      txApp.save(pRec)
      finalParadasDestino.push(pRec.publicExport())
    }

    const vinculosEscola = txApp.findRecordsByFilter(
      'contrato_escolas',
      'escola_id = {:eid}',
      'created',
      0,
      0,
      { eid: escolaId },
    )
    for (let i = 0; i < vinculosEscola.length; i++) {
      const v = vinculosEscola[i]
      v.set('rota_id', destinoRotaId)
      txApp.save(v)
    }

    const pedidosPendentes = txApp.findRecordsByFilter(
      'pedidos',
      'escola_id = {:eid} && status = "Pendente"',
      'created',
      0,
      0,
      { eid: escolaId },
    )
    for (let i = 0; i < pedidosPendentes.length; i++) {
      const ped = pedidosPendentes[i]
      ped.set('rota_id', destinoRotaId)
      txApp.save(ped)
    }
  })

  return e.json(200, {
    success: true,
    escola_id: escolaId,
    origem_rota_id: origemRotaId,
    destino_rota_id: destinoRotaId,
    paradas_origem: finalParadasOrigem,
    paradas_destino: finalParadasDestino,
  })
})

routerAdd('POST', '/backend/v1/rotas/mover-escola', (e) => {
  const body = e.requestInfo().body || {}
  const escolaId = body.escola_id
  const origemRotaId = body.origem_rota_id
  const destinoRotaId = body.destino_rota_id
  const targetOrdem = typeof body.target_ordem === 'number' ? body.target_ordem : null

  if (!escolaId) {
    throw new BadRequestError('escola_id é obrigatório.')
  }
  if (!destinoRotaId) {
    throw new BadRequestError('destino_rota_id é obrigatório.')
  }

  let finalParadasOrigem = []
  let finalParadasDestino = []

  $app.runInTransaction((txApp) => {
    const paradasCol = txApp.findCollectionByNameOrId('paradas_rota')

    try {
      txApp.findRecordById('rotas', destinoRotaId)
    } catch (_) {
      throw new BadRequestError('Rota de destino não encontrada: ' + destinoRotaId)
    }

    if (origemRotaId && origemRotaId === destinoRotaId) {
      const paradasMesmaRota = txApp.findRecordsByFilter(
        'paradas_rota',
        'rota_id = {:rotaId}',
        'ordem',
        0,
        0,
        { rotaId: destinoRotaId },
      )

      const currentIndex = paradasMesmaRota.findIndex((p) => p.getString('escola_id') === escolaId)

      if (currentIndex !== -1 && targetOrdem !== null) {
        const item = paradasMesmaRota.splice(currentIndex, 1)[0]
        const destIdx = Math.max(0, Math.min(paradasMesmaRota.length, targetOrdem - 1))
        paradasMesmaRota.splice(destIdx, 0, item)

        for (let i = 0; i < paradasMesmaRota.length; i++) {
          const pRec = paradasMesmaRota[i]
          const novaOrdem = i + 1
          if (pRec.getInt('ordem') !== novaOrdem) {
            pRec.set('ordem', novaOrdem)
            txApp.save(pRec)
          }
          finalParadasDestino.push(pRec.publicExport())
        }
      } else {
        for (let i = 0; i < paradasMesmaRota.length; i++) {
          finalParadasDestino.push(paradasMesmaRota[i].publicExport())
        }
      }

      return
    }

    let paradaOrigem = null
    if (origemRotaId) {
      const existing = txApp.findRecordsByFilter(
        'paradas_rota',
        'rota_id = {:origemId} && escola_id = {:escId}',
        'created',
        1,
        0,
        { origemId: origemRotaId, escId: escolaId },
      )
      if (existing.length > 0) {
        paradaOrigem = existing[0]
      }
    } else {
      const existing = txApp.findRecordsByFilter(
        'paradas_rota',
        'escola_id = {:escId}',
        'created',
        1,
        0,
        { escId: escolaId },
      )
      if (existing.length > 0) {
        paradaOrigem = existing[0]
      }
    }

    const effectiveOrigemId = paradaOrigem ? paradaOrigem.getString('rota_id') : origemRotaId

    if (paradaOrigem) {
      txApp.delete(paradaOrigem)
    }

    if (effectiveOrigemId && effectiveOrigemId !== destinoRotaId) {
      const paradasRestantesOrigem = txApp.findRecordsByFilter(
        'paradas_rota',
        'rota_id = {:origemId}',
        'ordem',
        0,
        0,
        { origemId: effectiveOrigemId },
      )
      for (let i = 0; i < paradasRestantesOrigem.length; i++) {
        const pRec = paradasRestantesOrigem[i]
        const novaOrdem = i + 1
        if (pRec.getInt('ordem') !== novaOrdem) {
          pRec.set('ordem', novaOrdem)
          txApp.save(pRec)
        }
        finalParadasOrigem.push(pRec.publicExport())
      }
    }

    const paradasDestinoAtuais = txApp.findRecordsByFilter(
      'paradas_rota',
      'rota_id = {:destinoId} && escola_id != {:escId}',
      'ordem',
      0,
      0,
      { destinoId: destinoRotaId, escId: escolaId },
    )

    const novaParadaDestino = new Record(paradasCol)
    novaParadaDestino.set('rota_id', destinoRotaId)
    novaParadaDestino.set('escola_id', escolaId)

    let insertIndex = paradasDestinoAtuais.length
    if (targetOrdem !== null && targetOrdem >= 1) {
      insertIndex = Math.max(0, Math.min(paradasDestinoAtuais.length, targetOrdem - 1))
    }

    paradasDestinoAtuais.splice(insertIndex, 0, novaParadaDestino)

    for (let i = 0; i < paradasDestinoAtuais.length; i++) {
      const pRec = paradasDestinoAtuais[i]
      const novaOrdem = i + 1
      pRec.set('ordem', novaOrdem)
      txApp.save(pRec)
      finalParadasDestino.push(pRec.publicExport())
    }

    const vinculosEscola = txApp.findRecordsByFilter(
      'contrato_escolas',
      'escola_id = {:eid}',
      'created',
      0,
      0,
      { eid: escolaId },
    )
    for (let i = 0; i < vinculosEscola.length; i++) {
      const v = vinculosEscola[i]
      v.set('rota_id', destinoRotaId)
      txApp.save(v)
    }

    const pedidosPendentes = txApp.findRecordsByFilter(
      'pedidos',
      'escola_id = {:eid} && status = "Pendente"',
      'created',
      0,
      0,
      { eid: escolaId },
    )
    for (let i = 0; i < pedidosPendentes.length; i++) {
      const ped = pedidosPendentes[i]
      ped.set('rota_id', destinoRotaId)
      txApp.save(ped)
    }
  })

  return e.json(200, {
    success: true,
    escola_id: escolaId,
    origem_rota_id: origemRotaId,
    destino_rota_id: destinoRotaId,
    paradas_origem: finalParadasOrigem,
    paradas_destino: finalParadasDestino,
  })
})
