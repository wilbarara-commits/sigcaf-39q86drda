migrate(
  (app) => {
    // Obter coleções existentes
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const produtosCol = app.findCollectionByNameOrId('produtos')
    const escolasCol = app.findCollectionByNameOrId('escolas')
    const contratosCol = app.findCollectionByNameOrId('contratos')
    const contratoItensCol = app.findCollectionByNameOrId('contrato_itens')
    const pedidosCol = app.findCollectionByNameOrId('pedidos')

    // 1. Criar collection ciclos: nome, data_inicio, data_fim, status (coletando/correcao/fechado), snapshot (json)
    const ciclos = new Collection({
      name: 'ciclos',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'data_inicio', type: 'date', required: true },
        { name: 'data_fim', type: 'date', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['coletando', 'correcao', 'fechado'],
          maxSelect: 1,
        },
        { name: 'snapshot', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_ciclos_status ON ciclos (status)',
        'CREATE INDEX idx_ciclos_datas ON ciclos (data_inicio, data_fim)',
      ],
    })
    app.save(ciclos)
    const ciclosCol = app.findCollectionByNameOrId('ciclos')

    // 2. Atualizar produtos: essencial (bool), disponibilidade (select: normal/escassez/abundancia)
    if (!produtosCol.fields.getByName('essencial')) {
      produtosCol.fields.add(
        new BoolField({
          name: 'essencial',
          required: false,
        }),
      )
    }
    if (!produtosCol.fields.getByName('disponibilidade')) {
      produtosCol.fields.add(
        new SelectField({
          name: 'disponibilidade',
          required: false,
          values: ['normal', 'escassez', 'abundancia'],
          maxSelect: 1,
        }),
      )
    }
    app.save(produtosCol)

    // 3. Atualizar contratos: modalidade_pedido (select: individualizado/centralizado)
    if (!contratosCol.fields.getByName('modalidade_pedido')) {
      contratosCol.fields.add(
        new SelectField({
          name: 'modalidade_pedido',
          required: false,
          values: ['individualizado', 'centralizado'],
          maxSelect: 1,
        }),
      )
    }
    app.save(contratosCol)

    // Atualizar contrato_itens: cota_anual (number)
    if (!contratoItensCol.fields.getByName('cota_anual')) {
      contratoItensCol.fields.add(
        new NumberField({
          name: 'cota_anual',
          required: false,
          min: 0,
        }),
      )
      app.save(contratoItensCol)
    }

    // 4. Criar rotas: contrato_id (relation -> contratos), nome, ordem
    const rotas = new Collection({
      name: 'rotas',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        {
          name: 'contrato_id',
          type: 'relation',
          required: true,
          collectionId: contratosCol.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'nome', type: 'text', required: true },
        { name: 'ordem', type: 'number', min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_rotas_contrato ON rotas (contrato_id)',
        'CREATE INDEX idx_rotas_nome ON rotas (nome)',
      ],
    })
    app.save(rotas)
    const rotasCol = app.findCollectionByNameOrId('rotas')

    // 5. Criar contrato_escolas: contrato_id (relation -> contratos), escola_id (relation -> escolas), rota_id (relation -> rotas)
    const contratoEscolas = new Collection({
      name: 'contrato_escolas',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        {
          name: 'contrato_id',
          type: 'relation',
          required: true,
          collectionId: contratosCol.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'escola_id',
          type: 'relation',
          required: true,
          collectionId: escolasCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'rota_id',
          type: 'relation',
          required: false,
          collectionId: rotasCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_contrato_escolas_contrato ON contrato_escolas (contrato_id)',
        'CREATE INDEX idx_contrato_escolas_escola ON contrato_escolas (escola_id)',
      ],
    })
    app.save(contratoEscolas)
    const contratoEscolasCol = app.findCollectionByNameOrId('contrato_escolas')

    // 6. Atualizar pedidos: ciclo_id (relation -> ciclos), origem (select: excel/whatsapp/manual), rota_id (relation -> rotas), validacao (json)
    if (!pedidosCol.fields.getByName('ciclo_id')) {
      pedidosCol.fields.add(
        new RelationField({
          name: 'ciclo_id',
          required: false,
          collectionId: ciclosCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }
    if (!pedidosCol.fields.getByName('origem')) {
      pedidosCol.fields.add(
        new SelectField({
          name: 'origem',
          required: false,
          values: ['excel', 'whatsapp', 'manual'],
          maxSelect: 1,
        }),
      )
    }
    if (!pedidosCol.fields.getByName('rota_id')) {
      pedidosCol.fields.add(
        new RelationField({
          name: 'rota_id',
          required: false,
          collectionId: rotasCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }
    if (!pedidosCol.fields.getByName('validacao')) {
      pedidosCol.fields.add(
        new JSONField({
          name: 'validacao',
          required: false,
        }),
      )
    }
    app.save(pedidosCol)

    // 7. Criar collection envios_whatsapp: ciclo_id, escola_id, status, enviado_em
    const enviosWhatsapp = new Collection({
      name: 'envios_whatsapp',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        {
          name: 'ciclo_id',
          type: 'relation',
          required: true,
          collectionId: ciclosCol.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'escola_id',
          type: 'relation',
          required: true,
          collectionId: escolasCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pendente', 'enviado', 'falha'],
          maxSelect: 1,
        },
        { name: 'enviado_em', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_envios_wa_ciclo ON envios_whatsapp (ciclo_id)',
        'CREATE INDEX idx_envios_wa_escola ON envios_whatsapp (escola_id)',
      ],
    })
    app.save(enviosWhatsapp)

    // 8. Criar collection importacoes: ciclo_id, contrato_id, arquivo, data, usuario_id, linhas_total, linhas_ok, linhas_erro, erros (json)
    const importacoes = new Collection({
      name: 'importacoes',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        {
          name: 'ciclo_id',
          type: 'relation',
          required: true,
          collectionId: ciclosCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'contrato_id',
          type: 'relation',
          required: true,
          collectionId: contratosCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'arquivo', type: 'text' },
        { name: 'data', type: 'date', required: true },
        {
          name: 'usuario_id',
          type: 'relation',
          required: false,
          collectionId: usersCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'linhas_total', type: 'number', min: 0 },
        { name: 'linhas_ok', type: 'number', min: 0 },
        { name: 'linhas_erro', type: 'number', min: 0 },
        { name: 'erros', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_importacoes_ciclo ON importacoes (ciclo_id)',
        'CREATE INDEX idx_importacoes_contrato ON importacoes (contrato_id)',
      ],
    })
    app.save(importacoes)

    // 9. MIGRAÇÃO DE DADOS NÃO-DESTRUTIVA:
    // Criar um ciclo ativo inicial em fase 'coletando' caso não exista
    let cicloAtivoId = null
    const existingCiclos = app.findRecordsByFilter('ciclos', '', '-created', 1, 0)
    if (existingCiclos.length === 0) {
      const novoCiclo = new Record(ciclosCol)
      novoCiclo.set('nome', 'Ciclo Semanal 01/2026')
      novoCiclo.set('data_inicio', '2026-07-01 00:00:00.000Z')
      novoCiclo.set('data_fim', '2026-07-07 23:59:59.000Z')
      novoCiclo.set('status', 'coletando')
      novoCiclo.set('snapshot', {})
      app.save(novoCiclo)
      cicloAtivoId = novoCiclo.id
    } else {
      cicloAtivoId = existingCiclos[0].id
    }

    // Criar rotas padrão para os contratos existentes e migrar instituicao_id para contrato_escolas
    const existingContratos = app.findRecordsByFilter('contratos', '', 'created', 100, 0)
    for (const c of existingContratos) {
      // Set default modalidade_pedido
      if (!c.get('modalidade_pedido')) {
        c.set('modalidade_pedido', 'individualizado')
        app.save(c)
      }

      // Check or create default rotas for this contract (ex: ROTA A, ROTA B)
      let rotaARec = null
      let rotaBRec = null
      const existingRotas = app.findRecordsByFilter(
        'rotas',
        `contrato_id = "${c.id}"`,
        'ordem',
        10,
        0,
      )
      if (existingRotas.length === 0) {
        rotaARec = new Record(rotasCol)
        rotaARec.set('contrato_id', c.id)
        rotaARec.set('nome', 'ROTA A')
        rotaARec.set('ordem', 1)
        app.save(rotaARec)

        rotaBRec = new Record(rotasCol)
        rotaBRec.set('contrato_id', c.id)
        rotaBRec.set('nome', 'ROTA B')
        rotaBRec.set('ordem', 2)
        app.save(rotaBRec)
      } else {
        rotaARec = existingRotas[0]
      }

      // Migrar instituicao_id existente para contrato_escolas antes de remover instituicao_id
      const instId = c.get('instituicao_id')
      if (instId) {
        const ceCheck = app.findRecordsByFilter(
          'contrato_escolas',
          `contrato_id = "${c.id}" && escola_id = "${instId}"`,
          '',
          1,
          0,
        )
        if (ceCheck.length === 0) {
          const ce = new Record(contratoEscolasCol)
          ce.set('contrato_id', c.id)
          ce.set('escola_id', instId)
          if (rotaARec) {
            ce.set('rota_id', rotaARec.id)
          }
          app.save(ce)
        }
      }
    }

    // Atualizar pedidos existentes com ciclo_id e origem padrão (manual) se vazios
    const existingPedidos = app.findRecordsByFilter('pedidos', '', 'created', 100, 0)
    for (const ped of existingPedidos) {
      let needsSave = false
      if (!ped.get('ciclo_id') && cicloAtivoId) {
        ped.set('ciclo_id', cicloAtivoId)
        needsSave = true
      }
      if (!ped.get('origem')) {
        ped.set('origem', 'manual')
        needsSave = true
      }
      if (!ped.get('validacao')) {
        ped.set('validacao', { status: 'validado', motivo: 'Migração de registros legados' })
        needsSave = true
      }
      if (needsSave) {
        app.save(ped)
      }
    }

    // Atualizar produtos existentes com disponibilidade normal e essencial se não preenchidos
    const existingProdutos = app.findRecordsByFilter('produtos', '', 'created', 100, 0)
    for (const prod of existingProdutos) {
      let needsSave = false
      if (!prod.get('disponibilidade')) {
        prod.set('disponibilidade', 'normal')
        needsSave = true
      }
      // Marcar alguns produtos como essenciais de exemplo (Alface, Feijão)
      if (prod.get('essencial') === undefined || prod.get('essencial') === null) {
        const nome = prod.getString('nome') || ''
        if (nome.includes('Alface') || nome.includes('Feijão') || nome.includes('Batata')) {
          prod.set('essencial', true)
        } else {
          prod.set('essencial', false)
        }
        needsSave = true
      }
      if (needsSave) {
        app.save(prod)
      }
    }

    // Atualizar cota_anual de contrato_itens existentes com um valor default razoável (ex: 500 ou 1000)
    const existingItens = app.findRecordsByFilter('contrato_itens', '', 'created', 100, 0)
    for (const item of existingItens) {
      if (!item.get('cota_anual') || item.get('cota_anual') === 0) {
        item.set('cota_anual', 500)
        app.save(item)
      }
    }

    // Agora que migramos instituicao_id para contrato_escolas, podemos remover o campo de contratos
    // Remover o índice idx_contratos_instituicao primeiro caso exista
    try {
      contratosCol.removeIndex('idx_contratos_instituicao')
    } catch (_) {}
    if (contratosCol.fields.getByName('instituicao_id')) {
      contratosCol.fields.removeByName('instituicao_id')
      app.save(contratosCol)
    }
  },
  (app) => {
    // Reverter coleções criadas
    const toDelete = ['importacoes', 'envios_whatsapp', 'contrato_escolas', 'rotas', 'ciclos']
    for (const name of toDelete) {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    }
  },
)
