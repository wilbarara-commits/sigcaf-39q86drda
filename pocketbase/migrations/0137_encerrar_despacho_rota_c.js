/**
 * Migration 0137: Encerra registros de rota_despachos que ficaram com ativo=true
 * mas cuja rota já possui TODOS os pedidos como 'Entregue' (ou Cancelado), sem nenhum
 * pedido 'Em Rota' ou 'Pendente'.
 *
 * Cobre especificamente o caso da Rota C (id 0ddzhu0dkrxdda2, despacho h7gh3y6zsydovna)
 * e qualquer outra rota análoga. É idempotente.
 */
migrate(
  (app) => {
    try {
      const rotaDespachosAtivos = app.findRecordsByFilter(
        'rota_despachos',
        'ativo = true',
        '-created',
        500,
        0,
      )

      const nowIso = new Date().toISOString()
      let encerrados = 0

      for (const desp of rotaDespachosAtivos) {
        const rotaId = desp.get('rota_id')
        if (!rotaId) continue

        // Buscar todos os pedidos desta rota
        const pedidos = app.findRecordsByFilter(
          'pedidos',
          `rota_id = "${rotaId}"`,
          '-created',
          1000,
          0,
        )

        // Se houver pedidos e nenhum estiver "Em Rota" ou "Pendente", e pelo menos um estiver "Entregue"
        const temEmRotaOuPendente = pedidos.some((p) => {
          const st = p.get('status')
          return st === 'Em Rota' || st === 'Pendente'
        })

        const temEntregues = pedidos.some((p) => p.get('status') === 'Entregue')

        if (pedidos.length > 0 && !temEmRotaOuPendente && temEntregues) {
          desp.set('ativo', false)
          app.save(desp)
          encerrados++

          // Também garantir que registros legados em `despachos` para essa rota não fiquem 'Em Rota'
          try {
            const legados = app.findRecordsByFilter(
              'despachos',
              `rota_id = "${rotaId}" && status = "Em Rota"`,
              '-created',
              50,
              0,
            )
            for (const leg of legados) {
              leg.set('status', 'Entregue')
              leg.set('data_entrega', nowIso)
              app.save(leg)
            }
          } catch (errLeg) {
            console.warn('[0137] Erro ao sincronizar despacho legado:', errLeg)
          }
        }
      }

      console.log(`[0137] Concluída migration: ${encerrados} rota_despachos encerrado(s).`)
    } catch (err) {
      console.warn('[0137] Aviso durante regularização de despachos:', err)
    }
  },
  () => {
    // Sem rollback destrutivo necessário
  },
)
