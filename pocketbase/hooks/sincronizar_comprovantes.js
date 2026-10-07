// Hook para sincronizar registros de entrega do portal do motorista com a coleção permanente entrega_comprovantes
// e garantir preenchimento de ciclo_id e chamada_id caso não tenham sido preenchidos pelo cliente.

onRecordCreate((e) => {
  const reg = e.record
  if (reg.collection().name !== 'entrega_registros') {
    return e.next()
  }

  // Resolver despacho se fornecido
  let cicloId = reg.getString('ciclo_id') || ''
  let chamadaId = reg.getString('chamada_id') || ''
  let motoristaId = reg.getString('motorista_id') || ''
  const despachoId = reg.getString('despacho_id') || ''
  const rotaId = reg.getString('rota_id') || ''
  const escolaId = reg.getString('escola_id') || ''

  if (despachoId && (!cicloId || !chamadaId || !motoristaId)) {
    try {
      const dRec = $app.findRecordById('rota_despachos', despachoId)
      if (!cicloId) cicloId = dRec.getString('ciclo_id') || ''
      if (!chamadaId) chamadaId = dRec.getString('chamada_id') || ''
      if (!motoristaId) motoristaId = dRec.getString('motorista_id') || ''
    } catch (_) {}
  }

  if (rotaId && (!chamadaId || !cicloId)) {
    try {
      const rRec = $app.findRecordById('rotas', rotaId)
      if (!chamadaId) chamadaId = rRec.getString('chamada_id') || ''
    } catch (_) {}

    // Se ainda não tiver ciclo_id, buscar ciclo ativo da chamada ou global
    if (!cicloId && chamadaId) {
      try {
        const ciclosAtivos = $app.findRecordsByFilter(
          'ciclos',
          'chamada_id = {:chId} && status != "fechado" && status != "cancelado"',
          '-created,-data_inicio',
          1,
          0,
          { chId: chamadaId },
        )
        if (ciclosAtivos.length > 0) {
          cicloId = ciclosAtivos[0].id
        }
      } catch (_) {}
    }
  }

  if (cicloId && !reg.getString('ciclo_id')) {
    reg.set('ciclo_id', cicloId)
  }
  if (chamadaId && !reg.getString('chamada_id')) {
    reg.set('chamada_id', chamadaId)
  }
  if (motoristaId && !reg.getString('motorista_id')) {
    reg.set('motorista_id', motoristaId)
  }

  e.next()

  // Após salvar o registro de entrega com sucesso, grava/atualiza em entrega_comprovantes com origem='portal_motorista'
  try {
    const comprovantesCol = $app.findCollectionByNameOrId('entrega_comprovantes')
    let escNome = ''
    try {
      const escRec = $app.findRecordById('escolas', escolaId)
      escNome = escRec.getString('nome') || ''
    } catch (_) {}

    const clientUid = reg.getString('client_uid') || ''
    let compsExistentes = []
    if (clientUid) {
      compsExistentes = $app.findRecordsByFilter(
        'entrega_comprovantes',
        'client_uid = {:cuid}',
        '-created',
        1,
        0,
        { cuid: clientUid },
      )
    }
    if (compsExistentes.length === 0 && escolaId && rotaId) {
      const filterEsc = cicloId
        ? 'escola_id = {:eId} && rota_id = {:rId} && ciclo_id = {:cId}'
        : 'escola_id = {:eId} && rota_id = {:rId}'
      const paramsEsc = { eId: escolaId, rId: rotaId }
      if (cicloId) paramsEsc.cId = cicloId
      compsExistentes = $app.findRecordsByFilter(
        'entrega_comprovantes',
        filterEsc,
        '-created',
        1,
        0,
        paramsEsc,
      )
    }

    const cRec = compsExistentes.length > 0 ? compsExistentes[0] : new Record(comprovantesCol)
    cRec.set('escola_id', escolaId)
    cRec.set('escola_nome', escNome)
    if (rotaId) cRec.set('rota_id', rotaId)
    if (cicloId) cRec.set('ciclo_id', cicloId)
    if (chamadaId) cRec.set('chamada_id', chamadaId)
    if (motoristaId) cRec.set('motorista_id', motoristaId)
    cRec.set('registro_id', reg.id)
    cRec.set('responsavel_nome', reg.getString('responsavel_nome') || '')
    cRec.set('responsavel_cpf', reg.getString('responsavel_cpf') || '')
    cRec.set('chegada_em', reg.getString('chegada_em') || '')
    cRec.set(
      'confirmado_em',
      reg.getString('confirmado_em') || reg.getString('created') || new Date().toISOString(),
    )
    cRec.set('assinatura', reg.getString('assinatura') || '')
    cRec.set('foto', reg.getString('foto') || '')
    cRec.set('observacao', reg.getString('observacao') || '')
    cRec.set('origem', 'portal_motorista')
    if (clientUid) cRec.set('client_uid', clientUid)

    $app.save(cRec)
  } catch (errComp) {
    console.warn(
      'Aviso ao sincronizar entrega_comprovantes via onRecordCreate(entrega_registros):',
      errComp,
    )
  }
}, 'entrega_registros')

onRecordUpdate((e) => {
  const reg = e.record
  if (reg.collection().name !== 'entrega_registros') {
    return e.next()
  }

  let cicloId = reg.getString('ciclo_id') || ''
  let chamadaId = reg.getString('chamada_id') || ''
  let motoristaId = reg.getString('motorista_id') || ''
  const despachoId = reg.getString('despacho_id') || ''
  const rotaId = reg.getString('rota_id') || ''
  const escolaId = reg.getString('escola_id') || ''

  if (despachoId && (!cicloId || !chamadaId || !motoristaId)) {
    try {
      const dRec = $app.findRecordById('rota_despachos', despachoId)
      if (!cicloId) cicloId = dRec.getString('ciclo_id') || ''
      if (!chamadaId) chamadaId = dRec.getString('chamada_id') || ''
      if (!motoristaId) motoristaId = dRec.getString('motorista_id') || ''
    } catch (_) {}
  }

  if (rotaId && (!chamadaId || !cicloId)) {
    try {
      const rRec = $app.findRecordById('rotas', rotaId)
      if (!chamadaId) chamadaId = rRec.getString('chamada_id') || ''
    } catch (_) {}

    if (!cicloId && chamadaId) {
      try {
        const ciclosAtivos = $app.findRecordsByFilter(
          'ciclos',
          'chamada_id = {:chId} && status != "fechado" && status != "cancelado"',
          '-created,-data_inicio',
          1,
          0,
          { chId: chamadaId },
        )
        if (ciclosAtivos.length > 0) {
          cicloId = ciclosAtivos[0].id
        }
      } catch (_) {}
    }
  }

  if (cicloId && !reg.getString('ciclo_id')) {
    reg.set('ciclo_id', cicloId)
  }
  if (chamadaId && !reg.getString('chamada_id')) {
    reg.set('chamada_id', chamadaId)
  }
  if (motoristaId && !reg.getString('motorista_id')) {
    reg.set('motorista_id', motoristaId)
  }

  e.next()

  try {
    const comprovantesCol = $app.findCollectionByNameOrId('entrega_comprovantes')
    let escNome = ''
    try {
      const escRec = $app.findRecordById('escolas', escolaId)
      escNome = escRec.getString('nome') || ''
    } catch (_) {}

    const clientUid = reg.getString('client_uid') || ''
    let compsExistentes = []
    if (clientUid) {
      compsExistentes = $app.findRecordsByFilter(
        'entrega_comprovantes',
        'client_uid = {:cuid}',
        '-created',
        1,
        0,
        { cuid: clientUid },
      )
    }
    if (compsExistentes.length === 0 && reg.id) {
      compsExistentes = $app.findRecordsByFilter(
        'entrega_comprovantes',
        'registro_id = {:regId}',
        '-created',
        1,
        0,
        { regId: reg.id },
      )
    }
    if (compsExistentes.length === 0 && escolaId && rotaId) {
      const filterEsc = cicloId
        ? 'escola_id = {:eId} && rota_id = {:rId} && ciclo_id = {:cId}'
        : 'escola_id = {:eId} && rota_id = {:rId}'
      const paramsEsc = { eId: escolaId, rId: rotaId }
      if (cicloId) paramsEsc.cId = cicloId
      compsExistentes = $app.findRecordsByFilter(
        'entrega_comprovantes',
        filterEsc,
        '-created',
        1,
        0,
        paramsEsc,
      )
    }

    const cRec = compsExistentes.length > 0 ? compsExistentes[0] : new Record(comprovantesCol)
    cRec.set('escola_id', escolaId)
    cRec.set('escola_nome', escNome)
    if (rotaId) cRec.set('rota_id', rotaId)
    if (cicloId) cRec.set('ciclo_id', cicloId)
    if (chamadaId) cRec.set('chamada_id', chamadaId)
    if (motoristaId) cRec.set('motorista_id', motoristaId)
    cRec.set('registro_id', reg.id)
    cRec.set('responsavel_nome', reg.getString('responsavel_nome') || '')
    cRec.set('responsavel_cpf', reg.getString('responsavel_cpf') || '')
    cRec.set('chegada_em', reg.getString('chegada_em') || '')
    cRec.set(
      'confirmado_em',
      reg.getString('confirmado_em') || reg.getString('created') || new Date().toISOString(),
    )
    cRec.set('assinatura', reg.getString('assinatura') || '')
    cRec.set('foto', reg.getString('foto') || '')
    cRec.set('observacao', reg.getString('observacao') || '')
    cRec.set('origem', 'portal_motorista')
    if (clientUid) cRec.set('client_uid', clientUid)

    $app.save(cRec)
  } catch (errComp) {
    console.warn(
      'Aviso ao sincronizar entrega_comprovantes via onRecordUpdate(entrega_registros):',
      errComp,
    )
  }
}, 'entrega_registros')
