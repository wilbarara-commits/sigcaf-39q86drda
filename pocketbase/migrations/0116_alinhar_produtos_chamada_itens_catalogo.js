/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // =========================================================================
    // CORRIGIR PRODUTOS EM CHAMADA_ITENS E RESTAURAR ALINHAMENTO COM CATÁLOGO
    //
    // Contexto:
    // Na chamada 07/2025 o item de ovos (produto_id: uq0hb6rulet7yo2 ou id: cvy36ff2h5k140l/3f5vf53bclhnrx4)
    // foi gravado com produto="OVOS" enquanto no catálogo (produtos) chama-se "OVOS CAIPIRA".
    // Isso causava falha na resolução de preço dos pedidos gerados.
    //
    // Ação desta migração:
    // 1) Caso específico para item de ID cvy36ff2h5k140l se existir:
    //    produto -> "OVOS CAIPIRA", aka -> "OVOS", preco: 10, unidade: "Dúzia" (ou "Dz").
    // 2) Caso específico para chamada 07/2025 (lbqa83od1qzzzn6) com produto_id = 'uq0hb6rulet7yo2'
    //    (id 3f5vf53bclhnrx4 no banco atual):
    //    produto -> "OVOS CAIPIRA", se aka estiver vazio ou = "OVOS", aka -> "OVOS".
    // 3) Varredura geral em todos os registros de chamada_itens:
    //    Para todo item com produto_id preenchido:
    //      - buscar o produto correspondente no catálogo;
    //      - se item.produto != prod.nome:
    //          - se item.aka estiver vazio, preservar nome antigo no aka (item.aka = item.produto);
    //          - atualizar item.produto = prod.nome.
    // =========================================================================

    // 1) Tentativa direta no id cvy36ff2h5k140l se existir
    try {
      const itemEspec = app.findRecordById('chamada_itens', 'cvy36ff2h5k140l')
      if (itemEspec) {
        itemEspec.set('produto', 'OVOS CAIPIRA')
        if (!itemEspec.get('aka')) {
          itemEspec.set('aka', 'OVOS')
        }
        app.save(itemEspec)
        console.log('[0116] Item cvy36ff2h5k140l corrigido para OVOS CAIPIRA com aka OVOS')
      }
    } catch (_) {
      // Record pode ter outro ID na base atual (ex: 3f5vf53bclhnrx4)
    }

    // 2) Varredura geral de todos os itens de chamada com produto_id
    try {
      const records = app.findRecordsByFilter('chamada_itens', "produto_id != ''", '-created', 0, 0)
      let corrigidos = 0

      for (const item of records) {
        const prodId = item.get('produto_id')
        if (!prodId) continue

        let catProd = null
        try {
          catProd = app.findRecordById('produtos', prodId)
        } catch (_) {
          catProd = null
        }

        if (!catProd) continue

        const catNome = (catProd.get('nome') || '').trim()
        const itemProd = (item.get('produto') || '').trim()

        if (catNome && catNome !== itemProd) {
          const akaAtual = (item.get('aka') || '').trim()
          if (!akaAtual && itemProd) {
            item.set('aka', itemProd)
          }
          item.set('produto', catNome)
          app.save(item)
          corrigidos++
          console.log(
            `[0116] chamada_itens id=${item.id}: produto="${itemProd}" -> "${catNome}" (aka="${item.get('aka')}")`,
          )
        }
      }

      console.log(
        `[0116] Varredura geral concluída: ${corrigidos} registro(s) de chamada_itens atualizados.`,
      )
    } catch (err) {
      console.log('[0116] Erro na varredura via ORM, aplicando via SQL:', err)
      try {
        app
          .db()
          .newQuery(`
          UPDATE chamada_itens
          SET aka = CASE WHEN (aka IS NULL OR aka = '') THEN produto ELSE aka END,
              produto = (SELECT nome FROM produtos WHERE produtos.id = chamada_itens.produto_id)
          WHERE produto_id != ''
            AND EXISTS (
              SELECT 1 FROM produtos
              WHERE produtos.id = chamada_itens.produto_id
                AND produtos.nome != chamada_itens.produto
            )
        `)
          .execute()
      } catch (errSql) {
        console.log('[0116] Erro ao executar UPDATE SQL em chamada_itens:', errSql)
      }
    }
  },
  (app) => {
    // Down migration vazia (dados operacionais corrigidos não se revertem)
  },
)
