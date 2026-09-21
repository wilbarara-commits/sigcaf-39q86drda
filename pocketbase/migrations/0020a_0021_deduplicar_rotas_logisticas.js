migrate(
  (app) => {
    // 1. Tratar possíveis registros existentes com nomes duplicados dentro do mesmo contrato em rotas_logisticas
    // Se houver mais de uma rota no mesmo contrato cujo nome (após LOWER e TRIM) coincida:
    // Mantém a mais antiga (ou a que possui paradas_rota ou pedidos vinculados) e renomeia ou exclui com segurança.
    try {
      const records = app.findRecordsByFilter('rotas_logisticas', 'id != ""', 'created', 0, 0)
      const seen = new Map() // key: contratoId + "___" + normalizedNome -> originalRecord

      for (let i = 0; i < records.length; i++) {
        const rec = records[i]
        const cId = rec.getString('contrato_id')
        const rawNome = rec.getString('nome') || ''
        const normNome = rawNome.trim().replace(/\s+/g, ' ').toLowerCase()
        const key = cId + '___' + normNome

        if (!seen.has(key)) {
          // Primeira ocorrência: padroniza o nome sem espaços extras
          const cleanNome = rawNome.trim().replace(/\s+/g, ' ')
          if (cleanNome !== rawNome) {
            rec.set('nome', cleanNome)
            app.save(rec)
          }
          seen.set(key, rec)
        } else {
          // Duplicata encontrada!
          // Verificar se possui paradas_rota ou pedidos vinculados
          const paradasCount = app.countRecords('paradas_rota', 'rota_logistica_id = {:rId}', {
            rId: rec.id,
          })
          let pedidosCount = 0
          try {
            pedidosCount = app.countRecords('pedidos', 'rota_logistica_id = {:rId}', {
              rId: rec.id,
            })
          } catch (_) {}

          if (paradasCount === 0 && pedidosCount === 0) {
            // Abordagem mais segura: sem paradas e sem pedidos vinculados, pode ser removida com segurança
            console.log(
              'Removendo rota logística duplicata sem paradas/pedidos: ' +
                rec.id +
                ' (' +
                rawNome +
                ')',
            )
            app.delete(rec)
          } else {
            // Se tiver paradas ou pedidos, preserva os dados renomeando com sufixo único
            const cleanNome = rawNome.trim().replace(/\s+/g, ' ')
            const novoNome = cleanNome + ' (Cópia ' + rec.id.slice(0, 4) + ')'
            console.log(
              'Renomeando rota logística duplicata com paradas/pedidos: ' +
                rec.id +
                ' -> ' +
                novoNome,
            )
            rec.set('nome', novoNome)
            app.save(rec)
          }
        }
      }
    } catch (err) {
      console.log('Aviso ao deduplicar rotas_logisticas:', err)
    }
  },
  (app) => {
    // Reversão não necessária para limpeza defensiva
  },
)
