migrate(
  (app) => {
    // 0096_verificacao_detalhada_integridade.js
    const configRecords = app.findRecordsByFilter('configuracoes', '', '', 1, 0)
    if (!configRecords || configRecords.length === 0) return
    const config = configRecords[0]

    // Contagens
    const ciclos = app.countRecords('ciclos')
    const contratos = app.countRecords('contratos')
    const chamadas = app.countRecords('chamadas')
    const chamadaItens = app.countRecords('chamada_itens')
    const contratoItens = app.countRecords('contrato_itens')
    const contratoEscolas = app.countRecords('contrato_escolas')
    const rotas = app.countRecords('rotas')
    const paradasRota = app.countRecords('paradas_rota')
    const pedidos = app.countRecords('pedidos')
    const pedidoItens = app.countRecords('pedido_itens')
    const atestos = app.countRecords('atestos')
    const despachos = app.countRecords('despachos')
    const tokens = app.countRecords('tokens_formulario')
    const escolas = app.countRecords('escolas')
    const produtos = app.countRecords('produtos')

    // Verificar C-2026-01
    const c202601Records = app.findRecordsByFilter('contratos', "numero = 'C-2026-01'", '', 1, 0)
    let c202601Info = null
    if (c202601Records.length > 0) {
      const c = c202601Records[0]
      const itens = app.findRecordsByFilter('contrato_itens', `contrato_id = '${c.id}'`, '', 100, 0)
      c202601Info = {
        id: c.id,
        numero: c.get('numero'),
        valor_total: c.get('valor_total'),
        status: c.get('status'),
        total_itens: itens.length,
      }
    }

    // Verificar chamadas 01/2025 e 07/2025
    const ch01Records = app.findRecordsByFilter('chamadas', "chamada = '01/2025'", '', 1, 0)
    const ch01Itens =
      ch01Records.length > 0
        ? app.findRecordsByFilter(
            'chamada_itens',
            `chamada_id = '${ch01Records[0].id}'`,
            '',
            100,
            0,
          ).length
        : 0

    const ch07Records = app.findRecordsByFilter('chamadas', "chamada = '07/2025'", '', 1, 0)
    const ch07Itens =
      ch07Records.length > 0
        ? app.findRecordsByFilter(
            'chamada_itens',
            `chamada_id = '${ch07Records[0].id}'`,
            '',
            100,
            0,
          ).length
        : 0

    // Verificar rotas restantes
    const rotasRestantes = app.findRecordsByFilter('rotas', '', 'ordem', 10, 0)
    const rotasNomes = rotasRestantes.map((r) => r.get('nome')).join(', ')

    // Verificar paradas por rota
    const paradasPorRota = {}
    for (const r of rotasRestantes) {
      const p = app.findRecordsByFilter('paradas_rota', `rota_id = '${r.id}'`, '', 100, 0)
      paradasPorRota[r.get('nome')] = p.length
    }

    // Verificar contatos de escolas com (TESTE)
    const escolasTeste = app.findRecordsByFilter(
      'escolas',
      "contato ~ 'TESTE' || telefone ~ 'TESTE'",
      '',
      100,
      0,
    )

    const auditData = {
      timestamp: new Date().toISOString(),
      contagens: {
        ciclos,
        contratos,
        chamadas,
        chamadaItens,
        contratoItens,
        contratoEscolas,
        rotas,
        paradasRota,
        pedidos,
        pedidoItens,
        atestos,
        despachos,
        tokens,
        escolas,
        produtos,
      },
      c2026_01: c202601Info,
      chamada_01_2025_itens: ch01Itens,
      chamada_07_2025_itens: ch07Itens,
      rotas_nomes: rotasNomes,
      paradas_por_rota: paradasPorRota,
      escolas_com_teste: escolasTeste.length,
    }

    config.set('subtitulo_sistema', 'AUDIT:' + JSON.stringify(auditData))
    app.save(config)
  },
  (app) => {},
)
