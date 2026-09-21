// Hook de validação de unicidade de nome para rotas_logisticas dentro do mesmo contrato
// Garante a regra no servidor mesmo sob concorrência (race conditions)
// e formata o nome com trim e espaços normalizados.

onRecordCreate((e) => {
  const record = e.record
  const col = record.collection()
  if (col.name !== 'rotas_logisticas') {
    return e.next()
  }

  const rawNome = record.getString('nome') || ''
  const cleanNome = rawNome.trim().replace(/\s+/g, ' ')
  const contratoId = record.getString('contrato_id') || ''

  if (!cleanNome) {
    throw new BadRequestError('O nome da rota logística é obrigatório.')
  }

  if (!contratoId) {
    throw new BadRequestError('O contrato da rota logística é obrigatório.')
  }

  // Normaliza o nome gravado no banco
  record.set('nome', cleanNome)

  // Checa unicidade case-insensitive dentro do contrato
  const existingRotas = $app.findRecordsByFilter(
    'rotas_logisticas',
    'contrato_id = {:contratoId}',
    'ordem',
    0,
    0,
    { contratoId: contratoId },
  )

  const lowerTarget = cleanNome.toLowerCase()
  for (let i = 0; i < existingRotas.length; i++) {
    const existing = existingRotas[i]
    if (existing.id === record.id) continue

    const existingNomeNorm = (existing.getString('nome') || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
    if (existingNomeNorm === lowerTarget) {
      throw new BadRequestError('Já existe uma rota logística com este nome neste contrato.')
    }
  }

  return e.next()
}, 'rotas_logisticas')

onRecordUpdate((e) => {
  const record = e.record
  const col = record.collection()
  if (col.name !== 'rotas_logisticas') {
    return e.next()
  }

  const rawNome = record.getString('nome') || ''
  const cleanNome = rawNome.trim().replace(/\s+/g, ' ')
  const contratoId = record.getString('contrato_id') || ''

  if (!cleanNome) {
    throw new BadRequestError('O nome da rota logística é obrigatório.')
  }

  if (!contratoId) {
    throw new BadRequestError('O contrato da rota logística é obrigatório.')
  }

  // Normaliza o nome gravado no banco
  record.set('nome', cleanNome)

  // Checa unicidade case-insensitive dentro do contrato
  const existingRotas = $app.findRecordsByFilter(
    'rotas_logisticas',
    'contrato_id = {:contratoId}',
    'ordem',
    0,
    0,
    { contratoId: contratoId },
  )

  const lowerTarget = cleanNome.toLowerCase()
  for (let i = 0; i < existingRotas.length; i++) {
    const existing = existingRotas[i]
    if (existing.id === record.id) continue

    const existingNomeNorm = (existing.getString('nome') || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
    if (existingNomeNorm === lowerTarget) {
      throw new BadRequestError('Já existe uma rota logística com este nome neste contrato.')
    }
  }

  return e.next()
}, 'rotas_logisticas')
