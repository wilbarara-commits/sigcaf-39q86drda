/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0111_normalizar_status_rota_c.js
    // Normalizar caminhao_posicao_atual=0 e caminhao_escola_id='' para TODAS as rotas
    // que não possuam pedidos com status 'Em Rota' nem despacho com status 'Em Rota'.
    // No SQLite/PocketBase, relation fields podem ter constraint NOT NULL com default '',
    // portanto gravamos string vazia '' em caminhao_escola_id e 0 em caminhao_posicao_atual.
    // Preserva intactos pedidos, escolas, contratos, rotas e paradas.

    // 1. Atualizar via SQL com bind seguro
    app
      .db()
      .newQuery(`
        UPDATE rotas
        SET caminhao_posicao_atual = 0,
            caminhao_escola_id = ''
        WHERE id NOT IN (
          SELECT DISTINCT rota_id FROM pedidos WHERE status = 'Em Rota' AND rota_id IS NOT NULL AND rota_id != ''
          UNION
          SELECT DISTINCT rota_id FROM despachos WHERE status = 'Em Rota' AND rota_id IS NOT NULL AND rota_id != ''
        )
      `)
      .execute()

    // 2. Garantir explicitamente na Rota C (id '0ddzhu0dkrxdda2') caso seu registro tenha caminhao_escola_id setado
    try {
      const rotaC = app.findFirstRecordByData('rotas', 'id', '0ddzhu0dkrxdda2')
      if (rotaC) {
        rotaC.set('caminhao_posicao_atual', 0)
        rotaC.set('caminhao_escola_id', '')
        app.save(rotaC)
      }
    } catch (_) {}

    console.log('[0111] Rotas sem despacho ativo e sem pedidos em rota normalizadas com sucesso.')
  },
  (app) => {
    // Reversão não aplicável para normalização de pino manual
  },
)
