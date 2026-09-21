migrate(
  (app) => {
    const produtosCol = app.findCollectionByNameOrId('produtos')
    const escolasCol = app.findCollectionByNameOrId('escolas')
    const contratosCol = app.findCollectionByNameOrId('contratos')
    const contratoItensCol = app.findCollectionByNameOrId('contrato_itens')
    const pedidosCol = app.findCollectionByNameOrId('pedidos')
    const pedidoItensCol = app.findCollectionByNameOrId('pedido_itens')
    const atestosCol = app.findCollectionByNameOrId('atestos')

    // 1. Seed Produtos
    const produtosData = [
      {
        nome: 'Alface Crespa',
        categoria: 'Hortaliças',
        estoque: 150,
        unidade: 'Maço',
        preco_unitario: 2.5,
      },
      {
        nome: 'Tomate Carmem',
        categoria: 'Frutas',
        estoque: 80,
        unidade: 'Kg',
        preco_unitario: 6.0,
      },
      {
        nome: 'Cenoura',
        categoria: 'Hortaliças',
        estoque: 120,
        unidade: 'Kg',
        preco_unitario: 4.5,
      },
      {
        nome: 'Feijão Carioca',
        categoria: 'Grãos',
        estoque: 500,
        unidade: 'Kg',
        preco_unitario: 8.0,
      },
      {
        nome: 'Banana Prata',
        categoria: 'Frutas',
        estoque: 200,
        unidade: 'Kg',
        preco_unitario: 5.5,
      },
      {
        nome: 'Batata Inglesa',
        categoria: 'Legumes',
        estoque: 350,
        unidade: 'Kg',
        preco_unitario: 4.0,
      },
    ]

    const seededProdutos = {}
    for (const p of produtosData) {
      let rec
      try {
        rec = app.findFirstRecordByData('produtos', 'nome', p.nome)
      } catch (_) {
        rec = new Record(produtosCol)
        rec.set('nome', p.nome)
        rec.set('categoria', p.categoria)
        rec.set('estoque', p.estoque)
        rec.set('unidade', p.unidade)
        rec.set('preco_unitario', p.preco_unitario)
        app.save(rec)
      }
      seededProdutos[p.nome] = rec.id
    }

    // 2. Seed Escolas
    const escolasData = [
      {
        nome: 'E.M. João da Silva',
        endereco: 'Rua das Flores, 123',
        telefone: '(11) 98765-4321',
        rota: 'Rota Sul',
      },
      {
        nome: 'E.E. Maria Antonieta',
        endereco: 'Av. Brasil, 456',
        telefone: '(11) 91234-5678',
        rota: 'Rota Norte',
      },
      {
        nome: 'Creche Pingo de Gente',
        endereco: 'Rua do Sol, 89',
        telefone: '(11) 99999-8888',
        rota: 'Rota Sul',
      },
    ]

    const seededEscolas = {}
    for (const e of escolasData) {
      let rec
      try {
        rec = app.findFirstRecordByData('escolas', 'nome', e.nome)
      } catch (_) {
        rec = new Record(escolasCol)
        rec.set('nome', e.nome)
        rec.set('endereco', e.endereco)
        rec.set('telefone', e.telefone)
        rec.set('rota', e.rota)
        app.save(rec)
      }
      seededEscolas[e.nome] = rec.id
    }

    // 3. Seed Contratos
    const contratosData = [
      {
        numero: 'C-2026-01',
        tipo: 'PNAE',
        instituicao_id: seededEscolas['E.M. João da Silva'],
        valor_total: 15000,
        status: 'Ativo',
      },
      {
        numero: 'C-2026-02',
        tipo: 'PNAE',
        instituicao_id: seededEscolas['E.E. Maria Antonieta'],
        valor_total: 20000,
        status: 'Ativo',
      },
      {
        numero: 'C-2026-03',
        tipo: 'PAA',
        instituicao_id: seededEscolas['Creche Pingo de Gente'],
        valor_total: 8000,
        status: 'Ativo',
      },
    ]

    const seededContratos = {}
    for (const c of contratosData) {
      let rec
      try {
        rec = app.findFirstRecordByData('contratos', 'numero', c.numero)
      } catch (_) {
        rec = new Record(contratosCol)
        rec.set('numero', c.numero)
        rec.set('tipo', c.tipo)
        rec.set('instituicao_id', c.instituicao_id)
        rec.set('valor_total', c.valor_total)
        rec.set('status', c.status)
        app.save(rec)
      }
      seededContratos[c.numero] = rec.id
    }

    // 4. Seed Contrato Itens
    const contratoItensData = [
      { contrato_num: 'C-2026-01', produto_nome: 'Alface Crespa', preco: 2.5 },
      { contrato_num: 'C-2026-01', produto_nome: 'Cenoura', preco: 4.5 },
      { contrato_num: 'C-2026-02', produto_nome: 'Tomate Carmem', preco: 6.0 },
      { contrato_num: 'C-2026-02', produto_nome: 'Feijão Carioca', preco: 8.0 },
      { contrato_num: 'C-2026-03', produto_nome: 'Banana Prata', preco: 5.5 },
    ]

    for (const ci of contratoItensData) {
      const contratoId = seededContratos[ci.contrato_num]
      const produtoId = seededProdutos[ci.produto_nome]
      if (contratoId && produtoId) {
        const records = app.findRecordsByFilter(
          'contrato_itens',
          `contrato_id = "${contratoId}" && produto_id = "${produtoId}"`,
          '',
          1,
          0,
        )
        if (records.length === 0) {
          const rec = new Record(contratoItensCol)
          rec.set('contrato_id', contratoId)
          rec.set('produto_id', produtoId)
          rec.set('preco', ci.preco)
          app.save(rec)
        }
      }
    }

    // 5. Seed Pedidos
    const pedidosData = [
      {
        numero: 'ORD-001',
        escola_id: seededEscolas['E.M. João da Silva'],
        data_prevista: '2026-07-02 08:00:00.000Z',
        status: 'Pendente',
        itens: [
          { produto_nome: 'Alface Crespa', quantidade: 20, preco_unitario: 2.5 },
          { produto_nome: 'Cenoura', quantidade: 40, preco_unitario: 4.5 },
        ],
      },
      {
        numero: 'ORD-002',
        escola_id: seededEscolas['E.E. Maria Antonieta'],
        data_prevista: '2026-07-01 08:00:00.000Z',
        status: 'Entregue',
        itens: [{ produto_nome: 'Tomate Carmem', quantidade: 80, preco_unitario: 6.0 }],
      },
      {
        numero: 'ORD-003',
        escola_id: seededEscolas['Creche Pingo de Gente'],
        data_prevista: '2026-07-03 09:00:00.000Z',
        status: 'Em Rota',
        itens: [
          { produto_nome: 'Banana Prata', quantidade: 30, preco_unitario: 5.5 },
          { produto_nome: 'Alface Crespa', quantidade: 15, preco_unitario: 2.5 },
        ],
      },
    ]

    const seededPedidos = {}
    for (const p of pedidosData) {
      let rec
      try {
        rec = app.findFirstRecordByData('pedidos', 'numero', p.numero)
      } catch (_) {
        rec = new Record(pedidosCol)
        rec.set('numero', p.numero)
        rec.set('escola_id', p.escola_id)
        rec.set('data_prevista', p.data_prevista)
        rec.set('status', p.status)
        app.save(rec)
      }
      seededPedidos[p.numero] = rec.id

      // Seed itens do pedido
      for (const item of p.itens) {
        const prodId = seededProdutos[item.produto_nome]
        if (prodId) {
          const existingItens = app.findRecordsByFilter(
            'pedido_itens',
            `pedido_id = "${rec.id}" && produto_id = "${prodId}"`,
            '',
            1,
            0,
          )
          if (existingItens.length === 0) {
            const itemRec = new Record(pedidoItensCol)
            itemRec.set('pedido_id', rec.id)
            itemRec.set('produto_id', prodId)
            itemRec.set('quantidade', item.quantidade)
            itemRec.set('preco_unitario', item.preco_unitario)
            app.save(itemRec)
          }
        }
      }
    }

    // 6. Seed Atestos
    const atestosData = [
      {
        numero: 'AT-001',
        pedido_id: seededPedidos['ORD-002'],
        data_emissao: '2026-07-01 10:00:00.000Z',
        status: 'Pendente Assinatura',
      },
    ]

    for (const a of atestosData) {
      if (a.pedido_id) {
        let rec
        try {
          rec = app.findFirstRecordByData('atestos', 'numero', a.numero)
        } catch (_) {
          rec = new Record(atestosCol)
          rec.set('numero', a.numero)
          rec.set('pedido_id', a.pedido_id)
          rec.set('data_emissao', a.data_emissao)
          rec.set('status', a.status)
          app.save(rec)
        }
      }
    }
  },
  (app) => {
    // Revert seeds if rolled back
    const collections = [
      'atestos',
      'pedido_itens',
      'pedidos',
      'contrato_itens',
      'contratos',
      'escolas',
      'produtos',
    ]
    for (const c of collections) {
      try {
        const col = app.findCollectionByNameOrId(c)
        app.truncateCollection(col)
      } catch (_) {}
    }
  },
)
