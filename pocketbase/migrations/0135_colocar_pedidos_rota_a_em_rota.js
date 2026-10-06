migrate(
  (app) => {
    const rotaId = '6xus8ajo8rv5vdo'
    const cicloId = 'cdc739fwfugfq4h'
    const chamadaId = 'mc5dfmz40vg21jm'
    const nowIso = new Date().toISOString()

    // 1. Localizar os pedidos do ciclo vinculados à ROTA A ou cujas escolas pertençam à rota
    // Primeiro buscamos as escolas da rota via paradas_rota
    const paradas = app.findRecordsByFilter('paradas_rota', 'rota_id = {:rotaId}', 'ordem', 0, 0, {
      rotaId: rotaId,
    })
    const escolaIds = []
    for (let i = 0; i < paradas.length; i++) {
      escolaIds.push(paradas[i].getString('escola_id'))
    }

    // Buscar pedidos do ciclo com status Pendente
    const pedidos = app.findRecordsByFilter(
      'pedidos',
      'ciclo_id = {:cicloId} && status = "Pendente"',
      '-created',
      0,
      0,
      { cicloId: cicloId },
    )

    let alterados = 0
    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      const pedRotaId = p.getString('rota_id')
      const pedEscolaId = p.getString('escola_id')

      if (pedRotaId === rotaId || escolaIds.indexOf(pedEscolaId) !== -1) {
        p.set('status', 'Em Rota')
        p.set('rota_id', rotaId)
        app.save(p)
        alterados++
      }
    }

    // 2. Garantir registro na collection despachos com status 'Em Rota' para essa rota/ciclo
    const despachosExistentes = app.findRecordsByFilter(
      'despachos',
      'rota_id = {:rId} && ciclo_id = {:cId} && status = "Em Rota"',
      '-created',
      1,
      0,
      { rId: rotaId, cId: cicloId },
    )

    if (despachosExistentes.length === 0) {
      const despCol = app.findCollectionByNameOrId('despachos')
      const novoDesp = new Record(despCol)
      novoDesp.set('rota_id', rotaId)
      novoDesp.set('ciclo_id', cicloId)
      novoDesp.set('chamada_id', chamadaId)
      novoDesp.set('status', 'Em Rota')
      novoDesp.set('data_despacho', nowIso)
      app.save(novoDesp)
    }
  },
  (app) => {
    // Reversão defensiva
    const rotaId = '6xus8ajo8rv5vdo'
    const cicloId = 'cdc739fwfugfq4h'

    const pedidos = app.findRecordsByFilter(
      'pedidos',
      'ciclo_id = {:cicloId} && rota_id = {:rotaId} && status = "Em Rota"',
      '-created',
      0,
      0,
      { cicloId: cicloId, rotaId: rotaId },
    )

    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      p.set('status', 'Pendente')
      app.save(p)
    }
  },
)
