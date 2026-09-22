// Hook para mover uma escola (parada) de uma rota para outra rota
// POST /backend/v1/rotas-logisticas/mover-escola (compatibilidade)
// POST /backend/v1/rotas/mover-escola
// Body: {
//   escola_id: string,
//   origem_rota_id: string,
//   destino_rota_id: string,
//   target_ordem?: number // se informado, insere nesta posição (1-indexed), senão vai para o final
// }

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
  let contratoId = ''

  $app.runInTransaction((txApp) => {
    const paradasCol = txApp.findCollectionByNameOrId('paradas_rota')
    const contratoEscolasCol = txApp.findCollectionByNameOrId('contrato_escolas')

    // Verificar se a rota destino existe na coleção 'rotas'
    let destinoRotaRecord = null
    try {
      destinoRotaRecord = txApp.findRecordById('rotas', destinoRotaId)
    } catch (_) {
      throw new BadRequestError('Rota de destino não encontrada: ' + destinoRotaId)
    }
    contratoId = destinoRotaRecord.getString('contrato_id')

    // Se origem e destino forem a mesma rota: reordenar internamente se targetOrdem foi informado
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

    // Caso: rota de origem informada ou busca automática de parada existente desta escola
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

    // 1. Remover parada da rota de origem
    if (paradaOrigem) {
      txApp.delete(paradaOrigem)
    }

    // Renumerar paradas da rota de origem (sem buracos: 1, 2, 3...)
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

    // 2. Obter paradas atuais da rota de destino (sem a escola que está sendo movida)
    const paradasDestinoAtuais = txApp.findRecordsByFilter(
      'paradas_rota',
      'rota_id = {:destinoId} && escola_id != {:escId}',
      'ordem',
      0,
      0,
      { destinoId: destinoRotaId, escId: escolaId },
    )

    // Criar novo record de parada na rota de destino
    const novaParadaDestino = new Record(paradasCol)
    novaParadaDestino.set('rota_id', destinoRotaId)
    novaParadaDestino.set('escola_id', escolaId)

    // Inserir na posição desejada (targetOrdem) ou ao final
    let insertIndex = paradasDestinoAtuais.length
    if (targetOrdem !== null && targetOrdem >= 1) {
      insertIndex = Math.max(0, Math.min(paradasDestinoAtuais.length, targetOrdem - 1))
    }

    paradasDestinoAtuais.splice(insertIndex, 0, novaParadaDestino)

    // Salvar todas as paradas do destino renumeradas: 1, 2, 3...
    for (let i = 0; i < paradasDestinoAtuais.length; i++) {
      const pRec = paradasDestinoAtuais[i]
      const novaOrdem = i + 1
      pRec.set('ordem', novaOrdem)
      txApp.save(pRec)
      finalParadasDestino.push(pRec.publicExport())
    }

    // 3. Atualizar contrato_escolas para a escola com destinoRotaId (apenas rota_id)
    if (contratoId) {
      const vinculos = txApp.findRecordsByFilter(
        'contrato_escolas',
        'contrato_id = {:cid} && escola_id = {:eid}',
        'created',
        1,
        0,
        { cid: contratoId, eid: escolaId },
      )
      if (vinculos.length > 0) {
        const v = vinculos[0]
        v.set('rota_id', destinoRotaId)
        txApp.save(v)
      } else {
        const novoVinculo = new Record(contratoEscolasCol)
        novoVinculo.set('contrato_id', contratoId)
        novoVinculo.set('escola_id', escolaId)
        novoVinculo.set('rota_id', destinoRotaId)
        txApp.save(novoVinculo)
      }
    }

    // 4. Atualizar pedidos Pendentes desta escola para a rota de destino
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
  let contratoId = ''

  $app.runInTransaction((txApp) => {
    const paradasCol = txApp.findCollectionByNameOrId('paradas_rota')
    const contratoEscolasCol = txApp.findCollectionByNameOrId('contrato_escolas')

    // Verificar se a rota destino existe na coleção 'rotas'
    let destinoRotaRecord = null
    try {
      destinoRotaRecord = txApp.findRecordById('rotas', destinoRotaId)
    } catch (_) {
      throw new BadRequestError('Rota de destino não encontrada: ' + destinoRotaId)
    }
    contratoId = destinoRotaRecord.getString('contrato_id')

    // Se origem e destino forem a mesma rota: reordenar internamente se targetOrdem foi informado
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

    // Caso: rota de origem informada ou busca automática de parada existente desta escola
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

    // 1. Remover parada da rota de origem
    if (paradaOrigem) {
      txApp.delete(paradaOrigem)
    }

    // Renumerar paradas da rota de origem (sem buracos: 1, 2, 3...)
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

    // 2. Obter paradas atuais da rota de destino (sem a escola que está sendo movida)
    const paradasDestinoAtuais = txApp.findRecordsByFilter(
      'paradas_rota',
      'rota_id = {:destinoId} && escola_id != {:escId}',
      'ordem',
      0,
      0,
      { destinoId: destinoRotaId, escId: escolaId },
    )

    // Criar novo record de parada na rota de destino
    const novaParadaDestino = new Record(paradasCol)
    novaParadaDestino.set('rota_id', destinoRotaId)
    novaParadaDestino.set('escola_id', escolaId)

    // Inserir na posição desejada (targetOrdem) ou ao final
    let insertIndex = paradasDestinoAtuais.length
    if (targetOrdem !== null && targetOrdem >= 1) {
      insertIndex = Math.max(0, Math.min(paradasDestinoAtuais.length, targetOrdem - 1))
    }

    paradasDestinoAtuais.splice(insertIndex, 0, novaParadaDestino)

    // Salvar todas as paradas do destino renumeradas: 1, 2, 3...
    for (let i = 0; i < paradasDestinoAtuais.length; i++) {
      const pRec = paradasDestinoAtuais[i]
      const novaOrdem = i + 1
      pRec.set('ordem', novaOrdem)
      txApp.save(pRec)
      finalParadasDestino.push(pRec.publicExport())
    }

    // 3. Atualizar contrato_escolas para a escola com destinoRotaId (apenas rota_id)
    if (contratoId) {
      const vinculos = txApp.findRecordsByFilter(
        'contrato_escolas',
        'contrato_id = {:cid} && escola_id = {:eid}',
        'created',
        1,
        0,
        { cid: contratoId, eid: escolaId },
      )
      if (vinculos.length > 0) {
        const v = vinculos[0]
        v.set('rota_id', destinoRotaId)
        txApp.save(v)
      } else {
        const novoVinculo = new Record(contratoEscolasCol)
        novoVinculo.set('contrato_id', contratoId)
        novoVinculo.set('escola_id', escolaId)
        novoVinculo.set('rota_id', destinoRotaId)
        txApp.save(novoVinculo)
      }
    }

    // 4. Atualizar pedidos Pendentes desta escola para a rota de destino
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
