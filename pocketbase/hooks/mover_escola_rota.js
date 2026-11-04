// Endpoint customizado para mover escola entre rotas
// Body: { escola_id: string, origem_rota_id?: string, destino_rota_id: string, target_ordem?: number }
//
// Regras (v0.0.272):
// - A regravação PRESERVA todas as paradas existentes (nenhuma parada é perdida);
//   a origem renumera após a remoção e o destino renumera de forma consistente 1..N.
// - Ordenação sempre pelo campo 'ordem' (com desempate por 'created'), nunca por índice.
// - Impede duplicidade da mesma escola na rota de destino.
// - Após a movimentação, os snapshots 'edicao' (rota_snapshots) de ciclos NÃO terminais
//   das rotas afetadas são regravados com a composição viva nova, para que a tela /rotas
//   (que prioriza o snapshot do ciclo) nunca exiba composição defasada.

// Mapa id -> nome das escolas (uma consulta única por movimentação)
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
    console.log('atualizarSnapshotsEdicao falhou (nao bloqueia a movimentacao): ' + err)
  }
}

const moverEscolaHandler = (e) => {
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
  let origemEfetivaId = origemRotaId || null
  let mesmaRota = false

  $app.runInTransaction((txApp) => {
    const paradasCol = txApp.findCollectionByNameOrId('paradas_rota')

    try {
      txApp.findRecordById('rotas', destinoRotaId)
    } catch (_) {
      throw new BadRequestError('Rota de destino não encontrada: ' + destinoRotaId)
    }

    if (origemRotaId && origemRotaId === destinoRotaId) {
      mesmaRota = true
      const paradasMesmaRota = txApp.findRecordsByFilter(
        'paradas_rota',
        'rota_id = {:rotaId}',
        'ordem,created',
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

    origemEfetivaId = paradaOrigem ? paradaOrigem.getString('rota_id') : origemRotaId

    if (paradaOrigem) {
      txApp.delete(paradaOrigem)
    }

    if (origemEfetivaId && origemEfetivaId !== destinoRotaId) {
      const paradasRestantesOrigem = txApp.findRecordsByFilter(
        'paradas_rota',
        'rota_id = {:origemId}',
        'ordem,created',
        0,
        0,
        { origemId: origemEfetivaId },
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

    // Guarda anti-duplicidade: nenhuma parada remanescente da mesma escola na rota de destino
    const duplicadasDestino = txApp.findRecordsByFilter(
      'paradas_rota',
      'rota_id = {:rid} && escola_id = {:eid}',
      'created',
      0,
      0,
      { rid: destinoRotaId, eid: escolaId },
    )
    for (let i = 0; i < duplicadasDestino.length; i++) {
      txApp.delete(duplicadasDestino[i])
    }

    const paradasDestinoAtuais = txApp.findRecordsByFilter(
      'paradas_rota',
      'rota_id = {:destinoId}',
      'ordem,created',
      0,
      0,
      { destinoId: destinoRotaId },
    )

    const novaParadaDestino = new Record(paradasCol)
    novaParadaDestino.set('rota_id', destinoRotaId)
    novaParadaDestino.set('escola_id', escolaId)

    let insertIndex = paradasDestinoAtuais.length
    if (targetOrdem !== null && targetOrdem >= 1) {
      insertIndex = Math.max(0, Math.min(paradasDestinoAtuais.length, targetOrdem - 1))
    }

    paradasDestinoAtuais.splice(insertIndex, 0, novaParadaDestino)

    // Regravação preserva TODAS as paradas existentes: nenhuma é descartada,
    // a numeração 1..N é regravada de forma consistente para a rota inteira.
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

  // Após o commit: regrava os snapshots 'edicao' dos ciclos abertos das rotas afetadas
  // para que a tela /rotas (que prioriza o snapshot) reflita a composição viva.
  atualizarSnapshotsEdicao(destinoRotaId, finalParadasDestino)
  if (!mesmaRota && origemEfetivaId && origemEfetivaId !== destinoRotaId) {
    atualizarSnapshotsEdicao(origemEfetivaId, finalParadasOrigem)
  }

  return e.json(200, {
    success: true,
    escola_id: escolaId,
    origem_rota_id: origemRotaId,
    destino_rota_id: destinoRotaId,
    paradas_origem: finalParadasOrigem,
    paradas_destino: finalParadasDestino,
  })
}

routerAdd('POST', '/backend/v1/rotas-logisticas/mover-escola', moverEscolaHandler)
routerAdd('POST', '/backend/v1/rotas/mover-escola', moverEscolaHandler)
