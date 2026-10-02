/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Ciclos 38 alvo:
    // 1. 5vsxd9en2b8pi3e (Ciclo 38/2026, Chamada 01/2025 Municipal - contém os pedidos importados)
    // 2. q34tb0emtengknj (Ciclo 38/2026, Chamada 07/2025 Estadual - sem pedidos, mas verificado por segurança)
    const ciclosAlvo = ['5vsxd9en2b8pi3e', 'q34tb0emtengknj']
    const cicloInSql = "('5vsxd9en2b8pi3e', 'q34tb0emtengknj')"

    // 1. Remover Atestos que porventura referenciem pedidos dos ciclos 38 alvo
    // Iterar registros para garantir limpeza de arquivos físicos de anexo no PocketBase
    try {
      for (const cicloId of ciclosAlvo) {
        const atestos = app.findRecordsByFilter(
          'atestos',
          `pedido_id.ciclo_id = '${cicloId}'`,
          '',
          500,
          0,
        )
        if (atestos && atestos.length > 0) {
          for (const atesto of atestos) {
            app.delete(atesto)
          }
        }
      }
    } catch (err) {
      console.log('Aviso ao apagar arquivos de atestos dos ciclos 38:', err)
    }

    app
      .db()
      .newQuery(`
      DELETE FROM atestos 
      WHERE pedido_id IN (
        SELECT id FROM pedidos WHERE ciclo_id IN ${cicloInSql}
      )
    `)
      .execute()

    // 2. Remover pedido_itens dos pedidos que pertencem aos ciclos 38 alvo
    app
      .db()
      .newQuery(`
      DELETE FROM pedido_itens 
      WHERE pedido_id IN (
        SELECT id FROM pedidos WHERE ciclo_id IN ${cicloInSql}
      )
    `)
      .execute()

    // 3. Remover os pedidos dos ciclos 38 alvo
    app
      .db()
      .newQuery(`
      DELETE FROM pedidos 
      WHERE ciclo_id IN ${cicloInSql}
    `)
      .execute()

    // 4. Remover dependentes orfãos / registros de teste vinculados diretamente aos ciclos 38 alvo
    // Tokens de formulário
    app
      .db()
      .newQuery(`
      DELETE FROM tokens_formulario 
      WHERE ciclo_id IN ${cicloInSql}
    `)
      .execute()

    // Envios de WhatsApp
    app
      .db()
      .newQuery(`
      DELETE FROM envios_whatsapp 
      WHERE ciclo_id IN ${cicloInSql}
    `)
      .execute()

    // Histórico de importações vinculadas ao ciclo
    app
      .db()
      .newQuery(`
      DELETE FROM importacoes 
      WHERE ciclo_id IN ${cicloInSql}
    `)
      .execute()

    // NOTA: Os registros dos dois ciclos em 'ciclos' (5vsxd9en2b8pi3e e q34tb0emtengknj)
    // e seus vínculos em 'ciclo_contratos' são PRESERVADOS estritamente conforme solicitado
    // (o usuário quer manter os ciclos 38 abertos e limpar apenas os pedidos).
  },
  (app) => {
    // Reversão de limpeza física de dados de teste não é aplicável
  },
)
