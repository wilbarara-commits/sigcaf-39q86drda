migrate(
  (app) => {
    // =========================================================================
    // MANUTENÇÃO DE DADOS: EXCLUIR PRODUTO DUPLICADO "CHEIRO-VERDES"
    //
    // Contexto:
    // Produto "CHEIRO-VERDES" (id: '801188u61p4p8ew', unidade: 'Molho') foi cadastrado
    // indevidamente. O produto canônico e correto é "CHEIRO-VERDE" (id: 'wa8pha4tqyjz917').
    //
    // Verificações prévias:
    // - Sem vínculos em contrato_itens
    // - Sem vínculos em pedido_itens
    // - Sem vínculos em outras collections
    //
    // Preservar intocado:
    // - Produto "CHEIRO-VERDE" (id: 'wa8pha4tqyjz917')
    // =========================================================================

    const targetProdutoId = '801188u61p4p8ew'

    // 1. Excluir via raw SQL conforme especificação
    app
      .db()
      .newQuery('DELETE FROM produtos WHERE id = {:produtoId}')
      .bind({ produtoId: targetProdutoId })
      .execute()

    // 2. Fallback idempotente defensivo via SDK caso o registro ainda exista
    try {
      const record = app.findFirstRecordByData('produtos', 'id', targetProdutoId)
      if (record) {
        app.delete(record)
      }
    } catch (_) {
      // Já excluído com sucesso
    }
  },
  (app) => {
    // Reversão de exclusão manual não é aplicável
  },
)
