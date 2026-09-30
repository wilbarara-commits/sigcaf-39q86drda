migrate(
  (app) => {
    // =========================================================================
    // 0094_limpeza_dados_teste.js
    // LIMPEZA CIRÚRGICA DE DADOS DE TESTE NO SIGCAF (SKIP CLOUD / POCKETBASE)
    //
    // Escopo autorizado pelo usuário:
    // 1. Ciclo de teste 38/2026 e todas as suas dependências:
    //    - Pedidos (IMP-8407-*, IMP-8408-*, FOR-*, ORD-*) e respectivos pedido_itens
    //    - Atestos vinculados a esses pedidos
    //    - Despachos vinculados ao ciclo 38/2026
    //    - Tokens de formulário vinculados ao ciclo 38/2026
    //    - Envios de WhatsApp e Importações do ciclo 38/2026
    //    - Vínculos ciclo_contratos do ciclo 38/2026
    //    - O registro do ciclo 38/2026 em si
    //
    // 2. Contratos de teste C-07/2025-01 até C-07/2025-11 (11 contratos) + dependências:
    //    - Itens desses contratos (contrato_itens, incluindo Abobrinha e Inhame)
    //    - Vínculos contrato_escolas desses 11 contratos (inclusive CE ALCINDO GUANABARA)
    //    - Qualquer importação ou despacho vinculado a esses contratos
    //
    // 3. Contrato cancelado C-2026-02 + dependências:
    //    - Itens de contrato (contrato_itens)
    //    - Vínculos contrato_escolas
    //    - Tokens de formulário
    //    - Rota legada "A" (contrato_id = C-2026-02) e suas paradas_rota
    //      (PRESERVANDO a "ROTA A" de 37 paradas do C-2026-01 / Chamada 01/2025,
    //       bem como ROTA B e ROTA C)
    //    - O registro do contrato C-2026-02
    //
    // 4. Limpeza de contatos "(TESTE)" nas escolas:
    //    - Zerar contato e telefone de escolas cujo valor contenha "(TESTE)"
    //    - Manter intactos nomes, endereços, CEP, latitude, longitude e dados das escolas
    //
    // 5. Limpeza de órfãos residuais e verificação de integridade referencial.
    // =========================================================================

    // -------------------------------------------------------------------------
    // IDENTIFICAR IDs ALVO
    // -------------------------------------------------------------------------
    // 1. Ciclo 38/2026
    const ciclo38Sql = "SELECT id FROM ciclos WHERE nome LIKE '%38/2026%' OR nome LIKE '%Ciclo 38%'"

    // 2. Contratos a apagar: C-07/2025-* e C-2026-02
    const contratosAlvoSql =
      "SELECT id FROM contratos WHERE numero LIKE 'C-07/2025-%' OR numero = 'C-2026-02'"

    // 3. Rota legada "A" associada a C-2026-02
    const rotasLegadasAlvoSql = `
      SELECT id FROM rotas
      WHERE contrato_id IN (SELECT id FROM contratos WHERE numero = 'C-2026-02')
         OR (nome = 'A' AND (contrato_id IS NULL OR contrato_id IN (${contratosAlvoSql})))
    `

    // -------------------------------------------------------------------------
    // EXECUÇÃO EM ORDEM DE DEPENDÊNCIAS (Filhos antes de Pais)
    // -------------------------------------------------------------------------

    // A. Atestos vinculados a pedidos do ciclo 38/2026 ou a pedidos de contratos alvo
    app
      .db()
      .newQuery(`
      DELETE FROM atestos
      WHERE pedido_id IN (
        SELECT id FROM pedidos
        WHERE ciclo_id IN (${ciclo38Sql})
           OR escola_id IN (SELECT escola_id FROM contrato_escolas WHERE contrato_id IN (${contratosAlvoSql}))
      )
    `)
      .execute()

    // B. Itens de pedidos do ciclo 38/2026
    app
      .db()
      .newQuery(`
      DELETE FROM pedido_itens
      WHERE pedido_id IN (
        SELECT id FROM pedidos WHERE ciclo_id IN (${ciclo38Sql})
      )
    `)
      .execute()

    // C. Pedidos do ciclo 38/2026 (ou números IMP-8408-*, IMP-8407-*, FOR-*, ORD-083 de teste)
    app
      .db()
      .newQuery(`
      DELETE FROM pedidos
      WHERE ciclo_id IN (${ciclo38Sql})
         OR numero LIKE 'IMP-8407-%'
         OR numero LIKE 'IMP-8408-%'
         OR numero LIKE 'FOR-%'
         OR numero LIKE 'ORD-083%'
    `)
      .execute()

    // Limpeza de qualquer pedido_item órfão
    app
      .db()
      .newQuery(`
      DELETE FROM pedido_itens
      WHERE pedido_id NOT IN (SELECT id FROM pedidos)
    `)
      .execute()

    // D. Despachos do ciclo 38/2026 ou de contratos alvo ou de rotas alvo
    app
      .db()
      .newQuery(`
      DELETE FROM despachos
      WHERE ciclo_id IN (${ciclo38Sql})
         OR contrato_id IN (${contratosAlvoSql})
         OR rota_id IN (${rotasLegadasAlvoSql})
    `)
      .execute()

    // E. Tokens de formulário do ciclo 38/2026 ou dos contratos alvo
    app
      .db()
      .newQuery(`
      DELETE FROM tokens_formulario
      WHERE ciclo_id IN (${ciclo38Sql})
         OR contrato_id IN (${contratosAlvoSql})
    `)
      .execute()

    // F. Envios de WhatsApp e Importações do ciclo 38/2026 ou contratos alvo
    app
      .db()
      .newQuery(`
      DELETE FROM envios_whatsapp
      WHERE ciclo_id IN (${ciclo38Sql})
    `)
      .execute()

    app
      .db()
      .newQuery(`
      DELETE FROM importacoes
      WHERE ciclo_id IN (${ciclo38Sql})
         OR contrato_id IN (${contratosAlvoSql})
    `)
      .execute()

    // G. Vínculos ciclo_contratos do ciclo 38/2026 ou de contratos alvo
    app
      .db()
      .newQuery(`
      DELETE FROM ciclo_contratos
      WHERE ciclo_id IN (${ciclo38Sql})
         OR contrato_id IN (${contratosAlvoSql})
    `)
      .execute()

    // H. Excluir o ciclo 38/2026 em si
    app
      .db()
      .newQuery(`
      DELETE FROM ciclos
      WHERE id IN (${ciclo38Sql})
    `)
      .execute()

    // I. Paradas da rota legada "A"
    app
      .db()
      .newQuery(`
      DELETE FROM paradas_rota
      WHERE rota_id IN (${rotasLegadasAlvoSql})
    `)
      .execute()

    // J. Apagar a rota legada "A"
    app
      .db()
      .newQuery(`
      DELETE FROM rotas
      WHERE id IN (${rotasLegadasAlvoSql})
    `)
      .execute()

    // K. Vínculos contrato_escolas dos contratos alvo
    app
      .db()
      .newQuery(`
      DELETE FROM contrato_escolas
      WHERE contrato_id IN (${contratosAlvoSql})
    `)
      .execute()

    // L. Itens de contrato (contrato_itens) dos contratos alvo
    app
      .db()
      .newQuery(`
      DELETE FROM contrato_itens
      WHERE contrato_id IN (${contratosAlvoSql})
    `)
      .execute()

    // M. Apagar os contratos alvo (C-07/2025-01 até C-07/2025-11 e C-2026-02)
    app
      .db()
      .newQuery(`
      DELETE FROM contratos
      WHERE id IN (${contratosAlvoSql})
    `)
      .execute()

    // N. Varrer e limpar vínculos, paradas ou itens órfãos apontando para contratos ou rotas inexistentes
    app
      .db()
      .newQuery(`
      DELETE FROM contrato_escolas
      WHERE contrato_id NOT IN (SELECT id FROM contratos)
    `)
      .execute()

    app
      .db()
      .newQuery(`
      DELETE FROM contrato_itens
      WHERE contrato_id NOT IN (SELECT id FROM contratos)
    `)
      .execute()

    app
      .db()
      .newQuery(`
      DELETE FROM paradas_rota
      WHERE rota_id NOT IN (SELECT id FROM rotas)
    `)
      .execute()

    // O. Limpeza de contatos "(TESTE)" nas escolas (apenas os campos contato e telefone)
    app
      .db()
      .newQuery(`
      UPDATE escolas
      SET contato = ''
      WHERE contato LIKE '%(TESTE)%'
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE escolas
      SET telefone = ''
      WHERE telefone LIKE '%(TESTE)%'
    `)
      .execute()

    console.log('[0094] Limpeza cirúrgica de dados de teste concluída com sucesso.')
  },
  (app) => {
    // Reversão de limpeza de dados de teste autorizada não se aplica
  },
)
