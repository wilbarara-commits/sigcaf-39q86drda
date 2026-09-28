// Hook de validação de unicidade de nome para rotas dentro da mesma chamada ou mesmo contrato
// Garante a regra no servidor mesmo sob concorrência (race conditions)
// e formata o nome com trim e espaços normalizados.
// Nota: Em PocketBase Goja JSVM, funções auxiliares não podem ficar no top-level.

onRecordCreate((e) => {
  const record = e.record
  const col = record.collection()
  if (col.name !== 'rotas') {
    return e.next()
  }

  const rawNome = record.getString('nome') || ''
  const cleanNome = rawNome.trim().replace(/\s+/g, ' ')
  let chamadaId = record.getString('chamada_id') || ''
  const contratoId = record.getString('contrato_id') || ''

  if (!cleanNome) {
    throw new BadRequestError('O nome da rota é obrigatório.')
  }

  if (!chamadaId && contratoId) {
    try {
      const cRec = $app.findRecordById('contratos', contratoId)
      chamadaId = cRec.getString('chamada_id') || ''
      if (chamadaId) {
        record.set('chamada_id', chamadaId)
      }
    } catch (_) {}
  }

  if (!chamadaId && !contratoId) {
    throw new BadRequestError('A chamada ou contrato da rota é obrigatório.')
  }

  record.set('nome', cleanNome)

  let existingRotas = []
  if (chamadaId) {
    existingRotas = $app.findRecordsByFilter('rotas', 'chamada_id = {:chamadaId}', 'ordem', 0, 0, {
      chamadaId: chamadaId,
    })
  } else {
    existingRotas = $app.findRecordsByFilter(
      'rotas',
      'contrato_id = {:contratoId}',
      'ordem',
      0,
      0,
      { contratoId: contratoId },
    )
  }

  const lowerTarget = cleanNome.toLowerCase()
  for (let i = 0; i < existingRotas.length; i++) {
    const existing = existingRotas[i]
    if (existing.id === record.id) continue

    const existingNomeNorm = (existing.getString('nome') || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
    if (existingNomeNorm === lowerTarget) {
      throw new BadRequestError('Já existe uma rota com este nome nesta chamada.')
    }
  }

  return e.next()
}, 'rotas')

onRecordUpdate((e) => {
  const record = e.record
  const col = record.collection()
  if (col.name !== 'rotas') {
    return e.next()
  }

  const rawNome = record.getString('nome') || ''
  const cleanNome = rawNome.trim().replace(/\s+/g, ' ')
  let chamadaId = record.getString('chamada_id') || ''
  const contratoId = record.getString('contrato_id') || ''

  if (!cleanNome) {
    throw new BadRequestError('O nome da rota é obrigatório.')
  }

  if (!chamadaId && contratoId) {
    try {
      const cRec = $app.findRecordById('contratos', contratoId)
      chamadaId = cRec.getString('chamada_id') || ''
      if (chamadaId) {
        record.set('chamada_id', chamadaId)
      }
    } catch (_) {}
  }

  if (!chamadaId && !contratoId) {
    throw new BadRequestError('A chamada ou contrato da rota é obrigatório.')
  }

  record.set('nome', cleanNome)

  let existingRotas = []
  if (chamadaId) {
    existingRotas = $app.findRecordsByFilter('rotas', 'chamada_id = {:chamadaId}', 'ordem', 0, 0, {
      chamadaId: chamadaId,
    })
  } else {
    existingRotas = $app.findRecordsByFilter(
      'rotas',
      'contrato_id = {:contratoId}',
      'ordem',
      0,
      0,
      { contratoId: contratoId },
    )
  }

  const lowerTarget = cleanNome.toLowerCase()
  for (let i = 0; i < existingRotas.length; i++) {
    const existing = existingRotas[i]
    if (existing.id === record.id) continue

    const existingNomeNorm = (existing.getString('nome') || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
    if (existingNomeNorm === lowerTarget) {
      throw new BadRequestError('Já existe uma rota com este nome nesta chamada.')
    }
  }

  return e.next()
}, 'rotas')
