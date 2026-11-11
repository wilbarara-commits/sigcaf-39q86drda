// Hook para salvar sequenciamento de paradas da rota em transação única
// POST /backend/v1/rotas-logisticas/salvar-paradas (compatibilidade)
// POST /backend/v1/rotas/salvar-paradas
// Body: { rota_id?: string, rota_logistica_id?: string, paradas: Array<{ escola_id: string, ordem: number }> }
//
// SEMÂNTICA DE SINCRONIZAÇÃO TOTAL (v0.0.277): o payload recebido é a composição
// COMPLETA desejada da rota. Paradas existentes cuja escola NÃO está no payload são
// APAGADAS (ex.: usuário desmarcou escolas em "Atribuir Escolas" e salvou, inclusive
// esvaziando a rota por completo). Paradas presentes têm a ordem atualizada (upsert).
// Paradas de OUTRAS rotas jamais são tocadas.
//
// v0.0.278: a composição viva gravada (inclusive a vazia) é propagada para os
// snapshots 'edicao' dos ciclos NÃO terminais (fechado/cancelado ficam intactos).
// Sem isso, a reconciliação snapshot × composição viva da /rotas (0.0.272) "restaurava"
// as escolas removidas a partir do snapshot desatualizado, e esvaziar a rota não funcionava.

// Mapa id -> nome das escolas (uma consulta única por salvamento)
const mapaNomeEscolas = () => {
  const map = {}
  try {
    const todas = $app.findRecordsByFilter('escolas', 'id != ""', '-created', 0, 0)
    for (let i = 0; i < todas.length; i++) {
      map[todas[i].id] = todas[i].getString('nome')
    }
  } catch (_) {}
  return map
}

// Monta a lista de paradas no formato do snapshot a partir dos exports de paradas_rota
const comporSnapshotDeParadas = (paradasExports, nomes) => {
  const lista = []
  const vistos = {}
  for (let i = 0; i < paradasExports.length; i++) {
    const p = paradasExports[i]
    const eid = p && p.escola_id
    if (!eid || vistos[eid]) continue
    vistos[eid] = true
    lista.push({
      escola_id: eid,
      ordem: typeof p.ordem === 'number' ? p.ordem : Number(p.ordem) || 0,
      escola_nome: nomes[eid] || '',
    })
  }
  lista.sort((a, b) => a.ordem - b.ordem)
  return lista
}

// Regrava os snapshots 'edicao' de ciclos não terminais (fechado/cancelado ficam intactos)
const atualizarSnapshotsEdicao = (rotaId, paradasExports) => {
  if (!rotaId) return
  try {
    const nomes = mapaNomeEscolas()
    const snapshot = comporSnapshotDeParadas(paradasExports, nomes)
    const ciclos = $app.findRecordsByFilter(
      'ciclos',
      "status != 'fechado' && status != 'cancelado'",
      '-created',
      0,
      0,
    )
    for (let i = 0; i < ciclos.length; i++) {
      const snaps = $app.findRecordsByFilter(
        'rota_snapshots',
        "rota_id = {:rid} && ciclo_id = {:cid} && versao_evento = 'edicao'",
        '-snapshot_em',
        1,
        0,
        { rid: rotaId, cid: ciclos[i].id },
      )
      if (snaps.length === 0) continue
      const snap = snaps[0]
      snap.set('paradas_snapshot', JSON.stringify(snapshot))
      snap.set('total_paradas', snapshot.length)
      snap.set('snapshot_em', new Date().toISOString())
      $app.save(snap)
    }
  } catch (err) {
    console.log('atualizarSnapshotsEdicao falhou (nao bloqueia o salvamento): ' + err)
  }
}

const salvarParadasHandler = (e) => {
  const body = e.requestInfo().body || {}
  const rotaId = body.rota_id || body.rota_logistica_id
  const paradas = body.paradas || []

  if (!rotaId) {
    throw new BadRequestError('rota_id é obrigatório')
  }

  const savedParadas = []

  $app.runInTransaction((txApp) => {
    const paradasCol = txApp.findCollectionByNameOrId('paradas_rota')

    // Conjunto de escola_ids que permanecem na composição desejada
    const idsPermanecem = {}
    for (let i = 0; i < paradas.length; i++) {
      if (paradas[i].escola_id) {
        idsPermanecem[paradas[i].escola_id] = true
      }
    }

    // 1. Apagar paradas da rota cuja escola não está mais na composição (remoção)
    const existentes = txApp.findRecordsByFilter(
      'paradas_rota',
      'rota_id = {:rotaId}',
      'ordem',
      0,
      0,
      { rotaId: rotaId },
    )
    for (let j = 0; j < existentes.length; j++) {
      const escId = existentes[j].getString('escola_id')
      if (!idsPermanecem[escId]) {
        txApp.delete(existentes[j])
      }
    }

    // 2. Upsert das paradas desejadas (ordem)
    for (let i = 0; i < paradas.length; i++) {
      const p = paradas[i]
      const escolaId = p.escola_id
      const ordem = p.ordem || i + 1

      // Verificar se já existe parada desta escola na rota
      const existing = txApp.findRecordsByFilter(
        'paradas_rota',
        'rota_id = {:rotaId} && escola_id = {:escId}',
        'created',
        1,
        0,
        { rotaId: rotaId, escId: escolaId },
      )

      let record = null
      if (existing.length > 0) {
        record = existing[0]
        record.set('ordem', ordem)
      } else {
        record = new Record(paradasCol)
        record.set('rota_id', rotaId)
        record.set('escola_id', escolaId)
        record.set('ordem', ordem)
      }

      txApp.save(record)
      savedParadas.push(record.publicExport())
    }
  })

  // Após o commit: propaga a composição viva gravada (inclusive a VAZIA) para os
  // snapshots 'edicao' dos ciclos abertos — sem isso a reconciliação 0.0.272 da
  // tela /rotas restaurava as escolas removidas e esvaziar a rota nunca tinha efeito.
  atualizarSnapshotsEdicao(rotaId, savedParadas)

  return e.json(200, {
    success: true,
    paradas: savedParadas,
  })
}

routerAdd('POST', '/backend/v1/rotas-logisticas/salvar-paradas', salvarParadasHandler)
routerAdd('POST', '/backend/v1/rotas/salvar-paradas', salvarParadasHandler)
