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
  const qCiclo = (req.url.query().get('ciclo') || '').trim() // id ou nome/número do ciclo (ex: 40/2026, 40, Ciclo 40/2026)
  const qEscola = (req.url.query().get('escola') || '').trim() // ID da escola no banco (PocketBase ID alfanumérico)
  const qStatus = (req.url.query().get('status') || '').trim() // ex: Entregue, Em Rota, Pendente, Cancelado
  const qDataInicio = (req.url.query().get('data_inicio') || '').trim() // YYYY-MM-DD
  const qDataFim = (req.url.query().get('data_fim') || '').trim() // YYYY-MM-DD
  const qTipoData = (req.url.query().get('tipo_data') || 'entrega').trim().toLowerCase() // entrega ou criacao

  // Validação do parâmetro escola: se fornecido, deve ser um ID alfanumérico válido (IDs do PocketBase têm 15 chars [a-z0-9] ou string alfanumérica segura 5-30 chars)
  if (qEscola) {
    const regexEscolaId = /^[a-zA-Z0-9_-]{5,50}$/
    if (!regexEscolaId.test(qEscola)) {
      return e.json(400, {
        success: false,
        error: 'Parâmetro escola inválido. Formato esperado: ID alfanumérico da escola.',
      })
    }
  }

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

    // Filtro por escola (ID no banco de dados)
    if (qEscola) {
      whereClauses.push('p.escola_id = {:escola}')
      sqlParams['escola'] = qEscola
    }

    // Filtro por chamada (sem curingas arbitrários; casamento exato por ID ou número da chamada)
    if (qChamada) {
      whereClauses.push(
        '(ch.id = {:chamada} OR ch.chamada = {:chamada} OR c.numero_chamada = {:chamada})',
      )
      sqlParams['chamada'] = qChamada
    }

    // Filtro por ciclo: casamento exato primeiro, sem permitir curingas SQL arbitrários
    // Suporta formatos canônicos:
    // - ID do ciclo (ci.id = :ciclo)
    // - Nome exato no banco (ci.nome = :ciclo, ex: 'Ciclo 40/2026')
    // - Formato '40/2026' -> ci.nome = 'Ciclo 40/2026'
    // - Formato número '40' -> ci.nome LIKE 'Ciclo 40/%' ou casamento pelo snapshot/expressão delimitada segura
    if (qCiclo) {
      const sanitizedCiclo = qCiclo.replace(/[%_]/g, '') // remove curingas SQL arbitrários para prevenir bypass
      const cicloClauses = ['ci.id = {:cicloExact}']
      sqlParams['cicloExact'] = qCiclo

      if (sanitizedCiclo) {
        cicloClauses.push('ci.nome = {:cicloSanitized}')
        sqlParams['cicloSanitized'] = sanitizedCiclo

        // Se veio no formato "40/2026", casar também com "Ciclo 40/2026"
        if (/^\d+\/\d{4}$/.test(sanitizedCiclo)) {
          cicloClauses.push('ci.nome = {:cicloFormatado}')
          sqlParams['cicloFormatado'] = 'Ciclo ' + sanitizedCiclo
        } else if (/^\d+$/.test(sanitizedCiclo)) {
          // Se veio apenas o número do ciclo (ex: "40"), casar exato com "Ciclo 40" ou "Ciclo 40/AAAA"
          // utilizando prefixo seguro com parâmetro vinculado (sem curingas do usuário)
          cicloClauses.push('ci.nome = {:cicloNumExato}')
          cicloClauses.push('ci.nome LIKE {:cicloNumPrefix}')
          sqlParams['cicloNumExato'] = 'Ciclo ' + sanitizedCiclo
          sqlParams['cicloNumPrefix'] = 'Ciclo ' + sanitizedCiclo + '/%'
        } else if (sanitizedCiclo.toLowerCase().startsWith('ciclo ')) {
          // Se veio "Ciclo 40", casar exato ou "Ciclo 40/%"
          const rest = sanitizedCiclo.slice(6).trim()
          if (/^\d+$/.test(rest)) {
            cicloClauses.push('ci.nome LIKE {:cicloNumPrefix2}')
            sqlParams['cicloNumPrefix2'] = 'Ciclo ' + rest + '/%'
          }
        }
      }

      whereClauses.push('(' + cicloClauses.join(' OR ') + ')')
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
    const countRow = new DynamicModel({
      total: 0,
    })
    countQuery.one(countRow)
    const totalItems = parseInt(countRow.total || 0, 10)
    const totalPages = Math.ceil(totalItems / perPage) || 1
    const offset = (page - 1) * perPage

    // 3.2 Busca dos pedidos da página atual
    // Usamos COALESCE em todas as colunas de joins externos e campos nullable para que nunca
    // retornem NULL ao scanner SQL do PocketBase/Goja (Scan error converting NULL to string)
    const selectSql = `
      SELECT DISTINCT
        COALESCE(p.id, '') as pedido_id,
        COALESCE(p.numero, '') as pedido_numero,
        COALESCE(p.status, '') as pedido_status,
        COALESCE(p.origem, '') as pedido_origem,
        COALESCE(p.created, '') as pedido_created,
        COALESCE(p.updated, '') as pedido_updated,
        COALESCE(p.data_prevista, '') as pedido_data_prevista,
        COALESCE(p.validacao, '') as pedido_validacao,
        COALESCE((SELECT ROUND(SUM(pi_sub.quantidade * pi_sub.preco_unitario), 2) FROM pedido_itens pi_sub WHERE pi_sub.pedido_id = p.id), 0) as pedido_total_calculado,
        COALESCE(p.entregue_em, '') as pedido_entregue_em,
        COALESCE(p.observacao_entrega, '') as pedido_observacao_entrega,
        COALESCE(e.id, '') as escola_id,
        COALESCE(e.nome, '') as escola_nome,
        COALESCE(e.codigo_inep, '') as escola_codigo_inep,
        COALESCE(e.tipo, '') as escola_tipo,
        COALESCE(e.dependencia_administrativa, '') as escola_dependencia,
        COALESCE(e.bairro, '') as escola_bairro,
        COALESCE(e.endereco, '') as escola_endereco,
        COALESCE(ci.id, '') as ciclo_id,
        COALESCE(ci.nome, '') as ciclo_nome,
        COALESCE(ci.snapshot, '') as ciclo_snapshot,
        COALESCE(ch.id, '') as chamada_id,
        COALESCE(ch.chamada, '') as chamada_numero,
        COALESCE(ch.programa, '') as chamada_programa,
        COALESCE(ch.dependencia_administrativa, '') as chamada_dependencia,
        COALESCE(c.id, '') as contrato_id,
        COALESCE(c.numero, '') as contrato_numero,
        COALESCE(r.id, '') as rota_id,
        COALESCE(r.nome, '') as rota_nome
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

    const pedidoRows = arrayOf(
      new DynamicModel({
        pedido_id: '',
        pedido_numero: '',
        pedido_status: '',
        pedido_origem: '',
        pedido_created: '',
        pedido_updated: '',
        pedido_data_prevista: '',
        pedido_validacao: '',
        pedido_total_calculado: -0,
        pedido_entregue_em: '',
        pedido_observacao_entrega: '',
        escola_id: '',
        escola_nome: '',
        escola_codigo_inep: '',
        escola_tipo: '',
        escola_dependencia: '',
        escola_bairro: '',
        escola_endereco: '',
        ciclo_id: '',
        ciclo_nome: '',
        ciclo_snapshot: '',
        chamada_id: '',
        chamada_numero: '',
        chamada_programa: '',
        chamada_dependencia: '',
        contrato_id: '',
        contrato_numero: '',
        rota_id: '',
        rota_nome: '',
      }),
    )
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
        COALESCE(pi.id, '') as item_id,
        COALESCE(pi.pedido_id, '') as pedido_id,
        COALESCE(pi.produto_id, '') as produto_id,
        COALESCE(pi.quantidade, 0) as quantidade,
        COALESCE(pi.preco_unitario, 0) as preco_unitario,
        COALESCE(prod.nome, '') as produto_catalogo_nome,
        COALESCE(prod.unidade, '') as produto_catalogo_unidade,
        COALESCE(prod.categoria, '') as produto_catalogo_categoria
      FROM pedido_itens pi
      LEFT JOIN produtos prod ON pi.produto_id = prod.id
      WHERE pi.pedido_id IN (${pedidoIds})
      ORDER BY pi.id ASC
    `
    const itemsRows = arrayOf(
      new DynamicModel({
        item_id: '',
        pedido_id: '',
        produto_id: '',
        quantidade: -0,
        preco_unitario: -0,
        produto_catalogo_nome: '',
        produto_catalogo_unidade: '',
        produto_catalogo_categoria: '',
      }),
    )
    $app.db().newQuery(itemsSql).all(itemsRows)

    // 4.1 Carregar tabela de referência para resolver Nome no Contrato e AKA
    // Podemos carregar chamada_itens e contrato_itens das chamadas/contratos envolvidos
    const chamadaIdsSet = new Set()
    pedidoRows.forEach((r) => {
      if (r.chamada_id) chamadaIdsSet.add(r.chamada_id)
    })
    const chamadaIdsList = Array.from(chamadaIdsSet)
    let chamadaItensRows = arrayOf(
      new DynamicModel({
        chamada_id: '',
        produto_id: '',
        produto: '',
        aka: '',
        unidade: '',
        preco: -0,
      }),
    )
    if (chamadaIdsList.length > 0) {
      const chIn = chamadaIdsList.map((id) => "'" + id + "'").join(',')
      try {
        $app
          .db()
          .newQuery(`
            SELECT 
              COALESCE(chamada_id, '') as chamada_id,
              COALESCE(produto_id, '') as produto_id,
              COALESCE(produto, '') as produto,
              COALESCE(aka, '') as aka,
              COALESCE(unidade, '') as unidade,
              COALESCE(preco, 0) as preco
            FROM chamada_itens 
            WHERE chamada_id IN (${chIn})
          `)
          .all(chamadaItensRows)
      } catch (errCh) {
        console.warn('Aviso ao carregar chamada_itens de referência para ERP:', errCh)
      }
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

      // Deduplicação estrita de itens para evitar receita duplicada caso itens venham repetidos
      const itensUnicos = []
      const seenItemIds = new Set()
      rawItens.forEach((it) => {
        if (!it.item_id || !seenItemIds.has(it.item_id)) {
          if (it.item_id) seenItemIds.add(it.item_id)
          itensUnicos.push(it)
        }
      })

      let somaItens = 0
      const itensFormatados = itensUnicos.map((it) => {
        const qtd = Number(it.quantidade) || 0
        const precoUnit = Number(it.preco_unitario) || 0
        const totalItem = Math.round(qtd * precoUnit * 100) / 100
        somaItens += totalItem

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

      somaItens = Math.round(somaItens * 100) / 100

      // 1ª Melhoria: Total Canônico do Pedido como valor principal de total_consolidado
      // Extrair total gravado canônico no pedido:
      // 1. Campo explícito se existir na tabela/linha (p.pedido_total ou p.total)
      // 2. Campo no JSON de validação (ex: validacao.total ou validacao.valor_total)
      // 3. Fallback: subquery SQL agregada direta (pedido_total_calculado) ou soma dos itens únicos
      let totalGravado = null
      if (p.pedido_total !== undefined && p.pedido_total !== null && p.pedido_total !== '') {
        const n = Number(p.pedido_total)
        if (!isNaN(n) && n > 0) {
          totalGravado = Math.round(n * 100) / 100
        }
      }
      if (totalGravado === null && p.total !== undefined && p.total !== null && p.total !== '') {
        const n = Number(p.total)
        if (!isNaN(n) && n > 0) {
          totalGravado = Math.round(n * 100) / 100
        }
      }
      if (totalGravado === null && p.pedido_validacao) {
        try {
          const valObj =
            typeof p.pedido_validacao === 'string'
              ? JSON.parse(p.pedido_validacao)
              : p.pedido_validacao
          if (valObj) {
            const vTotal =
              typeof valObj.total === 'number' ? valObj.total : Number(valObj.valor_total)
            if (!isNaN(vTotal) && vTotal > 0) {
              totalGravado = Math.round(vTotal * 100) / 100
            }
          }
        } catch (_) {}
      }

      if (
        totalGravado === null &&
        p.pedido_total_calculado !== undefined &&
        p.pedido_total_calculado !== null &&
        p.pedido_total_calculado !== ''
      ) {
        const n = Number(p.pedido_total_calculado)
        if (!isNaN(n) && n >= 0) {
          totalGravado = Math.round(n * 100) / 100
        }
      }

      const totalConsolidado = totalGravado !== null ? totalGravado : somaItens

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
        chamada: p.chamada_id
          ? {
              id: p.chamada_id,
              numero: p.chamada_numero || null,
              programa: p.chamada_programa || null,
              dependencia_administrativa: p.chamada_dependencia || null,
            }
          : null,
        ciclo: p.ciclo_id
          ? {
              id: p.ciclo_id,
              nome: p.ciclo_nome || null,
              numero: cicloNumero,
              ano: cicloAno,
            }
          : null,
        contrato: p.contrato_id
          ? {
              id: p.contrato_id,
              numero: p.contrato_numero || null,
            }
          : null,
        rota: p.rota_id
          ? {
              id: p.rota_id,
              nome: p.rota_nome || null,
            }
          : null,
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
    // Registrar erro detalhado nos logs do backend (pb_hooks) para auditoria e diagnóstico
    console.error(
      'Erro na rota GET /backend/v1/erp/pedidos:',
      err && (err.message || err.toString() || err),
    )

    // Erro limpo em JSON sem vazar stack trace ou detalhes internos
    return e.json(500, {
      success: false,
      error:
        'Erro interno ao consultar pedidos para faturamento do ERP. Tente novamente mais tarde.',
    })
  }
})
