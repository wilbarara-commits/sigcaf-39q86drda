/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // TAREFA 2: Retornar a Rota C da chamada 01/2025 para o depósito central
    // Registro na coleção `rotas`: id '0ddzhu0dkrxdda2' (Rota C, chamada 01/2025)
    // Reset de progresso:
    // - Posição do veículo: caminhao_posicao_atual -> 0, caminhao_escola_id -> null (ou string vazia)
    // - Coleção `despachos`: se houver despacho em rota para esta rota, atualizar para 'Cancelado' ou remover
    // - Coleção `pedidos`: qualquer pedido vinculado à Rota C que esteja 'Em Rota' ou com status de execução volta para 'Pendente', zerando entregue_em, entregue_por etc.
    // - NÃO apagar pedidos nem atestos — apenas reset de progresso da execução.

    const rotaId = '0ddzhu0dkrxdda2'

    // 1. Resetar o registro da rota em `rotas`
    try {
      const rota = app.findFirstRecordByData('rotas', 'id', rotaId)
      rota.set('caminhao_posicao_atual', 0)
      rota.set('caminhao_escola_id', '')
      app.save(rota)
      console.log(
        `[0109] Rota ${rotaId} resetada com sucesso para o depósito central (posicao=0, escola=null).`,
      )
    } catch (e) {
      // Fallback via raw SQL caso findFirstRecordByData lance
      app
        .db()
        .newQuery(`
        UPDATE rotas 
        SET caminhao_posicao_atual = 0, caminhao_escola_id = NULL 
        WHERE id = {:rotaId}
      `)
        .bind({ rotaId })
        .execute()
      console.log(`[0109] Rota ${rotaId} atualizada via SQL:`, e)
    }

    // 2. Garantir que eventuais despachos abertos em 'Em Rota' para esta rota sejam cancelados/limpos
    try {
      app
        .db()
        .newQuery(`
        UPDATE despachos 
        SET status = 'Cancelado' 
        WHERE rota_id = {:rotaId} AND status = 'Em Rota'
      `)
        .bind({ rotaId })
        .execute()
    } catch (errDesp) {
      console.log('[0109] Aviso ao atualizar despachos:', errDesp)
    }

    // 3. Voltar pedidos da Rota C com status 'Em Rota' para 'Pendente', limpando timestamps de execução
    try {
      app
        .db()
        .newQuery(`
        UPDATE pedidos 
        SET status = 'Pendente', entregue_em = NULL, entregue_por = NULL 
        WHERE rota_id = {:rotaId} AND status = 'Em Rota'
      `)
        .bind({ rotaId })
        .execute()
    } catch (errPed) {
      console.log('[0109] Aviso ao atualizar pedidos da rota:', errPed)
    }
  },
  (app) => {
    // Reversão não aplicável a reset operacional manual
  },
)
