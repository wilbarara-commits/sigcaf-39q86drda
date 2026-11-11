// Migration de reparo pontual (idempotente) para o ciclo 44/2026 (lq8llo3zfz49p7b):
// 1. ROTA A (6xus8ajo8rv5vdo): a composição viva (paradas_rota) ficou com numeração
//    corrompida (ordens duplicadas 1 e 2, vãos nas posições 6 e 9) após a movimentação
//    de escolas de 02/11. Renumera em sequência limpa 1..N preservando a ordem relativa
//    atual e regrava o snapshot 'edicao' da rota a partir da composição corrigida.
// 2. ROTA C (0ddzhu0dkrxdda2): apaga o snapshot 'despacho' órfão deixado pela operação
//    de desfazer entregas (0.0.275) — entregas, comprovantes e despacho já foram limpos.
// Ciclos fechados/entregues e as rotas B e C (composição viva) jamais são tocados.
// Idempotente: se a sequência já estiver limpa e o snapshot órfão não existir, é no-op.

migrate(
  (app) => {
    const rotaAId = '6xus8ajo8rv5vdo'
    const rotaCId = '0ddzhu0dkrxdda2'
    const cicloId = 'lq8llo3zfz49p7b'

    // ---------- 1. ROTA A: renumerar composição viva 1..N ----------
    const paradas = app.findRecordsByFilter(
      'paradas_rota',
      'rota_id = {:rId}',
      'ordem,created',
      0,
      0,
      { rId: rotaAId },
    )

    // Ordena preservando a ordem relativa atual (ordem, desempate por created)
    const ordenadas = []
    for (let i = 0; i < paradas.length; i++) {
      ordenadas.push(paradas[i])
    }
    ordenadas.sort((a, b) => {
      const oa = a.getInt('ordem')
      const ob = b.getInt('ordem')
      if (oa !== ob) return oa - ob
      return a.getString('created') < b.getString('created') ? -1 : 1
    })

    // Dedup: se houver escola repetida, mantém a primeira
    const vistos = {}
    const finais = []
    for (let i = 0; i < ordenadas.length; i++) {
      const eid = ordenadas[i].getString('escola_id')
      if (vistos[eid]) continue
      vistos[eid] = true
      finais.push(ordenadas[i])
    }

    let alterou = false
    for (let i = 0; i < finais.length; i++) {
      const p = finais[i]
      const novaOrdem = i + 1
      if (p.getInt('ordem') !== novaOrdem) {
        p.set('ordem', novaOrdem)
        app.save(p)
        alterou = true
      }
    }
    console.log(
      '[0147] ROTA A: paradas vivas renumeradas (alterou=' +
        alterou +
        ', total=' +
        finais.length +
        ')',
    )

    // ---------- 1b. Regrava o snapshot 'edicao' da ROTA A no ciclo 44/2026 ----------
    try {
      const nomes = {}
      const escolas = app.findRecordsByFilter('escolas', 'id != ""', '-created', 0, 0)
      for (let i = 0; i < escolas.length; i++) {
        nomes[escolas[i].id] = escolas[i].getString('nome')
      }

      const snapshot = []
      const vistosSnap = {}
      for (let i = 0; i < finais.length; i++) {
        const p = finais[i]
        const eid = p.getString('escola_id')
        if (vistosSnap[eid]) continue
        vistosSnap[eid] = true
        let nome = nomes[eid] || ''
        if (!nome) {
          try {
            const esc = app.findRecordById('escolas', eid)
            nome = esc.getString('nome')
          } catch (_) {}
        }
        snapshot.push({
          escola_id: eid,
          ordem: i + 1,
          escola_nome: nome,
        })
      }

      const snaps = app.findRecordsByFilter(
        'rota_snapshots',
        "rota_id = {:rid} && ciclo_id = {:cid} && versao_evento = 'edicao'",
        '-snapshot_em',
        0,
        0,
        { rid: rotaAId, cid: cicloId },
      )
      for (let i = 0; i < snaps.length; i++) {
        const snap = snaps[i]
        snap.set('paradas_snapshot', JSON.stringify(snapshot))
        snap.set('total_paradas', snapshot.length)
        snap.set('snapshot_em', new Date().toISOString())
        app.save(snap)
      }
      console.log(
        '[0147] ROTA A: snapshot edicao regravado com ' +
          snapshot.length +
          ' paradas (' +
          snaps.length +
          ' snapshot(s))',
      )
    } catch (err) {
      console.log('[0147] Falha ao regravar snapshot edicao da ROTA A: ' + err)
    }

    // ---------- 2. ROTA C: apagar snapshot 'despacho' órfão do ciclo 44/2026 ----------
    try {
      const orfaos = app.findRecordsByFilter(
        'rota_snapshots',
        "rota_id = {:rid} && ciclo_id = {:cid} && versao_evento = 'despacho'",
        '-created',
        0,
        0,
        { rid: rotaCId, cid: cicloId },
      )
      for (let i = 0; i < orfaos.length; i++) {
        app.delete(orfaos[i])
        console.log('[0147] ROTA C: snapshot despacho órfão apagado (' + orfaos[i].id + ')')
      }
      if (orfaos.length === 0) {
        console.log('[0147] ROTA C: nenhum snapshot despacho órfão a apagar (idempotente)')
      }
    } catch (err) {
      console.log('[0147] Falha ao apagar snapshot despacho órfão da ROTA C: ' + err)
    }
  },
  (app) => {
    // Down: não há reverso — operação de reparo de dados pontual
  },
)
