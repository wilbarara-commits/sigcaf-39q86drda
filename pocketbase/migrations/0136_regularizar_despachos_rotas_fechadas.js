migrate(
  (app) => {
    const nowIso = new Date().toISOString()
    const rotasAlvoIds = ['hky0r83id0fw68d', '6xus8ajo8rv5vdo']

    // 1. Regularizar pedidos da Rota A da 07/2025 ('hky0r83id0fw68d') que ainda estão com status 'Em Rota'
    // Conforme relato do usuário: os pedidos desta rota já foram finalizados/entregues no ato do fechamento.
    const pedidosRota07 = app.findRecordsByFilter(
      'pedidos',
      'rota_id = "hky0r83id0fw68d" && status = "Em Rota"',
      '-created',
      0,
      0,
    )
    for (let i = 0; i < pedidosRota07.length; i++) {
      const p = pedidosRota07[i]
      p.set('status', 'Entregue')
      if (!p.getString('entregue_em')) {
        p.set('entregue_em', nowIso)
      }
      app.save(p)
    }

    // 2. Regularizar pedidos da Rota A da 01/2025 ('6xus8ajo8rv5vdo') caso haja algum remanescente
    const pedidosRota01 = app.findRecordsByFilter(
      'pedidos',
      'rota_id = "6xus8ajo8rv5vdo" && status = "Em Rota"',
      '-created',
      0,
      0,
    )
    for (let i = 0; i < pedidosRota01.length; i++) {
      const p = pedidosRota01[i]
      p.set('status', 'Entregue')
      if (!p.getString('entregue_em')) {
        p.set('entregue_em', nowIso)
      }
      app.save(p)
    }

    // 3. Encerrar despachos na collection legada 'despachos' (status -> 'Entregue')
    for (let r = 0; r < rotasAlvoIds.length; r++) {
      const rId = rotasAlvoIds[r]
      const despachosEmRota = app.findRecordsByFilter(
        'despachos',
        'rota_id = {:rId} && status = "Em Rota"',
        '-created',
        0,
        0,
        { rId: rId },
      )
      for (let d = 0; d < despachosEmRota.length; d++) {
        const item = despachosEmRota[d]
        item.set('status', 'Entregue')
        app.save(item)
      }
    }

    // 4. Encerrar despachos na collection 'rota_despachos' (ativo = false)
    for (let r = 0; r < rotasAlvoIds.length; r++) {
      const rId = rotasAlvoIds[r]
      const rdsAtivos = app.findRecordsByFilter(
        'rota_despachos',
        'rota_id = {:rId} && ativo = true',
        '-created',
        0,
        0,
        { rId: rId },
      )
      for (let rd = 0; rd < rdsAtivos.length; rd++) {
        const item = rdsAtivos[rd]
        item.set('ativo', false)
        item.set('renovado_em', nowIso)
        app.save(item)
      }
    }

    // 5. Garantir que o pino do caminhão em rotas esteja zerado
    for (let r = 0; r < rotasAlvoIds.length; r++) {
      const rId = rotasAlvoIds[r]
      try {
        const rotaRec = app.findRecordById('rotas', rId)
        rotaRec.set('caminhao_escola_id', '')
        rotaRec.set('caminhao_posicao_atual', 0)
        app.save(rotaRec)
      } catch (_) {}
    }
  },
  (app) => {
    // Reversão defensiva (no-op para integridade de dados operacionais)
  },
)
