// Endpoint customizado para DESFAZER as entregas de uma rota em um ciclo
// (operação pontual de correção operacional — volta a rota ao ponto de partida).
//
// Body: { rota_id: string, ciclo_id: string, apagar_revisoes_coordenadas?: boolean, user_id?: string }
//
// Executa em transação única:
// 1. Desativa e REMOVE registros em rota_despachos (despacho ativo + token do portal)
// 2. Remove registros em despachos (legado) da rota+cycle que estejam "Em Rota"
// 3. APAGA todos os entrega_registros (horário, responsável, assinatura, fotos)
// 4. APAGA todos os entrega_comprovantes (recibos permanentes + arquivos de foto/assinatura)
// 5. Volta os pedidos "Em Rota" para "Pendente" (mantendo rota_id)
// 6. Limpa posição do caminhão na rota (caminhao_posicao_atual / caminhao_escola_id)
// 7. (Opcional) Apaga revisões de coordenadas (coordenada_sugestoes) pendentes da rota no ciclo
//
// Snapshots de composição (rota_snapshots versao_evento "edicao"/"despacho") são PRESERVADOS.
// Histórico de outros ciclos NÃO é tocado (isolamento estrito por ciclo_id).

routerAdd('POST', '/backend/v1/rotas-logisticas/desfazer-entregas', (e) => {
  const body = e.requestInfo().body || {}
  const rotaId = body.rota_id || ''
  const cicloId = body.ciclo_id || ''
  const apagarRevisoes = body.apagar_revisoes_coordenadas === true
  const userId = body.user_id || ''

  if (!rotaId) throw new BadRequestError('rota_id é obrigatório')
  if (!cicloId) throw new BadRequestError('ciclo_id é obrigatório')

  let rotaNome = ''
  let cicloNome = ''
  let pedidosRevertidos = 0
  let entregasApagadas = 0
  let comprovantesApagados = 0
  let arquivosApagados = 0
  let despachosRemovidos = 0
  let revisoesApagadas = 0

  $app.runInTransaction((txApp) => {
    try {
      const rotaRec = txApp.findRecordById('rotas', rotaId)
      rotaNome = rotaRec.getString('nome') || 'Rota'
    } catch (_) {
      throw new BadRequestError('Rota não encontrada: ' + rotaId)
    }

    try {
      const cicloRec = txApp.findRecordById('ciclos', cicloId)
      cicloNome = cicloRec.getString('nome') || cicloId
    } catch (_) {
      throw new BadRequestError('Ciclo não encontrado: ' + cicloId)
    }

    // ---------- 1. rota_despachos (despacho + token do portal do motorista) ----------
    const rotaDespachos = txApp.findRecordsByFilter(
      'rota_despachos',
      'rota_id = {:rId} && ciclo_id = {:cId}',
      '-created',
      0,
      0,
      { rId: rotaId, cId: cicloId },
    )
    for (let i = 0; i < rotaDespachos.length; i++) {
      txApp.delete(rotaDespachos[i])
      despachosRemovidos++
    }

    // ---------- 2. despachos (legado) da rota+cycle "Em Rota" ----------
    const despachosLegado = txApp.findRecordsByFilter(
      'despachos',
      'rota_id = {:rId} && ciclo_id = {:cId} && status = "Em Rota"',
      '-created',
      0,
      0,
      { rId: rotaId, cId: cicloId },
    )
    for (let i = 0; i < despachosLegado.length; i++) {
      txApp.delete(despachosLegado[i])
      despachosRemovidos++
    }

    // ---------- 3. entrega_registros (horários, responsável, assinatura, fotos) ----------
    const registros = txApp.findRecordsByFilter(
      'entrega_registros',
      'rota_id = {:rId} && ciclo_id = {:cId}',
      '-created',
      0,
      0,
      { rId: rotaId, cId: cicloId },
    )
    entregasApagadas = registros.length
    for (let i = 0; i < registros.length; i++) {
      txApp.delete(registros[i])
    }

    // ---------- 4. entrega_comprovantes (recibos permanentes + arquivos) ----------
    const comprovantes = txApp.findRecordsByFilter(
      'entrega_comprovantes',
      'rota_id = {:rId} && ciclo_id = {:cId}',
      '-created',
      0,
      0,
      { rId: rotaId, cId: cicloId },
    )
    comprovantesApagados = comprovantes.length
    const fs = $app.newFilesystem()
    for (let i = 0; i < comprovantes.length; i++) {
      const comp = comprovantes[i]
      // Apagar arquivos físicos (fotos e assinaturas) do storage
      const arquivos = []
      try {
        if (comp.getString('foto')) arquivos.push(comp.getString('foto'))
        if (comp.getString('assinatura')) arquivos.push(comp.getString('assinatura'))
      } catch (_) {}
      for (let a = 0; a < arquivos.length; a++) {
        try {
          fs.delete(arquivos[a])
          arquivosApagados++
        } catch (errDel) {
          console.warn('Aviso ao apagar arquivo de comprovante:', arquivos[a], errDel)
        }
      }
      txApp.delete(comp)
    }

    // ---------- 5. Pedidos "Em Rota" -> "Pendente" (mantêm rota_id) ----------
    const pedidos = txApp.findRecordsByFilter(
      'pedidos',
      'rota_id = {:rId} && ciclo_id = {:cId} && status = "Em Rota"',
      '-created',
      0,
      0,
      { rId: rotaId, cId: cicloId },
    )
    for (let i = 0; i < pedidos.length; i++) {
      const p = pedidos[i]
      p.set('status', 'Pendente')
      p.set('entregue_em', null)
      p.set('entregue_por', null)
      p.set('observacao_entrega', '')
      txApp.save(p)
      pedidosRevertidos++
    }

    // Segurança: também reverter pedidos do ciclo apontando para a rota por escola
    // (pedidos cujo rota_id veio vazio mas pertencem às escolas da rota — paradas_rota)
    try {
      const paradas = txApp.findRecordsByFilter('paradas_rota', 'rota_id = {:rId}', 'ordem', 0, 0, {
        rId: rotaId,
      })
      for (let i = 0; i < paradas.length; i++) {
        const escolaId = paradas[i].getString('escola_id')
        if (!escolaId) continue
        const pedEsc = txApp.findRecordsByFilter(
          'pedidos',
          'escola_id = {:eId} && ciclo_id = {:cId} && status = "Em Rota" && (rota_id = "" || rota_id = nil)',
          '-created',
          0,
          0,
          { eId: escolaId, cId: cicloId },
        )
        for (let j = 0; j < pedEsc.length; j++) {
          const p = pedEsc[j]
          p.set('status', 'Pendente')
          p.set('entregue_em', null)
          p.set('entregue_por', null)
          p.set('observacao_entrega', '')
          txApp.save(p)
          pedidosRevertidos++
        }
      }
    } catch (errEsc) {
      console.warn('Aviso ao reverter pedidos por escola da rota:', errEsc)
    }

    // ---------- 6. Limpar posição do caminhão na rota ----------
    try {
      const rotaTarget = txApp.findRecordById('rotas', rotaId)
      rotaTarget.set('caminhao_posicao_atual', 0)
      rotaTarget.set('caminhao_escola_id', '')
      txApp.save(rotaTarget)
    } catch (_) {}

    // ---------- 7. (Opcional) Revisões de coordenadas da rota no ciclo ----------
    if (apagarRevisoes) {
      try {
        const revisoes = txApp.findRecordsByFilter(
          'coordenada_sugestoes',
          'rota_id = {:rId} && ciclo_id = {:cId} && status = "pendente"',
          '-created',
          0,
          0,
          { rId: rotaId, cId: cicloId },
        )
        for (let i = 0; i < revisoes.length; i++) {
          txApp.delete(revisoes[i])
          revisoesApagados++
        }
      } catch (errRev) {
        console.warn('Aviso ao apagar revisões de coordenadas:', errRev)
      }
    }
  })

  return e.json(200, {
    success: true,
    rota: rotaNome,
    ciclo: cicloNome,
    resumo: {
      pedidos_revertidos: pedidosRevertidos,
      entregas_apagadas: entregasApagadas,
      comprovantes_apagados: comprovantesApagados,
      arquivos_apagados: arquivosApagados,
      despachos_removidos: despachosRemovidos,
      revisoes_coordenadas_apagadas: revisoesApagadas,
    },
    executado_por: userId,
  })
})
