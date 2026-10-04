migrate(
  (app) => {
    // 1. Correção específica da chamada 07/2025 (id: lbqa83od1qzzzn6)
    // Delete os vínculos de contrato_id='eb3a9ekuuf34tk3' cujo escola_id != 'labsqssknlavo1o',
    // APENAS se cada escola já tiver outro vínculo ativo (encerrado_em vazio ou nulo)
    // com contrato da mesma chamada lbqa83od1qzzzn6.
    // Ao excluir, se o espúrio tem rota_id e o vínculo legítimo não tem, copie a rota para o legítimo antes de excluir.

    const chamada07Id = 'lbqa83od1qzzzn6'
    const contrato11Id = 'eb3a9ekuuf34tk3'
    const escolaLegitimaContrato11 = 'labsqssknlavo1o'

    // Buscar todos os contratos da chamada 07
    let contratosChamada07 = []
    try {
      contratosChamada07 = app.findRecordsByFilter(
        'contratos',
        `chamada_id = "${chamada07Id}"`,
        'created',
        100,
        0,
      )
    } catch (err) {
      console.error('Erro ao buscar contratos da chamada 07:', err)
    }

    const contratosIdsChamada07 = contratosChamada07.map((c) => c.id)

    if (contratosIdsChamada07.length > 0) {
      // Buscar vínculos do contrato 11
      let vinculosContrato11 = []
      try {
        vinculosContrato11 = app.findRecordsByFilter(
          'contrato_escolas',
          `contrato_id = "${contrato11Id}"`,
          'created',
          100,
          0,
        )
      } catch (err) {
        console.error('Erro ao buscar vínculos do contrato 11:', err)
      }

      for (const v of vinculosContrato11) {
        const escolaId = v.getString('escola_id')
        if (escolaId === escolaLegitimaContrato11) {
          continue
        }

        // Procurar outro vínculo ativo desta escola em contratos da chamada 07
        let outrosVinculos = []
        try {
          outrosVinculos = app.findRecordsByFilter(
            'contrato_escolas',
            `escola_id = "${escolaId}" && contrato_id != "${contrato11Id}" && (encerrado_em = "" || encerrado_em = null)`,
            'created',
            50,
            0,
          )
        } catch (e) {
          console.error(`Erro ao pesquisar outros vínculos da escola ${escolaId}:`, e)
        }

        // Filtrar apenas os que pertencem a contratos da chamada 07
        const vinculoLegitimo = outrosVinculos.find((ov) =>
          contratosIdsChamada07.includes(ov.getString('contrato_id')),
        )

        if (vinculoLegitimo) {
          const rotaEspurio = v.getString('rota_id')
          const rotaLegitimo = vinculoLegitimo.getString('rota_id')

          if (rotaEspurio && !rotaLegitimo) {
            vinculoLegitimo.set('rota_id', rotaEspurio)
            app.save(vinculoLegitimo)
          }

          try {
            app.delete(v)
          } catch (delErr) {
            console.error(`Erro ao deletar vínculo espúrio ${v.id}:`, delErr)
          }
        }
      }
    }

    // 2. Varredura geral idempotente:
    // Agrupe todos os vínculos ativos (encerrado_em = "" || encerrado_em = null)
    // por (escola_id, chamada_id do contrato);
    // Onde houver mais de um, mantenha o mais antigo (copiando rota_id se faltar) e exclua os demais.

    try {
      // Buscar todos os contratos para mapear id -> chamada_id
      const todosContratos = app.findRecordsByFilter('contratos', 'id != ""', 'created', 1000, 0)
      const contratoChamadaMap = new Map()
      for (const c of todosContratos) {
        contratoChamadaMap.set(c.id, c.getString('chamada_id') || '')
      }

      // Buscar todos os vínculos ativos
      const todosVinculosAtivos = app.findRecordsByFilter(
        'contrato_escolas',
        'encerrado_em = "" || encerrado_em = null',
        'created',
        5000,
        0,
      )

      // Agrupar por chave: `${escola_id}__${chamada_id}`
      const grupos = new Map()
      for (const ce of todosVinculosAtivos) {
        const cId = ce.getString('contrato_id')
        const chamadaId = contratoChamadaMap.get(cId) || ''
        if (!chamadaId) {
          // Se contrato não está associado a nenhuma chamada, pular do agrupamento por chamada
          continue
        }
        const escolaId = ce.getString('escola_id')
        if (!escolaId) continue

        const key = `${escolaId}__${chamadaId}`
        if (!grupos.has(key)) {
          grupos.set(key, [])
        }
        grupos.get(key).push(ce)
      }

      for (const [key, vinculos] of grupos.entries()) {
        if (vinculos.length <= 1) continue

        // Ordenar por created crescente para manter o mais antigo
        vinculos.sort((a, b) => {
          const tA = new Date(a.getString('created') || 0).getTime()
          const tB = new Date(b.getString('created') || 0).getTime()
          return tA - tB
        })

        const primario = vinculos[0]
        let rotaEfetiva = primario.getString('rota_id')

        // Se o primário não tiver rota_id, buscar de algum dos duplicados
        if (!rotaEfetiva) {
          for (let i = 1; i < vinculos.length; i++) {
            const r = vinculos[i].getString('rota_id')
            if (r) {
              rotaEfetiva = r
              primario.set('rota_id', rotaEfetiva)
              app.save(primario)
              break
            }
          }
        }

        // Excluir os vínculos excedentes
        for (let i = 1; i < vinculos.length; i++) {
          try {
            app.delete(vinculos[i])
          } catch (delErr) {
            console.error(
              `Erro ao deletar vínculo duplicado ${vinculos[i].id} do grupo ${key}:`,
              delErr,
            )
          }
        }
      }
    } catch (varreduraErr) {
      console.error('Erro na varredura geral de duplicatas contrato_escolas:', varreduraErr)
    }
  },
  (app) => {
    // Down vazio conforme especificação
  },
)
