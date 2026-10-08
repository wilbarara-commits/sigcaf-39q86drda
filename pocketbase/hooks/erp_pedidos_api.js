// Hook de API REST Somente Leitura para integração com ERP de Faturamento
// GET /backend/v1/erp/pedidos
// Protegido por API Key via header (X-API-Key ou Authorization: Bearer <key>)
// Retorna pedidos em formato JSON limpo para consumo do ERP da cooperativa

routerAdd('GET', '/backend/v1/erp/pedidos', (e) => {
  // 1. Verificação de Chave de API (ERP_API_KEY)
  // Ordem de precedência:
  // 1º: $os.getenv('ERP_API_KEY') (variável de ambiente do servidor, prioridade máxima)
  // 2º: Registro interno chave='ERP_API_KEY' na coleção config_sistema no banco
  let configuredApiKey = ($os.getenv('ERP_API_KEY') || '').trim()

  if (!configuredApiKey) {
    // Cache em memória compartilhado no escopo global deste runtime (TTL: 60s)
    const now = Date.now()
    if (globalThis.__sigcaf_erp_key_cache && globalThis.__sigcaf_erp_key_cache.expiresAt > now) {
      configuredApiKey = globalThis.__sigcaf_erp_key_cache.key
    } else {
      try {
        const record = $app.findFirstRecordByData('config_sistema', 'chave', 'ERP_API_KEY')
        configuredApiKey = (record.getString('valor') || '').trim()
        globalThis.__sigcaf_erp_key_cache = {
          key: configuredApiKey,
          expiresAt: now + 60 * 1000,
        }
      } catch (_) {
        configuredApiKey = ''
      }
    }
  }

  if (!configuredApiKey) {
    return e.json(401, {
      success: false,
      error: 'Chave de API não configurada no servidor. Contate o administrador da cooperativa.',
    })
  }

  const req = e.request
  const headerApiKey = req.header.get('X-API-Key') || req.header.get('x-api-key') || ''
  const authHeader = req.header.get('Authorization') || req.header.get('authorization') || ''
  let bearerToken = ''
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.slice(7).trim()
  }

  const providedKey = headerApiKey.trim() || bearerToken.trim()

  // Comparação em tempo constante (timing-safe) para mitigar timing attacks
  let keysMatch = false
  if (providedKey && providedKey.length === configuredApiKey.length) {
    let mismatch = 0
    for (let i = 0; i < providedKey.length; i++) {
      mismatch |= providedKey.charCodeAt(i) ^ configuredApiKey.charCodeAt(i)
    }
    keysMatch = mismatch === 0
  }

  if (!keysMatch) {
    return e.json(401, {
      success: false,
      error: 'Acesso não autorizado. Chave de API ausente ou inválida.',
    })
  }

  // 2. Parâmetros de consulta (Query Params)
  const qChamada = (req.url.query().get('chamada') || '').trim() // id ou número da chamada (ex: 01/2025)
  const qCiclo = (req.url.query().get('ciclo') || '').trim() // id ou nome/número do ciclo (ex: Ciclo 40/2026, 40)
  const qStatus = (req.url.query().get('status') || '').trim() // ex: Entregue, Em Rota, Pendente, Cancelado
  const qDataInicio = (req.url.query().get('data_inicio') || '').trim() // YYYY-MM-DD
  const qDataFim = (req.url.query().get('data_fim') || '').trim() // YYYY-MM-DD
  const qTipoData = (req.url.query().get('tipo_data') || 'entrega').trim().toLowerCase() // entrega ou criacao

  // Validação simples de datas caso enviadas
  const regexData = /^\d{4}-\d{2}-\d{2}$/
  if (qDataInicio && !regexData.test(qDataInicio)) {
    return e.json(400, {
      success: false,
      error: 'Parâmetro data_inicio inválido. Formato esperado: YYYY-MM-DD.',
    })
  }
  if (qDataFim && !regexData.test(qDataFim)) {
    return e.json(400, {
      success: false,
      error: 'Parâmetro data_fim inválido. Formato esperado: YYYY-MM-DD.',
    })
  }

  // Paginação
  let page = parseInt(req.url.query().get('page') || '1', 10)
  let perPage = parseInt(req.url.query().get('per_page') || '50', 10)
  if (isNaN(page) || page < 1) page = 1
  if (isNaN(perPage) || perPage < 1) perPage = 50
  if (perPage > 200) perPage = 200

  // 3. Montagem da consulta SQL base para pedidos
  // Usamos SQLite direto via app.db() para flexibilidade de joins e cálculos canônicos rápidos
  try {
    const whereClauses = []
    const sqlParams = {}

    // Filtro por status
    if (qStatus) {
      whereClauses.push('p.status = {:status}')
      sqlParams['status'] = qStatus
    }

    // Filtro por chamada (pode ser id da chamada ou o campo número '01/2025')
    if (qChamada) {
      whereClauses.push(
        '(ch.id = {:chamada} OR ch.chamada = {:chamada} OR c.numero_chamada = {:chamada})',
      )
      sqlParams['chamada'] = qChamada
    }

    // Filtro por ciclo (pode ser id do ciclo, nome 'Ciclo 40/2026' ou snapshot número do ciclo)
    if (qCiclo) {
      whereClauses.push('(ci.id = {:ciclo} OR ci.nome = {:ciclo} OR ci.nome LIKE {:cicloLike})')
      sqlParams['ciclo'] = qCiclo
      sqlParams['cicloLike'] = '%' + qCiclo + '%'
    }

    // Filtro por período de data
    if (qTipoData === 'criacao') {
      if (qDataInicio) {
        whereClauses.push('substr(p.created, 1, 10) >= {:dataInicio}')
        sqlParams['dataInicio'] = qDataInicio
      }
      if (qDataFim) {
        whereClauses.push('substr(p.created, 1, 10) <= {:dataFim}')
        sqlParams['dataFim'] = qDataFim
      }
    } else {
      // Padrão: data de entrega (usa p.entregue_em se preenchido, senão p.data_prevista)
      if (qDataInicio) {
        whereClauses.push(
          'COALESCE(substr(p.entregue_em, 1, 10), substr(p.data_prevista, 1, 10), substr(p.created, 1, 10)) >= {:dataInicio}',
        )
        sqlParams['dataInicio'] = qDataInicio
      }
      if (qDataFim) {
        whereClauses.push(
          'COALESCE(substr(p.entregue_em, 1, 10), substr(p.data_prevista, 1, 10), substr(p.created, 1, 10)) <= {:dataFim}',
        )
        sqlParams['dataFim'] = qDataFim
      }
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    // 3.1 Contagem total de registros para paginação
    const countSql = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM pedidos p
      LEFT JOIN ciclos ci ON p.ciclo_id = ci.id
      LEFT JOIN chamadas ch ON ci.chamada_id = ch.id
      LEFT JOIN rotas r ON p.rota_id = r.id
      LEFT JOIN contratos c ON r.contrato_id = c.id
      ${whereSql}
    `
    const countQuery = $app.db().newQuery(countSql)
    for (const k in sqlParams) {
      countQuery.bind({ [k]: sqlParams[k] })
    }
    const countRow = {}
    countQuery.one(countRow)
    const totalItems = parseInt(countRow.total || 0, 10)
    const totalPages = Math.ceil(totalItems / perPage) || 1
    const offset = (page - 1) * perPage

    // 3.2 Busca dos pedidos da página atual
    const selectSql = `
      SELECT DISTINCT
        p.id as pedido_id,
        p.numero as pedido_numero,
        p.status as pedido_status,
        p.origem as pedido_origem,
        p.created as pedido_created,
        p.updated as pedido_updated,
        p.data_prevista as pedido_data_prevista,
        p.entregue_em as pedido_entregue_em,
        p.observacao_entrega as pedido_observacao_entrega,
        e.id as escola_id,
        e.nome as escola_nome,
        e.codigo_inep as escola_codigo_inep,
        e.tipo as escola_tipo,
        e.dependencia_administrativa as escola_dependencia,
        e.bairro as escola_bairro,
        e.endereco as escola_endereco,
        ci.id as ciclo_id,
        ci.nome as ciclo_nome,
        ci.snapshot as ciclo_snapshot,
        ch.id as chamada_id,
        ch.chamada as chamada_numero,
        ch.programa as chamada_programa,
        ch.dependencia_administrativa as chamada_dependencia,
        c.id as contrato_id,
        c.numero as contrato_numero,
        r.id as rota_id,
        r.nome as rota_nome
      FROM pedidos p
      LEFT JOIN escolas e ON p.escola_id = e.id
      LEFT JOIN ciclos ci ON p.ciclo_id = ci.id
      LEFT JOIN chamadas ch ON ci.chamada_id = ch.id
      LEFT JOIN rotas r ON p.rota_id = r.id
      LEFT JOIN contratos c ON r.contrato_id = c.id
      ${whereSql}
      ORDER BY p.created DESC
      LIMIT {:limit} OFFSET {:offset}
    `

    const selectQuery = $app.db().newQuery(selectSql)
    for (const k in sqlParams) {
      selectQuery.bind({ [k]: sqlParams[k] })
    }
    selectQuery.bind({ limit: perPage, offset: offset })

    const pedidoRows = []
    selectQuery.all(pedidoRows)

    if (pedidoRows.length === 0) {
      return e.json(200, {
        success: true,
        page: page,
        per_page: perPage,
        total_items: totalItems,
        total_pages: totalPages,
        items_count: 0,
        pedidos: [],
      })
    }

    // 4. Buscar os itens de todos os pedidos da página de uma vez
    const pedidoIds = pedidoRows.map((r) => "'" + r.pedido_id + "'").join(',')
    const itemsSql = `
      SELECT 
        pi.id as item_id,
        pi.pedido_id as pedido_id,
        pi.produto_id as produto_id,
        pi.quantidade as quantidade,
        pi.preco_unitario as preco_unitario,
        prod.nome as produto_catalogo_nome,
        prod.unidade as produto_catalogo_unidade,
        prod.categoria as produto_catalogo_categoria
      FROM pedido_itens pi
      LEFT JOIN produtos prod ON pi.produto_id = prod.id
      WHERE pi.pedido_id IN (${pedidoIds})
      ORDER BY pi.id ASC
    `
    const itemsRows = []
    $app.db().newQuery(itemsSql).all(itemsRows)

    // 4.1 Carregar tabela de referência para resolver Nome no Contrato e AKA
    // Podemos carregar chamada_itens e contrato_itens das chamadas/contratos envolvidos
    const chamadaIdsSet = new Set()
    pedidoRows.forEach((r) => {
      if (r.chamada_id) chamadaIdsSet.add(r.chamada_id)
    })
    const chamadaIdsList = Array.from(chamadaIdsSet)
    let chamadaItensRows = []
    if (chamadaIdsList.length > 0) {
      const chIn = chamadaIdsList.map((id) => "'" + id + "'").join(',')
      try {
        $app
          .db()
          .newQuery(
            `SELECT chamada_id, produto_id, produto, aka, unidade, preco FROM chamada_itens WHERE chamada_id IN (${chIn})`,
          )
          .all(chamadaItensRows)
      } catch (_) {}
    }

    // Mapear chamada_itens por chave: chamada_id + '_' + produto_id
    const chamadaItensMap = new Map()
    chamadaItensRows.forEach((ci) => {
      chamadaItensMap.set(ci.chamada_id + '_' + ci.produto_id, ci)
    })

    // Agrupar itens por pedido_id
    const itemsByPedido = new Map()
    itemsRows.forEach((item) => {
      const list = itemsByPedido.get(item.pedido_id) || []
      list.push(item)
      itemsByPedido.set(item.pedido_id, list)
    })

    // Helper para extrair o Nome Principal no Contrato e o AKA:
    // Regra: se o texto tiver vírgula, a parte antes da 1ª vírgula é o nome principal;
    // a parte depois é o AKA. Se não tiver vírgula, todo o texto é o nome principal.
    const extrairNomeEAka = (rawNome, rawAkaFallback) => {
      const texto = (rawNome || '').trim()
      let nomePrincipal = texto
      let aka = (rawAkaFallback || '').trim() || null

      if (texto.includes(',')) {
        const parts = texto.split(',')
        nomePrincipal = parts[0].trim()
        const akaDaVirgula = parts.slice(1).join(',').trim()
        if (akaDaVirgula) {
          aka = akaDaVirgula
        }
      }

      return { nomePrincipal: nomePrincipal || texto, aka: aka || null }
    }

    // 5. Formatar payload de retorno para o ERP
    const formattedPedidos = pedidoRows.map((p) => {
      const rawItens = itemsByPedido.get(p.pedido_id) || []
      let totalConsolidado = 0

      const itensFormatados = rawItens.map((it) => {
        const qtd = Number(it.quantidade) || 0
        const precoUnit = Number(it.preco_unitario) || 0
        const totalItem = Math.round(qtd * precoUnit * 100) / 100
        totalConsolidado += totalItem

        // Tentar resolver pelo cadastro em chamada_itens da chamada do ciclo
        const refChamada = p.chamada_id
          ? chamadaItensMap.get(p.chamada_id + '_' + it.produto_id)
          : null
        const nomeReferencia = refChamada?.produto || it.produto_catalogo_nome || 'Produto'
        const akaReferencia = refChamada?.aka || null
        const unidadeResolvida = refChamada?.unidade || it.produto_catalogo_unidade || 'Un'

        const parsed = extrairNomeEAka(nomeReferencia, akaReferencia)

        return {
          id: it.item_id,
          produto_id: it.produto_id,
          nome_produto: parsed.nomePrincipal,
          aka: parsed.aka,
          quantidade: qtd,
          unidade: unidadeResolvida,
          preco_unitario: precoUnit,
          total_item: totalItem,
        }
      })

      // Extrair metadados do ciclo (número / ano) a partir do snapshot ou nome
      let cicloNumero = null
      let cicloAno = null
      if (p.ciclo_snapshot) {
        try {
          const snap =
            typeof p.ciclo_snapshot === 'string' ? JSON.parse(p.ciclo_snapshot) : p.ciclo_snapshot
          if (snap.numero_ciclo) cicloNumero = Number(snap.numero_ciclo)
          if (snap.ano_ciclo) cicloAno = Number(snap.ano_ciclo)
        } catch (_) {}
      }
      if (!cicloNumero && p.ciclo_nome) {
        const match = p.ciclo_nome.match(/(\d+)\/(\d+)/)
        if (match) {
          cicloNumero = parseInt(match[1], 10)
          cicloAno = parseInt(match[2], 10)
        }
      }

      totalConsolidado = Math.round(totalConsolidado * 100) / 100

      return {
        id: p.pedido_id,
        numero: p.pedido_numero,
        status: p.pedido_status,
        origem: p.pedido_origem,
        datas: {
          criacao: p.pedido_created,
          atualizacao: p.pedido_updated,
          data_prevista: p.pedido_data_prevista || null,
          entregue_em: p.pedido_entregue_em || null,
        },
        escola: {
          id: p.escola_id,
          nome: p.escola_nome,
          codigo_inep: p.escola_codigo_inep || null,
          tipo: p.escola_tipo || null,
          dependencia_administrativa: p.escola_dependencia || null,
          bairro: p.escola_bairro || null,
          endereco: p.escola_endereco || null,
        },
        chamada: {
          id: p.chamada_id || null,
          numero: p.chamada_numero || null,
          programa: p.chamada_programa || null,
          dependencia_administrativa: p.chamada_dependencia || null,
        },
        ciclo: {
          id: p.ciclo_id || null,
          nome: p.ciclo_nome || null,
          numero: cicloNumero,
          ano: cicloAno,
        },
        contrato: {
          id: p.contrato_id || null,
          numero: p.contrato_numero || null,
        },
        rota: {
          id: p.rota_id || null,
          nome: p.rota_nome || null,
        },
        itens_total_count: itensFormatados.length,
        total_consolidado: totalConsolidado,
        itens: itensFormatados,
      }
    })

    return e.json(200, {
      success: true,
      api_version: '1.0',
      tipo: 'somente_leitura',
      page: page,
      per_page: perPage,
      total_items: totalItems,
      total_pages: totalPages,
      items_count: formattedPedidos.length,
      pedidos: formattedPedidos,
    })
  } catch (err) {
    // Erro limpo em JSON sem vazar stack trace ou detalhes internos
    return e.json(500, {
      success: false,
      error:
        'Erro interno ao consultar pedidos para faturamento do ERP. Tente novamente mais tarde.',
    })
  }
})
