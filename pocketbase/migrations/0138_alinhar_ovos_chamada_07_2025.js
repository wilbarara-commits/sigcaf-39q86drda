/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // =========================================================================
    // 0138: Alinhar itens da chamada 07/2025 e contratos vinculados
    //
    // Contexto:
    // Na chamada 07/2025 (PNAE Estadual) o produto "OVOS" foi registrado no
    // cadastro geral de produtos como "OVOS CAIPIRA", enquanto na chamada 07/2025
    // o nome institucional contratado é "OVOS" (e qualquer especificação "OVOS CAIPIRA"
    // funciona internamente como AKA para casar pedidos).
    //
    // Regra do usuário: "no atesto sai aipim... no atesto so aparece ovos.
    // Para o sistema usa nome do produto, para o cliente usa o nome do cliente."
    //
    // Ações:
    // 1) Em chamada_itens para a chamada 07/2025 (lbqa83od1qzzzn6):
    //    Para o item de ovos (produto_id uq0hb6rulet7yo2 ou produto contendo 'OVOS'):
    //    - definir produto = 'OVOS'
    //    - definir aka = 'OVOS CAIPIRA' (para reconhecimento interno de pedidos)
    // 2) Em contrato_itens para os contratos da chamada 07/2025 (ex: C-2026-02-01 até C-2026-02-11):
    //    - sincronizar o nome_contrato do item de ovos para 'OVOS'
    // 3) Se existirem itens em contrato_itens cujo nome_contrato contenha vírgula
    //    (ex: 'NOME, AKA'), a própria aplicação já isola a parte antes da primeira
    //    vírgula, garantindo idempotência total.
    // =========================================================================

    try {
      // 1. Identificar chamada 07/2025
      let chamada07Id = 'lbqa83od1qzzzn6'
      try {
        const ch = app.findFirstRecordByData('chamadas', 'chamada', '07/2025')
        if (ch) {
          chamada07Id = ch.id
        }
      } catch (_) {
        // Fallback para ID conhecido
      }

      // 2. Atualizar chamada_itens da chamada 07/2025
      try {
        const chItens = app.findRecordsByFilter(
          'chamada_itens',
          `chamada_id = '${chamada07Id}'`,
          '-created',
          0,
          0,
        )

        for (const item of chItens) {
          const nomeProd = (item.get('produto') || '').trim().toUpperCase()
          const pid = (item.get('produto_id') || '').trim()

          if (
            pid === 'uq0hb6rulet7yo2' ||
            nomeProd === 'OVOS CAIPIRA' ||
            nomeProd.startsWith('OVOS')
          ) {
            item.set('produto', 'OVOS')
            const currentAka = (item.get('aka') || '').trim()
            if (!currentAka || currentAka === 'OVOS') {
              item.set('aka', 'OVOS CAIPIRA')
            }
            app.save(item)
            console.log(
              `[0138] chamada_itens id=${item.id} atualizado: produto='OVOS', aka='${item.get('aka')}'`,
            )
          }
        }
      } catch (errCh) {
        console.log('[0138] Aviso ao atualizar chamada_itens via ORM:', errCh)
      }

      // Fallback SQL para chamada_itens da 07/2025
      try {
        app
          .db()
          .newQuery(`
            UPDATE chamada_itens
            SET produto = 'OVOS',
                aka = CASE WHEN (aka IS NULL OR aka = '' OR aka = 'OVOS') THEN 'OVOS CAIPIRA' ELSE aka END
            WHERE (chamada_id = {:chId} OR chamada_id = 'lbqa83od1qzzzn6')
              AND (produto_id = 'uq0hb6rulet7yo2' OR UPPER(produto) LIKE 'OVOS%')
          `)
          .bind({ chId: chamada07Id })
          .execute()
      } catch (errSql) {
        console.log('[0138] Aviso ao executar UPDATE SQL em chamada_itens:', errSql)
      }

      // 3. Atualizar contrato_itens dos contratos vinculados à chamada 07/2025
      try {
        const contratos07 = app.findRecordsByFilter(
          'contratos',
          `chamada_id = '${chamada07Id}' || numero_chamada = '07/2025'`,
          'created',
          0,
          0,
        )

        for (const contrato of contratos07) {
          const cItens = app.findRecordsByFilter(
            'contrato_itens',
            `contrato_id = '${contrato.id}'`,
            'created',
            0,
            0,
          )

          for (const ci of cItens) {
            const pid = (ci.get('produto_id') || '').trim()
            const nomeContrato = (ci.get('nome_contrato') || '').trim().toUpperCase()

            if (
              pid === 'uq0hb6rulet7yo2' ||
              nomeContrato === 'OVOS CAIPIRA' ||
              nomeContrato.startsWith('OVOS,') ||
              nomeContrato.startsWith('OVOS CAIPIRAS')
            ) {
              ci.set('nome_contrato', 'OVOS')
              app.save(ci)
              console.log(`[0138] contrato_itens id=${ci.id} atualizado: nome_contrato='OVOS'`)
            }
          }
        }
      } catch (errCi) {
        console.log('[0138] Aviso ao atualizar contrato_itens via ORM:', errCi)
      }

      // Fallback SQL para contrato_itens
      try {
        app
          .db()
          .newQuery(`
            UPDATE contrato_itens
            SET nome_contrato = 'OVOS'
            WHERE (produto_id = 'uq0hb6rulet7yo2' OR UPPER(nome_contrato) = 'OVOS CAIPIRA' OR UPPER(nome_contrato) = 'OVOS CAIPIRAS' OR UPPER(nome_contrato) LIKE 'OVOS,%')
              AND contrato_id IN (
                SELECT id FROM contratos
                WHERE chamada_id = {:chId} OR numero_chamada = '07/2025'
              )
          `)
          .bind({ chId: chamada07Id })
          .execute()
      } catch (errCiSql) {
        console.log('[0138] Aviso ao executar UPDATE SQL em contrato_itens:', errCiSql)
      }
    } catch (globalErr) {
      console.log('[0138] Erro geral na migração 0138:', globalErr)
      throw globalErr
    }
  },
  (app) => {
    // Down migration não-destrutiva
  },
)
