// Hook para confirmação de entrega de rota inteira em transação atômica única
// POST /backend/v1/rotas-logisticas/entregar (mantido para compatibilidade)
// POST /backend/v1/rotas/entregar
// Body: { rota_id?: string, rota_logistica_id?: string, user_id?: string, observacao?: string }
// Atualiza pedidos 'Em Rota' para 'Entregue' e atualiza despachos ativos.

routerAdd('POST', '/backend/v1/rotas-logisticas/entregar', (e) => {
  const body = e.requestInfo().body || {}
  const rotaId = body.rota_id || body.rota_logistica_id
  const userId = body.user_id || ''
  const observacao = (body.observacao || '').trim()

  if (!rotaId) {
    throw new BadRequestError('rota_id é obrigatório')
  }

  const updatedOrders = []

  $app.runInTransaction((txApp) => {
    // 1. Identificar escolas da rota
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

    // 2. Pedidos com status 'Em Rota'
    const pedidos = txApp.findRecordsByFilter('pedidos', 'status = "Em Rota"', '-created', 0, 0)

    const pedidosParaEntregar = []
    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      const pedRotaId = p.getString('rota_id')
      const pedEscolaId = p.getString('escola_id')

      if (pedRotaId === rotaId || escolaIds.indexOf(pedEscolaId) !== -1) {
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
      if (observacao) {
        p.set('observacao_entrega', observacao)
      }
      txApp.save(p)
      updatedOrders.push(p.publicExport())
    }

    // 4. Atualizar status dos despachos ativos da rota para 'Entregue' (e salvar observação)
    try {
      const despachosAtivos = txApp.findRecordsByFilter(
        'despachos',
        'rota_id = {:rId} && status = "Em Rota"',
        '-data_despacho',
        0,
        0,
        { rId: rotaId },
      )
      for (let i = 0; i < despachosAtivos.length; i++) {
        const d = despachosAtivos[i]
        d.set('status', 'Entregue')
        if (observacao) {
          d.set('observacao', observacao)
        }
        txApp.save(d)
      }
    } catch (errDesp) {
      console.warn('Aviso ao atualizar despachos legados para Entregue:', errDesp)
    }

    // Também encerrar despachos ativos na collection rota_despachos (campo ativo: bool = false)
    try {
      const rdAtivos = txApp.findRecordsByFilter(
        'rota_despachos',
        'rota_id = {:rId} && ativo = true',
        '-created',
        0,
        0,
        { rId: rotaId },
      )
      for (let j = 0; j < rdAtivos.length; j++) {
        const rd = rdAtivos[j]
        rd.set('ativo', false)
        rd.set('renovado_em', nowIso)
        if (observacao) {
          rd.set('observacao', observacao)
        }
        txApp.save(rd)
      }
    } catch (errRd) {
      console.warn('Aviso ao desativar rota_despachos na entrega:', errRd)
    }

    // 5. Limpar marcador do caminhão na rota (caminhao_escola_id e caminhao_posicao_atual)
    try {
      const rotaRec = txApp.findRecordById('rotas_logisticas', rotaId)
      rotaRec.set('caminhao_escola_id', '')
      rotaRec.set('caminhao_posicao_atual', 0)
      txApp.save(rotaRec)
    } catch (_) {
      // Se não for rotas_logisticas, tenta em 'rotas'
      try {
        const rRec = txApp.findRecordById('rotas', rotaId)
        rRec.set('caminhao_escola_id', '')
        rRec.set('caminhao_posicao_atual', 0)
        txApp.save(rRec)
      } catch (__) {}
    }

    // 6. CAMADA DE RETENÇÃO HISTÓRICA POR CICLO:
    // (a) Gravar/atualizar registro em rota_snapshots com versao_evento = 'fechamento'
    // (b) Gravar registros em entrega_comprovantes para cada pedido entregue
    try {
      // Resolver dados da rota (nome, chamada_id, ciclo_id, motorista_id, despacho_id)
      let rotaNome = 'Rota'
      let chamadaId = ''
      try {
        const rRec = txApp.findRecordById('rotas', rotaId)
        rotaNome = rRec.getString('nome') || 'Rota'
        chamadaId = rRec.getString('chamada_id') || ''
      } catch (_) {}

      // Ciclo ativo ou ciclo dos pedidos entregues
      let cicloId = ''
      for (let pIdx = 0; pIdx < pedidosParaEntregar.length; pIdx++) {
        const cId = pedidosParaEntregar[pIdx].getString('ciclo_id')
        if (cId) {
          cicloId = cId
          break
        }
      }

      // Despacho e motorista da rota
      let despachoId = ''
      let motoristaId = ''
      try {
        const rdList = txApp.findRecordsByFilter(
          'rota_despachos',
          'rota_id = {:rId}',
          '-created',
          1,
          0,
          { rId: rotaId },
        )
        if (rdList.length > 0) {
          despachoId = rdList[0].id
          motoristaId = rdList[0].getString('motorista_id') || ''
          if (!cicloId) cicloId = rdList[0].getString('ciclo_id') || ''
          if (!chamadaId) chamadaId = rdList[0].getString('chamada_id') || ''
        }
      } catch (_) {}

      // Lista ordenada de paradas detalhada
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

      // (a) Gravar/atualizar em rota_snapshots (versao_evento = 'fechamento')
      const snapshotsCol = txApp.findCollectionByNameOrId('rota_snapshots')
      const filterSnap = cicloId
        ? 'rota_id = {:rId} && ciclo_id = {:cId} && versao_evento = "fechamento"'
        : 'rota_id = {:rId} && versao_evento = "fechamento"'
      const snapParams = { rId: rotaId }
      if (cicloId) snapParams.cId = cicloId

      const snapsExistentes = txApp.findRecordsByFilter(
        'rota_snapshots',
        filterSnap,
        '-snapshot_em,-created',
        1,
        0,
        snapParams,
      )

      const snapRec = snapsExistentes.length > 0 ? snapsExistentes[0] : new Record(snapshotsCol)
      snapRec.set('rota_id', rotaId)
      if (cicloId) snapRec.set('ciclo_id', cicloId)
      if (chamadaId) snapRec.set('chamada_id', chamadaId)
      if (motoristaId) snapRec.set('motorista_id', motoristaId)
      if (despachoId) snapRec.set('despacho_id', despachoId)
      snapRec.set('rota_nome', rotaNome)
      snapRec.set('versao_evento', 'fechamento')
      snapRec.set('total_paradas', paradasList.length)
      snapRec.set('total_pedidos', pedidosParaEntregar.length)
      snapRec.set('paradas_snapshot', JSON.stringify(paradasList))
      snapRec.set('snapshot_em', nowIso)
      if (observacao) snapRec.set('observacao', observacao)
      txApp.save(snapRec)

      // (b) Gravar registros em entrega_comprovantes para cada pedido entregue da rota
      const comprovantesCol = txApp.findCollectionByNameOrId('entrega_comprovantes')
      for (let i = 0; i < pedidosParaEntregar.length; i++) {
        const ped = pedidosParaEntregar[i]
        const pId = ped.id
        const escId = ped.getString('escola_id')
        const pedCicloId = ped.getString('ciclo_id') || cicloId

        // Verificar se já existe comprovante para este pedido
        const compsExist = txApp.findRecordsByFilter(
          'entrega_comprovantes',
          'pedido_id = {:pId}',
          '',
          1,
          0,
          { pId: pId },
        )

        // Buscar se existe entrega confirmada pelo motorista nesta escola
        let compMotorista = []
        if (pedCicloId) {
          compMotorista = txApp.findRecordsByFilter(
            'entrega_comprovantes',
            'escola_id = {:eId} && ciclo_id = {:cId} && origem = "portal_motorista"',
            '-confirmado_em',
            1,
            0,
            { eId: escId, cId: pedCicloId },
          )
        }
        if (compMotorista.length === 0) {
          // Fallback por registro_id em entrega_registros
          const regList = txApp.findRecordsByFilter(
            'entrega_registros',
            'escola_id = {:eId} && rota_id = {:rId}',
            '-confirmado_em,-created',
            1,
            0,
            { eId: escId, rId: rotaId },
          )
          if (regList.length > 0) {
            compMotorista = regList
          }
        }

        // Buscar nome da escola
        let escNome = ''
        try {
          const escObj = txApp.findRecordById('escolas', escId)
          escNome = escObj.getString('nome') || ''
        } catch (_) {}

        const cRec = compsExist.length > 0 ? compsExist[0] : new Record(comprovantesCol)
        cRec.set('escola_id', escId)
        cRec.set('escola_nome', escNome)
        cRec.set('rota_id', rotaId)
        if (pedCicloId) cRec.set('ciclo_id', pedCicloId)
        if (chamadaId) cRec.set('chamada_id', chamadaId)
        cRec.set('pedido_id', pId)
        cRec.set('confirmado_em', ped.getString('entregue_em') || nowIso)
        if (observacao) {
          cRec.set('observacao', observacao)
        } else if (ped.getString('observacao_entrega')) {
          cRec.set('observacao', ped.getString('observacao_entrega'))
        }

        if (compMotorista.length > 0) {
          const fonte = compMotorista[0]
          cRec.set('responsavel_nome', fonte.getString('responsavel_nome') || '')
          cRec.set('responsavel_cpf', fonte.getString('responsavel_cpf') || '')
          cRec.set('chegada_em', fonte.getString('chegada_em') || '')
          cRec.set('assinatura', fonte.getString('assinatura') || '')
          cRec.set('foto', fonte.getString('foto') || '')
          cRec.set('motorista_id', fonte.getString('motorista_id') || motoristaId)
          cRec.set(
            'registro_id',
            fonte.collection().name === 'entrega_registros'
              ? fonte.id
              : fonte.getString('registro_id') || '',
          )
          cRec.set('origem', 'portal_motorista')
        } else {
          cRec.set('origem', 'fechamento_secretaria')
          if (motoristaId) cRec.set('motorista_id', motoristaId)
        }

        txApp.save(cRec)
      }
    } catch (errHist) {
      console.warn(
        'Aviso ao reter histórico em rota_snapshots e entrega_comprovantes no fechamento:',
        errHist,
      )
    }
  })

  return e.json(200, {
    success: true,
    pedidos: updatedOrders,
    produtos: [],
  })
})

routerAdd('POST', '/backend/v1/rotas/entregar', (e) => {
  const body = e.requestInfo().body || {}
  const rotaId = body.rota_id || body.rota_logistica_id
  const userId = body.user_id || ''
  const observacao = (body.observacao || '').trim()

  if (!rotaId) {
    throw new BadRequestError('rota_id é obrigatório')
  }

  const updatedOrders = []

  $app.runInTransaction((txApp) => {
    // 1. Identificar escolas da rota
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

    // 2. Pedidos com status 'Em Rota'
    const pedidos = txApp.findRecordsByFilter('pedidos', 'status = "Em Rota"', '-created', 0, 0)

    const pedidosParaEntregar = []
    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      const pedRotaId = p.getString('rota_id')
      const pedEscolaId = p.getString('escola_id')

      if (pedRotaId === rotaId || escolaIds.indexOf(pedEscolaId) !== -1) {
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
      if (observacao) {
        p.set('observacao_entrega', observacao)
      }
      txApp.save(p)
      updatedOrders.push(p.publicExport())
    }

    // 4. Atualizar status dos despachos ativos da rota para 'Entregue' (e salvar observação)
    try {
      const despachosAtivos = txApp.findRecordsByFilter(
        'despachos',
        'rota_id = {:rId} && status = "Em Rota"',
        '-data_despacho',
        0,
        0,
        { rId: rotaId },
      )
      for (let i = 0; i < despachosAtivos.length; i++) {
        const d = despachosAtivos[i]
        d.set('status', 'Entregue')
        if (observacao) {
          d.set('observacao', observacao)
        }
        txApp.save(d)
      }
    } catch (errDesp) {
      console.warn('Aviso ao atualizar despachos legados para Entregue:', errDesp)
    }

    // Também encerrar despachos ativos na collection rota_despachos (campo ativo: bool = false)
    try {
      const rdAtivos = txApp.findRecordsByFilter(
        'rota_despachos',
        'rota_id = {:rId} && ativo = true',
        '-created',
        0,
        0,
        { rId: rotaId },
      )
      for (let j = 0; j < rdAtivos.length; j++) {
        const rd = rdAtivos[j]
        rd.set('ativo', false)
        rd.set('renovado_em', nowIso)
        if (observacao) {
          rd.set('observacao', observacao)
        }
        txApp.save(rd)
      }
    } catch (errRd) {
      console.warn('Aviso ao desativar rota_despachos na entrega:', errRd)
    }

    // 5. Limpar marcador do caminhão na rota (caminhao_escola_id e caminhao_posicao_atual)
    try {
      const rotaRec = txApp.findRecordById('rotas_logisticas', rotaId)
      rotaRec.set('caminhao_escola_id', '')
      rotaRec.set('caminhao_posicao_atual', 0)
      txApp.save(rotaRec)
    } catch (_) {
      // Se não for rotas_logisticas, tenta em 'rotas'
      try {
        const rRec = txApp.findRecordById('rotas', rotaId)
        rRec.set('caminhao_escola_id', '')
        rRec.set('caminhao_posicao_atual', 0)
        txApp.save(rRec)
      } catch (__) {}
    }

    // 6. CAMADA DE RETENÇÃO HISTÓRICA POR CICLO:
    // (a) Gravar/atualizar registro em rota_snapshots com versao_evento = 'fechamento'
    // (b) Gravar registros em entrega_comprovantes para cada pedido entregue
    try {
      // Resolver dados da rota (nome, chamada_id, ciclo_id, motorista_id, despacho_id)
      let rotaNome = 'Rota'
      let chamadaId = ''
      try {
        const rRec = txApp.findRecordById('rotas', rotaId)
        rotaNome = rRec.getString('nome') || 'Rota'
        chamadaId = rRec.getString('chamada_id') || ''
      } catch (_) {}

      // Ciclo ativo ou ciclo dos pedidos entregues
      let cicloId = ''
      for (let pIdx = 0; pIdx < pedidosParaEntregar.length; pIdx++) {
        const cId = pedidosParaEntregar[pIdx].getString('ciclo_id')
        if (cId) {
          cicloId = cId
          break
        }
      }

      // Despacho e motorista da rota
      let despachoId = ''
      let motoristaId = ''
      try {
        const rdList = txApp.findRecordsByFilter(
          'rota_despachos',
          'rota_id = {:rId}',
          '-created',
          1,
          0,
          { rId: rotaId },
        )
        if (rdList.length > 0) {
          despachoId = rdList[0].id
          motoristaId = rdList[0].getString('motorista_id') || ''
          if (!cicloId) cicloId = rdList[0].getString('ciclo_id') || ''
          if (!chamadaId) chamadaId = rdList[0].getString('chamada_id') || ''
        }
      } catch (_) {}

      // Lista ordenada de paradas detalhada
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

      // (a) Gravar/atualizar em rota_snapshots (versao_evento = 'fechamento')
      const snapshotsCol = txApp.findCollectionByNameOrId('rota_snapshots')
      const filterSnap = cicloId
        ? 'rota_id = {:rId} && ciclo_id = {:cId} && versao_evento = "fechamento"'
        : 'rota_id = {:rId} && versao_evento = "fechamento"'
      const snapParams = { rId: rotaId }
      if (cicloId) snapParams.cId = cicloId

      const snapsExistentes = txApp.findRecordsByFilter(
        'rota_snapshots',
        filterSnap,
        '-snapshot_em,-created',
        1,
        0,
        snapParams,
      )

      const snapRec = snapsExistentes.length > 0 ? snapsExistentes[0] : new Record(snapshotsCol)
      snapRec.set('rota_id', rotaId)
      if (cicloId) snapRec.set('ciclo_id', cicloId)
      if (chamadaId) snapRec.set('chamada_id', chamadaId)
      if (motoristaId) snapRec.set('motorista_id', motoristaId)
      if (despachoId) snapRec.set('despacho_id', despachoId)
      snapRec.set('rota_nome', rotaNome)
      snapRec.set('versao_evento', 'fechamento')
      snapRec.set('total_paradas', paradasList.length)
      snapRec.set('total_pedidos', pedidosParaEntregar.length)
      snapRec.set('paradas_snapshot', JSON.stringify(paradasList))
      snapRec.set('snapshot_em', nowIso)
      if (observacao) snapRec.set('observacao', observacao)
      txApp.save(snapRec)

      // (b) Gravar registros em entrega_comprovantes para cada pedido entregue da rota
      const comprovantesCol = txApp.findCollectionByNameOrId('entrega_comprovantes')
      for (let i = 0; i < pedidosParaEntregar.length; i++) {
        const ped = pedidosParaEntregar[i]
        const pId = ped.id
        const escId = ped.getString('escola_id')
        const pedCicloId = ped.getString('ciclo_id') || cicloId

        // Verificar se já existe comprovante para este pedido
        const compsExist = txApp.findRecordsByFilter(
          'entrega_comprovantes',
          'pedido_id = {:pId}',
          '',
          1,
          0,
          { pId: pId },
        )

        // Buscar se existe entrega confirmada pelo motorista nesta escola
        let compMotorista = []
        if (pedCicloId) {
          compMotorista = txApp.findRecordsByFilter(
            'entrega_comprovantes',
            'escola_id = {:eId} && ciclo_id = {:cId} && origem = "portal_motorista"',
            '-confirmado_em',
            1,
            0,
            { eId: escId, cId: pedCicloId },
          )
        }
        if (compMotorista.length === 0) {
          // Fallback por registro_id em entrega_registros
          const regList = txApp.findRecordsByFilter(
            'entrega_registros',
            'escola_id = {:eId} && rota_id = {:rId}',
            '-confirmado_em,-created',
            1,
            0,
            { eId: escId, rId: rotaId },
          )
          if (regList.length > 0) {
            compMotorista = regList
          }
        }

        // Buscar nome da escola
        let escNome = ''
        try {
          const escObj = txApp.findRecordById('escolas', escId)
          escNome = escObj.getString('nome') || ''
        } catch (_) {}

        const cRec = compsExist.length > 0 ? compsExist[0] : new Record(comprovantesCol)
        cRec.set('escola_id', escId)
        cRec.set('escola_nome', escNome)
        cRec.set('rota_id', rotaId)
        if (pedCicloId) cRec.set('ciclo_id', pedCicloId)
        if (chamadaId) cRec.set('chamada_id', chamadaId)
        cRec.set('pedido_id', pId)
        cRec.set('confirmado_em', ped.getString('entregue_em') || nowIso)
        if (observacao) {
          cRec.set('observacao', observacao)
        } else if (ped.getString('observacao_entrega')) {
          cRec.set('observacao', ped.getString('observacao_entrega'))
        }

        if (compMotorista.length > 0) {
          const fonte = compMotorista[0]
          cRec.set('responsavel_nome', fonte.getString('responsavel_nome') || '')
          cRec.set('responsavel_cpf', fonte.getString('responsavel_cpf') || '')
          cRec.set('chegada_em', fonte.getString('chegada_em') || '')
          cRec.set('assinatura', fonte.getString('assinatura') || '')
          cRec.set('foto', fonte.getString('foto') || '')
          cRec.set('motorista_id', fonte.getString('motorista_id') || motoristaId)
          cRec.set(
            'registro_id',
            fonte.collection().name === 'entrega_registros'
              ? fonte.id
              : fonte.getString('registro_id') || '',
          )
          cRec.set('origem', 'portal_motorista')
        } else {
          cRec.set('origem', 'fechamento_secretaria')
          if (motoristaId) cRec.set('motorista_id', motoristaId)
        }

        txApp.save(cRec)
      }
    } catch (errHist) {
      console.warn(
        'Aviso ao reter histórico em rota_snapshots e entrega_comprovantes no fechamento:',
        errHist,
      )
    }
  })

  return e.json(200, {
    success: true,
    pedidos: updatedOrders,
    produtos: [],
  })
})
