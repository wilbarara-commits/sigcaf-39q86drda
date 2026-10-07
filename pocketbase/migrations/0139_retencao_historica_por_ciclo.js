/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0139: Camada de persistência histórica por ciclo operacional (SIGCAF)
 *
 * 1. Campos de retenção direta em entrega_registros (para preservar ciclo_id e chamada_id).
 * 2. Coleção `rota_snapshots`: Snapshot imutável da rota por ciclo/chamada.
 *    Armazena a composição no momento do despacho e do fechamento:
 *    - ciclo_id, chamada_id, rota_id, motorista_id, despacho_id, versao_evento ('despacho'|'fechamento'),
 *    - rota_nome, total_paradas, total_pedidos, paradas_snapshot (JSON com ordem, escola_id, escola_nome, endereco, contrato),
 *    - snapshot_em (data/hora do snapshot)
 * 3. Coleção `entrega_comprovantes`: Retenção imutável de comprovantes de entrega por escola/pedido/ciclo:
 *    - ciclo_id, chamada_id, rota_id, escola_id, pedido_id, motorista_id, registro_id,
 *    - escola_nome, responsavel_nome, responsavel_cpf, chegada_em, confirmado_em,
 *    - assinatura (editor/base64), foto (editor/base64), observacao, origem ('portal_motorista'|'fechamento_secretaria'|'backfill')
 * 4. Backfill idempotente:
 *    - Varre todos os registros de `entrega_registros` existentes e vincula aos respectivos ciclos/chamadas e cria os `entrega_comprovantes`.
 *    - Para rotas já entregues/fechadas ou despachadas (ex: Chamada 01/2025 Rota A, Chamada 07/2025 Rota A, Rota C, Rota B),
 *      gera os snapshots históricos em `rota_snapshots` e preenche `entrega_comprovantes` para todos os pedidos entregues,
 *      garantindo que fotos, assinaturas, conferentes e dados por escola fiquem preservados permanentemente por ciclo.
 */
migrate(
  (app) => {
    const rotasCol = app.findCollectionByNameOrId('rotas')
    const escolasCol = app.findCollectionByNameOrId('escolas')
    const pedidosCol = app.findCollectionByNameOrId('pedidos')

    let chamadasColId = ''
    try {
      chamadasColId = app.findCollectionByNameOrId('chamadas').id
    } catch (_) {}

    let ciclosColId = ''
    try {
      ciclosColId = app.findCollectionByNameOrId('ciclos').id
    } catch (_) {}

    let motoristasColId = ''
    try {
      motoristasColId = app.findCollectionByNameOrId('motoristas').id
    } catch (_) {}

    let rotaDespachosColId = ''
    try {
      rotaDespachosColId = app.findCollectionByNameOrId('rota_despachos').id
    } catch (_) {}

    // =========================================================================
    // 1. Enriquecer `entrega_registros` com campos de ciclo e chamada (se faltarem)
    // =========================================================================
    const entregaRegCol = app.findCollectionByNameOrId('entrega_registros')
    let alterouEntregaReg = false

    if (!entregaRegCol.fields.getByName('ciclo_id') && ciclosColId) {
      entregaRegCol.fields.add(
        new RelationField({
          name: 'ciclo_id',
          required: false,
          collectionId: ciclosColId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      alterouEntregaReg = true
    }

    if (!entregaRegCol.fields.getByName('chamada_id') && chamadasColId) {
      entregaRegCol.fields.add(
        new RelationField({
          name: 'chamada_id',
          required: false,
          collectionId: chamadasColId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
      alterouEntregaReg = true
    }

    if (alterouEntregaReg) {
      app.save(entregaRegCol)
      console.log('[0139] Campos ciclo_id e chamada_id adicionados a entrega_registros.')
    }

    // =========================================================================
    // 2. Criar coleção `rota_snapshots` (Snapshot imutável de rota por ciclo)
    // =========================================================================
    let rotaSnapshotsCol
    try {
      rotaSnapshotsCol = app.findCollectionByNameOrId('rota_snapshots')
    } catch (_) {
      const fields = [
        {
          name: 'rota_id',
          type: 'relation',
          required: true,
          collectionId: rotasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
      ]

      if (ciclosColId) {
        fields.push({
          name: 'ciclo_id',
          type: 'relation',
          required: false,
          collectionId: ciclosColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (chamadasColId) {
        fields.push({
          name: 'chamada_id',
          type: 'relation',
          required: false,
          collectionId: chamadasColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (motoristasColId) {
        fields.push({
          name: 'motorista_id',
          type: 'relation',
          required: false,
          collectionId: motoristasColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (rotaDespachosColId) {
        fields.push({
          name: 'despacho_id',
          type: 'relation',
          required: false,
          collectionId: rotaDespachosColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      fields.push(
        { name: 'rota_nome', type: 'text', required: true },
        { name: 'versao_evento', type: 'text', required: false }, // 'despacho' | 'fechamento' | 'manual'
        { name: 'total_paradas', type: 'number', required: false },
        { name: 'total_pedidos', type: 'number', required: false },
        { name: 'paradas_snapshot', type: 'json', required: false }, // Lista ordenada [{escola_id, escola_nome, ordem, endereco, contrato}]
        { name: 'snapshot_em', type: 'date', required: false },
        { name: 'observacao', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      )

      rotaSnapshotsCol = new Collection({
        name: 'rota_snapshots',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '@request.auth.id != ""',
        fields: fields,
        indexes: [],
      })
      app.save(rotaSnapshotsCol)
      console.log('[0139] Coleção rota_snapshots criada com sucesso.')
    }

    // =========================================================================
    // 3. Criar coleção `entrega_comprovantes` (Comprovante permanente por escola/pedido/ciclo)
    // =========================================================================
    let entregaComprovantesCol
    try {
      entregaComprovantesCol = app.findCollectionByNameOrId('entrega_comprovantes')
    } catch (_) {
      const fields = [
        {
          name: 'escola_id',
          type: 'relation',
          required: true,
          collectionId: escolasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'rota_id',
          type: 'relation',
          required: false,
          collectionId: rotasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
      ]

      if (ciclosColId) {
        fields.push({
          name: 'ciclo_id',
          type: 'relation',
          required: false,
          collectionId: ciclosColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (chamadasColId) {
        fields.push({
          name: 'chamada_id',
          type: 'relation',
          required: false,
          collectionId: chamadasColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      fields.push({
        name: 'pedido_id',
        type: 'relation',
        required: false,
        collectionId: pedidosCol.id,
        cascadeDelete: false,
        maxSelect: 1,
      })

      if (motoristasColId) {
        fields.push({
          name: 'motorista_id',
          type: 'relation',
          required: false,
          collectionId: motoristasColId,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      if (entregaRegCol?.id) {
        fields.push({
          name: 'registro_id',
          type: 'relation',
          required: false,
          collectionId: entregaRegCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        })
      }

      fields.push(
        { name: 'escola_nome', type: 'text', required: false },
        { name: 'responsavel_nome', type: 'text', required: false },
        { name: 'responsavel_cpf', type: 'text', required: false },
        { name: 'chegada_em', type: 'date', required: false },
        { name: 'confirmado_em', type: 'date', required: false },
        { name: 'assinatura', type: 'editor', required: false }, // Base64 PNG
        { name: 'foto', type: 'editor', required: false }, // Base64 JPEG
        { name: 'observacao', type: 'text', required: false },
        { name: 'origem', type: 'text', required: false }, // 'portal_motorista' | 'fechamento_secretaria' | 'backfill'
        { name: 'client_uid', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      )

      entregaComprovantesCol = new Collection({
        name: 'entrega_comprovantes',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '@request.auth.id != ""',
        fields: fields,
        indexes: [],
      })
      app.save(entregaComprovantesCol)
      console.log('[0139] Coleção entrega_comprovantes criada com sucesso.')
    }

    // =========================================================================
    // 4. BACKFILL IDEMPOTENTE
    // =========================================================================
    try {
      const nowIso = new Date().toISOString()
      const comprovantesCol = app.findCollectionByNameOrId('entrega_comprovantes')
      const snapshotsCol = app.findCollectionByNameOrId('rota_snapshots')

      // Cache de escolas (id -> nome)
      const todasEscolas = app.findRecordsByFilter('escolas', '', '', 5000, 0)
      const escolaMap = new Map()
      for (const esc of todasEscolas) {
        escolaMap.set(esc.id, esc.get('nome') || '')
      }

      // Cache de rotas (id -> {id, nome, chamada_id, contrato_id})
      const todasRotas = app.findRecordsByFilter('rotas', '', '', 500, 0)
      const rotaMap = new Map()
      for (const r of todasRotas) {
        rotaMap.set(r.id, {
          id: r.id,
          nome: r.get('nome') || '',
          chamada_id: r.get('chamada_id') || '',
          contrato_id: r.get('contrato_id') || '',
        })
      }

      // Cache de despachos (id -> {id, rota_id, ciclo_id, chamada_id, motorista_id})
      const todosRotaDespachos = app.findRecordsByFilter('rota_despachos', '', '-created', 1000, 0)
      const despachoMap = new Map()
      for (const d of todosRotaDespachos) {
        despachoMap.set(d.id, {
          id: d.id,
          rota_id: d.get('rota_id') || '',
          ciclo_id: d.get('ciclo_id') || '',
          chamada_id: d.get('chamada_id') || '',
          motorista_id: d.get('motorista_id') || '',
        })
      }

      // 4.1 Backfill em `entrega_registros`: preencher ciclo_id e chamada_id caso estejam nulos
      const todosEntregaRegistros = app.findRecordsByFilter(
        'entrega_registros',
        '',
        'created',
        1000,
        0,
      )
      let atualizadosEntregaReg = 0

      for (const reg of todosEntregaRegistros) {
        let mudou = false
        const dId = reg.get('despacho_id')
        const despInfo = dId ? despachoMap.get(dId) : null
        const rId = reg.get('rota_id')
        const rotaInfo = rId ? rotaMap.get(rId) : null

        if (!reg.get('ciclo_id') && despInfo?.ciclo_id) {
          reg.set('ciclo_id', despInfo.ciclo_id)
          mudou = true
        }
        if (!reg.get('chamada_id')) {
          const chId = despInfo?.chamada_id || rotaInfo?.chamada_id
          if (chId) {
            reg.set('chamada_id', chId)
            mudou = true
          }
        }
        if (mudou) {
          app.save(reg)
          atualizadosEntregaReg++
        }

        // Criar/atualizar registro correspondente em `entrega_comprovantes`
        const escolaId = reg.get('escola_id')
        const cicloId = reg.get('ciclo_id') || despInfo?.ciclo_id || ''
        const chamadaId =
          reg.get('chamada_id') || despInfo?.chamada_id || rotaInfo?.chamada_id || ''
        const filterComp = `escola_id = "${escolaId}" && registro_id = "${reg.id}"`
        const compsExistentes = app.findRecordsByFilter(
          'entrega_comprovantes',
          filterComp,
          '',
          1,
          0,
        )

        if (compsExistentes.length === 0) {
          const cRec = new Record(comprovantesCol)
          cRec.set('escola_id', escolaId)
          cRec.set('escola_nome', escolaMap.get(escolaId) || '')
          cRec.set('rota_id', rId)
          cRec.set('ciclo_id', cicloId)
          cRec.set('chamada_id', chamadaId)
          cRec.set('motorista_id', reg.get('motorista_id') || despInfo?.motorista_id || '')
          cRec.set('registro_id', reg.id)
          cRec.set('responsavel_nome', reg.get('responsavel_nome') || '')
          cRec.set('responsavel_cpf', reg.get('responsavel_cpf') || '')
          cRec.set('chegada_em', reg.get('chegada_em') || '')
          cRec.set('confirmado_em', reg.get('confirmado_em') || reg.get('created') || '')
          cRec.set('assinatura', reg.get('assinatura') || '')
          cRec.set('foto', reg.get('foto') || '')
          cRec.set('observacao', reg.get('observacao') || '')
          cRec.set('origem', 'portal_motorista')
          cRec.set('client_uid', reg.get('client_uid') || '')
          app.save(cRec)
        }
      }
      console.log(`[0139] entrega_registros enriquecidos: ${atualizadosEntregaReg}`)

      // 4.2 Backfill para todos os pedidos com status 'Entregue'
      // Se a escola ainda não tiver um comprovante para o ciclo desse pedido, cria registro em `entrega_comprovantes`
      const pedidosEntregues = app.findRecordsByFilter(
        'pedidos',
        'status = "Entregue"',
        '-created',
        5000,
        0,
      )
      let pedidosBackfilled = 0

      for (const ped of pedidosEntregues) {
        const pedId = ped.id
        const escId = ped.get('escola_id')
        const cicId = ped.get('ciclo_id')
        const rotId = ped.get('rota_id')
        const rotaObj = rotId ? rotaMap.get(rotId) : null
        const chamId = rotaObj?.chamada_id || ''

        // Verificar se já existe comprovante para este pedido ou para esta escola no ciclo
        let compExist = app.findRecordsByFilter(
          'entrega_comprovantes',
          `pedido_id = "${pedId}"`,
          '',
          1,
          0,
        )

        if (compExist.length === 0) {
          // Tenta ver se já temos um comprovante por escola e ciclo
          let compPorEscolaCiclo = []
          if (cicId) {
            compPorEscolaCiclo = app.findRecordsByFilter(
              'entrega_comprovantes',
              `escola_id = "${escId}" && ciclo_id = "${cicId}"`,
              '-confirmado_em',
              1,
              0,
            )
          }

          const cRec = new Record(comprovantesCol)
          cRec.set('escola_id', escId)
          cRec.set('escola_nome', escolaMap.get(escId) || '')
          cRec.set('rota_id', rotId)
          cRec.set('ciclo_id', cicId)
          cRec.set('chamada_id', chamId)
          cRec.set('pedido_id', pedId)
          cRec.set('confirmado_em', ped.get('entregue_em') || ped.get('updated') || nowIso)
          cRec.set('observacao', ped.get('observacao_entrega') || '')

          if (compPorEscolaCiclo.length > 0) {
            // Reaproveita foto, assinatura e responsável caso existam da entrega da mesma escola
            const fonte = compPorEscolaCiclo[0]
            cRec.set('responsavel_nome', fonte.get('responsavel_nome') || '')
            cRec.set('responsavel_cpf', fonte.get('responsavel_cpf') || '')
            cRec.set('chegada_em', fonte.get('chegada_em') || '')
            cRec.set('assinatura', fonte.get('assinatura') || '')
            cRec.set('foto', fonte.get('foto') || '')
            cRec.set('motorista_id', fonte.get('motorista_id') || '')
            cRec.set('registro_id', fonte.get('registro_id') || '')
            cRec.set('origem', 'portal_motorista')
          } else {
            cRec.set('origem', 'fechamento_secretaria')
          }

          app.save(cRec)
          pedidosBackfilled++
        }
      }
      console.log(`[0139] Pedidos entregues com comprovante retido criados: ${pedidosBackfilled}`)

      // 4.3 Backfill de Snapshots de Rota por Ciclo (`rota_snapshots`)
      // Para cada combinação única de (rota_id, ciclo_id) presente em pedidos ou despachos,
      // salva um snapshot definitivo com a lista ordenada de paradas e escolas.
      const paradasCadastradas = app.findRecordsByFilter(
        'paradas_rota',
        '',
        'rota_id,ordem',
        5000,
        0,
      )
      const paradasPorRotaMap = new Map()
      for (const p of paradasCadastradas) {
        const rId = p.get('rota_id')
        if (!paradasPorRotaMap.has(rId)) {
          paradasPorRotaMap.set(rId, [])
        }
        paradasPorRotaMap.get(rId).push({
          escola_id: p.get('escola_id'),
          escola_nome: escolaMap.get(p.get('escola_id')) || '',
          ordem: Number(p.get('ordem')) || 1,
        })
      }

      // Identificar rotas e ciclos a registrar
      // (a) Via rota_despachos
      const paresRotaCiclo = new Map()
      for (const d of todosRotaDespachos) {
        const rId = d.get('rota_id')
        const cId = d.get('ciclo_id')
        const chId = d.get('chamada_id')
        if (rId && cId) {
          paresRotaCiclo.set(`${rId}:${cId}`, {
            rota_id: rId,
            ciclo_id: cId,
            chamada_id: chId,
            motorista_id: d.get('motorista_id') || '',
            despacho_id: d.id,
            snapshot_em: d.get('despachado_em') || d.get('created') || nowIso,
          })
        }
      }

      // (b) Via pedidos entregues
      for (const p of pedidosEntregues) {
        const rId = p.get('rota_id')
        const cId = p.get('ciclo_id')
        if (rId && cId && !paresRotaCiclo.has(`${rId}:${cId}`)) {
          const rotaObj = rotaMap.get(rId)
          paresRotaCiclo.set(`${rId}:${cId}`, {
            rota_id: rId,
            ciclo_id: cId,
            chamada_id: rotaObj?.chamada_id || '',
            motorista_id: '',
            despacho_id: '',
            snapshot_em: p.get('entregue_em') || p.get('created') || nowIso,
          })
        }
      }

      let snapshotsCriados = 0
      for (const [key, item] of paresRotaCiclo.entries()) {
        const snapExist = app.findRecordsByFilter(
          'rota_snapshots',
          `rota_id = "${item.rota_id}" && ciclo_id = "${item.ciclo_id}"`,
          '',
          1,
          0,
        )

        if (snapExist.length === 0) {
          const paradas = paradasPorRotaMap.get(item.rota_id) || []
          const rotaObj = rotaMap.get(item.rota_id)
          const rotaNome = rotaObj?.nome || 'Rota'

          // Contar pedidos da rota no ciclo
          const peds = app.findRecordsByFilter(
            'pedidos',
            `rota_id = "${item.rota_id}" && ciclo_id = "${item.ciclo_id}"`,
            '',
            1000,
            0,
          )

          const sRec = new Record(snapshotsCol)
          sRec.set('rota_id', item.rota_id)
          sRec.set('ciclo_id', item.ciclo_id)
          sRec.set('chamada_id', item.chamada_id)
          sRec.set('motorista_id', item.motorista_id)
          sRec.set('despacho_id', item.despacho_id)
          sRec.set('rota_nome', rotaNome)
          sRec.set('versao_evento', 'fechamento')
          sRec.set('total_paradas', paradas.length)
          sRec.set('total_pedidos', peds.length)
          sRec.set('paradas_snapshot', JSON.stringify(paradas))
          sRec.set('snapshot_em', item.snapshot_em)
          sRec.set('observacao', 'Backfill automático de retenção histórica por ciclo')
          app.save(sRec)
          snapshotsCriados++
        }
      }
      console.log(`[0139] Snapshots históricos criados: ${snapshotsCriados}`)
    } catch (errBackfill) {
      console.warn('[0139] Aviso durante backfill de retenção histórica:', errBackfill)
    }
  },
  (app) => {
    // Reversão segura não-destrutiva
  },
)
