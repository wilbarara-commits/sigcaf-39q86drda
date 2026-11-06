// Migration temporária pontual para executar a limpeza/desfazer entregas da ROTA C no ciclo 44/2026
// Conforme solicitado na aceitação, executando a lógica idêntica à do hook desfazer_entregas_rota.js.
// Em seguida reverteremos/excluiremos após validação para manter migrações limpas.

migrate((app) => {
  const rotaId = '0ddzhu0dkrxdda2' // ROTA C
  const cicloId = 'lq8llo3zfz49p7b' // Ciclo 44/2026

  // 1. Apagar entrega_registros
  try {
    const entregas = app.findRecordsByFilter(
      'entrega_registros',
      'rota_id = {:rId} && ciclo_id = {:cId}',
      '-created',
      0,
      0,
      { rId: rotaId, cId: cicloId },
    )
    for (let i = 0; i < entregas.length; i++) {
      app.delete(entregas[i])
    }
  } catch (e) {
    console.warn('Erro ao apagar entrega_registros:', e)
  }

  // 2. Apagar entrega_comprovantes
  try {
    const comprovantes = app.findRecordsByFilter(
      'entrega_comprovantes',
      'rota_id = {:rId} && ciclo_id = {:cId}',
      '-created',
      0,
      0,
      { rId: rotaId, cId: cicloId },
    )
    for (let i = 0; i < comprovantes.length; i++) {
      app.delete(comprovantes[i])
    }
  } catch (e) {
    console.warn('Erro ao apagar entrega_comprovantes:', e)
  }

  // 3. Voltar pedidos para 'Pendente'
  try {
    const pedidos = app.findRecordsByFilter(
      'pedidos',
      'rota_id = {:rId} && ciclo_id = {:cId}',
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
      app.save(p)
    }
  } catch (e) {
    console.warn('Erro ao reverter pedidos:', e)
  }

  // 4. Limpar / desativar despachos
  try {
    const despachos = app.findRecordsByFilter(
      'rota_despachos',
      'rota_id = {:rId} && ciclo_id = {:cId}',
      '-created',
      0,
      0,
      { rId: rotaId, cId: cicloId },
    )
    for (let i = 0; i < despachos.length; i++) {
      const d = despachos[i]
      d.set('ativo', false)
      d.set('status', 'Desfeito')
      d.set('motorista_id', null)
      d.set('driver_token', '')
      d.set('link_portal_motorista', '')
      d.set('pedidos_em_rota_ids', [])
      d.set('total_entregas_esperadas', 0)
      d.set('observacao', 'Despacho desfeito pela central - entregas reiniciadas')
      app.save(d)
    }
  } catch (e) {
    console.warn('Erro ao limpar rota_despachos:', e)
  }

  // 5. Resetar rota logistica
  try {
    const rota = app.findRecordById('rotas', rotaId)
    rota.set('caminhao_posicao_atual', 0)
    rota.set('caminhao_escola_id', '')
    app.save(rota)
  } catch (e) {
    console.warn('Erro ao resetar posicao da rota:', e)
  }

  // 6. Apagar coordenada_sugestoes
  try {
    const revisoes = app.findRecordsByFilter(
      'coordenada_sugestoes',
      'rota_id = {:rId} && ciclo_id = {:cId}',
      '-created',
      0,
      0,
      { rId: rotaId, cId: cicloId },
    )
    for (let i = 0; i < revisoes.length; i++) {
      app.delete(revisoes[i])
    }
  } catch (e) {
    console.warn('Erro ao apagar coordenada_sugestoes:', e)
  }
})
